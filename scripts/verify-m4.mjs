// M4 验收（端到端主线 + 可搬移性）：按 docs/开发计划.md 第 1 节"成功标准"逐条走一遍
//   录入物品(批次/位置/保质期) → 自动出现在日历与今日待办 → 临期提醒 → 吃掉后自动关闭 →
//   缺货 → 购物清单 → 收货一键入库 → 库存与日历同步更新；最后验证"单文件拷走即恢复"
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, openSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const F1 = String.fromCharCode(96);

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
const DB_PATH = process.env.DB_PATH ?? "./data/homeops.db";
let cookie = "";
let failed = 0;
const tag = "M4-" + Date.now().toString().slice(-7);
const key = (s) => "m4-" + s + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = day(0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : ""));
  if (!ok) failed++;
}
async function req(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body };
}
const post = (p, b) => req(p, { method: "POST", body: JSON.stringify(b) });

await post("/api/login", { username: USER, password: PASS });

/* ---------- 第 1 步：录入（名称/批次/位置/保质期都由一次入库产生） ---------- */
const r1 = await post("/api/stock/receipt", { idempotencyKey: key("receipt"), name: tag + "酸奶", quantity: 3, unit: "杯", locationName: "冰箱", expiryDate: day(2) });
const itemId = r1.body?.itemId;
const named = await req("/api/items?q=" + tag);
const created = (named.body?.items ?? []).find((i) => i.name === tag + "酸奶");
check("① 录入：一次入库即产生物品+批次+位置+保质期",
  r1.status === 200 && !!itemId && !!r1.body.batchId && created?.quantity === 3 && created?.first_expiry === day(2),
  "qty=" + created?.quantity + " 到期=" + created?.first_expiry);

/* ---------- 第 2 步：自动出现在今日待办与日历 ---------- */
const sync1 = await post("/api/tasks/sync", {});
const today1 = await req("/api/today");
const cal7 = await req("/api/calendar?from=" + today + "&to=" + day(6));
const inToday = (today1.body?.expiring ?? []).some((b) => b.name === tag + "酸奶");
// 临期待办的 due_date = 到期日（今天+2），所以它按语义出现在"临期区块 + 待办列表"，而不是"今天到期"那一段
const allOpen = await req("/api/tasks");
const taskExists = (allOpen.body?.tasks ?? []).some((t) => t.title.includes(tag + "酸奶"));
const inCal = (cal7.body?.events ?? []).some((e) => e.type === "expiry" && e.title.includes(tag + "酸奶"));
check("② 自动进入今日视图（临期区块）+ 全量待办列表", inToday && taskExists, "expiring=" + inToday + " task=" + taskExists);
check("② 自动出现在日历（expiry 事件）", inCal, "events=" + cal7.body?.count + " byType=" + JSON.stringify(cal7.body?.byType));
check("② 待办由对账引擎生成（不是手工插的）", (sync1.body?.created ?? []).some((t) => t.includes(tag + "酸奶")), "created=" + JSON.stringify(sync1.body?.created).slice(0, 80));

/* ---------- 第 3 步：临期提醒 → 处理掉 → 待办自动关闭 ---------- */
const ate = await post("/api/stock/issue", { idempotencyKey: key("issue"), itemId, quantity: 3, reason: "吃掉了" });
const sync2 = await post("/api/tasks/sync", {});
check("③ 吃完后临期待办自动关闭（提醒不会赖着）",
  ate.status === 200 && (sync2.body?.closed ?? []).some((c) => c.includes(tag + "酸奶")),
  "closed=" + JSON.stringify(sync2.body?.closed).slice(0, 90));

/* ---------- 第 4 步：缺货 → 购物清单 → 收货一键入库 ---------- */
await req("/api/items/" + itemId, { method: "PATCH", body: JSON.stringify({ reorderPoint: 2, reorderQuantity: 4 }) });
const syncLow = await post("/api/tasks/sync", {});
const lowTaskCreated = (syncLow.body?.created ?? []).some((t) => t.startsWith("buy:") && t.includes(tag + "酸奶"));
check("④ 缺口一出现，「买」待办立刻由对账生成", lowTaskCreated, "created=" + JSON.stringify(syncLow.body?.created).slice(0, 80));
const low = await req("/api/stock/low");
check("④ 库存 0 低于补货点 → 进入缺货清单", (low.body?.items ?? []).some((i) => i.name === tag + "酸奶"));
const addLow = await post("/api/shopping/from-low", {});
const shop = await req("/api/shopping");
const row = (shop.body?.items ?? []).find((s) => s.name === tag + "酸奶");
check("④ 缺货一键进购物清单", (addLow.body?.added ?? []).includes(tag + "酸奶") && !!row, "row=" + !!row);
const receive = await post("/api/shopping/" + row?.id + "/receive", { quantity: 5, locationName: "冰箱", expiryDate: day(30), unitCostMinor: 990 });
check("④ 收货一键入库（批次+流水+清单完成）",
  receive.status === 200 && !!receive.body?.batchId && receive.body?.fullyCompleted === true,
  "batch=" + String(receive.body?.batchId).slice(0, 8) + " completed=" + receive.body?.fullyCompleted);

/* ---------- 第 5 步：库存与日历/待办同步更新 ---------- */
const levels = await req("/api/stock/levels?itemId=" + itemId);
const qty = (levels.body?.levels ?? []).reduce((s, r) => s + Number(r.quantity), 0);
const sync3 = await post("/api/tasks/sync", {});
const shoppingAfter = await req("/api/shopping");
const cal30 = await req("/api/calendar?from=" + today + "&to=" + day(30));
check("⑤ 库存同步更新为 5", qty === 5, "qty=" + qty);
check("⑤ 补货后「买」待办自动关闭", (sync3.body?.closed ?? []).some((c) => c.includes(tag + "酸奶")), "closed=" + JSON.stringify(sync3.body?.closed).slice(0, 80));
check("⑤ 清单行结清、日历采购事件消失",
  !(shoppingAfter.body?.items ?? []).some((s) => s.id === row?.id) &&
  !(cal30.body?.events ?? []).some((e) => e.type === "buy" && e.title.includes(tag + "酸奶")),
  "calendar buy 事件已移除");
check("⑤ 新批次到期日进入日历（+30 天窗口）",
  (cal30.body?.events ?? []).some((e) => e.title.includes(tag + "酸奶") && e.date === day(30)),
  "date=" + day(30));

/* ---------- 第 6 步：SQLite 单文件搬移即恢复 ---------- */
const src = new DatabaseSync(DB_PATH);
src.exec("PRAGMA wal_checkpoint(TRUNCATE)");
src.close();
const copyPath = "./data/_portability-check.db";
for (const suffix of ["", "-wal", "-shm"]) if (existsSync(copyPath + suffix)) rmSync(copyPath + suffix);
copyFileSync(DB_PATH, copyPath);
const PORT = 8801 + Math.floor(Math.random() * 90);
const ALT = "http://127.0.0.1:" + PORT;
const logPath = "./data/_portability-child.log";
const logFd = openSync(logPath, "w");
const child = spawn(process.execPath, ["apps/api/src/server.ts"], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: copyPath, HOST: "127.0.0.1" },
  stdio: ["ignore", logFd, logFd],
});
let altUp = false;
// 注意：这里必须"无论结果都 sleep"，否则非 200 响应会让 30 次轮询在毫秒内空转完，误判成"起不来"
const deadline = Date.now() + 25000;
while (Date.now() < deadline && !altUp) {
  try {
    const res = await fetch(ALT + "/healthz", { signal: AbortSignal.timeout(1500) });
    altUp = res.ok;
  } catch {
    /* 还没起来 */
  }
  if (!altUp) await sleep(500);
}
let altHasData = false;
if (altUp) {
  const login = await fetch(ALT + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: USER, password: PASS }) });
  const ck = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const items = await fetch(ALT + "/api/items?q=" + encodeURIComponent(tag), { headers: { cookie: ck } });
  const body = await items.json();
  altHasData = (body.items ?? []).length > 0;
}
const childLog = existsSync(logPath) ? readFileSync(logPath, "utf8").trim().slice(-400) : "";
child.kill();
await sleep(800);
for (const suffix of ["", "-wal", "-shm"]) if (existsSync(copyPath + suffix)) rmSync(copyPath + suffix);
if (existsSync(logPath)) rmSync(logPath);
check("⑥ 只拷数据库单文件到别处，起来就是完整数据（含账号）", altUp && altHasData,
  "port=" + PORT + " healthz=" + altUp + " 查得到刚录入的物品=" + altHasData + (altUp ? "" : "  子进程输出: " + childLog));

console.log(failed === 0 ? "\nM4 端到端验收全部通过（主线" + F1 + "录入→日历/待办→临期→采购→入库→同步" + F1 + " + 单文件搬移）" : "\nM4 验收失败 " + failed + " 项");
process.exitCode = failed === 0 ? 0 : 1;
