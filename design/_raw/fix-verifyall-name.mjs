import fs from 'node:fs';
const p = 'scripts/verify-all.mjs';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('let up = false;')) { console.log('已修'); process.exit(0); }
// 旧文件里有个 async function up()（已被替换掉使用处），与新的 let up 重名 → 删掉旧函数并改名
const fnStart = s.indexOf('async function up()');
if (fnStart >= 0) {
  const fnEnd = s.indexOf('\n}\n', fnStart);
  if (fnEnd > 0) s = s.slice(0, fnStart) + s.slice(fnEnd + 3);
}
s = s.split('let up = false;').join('let serverUp = false;');
s = s.split('while (Date.now() < deadline && !up)').join('while (Date.now() < deadline && !serverUp)');
s = s.split('serverUp = res.ok;').join('serverUp = res.ok;');
s = s.split('up = res.ok;').join('serverUp = res.ok;');
s = s.split('if (!up) await sleep(500);').join('if (!serverUp) await sleep(500);');
s = s.split('if (!up) {').join('if (!serverUp) {');
fs.writeFileSync(p, s, 'utf8');
console.log('verify-all.mjs：变量重名已修（删除旧 up() 函数并改名 serverUp）');
