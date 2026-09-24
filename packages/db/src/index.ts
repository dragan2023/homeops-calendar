import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "./migrate.ts";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export function openDb(filename: string): DatabaseSync {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  return db;
}

export function openAndMigrate(filename: string): { db: DatabaseSync; ran: string[] } {
  const db = openDb(filename);
  const ran = migrate(db, MIGRATIONS_DIR);
  return { db, ran };
}

export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => crypto.randomUUID();
export const todayIso = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

export { migrate };
