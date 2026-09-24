import fs from 'node:fs';
const p = 'scripts/verify-all.mjs';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('verify-mobile-api.mjs')) {
  const anchor = '  ["M4 端到端主线 + 单文件搬移", ["scripts/verify-m4.mjs"]],';
  s = s.replace(anchor, anchor + '\n  ["移动端接口（Bearer-only）", ["scripts/verify-mobile-api.mjs"]],');
  fs.writeFileSync(p, s, 'utf8');
  console.log('verify-all：已接入移动端接口验收');
}
const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
const a2 = 'node scripts/verify-m4.mjs      # M4：端到端主线（录入→日历/待办→临期→采购→入库→同步）+ SQLite 单文件搬移即恢复';
if (a.includes(a2) && !a.includes('verify-mobile-api')) {
  a = a.replace(a2, a2 + '\nnode scripts/verify-mobile-api.mjs  # 移动端：登录签发 Bearer Token 后，手机要用的每个接口都能只带 Token 跑通\nnode scripts/build-rn-themes.mjs --check  # 移动端主题令牌与 packages/themes/tokens.css 是否一致');
  fs.writeFileSync(ap, a, 'utf8');
  console.log('AGENTS：已补移动端两条命令');
}
