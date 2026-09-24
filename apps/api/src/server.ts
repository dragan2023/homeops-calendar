import { networkInterfaces } from "node:os";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { openAndMigrate } from "@homeops/db";
import { loadConfig, type Config } from "./config.ts";
import { makeRequireAuth, authRoutes } from "./routes/auth.ts";
import { healthRoutes } from "./routes/health.ts";
import { setupStatusRoutes } from "./routes/setup-status.ts";
import { inventoryRoutes } from "./routes/inventory.ts";
import { taskRoutes } from "./routes/tasks.ts";
import { shoppingRoutes } from "./routes/shopping.ts";
import { tokenRoutes } from "./routes/tokens.ts";
import { mcpRoutes } from "./mcp.ts";

/** 列出本机所有非回环 IPv4，启动时打印出来，省得手机连不上还要 ipconfig */
export function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) out.push("http://" + ni.address + ":" + port);
    }
  }
  return out;
}

export async function buildApp(config: Config = loadConfig()) {
  const { db, ran } = openAndMigrate(config.dbPath);
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  await app.register(cookie, { secret: config.sessionSecret });

  healthRoutes(app, db);
  // 公开接口：App 靠它判断显示「初始化」还是「登录」
  setupStatusRoutes(app, db);
  const requireAuth = makeRequireAuth(db, config);
  authRoutes(app, db, config, requireAuth);
  inventoryRoutes(app, db, requireAuth);
  taskRoutes(app, db, requireAuth);
  shoppingRoutes(app, db, requireAuth);
  tokenRoutes(app, db, requireAuth);
  mcpRoutes(app, db, requireAuth);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.code(error.statusCode ?? 500).send({ ok: false, error: error.code ?? "internal_error", message: error.message });
  });

  app.addHook("onClose", async () => { db.close(); });
  return { app, db, migrations: ran };
}

const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
if (entry.endsWith("server.ts")) {
  const config = loadConfig();
  const { app, migrations } = await buildApp(config);
  const address = await app.listen({ port: config.port, host: config.host });
  app.log.info({ address, dbPath: config.dbPath, migrations }, "homeops-api 已启动（含 /mcp 端点）");
  if (config.host === "0.0.0.0") {
    const urls = lanUrls(config.port);
    console.log("");
    console.log("本机:      http://127.0.0.1:" + config.port);
    urls.forEach((u) => console.log("局域网/手机: " + u + "    （Expo Go 会自动推导成这个地址）"));
    if (!urls.length) console.log("⚠️  没找到局域网 IPv4：手机将连不上，检查 Wi-Fi 是否连接");
    console.log("MCP 端点:  " + (urls[0] ?? "http://127.0.0.1:" + config.port) + "/mcp");
    console.log("");
  }
  const shutdown = async () => { await app.close(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
