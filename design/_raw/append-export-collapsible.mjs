import fs from 'node:fs';
const p = 'mobile/src/components/ui.tsx';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('export { CollapsibleList }')) {
  s = s + '\nexport { CollapsibleList } from "./CollapsibleList";\n';
  fs.writeFileSync(p, s, 'utf8');
  console.log('ui.tsx: 末尾已追加 CollapsibleList 导出');
} else console.log('已存在导出');
