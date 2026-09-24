import fs from 'node:fs';
const ROW = "| 移动端（Expo 真机） | ✅ 已通过 | `npx tsc --noEmit` 0 错；`npx expo export --platform android` 打包成功（853 modules → 2MB Hermes bundle，exit=0）；`verify-mobile-api.mjs` 14 项全 PASS（登录签发 Bearer Token → me/meta/today/items/levels/入库/FEFO领用/待办/清单/同一 Token 调 MCP）；手机端主题令牌由 tokens.css 生成，`build-rn-themes.mjs --check` 通过 |";
const SECTION = "\n### 移动端（Expo）怎么在手机上跑\n详见 `docs/移动端测试.md`（含测试用例表与排障）。三条命令：\n```bash\n$env:HOST=\"0.0.0.0\"; node apps/api/src/server.ts   # 后端必须监听 0.0.0.0，手机才连得上\nstart_mobile.bat                                   # Metro(8081) + Expo Go 扫码\n```\n- 应用目录 `mobile/`：独立 npm 工程（不参与根 pnpm workspace）。\n- 后端地址自动推导：取 Metro 的 IP、端口换成 app.json 的 extra.apiPort(8787)，无需改代码；隧道/远程后端用 `EXPO_PUBLIC_API_URL` 覆盖。\n- 手机端认证走 Bearer Token（后端 `/api/login` 支持 `issueToken: true`），因为 React Native 没有浏览器 cookie jar。\n- 主题：`packages/themes/tokens.css` → `mobile/src/theme/generated.ts`，8 套主题在 App 内可切换（待办页顶部）。\n";
const THEMES_OLD = "| `design/_raw/check-ids.mjs` | JS 里 `$('#id')` 引用的 id 是否都真实存在于 HTML |";
const THEMES_NEW = "| `design/_raw/check-ids.mjs` | JS 里 `$('#id')` 引用的 id 是否都真实存在于 HTML |\n| `scripts/build-rn-themes.mjs --check` | 移动端（React Native）主题令牌是否与 `packages/themes/tokens.css` 一致（生成物 `mobile/src/theme/generated.ts`，不要手改） |";
const THEMES_SECTION = "\n## 八、三端一致性（同一份令牌）\n\n| 端 | 消费方式 | 守卫 |\n| --- | --- | --- |\n| 静态原型 | 内联 `<style>` 里的 `html[data-theme]` 块 | `scripts/sync-theme-tokens.mjs --check` |\n| Web（React+Vite） | `var(--token)` CSS 变量 | `scripts/check-web-tokens.mjs`（CSS 零字面色值 + 每套主题令牌齐全） |\n| 移动端（Expo/RN） | 生成 TS 对象 `mobile/src/theme/generated.ts` | `scripts/build-rn-themes.mjs --check` |\n\n> 改主题只改 `packages/themes/tokens.css`，然后三个守卫都要跑过。RN 端把 px 转数字、把 \"Npx Npx 0 色\" 形态的硬投影转成 RN 阴影/海拔，属于**近似映射**（CSS 阴影语法无法 100% 还原），已在生成器注释里写明。\n";

const dp = 'docs/决策记录.md';
let d = fs.readFileSync(dp, 'utf8');
if (!d.includes('移动端（Expo 真机）')) {
  const lines = d.split('\n');
  const idx = lines.findIndex((l) => l.includes('| M4 端到端验收 |'));
  if (idx >= 0) lines.splice(idx + 1, 0, ROW);
  d = lines.join('\n') + SECTION;
  fs.writeFileSync(dp, d, 'utf8');
  console.log('决策记录：已补移动端');
} else console.log('决策记录：已有移动端条目');

const tp = 'design/THEMES.md';
let t = fs.readFileSync(tp, 'utf8');
if (!t.includes('build-rn-themes.mjs')) {
  if (t.includes(THEMES_OLD)) t = t.replace(THEMES_OLD, THEMES_NEW);
  else console.log('THEMES.md 守卫表锚点未匹配（仍会补第八节）');
  t = t + THEMES_SECTION;
  fs.writeFileSync(tp, t, 'utf8');
  console.log('THEMES.md：已补三端一致性');
} else console.log('THEMES.md：已有移动端守卫');
