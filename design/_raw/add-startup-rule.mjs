import fs from 'node:fs';
const SECTION = "\n## 五、启动脚本铁律（全局记忆，必须遵守）\n\n**任何启动/重启脚本（.bat / .ps1 / npm script / docker entry）第一步必须先清理「这个软件自己的」旧进程，再启动新进程。**\n\n- 血案（2026-09-21，真机第一次连就撞）：老后端进程仍绑 `127.0.0.1:8787`，源码已改成默认 `0.0.0.0`，用户重启了 App、重扫码，结果一模一样 —— 因为**服务根本没重启**。改了代码 ≠ 改了正在跑的程序。\n- 做法：按端口定位占用进程 → 校验命令行确属本软件 → 只结束该 PID → 等端口真的释放 → 再启动。\n- 安全边界：**绝不按进程名批量杀**（禁 `taskkill /IM node.exe`、`Stop-Process -Name node`）；命令行里出现 `dsh` 一律拒绝（保护宿主）。\n- 本项目的实现与用法：\n  - 工具：`scripts/free-port.mjs`（跨项目可复制）。用法 `node scripts/free-port.mjs <port> [期望命令性子串,...] [--any-node] [--force]`。\n  - `start_backend.bat`：先清 8787 上的旧后端，再启动并打印手机可用地址。\n  - `start_mobile.bat`：先清 8787（严格匹配 `apps/api/src/server.ts`）→ 起后端 → 清 8081（`--any-node`）→ 起 Metro。\n  - 自检：`node scripts/check-phone-reachable.mjs`（绑定地址 / 局域网实连 / 防火墙规则，任一不合格 exit 1）。\n";
const p = 'AGENTS.md';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('启动脚本铁律')) { fs.writeFileSync(p, s + SECTION, 'utf8'); console.log('AGENTS.md：已加「启动脚本铁律」'); }
else console.log('AGENTS.md：已有该节');
