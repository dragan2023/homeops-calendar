import fs from 'node:fs';
const p = 'scripts/verify-mobile-api.mjs';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('setup-status')) { console.log('已加'); process.exit(0); }
const anchor = '// 3) 手机端首屏要用的四个接口';
const block = [
  '// 2b) 公开的初始化状态：手机 App 靠它判断该显示"初始化"还是"登录"',
  'const setupStatus = await fetch(BASE + "/api/setup-status");',
  'const stBody = await setupStatus.json();',
  'check("GET /api/setup-status 无需登录即可用，且报告已初始化", setupStatus.status === 200 && stBody?.initialized === true && !!stBody?.username,',
  '  "initialized=" + stBody?.initialized + " username=" + stBody?.username + " home=" + stBody?.homeName);',
  '',
  anchor
].join('\n');
s = s.replace(anchor, block);
fs.writeFileSync(p, s, 'utf8');
console.log('verify-mobile-api.mjs：已加 setup-status 检查（且证明它不需要登录）');
