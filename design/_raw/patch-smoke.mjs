import fs from 'node:fs';
const p = 'scripts/smoke.mjs';
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.replace('process.exit(failed === 0 ? 0 : 1);', 'process.exitCode = failed === 0 ? 0 : 1;');
if (s === before) { console.log('NO_CHANGE'); } else { fs.writeFileSync(p, s, 'utf8'); console.log('patched smoke exit handling'); }
