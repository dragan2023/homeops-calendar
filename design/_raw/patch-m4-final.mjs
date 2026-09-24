import fs from 'node:fs';
const p = 'scripts/verify-m4.mjs';
let s = fs.readFileSync(p, 'utf8');

// A) 文件里用了 F1 占位符（反引号）但没定义 → 直接定义，避免再次 ReferenceError
if (!s.includes('const F1 =')) {
  s = s.replace('import { DatabaseSync } from "node:sqlite";',
                'import { DatabaseSync } from "node:sqlite";\nconst F1 = String.fromCharCode(96);');
}

// B) 补 import
s = s.replace('import { copyFileSync, existsSync, rmSync } from "node:fs";',
              'import { copyFileSync, existsSync, openSync, readFileSync, rmSync } from "node:fs";');

// C) 替换 ⑥ 第二个实例那段：随机端口 + 日志落盘 + 固定 500ms 轮询
const startAnchor = 'const child = spawn(process.execPath, ["apps/api/src/server.ts"], {';
const i = s.indexOf(startAnchor);
const j = s.indexOf('altHasData);', i);
if (i < 0 || j < 0) { console.log('锚点未找到 i=' + i + ' j=' + j); process.exit(1); }
const end = j + 'altHasData);'.length;
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
  '// 注意：这里必须"无论结果都 sleep"，否则非 200 响应会让 30 次轮询在毫秒内空转完，误判成"起不来"',
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

// D) 拷贝前清掉旧 -wal/-shm
s = s.replace('if (existsSync(copyPath)) rmSync(copyPath);\ncopyFileSync(DB_PATH, copyPath);',
              'for (const suffix of ["", "-wal", "-shm"]) if (existsSync(copyPath + suffix)) rmSync(copyPath + suffix);\ncopyFileSync(DB_PATH, copyPath);');

fs.writeFileSync(p, s, 'utf8');
console.log('verify-m4.mjs 已修：F1 定义 / ⑥ 随机端口+日志+固定轮询 / 拷贝前清理');
