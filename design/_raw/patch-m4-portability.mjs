import fs from 'node:fs';
const p = 'scripts/verify-m4.mjs';
let s = fs.readFileSync(p, 'utf8');

// 1) 补 import
s = s.replace('import { copyFileSync, existsSync, rmSync } from "node:fs";',
              'import { copyFileSync, existsSync, openSync, readFileSync, rmSync } from "node:fs";');

// 2) 整段替换 ⑥ 的"第二个实例"逻辑：随机端口 + 日志落文件 + 固定 500ms 轮询（原来只等 30 次且 catch 才 sleep，
//    非 200 响应会瞬间空转完 30 次 → 误判"起不来"）
const startAnchor = 'const child = spawn(process.execPath, ["apps/api/src/server.ts"], {';
const endAnchor = '"查得到刚录入的物品=" + altHasData);';
const i = s.indexOf(startAnchor);
const j = s.indexOf(endAnchor);
if (i < 0 || j < 0) { console.log('锚点未找到 i=' + i + ' j=' + j); process.exit(1); }
const end = j + endAnchor.length;

const block = [
  'const PORT = 8801 + Math.floor(Math.random() * 90);',
  'const ALT = "http://127.0.0.1:" + PORT;',
  'const logPath = "./data/_portability-child.log";',
  'const logFd = openSync(logPath, "w");',
  'const child = spawn(process.execPath, ["apps/api/src/server.ts"], {',
  '  env: { ...process.env, PORT: String(PORT), DB_PATH: copyPath, HOST: "127.0.0.1" },',
  '  stdio: ["ignore", logFd, logFd],',
  '});',
  'let altUp = false;',
  'const deadline = Date.now() + 25000;',
  'while (Date.now() < deadline && !altUp) {',
  '  try {',
  '    const res = await fetch(ALT + "/healthz", { signal: AbortSignal.timeout(1500) });',
  '    altUp = res.ok;',
  '  } catch {',
  '    /* 还没起来 */',
  '  }',
  '  if (!altUp) await sleep(500);',
  '}',
  'let altHasData = false;',
  'if (altUp) {',
  '  const login = await fetch(ALT + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: USER, password: PASS }) });',
  '  const ck = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");',
  '  const items = await fetch(ALT + "/api/items?q=" + encodeURIComponent(tag), { headers: { cookie: ck } });',
  '  const body = await items.json();',
  '  altHasData = (body.items ?? []).length > 0;',
  '}',
  'const childLog = existsSync(logPath) ? readFileSync(logPath, "utf8").trim().slice(-400) : "";',
  'child.kill();',
  'await sleep(800);',
  'for (const suffix of ["", "-wal", "-shm"]) if (existsSync(copyPath + suffix)) rmSync(copyPath + suffix);',
  'if (existsSync(logPath)) rmSync(logPath);',
  'check("⑥ 只拷数据库单文件到别处，起来就是完整数据（含账号）", altUp && altHasData,',
  '  "port=" + PORT + " healthz=" + altUp + " 查得到刚录入的物品=" + altHasData + (altUp ? "" : "  子进程输出: " + childLog));'
].join('\n');

s = s.slice(0, i) + block + s.slice(end);

// 3) 拷贝前顺手清掉旧的 -wal/-shm，避免残留脏文件误导
s = s.replace('if (existsSync(copyPath)) rmSync(copyPath);\ncopyFileSync(DB_PATH, copyPath);',
              'for (const suffix of ["", "-wal", "-shm"]) if (existsSync(copyPath + suffix)) rmSync(copyPath + suffix);\ncopyFileSync(DB_PATH, copyPath);');

fs.writeFileSync(p, s, 'utf8');
console.log('verify-m4.mjs: ⑥ 已改为随机端口 + 日志可诊断 + 固定轮询节奏');
