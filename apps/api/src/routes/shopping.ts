import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { newId, nowIso, todayIso } from "@homeops/db";
import * as stock from "../stock.ts";
import type { AuthedRequest } from "./auth.ts";

const addSchema = z.object({
  name: z.string().min(1).max(80),
  itemId: z.string().nullable().optional(),
  quantity: z.number().positive().default(1),
  unit: z.string().max(8).nullable().optional(),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  priority: z.number().int().min(0).max(9).default(0),
  source: z.string().max(20).default("manual")
});
const receiveSchema = z.object({
  quantity: z.number().positive().optional(),
  locationId: z.string().optional(),
  locationName: z.string().max(40).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  unitCostMinor: z.number().int().min(0).nullable().optional(),
  idempotencyKey: z.string().min(8).max(120).optional()
});

function fail(reply: FastifyReply, err: unknown, code = 500) {
  return reply.code(code).send({ ok: false, error: String((err as Error)?.message ?? err) });
}

export function listShopping(db: DatabaseSync, homeId: string, includeDone = false) {
  return db
    .prepare(
      "SELECT s.id, s.item_id, s.name, s.quantity, s.unit, s.planned_date, s.priority, s.source, s.note, s.completed, s.created_at, s.completed_at, " +
        "i.base_unit, i.reorder_point FROM shopping_list s LEFT JOIN items i ON i.id = s.item_id " +
        "WHERE s.home_id = ?" + (includeDone ? "" : " AND s.completed = 0") +
        " ORDER BY s.completed ASC, IFNULL(s.planned_date,'9999-99-99') ASC, s.priority DESC, s.created_at",
    )
    .all(homeId);
}

/** 缺货物品 → 购物清单（跳过已在清单里的，幂等） */
export function suggestionsToShopping(db: DatabaseSync, homeId: string, today = todayIso()) {
  const low = db
    .prepare(
      "SELECT i.id AS item_id, i.name, i.base_unit, i.reorder_quantity FROM items i WHERE i.home_id = ? AND i.active = 1 AND i.reorder_point > 0 " +
        "AND IFNULL((SELECT SUM(quantity) FROM stock_batches b WHERE b.item_id = i.id AND b.home_id = i.home_id), 0) <= i.reorder_point " +
        "AND NOT EXISTS (SELECT 1 FROM shopping_list s WHERE s.home_id = i.home_id AND s.item_id = i.id AND s.completed = 0)",
    )
    .all(homeId) as Array<{ item_id: string; name: string; base_unit: string; reorder_quantity: number }>;
  const added: string[] = [];
  for (const it of low) {
    db.prepare(
      "INSERT INTO shopping_list (id, home_id, item_id, name, quantity, unit, planned_date, priority, source, note, completed, created_at, completed_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'auto-low', NULL, 0, ?, NULL)",
    ).run(newId(), homeId, it.item_id, it.name, it.reorder_quantity > 0 ? it.reorder_quantity : 1, it.base_unit, today, nowIso());
    added.push(it.name);
  }
  return added;
}

/** 收货一键入库：写批次 + 流水（幂等），并把清单行标记完成 */
export function receiveShopping(
  db: DatabaseSync,
  homeId: string,
  row: { id: string; item_id: string | null; name: string; quantity: number; unit: string | null },
  input: { quantity?: number; locationId?: string; locationName?: string; expiryDate?: string | null; unitCostMinor?: number | null; idempotencyKey?: string },
) {
  const key = input.idempotencyKey ?? "receive-" + row.id;
  const result = stock.receipt(db, homeId, {
    idempotencyKey: key,
    itemId: row.item_id ?? undefined,
    name: row.item_id ? undefined : row.name,
    quantity: input.quantity ?? Number(row.quantity),
    unit: row.unit ?? undefined,
    locationId: input.locationId,
    locationName: input.locationName,
    expiryDate: input.expiryDate ?? null,
    unitCostMinor: input.unitCostMinor ?? null,
    channel: "购物清单收货",
  });
  // 清单行：若收货数量 >= 计划数量则整行完成，否则扣减剩余量
  const planned = Number(row.quantity);
  const got = input.quantity ?? planned;
  if (got >= planned) {
    db.prepare("UPDATE shopping_list SET completed = 1, completed_at = ? WHERE id = ? AND home_id = ?").run(nowIso(), row.id, homeId);
  } else {
    db.prepare("UPDATE shopping_list SET quantity = quantity - ? WHERE id = ? AND home_id = ?").run(got, row.id, homeId);
  }
  return { ...result, shoppingId: row.id, itemId: result.itemId, received: got, fullyCompleted: got >= planned };
}

export function shoppingRoutes(app: FastifyInstance, db: DatabaseSync, requireAuth: unknown) {
  const auth = requireAuth as never;
  const home = (request: unknown) => (request as AuthedRequest).user!.homeId;

  app.get("/api/shopping", { preHandler: auth }, async (request) => {
    const q = request.query as { done?: string };
    return { ok: true, items: listShopping(db, home(request), q.done === "1") };
  });

  app.post("/api/shopping", { preHandler: auth }, async (request, reply) => {
    const parsed = addSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    const d = parsed.data;
    const id = newId();
    try {
      db.prepare(
        "INSERT INTO shopping_list (id, home_id, item_id, name, quantity, unit, planned_date, priority, source, note, completed, created_at, completed_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)",
      ).run(id, home(request), d.itemId ?? null, d.name, d.quantity, d.unit ?? null, d.plannedDate ?? null, d.priority, d.source, d.note ?? null, nowIso());
    } catch (err) { return fail(reply, err); }
    return { ok: true, id };
  });

  app.patch("/api/shopping/:id", { preHandler: auth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = (request.body ?? {}) as Record<string, unknown>;
    try {
      db.prepare(
        "UPDATE shopping_list SET name = IFNULL(?, name), quantity = IFNULL(?, quantity), unit = IFNULL(?, unit), " +
          "planned_date = IFNULL(?, planned_date), note = IFNULL(?, note), priority = IFNULL(?, priority) WHERE id = ? AND home_id = ?",
      ).run((b.name as string) ?? null, (b.quantity as number) ?? null, (b.unit as string) ?? null,
        (b.plannedDate as string) ?? null, (b.note as string) ?? null, (b.priority as number) ?? null, id, home(request));
    } catch (err) { return fail(reply, err); }
    return { ok: true };
  });

  app.post("/api/shopping/:id/done", { preHandler: auth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const done = ((request.body ?? {}) as { done?: boolean }).done !== false;
    const info = db.prepare("UPDATE shopping_list SET completed = ?, completed_at = ? WHERE id = ? AND home_id = ?")
      .run(done ? 1 : 0, done ? nowIso() : null, id, home(request));
    if (Number(info.changes) === 0) return reply.code(404).send({ ok: false, error: "shopping_not_found" });
    return { ok: true, done };
  });

  app.delete("/api/shopping/:id", { preHandler: auth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const info = db.prepare("DELETE FROM shopping_list WHERE id = ? AND home_id = ?").run(id, home(request));
    if (Number(info.changes) === 0) return reply.code(404).send({ ok: false, error: "shopping_not_found" });
    return { ok: true };
  });

  app.post("/api/shopping/from-low", { preHandler: auth }, async (request) => {
    return { ok: true, added: suggestionsToShopping(db, home(request)) };
  });

  app.post("/api/shopping/:id/receive", { preHandler: auth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = receiveSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    const row = db.prepare("SELECT id, item_id, name, quantity, unit FROM shopping_list WHERE id = ? AND home_id = ?")
      .get(id, home(request)) as { id: string; item_id: string | null; name: string; quantity: number; unit: string | null } | undefined;
    if (!row) return reply.code(404).send({ ok: false, error: "shopping_not_found" });
    try {
      return { ok: true, ...receiveShopping(db, home(request), row, parsed.data) };
    } catch (err) { return fail(reply, err); }
  });

  app.post("/api/shopping/receive-batch", { preHandler: auth }, async (request, reply) => {
    const body = (request.body ?? {}) as { ids?: string[]; defaults?: Record<string, unknown>; runAll?: boolean };
    const ids = body.ids ?? (body.runAll ? (listShopping(db, home(request)) as Array<{ id: string }>).map((r) => r.id) : []);
    if (!ids.length) return reply.code(400).send({ ok: false, error: "no_ids" });
    const done: unknown[] = [];
    const errors: unknown[] = [];
    for (const id of ids) {
      const row = db.prepare("SELECT id, item_id, name, quantity, unit FROM shopping_list WHERE id = ? AND home_id = ?")
        .get(id, home(request)) as { id: string; item_id: string | null; name: string; quantity: number; unit: string | null } | undefined;
      if (!row) { errors.push({ id, error: "not_found" }); continue; }
      try {
        const parsed = receiveSchema.safeParse({ ...(body.defaults ?? {}), idempotencyKey: "receive-" + id });
        if (!parsed.success) { errors.push({ id, error: "invalid_defaults" }); continue; }
        done.push(receiveShopping(db, home(request), row, parsed.data));
      } catch (err) { errors.push({ id, error: String((err as Error).message) }); }
    }
    return { ok: true, received: done.length, errors, results: done };
  });
}
