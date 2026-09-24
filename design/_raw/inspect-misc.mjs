import fs from 'node:fs';
const s = fs.readFileSync('mobile/src/theme/generated.ts', 'utf8');
const m = /export const THEMES: Record<ThemeId, RnTokens> = ([\s\S]*?);\s*$/.exec(s);
const THEMES = JSON.parse(m[1]);
for (const [id, t] of Object.entries(THEMES)) {
  console.log(id.padEnd(9), 'misc:', Object.keys(t.misc).join(','));
}
console.log('\nswiss.misc =', JSON.stringify(THEMES.swiss.misc));
const css = fs.readFileSync('packages/themes/tokens.css', 'utf8');
const sw = /html\[data-theme="swiss"\]\{([\s\S]*?)\n\}/.exec(css);
console.log('swiss 块含 label-tracking:', /label-tracking/.test(sw ? sw[1] : ''), '| root 含:', /label-tracking/.test(css.slice(0, css.indexOf('html[data-theme'))));
