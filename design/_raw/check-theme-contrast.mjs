import fs from 'node:fs';
import path from 'node:path';
const file = path.join(process.cwd(), 'design', 'prototypes', 'themed-app.html');
const html = fs.readFileSync(file, 'utf8');

function parseColor(v) {
  v = v.trim();
  if (v.startsWith('#')) {
    let h = v.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), 1];
  }
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (m) {
    const p = m[1].split(',').map(s => parseFloat(s.trim()));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return null;
}
function over(fg, bg) {
  const a = fg[3];
  return [fg[0]*a + bg[0]*(1-a), fg[1]*a + bg[1]*(1-a), fg[2]*a + bg[2]*(1-a), 1];
}
function lum(c) {
  const f = x => { x /= 255; return x <= 0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4); };
  return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]);
}
function ratio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  const hi = Math.max(l1,l2), lo = Math.min(l1,l2);
  return (hi + 0.05) / (lo + 0.05);
}
function block(name) {
  const re = new RegExp((name === ':root' ? ':root' : 'html\\[data-theme="' + name + '"\\]') + '\\{([\\s\\S]*?)\\}');
  const m = re.exec(html);
  if (!m) return null;
  const out = {};
  m[1].split(';').forEach(decl => {
    const i = decl.indexOf(':');
    if (i < 0) return;
    out[decl.slice(0, i).trim().replace(/^--/, '')] = decl.slice(i+1).trim();
  });
  return out;
}
const contract = ['bg','surface','surface-2','border','border-strong','text','text-2','text-3','on-primary','primary','primary-soft','accent','accent-soft','warn','warn-soft','danger','danger-soft','success','success-soft','info','info-soft','radius-card','radius-ctl','border-w','shadow-card','font-head','font-body','ctl-h','dur','ease','icon-stroke','icon-cap'];
const themes = ['swiss','brutal','clay','kawaii','mecha','midnight','memphis','glass'];
const base = block(':root');
console.log('== token coverage (missing = falls back to :root) ==');
for (const t of themes) {
  const b = block(t);
  const merged = Object.assign({}, base, b);
  const missing = contract.filter(k => !b[k]);
  console.log(t.padEnd(9), 'defined=' + Object.keys(b).length, 'missing=' + (missing.length ? missing.join(',') : 'none'));
}
console.log('\n== contrast audit (require >= 4.5 for text pairs) ==');
const pairs = [['text','bg'],['text','surface'],['text-2','surface'],['text-3','surface'],['on-primary','primary'],['nav-fg','nav-bg'],['nav-fg-active','nav-bg'],['warn','warn-soft'],['danger','danger-soft'],['info','info-soft'],['success','success-soft'],['accent','accent-soft']];
let bad = 0;
for (const t of themes) {
  const v = Object.assign({}, base, block(t));
  const bgc = parseColor(v['bg']);
  const surfRaw = parseColor(v['surface']);
  const surf = surfRaw[3] < 1 ? over(surfRaw, bgc) : surfRaw;
  const ctx = { bg: bgc, surface: surf };
  const lines = [];
  for (const [a, b] of pairs) {
    const ca = parseColor(v[a]), cb = parseColor(v[b]);
    if (!ca || !cb) { lines.push(a + '/' + b + '=SKIP'); continue; }
    const fa = ca[3] < 1 ? over(ca, ctx[b] || surf) : ca;
    const fb = cb[3] < 1 ? over(cb, bgc) : cb;
    const r = ratio(fa, fb);
    const flag = r >= 4.5 ? '' : (r >= 3 ? '  <-- LOW' : '  <-- FAIL');
    if (r < 4.5) bad++;
    lines.push(a + '/' + b + '=' + r.toFixed(2) + flag);
  }
  console.log(t.padEnd(9), lines.join('  '));
}
console.log('\nlow/fail pairs:', bad);
