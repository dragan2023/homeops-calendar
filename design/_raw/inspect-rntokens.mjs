import fs from 'node:fs';
const s = fs.readFileSync('mobile/src/theme/generated.ts', 'utf8');
const m = /export const THEMES: Record<ThemeId, RnTokens> = ([\s\S]*?);\n\nexport const THEME_META/.exec(s) ?? /export const THEMES: Record<ThemeId, RnTokens> = ([\s\S]*?);\s*$/.exec(s);
if (!m) { console.log('解析失败'); process.exit(1); }
const THEMES = JSON.parse(m[1]);
const numKeys = ['radiusCard','radiusCtl','radiusPill','borderW','ctlH','gap','pad','fsH1','fsH2','iconStroke','dur'];
const colorKeys = ['bg','surface','surface2','border','text','text2','text3','onPrimary','primary','primarySoft','warn','warnSoft','danger','dangerSoft','success','successSoft','accent','accentSoft','info','infoSoft','navBg'];
for (const [id, t] of Object.entries(THEMES)) {
  const missNum = numKeys.filter((k) => typeof t.nums[k] !== 'number');
  const missColor = colorKeys.filter((k) => typeof t.colors[k] !== 'string');
  console.log(id.padEnd(9), 'nums=' + Object.keys(t.nums).length, 'colors=' + Object.keys(t.colors).length,
    '缺数值:' + (missNum.join(',') || '无'), '缺颜色:' + (missColor.join(',') || '无'));
}
