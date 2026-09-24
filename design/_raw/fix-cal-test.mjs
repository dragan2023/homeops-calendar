import fs from 'node:fs';
const p = 'mobile/src/__tests__/screens.test.tsx';
let s = fs.readFileSync(p, 'utf8');
// 日历事件要用"今天"，否则默认选中今天、事件在明天 → 当天列表为空（这是测试用例的问题，不是产品问题）
s = s.replace(
  'api.calendar.mockResolvedValue({ ok: true, events: [{ date: "2026-09-22", type: "expiry", title: "酸奶 到期", refId: "b1" }], byType: { expiry: 1 } });',
  'const TODAY = new Date().toISOString().slice(0, 10);\n  api.calendar.mockResolvedValue({ ok: true, events: [{ date: TODAY, type: "expiry", title: "酸奶 到期", refId: "b1" }], byType: { expiry: 1 } });'
);
fs.writeFileSync(p, s, 'utf8');
console.log('日历测试夹具改为今天');
