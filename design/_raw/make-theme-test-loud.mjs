import fs from 'node:fs';
const p = 'mobile/src/__tests__/theme.test.ts';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  '        expect(typeof t.colors[key]).toBe("string");',
  '        expect([id, "colors." + key, typeof t.colors[key]]).toEqual([id, "colors." + key, "string"]);'
);
s = s.replace(
  '        expect(typeof t.nums[key]).toBe("number");',
  '        expect([id, "nums." + key, typeof t.nums[key]]).toEqual([id, "nums." + key, "number"]);'
);
s = s.replace(
  '      expect(t.misc.labelTracking).toBeDefined();\n      expect(t.misc.labelTransform).toBeDefined();',
  '      expect([id, "misc.labelTracking", t.misc.labelTracking === undefined]).toEqual([id, "misc.labelTracking", false]);\n      expect([id, "misc.labelTransform", t.misc.labelTransform === undefined]).toEqual([id, "misc.labelTransform", false]);'
);
fs.writeFileSync(p, s, 'utf8');
console.log('主题用例：断言带上下文，失败会直接指出是哪套主题的哪个令牌');
