import fs from 'node:fs';
const p = 'scripts/build-rn-themes.mjs';
let s = fs.readFileSync(p, 'utf8');
// 阴影的 hard 值可能是 null 或 {x,y,color} 对象，不能塞进 colors: Record<string,string>
const bad = "if (k.startsWith('shadow-')) { const s = shadowOf(v); colors[k.replace('shadow-', 'shadow') + 'Hard'] = s.hard; nums[camel(k) + 'Elevation'] = s.elevation; continue; }";
const good = "if (k.startsWith('shadow-')) { const s = shadowOf(v); misc[k.replace('shadow-', 'shadow') + 'Hard'] = s.hard; nums[camel(k) + 'Elevation'] = s.elevation; continue; }";
if (!s.includes(bad)) { console.log('NOT_FOUND'); process.exit(1); }
fs.writeFileSync(p, s.replace(bad, good), 'utf8');
console.log('生成器：shadowHard 移入 misc（类型正确）');
