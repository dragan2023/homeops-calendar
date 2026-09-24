import fs from 'node:fs';
const p = 'AGENTS.md';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('node scripts/verify-m2.mjs      # M2')) { console.log('already there'); process.exit(0); }
const anchor = 'node scripts/verify-m1.mjs';
const i = s.indexOf(anchor);
if (i < 0) { console.log('anchor missing'); process.exit(1); }
const eol = s.indexOf('\n', i);
const ins = '\nnode scripts/verify-m2.mjs      # M2：周期家务展开/临期联动/缺货买+换/对账幂等/来源消失自动关闭/日历四类事件';
s = s.slice(0, eol) + ins + s.slice(eol);
fs.writeFileSync(p, s, 'utf8');
console.log('AGENTS script list patched');
