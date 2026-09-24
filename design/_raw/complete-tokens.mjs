import fs from 'node:fs';

const TOK = 'packages/themes/tokens.css';
let text = fs.readFileSync(TOK, 'utf8');

function blockBounds(header) {
  const i = text.indexOf(header);
  if (i < 0) return null;
  const close = text.indexOf('\n}', i);
  return { start: i, end: close };
}
function declsOf(header) {
  const b = blockBounds(header);
  if (!b) return {};
  const out = {};
  text.slice(b.start, b.end).split(';').forEach((d) => {
    const i = d.indexOf(':');
    if (i < 0) return;
    const k = d.slice(0, i).trim().replace(/^--/, '');
    if (k) out[k] = d.slice(i + 1).trim();
  });
  return out;
}
function insertBeforeBlockEnd(header, line) {
  const b = blockBounds(header);
  text = text.slice(0, b.end) + '\n' + line + text.slice(b.end);
}

// 1) 新增 --shadow-sheet（弹层阴影也必须是令牌）
const SHEET_SHADOW = {
  root: '0 -16px 40px -24px rgba(0,0,0,.6)',
  swiss: '0 -16px 40px -24px rgba(0,0,0,.6)',
  brutal: '0 -8px 0 0 #0A0A0A',
  clay: '0 -14px 34px -20px rgba(47,42,38,.7)',
  kawaii: '0 -10px 30px -18px rgba(255,111,165,.8)',
  mecha: '0 -16px 40px -22px rgba(0,229,255,.45)',
  midnight: '0 -16px 40px -22px rgba(0,0,0,.9)',
  memphis: '0 -10px 0 0 #111111',
  glass: '0 -16px 40px -22px rgba(11,27,51,.55)'
};
insertBeforeBlockEnd(':root{', '  --shadow-sheet: ' + SHEET_SHADOW.root + ';');
for (const id of Object.keys(SHEET_SHADOW)) {
  if (id === 'root') continue;
  insertBeforeBlockEnd('html[data-theme="' + id + '"]{', '  --shadow-sheet: ' + SHEET_SHADOW[id] + ';');
}

// 2) 每套主题补齐 :root 里的全部令牌（不再靠继承：避免浅色主题的 --nav-bg 之类漏进深色主题）
const rootDecls = declsOf(':root{');
const OVERRIDE = {
  swiss: { 'nav-bg': 'rgba(255,255,255,.96)', 'bg-deco': 'none', 'clip-card': 'none', 'glow': 'none', 'font-mono': 'ui-monospace,monospace', 'fs-h2': '12px', 'shadow-press': 'none' },
  brutal: { 'bg-deco': 'none', 'clip-card': 'none', 'glow': 'none', 'fs-h2': '12px', 'font-mono': "'Space Mono',monospace", 'label-transform': 'uppercase' },
  clay: { 'nav-bg': 'rgba(255,253,249,.97)', 'bg-deco': 'none', 'clip-card': 'none', 'glow': 'none', 'font-mono': 'ui-monospace,monospace', 'fs-h2': '12px' },
  kawaii: { 'clip-card': 'none', 'glow': 'none', 'font-mono': 'ui-monospace,monospace', 'fs-h2': '12px' },
  mecha: { 'fs-h2': '12px', 'label-transform': 'uppercase' },
  midnight: { 'bg-deco': 'none', 'clip-card': 'none', 'glow': 'none', 'fs-h2': '12px', 'shadow-press': '0 4px 10px -6px rgba(0,0,0,.9)' },
  memphis: { 'nav-bg': 'rgba(255,253,246,.98)', 'clip-card': 'none', 'glow': 'none', 'fs-h2': '12px', 'label-transform': 'uppercase' },
  glass: { 'clip-card': 'none', 'glow': 'none', 'fs-h2': '12px', 'shadow-press': '0 4px 10px -8px rgba(11,27,51,.6)' }
};
const report = [];
for (const id of Object.keys(OVERRIDE)) {
  const header = 'html[data-theme="' + id + '"]{';
  const have = declsOf(header);
  const missing = Object.keys(rootDecls).filter((k) => have[k] === undefined);
  if (!missing.length) { report.push(id + ': 已完整'); continue; }
  const lines = missing.map((k) => '  --' + k + ': ' + (OVERRIDE[id][k] ?? rootDecls[k]) + ';');
  insertBeforeBlockEnd(header, lines.join('\n'));
  report.push(id + ': 补 ' + missing.length + ' 项 (' + missing.join(',') + ')');
}
fs.writeFileSync(TOK, text, 'utf8');
console.log(report.join('\n'));

// 3) 弹层阴影改成令牌
const cssPath = 'apps/web/src/styles/components.css';
let css = fs.readFileSync(cssPath, 'utf8');
css = css.replace('box-shadow: 0 -16px 40px -24px rgba(0, 0, 0, 0.6);', 'box-shadow: var(--shadow-sheet);');
fs.writeFileSync(cssPath, css, 'utf8');
console.log('components.css: 弹层阴影改为 var(--shadow-sheet)');
