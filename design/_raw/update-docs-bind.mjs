import fs from 'node:fs';
const ENV_LINE = "# HOST 默认 0.0.0.0（手机/Expo Go 连局域网必需）；只想本机访问写 HOST=127.0.0.1\n";
const MD_OLD = "> 后端默认只监听 127.0.0.1 时手机连不上！真机测试请让它监听所有网卡：\n> `set HOST=0.0.0.0 && node apps/api/src/server.ts`（PowerShell：`$env:HOST=\"0.0.0.0\"; node apps/api/src/server.ts`）";
const MD_NEW = "> 后端**默认已绑 0.0.0.0**（手机连局域网必需），启动时会直接打印手机要用的地址，例如：\n> ```\n> 本机:      http://127.0.0.1:8787\n> 局域网/手机: http://192.168.1.23:8787    （Expo Go 会自动推导成这个地址）\n> ```\n> 只想本机访问就显式 `HOST=127.0.0.1`。\n>\n> 手机连不上时先跑自检（会指出是绑定、防火墙还是网络问题，并给出确切修复命令）：\n> `node scripts/check-phone-reachable.mjs`\n> 防火墙放行（管理员 PowerShell 跑一次，本机已加好这条）：\n> `New-NetFirewallRule -DisplayName \"HomeOps Calendar TCP 8787\" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8787 -Profile Any`";
const PITFALL = "\n10. **后端只绑 127.0.0.1 → 手机必然 connect refused**（2026-09-21 实测，用户真机第一次连就撞上）：App 里地址推导是对的（显示 http://192.168.1.23:8787），但服务端 `netstat` 显示 `127.0.0.1:8787 LISTENING`，手机当然连不上；另外 Windows 防火墙对入站默认拦（本机原本没有任何 8787 规则）。\n    判据：①`config.ts` 的 `HOST` 默认 `0.0.0.0`；②启动时打印局域网地址；③入站放行规则 `HomeOps Calendar TCP 8787` 存在。\n    守卫：`node scripts/check-phone-reachable.mjs`（检查绑定地址 + 从局域网 IP 真发请求 + 防火墙规则，任一不合格就退出码 1 并给修复命令）。\n";
const CMD_LINE = "node scripts/check-phone-reachable.mjs   # 手机可达性自检（绑定/防火墙/局域网实连）";

let n = 0;
const envp = '.env.example';
let e = fs.readFileSync(envp, 'utf8');
if (!e.includes('HOST 默认 0.0.0.0')) { e = e.replace('PORT=8787', 'PORT=8787\n' + ENV_LINE.trimEnd()); fs.writeFileSync(envp, e, 'utf8'); n++; }

const mdp = 'docs/移动端测试.md';
let m = fs.readFileSync(mdp, 'utf8');
if (m.includes(MD_OLD)) { m = m.replace(MD_OLD, MD_NEW); fs.writeFileSync(mdp, m, 'utf8'); n++; }
else if (!m.includes('check-phone-reachable')) {
  m = m.replace('## 二、扫码开跑', MD_NEW + '\n\n## 二、扫码开跑');
  fs.writeFileSync(mdp, m, 'utf8'); n++;
}

const ap = 'AGENTS.md';
let a = fs.readFileSync(ap, 'utf8');
if (!a.includes('check-phone-reachable')) {
  const anchor = 'node scripts/build-rn-themes.mjs --check  # 移动端主题令牌与 packages/themes/tokens.css 是否一致';
  if (a.includes(anchor)) a = a.replace(anchor, anchor + '\n' + CMD_LINE);
  a = a + PITFALL;
  fs.writeFileSync(ap, a, 'utf8'); n++;
}
console.log('docs 更新处数：' + n);
