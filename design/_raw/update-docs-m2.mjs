import fs from 'node:fs';

// --- AGENTS.md：补验收脚本 + 新增两条坑 ---
const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
const oldScripts = 'node scripts/verify-m1.mjs      # M1：建物品→入库→领用(FEFO)→调拨→盘点→幂等→超量拒绝';
const newScripts = oldScripts + '\nnode scripts/verify-m2.mjs      # M2：周期家务展开/临期联动/缺货买+换/对账幂等/来源消失自动关闭/日历四类事件';
if (a.includes(oldScripts) && !a.includes('verify-m2')) { a = a.replace(oldScripts, newScripts); console.log('AGENTS: 脚本清单已补 verify-m2'); }
else console.log('AGENTS: 脚本清单跳过');

const extra = [
  '',
  '5. **`tasks` 的来源唯一索引会挡住手工待办**（2026-09-21 实测）：索引是 `(home_id, kind, IFNULL(source_type,\'\'), IFNULL(source_id,\'\'), IFNULL(due_date,\'\'))`。',
  '   手工新增的待办若 `source_type=\'manual\' / source_id=NULL`，同一天建第二条同名待办就撞唯一索引直接 500。',
  '   判据：**手工待办的 `source_id` 必须写自己的 id**（每次唯一）。守卫：`verify-m2.mjs` 第 19 项（同一天建两条同名手工待办）。',
  '6. **"今日待办"不能直接用范围查询**（2026-09-21）：`listTasks({to})` 用 `IFNULL(due_date,\'9999-99-99\') <= to` 过滤，会把**没有截止日的积压待办**（缺货联动生成的"买/换"）全部排掉——而它们恰恰是"今天该做"的主力。',
  '   判据：今日视图单独用 `due_date IS NULL OR due_date <= today` 查询；范围查询只用于日历。守卫：`verify-m2.mjs` 第 17 项。',
  '7. **验收脚本必须自带数据、可反复跑**（2026-09-21）：早期版本依赖"默认周期模板还会展开"，而 `syncTasks` 会把模板的 `next_due_date` 推进到滚动窗口之外，第二次跑就断言失败——**那是测试的错，不是产品的错**。',
  '   判据：断言只针对本脚本新建的、带时间戳前缀的数据；不假定库里已有状态。',
  ''
].join('\n');
fs.appendFileSync(ap, extra, 'utf8');
console.log('AGENTS: 已追加坑 5/6/7');

// --- 决策记录：M2 完成 ---
const dp = 'docs/决策记录.md';
let d = fs.readFileSync(dp, 'utf8');
const row = '| M2 日历 + 待办 | ⏳ | — |';
if (d.includes(row)) {
  d = d.replace(row, '| M2 日历 + 待办 | ✅ 已通过 | `node scripts/verify-m2.mjs` 20 项全 PASS、exit=0：周期家务按模板展开(5 次)/临期联动/缺货联动(买+换)/重复 sync 零新增/批次清空与补货后自动关闭/日历四类事件齐全/今日视图含无截止日积压 |');
  console.log('决策记录: M2 已标完成');
} else console.log('决策记录: M2 行未找到');
fs.writeFileSync(dp, d, 'utf8');
