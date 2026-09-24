import type { DatabaseSync } from "node:sqlite";
import { newId, nowIso } from "@homeops/db";

export type TaskKind = "chore" | "linked" | "expiry" | "purchase";

const DAY = 86400000;
export function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const WEEKDAY = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 } as Record<string, number>;

/** 极简周期规则：FREQ=DAILY[;INTERVAL=n] / FREQ=WEEKLY;BYDAY=SU，MO / FREQ=MONTHLY;BYMONTHDAY=n */
export function nextDueDate(rule: string, fromIso: string): string {
  const parts: Record<string, string> = {};
  rule.split(";").forEach((kv) => { const [k, v] = kv.split("="); if (k) parts[k.toUpperCase()] = v ?? ""; });
  const freq = (parts.FREQ ?? "WEEKLY").toUpperCase();
  if (freq === "DAILY") return addDays(fromIso, Number(parts.INTERVAL ?? 1) || 1);
  if (freq === "WEEKLY") {
    const wanted = (parts.BYDAY ?? "SU").split(",").map((d) => WEEKDAY[d.trim().toUpperCase()] ?? 6);
    const cur = new Date(fromIso + "T00:00:00Z");
    for (let i = 1; i <= 14; i++) {
      const d = new Date(cur.getTime() + i * DAY);
      if (wanted.includes((d.getUTCDay() + 6) % 7)) return d.toISOString().slice(0, 10);
    }
    return addDays(fromIso, 7);
  }
  if (freq === "MONTHLY") {
    const day = Number(parts.BYMONTHDAY ?? 1) || 1;
    const cur = new Date(fromIso + "T00:00:00Z");
    const next = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, day));
    return next.toISOString().slice(0, 10);
  }
  return addDays(fromIso, 7);
}

function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const out = fn(); db.exec("COMMIT"); return out; } catch (err) { db.exec("ROLLBACK"); throw err; }
}

function findTask(db: DatabaseSync, homeId: string, kind: string, sourceType: string, sourceId: string, dueDate: string | null) {
  return db
    .prepare(
      "SELECT id, done FROM tasks WHERE home_id = ? AND kind = ? AND IFNULL(source_type,'') = ? " +
        "AND IFNULL(source_id,'') = ? AND IFNULL(due_date,'') = IFNULL(?,'')",
    )
    .get(homeId, kind, sourceType, sourceId, dueDate) as { id: string; done: number } | undefined;
}

type UpsertResult = "created" | "reopened" | "exists";
function upsertTask(
  db: DatabaseSync,
  homeId: string,
  spec: { kind: TaskKind; title: string; note?: string | null; sourceType: string; sourceId: string; dueDate: string | null; itemId?: string | null; templateId?: string | null; priority?: number },
): UpsertResult {
  const now = nowIso();
  const existing = findTask(db, homeId, spec.kind, spec.sourceType, spec.sourceId, spec.dueDate);
  if (!existing) {
    db.prepare(
      "INSERT INTO tasks (id, home_id, title, note, kind, source_type, source_id, template_id, item_id, location_id, due_date, remind_at, priority, done, done_at, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, 0, NULL, ?)",
    ).run(newId(), homeId, spec.title, spec.note ?? null, spec.kind, spec.sourceType, spec.sourceId,
      spec.templateId ?? null, spec.itemId ?? null, spec.dueDate, spec.priority ?? 0, now);
    return "created";
  }
  if (Number(existing.done) === 1) {
    db.prepare("UPDATE tasks SET done = 0, done_at = NULL, note = ?, title = ? WHERE id = ?")
      .run(spec.note ?? null, spec.title, existing.id);
    return "reopened";
  }
  return "exists";
}

export type SyncResult = { created: string[]; reopened: string[]; closed: string[]; templatesAdvanced: number };

/**
 * 对账式生成待办：随时调用都安全（幂等）。
 * 规则：
 *  1) 周期家务模板 → 展开到今天起 horizonDays 内的每一次 occurrence（按 due_date 区分，天然可重复）；
 *  2) 临期 → 每个"还有货且在预警窗内"的批次一条「处理掉」待办；
 *  3) 缺货 → 每个低于补货点的物品一条「买」待办；耗材类再补一条「换」待办（计划书 5.1：买 + 换两条）；
 *  4) 来源消失（补货了 / 批次清空）→ 自动关闭该来源的未完成待办，并写明原因。
 */
export function syncTasks(db: DatabaseSync, homeId: string, today: string, horizonDays = 14): SyncResult {
  return tx(db, () => {
    const created: string[] = [];
    const reopened: string[] = [];
    const closed: string[] = [];
    let templatesAdvanced = 0;

    // 1) 周期家务
    const templates = db
      .prepare("SELECT id, title, cycle_rule, next_due_date FROM task_templates WHERE home_id = ? AND active = 1")
      .all(homeId) as Array<{ id: string; title: string; cycle_rule: string; next_due_date: string }>;
    for (const tpl of templates) {
      let due = tpl.next_due_date;
      let guard = 0;
      while (due <= addDays(today, horizonDays) && guard++ < 32) {
        const r = upsertTask(db, homeId, {
          kind: "chore", title: tpl.title, note: "周期家务 · " + tpl.cycle_rule,
          sourceType: "template", sourceId: tpl.id, dueDate: due, templateId: tpl.id,
        });
        if (r === "created") created.push(tpl.title + " @" + due);
        if (r === "reopened") reopened.push(tpl.title + " @" + due);
        due = nextDueDate(tpl.cycle_rule, due);
      }
      if (due !== tpl.next_due_date) {
        db.prepare("UPDATE task_templates SET next_due_date = ? WHERE id = ?").run(due, tpl.id);
        templatesAdvanced++;
      }
    }

    // 2) 临期
    const expiring = db
      .prepare(
        "SELECT b.id AS batch_id, b.expiry_date, b.quantity, i.id AS item_id, i.name, i.base_unit, i.consumption_type " +
          "FROM stock_batches b JOIN items i ON i.id = b.item_id " +
          "WHERE b.home_id = ? AND i.active = 1 AND b.quantity > 0 AND b.expiry_date IS NOT NULL " +
          "AND b.expiry_date <= date(?, '+' || i.expiry_warn_days || ' day')",
      )
      .all(homeId, today) as Array<{ batch_id: string; expiry_date: string; quantity: number; item_id: string; name: string; base_unit: string; consumption_type: string }>;
    const activeExpiry = new Set<string>();
    for (const b of expiring) {
      activeExpiry.add(b.batch_id);
      const verb = b.consumption_type === "medicine" ? "用掉" : "吃掉/用掉";
      const r = upsertTask(db, homeId, {
        kind: "expiry", title: verb + " " + b.name + "（" + b.expiry_date.slice(5) + " 到期）",
        note: "临期自动生成 · 剩 " + b.quantity + " " + b.base_unit,
        sourceType: "batch", sourceId: b.batch_id, dueDate: b.expiry_date, itemId: b.item_id, priority: 2,
      });
      if (r === "created") created.push("expiry:" + b.name);
      if (r === "reopened") reopened.push("expiry:" + b.name);
    }

    // 3) 缺货（买 + 换）
    const low = db
      .prepare(
        "SELECT i.id AS item_id, i.name, i.base_unit, i.reorder_point, i.reorder_quantity, i.consumption_type, IFNULL(c.name,'') AS category_name " +
          "FROM items i LEFT JOIN item_categories c ON c.id = i.category_id " +
          "WHERE i.home_id = ? AND i.active = 1 AND i.reorder_point > 0 " +
          "AND IFNULL((SELECT SUM(quantity) FROM stock_batches b WHERE b.item_id = i.id AND b.home_id = i.home_id), 0) <= i.reorder_point",
      )
      .all(homeId) as Array<{ item_id: string; name: string; base_unit: string; reorder_point: number; reorder_quantity: number; consumption_type: string; category_name: string }>;
    const activeLinked = new Set<string>();
    for (const it of low) {
      activeLinked.add("item|" + it.item_id);
      const buyQty = it.reorder_quantity > 0 ? it.reorder_quantity : 1;
      const r = upsertTask(db, homeId, {
        kind: "linked", title: "买 " + it.name + " " + buyQty + " " + it.base_unit,
        note: "库存联动 · 现有已到补货点（" + it.reorder_point + "）",
        sourceType: "item", sourceId: it.item_id, dueDate: null, itemId: it.item_id, priority: 1,
      });
      if (r === "created") created.push("buy:" + it.name);
      if (r === "reopened") reopened.push("buy:" + it.name);
      const isReplaceable = it.category_name.includes("耗材") || it.name.includes("滤芯") || it.name.includes("电池");
      if (isReplaceable) {
        activeLinked.add("replace|" + it.item_id);
        const r2 = upsertTask(db, homeId, {
          kind: "linked", title: "换 " + it.name,
          note: "库存联动 · 买回来之后换上",
          sourceType: "item_replace", sourceId: it.item_id, dueDate: null, itemId: it.item_id, priority: 1,
        });
        if (r2 === "created") created.push("replace:" + it.name);
        if (r2 === "reopened") reopened.push("replace:" + it.name);
      }
    }

    // 4) 来源消失 → 自动关闭
    const openAuto = db
      .prepare("SELECT id, kind, title, source_type, source_id, due_date FROM tasks WHERE home_id = ? AND done = 0 AND kind IN ('expiry','linked')")
      .all(homeId) as Array<{ id: string; kind: string; title: string; source_type: string; source_id: string; due_date: string | null }>;
    const now = nowIso();
    for (const t of openAuto) {
      const srcKey = t.kind === "expiry" ? t.source_id : (t.source_type === "item_replace" ? "replace|" + t.source_id : "item|" + t.source_id);
      const active = t.kind === "expiry" ? activeExpiry.has(t.source_id) : activeLinked.has(srcKey);
      if (!active) {
        const why = t.kind === "expiry" ? "批次已清空，自动完成" : "库存已补足，自动完成";
        db.prepare("UPDATE tasks SET done = 1, done_at = ?, note = ? WHERE id = ?").run(now, why, t.id);
        closed.push(t.title + "（" + why + "）");
      }
    }

    return { created, reopened, closed, templatesAdvanced };
  });
}

export function listTasks(db: DatabaseSync, homeId: string, opts: { from?: string; to?: string; includeDone?: boolean; kind?: string } = {}) {
  const where: string[] = ["home_id = ?"];
  const args: unknown[] = [homeId];
  if (!opts.includeDone) where.push("done = 0");
  if (opts.from) { where.push("IFNULL(due_date, '0000-00-00') >= ?"); args.push(opts.from); }
  if (opts.to) { where.push("IFNULL(due_date, '9999-99-99') <= ?"); args.push(opts.to); }
  if (opts.kind) { where.push("kind = ?"); args.push(opts.kind); }
  return db
    .prepare("SELECT id, title, note, kind, source_type, source_id, due_date, priority, done, done_at, item_id FROM tasks WHERE " + where.join(" AND ") +
      " ORDER BY done ASC, IFNULL(due_date,'9999-99-99') ASC, priority DESC, created_at ASC")
    .all(...(args as never[]));
}

export type CalendarEvent = { date: string; type: "expiry" | "buy" | "chore" | "care"; title: string; refId: string; meta?: Record<string, unknown> };

/** 一张家庭运营日历：临期 / 采购 / 家务 / 用药四类事件按日期聚合 */
export function calendarEvents(db: DatabaseSync, homeId: string, from: string, to: string, today?: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const batches = db
    .prepare(
      "SELECT b.id, b.expiry_date, b.quantity, i.id AS item_id, i.name, i.base_unit, i.consumption_type, l.name AS location_name " +
        "FROM stock_batches b JOIN items i ON i.id = b.item_id LEFT JOIN locations l ON l.id = b.location_id " +
        "WHERE b.home_id = ? AND b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date BETWEEN ? AND ?",
    )
    .all(homeId, from, to) as Array<{ id: string; expiry_date: string; quantity: number; item_id: string; name: string; base_unit: string; consumption_type: string; location_name: string | null }>;
  for (const b of batches) {
    events.push({
      date: b.expiry_date,
      type: b.consumption_type === "medicine" ? "care" : "expiry",
      title: b.name + " 到期（剩 " + b.quantity + " " + b.base_unit + "）",
      refId: b.id,
      meta: { itemId: b.item_id, location: b.location_name },
    });
  }
  const chores = db
    .prepare("SELECT id, title, due_date, done FROM tasks WHERE home_id = ? AND kind = 'chore' AND due_date BETWEEN ? AND ?")
    .all(homeId, from, to) as Array<{ id: string; title: string; due_date: string; done: number }>;
  for (const c of chores) events.push({ date: c.due_date, type: "chore", title: c.title, refId: c.id, meta: { done: !!c.done } });
  const buys = db
    .prepare("SELECT id, name, quantity, unit, planned_date, completed FROM shopping_list WHERE home_id = ? AND completed = 0 AND planned_date BETWEEN ? AND ?")
    .all(homeId, from, to) as Array<{ id: string; name: string; quantity: number; unit: string | null; planned_date: string; completed: number }>;
  for (const s of buys) events.push({ date: s.planned_date, type: "buy", title: "买 " + s.name + " " + s.quantity + " " + (s.unit ?? ""), refId: s.id });
  // 缺货物品直接落到"今天"的采购事件上（还没进购物清单的），避免"日历上看不到该买什么"
  const todayDate = today ?? from;
  if (todayDate >= from && todayDate <= to) {
    const suggestions = db
      .prepare(
        "SELECT i.id AS item_id, i.name, i.base_unit, i.reorder_point, i.reorder_quantity " +
          "FROM items i WHERE i.home_id = ? AND i.active = 1 AND i.reorder_point > 0 " +
          "AND IFNULL((SELECT SUM(quantity) FROM stock_batches b WHERE b.item_id = i.id AND b.home_id = i.home_id), 0) <= i.reorder_point " +
          "AND NOT EXISTS (SELECT 1 FROM shopping_list s WHERE s.home_id = i.home_id AND s.item_id = i.id AND s.completed = 0)",
      )
      .all(homeId) as Array<{ item_id: string; name: string; base_unit: string; reorder_point: number; reorder_quantity: number }>;
    for (const it of suggestions) {
      events.push({
        date: todayDate, type: "buy",
        title: "该买 " + it.name + " " + (it.reorder_quantity > 0 ? it.reorder_quantity : 1) + " " + it.base_unit,
        refId: it.item_id, meta: { suggested: true, reorderPoint: it.reorder_point },
      });
    }
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type < b.type ? -1 : 1));
}

export function todaySummary(db: DatabaseSync, homeId: string, today: string, horizon = 7) {
  const expiring = db
    .prepare(
      "SELECT b.id AS batch_id, b.expiry_date, b.quantity, i.id AS item_id, i.name, i.base_unit, l.name AS location_name " +
        "FROM stock_batches b JOIN items i ON i.id = b.item_id LEFT JOIN locations l ON l.id = b.location_id " +
        "WHERE b.home_id = ? AND b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <= date(?, '+' || ? || ' day') " +
        "ORDER BY b.expiry_date ASC",
    )
    .all(homeId, today, String(horizon));
  const low = db
    .prepare(
      "SELECT i.id AS item_id, i.name, i.base_unit, i.reorder_point, i.reorder_quantity, IFNULL(SUM(b.quantity),0) AS quantity " +
        "FROM items i LEFT JOIN stock_batches b ON b.item_id = i.id AND b.home_id = i.home_id " +
        "WHERE i.home_id = ? AND i.active = 1 AND i.reorder_point > 0 GROUP BY i.id " +
        "HAVING IFNULL(SUM(b.quantity), 0) <= i.reorder_point ORDER BY i.name",
    )
    .all(homeId);
  // 今日视图要包含"没有截止日"的积压待办（它们才是"今天该做"），所以不能用范围查询（范围查询会排掉 NULL）
  const tasks = db
    .prepare(
      "SELECT id, title, note, kind, source_type, source_id, due_date, priority, done, done_at, item_id FROM tasks " +
        "WHERE home_id = ? AND done = 0 AND (due_date IS NULL OR due_date <= ?) " +
        "ORDER BY (due_date IS NULL), due_date ASC, priority DESC, created_at ASC",
    )
    .all(homeId, today) as Array<Record<string, unknown>>;
  const shopping = db
    .prepare("SELECT id, name, quantity, unit, planned_date, source FROM shopping_list WHERE home_id = ? AND completed = 0 ORDER BY IFNULL(planned_date,'9999'), created_at")
    .all(homeId);
  return {
    date: today,
    expiring,
    lowStock: low,
    tasks,
    events: calendarEvents(db, homeId, today, today),
    shoppingPending: shopping,
    counts: { expiring: expiring.length, lowStock: low.length, tasks: tasks.length, shopping: shopping.length },
  };
}
