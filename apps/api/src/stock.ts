import type { DatabaseSync } from "node:sqlite";
import { newId, nowIso } from "@homeops/db";

export type Money = number | null;

function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** 幂等：同 home + 同 key 的写操作只生效一次，重放直接返回首次结果 */
function replayedTx(db: DatabaseSync, homeId: string, key: string) {
  const row = db
    .prepare("SELECT id, type FROM stock_transactions WHERE home_id = ? AND idempotency_key = ?")
    .get(homeId, key) as { id: string; type: string } | undefined;
  return row ? { transactionId: row.id, type: row.type } : null;
}

export function resolveLocation(db: DatabaseSync, homeId: string, id?: string | null, name?: string | null): string {
  if (id) {
    const row = db.prepare("SELECT id FROM locations WHERE id = ? AND home_id = ?").get(id, homeId) as { id: string } | undefined;
    if (row) return row.id;
    throw new Error("location_not_found");
  }
  if (name) {
    const row = db
      .prepare("SELECT id FROM locations WHERE home_id = ? AND name = ? AND active = 1")
      .get(homeId, name) as { id: string } | undefined;
    if (row) return row.id;
    const id2 = newId();
    db.prepare(
      "INSERT INTO locations (id, home_id, parent_id, name, kind, sort_order, active, created_at) VALUES (?, ?, NULL, ?, 'storage', 999, 1, ?)",
    ).run(id2, homeId, name, nowIso());
    return id2;
  }
  const fallback = db
    .prepare("SELECT id FROM locations WHERE home_id = ? AND active = 1 ORDER BY sort_order LIMIT 1")
    .get(homeId) as { id: string } | undefined;
  if (!fallback) throw new Error("no_location_available");
  return fallback.id;
}

/** 扫码录入用：物品原本没条码就顺手补上，下次扫同一个码可直接认出来（已有别的条码则不动，避免两个物品抢同一个码） */
function bindBarcode(db: DatabaseSync, homeId: string, itemId: string, barcode?: string): void {
  if (!barcode) return;
  db.prepare("UPDATE items SET barcode = ? WHERE id = ? AND home_id = ? AND IFNULL(barcode, '') = ''").run(barcode, itemId, homeId);
}

export function findOrCreateItem(
  db: DatabaseSync,
  homeId: string,
  input: { itemId?: string; name?: string; unit?: string; locationId?: string | null; barcode?: string },
): { id: string; created: boolean } {
  if (input.itemId) {
    const row = db.prepare("SELECT id FROM items WHERE id = ? AND home_id = ?").get(input.itemId, homeId) as { id: string } | undefined;
    if (!row) throw new Error("item_not_found");
    bindBarcode(db, homeId, row.id, input.barcode);
    return { id: row.id, created: false };
  }
  if (input.barcode) {
    const byCode = db
      .prepare("SELECT id FROM items WHERE home_id = ? AND barcode = ? AND active = 1")
      .get(homeId, input.barcode) as { id: string } | undefined;
    if (byCode) return { id: byCode.id, created: false };
  }
  if (!input.name) throw new Error("item_or_name_required");
  const existing = db
    .prepare("SELECT id FROM items WHERE home_id = ? AND name = ? AND active = 1")
    .get(homeId, input.name) as { id: string } | undefined;
  if (existing) {
    bindBarcode(db, homeId, existing.id, input.barcode);
    return { id: existing.id, created: false };
  }
  const id = newId();
  const n = db.prepare("SELECT COUNT(*) AS n FROM items WHERE home_id = ?").get(homeId) as { n: number };
  const sku = "SKU-" + String(Number(n.n) + 1).padStart(5, "0");
  db.prepare(
    "INSERT INTO items (id, home_id, sku, barcode, name, category_id, base_unit, icon, consumption_type, reorder_point, " +
      "reorder_quantity, default_location_id, expiry_warn_days, note, active, created_at) " +
      "VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 'consumable', 0, 1, ?, 7, NULL, 1, ?)",
  ).run(id, homeId, sku, input.barcode ?? null, input.name, input.unit ?? "个", input.locationId ?? null, nowIso());
  return { id, created: true };
}

/** FEFO：先过期先出；无到期日的排最后；同到期日先收到的先出 */
export function fefoBatches(db: DatabaseSync, homeId: string, itemId: string, locationId?: string | null) {
  const sql =
    "SELECT id, location_id, quantity, expiry_date, received_at FROM stock_batches " +
    "WHERE home_id = ? AND item_id = ? AND quantity > 0" +
    (locationId ? " AND location_id = ?" : "") +
    " ORDER BY (expiry_date IS NULL), expiry_date ASC, received_at ASC, id ASC";
  const args = locationId ? [homeId, itemId, locationId] : [homeId, itemId];
  return db.prepare(sql).all(...args) as Array<{
    id: string; location_id: string; quantity: number; expiry_date: string | null; received_at: string;
  }>;
}

export function receipt(
  db: DatabaseSync,
  homeId: string,
  input: {
    idempotencyKey: string; itemId?: string; name?: string; barcode?: string; quantity: number; unit?: string;
    locationId?: string; locationName?: string; expiryDate?: string | null; manufacturedDate?: string | null;
    unitCostMinor?: Money; channel?: string | null; batchNo?: string | null;
  },
) {
  const dup = replayedTx(db, homeId, input.idempotencyKey);
  if (dup) return { replayed: true, ...dup };

  return tx(db, () => {
    const locationId = resolveLocation(db, homeId, input.locationId, input.locationName);
    const item = findOrCreateItem(db, homeId, { itemId: input.itemId, name: input.name, barcode: input.barcode, unit: input.unit, locationId });
    const batchId = newId();
    const now = nowIso();
    db.prepare(
      "INSERT INTO stock_batches (id, home_id, item_id, location_id, batch_no, quantity, manufactured_date, expiry_date, " +
        "unit_cost_minor, channel, received_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(batchId, homeId, item.id, locationId, input.batchNo ?? null, input.quantity,
      input.manufacturedDate ?? null, input.expiryDate ?? null, input.unitCostMinor ?? null,
      input.channel ?? null, now, now);
    const txId = newId();
    db.prepare(
      "INSERT INTO stock_transactions (id, home_id, item_id, batch_id, location_id, to_location_id, type, quantity, " +
        "unit_cost_minor, reason, idempotency_key, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, 'receipt', ?, ?, ?, ?, ?, ?)",
    ).run(txId, homeId, item.id, batchId, locationId, input.quantity, input.unitCostMinor ?? null,
      input.channel ? "采购入库：" + input.channel : "入库", input.idempotencyKey, now, now);
    db.prepare(
      "INSERT INTO item_events (id, home_id, item_id, item_name, location_id, location_name, type, quantity, reason, occurred_at) " +
        "VALUES (?, ?, ?, ?, ?, NULL, 'receipt', ?, ?, ?)",
    ).run(newId(), homeId, item.id, input.name ?? "物品", locationId, input.quantity, "入库", now);
    return { replayed: false, itemId: item.id, batchId, transactionId: txId, quantity: input.quantity, itemCreated: item.created };
  });
}

export function issue(
  db: DatabaseSync,
  homeId: string,
  input: { idempotencyKey: string; itemId: string; quantity: number; locationId?: string | null; batchId?: string | null; reason?: string | null },
) {
  const dup = replayedTx(db, homeId, input.idempotencyKey);
  if (dup) return { replayed: true, ...dup };

  return tx(db, () => {
    let remaining = input.quantity;
    const allocations: Array<{ batchId: string; locationId: string; quantity: number }> = [];
    const candidates = input.batchId
      ? (db.prepare("SELECT id, location_id, quantity, expiry_date FROM stock_batches WHERE id = ? AND home_id = ? AND quantity > 0")
          .all(input.batchId, homeId) as Array<{ id: string; location_id: string; quantity: number; expiry_date: string | null }>)
      : fefoBatches(db, homeId, input.itemId, input.locationId ?? undefined);
    for (const b of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.quantity));
      if (take <= 0) continue;
      db.prepare("UPDATE stock_batches SET quantity = quantity - ? WHERE id = ?").run(take, b.id);
      remaining -= take;
      allocations.push({ batchId: b.id, locationId: b.location_id, quantity: take });
    }
    if (remaining > 0.000001) throw new Error("insufficient_stock");
    const now = nowIso();
    const txIds: string[] = [];
    allocations.forEach((a, i) => {
      const id = newId();
      txIds.push(id);
      db.prepare(
        "INSERT INTO stock_transactions (id, home_id, item_id, batch_id, location_id, to_location_id, type, quantity, " +
          "unit_cost_minor, reason, idempotency_key, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, 'issue', ?, NULL, ?, ?, ?, ?)",
      ).run(id, homeId, input.itemId, a.batchId, a.locationId, a.quantity,
        input.reason ?? "领用", i === 0 ? input.idempotencyKey : input.idempotencyKey + ":" + i, now, now);
    });
    return { replayed: false, transactionId: txIds[0]!, transactionIds: txIds, allocations };
  });
}

/** 调拨的公共实现：调用方负责开事务与幂等判定 */
function moveWithinTx(
  db: DatabaseSync,
  homeId: string,
  input: { idempotencyKey: string; itemId: string; quantity: number; fromLocationId: string; toLocationId: string },
) {
  let remaining = input.quantity;
    const now = nowIso();
    const moved: Array<{ fromBatchId: string; toBatchId: string; quantity: number }> = [];
    const candidates = fefoBatches(db, homeId, input.itemId, input.fromLocationId);
    for (const b of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.quantity));
      if (take <= 0) continue;
      db.prepare("UPDATE stock_batches SET quantity = quantity - ? WHERE id = ?").run(take, b.id);
      remaining -= take;
      const existing = db
        .prepare(
          "SELECT id FROM stock_batches WHERE home_id = ? AND item_id = ? AND location_id = ? " +
            "AND IFNULL(expiry_date,'') = IFNULL(?,'') AND quantity >= 0 ORDER BY received_at LIMIT 1",
        )
        .get(homeId, input.itemId, input.toLocationId, b.expiry_date ?? null) as { id: string } | undefined;
      let toBatchId: string;
      if (existing) {
        toBatchId = existing.id;
        db.prepare("UPDATE stock_batches SET quantity = quantity + ? WHERE id = ?").run(take, toBatchId);
      } else {
        toBatchId = newId();
        const src = db.prepare("SELECT batch_no, manufactured_date, expiry_date, unit_cost_minor, channel FROM stock_batches WHERE id = ?")
          .get(b.id) as { batch_no: string | null; manufactured_date: string | null; expiry_date: string | null; unit_cost_minor: number | null; channel: string | null };
        db.prepare(
          "INSERT INTO stock_batches (id, home_id, item_id, location_id, batch_no, quantity, manufactured_date, expiry_date, " +
            "unit_cost_minor, channel, received_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(toBatchId, homeId, input.itemId, input.toLocationId, src.batch_no, take, src.manufactured_date, src.expiry_date,
          src.unit_cost_minor, src.channel, now, now);
      }
      moved.push({ fromBatchId: b.id, toBatchId, quantity: take });
      db.prepare(
        "INSERT INTO stock_transactions (id, home_id, item_id, batch_id, location_id, to_location_id, type, quantity, " +
          "unit_cost_minor, reason, idempotency_key, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'transfer_out', ?, NULL, '调拨出', ?, ?, ?)",
      ).run(newId(), homeId, input.itemId, b.id, input.fromLocationId, input.toLocationId, take, input.idempotencyKey + ":out:" + moved.length, now, now);
      db.prepare(
        "INSERT INTO stock_transactions (id, home_id, item_id, batch_id, location_id, to_location_id, type, quantity, " +
          "unit_cost_minor, reason, idempotency_key, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, 'transfer_in', ?, NULL, '调拨入', ?, ?, ?)",
      ).run(newId(), homeId, input.itemId, toBatchId, input.toLocationId, take, input.idempotencyKey + ":in:" + moved.length, now, now);
    }
  if (remaining > 0.000001) throw new Error("insufficient_stock_at_source");
  return { moved };
}

export function transfer(
  db: DatabaseSync,
  homeId: string,
  input: { idempotencyKey: string; itemId: string; quantity: number; fromLocationId: string; toLocationId: string },
) {
  const dup = replayedTx(db, homeId, input.idempotencyKey);
  if (dup) return { replayed: true, ...dup };
  if (input.fromLocationId === input.toLocationId) throw new Error("same_location");
  return tx(db, () => {
    const { moved } = moveWithinTx(db, homeId, input);
    return { replayed: false, moved };
  });
}

/** 批量调拨：把这些物品在来源容器里的全部数量一次搬到目标容器（同一事务，按物品各自幂等） */
export function transferBatch(
  db: DatabaseSync,
  homeId: string,
  input: { idempotencyKey: string; itemIds: string[]; fromLocationId: string; toLocationId: string },
) {
  if (input.fromLocationId === input.toLocationId) throw new Error("same_location");
  const seen = db
    .prepare("SELECT DISTINCT item_id FROM stock_transactions WHERE home_id = ? AND idempotency_key LIKE ?")
    .all(homeId, input.idempotencyKey + ":%") as Array<{ item_id: string }>;
  const done = new Set(seen.map((r) => r.item_id));
  const todo = input.itemIds.filter((id) => !done.has(id));
  if (todo.length === 0) return { replayed: true, movedItems: [], movedUnits: 0 };
  return tx(db, () => {
    const movedItems: string[] = [];
    let movedUnits = 0;
    for (const itemId of todo) {
      const row = db
        .prepare("SELECT IFNULL(SUM(quantity),0) AS q FROM stock_batches WHERE home_id = ? AND item_id = ? AND location_id = ? AND quantity > 0")
        .get(homeId, itemId, input.fromLocationId) as { q: number };
      const qty = Number(row.q);
      if (qty <= 0) continue;
      moveWithinTx(db, homeId, {
        idempotencyKey: input.idempotencyKey + ":" + itemId,
        itemId, quantity: qty, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId,
      });
      movedItems.push(itemId);
      movedUnits += qty;
    }
    return { replayed: false, movedItems, movedUnits };
  });
}

/** 盘点：把某个地点（或某批次）的实盘数量写回，差额记 adjust 流水 */
export function countStock(
  db: DatabaseSync,
  homeId: string,
  input: { idempotencyKey: string; itemId: string; locationId?: string | null; countedQuantity: number; reason?: string | null },
) {
  const dup = replayedTx(db, homeId, input.idempotencyKey);
  if (dup) return { replayed: true, ...dup };

  return tx(db, () => {
    const locationId = resolveLocation(db, homeId, input.locationId, null);
    const now = nowIso();
    const current = Number(
      (db.prepare("SELECT IFNULL(SUM(quantity),0) AS q FROM stock_batches WHERE home_id = ? AND item_id = ? AND location_id = ?")
        .get(homeId, input.itemId, locationId) as { q: number }).q,
    );
    const delta = input.countedQuantity - current;
    const txId = newId();
    db.prepare(
      "INSERT INTO stock_transactions (id, home_id, item_id, batch_id, location_id, to_location_id, type, quantity, " +
        "unit_cost_minor, reason, idempotency_key, occurred_at, created_at) VALUES (?, ?, ?, NULL, ?, NULL, 'adjust', ?, NULL, ?, ?, ?, ?)",
    ).run(txId, homeId, input.itemId, locationId, Math.abs(delta), input.reason ?? ("盘点调整 " + delta), input.idempotencyKey, now, now);
    if (delta > 0) {
      const batchId = newId();
      db.prepare(
        "INSERT INTO stock_batches (id, home_id, item_id, location_id, batch_no, quantity, manufactured_date, expiry_date, " +
          "unit_cost_minor, channel, received_at, created_at) VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, 'count', ?, ?)",
      ).run(batchId, homeId, input.itemId, locationId, delta, now, now);
    } else if (delta < 0) {
      let remaining = -delta;
      for (const b of fefoBatches(db, homeId, input.itemId, locationId)) {
        if (remaining <= 0) break;
        const cut = Math.min(remaining, Number(b.quantity));
        db.prepare("UPDATE stock_batches SET quantity = quantity - ? WHERE id = ?").run(cut, b.id);
        remaining -= cut;
      }
    }
    return { replayed: false, transactionId: txId, before: current, after: input.countedQuantity, delta };
  });
}

/** 库存聚合：按物品 × 地点，带最近到期日 */
export function levels(db: DatabaseSync, homeId: string, opts: { locationId?: string; itemId?: string } = {}) {
  const sql =
    "SELECT i.id AS item_id, i.name, i.base_unit, i.reorder_point, i.consumption_type, " +
    "b.location_id, l.name AS location_name, SUM(b.quantity) AS quantity, " +
    "MIN(CASE WHEN b.quantity > 0 THEN b.expiry_date END) AS first_expiry " +
    "FROM stock_batches b JOIN items i ON i.id = b.item_id LEFT JOIN locations l ON l.id = b.location_id " +
    "WHERE b.home_id = ? AND i.active = 1" +
    (opts.locationId ? " AND b.location_id = ?" : "") +
    (opts.itemId ? " AND b.item_id = ?" : "") +
    " GROUP BY i.id, b.location_id ORDER BY i.name";
  const args: unknown[] = [homeId];
  if (opts.locationId) args.push(opts.locationId);
  if (opts.itemId) args.push(opts.itemId);
  return db.prepare(sql).all(...(args as never[]));
}

export function expiringSoon(db: DatabaseSync, homeId: string, days: number, todayIso: string) {
  const limit = new Date(todayIso + "T00:00:00Z");
  limit.setUTCDate(limit.getUTCDate() + days);
  const limitIso = limit.toISOString().slice(0, 10);
  return db
    .prepare(
      "SELECT b.id AS batch_id, b.quantity, b.expiry_date, i.id AS item_id, i.name, i.base_unit, l.name AS location_name " +
        "FROM stock_batches b JOIN items i ON i.id = b.item_id LEFT JOIN locations l ON l.id = b.location_id " +
        "WHERE b.home_id = ? AND b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <= ? " +
        "ORDER BY b.expiry_date ASC",
    )
    .all(homeId, limitIso);
}

export function lowStock(db: DatabaseSync, homeId: string) {
  return db
    .prepare(
      "SELECT i.id AS item_id, i.name, i.base_unit, i.reorder_point, i.reorder_quantity, " +
        "IFNULL(SUM(b.quantity), 0) AS quantity " +
        "FROM items i LEFT JOIN stock_batches b ON b.item_id = i.id AND b.home_id = i.home_id " +
        "WHERE i.home_id = ? AND i.active = 1 GROUP BY i.id HAVING IFNULL(SUM(b.quantity), 0) <= i.reorder_point ORDER BY i.name",
    )
    .all(homeId);
}
