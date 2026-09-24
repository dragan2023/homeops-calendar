import fs from 'node:fs';
const BAD = "前置：先 `node apps/api/src/server.ts` 起服务（默认 127.0.0.1:8787，DB=./data/homeops.db）。";
const GOOD = "前置：先 `node apps/api/src/server.ts` 起服务（默认绑 0.0.0.0:8787 并打印手机可用地址，DB=./data/homeops.db；只想本机访问设 HOST=127.0.0.1）。";
const p = 'AGENTS.md';
let s = fs.readFileSync(p, 'utf8');
if (s.includes(BAD)) { fs.writeFileSync(p, s.replace(BAD, GOOD), 'utf8'); console.log('AGENTS 前置说明已更新为 0.0.0.0'); }
else console.log('未匹配（可能已改）');
