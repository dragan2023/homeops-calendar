import fs from 'node:fs';

// 1) 决策记录：M4 行替换为"端到端主线 + 单文件搬移"的实测证据
const dp = 'docs/决策记录.md';
let d = fs.readFileSync(dp, 'utf8');
const oldM4 = d.split('\n').find((l) => l.includes('M4 提醒') && l.includes('✅'));
if (oldM4) {
  const newM4 = '| M4 端到端验收 | ✅ 已通过 | ' + String.fromCharCode(96) + 'node scripts/verify-m4.mjs' + String.fromCharCode(96) +
    ' 14 项全 PASS、exit=0：一次入库即产生物品/批次/位置/保质期 → 自动进今日临期与日历 → 吃掉后待办自动关闭 → 缺货自动生成「买」待办 → 一键进清单 → 收货入库(2+3=5) → 待办自动关闭、清单结清、日历采购事件消失 → **只拷 SQLite 单文件到别处(随机端口)起来就是完整数据**；全链路 ' +
    String.fromCharCode(96) + 'verify-all.mjs' + String.fromCharCode(96) + ' 8/8 |';
  d = d.replace(oldM4, newM4);
  console.log('决策记录：M4 行已更新');
} else console.log('决策记录：未找到 M4 行');
fs.writeFileSync(dp, d, 'utf8');

// 2) AGENTS：脚本清单补 verify-m4，并新增坑 9（轮询等待的 sleep 陷阱）
const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
const anchor = 'node scripts/verify-m3.mjs      # M3：MCP 握手/工具清单/幂等写/采购闭环/Token 撤销 + scripts/verify-m2.mjs 同款风格';
if (a.includes(anchor) && !a.includes('verify-m4.mjs      # M4')) {
  a = a.replace(anchor, anchor + '\nnode scripts/verify-m4.mjs      # M4：端到端主线（录入→日历/待办→临期→采购→入库→同步）+ SQLite 单文件搬移即恢复');
  console.log('AGENTS：脚本清单已补 verify-m4');
}
if (!a.includes('轮询等待子进程')) {
  a += [
    '',
    '9. **轮询等待"另一个进程起来"时，失败分支也必须 sleep**（2026-09-21 实测）：写成 ' + String.fromCharCode(96) + 'for (i<30 && !up) { try { up = (await fetch(...)).ok } catch { await sleep(400) } }' + String.fromCharCode(96) + ' 时，',
    '   如果端口已通但返回非 200（或 fetch 极快失败），30 次轮询会在**毫秒内**空转完 → 误判"服务起不来"，而且报错里什么都看不到。',
    '   判据：用 ' + String.fromCharCode(96) + 'deadline + 无论成败每次 sleep 500ms' + String.fromCharCode(96) + '，并**把子进程 stdout/stderr 落进日志文件**，失败时打印尾部。守卫：' + String.fromCharCode(96) + 'verify-m4.mjs' + String.fromCharCode(96) + ' 第 14 项（单文件搬移，含随机端口起第二个实例）。',
    ''
  ].join('\n');
  fs.writeFileSync(ap, a, 'utf8');
  console.log('AGENTS：已补坑 9');
}
