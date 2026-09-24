import fs from 'node:fs';
const p = 'apps/api/src/tasks.ts';
let s = fs.readFileSync(p, 'utf8');
const sigOld = 'export function calendarEvents(db: DatabaseSync, homeId: string, from: string, to: string): CalendarEvent[] {';
const sigNew = 'export function calendarEvents(db: DatabaseSync, homeId: string, from: string, to: string, today?: string): CalendarEvent[] {';
if (!s.includes(sigOld)) { console.log('SIG_NOT_FOUND'); process.exit(1); }
s = s.replace(sigOld, sigNew);

const anchor = '  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type < b.type ? -1 : 1));';
if (!s.includes(anchor)) { console.log('ANCHOR_NOT_FOUND'); process.exit(1); }
const block = [
  '  // 缺货物品直接落到"今天"的采购事件上（还没进购物清单的），避免"日历上看不到该买什么"',
  '  const todayDate = today ?? from;',
  '  if (todayDate >= from && todayDate <= to) {',
  '    const suggestions = db',
  '      .prepare(',
  '        "SELECT i.id AS item_id, i.name, i.base_unit, i.reorder_point, i.reorder_quantity " +',
  '          "FROM items i WHERE i.home_id = ? AND i.active = 1 AND i.reorder_point > 0 " +',
  '          "AND IFNULL((SELECT SUM(quantity) FROM stock_batches b WHERE b.item_id = i.id AND b.home_id = i.home_id), 0) <= i.reorder_point " +',
  '          "AND NOT EXISTS (SELECT 1 FROM shopping_list s WHERE s.home_id = i.home_id AND s.item_id = i.id AND s.completed = 0)",',
  '      )',
  '      .all(homeId) as Array<{ item_id: string; name: string; base_unit: string; reorder_point: number; reorder_quantity: number }>;',
  '    for (const it of suggestions) {',
  '      events.push({',
  '        date: todayDate, type: "buy",',
  '        title: "该买 " + it.name + " " + (it.reorder_quantity > 0 ? it.reorder_quantity : 1) + " " + it.base_unit,',
  '        refId: it.item_id, meta: { suggested: true, reorderPoint: it.reorder_point },',
  '      });',
  '    }',
  '  }',
  ''
].join('\n');
s = s.replace(anchor, block + anchor);
fs.writeFileSync(p, s, 'utf8');
console.log('patched calendarEvents (buy suggestions)');
