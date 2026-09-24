export type Config = {
  port: number;
  host: string;
  dbPath: string;
  homeName: string;
  sessionDays: number;
  cookieName: string;
  sessionSecret: string;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: Number(env.PORT ?? 8787),
    // 默认 0.0.0.0：手机（Expo Go）要连局域网，只绑 127.0.0.1 会 connect refused。
    // 只想本机访问就显式设 HOST=127.0.0.1。
    host: env.HOST ?? "0.0.0.0",
    dbPath: env.DB_PATH ?? "./data/homeops.db",
    homeName: env.HOME_NAME ?? "我家",
    sessionDays: Number(env.SESSION_DAYS ?? 30),
    cookieName: "homeops_sid",
    // 本地单机工具：没配就用固定值，仅用于 cookie 签名，不是密码学秘密
    sessionSecret: env.SESSION_SECRET ?? "homeops-local-dev-secret",
  };
}
