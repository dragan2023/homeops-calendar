import fs from 'node:fs';
const p = 'mobile/src/__tests__/screens.test.tsx';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('LoginScreen')) { console.log('已加'); process.exit(0); }
s = s.replace('    calendar: jest.fn(),', '    calendar: jest.fn(),\n    setupStatus: jest.fn(),');
s = s.replace('  api.createTask.mockResolvedValue({ ok: true, id: "nt" });',
  '  api.createTask.mockResolvedValue({ ok: true, id: "nt" });\n  api.setupStatus.mockResolvedValue({ ok: true, initialized: false, homeName: null, username: null, counts: null });');
s = s.replace('const { CalendarScreen } = require("../screens/CalendarScreen") as { CalendarScreen: React.ComponentType };',
  'const { CalendarScreen } = require("../screens/CalendarScreen") as { CalendarScreen: React.ComponentType };\nconst { LoginScreen } = require("../screens/LoginScreen") as { LoginScreen: React.ComponentType };');
s += [
  '',
  'describe("登录 / 初始化", () => {',
  '  it("服务器没有账号时，自动显示初始化表单（不再让人对着登录框干瞪眼）", async () => {',
  '    api.setupStatus.mockResolvedValue({ ok: true, initialized: false, homeName: null, username: null, counts: null });',
  '    wrap(<LoginScreen />);',
  '    await waitFor(() => expect(screen.getByText(/这台服务器还没有账号/)).toBeTruthy());',
  '    expect(screen.getByText("家庭名")).toBeTruthy();',
  '    expect(screen.getByText("初始化并进入")).toBeTruthy();',
  '    expect(screen.getByText(/你就是管理员/)).toBeTruthy();',
  '  });',
  '',
  '  it("服务器已有账号时显示登录，并说明账号从哪来、忘了密码怎么办", async () => {',
  '    api.setupStatus.mockResolvedValue({ ok: true, initialized: true, homeName: "我家", username: "admin", counts: { items: 101, tasks: 220, shopping: 60 } });',
  '    wrap(<LoginScreen />);',
  '    await waitFor(() => expect(screen.getByText(/这台服务器已经有账号了/)).toBeTruthy());',
  '    expect(screen.getByText(/账号：admin/)).toBeTruthy();',
  '    expect(screen.getByText(/已有 101 样物品/)).toBeTruthy();',
  '    expect(screen.getByText(/set_password.bat/)).toBeTruthy();',
  '  });',
  '});',
  ''
].join('\n');
fs.writeFileSync(p, s, 'utf8');
console.log('screens.test.tsx：已加登录/初始化两例');
