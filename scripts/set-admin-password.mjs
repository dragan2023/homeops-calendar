// 直接改本地数据库里的账号密码（scrypt 加盐，与后端 auth.ts 同算法）
// 用途：验收脚本建了 admin（密码是文档里的开发密码），你想用自己的密码登录时改一下即可，不用清库。
//   node scripts/set-admin-password.mjs <用户名> <新密码>
import { randomBytes, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 6) {
  console.error("用法: node scripts/set-admin-password.mjs <用户名> <新密码（≥6 位）>");
  process.exit(2);
}
const dbPath = process.env.DB_PATH ?? "./data/homeops.db";
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
if (!row) {
  console.error("❌ 没有这个账号：" + username + "（现有账号：" + db.prepare("SELECT username FROM users").all().map((r) => r.username).join(", ") + "）");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");
db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, row.id);
// 顺手把旧会话清掉：改密码后旧登录态立即失效
const sessions = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
db.close();
console.log("✅ 已重设账号 " + username + " 的密码（" + dbPath + "），并注销了 " + Number(sessions.changes) + " 个旧会话。");
console.log("   现在可以在 App 里用 用户名 " + username + " + 你刚设的密码 登录。");
