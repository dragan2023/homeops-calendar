import fs from 'node:fs';
const p = 'scripts/build-rn-themes.mjs';
let s = fs.readFileSync(p, 'utf8');
const bad = "const themes = [toRnt('swiss', {}), ...blocks.map((b) => toRnt(b.id, b.tokens))];";
const good = "// 每个主题块自身已合并 :root 默认值，无需再单独加 root（否则 swiss 会出现两次）\nconst themes = blocks.map((b) => toRnt(b.id, b.tokens));";
if (!s.includes(bad)) { console.log('NOT_FOUND'); process.exit(1); }
fs.writeFileSync(p, s.replace(bad, good), 'utf8');
console.log('生成器已修正（去掉重复的 root 主题）');
