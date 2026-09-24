import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(process.cwd(), 'design', 'prototypes');
const out = path.join(process.cwd(), 'design', '_raw');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) { console.log(f, 'NO_SCRIPT'); continue; }
  const target = path.join(out, f.replace(/\.html$/, '') + '.extract.js');
  fs.writeFileSync(target, m[1], 'utf8');
  const openTags = (html.match(/<(div|section|main|nav|header|button|span|table|tbody|tr|td|ul|li|p|h1|h2|h3|svg|symbol|label|select|option)\b/g) || []).length;
  const closeTags = (html.match(/<\/(div|section|main|nav|header|button|span|table|tbody|tr|td|ul|li|p|h1|h2|h3|svg|symbol|label|select|option)>/g) || []).length;
  console.log(f, 'scriptChars=' + m[1].length, 'openTags=' + openTags, 'closeTags=' + closeTags, 'diff=' + (openTags - closeTags));
}
