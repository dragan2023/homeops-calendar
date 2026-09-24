import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { newId, nowIso, todayIso } from "@homeops/db";
import * as stock from "./stock.ts";
import { addDays, calendarEvents, listTasks, syncTasks, todaySummary } from "./tasks.ts";
import { listShopping, receiveShopping, suggestionsToShopping } from "./routes/shopping.ts";
import type { AuthedRequest } from "./routes/auth.ts";

export const PROTOCOL_VERSION = "2025-06-18";
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idem = { idempotencyKey: z.string().min(8).max(120).describe("幂等键：同样的 key 重放不会重复记账") };

type ToolCtx = { db: DatabaseSync; homeId: string; userId: string; today: string };
type ToolDef = { name: string; description: string; schema: z.ZodTypeAny; handler: (ctx: ToolCtx, input: any) => unknown };

const json = (o: unknown) => o as Record<string, unknown>;

export const TOOLS: ToolDef[] = [
  {
    name: "get_home_overview",
    description: "家庭总览：先做一次待办对账，再返回临期、缺货、今日待办、今日日历事件与购物清单。问\"家里现在什么情况\"就用它。",
    schema: z.object({}),
    handler: (ctx) => {
      const sync = syncTasks(ctx.db, ctx.homeId, ctx.today);
      return { ...todaySummary(ctx.db, ctx.homeId, ctx.today), sync };
    },
  },
  {
    name: "get_today",
    description: "今日视图（同 get_home_overview，但返回内容更聚焦今天要做什么）。",
    schema: z.object({}),
    handler: (ctx) => todaySummary(ctx.db, ctx.homeId, ctx.today),
  },
  {
    name: "get_calendar",
    description: "一张家庭运营日历：四类事件（临期 expiry / 采购 buy / 家务 chore / 用药 care）。",
    schema: z.object({ from: dateStr.optional(), to: dateStr.optional() }),
    handler: (ctx, i) => {
      const from = i.from ?? ctx.today;
      const to = i.to ?? addDays(from, 30);
      return { from, to, events: calendarEvents(ctx.db, ctx.homeId, from, to, ctx.today) };
    },
  },
  {
    name: "search_items",
    description: "按名称/条码搜物品，返回库存总量与最近到期日。",
    schema: z.object({ q: z.string().min(1).max(60) }),
    handler: (ctx, i) =>
      ctx.db
        .prepare(
          "SELECT i.id, i.name, i.base_unit, i.reorder_point, c.name AS category_name, " +
            "IFNULL((SELECT SUM(quantity) FROM stock_batches b WHERE b.item_id = i.id AND b.home_id = i.home_id),0) AS quantity, " +
            "(SELECT MIN(expiry_date) FROM stock_batches b WHERE b.item_id = i.id AND b.home_id = i.home_id AND b.quantity > 0) AS first_expiry " +
            "FROM items i LEFT JOIN item_categories c ON c.id = i.category_id WHERE i.home_id = ? AND i.active = 1 AND (i.name LIKE ? OR i.barcode LIKE ?) ORDER BY i.name",
        )
        .all(ctx.homeId, "%" + i.q + "%", "%" + i.q + "%"),
  },
  {
    name: "list_items",
    description: "列出全部在管物品及其库存总量（可按地点过滤）。",
    schema: z.object({ locationId: z.string().optional(), locationName: z.string().max(40).optional() }),
    handler: (ctx, i) => {
      const locId = i.locationId ?? (i.locationName ? stock.resolveLocation(ctx.db, ctx.homeId, null, i.locationName) : undefined);
      return stock.levels(ctx.db, ctx.homeId, locId ? { locationId: locId } : {});
    },
  },
  {
    name: "get_item",
    description: "物品详情：批次（FEFO 顺序）与最近 50 条流水。",
    schema: z.object({ itemId: z.string() }),
    handler: (ctx, i) => ({
      item: ctx.db.prepare("SELECT * FROM items WHERE id = ? AND home_id = ?").get(i.itemId, ctx.homeId),
      batches: ctx.db.prepare(
        "SELECT b.id, b.batch_no, b.quantity, b.expiry_date, b.location_id, l.name AS location_name FROM stock_batches b " +
          "LEFT JOIN locations l ON l.id = b.location_id WHERE b.home_id = ? AND b.item_id = ? AND b.quantity > 0 " +
          "ORDER BY (b.expiry_date IS NULL), b.expiry_date, b.received_at",
      ).all(ctx.homeId, i.itemId),
      transactions: ctx.db.prepare(
        "SELECT id, type, quantity, batch_id, location_id, to_location_id, reason, occurred_at FROM stock_transactions " +
          "WHERE home_id = ? AND item_id = ? ORDER BY occurred_at DESC, rowid DESC LIMIT 50",
      ).all(ctx.homeId, i.itemId),
    }),
  },
  {
    name: "list_batches",
    description: "列出批次（可按物品过滤，或只看 N 天内到期的）。",
    schema: z.object({ itemId: z.string().optional(), expiringInDays: z.number().int().min(0).max(365).optional() }),
    handler: (ctx, i) => {
      const where = ["b.home_id = ?", "b.quantity > 0"];
      const args: unknown[] = [ctx.homeId];
      if (i.itemId) { where.push("b.item_id = ?"); args.push(i.itemId); }
      if (i.expiringInDays !== undefined) { where.push("b.expiry_date IS NOT NULL AND b.expiry_date <= ?"); args.push(addDays(ctx.today, i.expiringInDays)); }
      return ctx.db.prepare(
        "SELECT b.id, b.item_id, i.name, b.quantity, i.base_unit, b.expiry_date, l.name AS location_name, b.batch_no " +
          "FROM stock_batches b JOIN items i ON i.id = b.item_id LEFT JOIN locations l ON l.id = b.location_id " +
          "WHERE " + where.join(" AND ") + " ORDER BY (b.expiry_date IS NULL), b.expiry_date",
      ).all(...(args as never[]));
    },
  },
  {
    name: "expiring_soon",
    description: "临期预警：N 天内到期的批次（默认 7 天）。",
    schema: z.object({ days: z.number().int().min(0).max(365).default(7) }),
    handler: (ctx, i) => stock.expiringSoon(ctx.db, ctx.homeId, i.days, ctx.today),
  },
  {
    name: "low_stock",
    description: "缺货/补货建议：低于补货点的物品。",
    schema: z.object({}),
    handler: (ctx) => stock.lowStock(ctx.db, ctx.homeId),
  },
  {
    name: "list_locations",
    description: "地点树（冰箱/冷冻室/储物柜/药箱…）。",
    schema: z.object({}),
    handler: (ctx) => ctx.db.prepare("SELECT id, parent_id, name, kind, sort_order FROM locations WHERE home_id = ? ORDER BY sort_order, name").all(ctx.homeId),
  },
  {
    name: "create_location",
    description: "新建地点。",
    schema: z.object({ name: z.string().min(1).max(40), parentId: z.string().nullable().optional(), kind: z.string().max(20).default("storage") }),
    handler: (ctx, i) => {
      const id = newId();
      ctx.db.prepare("INSERT INTO locations (id, home_id, parent_id, name, kind, sort_order, active, created_at) VALUES (?, ?, ?, ?, ?, 999, 1, ?)")
        .run(id, ctx.homeId, i.parentId ?? null, i.name, i.kind, nowIso());
      return { id, name: i.name };
    },
  },
  {
    name: "list_categories",
    description: "物品分类列表。",
    schema: z.object({}),
    handler: (ctx) => ctx.db.prepare("SELECT id, parent_id, name, icon, sort_order FROM item_categories WHERE home_id = ? ORDER BY sort_order, name").all(ctx.homeId),
  },
  {
    name: "create_category",
    description: "新建分类。",
    schema: z.object({ name: z.string().min(1).max(40), parentId: z.string().nullable().optional(), icon: z.string().max(40).nullable().optional() }),
    handler: (ctx, i) => {
      const id = newId();
      ctx.db.prepare("INSERT INTO item_categories (id, home_id, parent_id, name, icon, is_system, sort_order, active) VALUES (?, ?, ?, ?, ?, 0, 999, 1)")
        .run(id, ctx.homeId, i.parentId ?? null, i.name, i.icon ?? null);
      return { id, name: i.name };
    },
  },
  {
    name: "create_item",
    description: "新建物品（名称/单位/分类/补货点/默认地点）。建完还要 record_receipt 才有库存。",
    schema: z.object({
      name: z.string().min(1).max(80),
      baseUnit: z.string().max(8).default("个"),
      categoryName: z.string().max(40).optional(),
      barcode: z.string().max(64).nullable().optional(),
      reorderPoint: z.number().min(0).default(0),
      reorderQuantity: z.number().min(0).default(1),
      consumptionType: z.enum(["consumable", "durable", "medicine"]).default("consumable"),
      defaultLocationName: z.string().max(40).optional(),
      expiryWarnDays: z.number().int().min(0).max(365).default(7),
      note: z.string().max(300).nullable().optional(),
    }),
    handler: (ctx, i) => {
      const cat = i.categoryName
        ? (ctx.db.prepare("SELECT id FROM item_categories WHERE home_id = ? AND name = ?").get(ctx.homeId, i.categoryName) as { id: string } | undefined)?.id ?? null
        : null;
      const loc = i.defaultLocationName ? stock.resolveLocation(ctx.db, ctx.homeId, null, i.defaultLocationName) : null;
      const n = ctx.db.prepare("SELECT COUNT(*) AS n FROM items WHERE home_id = ?").get(ctx.homeId) as { n: number };
      const id = newId();
      ctx.db.prepare(
        "INSERT INTO items (id, home_id, sku, barcode, name, category_id, base_unit, icon, consumption_type, reorder_point, reorder_quantity, " +
          "default_location_id, expiry_warn_days, note, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1, ?)",
      ).run(id, ctx.homeId, "SKU-" + String(Number(n.n) + 1).padStart(5, "0"), i.barcode ?? null, i.name, cat, i.baseUnit,
        i.consumptionType, i.reorderPoint, i.reorderQuantity, loc, i.expiryWarnDays, i.note ?? null, nowIso());
      return { id, name: i.name };
    },
  },
  {
    name: "update_item",
    description: "改物品属性（改名/单位/补货点/预警天数等，只改传了的字段）。",
    schema: z.object({
      itemId: z.string(),
      name: z.string().min(1).max(80).optional(),
      baseUnit: z.string().max(8).optional(),
      reorderPoint: z.number().min(0).optional(),
      reorderQuantity: z.number().min(0).optional(),
      expiryWarnDays: z.number().int().min(0).max(365).optional(),
      barcode: z.string().max(64).optional(),
      note: z.string().max(300).optional(),
    }),
    handler: (ctx, i) => {
      const info = ctx.db.prepare(
        "UPDATE items SET name = IFNULL(?, name), base_unit = IFNULL(?, base_unit), reorder_point = IFNULL(?, reorder_point), " +
          "reorder_quantity = IFNULL(?, reorder_quantity), expiry_warn_days = IFNULL(?, expiry_warn_days), barcode = IFNULL(?, barcode), " +
          "note = IFNULL(?, note) WHERE id = ? AND home_id = ?",
      ).run(i.name ?? null, i.baseUnit ?? null, i.reorderPoint ?? null, i.reorderQuantity ?? null, i.expiryWarnDays ?? null,
        i.barcode ?? null, i.note ?? null, i.itemId, ctx.homeId);
      return { changed: Number(info.changes) };
    },
  },
  {
    name: "delete_item",
    description: "删除物品（软删除，历史流水保留）。危险操作，需要用户明确同意。",
    schema: z.object({ itemId: z.string() }),
    handler: (ctx, i) => {
      const row = ctx.db.prepare("SELECT name FROM items WHERE id = ? AND home_id = ?").get(i.itemId, ctx.homeId) as { name: string } | undefined;
      if (!row) throw new Error("item_not_found");
      ctx.db.prepare("UPDATE items SET active = 0 WHERE id = ? AND home_id = ?").run(i.itemId, ctx.homeId);
      return { deleted: i.itemId, name: row.name };
    },
  },
  {
    name: "record_receipt",
    description: "入库：+数量并生成新批次（可带到期日/单价/渠道）。物品不存在时会按名字自动建。必须带幂等键。",
    schema: z.object({
      ...idem,
      itemId: z.string().optional(),
      name: z.string().min(1).max(80).optional(),
      quantity: z.number().positive(),
      unit: z.string().max(8).optional(),
      locationName: z.string().max(40).optional(),
      expiryDate: dateStr.nullable().optional(),
      manufacturedDate: dateStr.nullable().optional(),
      unitCostMinor: z.number().int().min(0).nullable().optional(),
      channel: z.string().max(40).nullable().optional(),
      batchNo: z.string().max(40).nullable().optional(),
    }),
    handler: (ctx, i) => stock.receipt(ctx.db, ctx.homeId, i),
  },
  {
    name: "record_issue",
    description: "领用/吃掉：-数量，自动按 FEFO（先过期先出）扣批次。必须带幂等键。",
    schema: z.object({ ...idem, itemId: z.string(), quantity: z.number().positive(), locationName: z.string().max(40).optional(), reason: z.string().max(80).optional() }),
    handler: (ctx, i) => stock.issue(ctx.db, ctx.homeId, {
      idempotencyKey: i.idempotencyKey, itemId: i.itemId, quantity: i.quantity,
      locationId: i.locationName ? stock.resolveLocation(ctx.db, ctx.homeId, null, i.locationName) : null, reason: i.reason ?? null,
    }),
  },
  {
    name: "transfer_stock",
    description: "调拨：把某物品从一个地点搬到另一个地点（保留到期日）。必须带幂等键。",
    schema: z.object({ ...idem, itemId: z.string(), quantity: z.number().positive(), fromLocationName: z.string(), toLocationName: z.string() }),
    handler: (ctx, i) => stock.transfer(ctx.db, ctx.homeId, {
      idempotencyKey: i.idempotencyKey, itemId: i.itemId, quantity: i.quantity,
      fromLocationId: stock.resolveLocation(ctx.db, ctx.homeId, null, i.fromLocationName),
      toLocationId: stock.resolveLocation(ctx.db, ctx.homeId, null, i.toLocationName),
    }),
  },
  {
    name: "count_stock",
    description: "盘点：把某地点某物品的实盘数量写回，差额记 adjust 流水。必须带幂等键。",
    schema: z.object({ ...idem, itemId: z.string(), locationName: z.string().optional(), countedQuantity: z.number().min(0), reason: z.string().max(80).optional() }),
    handler: (ctx, i) => stock.countStock(ctx.db, ctx.homeId, {
      idempotencyKey: i.idempotencyKey, itemId: i.itemId,
      locationId: i.locationName ? stock.resolveLocation(ctx.db, ctx.homeId, null, i.locationName) : null,
      countedQuantity: i.countedQuantity, reason: i.reason ?? null,
    }),
  },
  {
    name: "list_tasks",
    description: "待办列表（默认只列未完成；给 from/to 可查某个日期窗口）。",
    schema: z.object({ from: dateStr.optional(), to: dateStr.optional(), includeDone: z.boolean().default(false), kind: z.enum(["chore", "linked", "expiry", "purchase"]).optional() }),
    handler: (ctx, i) => listTasks(ctx.db, ctx.homeId, { from: i.from, to: i.to, includeDone: i.includeDone, kind: i.kind }),
  },
  {
    name: "sync_tasks",
    description: "重跑待办对账（周期家务展开 + 临期/缺货联动 + 来源消失自动关闭）。幂等，随时可调。",
    schema: z.object({}),
    handler: (ctx) => syncTasks(ctx.db, ctx.homeId, ctx.today),
  },
  {
    name: "create_task",
    description: "手工建一条待办。",
    schema: z.object({ title: z.string().min(1).max(120), dueDate: dateStr.nullable().optional(), note: z.string().max(300).nullable().optional(), kind: z.enum(["chore", "linked", "expiry", "purchase"]).default("purchase") }),
    handler: (ctx, i) => {
      const id = newId();
      ctx.db.prepare(
        "INSERT INTO tasks (id, home_id, title, note, kind, source_type, source_id, template_id, item_id, location_id, due_date, remind_at, priority, done, done_at, created_at) " +
          "VALUES (?, ?, ?, ?, ?, 'manual', ?, NULL, NULL, NULL, ?, NULL, 1, 0, NULL, ?)",
      ).run(id, ctx.homeId, i.title, i.note ?? null, i.kind, id, i.dueDate ?? null, nowIso());
      return { id };
    },
  },
  {
    name: "complete_task",
    description: "完成/撤销一条待办。",
    schema: z.object({ taskId: z.string(), done: z.boolean().default(true) }),
    handler: (ctx, i) => {
      const info = ctx.db.prepare("UPDATE tasks SET done = ?, done_at = ? WHERE id = ? AND home_id = ?")
        .run(i.done ? 1 : 0, i.done ? nowIso() : null, i.taskId, ctx.homeId);
      if (Number(info.changes) === 0) throw new Error("task_not_found");
      return { taskId: i.taskId, done: i.done };
    },
  },
  {
    name: "list_task_templates",
    description: "周期家务模板列表。",
    schema: z.object({}),
    handler: (ctx) => ctx.db.prepare("SELECT id, title, cycle_rule, next_due_date, active FROM task_templates WHERE home_id = ? ORDER BY next_due_date").all(ctx.homeId),
  },
  {
    name: "create_task_template",
    description: "建周期家务模板（cycleRule 例：FREQ=WEEKLY;BYDAY=SU 或 FREQ=MONTHLY;BYMONTHDAY=1 或 FREQ=DAILY;INTERVAL=3）。",
    schema: z.object({ title: z.string().min(1).max(120), cycleRule: z.string().min(3).max(120), nextDueDate: dateStr, note: z.string().max(300).optional() }),
    handler: (ctx, i) => {
      const id = newId();
      ctx.db.prepare("INSERT INTO task_templates (id, home_id, title, note, cycle_rule, next_due_date, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
        .run(id, ctx.homeId, i.title, i.note ?? null, i.cycleRule, i.nextDueDate, nowIso());
      return { id };
    },
  },
  {
    name: "list_shopping",
    description: "购物清单（默认只列未完成）。",
    schema: z.object({ includeDone: z.boolean().default(false) }),
    handler: (ctx, i) => listShopping(ctx.db, ctx.homeId, i.includeDone),
  },
  {
    name: "add_shopping",
    description: "往购物清单加一条。",
    schema: z.object({ name: z.string().min(1).max(80), quantity: z.number().positive().default(1), unit: z.string().max(8).optional(), itemId: z.string().optional(), plannedDate: dateStr.nullable().optional(), note: z.string().max(300).optional() }),
    handler: (ctx, i) => {
      const id = newId();
      ctx.db.prepare(
        "INSERT INTO shopping_list (id, home_id, item_id, name, quantity, unit, planned_date, priority, source, note, completed, created_at, completed_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'agent', ?, 0, ?, NULL)",
      ).run(id, ctx.homeId, i.itemId ?? null, i.name, i.quantity, i.unit ?? null, i.plannedDate ?? null, i.note ?? null, nowIso());
      return { id, name: i.name };
    },
  },
  {
    name: "suggestions_to_shopping",
    description: "把当前所有缺货物品一键加进购物清单（已在清单里的会跳过）。",
    schema: z.object({}),
    handler: (ctx) => ({ added: suggestionsToShopping(ctx.db, ctx.homeId, ctx.today) }),
  },
  {
    name: "receive_shopping",
    description: "收货一键入库：给清单行生成批次+流水并标记完成（幂等，默认用 receive-<清单行 id> 当幂等键）。",
    schema: z.object({
      shoppingId: z.string().optional(),
      name: z.string().max(80).optional(),
      quantity: z.number().positive().optional(),
      locationName: z.string().max(40).optional(),
      expiryDate: dateStr.nullable().optional(),
      unitCostMinor: z.number().int().min(0).nullable().optional(),
      idempotencyKey: z.string().min(8).max(120).optional(),
    }),
    handler: (ctx, i) => {
      const row = i.shoppingId
        ? ctx.db.prepare("SELECT id, item_id, name, quantity, unit FROM shopping_list WHERE id = ? AND home_id = ?").get(i.shoppingId, ctx.homeId)
        : ctx.db.prepare("SELECT id, item_id, name, quantity, unit FROM shopping_list WHERE home_id = ? AND completed = 0 AND name = ? ORDER BY created_at LIMIT 1").get(ctx.homeId, i.name ?? "");
      if (!row) throw new Error("shopping_not_found");
      return receiveShopping(ctx.db, ctx.homeId, row as never, i);
    },
  },
  {
    name: "complete_shopping",
    description: "把清单行标记为已买/未买（不入库，只改状态）。",
    schema: z.object({ shoppingId: z.string(), done: z.boolean().default(true) }),
    handler: (ctx, i) => {
      const info = ctx.db.prepare("UPDATE shopping_list SET completed = ?, completed_at = ? WHERE id = ? AND home_id = ?")
        .run(i.done ? 1 : 0, i.done ? nowIso() : null, i.shoppingId, ctx.homeId);
      if (Number(info.changes) === 0) throw new Error("shopping_not_found");
      return { shoppingId: i.shoppingId, done: i.done };
    },
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function toolListJson() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema, { target: "jsonSchema7", $refStrategy: "none" }),
  }));
}

export type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

/** 处理一条 JSON-RPC 消息；返回 null 表示这是通知（无需响应） */
export function handleMcpMessage(db: DatabaseSync, homeId: string, userId: string, msg: JsonRpcRequest) {
  const id = msg.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "homeops-calendar", title: "家庭仓管日历", version: "0.1.0" },
        instructions:
          "家庭库存 + 日历 + 待办。查询用 get_home_overview / search_items / expiring_soon / low_stock；" +
          "写操作用 record_receipt / record_issue / transfer_stock / count_stock，一律要带幂等键；" +
          "删除类操作（delete_item）必须先向用户确认。",
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: toolListJson() });
    case "tools/call": {
      const name = String((msg.params as { name?: string })?.name ?? "");
      const tool = TOOL_MAP.get(name);
      if (!tool) return err(-32602, "未知工具: " + name);
      const args = ((msg.params as { arguments?: unknown })?.arguments ?? {}) as Record<string, unknown>;
      const parsed = tool.schema.safeParse(args);
      if (!parsed.success) {
        return ok({ content: [{ type: "text", text: "参数不合法：" + JSON.stringify(parsed.error.issues) }], isError: true });
      }
      try {
        const out = tool.handler({ db, homeId, userId, today: todayIso() }, parsed.data);
        return ok({ content: [{ type: "text", text: JSON.stringify(json(out), null, 2) }], structuredContent: json(out), isError: false });
      } catch (e) {
        return ok({ content: [{ type: "text", text: "执行失败：" + String((e as Error).message) }], isError: true });
      }
    }
    default:
      return err(-32601, "不支持的方法: " + String(msg.method));
  }
}

export function mcpRoutes(app: FastifyInstance, db: DatabaseSync, requireAuth: unknown) {
  const auth = requireAuth as never;

  app.post("/mcp", { preHandler: auth }, async (request, reply) => {
    const user = (request as AuthedRequest).user!;
    if (!user.homeId) return reply.code(400).send({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "该账号还没有家庭" } });
    const body = request.body as JsonRpcRequest | JsonRpcRequest[];
    reply.header("mcp-session-id", "homeops-" + user.homeId);
    if (Array.isArray(body)) {
      const out = body.map((m) => handleMcpMessage(db, user.homeId!, user.userId, m)).filter(Boolean);
      if (!out.length) return reply.code(202).send();
      return out;
    }
    const result = handleMcpMessage(db, user.homeId, user.userId, body ?? {});
    if (!result) return reply.code(202).send();
    return result;
  });

  // 无状态实现：不支持服务端推送 SSE，按 MCP 规范回 405
  app.get("/mcp", async (_request, reply) => reply.code(405).header("Allow", "POST").send({ ok: false, error: "SSE not supported on this endpoint; use POST with JSON-RPC" }));
}
