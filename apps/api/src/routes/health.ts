import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { nowIso } from "@homeops/db";

export function healthRoutes(app: FastifyInstance, db: DatabaseSync) {
  app.get("/healthz", async () => {
    let dbOk = false;
    let migrations = 0;
    try {
      const row = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
      migrations = Number(row.n);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return { ok: dbOk, service: "homeops-api", version: "0.1.0", time: nowIso(), db: dbOk ? "ok" : "error", migrations };
  });
}
