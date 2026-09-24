import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(process.cwd(), 'design', 'prototypes');
for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(dir, f), 'utf8');
  const script = (html.match(/<script>([\s\S]*?)<\/script>/) || ['',''])[1];
  const used = new Set([...script.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]));
  const dom = new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
  const missing = [...used].filter(id => !dom.has(id) && !/^qa[A-Z]/.test(id));
  const unused = [...dom].filter(id => !used.has(id) && !/^[bci]-/.test(id));
  console.log(f, 'usedIds=' + used.size, 'missing=' + JSON.stringify(missing), 'unusedDomIds=' + JSON.stringify(unused));
}
