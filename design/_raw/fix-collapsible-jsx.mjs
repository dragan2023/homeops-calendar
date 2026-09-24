import fs from 'node:fs';
const p = 'mobile/src/components/CollapsibleList.tsx';
let s = fs.readFileSync(p, 'utf8');
const bad = 'placeholder="在" + title + "里搜索"';
const good = 'placeholder={"在" + title + "里搜索"}';
if (!s.includes(bad)) { console.log('未匹配占位符'); } else { s = s.replace(bad, good); console.log('已修 JSX 属性拼接'); }
fs.writeFileSync(p, s, 'utf8');
