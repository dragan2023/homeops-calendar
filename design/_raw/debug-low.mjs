import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('./data/homeops.db');
const items = db.prepare("SELECT i.id, i.name, i.reorder_point, i.active, IFNULL(SUM(b.quantity),0) AS qty FROM items i LEFT JOIN stock_batches b ON b.item_id = i.id AND b.home_id = i.home_id WHERE i.active = 1 GROUP BY i.id ORDER BY i.name").all();
console.log('items:', JSON.stringify(items, null, 1));
const low = db.prepare("SELECT i.name, i.reorder_point, IFNULL(SUM(b.quantity),0) AS quantity FROM items i LEFT JOIN stock_batches b ON b.item_id = i.id AND b.home_id = i.home_id WHERE i.home_id = (SELECT id FROM homes LIMIT 1) AND i.active = 1 GROUP BY i.id HAVING quantity <= i.reorder_point ORDER BY i.name").all();
console.log('low:', JSON.stringify(low));
db.close();
