import fs from 'node:fs';
const PITFALL = "\n11. **我这个会话里的后台服务会在回合之间被回收**（2026-09-21 实测）：每个 `run_in_background` 起的 `node apps/api/src/server.ts` 最终状态都是 `killed before exit`（pwsh-3..26 全如此）。\n    后果：跟用户说\"后端在跑，你去手机上试\"是不可靠的——他去试的时候进程可能已经没了（这也是他前两次真机连不上的原因之一，另一个原因是旧进程占着 127.0.0.1）。\n    判据：**验证用一次性进程**（脚本自己 spawn + 结束，如 verify-all/verify-m4）；**给用户长期跑的服务必须在他自己的窗口里**（start_backend.bat / npm start）。\n\n12. **RN 主题生成器里 key 与 kebab 键混用导致静默覆盖**（2026-09-21，移动端单测抓到）：判断写的是 `key === 'label-tracking'`，但 `key` 已经是 camelCase（`labelTracking`）→ 条件永不成立，`--label-tracking` 与 `--label-transform` 都写进同一个字段、后者覆盖前者。\n    判据：生成器里判断原始令牌时一律用 kebab 名（`k`），派生 camelCase 只用于输出键。守卫：`cd mobile && npm test`（theme.test.ts 逐令牌断言）。\n";
const BT = String.fromCharCode(96);

// 1) 根 package.json 增加移动端测试入口
const pj = 'package.json';
const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
j.scripts['test:mobile'] = 'npm --prefix mobile test';
fs.writeFileSync(pj, JSON.stringify(j, null, 2) + '\n', 'utf8');

// 2) AGENTS：脚本清单补移动端测试；追加坑 11/12
const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
const anchor = 'node scripts/build-rn-themes.mjs --check  # 移动端主题令牌与 packages/themes/tokens.css 是否一致';
if (a.includes(anchor) && !a.includes('test:mobile')) {
  a = a.replace(anchor, anchor + '\n' + 'npm run test:mobile                       # 移动端组件/交互/主题单测（jest-expo + @testing-library/react-native，17 项）');
}
if (!a.includes('会被回收')) a += PITFALL;
fs.writeFileSync(ap, a, 'utf8');
console.log('AGENTS/package.json 已更新');
