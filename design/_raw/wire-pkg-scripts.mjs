import fs from 'node:fs';
const p = 'package.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.scripts = {
  ...j.scripts,
  start: 'node scripts/free-port.mjs 8787 apps/api/src/server.ts && node apps/api/src/server.ts',
  dev: 'node scripts/free-port.mjs 8787 apps/api/src/server.ts && node --watch apps/api/src/server.ts',
};
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('package.json: start/dev 已先清旧进程（铁律）');
