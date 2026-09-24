import fs from 'node:fs';
fs.renameSync('mobile/src/screens/_inv.new.tsx', 'mobile/src/screens/InventoryScreen.tsx');
console.log('InventoryScreen.tsx 已替换（12 条 + 显示全部 + 全屏搜索）');
