// 手机可达性自检：手机连不上后端时先跑这个，它会把原因指出来并给出确切修复命令
//   node scripts/check-phone-reachable.mjs [port]
import { execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8787);
let problems = 0;
const say = (ok, msg) => { console.log((ok ? "✅ " : "❌ ") + msg); if (!ok) problems++; };

const lans = [];
for (const list of Object.values(networkInterfaces())) {
  for (const ni of list ?? []) if (ni.family === "IPv4" && !ni.internal) lans.push(ni.address);
}
console.log("本机局域网 IPv4：" + (lans.join(", ") || "（无）"));
say(lans.length > 0, "找到局域网网卡（手机与电脑要在同一 Wi-Fi）");

// 1) 监听地址：必须是 0.0.0.0（或某个局域网 IP），不能只有 127.0.0.1
let netstat = "";
try {
  netstat = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
} catch {
  netstat = "";
}
const listenLines = netstat.split(/\r?\n/).filter((l) => l.includes(":" + PORT) && l.includes("LISTENING"));
const listens = listenLines.map((l) => l.trim().split(/\s+/)[1]);
const onAll = listens.some((a) => a.startsWith("0.0.0.0:"));
const onLanOnly = listens.some((a) => lans.some((ip) => a.startsWith(ip + ":")));
say(listens.length > 0, "有进程在监听 " + PORT + (listens.length ? "（" + listens.join(", ") + "）" : "（没有，先起后端：node apps/api/src/server.ts）"));
if (listens.length) {
  say(onAll || onLanOnly, onAll || onLanOnly
    ? "监听地址允许局域网访问"
    : "只绑在 127.0.0.1 —— 手机必然 connect refused。改法：不要设 HOST=127.0.0.1（默认已是 0.0.0.0），重启后端");
}

// 2) 从局域网 IP 真发一个请求（这是手机视角）
let reachable = false;
for (const ip of lans) {
  const url = "http://" + ip + ":" + PORT + "/healthz";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const body = await res.json();
    reachable = res.ok && body?.ok === true;
    say(reachable, "从局域网地址请求成功：" + url + " → " + JSON.stringify(body));
    if (reachable) break;
  } catch (err) {
    say(false, "从局域网地址请求失败：" + url + " → " + String(err.message ?? err));
  }
}

// 3) 防火墙：有没有放行这个端口的入站规则
let fwOk = false;
try {
  const out = execFileSync("powershell", ["-NoProfile", "-Command",
    "(Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*HomeOps*' } | Measure-Object).Count"
  ], { encoding: "utf8" }).trim();
  fwOk = Number(out) > 0;
} catch {
  fwOk = false;
}
say(fwOk, fwOk
  ? "防火墙已有 HomeOps 入站放行规则"
  : "防火墙没有 HomeOps 入站放行规则（手机连不上时这条很常见）。用管理员 PowerShell 跑一次：\n     New-NetFirewallRule -DisplayName \"HomeOps Calendar TCP " + PORT + "\" -Direction Inbound -Action Allow -Protocol TCP -LocalPort " + PORT + " -Profile Any");

console.log("\n" + (problems === 0
  ? "手机应该能连上 http://" + (lans[0] ?? "<局域网IP>") + ":" + PORT + "（若仍不行，用手机浏览器打开这个 /healthz 看结果）"
  : "有 " + problems + " 项要修，按上面提示处理后再跑一次本脚本"));
process.exitCode = problems === 0 ? 0 : 1;
