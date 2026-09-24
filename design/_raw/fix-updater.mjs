import fs from 'node:fs';
const p = 'design/_raw/update-docs-web.mjs';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('const F1 =')) s = s.replace("const F3 = String.fromCharCode(96).repeat(3);", "const F1 = String.fromCharCode(96);\nconst F3 = F1 + F1 + F1;");
fs.writeFileSync(p, s, 'utf8');
console.log('fixed updater');
