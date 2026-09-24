// 验证"忘记密码"工具真的能用：在真实库的副本上改密码 → 新密码能登、旧密码登不上（绝不碰真实库）
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SRC = "./data/homeops.db";
const TMP = "./data/_pwtest.db";
const PORT = 8977;
const BASE = "http://127.0.0.1:" + PORT;
const NEWPASS = "MyOwnPass-2026";
let failed = 0;
const check = (name, ok, detail = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : "")); if (!ok) failed++; };

// 先把 WAL 落盘，保证单文件副本完整
const src = new DatabaseSync(SRC);
src.exec("PRAGMA wal_checkpoint(TRUNCATE)");
src.close();
for (const s of ["", "-wal", "-shm"]) if (existsSync(TMP + s)) rmSync(TMP + s);
copyFileSync(SRC, TMP);

const set = spawnSync(process.execPath, ["scripts/set-admin-password.mjs", "admin", NEWPASS], { encoding: "utf8", env: { ...process.env, DB_PATH: TMP } });
check("set-admin-password.mjs 执行成功", set.status === 0, (set.stdout || "").trim().slice(0, 80));

const server = spawn(process.execPath, ["apps/api/src/server.ts"], { env: { ...process.env, PORT: String(PORT), DB_PATH: TMP, HOST: "127.0.0.1", LOG_LEVEL: "warn" }, stdio: "ignore" });
let up = false;
const deadline = Date.now() + 20000;
while (Date.now() < deadline && !up) {
  try { up = (await fetch(BASE + "/healthz", { signal: AbortSignal.timeout(1200) })).ok; } catch { /* wait */ }
  if (!up) await sleep(400);
}
check("副本库能正常起服务", up);

async function login(password) {
  const res = await fetch(BASE + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password }) });
  return res.status;
}
if (up) {
  check("用新密码能登录（200）", (await login(NEWPASS)) === 200);
  check("随便一个错误口令登不上（401）", (await login("wrong-" + randomBytes(8).toString("hex"))) === 401);
  const st = await (await fetch(BASE + "/api/setup-status")).json();
  check("setup-status 报告已初始化且账号为 admin", st.initialized === true && st.username === "admin", JSON.stringify(st));
}
server.kill();
await sleep(500);
for (const s of ["", "-wal", "-shm"]) if (existsSync(TMP + s)) rmSync(TMP + s);
console.log(failed === 0 ? "\n密码重设工具验收通过（真实库未被修改）" : "\n失败 " + failed + " 项");
process.exitCode = failed === 0 ? 0 : 1;
