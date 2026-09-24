// 跨项目可复制的"启动前清旧进程"工具（铁律：启动脚本第一步必须清掉本软件的旧进程）
//   node scripts/free-port.mjs <port> [期望的命令行子串,...] [--any-node] [--force]
// 行为：按端口找到监听进程 → 校验命令行属于本软件 → 只杀这一个 PID → 等到端口真的释放
// 安全：绝不按进程名批量杀；命令行含 dsh 一律拒绝（保护宿主）；不属于本软件且未加 --force 时只警告不动手
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const port = Number(args[0]);
const expects = (args[1] && !args[1].startsWith("--") ? args[1] : "").split(",").filter(Boolean);
const anyNode = args.includes("--any-node");
const force = args.includes("--force");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!port) {
  console.error("用法: node scripts/free-port.mjs <port> [期望命令性子串,...] [--any-node] [--force]");
  process.exit(2);
}

function listeningPids() {
  let out = "";
  try { out = execFileSync("netstat", ["-ano"], { encoding: "utf8" }); } catch { return []; }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const cols = line.trim().split(/\s+/);
    const local = cols[1] ?? "";
    if (!local.endsWith(":" + port)) continue;
    const pid = Number(cols[cols.length - 1]);
    if (pid > 0) pids.add(pid);
  }
  return [...pids];
}

function cmdlineOf(pid) {
  try {
    return execFileSync("powershell", ["-NoProfile", "-Command",
      "(Get-CimInstance Win32_Process -Filter 'ProcessId = " + pid + "').CommandLine"
    ], { encoding: "utf8" }).trim();
  } catch { return ""; }
}

async function waitFree(timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (listeningPids().length === 0) return true;
    await sleep(300);
  }
  return listeningPids().length === 0;
}

const pids = listeningPids();
if (pids.length === 0) {
  console.log("[free-port] " + port + " 空闲，无需清理");
  process.exit(0);
}

let killed = 0;
for (const pid of pids) {
  const cmd = cmdlineOf(pid);
  if (/dsh/i.test(cmd)) {
    console.log("[free-port] ⚠️ " + port + " 被 dsh 自身占用（PID " + pid + "），拒绝结束：\n    " + cmd);
    continue;
  }
  const matched = anyNode ? /node/i.test(cmd) : expects.some((e) => cmd.includes(e));
  if (!matched && !force) {
    console.log("[free-port] ⚠️ " + port + " 被不属于本软件的进程占用（PID " + pid + "），未动手：\n    " + cmd);
    continue;
  }
  try {
    execFileSync("powershell", ["-NoProfile", "-Command", "Stop-Process -Id " + pid + " -Force -ErrorAction Stop"], { encoding: "utf8" });
    console.log("[free-port] 已结束旧进程 PID " + pid + "（" + port + "，只杀这一个）");
    killed++;
  } catch (err) {
    console.log("[free-port] ❌ 结束 PID " + pid + " 失败：" + String(err.message ?? err).slice(0, 160));
  }
}

const free = await waitFree();
console.log(free ? "[free-port] " + port + " 已释放（清掉 " + killed + " 个旧进程）" : "[free-port] ❌ " + port + " 仍被占用");
process.exitCode = free ? 0 : 1;
