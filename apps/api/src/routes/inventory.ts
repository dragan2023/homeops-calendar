import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import {
  categoryInputSchema, countSchema, issueSchema, itemInputSchema, locationInputSchema, receiptSchema, transferBatchSchema, transferSchema,
} from "@homeops/contracts";
import { newId, nowIso, todayIso } from "@homeops/db";
import * as stock from "../stock.ts";
import type { AuthedRequest } from "./auth.ts";

function fail(reply: FastifyReply, err: unknown) {
  const msg = String((err as Error)?.message ?? err);
  const code = msg.includes("insufficient_stock") ? 409
    : msg.includes("not_found") ? 404
    : msg.includes("same_location") ? 400
    : msg.includes("required") ? 400
    : 500;
  return reply.code(code).send({ ok: false, error: msg });
}

export function inventoryRoutes(app: FastifyInstance, db: DatabaseSync, requireAuth: unknown) {
  const auth = requireAuth as never;

  /* ---------------- 地点 ---------------- */
  app.get("/api/locations", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const locations = db
      .prepare(
        "SELECT l.id, l.parent_id, l.name, l.kind, l.sort_order, l.active, " +
          "(SELECT COUNT(DISTINCT b.item_id) FROM stock_batches b WHERE b.home_id = l.home_id AND b.location_id = l.id AND b.quantity > 0) AS item_count, " +
          "IFNULL((SELECT SUM(b.quantity) FROM stock_batches b WHERE b.home_id = l.home_id AND b.location_id = l.id AND b.quantity > 0), 0) AS unit_count " +
          "FROM locations l WHERE l.home_id = ? ORDER BY l.sort_order, l.name",
      )
      .all(homeId);
    return { ok: true, locations };
  });

  app.post("/api/locations", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = locationInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    const id = newId();
    try {
      db.prepare("INSERT INTO locations (id, home_id, parent_id, name, kind, sort_order, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
        .run(id, homeId, parsed.data.parentId ?? null, parsed.data.name, parsed.data.kind, parsed.data.sortOrder, nowIso());
    } catch (err) { return fail(reply, err); }
    return { ok: true, id };
  });

  app.patch("/api/locations/:id", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      db.prepare("UPDATE locations SET name = IFNULL(?, name), kind = IFNULL(?, kind), sort_order = IFNULL(?, sort_order), active = IFNULL(?, active) WHERE id = ? AND home_id = ?")
        .run((body.name as string) ?? null, (body.kind as string) ?? null, (body.sortOrder as number) ?? null, (body.active as number) ?? null, id, homeId);
    } catch (err) { return fail(reply, err); }
    return { ok: true };
  });

  /* ---------------- 分类 ---------------- */
  app.get("/api/categories", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    return { ok: true, categories: db.prepare("SELECT id, parent_id, name, icon, sort_order FROM item_categories WHERE home_id = ? ORDER BY sort_order, name").all(homeId) };
  });

  app.post("/api/categories", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = categoryInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    const id = newId();
    try {
      db.prepare("INSERT INTO item_categories (id, home_id, parent_id, name, icon, is_system, sort_order, active) VALUES (?, ?, ?, ?, ?, 0, ?, 1)")
        .run(id, homeId, parsed.data.parentId ?? null, parsed.data.name, parsed.data.icon ?? null, parsed.data.sortOrder);
    } catch (err) { return fail(reply, err); }
    return { ok: true, id };
  });

  /* ---------------- 物品 ---------------- */
  app.get("/api/items", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const q = (request.query as { q?: string }).q?.trim() ?? "";
    const rows = db
      .prepare(
        "SELECT i.id, i.sku, i.barcode, i.name, i.base_unit, i.consumption_type, i.reorder_point, i.reorder_quantity, " +
          "i.default_location_id, i.expiry_warn_days, c.name AS category_name, " +
          "IFNULL((SELECT SUM(quantity) FROM stock_batches b WHERE b.item_id = i.id AND b.home_id = i.home_id), 0) AS quantity, " +
          "(SELECT MIN(expiry_date) FROM stock_batches b WHERE b.item_id = i.id AND b.home_id = i.home_id AND b.quantity > 0) AS first_expiry " +
          "FROM items i LEFT JOIN item_categories c ON c.id = i.category_id " +
          "WHERE i.home_id = ? AND i.active = 1" + (q ? " AND (i.name LIKE ? OR i.barcode LIKE ?)" : "") +
          " ORDER BY i.name",
      )
      .all(...((q ? [homeId, "%" + q + "%", "%" + q + "%"] : [homeId]) as never[]));
    return { ok: true, items: rows };
  });

  app.post("/api/items", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = itemInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    const d = parsed.data;
    const id = newId();
    const n = db.prepare("SELECT COUNT(*) AS n FROM items WHERE home_id = ?").get(homeId) as { n: number };
    try {
      db.prepare(
        "INSERT INTO items (id, home_id, sku, barcode, name, category_id, base_unit, icon, consumption_type, reorder_point, " +
          "reorder_quantity, default_location_id, expiry_warn_days, note, active, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
      ).run(id, homeId, "SKU-" + String(Number(n.n) + 1).padStart(5, "0"), d.barcode ?? null, d.name, d.categoryId ?? null,
        d.baseUnit, d.icon ?? null, d.consumptionType, d.reorderPoint, d.reorderQuantity, d.defaultLocationId ?? null,
        d.expiryWarnDays, d.note ?? null, nowIso());
    } catch (err) { return fail(reply, err); }
    return { ok: true, id };
  });

  app.patch("/api/items/:id", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      db.prepare(
        "UPDATE items SET name = IFNULL(?, name), barcode = IFNULL(?, barcode), category_id = IFNULL(?, category_id), " +
          "base_unit = IFNULL(?, base_unit), consumption_type = IFNULL(?, consumption_type), reorder_point = IFNULL(?, reorder_point), " +
          "reorder_quantity = IFNULL(?, reorder_quantity), default_location_id = IFNULL(?, default_location_id), " +
          "expiry_warn_days = IFNULL(?, expiry_warn_days) WHERE id = ? AND home_id = ?",
      ).run((body.name as string) ?? null, (body.barcode as string) ?? null, (body.categoryId as string) ?? null,
        (body.baseUnit as string) ?? null, (body.consumptionType as string) ?? null, (body.reorderPoint as number) ?? null,
        (body.reorderQuantity as number) ?? null, (body.defaultLocationId as string) ?? null,
        (body.expiryWarnDays as number) ?? null, id, homeId);
    } catch (err) { return fail(reply, err); }
    return { ok: true };
  });

  app.delete("/api/items/:id", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const { id } = request.params as { id: string };
    const row = db.prepare("SELECT id, name FROM items WHERE id = ? AND home_id = ?").get(id, homeId) as { id: string; name: string } | undefined;
    if (!row) return reply.code(404).send({ ok: false, error: "item_not_found" });
    db.prepare("UPDATE items SET active = 0 WHERE id = ? AND home_id = ?").run(id, homeId);
    db.prepare("INSERT INTO item_events (id, home_id, item_id, item_name, location_id, location_name, type, quantity, reason, occurred_at) VALUES (?, ?, ?, ?, NULL, NULL, 'delete', NULL, ?, ?)")
      .run(newId(), homeId, id, row.name, "删除（软删除，保留历史）", nowIso());
    return { ok: true };
  });

  app.get("/api/items/:id", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const { id } = request.params as { id: string };
    const item = db.prepare("SELECT * FROM items WHERE id = ? AND home_id = ?").get(id, homeId);
    if (!item) return reply.code(404).send({ ok: false, error: "item_not_found" });
    const batches = db
      .prepare("SELECT b.id, b.batch_no, b.quantity, b.expiry_date, b.manufactured_date, b.unit_cost_minor, b.channel, b.location_id, l.name AS location_name " +
        "FROM stock_batches b LEFT JOIN locations l ON l.id = b.location_id WHERE b.home_id = ? AND b.item_id = ? AND b.quantity > 0 " +
        "ORDER BY (b.expiry_date IS NULL), b.expiry_date, b.received_at")
      .all(homeId, id);
    const transactions = db
      .prepare("SELECT id, type, quantity, batch_id, location_id, to_location_id, reason, occurred_at, idempotency_key " +
        "FROM stock_transactions WHERE home_id = ? AND item_id = ? ORDER BY occurred_at DESC, rowid DESC LIMIT 50")
      .all(homeId, id);
    return { ok: true, item, batches, transactions };
  });

  /* ---------------- 库存操作 ---------------- */
  app.get("/api/stock/levels", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const q = request.query as { locationId?: string; itemId?: string };
    return { ok: true, levels: stock.levels(db, homeId, { locationId: q.locationId, itemId: q.itemId }) };
  });

  app.post("/api/stock/receipt", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = receiptSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    try { return { ok: true, ...stock.receipt(db, homeId, parsed.data) }; }
    catch (err) { return fail(reply, err); }
  });

  app.post("/api/stock/issue", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = issueSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    try { return { ok: true, ...stock.issue(db, homeId, parsed.data) }; }
    catch (err) { return fail(reply, err); }
  });

  app.post("/api/stock/transfer", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = transferSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    try { return { ok: true, ...stock.transfer(db, homeId, parsed.data) }; }
    catch (err) { return fail(reply, err); }
  });

  app.post("/api/stock/transfer-batch", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = transferBatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    try { return { ok: true, ...stock.transferBatch(db, homeId, parsed.data) }; }
    catch (err) { return fail(reply, err); }
  });

  app.post("/api/stock/count", { preHandler: auth }, async (request, reply) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const parsed = countSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    try { return { ok: true, ...stock.countStock(db, homeId, parsed.data) }; }
    catch (err) { return fail(reply, err); }
  });

  /* ---------------- 预警（M2 会接日历/待办） ---------------- */
  app.get("/api/stock/expiring", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    const days = Number((request.query as { days?: string }).days ?? 7);
    return { ok: true, days, today: todayIso(), batches: stock.expiringSoon(db, homeId, days, todayIso()) };
  });

  app.get("/api/stock/low", { preHandler: auth }, async (request) => {
    const homeId = (request as AuthedRequest).user!.homeId;
    return { ok: true, items: stock.lowStock(db, homeId) };
  });
}
