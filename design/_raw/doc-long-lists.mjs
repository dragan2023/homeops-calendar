import fs from 'node:fs';
const SECTION = "\n## 六、长列表规则（数据变多以后主页面不能被淹没）\n\n**主页面上的任何列表都不许全量渲染**：只放前 N 条，超出部分用「显示全部 X 条 →」进入该门类自己的整屏页面（整屏里带返回、标题、条数，可选搜索）。\n\n- 阈值（当前）：今日·赏味期限 4 条 / 今日·该补货了 4 条 / 待办·要买的 3 条 / 待办·今天到期 4 条 / 待办·接下来 4 条 / 库存 12 条。\n- 组件（两端各一份，行为一致）：`mobile/src/components/CollapsibleList.tsx`、`apps/web/src/components/Collapsible.tsx`。\n- 后端按**批次**返回临期数据，同一物品同一到期日会有多行 → 展示前必须按 `item_id + expiry_date` 合并成一行并累加数量（今日页的 `groupExpiring()`），否则用户看到的是「布洛芬 12 片」刷屏。\n- 守卫：`cd mobile && npm test` 有三条用例直接测这个行为（3 个批次合并成「36 片」、9 条只显示 4 条且点「显示全部」后才出现第 6 条、40 项库存只先显示 12 条）。\n";
const p = 'AGENTS.md';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('长列表规则')) { fs.writeFileSync(p, s + SECTION, 'utf8'); console.log('AGENTS: 已加长列表规则'); }
else console.log('已有该节');
