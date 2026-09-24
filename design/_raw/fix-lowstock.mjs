import fs from 'node:fs';
const p = 'apps/api/src/stock.ts';
let s = fs.readFileSync(p, 'utf8');
// 坑：HAVING 里写裸别名 quantity 会被解析成 join 表 b 的同名列（SQLite 优先解析真实列），
// 导致 SUM 结果根本没参与比较：无库存的物品 b.quantity 为 NULL → 被排除；有库存的取到任意一行。
const bad = '"WHERE i.home_id = ? AND i.active = 1 GROUP BY i.id HAVING quantity <= i.reorder_point ORDER BY i.name"';
const good = '"WHERE i.home_id = ? AND i.active = 1 GROUP BY i.id HAVING IFNULL(SUM(b.quantity), 0) <= i.reorder_point ORDER BY i.name"';
if (!s.includes(bad)) { console.log('PATTERN_NOT_FOUND'); process.exit(1); }
s = s.replace(bad, good);
fs.writeFileSync(p, s, 'utf8');
console.log('patched lowStock HAVING');
