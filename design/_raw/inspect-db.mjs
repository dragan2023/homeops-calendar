import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';
const p = './data/homeops.db';
console.log('数据库文件:', p, existsSync(p) ? '(' + statSync(p).size + ' 字节)' : '❌ 不存在');
const db = new DatabaseSync(p);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
console.log('\n表(' + tables.length + '):', tables.join(', '));
console.log('\n迁移:', JSON.stringify(db.prepare('SELECT name, applied_at FROM schema_migrations ORDER BY name').all()));
console.log('\nhomes:', JSON.stringify(db.prepare('SELECT id, name, timezone, created_at FROM homes').all(), null, 1));
console.log('\nusers（账号）:', JSON.stringify(db.prepare('SELECT username, role, created_at, substr(password_hash,1,12) AS hash_head FROM users').all(), null, 1));
console.log('\n各表行数:');
for (const t of ['users','homes','locations','item_categories','items','stock_batches','stock_transactions','tasks','task_templates','shopping_list','api_tokens','sessions','item_events']) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n;
  console.log('  ' + t.padEnd(20) + n);
}
db.close();
