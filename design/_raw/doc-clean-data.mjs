import fs from 'node:fs';
const P = "\n16. **测试数据会被用户当成产品数据看见**（2026-09-21，用户第二次抱怨：「M2-054277布洛芬」这种前缀还在）：验收脚本用 `tag + '-' + Date.now()` 当物品名前缀，跑完就把 101 个带前缀的假物品留在真实库里，合并前还出现 10 条同名「黄瓜」。\n    判据：①验收脚本只在临时库跑（坑 13 的隔离 + 本次新增的闸门：不显式给 `BASE` 就 `exit 2` 拒绝运行）；②万一已经污染，`node scripts/clean-test-data.mjs --yes`（先自动备份）能去掉前缀并把同名同单位的重复物品合并成一条（批次/流水/待办/清单一起改挂）。\n    守卫：清理脚本自身会打印「残留疑似测试名：无」；`design/_raw/verify-clean.mjs` 可复核（打印活动物品、重复名字、前缀残留计数）。\n";
const D = "\n## 十、清掉测试数据（万一列表里出现 M2-054277 这种东西）\n\n```bash\nnode scripts/clean-test-data.mjs          # 预览：会改哪些名字、合并哪些重复物品\nnode scripts/clean-test-data.mjs --yes    # 真执行（先自动备份 data/backup-before-clean-<时间>.db）\n```\n\n- 它做两件事：①去掉物品/待办/清单/事件名里的测试前缀（`M2-054277布洛芬` → `布洛芬`）；②把同名同单位的重复物品合并成一条（批次、流水、待办、清单行全部改挂到保留的那条，重复的软删除）。\n- 再狠一点：双击 `reset_db.bat`（备份+清空，回到首次初始化）→ 用你自己的账号重建一个干净的家。\n- 为什么会出现：验收脚本早先跑在你的真实库上（见 AGENTS 坑 13）；现在脚本不显式指定 `BASE` 会直接拒绝运行，全链路回归 `verify-all.mjs` 自带临时库。\n";
const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
if (!a.includes('测试数据会被用户当成产品数据看见')) { fs.writeFileSync(ap, a + P, 'utf8'); console.log('AGENTS: 坑 16 已加'); }
const tp = 'docs/移动端测试.md';
let t = fs.readFileSync(tp, 'utf8');
if (!t.includes('清掉测试数据')) { fs.writeFileSync(tp, t + D, 'utf8'); console.log('移动端文档: 已加清理说明'); }
const vp = 'scripts/verify-all.mjs';
let v = fs.readFileSync(vp, 'utf8');
if (!v.includes('clean-test-data')) { console.log('verify-all 无需改（本来就隔离）'); }
