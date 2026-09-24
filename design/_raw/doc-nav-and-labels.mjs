import fs from 'node:fs';
const P = "\n14. **深色底栏主题下，前景色不能沿用 text 令牌**（2026-09-21，用户真机截图发现「新粗野主题底栏选中项文字消失」）：新粗野的 `--nav-bg` 是纯黑 `#0A0A0A`，而 `--text` 也是 `#0A0A0A` → 黑底黑字。移动端 tabBar 直接用 `c.text` 当选中色，正好踩中。\n    判据：**底栏前景必须用专门的 `--nav-fg` / `--nav-fg-active` 令牌**（9 个块都要有），组件不许用 text 当底栏前景。守卫：对比度守卫新增 `nav-fg/nav-bg`、`nav-fg-active/nav-bg` 两组配对（rgba 底色先与页面底色合成再算），要求 ≥4.5；新粗野现在 11.96 / 16.03。\n\n15. **界面里不许把内部枚举/字段值直接渲染出来**（2026-09-21，用户要求把残留的字段名、数据表名隐去）：实际泄漏过的有 `t.kind`（chore/linked/expiry）、`source_type`（batch/item/template/manual）、`shopping.source`（auto-low）、流水 `type`（receipt/issue/adjust）、`batch_no`、SKU、FEFO 这类术语，以及主题面板里的开发说明。\n    判据：渲染前一律过映射表（KIND_LABEL / SOURCE_LABEL / TX_LABEL）翻成中文业务词；开发说明不进 UI。守卫：`cd mobile && npm test` 里有 3 条用例直接扫渲染输出，出现禁用词即失败（auto-low / source_type / SKU- / batch_no / chore / linked / receipt / issue / adjust …）。\n";
const NOTE = "> 令牌契约：核心 42 项 + 底栏前景 2 项（--nav-fg / --nav-fg-active）+ 装饰若干，当前共 52 个；每套主题都要填满（守卫会查）。";
const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
if (!a.includes('前景色不能沿用 text 令牌')) { fs.writeFileSync(ap, a + P, 'utf8'); console.log('AGENTS: 已加坑 14/15'); }
const tp = 'design/THEMES.md';
let t = fs.readFileSync(tp, 'utf8');
if (!t.includes('nav-fg')) {
  t = t.replace('## 三、8 套主题', NOTE + '\n\n## 三、8 套主题');
  fs.writeFileSync(tp, t, 'utf8');
  console.log('THEMES.md: 已补令牌数量与底栏前景说明');
}
