// M1 验收：手动走完「建物品 → 入库 → 领用 → 调拨 → 盘点」，并验证 FEFO 与幂等
const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
// 闸门：没显式指定 BASE 就拒绝跑——否则会把测试数据写进用户真实库（血案见 AGENTS 坑 13）。
if (!process.env.BASE && !process.argv.includes("--allow-real")) {
  console.error("拒绝连默认后端跑（会污染你自己的数据）。请改用：node scripts/verify-all.mjs（自带临时库+随机端口）");
  console.error("确实要打某个实例：BASE=http://127.0.0.1:<port> node " + process.argv[1]);
  process.exit(2);
}

const USER = process.env.SMOKE_USER ?? "admin";
const PASS = process.env.SMOKE_PASS;
if (!PASS) {
  console.error("拒绝运行：未设置 SMOKE_PASS（冒烟账号口令）。仓库里不存默认口令。");
  console.error("整链路回归请用 node scripts/verify-all.mjs（自动生成一次性口令 + 临时库）；单独跑：SMOKE_PASS=<口令> BASE=http://127.0.0.1:<port> node " + process.argv[1]);
  process.exit(2);
}
let cookie = "";
let failed = 0;
const key = (s) => "m1-" + s + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : ""));
  if (!ok) failed++;
}
async function req(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}
const post = (p, b) => req(p, { method: "POST", body: JSON.stringify(b) });

await post("/api/login", { username: USER, password: PASS });
const meta = await req("/api/meta");
const locations = Object.fromEntries((meta.body.locations ?? []).map((l) => [l.name, l.id]));
const cats = Object.fromEntries((meta.body.categories ?? []).map((c) => [c.name, c.id]));
check("登录并取到地点/分类", !!locations["冰箱"] && !!cats["蔬菜"], "冰箱=" + !!locations["冰箱"] + " 蔬菜=" + !!cats["蔬菜"]);

// 1. 建物品
const created = await post("/api/items", { name: "M1黄瓜", baseUnit: "根", categoryId: cats["蔬菜"], reorderPoint: 2, defaultLocationId: locations["冰箱"], expiryWarnDays: 3 });
check("建物品成功", created.status === 200 && !!created.body.id, JSON.stringify(created.body).slice(0, 120));
const itemId = created.body.id;

// 2. 入库 10（含到期日）
const r1key = key("receipt");
const r1 = await post("/api/stock/receipt", { idempotencyKey: r1key, itemId, quantity: 10, locationId: locations["冰箱"], expiryDate: "2026-09-25", unitCostMinor: 360 });
check("入库 10 成功", r1.status === 200 && r1.body.quantity === 10, JSON.stringify(r1.body).slice(0, 140));

// 2b. 同幂等键重放：必须返回 replayed，不能变成 20
const r1again = await post("/api/stock/receipt", { idempotencyKey: r1key, itemId, quantity: 10, locationId: locations["冰箱"] });
const afterReplay = await req("/api/stock/levels?itemId=" + itemId);
const qtyAfterReplay = Number(afterReplay.body.levels[0]?.quantity ?? -1);
check("幂等重放不重复入库（仍是 10）", r1again.body.replayed === true && qtyAfterReplay === 10, "replayed=" + r1again.body.replayed + " qty=" + qtyAfterReplay);

// 3. 三个批次，验证 FEFO：先过期的先出
await post("/api/stock/receipt", { idempotencyKey: key("receipt"), itemId, quantity: 4, locationId: locations["冰箱"], expiryDate: "2026-09-22" });
await post("/api/stock/receipt", { idempotencyKey: key("receipt"), itemId, quantity: 6, locationId: locations["冰箱"], expiryDate: "2026-11-01" });
const issue1 = await post("/api/stock/issue", { idempotencyKey: key("issue"), itemId, quantity: 5 });
const batchesAfterIssue = (await req("/api/items/" + itemId)).body.batches;
const firstBatchLeft = batchesAfterIssue.find((b) => b.expiry_date === "2026-09-22");
check("领用 5 走了 FEFO（先吃 09-22 那批）", firstBatchLeft === undefined && issue1.status === 200,
  "09-22 批次剩余=" + (firstBatchLeft ? firstBatchLeft.quantity : "已清空"));

// 4. 数量核对：10 + 4 + 6 - 5 = 15
const lv1 = await req("/api/stock/levels?itemId=" + itemId);
const total1 = (lv1.body.levels ?? []).reduce((s, r) => s + Number(r.quantity), 0);
check("领用后总量 = 15", total1 === 15, "total=" + total1);

// 5. 调拨 2：冰箱 → 冷冻室
const tr = await post("/api/stock/transfer", { idempotencyKey: key("transfer"), itemId, quantity: 2, fromLocationId: locations["冰箱"], toLocationId: locations["冷冻室"] });
const lv2 = await req("/api/stock/levels?itemId=" + itemId);
const atCold = Number((lv2.body.levels ?? []).find((r) => r.location_name === "冷冻室")?.quantity ?? 0);
const atFridge = Number((lv2.body.levels ?? []).find((r) => r.location_name === "冰箱")?.quantity ?? 0);
check("调拨后 冰箱=13 / 冷冻室=2", tr.status === 200 && atFridge === 13 && atCold === 2, "冰箱=" + atFridge + " 冷冻室=" + atCold);
check("调拨保留到期日", (lv2.body.levels ?? []).every((r) => r.first_expiry !== undefined), "首批到期=" + (lv2.body.levels ?? []).map((r) => r.first_expiry).join(","));

// 6. 盘点：冰箱实盘 11（差 -2），总量应变 13
const cnt = await post("/api/stock/count", { idempotencyKey: key("count"), itemId, locationId: locations["冰箱"], countedQuantity: 11 });
const lv3 = await req("/api/stock/levels?itemId=" + itemId);
const total3 = (lv3.body.levels ?? []).reduce((s, r) => s + Number(r.quantity), 0);
check("盘点写回实盘数 11 且生成 adjust 流水", cnt.status === 200 && cnt.body.after === 11 && cnt.body.delta === -2,
  "before=" + cnt.body.before + " after=" + cnt.body.after + " delta=" + cnt.body.delta);
check("盘点后总量 = 13", total3 === 13, "total=" + total3);

// 7. 超量领用必须被拒
const over = await post("/api/stock/issue", { idempotencyKey: key("overissue"), itemId, quantity: 999 });
check("超量领用返回 409 insufficient_stock", over.status === 409 && String(over.body.error).includes("insufficient_stock"), "status=" + over.status);

// 8. 缺货建议 + 临期预警
const lowItem = await post("/api/items", { name: "M1滤芯", baseUnit: "支", reorderPoint: 1 });
const low = await req("/api/stock/low");
check("缺货清单包含 0 库存物品（M1滤芯）", (low.body.items ?? []).some((i) => i.name === "M1滤芯"), "low=" + (low.body.items ?? []).map((i) => i.name).join(","));
const exp = await req("/api/stock/expiring?days=7");
check("临期预警包含 M1黄瓜", (exp.body.batches ?? []).some((b) => b.name === "M1黄瓜"), "count=" + (exp.body.batches ?? []).length);

// 9. 流水完整性：入库3次 + 领用1次 + 调拨2条 + 盘点1条
const detail = await req("/api/items/" + itemId);
const types = (detail.body.transactions ?? []).map((t) => t.type);
check("流水记录齐全（receipt/issue/transfer_out/transfer_in/adjust）",
  ["receipt", "issue", "transfer_out", "transfer_in", "adjust"].every((x) => types.includes(x)), types.join(","));

// 10. 扫码录入：条码是认物品的第一依据 —— 同一条码第二次必须回到同一个物品，名字打错也不许新建
const scanCode = "6901234567892";
const s1 = await post("/api/stock/receipt", { idempotencyKey: key("scan1"), barcode: scanCode, name: "M1扫码酸奶", quantity: 1, locationId: locations["冰箱"] });
const s2 = await post("/api/stock/receipt", { idempotencyKey: key("scan2"), barcode: scanCode, name: "M1扫码酸奶（名字打错了）", quantity: 1, locationId: locations["冰箱"] });
const scanHit = ((await req("/api/items?q=" + scanCode)).body.items ?? []).find((i) => i.barcode === scanCode);
check("扫同一个条码认出同一物品（不重复建）",
  s1.status === 200 && s2.status === 200 && s1.body.itemId === s2.body.itemId && scanHit?.id === s1.body.itemId,
  "first=" + s1.body.itemId + " second=" + s2.body.itemId + " 库里条码命中=" + (scanHit?.id ?? "无"));

// 11. 批量调拨：容器管理页「把这批东西挪到别的容器」
const bA = await post("/api/items", { name: "M1批量A", baseUnit: "包" });
const bB = await post("/api/items", { name: "M1批量B", baseUnit: "包" });
await post("/api/stock/receipt", { idempotencyKey: key("breceipt1"), itemId: bA.body.id, quantity: 2, locationId: locations["冰箱"] });
await post("/api/stock/receipt", { idempotencyKey: key("breceipt2"), itemId: bB.body.id, quantity: 3, locationId: locations["冰箱"] });
const batchKey = key("batch-transfer");
const b1 = await post("/api/stock/transfer-batch", { idempotencyKey: batchKey, itemIds: [bA.body.id, bB.body.id], fromLocationId: locations["冰箱"], toLocationId: locations["冷冻室"] });
const b2 = await post("/api/stock/transfer-batch", { idempotencyKey: batchKey, itemIds: [bA.body.id, bB.body.id], fromLocationId: locations["冰箱"], toLocationId: locations["冷冻室"] });
const lvA = await req("/api/stock/levels?itemId=" + bA.body.id);
const atColdA = Number((lvA.body.levels ?? []).find((r) => r.location_name === "冷冻室")?.quantity ?? 0);
check("批量调拨整批搬家且重放不重复搬",
  b1.status === 200 && b1.body.movedItems?.length === 2 && b1.body.movedUnits === 5 && b2.body.replayed === true && atColdA === 2,
  "movedUnits=" + b1.body.movedUnits + " replay=" + b2.body.replayed + " 冷冻室A=" + atColdA);

console.log(failed === 0 ? "\nM1 验收全部通过（" + types.length + " 条流水）" : "\nM1 验收失败 " + failed + " 项");
process.exitCode = failed === 0 ? 0 : 1;
