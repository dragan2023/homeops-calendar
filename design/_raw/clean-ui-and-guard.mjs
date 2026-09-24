import fs from 'node:fs';
let log = [];
const edit = (file, pairs) => {
  let s = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    if (!s.includes(from)) { log.push('MISS ' + file + ' :: ' + from.slice(0, 45)); continue; }
    s = s.replace(from, to); log.push('ok   ' + file + ' :: ' + from.slice(0, 35));
  }
  fs.writeFileSync(file, s, 'utf8');
};

// 界面里剩下的开发用语
edit('mobile/src/screens/TasksScreen.tsx', [
  ['<Text style={ui.sub}>8 套主题，点这里切换（只改令牌，不改功能）</Text>', '<Text style={ui.sub}>8 套主题，点这里换</Text>'],
]);
edit('mobile/src/screens/LoginScreen.tsx', [
  ['<Text style={{ color: c.text3, fontSize: 12 }}>后端地址（自动推导，可被 EXPO_PUBLIC_API_URL 覆盖）</Text>',
   '<Text style={{ color: c.text3, fontSize: 12 }}>服务器地址（自动识别的，一般不用管）</Text>'],
  ['<Text style={ui.note}>登录时后端会直接签发一个家庭级 Token（只存在本机 AsyncStorage 里），所以手机上不需要浏览器 cookie。</Text>',
   '<Text style={ui.note}>登录后就记住你了，下次打开不用再输密码；账号信息只存在这台手机和你自己的电脑上。</Text>'],
]);
edit('mobile/src/screens/TodayScreen.tsx', [
  ['<SectionTitle title="随手记" hint="手动兜底（语音/扫码是 P1）" />', '<SectionTitle title="随手记" hint="填个名字就行，其它可以后补" />'],
]);

// 主题令牌单测里补上底栏两个新令牌（缺了就会被这条守卫抓住）
edit('mobile/src/__tests__/theme.test.ts', [
  ['"infoSoft", "navBg"]', '"infoSoft", "navBg", "navFg", "navFgActive"]'],
]);

// 新增"界面里不许出现内部字段值"的守卫用例
const extra = [
  '',
  'describe("界面不许出现内部字段/表名（用户看到的只能是中文业务词）", () => {',
  '  const FORBIDDEN = ["auto-low", "source_type", "SKU-", "batch_no", "created_at", "item_id", "planned_date", "chore", "linked", "purchase", "receipt", "issue", "adjust", "transfer_in", "transfer_out"];',
  '  const dump = () => JSON.stringify(screen.toJSON());',
  '',
  '  it("待办页：kind / source_type 等内部值不出现，显示中文标签", async () => {',
  '    wrap(<TasksScreen />);',
  '    await waitFor(() => expect(screen.getByText(/牛奶 · 1 盒/)).toBeTruthy());',
  '    const text = dump();',
  '    for (const bad of FORBIDDEN) expect([bad, text.includes(bad)]).toEqual([bad, false]);',
  '    expect(screen.getByText("临期处理")).toBeTruthy(); // kind=expiry 的中文标签',
  '  });',
  '',
  '  it("主题面板：没有开发说明文字", async () => {',
  '    wrap(<TasksScreen />);',
  '    await waitFor(() => expect(screen.getByText(/外观主题/)).toBeTruthy());',
  '    fireEvent.press(screen.getByText(/外观主题/));',
  '    await waitFor(() => expect(screen.getByText("选择主题")).toBeTruthy());',
  '    for (const bad of ["唯一真相源", "tokens.css", "令牌", "P1", "SQLite"]) {',
  '      expect([bad, dump().includes(bad)]).toEqual([bad, false]);',
  '    }',
  '    expect(screen.getByText("瑞士极简")).toBeTruthy();',
  '  });',
  '',
  '  it("物品详情：流水类型显示中文（入库/领用），数量不再是空白", async () => {',
  '    api.item.mockResolvedValue({',
  '      ok: true,',
  '      item: { ...itemsFixture.items[0], quantity: undefined },',
  '      batches: [{ id: "b1", batch_no: null, quantity: 3, expiry_date: "2026-09-22", location_name: "冰箱", unit_cost_minor: null }],',
  '      transactions: [',
  '        { id: "x1", type: "receipt", quantity: 2, reason: null, occurred_at: "2026-09-21T20:38:02.000Z" },',
  '        { id: "x2", type: "issue", quantity: 1, reason: null, occurred_at: "2026-09-21T20:38:02.000Z" },',
  '      ],',
  '    });',
  '    wrap(<InventoryScreen />);',
  '    await waitFor(() => expect(screen.getByText(/酸奶/)).toBeTruthy());',
  '    fireEvent.press(screen.getByText(/酸奶/));',
  '    await waitFor(() => expect(screen.getByText(/现有 3 杯/)).toBeTruthy()); // 原来这里显示空白，因为详情接口不返回 quantity',
  '    expect(screen.getAllByText("入库").length).toBeGreaterThan(0);',
  '    expect(screen.getAllByText("领用").length).toBeGreaterThan(0);',
  '    const text = dump();',
  '    for (const bad of ["receipt", "issue", "batch_no", "无批次号"]) expect([bad, text.includes(bad)]).toEqual([bad, false]);',
  '  });',
  '});',
  ''
].join('\n');
const tp = 'mobile/src/__tests__/screens.test.tsx';
fs.appendFileSync(tp, extra, 'utf8');
log.push('ok   ' + tp + ' :: 追加字段名守卫用例');
console.log(log.join('\n'));
