// 主题令牌单一真相源：packages/themes/tokens.css
// 用法：
//   node scripts/sync-theme-tokens.mjs          把 tokens.css 同步进多主题原型 HTML（幂等）
//   node scripts/sync-theme-tokens.mjs --init   首次：从原型 HTML 里抽出令牌生成 tokens.css
//   node scripts/sync-theme-tokens.mjs --check  校验 HTML 里的令牌与 tokens.css 一致（CI/守卫用，退出码 1 = 不一致）
import fs from 'node:fs';

const HTML = 'design/prototypes/themed-app.html';
const TOKENS = 'packages/themes/tokens.css';
const BEGIN = '/* THEME-TOKENS:BEGIN */';
const END = '/* THEME-TOKENS:END */';

const html = fs.readFileSync(HTML, 'utf8');
const startMark = html.indexOf(':root{');
const compMark = html.indexOf('/* ========================== 组件（只读令牌）');
if (startMark < 0 || compMark < 0 || compMark < startMark) {
  console.error('找不到令牌区边界（:root{ ... 组件注释）');
  process.exit(2);
}
const inlineTokens = html.slice(startMark, compMark).replace(/\s+$/, '');

if (process.argv.includes('--init')) {
  fs.mkdirSync('packages/themes', { recursive: true });
  fs.writeFileSync(TOKENS,
    '/* 家庭仓管日历 · 主题令牌单一真相源（每套主题必须填满这里的全部令牌）\n' +
    '   改完跑：node scripts/sync-theme-tokens.mjs && node design/_raw/check-theme-contrast.mjs */\n' +
    inlineTokens + '\n', 'utf8');
  console.log('已生成 ' + TOKENS + '（' + inlineTokens.length + ' 字节）');
}

const canonical = fs.readFileSync(TOKENS, 'utf8')
  .replace(/^\/\*[\s\S]*?\*\/\n/, '')   // 去掉文件头注释
  .replace(/\s+$/, '');

if (process.argv.includes('--check')) {
  if (inlineTokens.trim() !== canonical.trim()) {
    console.error('❌ 原型 HTML 里的主题令牌与 ' + TOKENS + ' 不一致，跑 node scripts/sync-theme-tokens.mjs 同步');
    process.exit(1);
  }
  console.log('✅ 主题令牌一致（' + canonical.split('\n').length + ' 行）');
} else if (!process.argv.includes('--init')) {
  const next = html.slice(0, startMark) + canonical + '\n\n' + html.slice(compMark);
  fs.writeFileSync(HTML, next, 'utf8');
  console.log('已把令牌同步进 ' + HTML);
}
