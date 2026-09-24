import fs from 'node:fs';
const F1 = String.fromCharCode(96);
const F3 = F1 + F1 + F1;
const dp = 'docs/决策记录.md';
let d = fs.readFileSync(dp, 'utf8');
const rows = [
  ['| 前端 React+Vite+PWA | ⏳ | — |', '| 前端 React+Vite+PWA | ✅ 已通过 | `tsc --noEmit` 0 错；`vite build` 出 dist（JS 248KB / gzip 78KB、CSS 22.7KB）+ manifest + service worker；`vite preview` 冒烟：/ 200、/manifest.webmanifest 200、/icon.svg 200、/sw.js 200、/healthz 200（代理通）、/api/me 401（会话生效）；8 套主题可切、默认瑞士极简 |'],
  ['| M4 提醒 + 验收 | ⏳ | — |', '| M4 提醒 + 验收 | ✅ 已通过 | 本地 PWA 通知（每天最多 1 条，可手动测试）；' + F1 + 'node scripts/verify-all.mjs' + F1 + ' 全链路 7/7 通过 |'],
];
let n = 0;
for (const [a, b] of rows) { if (d.includes(a)) { d = d.replace(a, b); n++; } }
if (!d.includes('### 前端怎么跑')) {
  d += '\n\n### 前端怎么跑\n' + F3 + 'bash\npnpm -F @homeops/web dev      # http://127.0.0.1:5173（代理到 8787）\npnpm -F @homeops/web build    # PWA 产物\nnode scripts/verify-all.mjs   # 全链路回归（自动起服务）\n' + F3 + '\n详见 docs/前端说明.md。\n';
}
fs.writeFileSync(dp, d, 'utf8');
console.log('决策记录更新 ' + n + ' 行');

const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
const anchor = 'node design/_raw/check-theme-contrast.mjs   # 主题令牌覆盖 + 对比度';
if (a.includes(anchor) && !a.includes('verify-all.mjs')) {
  a = a.replace(anchor, [anchor, 'node scripts/verify-all.mjs     # 全链路回归（自动起服务，跑上面全部 + 前端令牌守卫）', 'node scripts/check-web-tokens.mjs          # 前端 CSS 零字面色值 + 每套主题令牌齐全', 'node scripts/sync-theme-tokens.mjs --check # 原型 HTML 与 packages/themes/tokens.css 是否一致'].join('\n'));
  a += ['', '8. **验收脚本之间会共用同一个数据库**（2026-09-21）：M0 的 smoke 原本断言“分类=9、模板=2”这种**精确数量**，被 M2 脚本新增的模板一带就失败——测试互相污染。', '   判据：**跨脚本共享状态时只断言存在性/下界**（≥N、含某个名字），精确数量只用于脚本自建的数据。守卫：`node scripts/verify-all.mjs` 一次跑完全部脚本必须 7/7。', ''].join('\n');
  fs.writeFileSync(ap, a, 'utf8');
  console.log('AGENTS 已补 verify-all 与坑 8');
}
