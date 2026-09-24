// 清空本地数据库（先把旧库备份到 data/backup-<时间>.db，再删除），让 App 回到"首次初始化"
//   node scripts/reset-db.mjs            只预览要做什么（安全，不动文件）
//   node scripts/reset-db.mjs --yes      真的执行
import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.DB_PATH ?? "./data/homeops.db";
const yes = process.argv.includes("--yes");
if (!existsSync(dbPath)) {
  console.log("数据库不存在（" + dbPath + "），无需清理。");
  process.exit(0);
}
const db = new DatabaseSync(dbPath);
const counts = {};
for (const t of ["users", "items", "stock_batches", "tasks", "shopping_list"]) {
  try { counts[t] = Number(db.prepare("SELECT COUNT(*) AS n FROM " + t).get().n); } catch { counts[t] = "-"; }
}
db.close();
console.log("当前库：" + dbPath + "（" + statSync(dbPath).size + " 字节）");
console.log("内容：", JSON.stringify(counts));
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backup = "./data/backup-" + stamp + ".db";
if (!yes) {
  console.log("\n[dry-run] 会执行：备份到 " + backup + "，然后删除 " + dbPath + "（含 -wal/-shm），");
  console.log("          之后重启后端，App 打开就会显示「首次初始化」，由你自己创建家庭+管理员账号。");
  console.log("要真的执行请加 --yes（或双击 reset_db.bat）。");
  process.exit(0);
}
copyFileSync(dbPath, backup);
for (const suffix of ["", "-wal", "-shm"]) if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
const backups = readdirSync("./data").filter((f) => f.startsWith("backup-")).sort();
console.log("✅ 已备份到 " + backup + " 并清空数据库。");
console.log("   备份数量：" + backups.length + "（最近的：" + backups.slice(-3).join(", ") + "）");
console.log("   下一步：重启后端（start_backend.bat），App 里点「第一次使用，去初始化」。");
