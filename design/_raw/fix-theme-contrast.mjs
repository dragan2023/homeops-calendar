import fs from 'node:fs';
import path from 'node:path';
const file = path.join(process.cwd(), 'design', 'prototypes', 'themed-app.html');
let html = fs.readFileSync(file, 'utf8');

const hex = c => '#' + c.slice(0,3).map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2,'0')).join('').toUpperCase();
const parse = v => {
  v = v.trim();
  if (v.startsWith('#')) { let h=v.slice(1); if(h.length===3) h=h.split('').map(c=>c+c).join(''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),1]; }
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (!m) return null;
  const p = m[1].split(',').map(s=>parseFloat(s.trim()));
  return [p[0],p[1],p[2],p.length>3?p[3]:1];
};
const over = (f,b) => { const a=f[3]; return [f[0]*a+b[0]*(1-a), f[1]*a+b[1]*(1-a), f[2]*a+b[2]*(1-a), 1]; };
const lum = c => { const f=x=>{x/=255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);}; return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]); };
const ratio = (a,b) => { const l1=lum(a), l2=lum(b); const hi=Math.max(l1,l2), lo=Math.min(l1,l2); return (hi+0.05)/(lo+0.05); };
const mix = (c, t, amt) => [c[0]+(t[0]-c[0])*amt, c[1]+(t[1]-c[1])*amt, c[2]+(t[2]-c[2])*amt, 1];
function blockRange(name) {
  const re = new RegExp('html\\[data-theme="' + name + '"\\]\\{');
  const m = re.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = html.indexOf('\n}', start);
  return { start, end };
}
function decls(text) {
  const out = {};
  text.split(';').forEach(d => { const i=d.indexOf(':'); if(i<0) return; out[d.slice(0,i).trim().replace(/^--/,'')] = d.slice(i+1).trim(); });
  return out;
}
const baseRange = (() => { const m = /:root\{/.exec(html); const start = m.index + m[0].length; return { start, end: html.indexOf('\n}', start) }; })();
const baseDecls = decls(html.slice(baseRange.start, baseRange.end));
const pairs = [['text','bg'],['text','surface'],['text-2','surface'],['text-3','surface'],['on-primary','primary'],['warn','warn-soft'],['danger','danger-soft'],['info','info-soft'],['success','success-soft'],['accent','accent-soft']];
const themes = ['swiss','brutal','clay','kawaii','mecha','midnight','memphis','glass'];
const changes = [];
for (const t of themes) {
  const r = blockRange(t);
  let text = html.slice(r.start, r.end);
  const decl = Object.assign({}, baseDecls, decls(text));
  const bgc = parse(decl['bg']);
  const surfRaw = parse(decl['surface']);
  const surf = surfRaw[3] < 1 ? over(surfRaw, bgc) : surfRaw;
  const isDark = lum(bgc) < 0.18;
  for (const [a, b] of pairs) {
    const ca = parse(decl[a]), cb = parse(decl[b]);
    if (!ca || !cb) continue;
    const ctx = { bg: bgc, surface: surf };
    const fa = ca[3] < 1 ? over(ca, ctx[b] || surf) : ca;
    const fb = cb[3] < 1 ? over(cb, bgc) : cb;
    if (ratio(fa, fb) >= 4.6) continue;
    const target = isDark ? [255,255,255,1] : [0,0,0,1];
    let fixed = null;
    for (let amt = 0.02; amt <= 1; amt += 0.02) {
      const cand = mix(ca, target, amt);
      const cfa = cand;
      if (ratio(cfa, fb) >= 4.8) { fixed = cand; break; }
    }
    if (!fixed) continue;
    const newHex = hex(fixed);
    const oldVal = decl[a];
    const re = new RegExp('--' + a + '\\s*:\\s*' + oldVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!re.test(text)) { changes.push(t + ' ' + a + ' NOTFOUND(' + oldVal + ')'); continue; }
    text = text.replace(re, '--' + a + ':' + newHex);
    changes.push(t.padEnd(9) + ' --' + a.padEnd(10) + ' ' + oldVal + '  ->  ' + newHex + '   (' + b + ' 对比 ' + ratio(fixed, fb).toFixed(2) + ')');
  }
  html = html.slice(0, r.start) + text + html.slice(r.end);
}
fs.writeFileSync(file, html, 'utf8');
console.log(changes.join('\n'));
console.log('\nchanged declarations:', changes.filter(c => c.includes('->')).length);
