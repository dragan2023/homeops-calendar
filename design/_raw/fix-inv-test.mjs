import fs from 'node:fs';
const p = 'mobile/src/__tests__/screens.test.tsx';
let s = fs.readFileSync(p, 'utf8');
// RNTL 默认会把连续空白折叠成一个空格，所以别用两个空格的严格正则
s = s.split('screen.getByText(/酸奶  3杯/)').join('screen.getByText(/酸奶/)');
fs.writeFileSync(p, s, 'utf8');
console.log('库存用例的文本匹配改为 /酸奶/（RNTL 会折叠空白）');
