import fs from 'node:fs';
const p = 'scripts/verify-all.mjs';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('_verify-')) { console.log('已隔离'); process.exit(0); }

// 1) 顶部：改成随机端口 + 临时库
s = s.replace('const BASE = process.env.BASE ?? "http://127.0.0.1:8787";',
  'const PORT = 8900 + Math.floor(Math.random() * 90);\nconst BASE = process.env.BASE ?? "http://127.0.0.1:" + PORT;\nconst DB = "./data/_verify-" + process.pid + ".db";\nconst VLOG = "./data/_verify-" + process.pid + ".log";');

// 2) 起服务那段：无论本地有没有服务，一律起自己的隔离实例（临时库 + 随机端口）
const startAnchor = 'let server = null;';
const endAnchor = 'const steps = [';
const i = s.indexOf(startAnchor);
const j = s.indexOf(endAnchor);
if (i < 0 || j < 0) { console.log('锚点未找到'); process.exit(1); }
const block = [
  '// 隔离运行：自带临时库 + 随机端口，绝不碰 data/homeops.db 里的真实数据，也不和你正在跑的后端抢端口',
  'for (const suffix of ["", "-wal", "-shm"]) if (existsSync(DB + suffix)) rmSync(DB + suffix);',
  'const logFd = openSync(VLOG, "w");',
  'console.log("隔离运行：端口 " + PORT + "，临时库 " + DB + "（真实数据不会被碰）");',
  'const server = spawn(process.execPath, ["apps/api/src/server.ts"], {',
  '  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DB_PATH: DB, LOG_LEVEL: "warn" },',
  '  stdio: ["ignore", logFd, logFd],',
  '});',
  'let up = false;',
  'const deadline = Date.now() + 25000;',
  'while (Date.now() < deadline && !up) {',
  '  try {',
  '    const res = await fetch(BASE + "/healthz", { signal: AbortSignal.timeout(1500) });',
  '    up = res.ok;',
  '  } catch {',
  '    /* 还没起来 */',
  '  }',
  '  if (!up) await sleep(500);',
  '}',
  'if (!up) {',
  '  console.log("❌ 临时服务起不来，日志尾部：\\n" + (existsSync(VLOG) ? readFileSync(VLOG, "utf8").slice(-800) : "(无日志)"));',
  '  server.kill();',
  '  process.exit(1);',
  '}',
  '',
  ''
].join('\n');
s = s.slice(0, i) + block + s.slice(j);

// 3) 子脚本带上 BASE / DB_PATH（M4 的搬移测试要用同一个临时库）
s = s.replace('const r = spawnSync(process.execPath, args, { stdio: "inherit" });',
              'const r = spawnSync(process.execPath, args, { stdio: "inherit", env: { ...process.env, BASE, DB_PATH: DB } });');

// 4) 结束：清理临时库与日志
s = s.replace('if (server) server.kill();\nprocess.exitCode = failed === 0 ? 0 : 1;',
  'if (server) server.kill();\nawait sleep(600);\nfor (const suffix of ["", "-wal", "-shm"]) if (existsSync(DB + suffix)) rmSync(DB + suffix);\nif (existsSync(VLOG)) rmSync(VLOG);\nprocess.exitCode = failed === 0 ? 0 : 1;');

// 5) 补 import
s = s.replace('import { spawn, spawnSync } from "node:child_process";',
              'import { spawn, spawnSync } from "node:child_process";\nimport { existsSync, openSync, readFileSync, rmSync } from "node:fs";');

fs.writeFileSync(p, s, 'utf8');
console.log('verify-all.mjs：已改为隔离运行（随机端口 + 临时库 + 结束清理）');
