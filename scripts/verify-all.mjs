// 全链路回归：起服务（若没起）→ 跑 M0–M4 验收 + 移动端/主题守卫 → 汇总
// 用法：node scripts/verify-all.mjs
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, openSync, readFileSync, rmSync } from "node:fs";

const PORT = 8900 + Math.floor(Math.random() * 90);
const BASE = process.env.BASE ?? "http://127.0.0.1:" + PORT;
const DB = "./data/_verify-" + process.pid + ".db";
// 冒烟账号口令：仓库里不存默认值。整链路一次跑完时现生成一次性随机口令，只对本次临时库有效
const PASS = process.env.SMOKE_PASS ?? randomBytes(12).toString("base64url");
const VLOG = "./data/_verify-" + process.pid + ".log";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


// 隔离运行：自带临时库 + 随机端口，绝不碰 data/homeops.db 里的真实数据，也不和你正在跑的后端抢端口
for (const suffix of ["", "-wal", "-shm"]) if (existsSync(DB + suffix)) rmSync(DB + suffix);
const logFd = openSync(VLOG, "w");
console.log("隔离运行：端口 " + PORT + "，临时库 " + DB + "（真实数据不会被碰）");
const server = spawn(process.execPath, ["apps/api/src/server.ts"], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DB_PATH: DB, LOG_LEVEL: "warn" },
  stdio: ["ignore", logFd, logFd],
});
let serverUp = false;
const deadline = Date.now() + 25000;
while (Date.now() < deadline && !serverUp) {
  try {
    const res = await fetch(BASE + "/healthz", { signal: AbortSignal.timeout(1500) });
    serverUp = res.ok;
  } catch {
    /* 还没起来 */
  }
  if (!serverUp) await sleep(500);
}
if (!serverUp) {
  console.log("❌ 临时服务起不来，日志尾部：\n" + (existsSync(VLOG) ? readFileSync(VLOG, "utf8").slice(-800) : "(无日志)"));
  server.kill();
  process.exit(1);
}

const steps = [
  ["M0 骨架", ["scripts/smoke.mjs"]],
  ["M1 库存核心", ["scripts/verify-m1.mjs"]],
  ["M2 日历+待办", ["scripts/verify-m2.mjs"]],
  ["M3 采购闭环+MCP", ["scripts/verify-m3.mjs"]],
  ["M4 端到端主线 + 单文件搬移", ["scripts/verify-m4.mjs"]],
  ["移动端接口（Bearer-only）", ["scripts/verify-mobile-api.mjs"]],
  ["主题对比度守卫", ["design/_raw/check-theme-contrast.mjs"]],
  ["原型令牌同步检查", ["scripts/sync-theme-tokens.mjs", "--check"]],
  ["移动端主题令牌检查", ["scripts/build-rn-themes.mjs", "--check"]],
];

const results = [];
for (const [name, args] of steps) {
  console.log("\n=== " + name + " ===");
  const r = spawnSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, BASE, DB_PATH: DB, SMOKE_PASS: PASS } });
  results.push([name, r.status === 0]);
}

console.log("\n======== 汇总 ========");
for (const [name, ok] of results) console.log((ok ? "✅ " : "❌ ") + name);
const failed = results.filter(([, ok]) => !ok).length;
console.log(failed === 0 ? "\n全链路回归通过（" + results.length + "/" + results.length + "）" : "\n失败 " + failed + " 项");

if (server) server.kill();
await sleep(600);
for (const suffix of ["", "-wal", "-shm"]) if (existsSync(DB + suffix)) rmSync(DB + suffix);
if (existsSync(VLOG)) rmSync(VLOG);
process.exitCode = failed === 0 ? 0 : 1;
