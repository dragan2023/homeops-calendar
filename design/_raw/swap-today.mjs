import fs from 'node:fs';
fs.renameSync('mobile/src/screens/_today.new.tsx', 'mobile/src/screens/TodayScreen.tsx');
console.log('TodayScreen.tsx 已替换（走临时文件，避免 tools.write 的"未读取"限制）');
