// 从 packages/themes/tokens.css 生成 React Native 主题令牌（唯一真相源 → Web/原型/移动端三端一致）
//   node scripts/build-rn-themes.mjs           生成 mobile/src/theme/generated.ts
//   node scripts/build-rn-themes.mjs --check   校验生成物是否与 tokens.css 一致（守卫）
import fs from 'node:fs';

const TOKENS = 'packages/themes/tokens.css';
const OUT = 'mobile/src/theme/generated.ts';

const css = fs.readFileSync(TOKENS, 'utf8').replace(/^\/\*[\s\S]*?\*\/\n/, '');
const blocks = [];
const rootMatch = /:root\{([\s\S]*?)\n\}/.exec(css);
const parse = (body) => {
  const out = {};
  body.split(';').forEach((d) => {
    const i = d.indexOf(':');
    if (i < 0) return;
    const k = d.slice(0, i).trim().replace(/^--/, '');
    const v = d.slice(i + 1).trim();
    if (k && v) out[k] = v;
  });
  return out;
};
if (!rootMatch) { console.error('tokens.css 里找不到 :root 块'); process.exit(2); }
const rootTokens = parse(rootMatch[1]);
for (const m of css.matchAll(/html\[data-theme="([a-z]+)"\]\{([\s\S]*?)\n\}/g)) blocks.push({ id: m[1], tokens: parse(m[2]) });

const camel = (s) => s.replace(/-(.)/g, (_, c) => c.toUpperCase());
const isColor = (v) => /^#[0-9a-fA-F]{3,8}$/.test(v) || /^rgba?\(/.test(v) || v === 'transparent';
const pxNum = (v) => { const m = /^(-?[\d.]+)px$/.exec(v); return m ? Number(m[1]) : null; };
const secToMs = (v) => { const m = /^([\d.]+)s$/.exec(v); return m ? Math.round(Number(m[1]) * 1000) : null; };
const firstFamily = (v) => v.split(',')[0].trim().replace(/^['"]|['"]$/g, '');

/** CSS 阴影 → RN 近似：解析 "Npx Npx 0 #色" 这类硬投影，其余按层级给 elevation */
function shadowOf(v) {
  const hard = /^\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+0(?:px)?\s+([^,]+)$/.exec(v);
  if (hard) return { hard: { x: Number(hard[1]), y: Number(hard[2]), color: hard[3].trim() }, elevation: Math.max(2, Math.abs(Number(hard[2])) + 2) };
  if (v === 'none' || !v) return { hard: null, elevation: 0 };
  const blur = /(-?[\d.]+)px/.exec(v);
  return { hard: null, elevation: blur ? Math.max(2, Math.min(12, Math.round(Number(blur[1]) / 6) + 2)) : 4 };
}

function toRnt(themeId, tokens) {
  const merged = { ...rootTokens, ...tokens };
  const colors = {};
  const nums = {};
  const misc = {};
  for (const [k, v] of Object.entries(merged)) {
    const key = camel(k);
    if (isColor(v) && k !== 'bg-deco') { colors[key] = v; continue; }
    const bareNum = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
    const px = pxNum(v);
    if (px !== null) { nums[key] = px; continue; }
    if (bareNum !== null && key !== 'dur') { nums[key] = bareNum; continue; }
    const ms = secToMs(v);
    if (ms !== null && k === 'dur') { nums[key] = ms; continue; }
    if (k === 'font-head' || k === 'font-body' || k === 'font-mono') { misc[key === 'font-head' ? 'fontHead' : k === 'font-body' ? 'fontBody' : 'fontMono'] = firstFamily(v); continue; }
    if (k === 'label-tracking') { misc.labelTracking = v; continue; }
    if (k === 'label-transform') { misc.labelTransform = v; continue; }
    if (k === 'color-scheme') { continue; }
    if (k.startsWith('shadow-')) { const s = shadowOf(v); misc[k.replace('shadow-', 'shadow') + 'Hard'] = s.hard; nums[camel(k) + 'Elevation'] = s.elevation; continue; }
    if (k === 'clip-card') { misc.clipCard = v !== 'none'; const m = /([\d.]+)px/.exec(v); misc.clipCardCorner = m ? Number(m[1]) : 0; continue; }
    if (k === 'ease') { misc.ease = v; continue; }
    if (k === 'bg-deco') { continue; }
    misc[key] = v;
  }
  return { id: themeId, colors, nums, misc };
}

// 每个主题块自身已合并 :root 默认值，无需再单独加 root（否则 swiss 会出现两次）
const themes = blocks.map((b) => toRnt(b.id, b.tokens));
const meta = [
  { id: 'swiss', name: '瑞士极简', desc: '白纸黑字 · 专业工具（默认）' },
  { id: 'brutal', name: '新粗野', desc: '黑边硬投影 · 荧光黄' },
  { id: 'clay', name: '柔和黏土', desc: '暖奶油 · 大圆角软弹' },
  { id: 'kawaii', name: '卡通粉', desc: '少女心 · 圆润可爱' },
  { id: 'mecha', name: '机甲 HUD', desc: '深色霓虹 · 切角科技感' },
  { id: 'midnight', name: '暗夜护眼', desc: '深色暖琥珀 · 关灯看' },
  { id: 'memphis', name: '孟菲斯 80s', desc: '多彩几何 · 潮流张扬' },
  { id: 'glass', name: '极光玻璃', desc: '浅色通透 · 毛玻璃层次' }
];
const swatch = { swiss: ['#F1F3F5', '#0F172A', '#047857', '#FFFFFF'], brutal: ['#F4F1EA', '#0A0A0A', '#FFE94A', '#2F6BFF'], clay: ['#F6EFE6', '#15803D', '#FDBCB4', '#6D5BD0'], kawaii: ['#FFF1F6', '#FF6FA5', '#8B5CF6', '#FFD1E3'], mecha: ['#070B12', '#00E5FF', '#FFB020', '#22E08A'], midnight: ['#0F172A', '#F0B44A', '#7C6BF5', '#4ADE80'], memphis: ['#FFFDF6', '#FF71CE', '#FFCE5C', '#86CCCA'], glass: ['#EAF2FF', '#1D4ED8', '#0E9F6E', '#FFC9DE'] };

const body = [
  '// 本文件由 scripts/build-rn-themes.mjs 从 packages/themes/tokens.css 生成 —— 不要手改。',
  '// 改主题请改 tokens.css，然后跑：node scripts/build-rn-themes.mjs',
  '',
  'export type ThemeId = ' + meta.map((m) => JSON.stringify(m.id)).join(' | ') + ';',
  'export type RnTokens = { colors: Record<string, string>; nums: Record<string, number>; misc: Record<string, unknown> };',
  'export type ThemeMeta = { id: ThemeId; name: string; desc: string; swatch: string[] };',
  '',
  'export const DEFAULT_THEME: ThemeId = "swiss";',
  '',
  'export const THEME_META: ThemeMeta[] = ' + JSON.stringify(meta.map((m) => ({ ...m, swatch: swatch[m.id] ?? [] })), null, 2) + ';',
  '',
  'export const THEMES: Record<ThemeId, RnTokens> = ' + JSON.stringify(Object.fromEntries(themes.map((t) => [t.id, { colors: t.colors, nums: t.nums, misc: t.misc }])), null, 2) + ';',
  ''
].join('\n');

if (process.argv.includes('--check')) {
  const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (existing.trim() !== body.trim()) {
    console.error('❌ ' + OUT + ' 与 tokens.css 不一致，跑 node scripts/build-rn-themes.mjs 重新生成');
    process.exit(1);
  }
  console.log('✅ 移动端主题令牌与 tokens.css 一致（' + themes.length + ' 套）');
} else {
  fs.mkdirSync('mobile/src/theme', { recursive: true });
  fs.writeFileSync(OUT, body, 'utf8');
  console.log('已生成 ' + OUT + '（' + themes.length + ' 套主题，' + Object.keys(themes[0].colors).length + ' 个颜色令牌）');
}
