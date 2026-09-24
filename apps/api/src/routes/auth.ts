import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { loginSchema, setupSchema } from "@homeops/contracts";
import { nowIso } from "@homeops/db";
import { bootstrapHome } from "../bootstrap.ts";
import { createApiToken, createSession, deleteSession, readApiToken, readSession, verifyPassword, type SessionUser } from "../auth.ts";
import type { Config } from "../config.ts";

export type AuthedRequest = FastifyRequest & { user?: SessionUser };

export function makeRequireAuth(db: DatabaseSync, config: Config) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const bearer = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const user = bearer
      ? readApiToken(db, bearer)
      : readSession(db, String(request.cookies?.[config.cookieName] ?? ""));
    if (!user) {
      reply.code(401).send({ ok: false, error: "unauthorized" });
      return reply;
    }
    (request as AuthedRequest).user = user;
    return undefined;
  };
}

export function authRoutes(app: FastifyInstance, db: DatabaseSync, config: Config, requireAuth: ReturnType<typeof makeRequireAuth>) {
  app.post("/api/setup", async (request, reply) => {
    const parsed = setupSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", detail: parsed.error.issues });
    const input = { ...parsed.data, homeName: parsed.data.homeName || config.homeName };
    const result = bootstrapHome(db, input);
    if (!result.ok) return reply.code(409).send({ ok: false, error: "already_initialized", hint: "已有账号，请直接登录" });
    const session = createSession(db, result.userId, result.homeId, config.sessionDays);
    reply.setCookie(config.cookieName, session.id, {
      path: "/", httpOnly: true, sameSite: "lax", expires: new Date(session.expiresAt),
    });
    const issued = parsed.data.issueToken ? createApiToken(db, result.userId, result.homeId, "移动端首启") : null;
    return { ok: true, homeId: result.homeId, userId: result.userId, username: input.username, ...(issued ? { token: issued.token, token_prefix: issued.token_prefix } : {}) };
  });

  app.post("/api/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body" });
    const row = db
      .prepare("SELECT id, password_hash, password_salt FROM users WHERE username = ?")
      .get(parsed.data.username) as { id: string; password_hash: string; password_salt: string } | undefined;
    if (!row || !verifyPassword(parsed.data.password, row.password_salt, row.password_hash)) {
      return reply.code(401).send({ ok: false, error: "bad_credentials" });
    }
    const home = db.prepare("SELECT id FROM homes WHERE active = 1 LIMIT 1").get() as { id: string } | undefined;
    const session = createSession(db, row.id, home?.id ?? null, config.sessionDays);
    reply.setCookie(config.cookieName, session.id, {
      path: "/", httpOnly: true, sameSite: "lax", expires: new Date(session.expiresAt),
    });
    const issued = parsed.data.issueToken ? createApiToken(db, row.id, home?.id ?? null as never, parsed.data.tokenName ?? "移动端") : null;
    return { ok: true, username: parsed.data.username, expiresAt: session.expiresAt, ...(issued ? { token: issued.token, token_prefix: issued.token_prefix } : {}) };
  });

  app.post("/api/logout", async (request, reply) => {
    const sid = String(request.cookies?.[config.cookieName] ?? "");
    if (sid) deleteSession(db, sid);
    reply.clearCookie(config.cookieName, { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", { preHandler: requireAuth }, async (request) => {
    const user = (request as AuthedRequest).user!;
    return { ok: true, user: { username: user.username, homeId: user.homeId, homeName: user.homeName } };
  });

  app.get("/api/meta", { preHandler: requireAuth }, async (request) => {
    const user = (request as AuthedRequest).user!;
    const homeId = user.homeId;
    const count = (table: string) =>
      Number((db.prepare("SELECT COUNT(*) AS n FROM " + table + " WHERE home_id = ?").get(homeId) as { n: number }).n);
    const locations = db
      .prepare("SELECT id, name, kind, sort_order FROM locations WHERE home_id = ? AND active = 1 ORDER BY sort_order")
      .all(homeId);
    const categories = db
      .prepare("SELECT id, name FROM item_categories WHERE home_id = ? AND active = 1 ORDER BY sort_order")
      .all(homeId);
    const templates = db
      .prepare("SELECT id, title, cycle_rule, next_due_date FROM task_templates WHERE home_id = ? AND active = 1")
      .all(homeId);
    return {
      ok: true,
      home: { id: homeId, name: user.homeName },
      counts: { items: count("items"), batches: count("stock_batches"), tasks: count("tasks"), shopping: count("shopping_list") },
      locations, categories, templates, serverTime: nowIso(),
    };
  });
}
