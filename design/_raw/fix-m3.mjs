import fs from 'node:fs';

// 1) createApiToken 返回值补上一个可展示的前缀（用户在客户端里对号用）
const ap = 'apps/api/src/auth.ts';
let a = fs.readFileSync(ap, 'utf8');
const badA = '  return { id, token: raw };';
const goodA = '  return { id, token: raw, token_prefix: raw.slice(0, 12) };';
if (a.includes(badA)) { a = a.replace(badA, goodA); fs.writeFileSync(ap, a, 'utf8'); console.log('auth.ts: token_prefix 已返回'); }
else console.log('auth.ts: 跳过（未找到模式）');

// 2) 验收脚本修三处：无 body 的请求不要带 content-type；缺货物品的补货点要高于现存量
const vp = 'scripts/verify-m3.mjs';
let v = fs.readFileSync(vp, 'utf8');
const badReq = 'const res = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });';
const goodReq = 'const res = await fetch(BASE + path, { ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });';
if (v.includes(badReq)) { v = v.replace(badReq, goodReq); console.log('verify-m3: 无 body 不再带 json content-type'); }
const badItem = 'const item = await callTool("create_item", { name: tag + "洗衣液", baseUnit: "瓶", categoryName: "日化", reorderPoint: 1, reorderQuantity: 1 });';
const goodItem = 'const item = await callTool("create_item", { name: tag + "洗衣液", baseUnit: "瓶", categoryName: "日化", reorderPoint: 3, reorderQuantity: 2 });';
if (v.includes(badItem)) { v = v.replace(badItem, goodItem); console.log('verify-m3: 补货点改为 3（保证入库 2 后是缺货状态）'); }
fs.writeFileSync(vp, v, 'utf8');
