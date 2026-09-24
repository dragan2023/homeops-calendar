import fs from 'node:fs';
const p = 'mobile/src/services/api.ts';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('setupStatus')) { console.log('已有'); process.exit(0); }
s = s.replace(
  '  me: () => request<{ ok: boolean; user: { username: string; homeId: string; homeName: string } }>("/api/me"),',
  '  me: () => request<{ ok: boolean; user: { username: string; homeId: string; homeName: string } }>("/api/me"),\n  /** 公开接口：这台服务器是否已经有账号（App 靠它决定显示"初始化"还是"登录"） */\n  setupStatus: () =>\n    request<{ ok: boolean; initialized: boolean; homeName: string | null; username: string | null; counts: { items: number; tasks: number; shopping: number } | null }>(\n      "/api/setup-status",\n    ),'
);
fs.writeFileSync(p, s, 'utf8');
console.log('api.ts: 已加 setupStatus');
