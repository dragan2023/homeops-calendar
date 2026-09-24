import fs from 'node:fs';
const p = 'mobile/package.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.jest = { ...(j.jest ?? {}), setupFiles: ['<rootDir>/jest.setup.js'] };
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('jest.setup.js 已挂上');
