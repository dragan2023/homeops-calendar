import type { DatabaseSync } from "node:sqlite";
import { newId, nowIso, todayIso } from "@homeops/db";
import { hashPassword } from "./auth.ts";

const DEFAULT_LOCATIONS = [
  { name: "冰箱", kind: "cold", sort: 10 },
  { name: "冷冻室", kind: "cold", sort: 20 },
  { name: "储物柜", kind: "dry", sort: 30 },
  { name: "药箱", kind: "medicine", sort: 40 },
  { name: "阳台", kind: "other", sort: 50 },
];

const DEFAULT_CATEGORIES = ["蔬菜", "水果", "乳品", "蛋类", "肉类", "主食", "日化", "耗材", "药品"];

const DEFAULT_TEMPLATES = [
  { title: "清理冰箱过期区", cycle: "FREQ=WEEKLY;BYDAY=SU", days: 6 },
  { title: "检查药箱有效期", cycle: "FREQ=MONTHLY;BYMONTHDAY=1", days: 10 },
];

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 首次初始化：建家庭 + 管理员 + 默认地点/分类/周期家务模板。已有用户则拒绝（防覆盖）。 */
export function bootstrapHome(
  db: DatabaseSync,
  input: { homeName: string; username: string; password: string; timezone: string; defaultCurrency: string },
) {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (Number(existing.n) > 0) return { ok: false as const, reason: "already_initialized" as const };

  const now = nowIso();
  const homeId = newId();
  const userId = newId();
  const { hash, salt } = hashPassword(input.password);
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO homes (id, name, icon, timezone, default_currency, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
    ).run(homeId, input.homeName, "home", input.timezone, input.defaultCurrency, now);
    db.prepare(
      "INSERT INTO users (id, username, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)",
    ).run(userId, input.username, hash, salt, now);
    for (const loc of DEFAULT_LOCATIONS) {
      db.prepare(
        "INSERT INTO locations (id, home_id, parent_id, name, kind, sort_order, active, created_at) VALUES (?, ?, NULL, ?, ?, ?, 1, ?)",
      ).run(newId(), homeId, loc.name, loc.kind, loc.sort, now);
    }
    DEFAULT_CATEGORIES.forEach((name, i) => {
      db.prepare(
        "INSERT INTO item_categories (id, home_id, parent_id, name, is_system, sort_order, active) VALUES (?, ?, NULL, ?, 1, ?, 1)",
      ).run(newId(), homeId, name, (i + 1) * 10);
    });
    for (const t of DEFAULT_TEMPLATES) {
      db.prepare(
        "INSERT INTO task_templates (id, home_id, title, note, cycle_rule, next_due_date, active, created_at) VALUES (?, ?, ?, NULL, ?, ?, 1, ?)",
      ).run(newId(), homeId, t.title, t.cycle, addDays(todayIso(), t.days), now);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { ok: true as const, homeId, userId };
}
