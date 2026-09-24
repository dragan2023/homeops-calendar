import fs from 'node:fs';
const p = 'scripts/verify-all.mjs';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('verify-m4.mjs')) { console.log('已接入'); process.exit(0); }
const anchor = '  ["M3 采购闭环+MCP", ["scripts/verify-m3.mjs"]],';
if (!s.includes(anchor)) { console.log('锚点未匹配'); process.exit(1); }
s = s.replace(anchor, anchor + '\n  ["M4 端到端主线 + 单文件搬移", ["scripts/verify-m4.mjs"]],');
fs.writeFileSync(p, s, 'utf8');
console.log('verify-all.mjs: 已接入 M4');
