import fs from 'node:fs';

const cp = 'apps/api/src/config.ts';
let c = fs.readFileSync(cp, 'utf8');
c = c.replace(
  '    host: env.HOST ?? "127.0.0.1",',
  '    // 默认 0.0.0.0：手机（Expo Go）要连局域网，只绑 127.0.0.1 会 connect refused。\n    // 只想本机访问就显式设 HOST=127.0.0.1。\n    host: env.HOST ?? "0.0.0.0",'
);
fs.writeFileSync(cp, c, 'utf8');
console.log('config.ts: HOST 默认改为 0.0.0.0');

const sp = 'apps/api/src/server.ts';
let s = fs.readFileSync(sp, 'utf8');
if (!s.includes('lanUrls')) {
  s = s.replace(
    'import Fastify from "fastify";',
    'import { networkInterfaces } from "node:os";\nimport Fastify from "fastify";'
  );
  s = s.replace(
    'export async function buildApp(',
    '/** 列出本机所有非回环 IPv4，启动时打印出来，省得手机连不上还要 ipconfig */\nexport function lanUrls(port: number): string[] {\n  const out: string[] = [];\n  for (const list of Object.values(networkInterfaces())) {\n    for (const ni of list ?? []) {\n      if (ni.family === "IPv4" && !ni.internal) out.push("http://" + ni.address + ":" + port);\n    }\n  }\n  return out;\n}\n\nexport async function buildApp('
  );
  s = s.replace(
    '  app.log.info({ address, dbPath: config.dbPath, migrations }, "homeops-api 已启动（含 /mcp 端点）");',
    '  app.log.info({ address, dbPath: config.dbPath, migrations }, "homeops-api 已启动（含 /mcp 端点）");\n  if (config.host === "0.0.0.0") {\n    const urls = lanUrls(config.port);\n    console.log("");\n    console.log("本机:      http://127.0.0.1:" + config.port);\n    urls.forEach((u) => console.log("局域网/手机: " + u + "    （Expo Go 会自动推导成这个地址）"));\n    if (!urls.length) console.log("⚠️  没找到局域网 IPv4：手机将连不上，检查 Wi-Fi 是否连接");\n    console.log("MCP 端点:  " + (urls[0] ?? "http://127.0.0.1:" + config.port) + "/mcp");\n    console.log("");\n  }'
  );
  fs.writeFileSync(sp, s, 'utf8');
  console.log('server.ts: 启动时打印局域网地址');
}
