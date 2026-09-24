import fs from 'node:fs';
const p = 'apps/api/src/server.ts';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('setupStatusRoutes')) {
  s = s.replace('import { healthRoutes } from "./routes/health.ts";', 'import { healthRoutes } from "./routes/health.ts";\nimport { setupStatusRoutes } from "./routes/setup-status.ts";');
  s = s.replace('  healthRoutes(app, db);', '  healthRoutes(app, db);\n  // 公开接口：App 靠它判断显示「初始化」还是「登录」\n  setupStatusRoutes(app, db);');
  fs.writeFileSync(p, s, 'utf8');
  console.log('server.ts：已挂载 /api/setup-status');
} else console.log('已挂载过');
