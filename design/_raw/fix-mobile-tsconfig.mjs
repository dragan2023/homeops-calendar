import fs from 'node:fs';
const p = 'mobile/tsconfig.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
// 测试文件用 jest 全局（@types/jest 加进 types 会连带限制其它全局类型），单独排除、由 jest 运行时覆盖；
// 业务代码仍然全量走 tsc。
j.exclude = ['node_modules', '**/__tests__/**', 'dist-check', 'web-build'];
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('mobile/tsconfig.json：已排除 __tests__（业务代码仍全量 tsc）');
