import fs from 'node:fs';
const p = 'scripts/smoke.mjs';
let s = fs.readFileSync(p, 'utf8');
const pairs = [
  ['check("GET /api/meta 默认地点=5", locs === 5, "locations=" + locs);', 'check("GET /api/meta 默认地点齐全（≥5 且含冰箱）", locs >= 5 && (meta.body?.locations ?? []).some((l) => l.name === "冰箱"), "locations=" + locs);'],
  ['check("GET /api/meta 默认分类=9", cats === 9, "categories=" + cats);', 'check("GET /api/meta 默认分类齐全（≥9）", cats >= 9, "categories=" + cats);'],
  ['check("GET /api/meta 周期家务模板=2", tpls === 2, "templates=" + tpls);', 'check("GET /api/meta 默认周期家务模板（≥2）", tpls >= 2, "templates=" + tpls);']
];
let n = 0;
for (const [bad, good] of pairs) {
  if (s.includes(bad)) { s = s.replace(bad, good); n++; }
}
fs.writeFileSync(p, s, 'utf8');
console.log('smoke.mjs: 修正 ' + n + ' 处"写死数量"的断言（避免被后续验收脚本加的数据带崩）');
