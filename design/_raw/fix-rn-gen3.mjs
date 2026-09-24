import fs from 'node:fs';
const p = 'scripts/build-rn-themes.mjs';
let s = fs.readFileSync(p, 'utf8');
// --icon-stroke 之类的无单位数值（1.75）也要进 nums，否则组件拿不到数字
const bad = "    const px = pxNum(v);";
const good = "    const bareNum = /^-?\\d+(\\.\\d+)?$/.test(v) ? Number(v) : null;\n    const px = pxNum(v);";
if (s.includes(bad) && !s.includes('bareNum')) {
  s = s.replace(bad, good);
  s = s.replace(
    "    if (px !== null) { nums[key] = px; continue; }",
    "    if (px !== null) { nums[key] = px; continue; }\n    if (bareNum !== null && key !== 'dur') { nums[key] = bareNum; continue; }"
  );
  fs.writeFileSync(p, s, 'utf8');
  console.log('生成器：无单位数值也进 nums（如 iconStroke）');
} else console.log('生成器已修或模式未匹配');
