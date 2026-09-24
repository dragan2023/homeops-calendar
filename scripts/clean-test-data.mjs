// 清理验收脚本留下的测试数据痕迹（先备份，默认 dry-run）
//   node scripts/clean-test-data.mjs           预览（不动数据）
//   node scripts/clean-test-data.mjs --yes     真执行（先备份 data/backup-*.db）
// 做两件事：
//   ① 把物品/待办/清单/事件里形如 "M2-054277布洛芬"、"MOB-4059329移动端酸奶" 的测试前缀去掉 → "布洛芬"、"移动端酸奶"；
//   ② 前缀去掉后重名的物品合并成一个（批次/流水/待办/清单行都改挂到保留的那个），避免出现 5 个"布洛芬"。
import { copyFileSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.DB_PATH ?? "./data/homeops.db";
const apply = process.argv.includes("--yes");
const PREFIX = /^(MOB|VER|TEST|M[0-9]{1,2})-?[0-9]*/;
const strip = (name) => {
  const m = PREFIX.exec(name);
  if (!m) return null;
  const rest = name.slice(m[0].length).trim();
  return rest.length ? rest : null;
};

const db = new DatabaseSync(dbPath);
const stats = { itemsRenamed: 0, merged: 0, tasksFixed: 0, shoppingFixed: 0, eventsFixed: 0 };
const renames = [];
const merges = [];

if (apply) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  copyFileSync(dbPath, "./data/backup-before-clean-" + stamp + ".db");
  console.log("已备份到 ./data/backup-before-clean-" + stamp + ".db");
}

db.exec("BEGIN IMMEDIATE");
try {
  // ① 物品改名
  const items = db.prepare("SELECT id, name, base_unit, category_id, consumption_type, created_at, active FROM items WHERE active = 1 ORDER BY created_at").all();
  for (const it of items) {
    const clean = strip(it.name);
    if (clean && clean !== it.name) {
      db.prepare("UPDATE items SET name = ? WHERE id = ?").run(clean, it.id);
      renames.push(it.name + "  ->  " + clean);
      stats.itemsRenamed++;
    }
  }
  // ② 同名合并（保留最早的，其余软删除，引用改挂）
  const after = db.prepare("SELECT id, name, base_unit, category_id, consumption_type, created_at FROM items WHERE active = 1 ORDER BY created_at").all();
  const groups = new Map();
  for (const it of after) {
    const key = [it.name, it.base_unit, it.category_id ?? "", it.consumption_type].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const keep = list[0];
    for (const dup of list.slice(1)) {
      for (const table of ["stock_batches", "stock_transactions", "tasks", "shopping_list", "item_events"]) {
        db.prepare("UPDATE " + table + " SET item_id = ? WHERE item_id = ?").run(keep.id, dup.id);
      }
      db.prepare("UPDATE items SET active = 0 WHERE id = ?").run(dup.id);
      merges.push(keep.name + "（合并 " + list.length + " 条为 1）");
      stats.merged++;
    }
  }
  // 第二轮：同名同单位再合并（分类/消耗类型可能不同，比如一次入库建的是"未分类"、另一次是"乳品"），
  // 保留最早那条，并把重复项里非空的分类/消耗类型补到保留项上。
  const byNameUnit = new Map();
  for (const it of db.prepare("SELECT id, name, base_unit, category_id, consumption_type, created_at, expiry_warn_days FROM items WHERE active = 1 ORDER BY created_at").all()) {
    const key = it.name + "|" + it.base_unit;
    if (!byNameUnit.has(key)) byNameUnit.set(key, []);
    byNameUnit.get(key).push(it);
  }
  for (const [, list] of byNameUnit) {
    if (list.length < 2) continue;
    const keep = list[0];
    let category = keep.category_id;
    let consumption = keep.consumption_type;
    let warn = keep.expiry_warn_days;
    for (const dup of list.slice(1)) {
      if (!category && dup.category_id) category = dup.category_id;
      if (consumption === "consumable" && dup.consumption_type !== "consumable") consumption = dup.consumption_type;
      if (dup.expiry_warn_days > warn) warn = dup.expiry_warn_days;
      // 补货点取更保守的（更大的那个），避免合并后不再提醒
      db.prepare("UPDATE items SET reorder_point = MAX(reorder_point, (SELECT reorder_point FROM items WHERE id = ?)) WHERE id = ?").run(dup.id, keep.id);
      for (const table of ["stock_batches", "stock_transactions", "tasks", "shopping_list", "item_events"]) {
        db.prepare("UPDATE " + table + " SET item_id = ? WHERE item_id = ?").run(keep.id, dup.id);
      }
      db.prepare("UPDATE items SET active = 0 WHERE id = ?").run(dup.id);
      stats.merged++;
    }
    db.prepare("UPDATE items SET category_id = ?, consumption_type = ?, expiry_warn_days = ? WHERE id = ?").run(category, consumption, warn, keep.id);
    merges.push(keep.name + " · " + keep.base_unit + "（同名同单位合并为 1）");
  }

  // ③ 待办标题、清单名、事件名里的前缀
  for (const t of db.prepare("SELECT id, title, note FROM tasks").all()) {
    const cleanTitle = strip(t.title) ?? t.title;
    const cleanNote = t.note ? (strip(t.note) ?? t.note) : null;
    if (cleanTitle !== t.title || cleanNote !== t.note) {
      db.prepare("UPDATE tasks SET title = ?, note = ? WHERE id = ?").run(cleanTitle, cleanNote, t.id);
      stats.tasksFixed++;
    }
  }
  for (const s of db.prepare("SELECT id, name FROM shopping_list").all()) {
    const clean = strip(s.name);
    if (clean && clean !== s.name) { db.prepare("UPDATE shopping_list SET name = ? WHERE id = ?").run(clean, s.id); stats.shoppingFixed++; }
  }
  for (const e of db.prepare("SELECT id, item_name FROM item_events").all()) {
    const clean = strip(e.item_name);
    if (clean && clean !== e.item_name) { db.prepare("UPDATE item_events SET item_name = ? WHERE id = ?").run(clean, e.id); stats.eventsFixed++; }
  }
  if (apply) db.exec("COMMIT"); else db.exec("ROLLBACK");
} catch (err) {
  db.exec("ROLLBACK");
  console.error("失败已回滚：" + String(err));
  process.exit(1);
}

console.log((apply ? "【已执行】" : "【预览，未改动数据】") + " " + dbPath);
console.log("物品改名 " + stats.itemsRenamed + " 条，示例：" + renames.slice(0, 5).join(" / "));
console.log("重复物品合并 " + stats.merged + " 条，示例：" + merges.slice(0, 5).join(" / "));
console.log("待办标题修正 " + stats.tasksFixed + " 条；清单 " + stats.shoppingFixed + " 条；事件 " + stats.eventsFixed + " 条");
const left = db.prepare("SELECT name FROM items WHERE active = 1 AND (name GLOB 'M[0-9]*' OR name GLOB 'MOB*' OR name GLOB 'VER*') LIMIT 5").all().map((r) => r.name);
console.log("残留疑似测试名：" + (left.length ? left.join(", ") : "无"));
if (!apply) console.log("\n要真的执行：node scripts/clean-test-data.mjs --yes（会先自动备份）");
db.close();
