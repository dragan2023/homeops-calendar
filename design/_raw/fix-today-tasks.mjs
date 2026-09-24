import fs from 'node:fs';
const p = 'apps/api/src/tasks.ts';
let s = fs.readFileSync(p, 'utf8');
const bad = '  const tasks = listTasks(db, homeId, { to: today, includeDone: false });';
const good = [
  '  // 今日视图要包含"没有截止日"的积压待办（它们才是"今天该做"），所以不能用范围查询（范围查询会排掉 NULL）',
  '  const tasks = db',
  '    .prepare(',
  '      "SELECT id, title, note, kind, source_type, source_id, due_date, priority, done, done_at, item_id FROM tasks " +',
  '        "WHERE home_id = ? AND done = 0 AND (due_date IS NULL OR due_date <= ?) " +',
  '        "ORDER BY (due_date IS NULL), due_date ASC, priority DESC, created_at ASC",',
  '    )',
  '    .all(homeId, today) as Array<Record<string, unknown>>;'
].join('\n');
if (!s.includes(bad)) { console.log('NOT_FOUND'); process.exit(1); }
s = s.replace(bad, good);
fs.writeFileSync(p, s, 'utf8');
console.log('patched todaySummary tasks query');
