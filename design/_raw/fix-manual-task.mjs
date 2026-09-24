import fs from 'node:fs';
const p = 'apps/api/src/routes/tasks.ts';
let s = fs.readFileSync(p, 'utf8');
const bad = '"VALUES (?, ?, ?, ?, ?, \'manual\', NULL, NULL, NULL, NULL, ?, NULL, ?, 0, NULL, ?)",';
const good = '"VALUES (?, ?, ?, ?, ?, \'manual\', ?, NULL, NULL, NULL, ?, NULL, ?, 0, NULL, ?)",';
if (!s.includes(bad)) { console.log('NOT_FOUND'); process.exit(1); }
s = s.replace(bad, good);
const badRun = '.run(id, homeId, parsed.data.title, parsed.data.note ?? null, parsed.data.kind, parsed.data.dueDate ?? null, parsed.data.priority, nowIso());';
const goodRun = '.run(id, homeId, parsed.data.title, parsed.data.note ?? null, parsed.data.kind, id, parsed.data.dueDate ?? null, parsed.data.priority, nowIso());';
if (!s.includes(badRun)) { console.log('RUN_NOT_FOUND'); process.exit(1); }
s = s.replace(badRun, goodRun);
fs.writeFileSync(p, s, 'utf8');
console.log('patched manual task source_id');
