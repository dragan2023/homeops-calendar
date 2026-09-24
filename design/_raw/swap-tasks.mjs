import fs from 'node:fs';
fs.renameSync('mobile/src/screens/_tasks.new.tsx', 'mobile/src/screens/TasksScreen.tsx');
console.log('TasksScreen.tsx 已替换（长列表收敛 + 8 套主题面板保留）');
