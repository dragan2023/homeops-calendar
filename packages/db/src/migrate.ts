import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 迁移器：migrations/*.sql 按文件名排序执行，已执行的记在 schema_migrations 表里。 */
export function migrate(db: DatabaseSync, migrationsDir: string): string[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((r) => String((r as { name: string }).name)),
  );
  const ran: string[] = [];
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
      db.exec("COMMIT");
      ran.push(file);
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error("迁移失败 " + file + ": " + String(err));
    }
  }
  return ran;
}
