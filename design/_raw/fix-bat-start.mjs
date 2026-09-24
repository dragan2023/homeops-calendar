import fs from 'node:fs';
for (const p of ['start_mobile.bat', 'start_backend.bat']) {
  let s = fs.readFileSync(p, 'utf8');
  const bad = 'start "HomeOps backend" cmd /k "cd /d "%PROJECT_ROOT%" && node apps/api/src/server.ts"';
  const good = 'start "HomeOps backend" /d "%PROJECT_ROOT%" cmd /k node apps/api/src/server.ts';
  if (s.includes(bad)) { s = s.replace(bad, good); fs.writeFileSync(p, s, 'utf8'); console.log(p + '：已改用 start /d（避免嵌套引号 + 中文路径被 cmd 拆错）'); }
  else console.log(p + '：无需改（或模式未匹配）');
}
