import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = new DatabaseSync('./data/homeops.db');
const active = db.prepare('SELECT COUNT(*) n FROM items WHERE active = 1').get().n;
const inactive = db.prepare('SELECT COUNT(*) n FROM items WHERE active = 0').get().n;
const names = db.prepare('SELECT name, base_unit, IFNULL((SELECT SUM(quantity) FROM stock_batches b WHERE b.item_id = items.id),0) qty FROM items WHERE active = 1 ORDER BY name').all();
const bad = names.filter((r) => /^(M[0-9]|MOB|VER|TEST)/.test(r.name));
console.log('活动物品 ' + active + ' 个（合并后软删除 ' + inactive + ' 个）');
console.log('名字里还带测试前缀的：' + (bad.length ? bad.map((b) => b.name).join(', ') : '无 ✅'));
console.log('前 12 个：' + names.slice(0, 12).map((r) => r.name + '(' + r.qty + r.base_unit + ')').join('、'));
const dup = names.filter((r, i) => names.findIndex((x) => x.name === r.name) !== i);
console.log('重复名字：' + (dup.length ? dup.map((d) => d.name).join(',') : '无 ✅'));
console.log('待办标题残留：' + db.prepare("SELECT COUNT(*) n FROM tasks WHERE title GLOB 'M[0-9]*' OR title GLOB 'MOB*'").get().n);
console.log('清单名残留：' + db.prepare("SELECT COUNT(*) n FROM shopping_list WHERE name GLOB 'M[0-9]*' OR name GLOB 'MOB*'").get().n);
db.close();

// 再从 API 视角确认（临时端口，只读）
const PORT = 8966;
const srv = spawn(process.execPath, ['apps/api/src/server.ts'], { env: { ...process.env, PORT: String(PORT), DB_PATH: './data/homeops.db', HOST: '127.0.0.1', LOG_LEVEL: 'warn' }, stdio: 'ignore' });
let up = false;
const deadline = Date.now() + 15000;
while (Date.now() < deadline && !up) {
  try { up = (await fetch('http://127.0.0.1:' + PORT + '/healthz', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* wait */ }
  if (!up) await sleep(400);
}
const PROBE_PASS = process.env.SMOKE_PASS;
if (up && PROBE_PASS) {
  const login = await fetch('http://127.0.0.1:' + PORT + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: PROBE_PASS }) });
  const ck = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  console.log('（顺便：SMOKE_PASS 里给的口令能登录吗 → ' + login.status + '）');
  const items = await (await fetch('http://127.0.0.1:' + PORT + '/api/items?q=' + encodeURIComponent('布洛芬'), { headers: { cookie: ck } })).json();
  console.log('API 查「布洛芬」：' + (items.items ?? []).length + ' 条 → ' + (items.items ?? []).map((i) => i.name).join(', '));
} else if (up) {
  console.log('（跳过登录检查：未设置 SMOKE_PASS —— 仓库里不存默认口令）');
}
srv.kill();
await sleep(400);
process.exitCode = bad.length === 0 ? 0 : 1;
