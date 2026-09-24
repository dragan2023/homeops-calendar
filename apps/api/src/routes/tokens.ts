import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { nowIso } from "@homeops/db";
import { createApiToken } from "../auth.ts";
import type { AuthedRequest } from "./auth.ts";

const tokenSchema = z.object({ name: z.string().min(1).max(60).default("MCP 客户端") });

export function tokenRoutes(app: FastifyInstance, db: DatabaseSync, requireAuth: unknown) {
  const auth = requireAuth as never;

  app.get("/api/tokens", { preHandler: auth }, async (request) => {
    const user = (request as AuthedRequest).user!;
    const rows = db
      .prepare("SELECT id, name, token_prefix, created_at, last_used_at, revoked_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC")
      .all(user.userId);
    return { ok: true, tokens: rows };
  });

  app.post("/api/tokens", { preHandler: auth }, async (request, reply) => {
    const user = (request as AuthedRequest).user!;
    if (!user.homeId) return reply.code(400).send({ ok: false, error: "no_home" });
    const parsed = tokenSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    const created = createApiToken(db, user.userId, user.homeId, parsed.data.name);
    return { ok: true, ...created, note: "这个 token 只显示一次，请立刻保存；服务端只存哈希。" };
  });

  app.delete("/api/tokens/:id", { preHandler: auth }, async (request, reply) => {
    const user = (request as AuthedRequest).user!;
    const { id } = request.params as { id: string };
    const info = db.prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
      .run(nowIso(), id, user.userId);
    if (Number(info.changes) === 0) return reply.code(404).send({ ok: false, error: "token_not_found" });
    return { ok: true };
  });
}
