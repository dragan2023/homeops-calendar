import fs from 'node:fs';
const NAV = {"root":["#5B6472","#0F172A"],"swiss":["#5B6472","#0F172A"],"brutal":["#C9C9C9","#FFE94A"],"clay":["#6E645C","#15803D"],"kawaii":["#9A5F7B","#C2193E"],"mecha":["#9FC0D4","#00E5FF"],"midnight":["#94A3B8","#F0B44A"],"memphis":["#5A5A5A","#111111"],"glass":["#5B7593","#0B1B33"]};
const p = 'packages/themes/tokens.css';
let s = fs.readFileSync(p, 'utf8');
function insert(header, line) {
  const i = s.indexOf(header);
  if (i < 0) return false;
  const close = s.indexOf('\n}', i);
  if (s.slice(i, close).includes('--nav-fg')) return true;
  s = s.slice(0, close) + '\n' + line + s.slice(close);
  return true;
}
insert(':root{', '  --nav-fg: ' + NAV.root[0] + '; --nav-fg-active: ' + NAV.root[1] + ';');
for (const id of Object.keys(NAV)) {
  if (id === 'root') continue;
  insert('html[data-theme="' + id + '"]{', '  --nav-fg: ' + NAV[id][0] + '; --nav-fg-active: ' + NAV[id][1] + ';');
}
fs.writeFileSync(p, s, 'utf8');
console.log('tokens.css：已加 --nav-fg / --nav-fg-active（9 个块）');

// 对比度守卫：把底栏前景/底色的两组配对也纳入（新粗野就是这里翻车的：文字和底栏都是黑的）
const cp = 'design/_raw/check-theme-contrast.mjs';
let c = fs.readFileSync(cp, 'utf8');
if (!c.includes("'nav-fg'")) {
  c = c.replace(
    "const pairs = [['text','bg'],['text','surface'],['text-2','surface'],['text-3','surface'],['on-primary','primary']",
    "const pairs = [['text','bg'],['text','surface'],['text-2','surface'],['text-3','surface'],['on-primary','primary'],['nav-fg','nav-bg'],['nav-fg-active','nav-bg']"
  );
  fs.writeFileSync(cp, c, 'utf8');
  console.log('对比度守卫：已加底栏两组配对');
}
