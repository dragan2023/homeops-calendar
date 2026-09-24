import fs from 'node:fs';
const p = 'scripts/verify-m2.mjs';
let s = fs.readFileSync(p, 'utf8');
const bad = '"closed=" + JSON.stringify(s3.body.closed).filter((c) => c.includes(tag)).slice(0, 2));';
const good = '"closed=" + JSON.stringify((s3.body.closed ?? []).filter((c) => c.includes(tag)).slice(0, 2)));';
if (!s.includes(bad)) { console.log('NOT_FOUND'); process.exit(1); }
fs.writeFileSync(p, s.replace(bad, good), 'utf8');
console.log('patched verify-m2 detail line');
