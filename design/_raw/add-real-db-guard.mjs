import fs from 'node:fs';
const files = ['scripts/smoke.mjs','scripts/verify-m1.mjs','scripts/verify-m2.mjs','scripts/verify-m3.mjs','scripts/verify-m4.mjs','scripts/verify-mobile-api.mjs'];
const guard = [
  '',
  '// 闸门：没显式指定 BASE 就拒绝跑——否则会把测试数据写进用户真实库（血案见 AGENTS 坑 13）。',
  'if (!process.env.BASE && !process.argv.includes("--allow-real")) {',
  '  console.error("拒绝连默认后端跑（会污染你自己的数据）。请改用：node scripts/verify-all.mjs（自带临时库+随机端口）");',
  '  console.error("确实要打某个实例：BASE=http://127.0.0.1:<port> node " + process.argv[1]);',
  '  process.exit(2);',
  '}',
  ''
].join('\n');
let n = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('拒绝连默认后端跑')) { console.log('skip ' + f); continue; }
  const anchor = 'const BASE = process.env.BASE ?? "http://127.0.0.1:8787";';
  if (!s.includes(anchor)) { console.log('MISS anchor ' + f); continue; }
  s = s.replace(anchor, anchor + guard);
  fs.writeFileSync(f, s, 'utf8'); n++;
}
console.log('已加闸门 ' + n + ' 个脚本');
