import fs from 'node:fs';
const p = 'scripts/clean-test-data.mjs';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('第二轮：同名同单位再合并')) { console.log('已有第二轮'); process.exit(0); }
const anchor = '  // ③ 待办标题、清单名、事件名里的前缀';
const pass2 = [
  '  // 第二轮：同名同单位再合并（分类/消耗类型可能不同，比如一次入库建的是"未分类"、另一次是"乳品"），',
  '  // 保留最早那条，并把重复项里非空的分类/消耗类型补到保留项上。',
  '  const byNameUnit = new Map();',
  '  for (const it of db.prepare("SELECT id, name, base_unit, category_id, consumption_type, created_at, expiry_warn_days FROM items WHERE active = 1 ORDER BY created_at").all()) {',
  '    const key = it.name + "|" + it.base_unit;',
  '    if (!byNameUnit.has(key)) byNameUnit.set(key, []);',
  '    byNameUnit.get(key).push(it);',
  '  }',
  '  for (const [, list] of byNameUnit) {',
  '    if (list.length < 2) continue;',
  '    const keep = list[0];',
  '    let category = keep.category_id;',
  '    let consumption = keep.consumption_type;',
  '    let warn = keep.expiry_warn_days;',
  '    for (const dup of list.slice(1)) {',
  '      if (!category && dup.category_id) category = dup.category_id;',
  '      if (consumption === "consumable" && dup.consumption_type !== "consumable") consumption = dup.consumption_type;',
  '      if (dup.expiry_warn_days > warn) warn = dup.expiry_warn_days;',
  '      // 补货点取更保守的（更大的那个），避免合并后不再提醒',
  '      db.prepare("UPDATE items SET reorder_point = MAX(reorder_point, (SELECT reorder_point FROM items WHERE id = ?)) WHERE id = ?").run(dup.id, keep.id);',
  '      for (const table of ["stock_batches", "stock_transactions", "tasks", "shopping_list", "item_events"]) {',
  '        db.prepare("UPDATE " + table + " SET item_id = ? WHERE item_id = ?").run(keep.id, dup.id);',
  '      }',
  '      db.prepare("UPDATE items SET active = 0 WHERE id = ?").run(dup.id);',
  '      stats.merged++;',
  '    }',
  '    db.prepare("UPDATE items SET category_id = ?, consumption_type = ?, expiry_warn_days = ? WHERE id = ?").run(category, consumption, warn, keep.id);',
  '    merges.push(keep.name + " · " + keep.base_unit + "（同名同单位合并为 1）");',
  '  }',
  '',
  anchor
].join('\n');
s = s.replace(anchor, pass2);
fs.writeFileSync(p, s, 'utf8');
console.log('清理脚本：已加"同名同单位合并"第二轮');
