import fs from 'node:fs';
const p = 'scripts/build-rn-themes.mjs';
let s = fs.readFileSync(p, 'utf8');
// 真 bug：这里用的是 camelCase 的 key 去比 kebab-case 的 'label-tracking'，永远不成立 →
// label-tracking 和 label-transform 都被写进同一个字段，后者覆盖前者（labelTracking 丢失、labelTransform 值是字距）
const bad = "if (k === 'label-tracking' || k === 'label-transform') { misc[key === 'label-tracking' ? 'labelTracking' : 'labelTransform'] = v; continue; }";
const good = "if (k === 'label-tracking') { misc.labelTracking = v; continue; }\n    if (k === 'label-transform') { misc.labelTransform = v; continue; }\n    if (k === 'color-scheme') { continue; }";
if (!s.includes(bad)) { console.log('模式未匹配'); process.exit(1); }
fs.writeFileSync(p, s.replace(bad, good), 'utf8');
console.log('生成器已修：labelTracking / labelTransform 不再互相覆盖');
