import fs from 'node:fs';
const PITFALL = "\n13. **验收脚本跑在用户真实数据库上 = 直接毁掉他的账号体验**（2026-09-21，用户真机第一次打开就撞）：M0 的 smoke 通过 `POST /api/setup` 在 `data/homeops.db` 里建了一个 `admin` 账号，密码是我在文档里定的 `SMOKE_PASS 提供的口令`。结果：用户打开 App 看到的是「登录」（他从没建过账号），点「初始化」又被 409 挡回（我的测试账号已占位），他永远进不去。\n    判据：**所有验收脚本必须跑在临时库 + 随机端口**（`DB_PATH=./data/_verify-<pid>.db`），跑完删掉；真实库只允许由用户自己初始化。守卫：`scripts/verify-all.mjs` 现在自带隔离实例（输出会打印「隔离运行：端口 …，临时库 …」）。\n    配套：客户端要先问 `GET /api/setup-status`（公开）决定显示「初始化」还是「登录」；忘记密码有 `set_password.bat`（改哈希，不需要原密码），要重来有 `reset_db.bat`（备份+清库）。\n";
const DOCS = "\n## 九、账号体系（谁建、密码是什么、忘了怎么办）\n\n| 问题 | 事实 |\n| --- | --- |\n| 用户系统 | 有：`users` / `sessions` / `api_tokens` 三张表；密码 scrypt 加盐，Token 只存 SHA-256 哈希 |\n| 账号从哪来 | **由第一次初始化创建**（App 首页填家庭名+用户名+密码 → 你就是管理员）；后端不预置任何账号 |\n| 现在库里有什么 | 验收脚本建的 `admin`（密码曾是我定的开发密码 `SMOKE_PASS 提供的口令`）—— 历史遗留，见 AGENTS 坑 13 |\n| App 怎么知道显示哪个 | 打开时先请求公开接口 `GET /api/setup-status`：没账号→初始化表单；有账号→登录表单并显示现有账号名 |\n| 忘记密码 | 电脑上双击 `set_password.bat`（输入用户名+新密码即可，不需要原密码；会同时注销旧会话） |\n| 想彻底重来 | 双击 `reset_db.bat`（先把旧库备份成 `data/backup-<时间>.db` 再清空，然后重启后端 → App 回到首次初始化） |\n";
const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
if (!a.includes('毁掉他的账号体验')) { fs.writeFileSync(ap, a + PITFALL, 'utf8'); console.log('AGENTS: 已加坑 13'); }
const tp = 'docs/移动端测试.md';
let t = fs.readFileSync(tp, 'utf8');
if (!t.includes('账号体系')) { fs.writeFileSync(tp, t + DOCS, 'utf8'); console.log('移动端文档: 已加账号体系'); }
const vp = 'scripts/verify-all.mjs';
let v = fs.readFileSync(vp, 'utf8');
if (!v.includes('build-rn-themes.mjs')) {
  v = v.replace('  ["原型令牌同步检查", ["scripts/sync-theme-tokens.mjs", "--check"]],',
    '  ["原型令牌同步检查", ["scripts/sync-theme-tokens.mjs", "--check"]],\n  ["移动端主题令牌检查", ["scripts/build-rn-themes.mjs", "--check"]],');
  fs.writeFileSync(vp, v, 'utf8');
  console.log('verify-all: 步骤表已补移动端令牌检查');
}
