import fs from 'node:fs';
const dp = 'docs/决策记录.md';
let d = fs.readFileSync(dp, 'utf8');
const row = '| M3 采购闭环 + MCP | ⏳ | — |';
if (d.includes(row)) {
  d = d.replace(row, '| M3 采购闭环 + MCP | ✅ 已通过 | `node scripts/verify-m3.mjs` 23 项全 PASS、exit=0：签发/撤销家庭级 Token（只存哈希）、MCP 握手+tools/list(31 个工具)+tools/call、写操作幂等重放、缺货→清单→收货一键入库(2+3=5)、FEFO 领用/调拨/盘点、参数校验与未知工具错误码 |');
  console.log('M3 已标完成');
} else console.log('M3 行未找到');
const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
const anchor = 'node scripts/verify-m2.mjs';
if (a.includes(anchor) && !a.includes('verify-m3')) {
  const i = a.indexOf(anchor); const eol = a.indexOf('\n', i);
  a = a.slice(0, eol) + '\nnode scripts/verify-m3.mjs      # M3：MCP 握手/工具清单/幂等写/采购闭环/Token 撤销 + scripts/verify-m2.mjs 同款风格' + a.slice(eol);
  fs.writeFileSync(ap, a, 'utf8');
  console.log('AGENTS 脚本清单已补 verify-m3');
}
