import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";

/**
 * 公开（不需要登录）：告诉客户端这台服务器"是否已经初始化"。
 * App 首次打开就靠它决定显示「初始化」还是「登录」，避免出现"上来就让你登录、但你根本没有账号"。
 */
export function setupStatusRoutes(app: FastifyInstance, db: DatabaseSync) {
  app.get("/api/setup-status", async () => {
    const user = db.prepare("SELECT username FROM users ORDER BY created_at LIMIT 1").get() as { username: string } | undefined;
    const home = db.prepare("SELECT id, name FROM homes WHERE active = 1 ORDER BY created_at LIMIT 1").get() as { id: string; name: string } | undefined;
    const count = (t: string) => Number((db.prepare("SELECT COUNT(*) AS n FROM " + t).get() as { n: number }).n);
    return {
      ok: true,
      initialized: !!user,
      homeName: home?.name ?? null,
      username: user?.username ?? null,
      counts: user ? { items: count("items"), tasks: count("tasks"), shopping: count("shopping_list") } : null,
      serverTime: new Date().toISOString(),
    };
  });
}
