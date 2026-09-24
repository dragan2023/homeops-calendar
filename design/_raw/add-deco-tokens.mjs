import fs from 'node:fs';

// 1) 给令牌契约补 3 个装饰令牌（组件 CSS 里因此不再出现任何字面色值）
const ADD = {
  root: '  --scrim: rgba(8,12,20,.45); --swatch-border: rgba(0,0,0,.18); --badge-text: #FFFFFF;',
  swiss: '  --scrim: rgba(8,12,20,.45); --swatch-border: rgba(0,0,0,.18); --badge-text: #FFFFFF;',
  brutal: '  --scrim: rgba(10,10,10,.5); --swatch-border: rgba(0,0,0,.3); --badge-text: #FFFFFF;',
  clay: '  --scrim: rgba(47,42,38,.42); --swatch-border: rgba(0,0,0,.14); --badge-text: #FFFFFF;',
  kawaii: '  --scrim: rgba(91,35,64,.42); --swatch-border: rgba(0,0,0,.16); --badge-text: #FFFFFF;',
  mecha: '  --scrim: rgba(0,0,0,.62); --swatch-border: rgba(255,255,255,.28); --badge-text: #140000;',
  midnight: '  --scrim: rgba(0,0,0,.6); --swatch-border: rgba(255,255,255,.22); --badge-text: #2A0B0B;',
  memphis: '  --scrim: rgba(17,17,17,.5); --swatch-border: rgba(0,0,0,.25); --badge-text: #FFFFFF;',
  glass: '  --scrim: rgba(11,27,51,.4); --swatch-border: rgba(255,255,255,.8); --badge-text: #FFFFFF;'
};
const tokPath = 'packages/themes/tokens.css';
let tok = fs.readFileSync(tokPath, 'utf8');
function insertToken(text, header, line) {
  const i = text.indexOf(header);
  if (i < 0) return text;
  if (text.slice(i, i + 400).includes('--scrim')) return text;
  const close = text.indexOf('\n}', i);
  return text.slice(0, close) + '\n' + line + text.slice(close);
}
tok = insertToken(tok, ':root{', ADD.root);
for (const id of Object.keys(ADD)) {
  if (id === 'root') continue;
  tok = insertToken(tok, 'html[data-theme="' + id + '"]{', ADD[id]);
}
fs.writeFileSync(tokPath, tok, 'utf8');
console.log('tokens.css: 已补 --scrim / --swatch-border / --badge-text');

// 2) 组件 CSS 换成令牌，消灭字面色值
const cssPath = 'apps/web/src/styles/components.css';
let css = fs.readFileSync(cssPath, 'utf8');
css = css.replace('background: rgba(8, 12, 20, 0.45);', 'background: var(--scrim);')
         .replace('border: 1px solid rgba(0, 0, 0, 0.18);', 'border: var(--border-w) solid var(--swatch-border);')
         .replace('color: #fff; border-radius: var(--radius-pill); font-size: 10px;', 'color: var(--badge-text); border-radius: var(--radius-pill); font-size: 10px;');
fs.writeFileSync(cssPath, css, 'utf8');
console.log('components.css: 已改为令牌引用');
