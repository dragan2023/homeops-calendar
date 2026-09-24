import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { newId, nowIso } from "@homeops/db";

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSession(db: DatabaseSync, userId: string, homeId: string | null, days: number) {
  const id = newId();
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, home_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, userId, homeId, expiresAt, nowIso());
  return { id, expiresAt };
}

export type SessionUser = { sessionId: string; userId: string; username: string; homeId: string | null; homeName: string | null };

export function readSession(db: DatabaseSync, sessionId: string): SessionUser | null {
  const row = db
    .prepare(
      "SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.username, h.id AS home_id, h.name AS home_name " +
        "FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN homes h ON h.id = s.home_id WHERE s.id = ?",
    )
    .get(sessionId) as Record<string, unknown> | undefined;
  if (!row) return null;
  if (String(row.expires_at) < nowIso()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }
  return {
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    username: String(row.username),
    homeId: row.home_id ? String(row.home_id) : null,
    homeName: row.home_name ? String(row.home_name) : null,
  };
}

export function deleteSession(db: DatabaseSync, sessionId: string) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

/** MCP 用：家庭级 Token 只存哈希 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createApiToken(db: DatabaseSync, userId: string, homeId: string, name: string) {
  const raw = "hpx_" + randomBytes(24).toString("base64url");
  const id = newId();
  db.prepare(
    "INSERT INTO api_tokens (id, user_id, home_id, name, token_hash, token_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, userId, homeId, name, hashToken(raw), raw.slice(0, 12), nowIso());
  return { id, token: raw, token_prefix: raw.slice(0, 12) };
}

export function readApiToken(db: DatabaseSync, rawToken: string): SessionUser | null {
  const row = db
    .prepare(
      "SELECT t.id, t.user_id, t.home_id, u.username, h.name AS home_name FROM api_tokens t " +
        "JOIN users u ON u.id = t.user_id LEFT JOIN homes h ON h.id = t.home_id " +
        "WHERE t.token_hash = ? AND t.revoked_at IS NULL",
    )
    .get(hashToken(rawToken)) as Record<string, unknown> | undefined;
  if (!row) return null;
  db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), String(row.id));
  return {
    sessionId: "token:" + String(row.id),
    userId: String(row.user_id),
    username: String(row.username),
    homeId: row.home_id ? String(row.home_id) : null,
    homeName: row.home_name ? String(row.home_name) : null,
  };
}
