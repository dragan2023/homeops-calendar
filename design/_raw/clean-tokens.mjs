import fs from 'node:fs';
const p = 'packages/themes/tokens.css';
let t = fs.readFileSync(p, 'utf8');
const before = t.split('\n').filter((l) => l.includes('--color-scheme')).length;
t = t.split('\n').filter((l) => !/^\s*--color-scheme\s*:/.test(l)).join('\n');
fs.writeFileSync(p, t, 'utf8');
console.log('移除无用令牌 --color-scheme：' + before + ' 行');
