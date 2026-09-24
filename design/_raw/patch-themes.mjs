import fs from 'node:fs';
const file = 'design/prototypes/themed-app.html';
let h = fs.readFileSync(file, 'utf8');
const rules = [
  {
    find: 'html[data-theme="swiss"]{\n  --bg:#F1F3F5; --surface:#FFFFFF; --border:#E3E7EA; --border-w:1px;\n  --radius-card:10px; --radius-ctl:6px; --shadow-card:none; --label-transform:uppercase;\n  --font-head:\'Plus Jakarta Sans\',sans-serif; --font-body:\'Plus Jakarta Sans\',sans-serif;\n}',
    repl: [
      'html[data-theme="swiss"]{',
      '  --bg:#F1F3F5; --surface:#FFFFFF; --surface-2:#F7F8F9; --border:#E3E7EA; --border-w:1px; --border-strong:#C9D0D6;',
      '  --text:#0F172A; --text-2:#334155; --text-3:#5B6472; --on-primary:#FFFFFF;',
      '  --primary:#0F172A; --primary-soft:#EDEFF2; --accent:#047857; --accent-soft:#ECFDF5;',
      '  --warn:#B45309; --warn-soft:#FFFBEB; --danger:#B91C1C; --danger-soft:#FEF2F2;',
      '  --success:#047857; --success-soft:#ECFDF5; --info:#1D4ED8; --info-soft:#EFF6FF;',
      '  --radius-card:10px; --radius-ctl:6px; --radius-pill:999px;',
      '  --shadow-card:none; --shadow-ctl:none; --shadow-press:none;',
      "  --font-head:'Plus Jakarta Sans',system-ui,sans-serif; --font-body:'Plus Jakarta Sans',system-ui,sans-serif; --font-mono:ui-monospace,monospace;",
      '  --fs-h1:24px; --fs-h2:12px; --label-transform:uppercase; --label-tracking:.12em;',
      '  --gap:12px; --pad:16px; --ctl-h:44px; --dur:.18s; --ease:ease;',
      '  --icon-stroke:1.75; --icon-cap:round;',
      '}'
    ].join('\n')
  },
  { find: '--icon-stroke:1.9; --icon-cap:round; --nav-bg:rgba(25,33,52,.97);', repl: '--icon-stroke:1.9; --icon-cap:round; --dur:.2s; --ease:ease; --nav-bg:rgba(25,33,52,.97);' },
  { find: '--icon-stroke:1.8; --icon-cap:round; --nav-bg:rgba(255,255,255,.72);', repl: '--icon-stroke:1.8; --icon-cap:round; --dur:.18s; --ease:cubic-bezier(.2,.9,.1,1); --nav-bg:rgba(255,255,255,.72);' },
  { find: '--on-primary:#333333;', repl: '--on-primary:#5B2340;' }
];
for (const r of rules) {
  const n = h.split(r.find).length - 1;
  if (n !== 1) { console.log('SKIP (matches=' + n + '):', r.find.slice(0, 50).replace(/\n/g, '|')); continue; }
  h = h.replace(r.find, r.repl);
  console.log('patched:', r.find.slice(0, 45).replace(/\n/g, '|'));
}
fs.writeFileSync(file, h, 'utf8');
