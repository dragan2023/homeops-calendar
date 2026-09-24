import fs from 'node:fs';

// contracts：login / setup 增加 issueToken 开关
const cp = 'packages/contracts/src/index.ts';
let c = fs.readFileSync(cp, 'utf8');
c = c.replace(
  'export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(6) });',
  'export const loginSchema = z.object({\n  username: z.string().min(1),\n  password: z.string().min(6),\n  /** 移动端（React Native）没有浏览器 cookie jar，登录时直接签发 Bearer Token */\n  issueToken: z.boolean().default(false),\n  tokenName: z.string().max(60).optional()\n});'
);
c = c.replace(
  '  defaultCurrency: z.string().default("CNY")\n});',
  '  defaultCurrency: z.string().default("CNY"),\n  /** 移动端首启：初始化完直接给 Token，省掉一次登录 */\n  issueToken: z.boolean().default(false)\n});'
);
fs.writeFileSync(cp, c, 'utf8');

// auth 路由：签发 token 并回传
const ap = 'apps/api/src/routes/auth.ts';
let a = fs.readFileSync(ap, 'utf8');
a = a.replace(
  'import { createSession, deleteSession, readApiToken, readSession, verifyPassword, type SessionUser } from "../auth.ts";',
  'import { createApiToken, createSession, deleteSession, readApiToken, readSession, verifyPassword, type SessionUser } from "../auth.ts";'
);
a = a.replace(
  '    return { ok: true, homeId: result.homeId, userId: result.userId, username: input.username };',
  '    const issued = parsed.data.issueToken ? createApiToken(db, result.userId, result.homeId, "移动端首启") : null;\n    return { ok: true, homeId: result.homeId, userId: result.userId, username: input.username, ...(issued ? { token: issued.token, token_prefix: issued.token_prefix } : {}) };'
);
a = a.replace(
  '    return { ok: true, username: parsed.data.username, expiresAt: session.expiresAt };',
  '    const issued = parsed.data.issueToken ? createApiToken(db, row.id, home?.id ?? null as never, parsed.data.tokenName ?? "移动端") : null;\n    return { ok: true, username: parsed.data.username, expiresAt: session.expiresAt, ...(issued ? { token: issued.token, token_prefix: issued.token_prefix } : {}) };'
);
fs.writeFileSync(ap, a, 'utf8');
console.log('后端：login/setup 支持 issueToken');
