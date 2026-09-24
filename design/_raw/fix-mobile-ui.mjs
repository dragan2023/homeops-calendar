import fs from 'node:fs';
let done = [];
const edit = (file, pairs) => {
  let s = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    if (!s.includes(from)) { done.push('MISS ' + file + ' :: ' + from.slice(0, 50).replace(/\n/g, '|')); continue; }
    s = s.replace(from, to);
    done.push('ok   ' + file + ' :: ' + from.slice(0, 40).replace(/\n/g, '|'));
  }
  fs.writeFileSync(file, s, 'utf8');
};

// ---------- 1) 底栏配色改用新令牌（修：新粗野下选中文字黑底黑字消失） ----------
edit('mobile/src/navigation/RootNavigator.tsx', [
  ['        tabBarStyle: { backgroundColor: c.navBg, borderTopWidth: n.borderW, borderTopColor: c.border, height: 62, paddingBottom: 6 },\n        tabBarActiveTintColor: c.text,\n        tabBarInactiveTintColor: c.text3,',
   '        tabBarStyle: { backgroundColor: c.navBg, borderTopWidth: n.borderW, borderTopColor: c.border, height: 62, paddingBottom: 6 },\n        // 底栏底色是 navBg（新粗野是纯黑），前景必须用 nav-fg 令牌，不能用 text——否则黑底黑字\n        tabBarActiveTintColor: c.navFgActive,\n        tabBarInactiveTintColor: c.navFg,'],
]);

// ---------- 2) 主题面板：去掉开发说明与色块，只留主题名 + 简介 ----------
edit('mobile/src/screens/TasksScreen.tsx', [
  ['        <Text style={ui.note}>8 套主题共用同一套令牌（唯一真相源 packages/themes/tokens.css），选择会记住。</Text>\n', ''],
  ['            <View style={{ flexDirection: "row", gap: 4 }}>\n              {m.swatch.map((s) => (\n                <View key={s} style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: s, borderWidth: 1, borderColor: "rgba(0,0,0,0.2)" }} />\n              ))}\n            </View>\n', ''],
  ['            <View style={{ flex: 1, marginLeft: 10 }}>', '            <View style={{ flex: 1 }}>'],
  // 待办行：隐去 source_type / kind 这类字段值
  ['            <Text style={ui.sub}>{t.due_date ? "截止 " + t.due_date : "无截止日"} · {t.source_type}</Text>',
   '            <Text style={ui.sub}>{t.due_date ? "截止 " + t.due_date : "不急，想起来再做"}{t.done ? " · 已完成" : ""}</Text>'],
  ['          <Pill tone={t.kind === "chore" ? "accent" : t.kind === "linked" ? "info" : t.kind === "expiry" ? "warn" : "plain"} label={t.kind} />',
   '          <Pill tone={t.kind === "chore" ? "accent" : t.kind === "linked" ? "info" : t.kind === "expiry" ? "warn" : "plain"} label={KIND_LABEL[t.kind] ?? "待办"} />'],
  // 购物清单行：隐去来源字段
  ['              subtitle={(s.planned_date ?? "未排日期") + " · 来源 " + s.source}',
   '              subtitle={s.planned_date ? "计划 " + s.planned_date : "还没排日子"}'],
  // 说明文案去开发味
  ['          <p className="note">默认截止今天；周期家务请用「重跑对账」旁边的模板（P1 会做成可视化编辑）。{addDays(today, 0)}</p>', ''],
  ['          <Btn label="添加（默认截止今天）" primary onPress={() => void addTask()} style={{ marginTop: 10 }} />',
   '          <Btn label="添加" primary onPress={() => void addTask()} style={{ marginTop: 10 }} />'],
  ['import { THEME_META } from "../theme/generated";',
   'import { THEME_META } from "../theme/generated";\n\n// 内部枚举值不直接显示给用户\nconst KIND_LABEL: Record<string, string> = { chore: "周期家务", linked: "缺货补货", expiry: "临期处理", purchase: "要买" };'],
]);

// ---------- 3) 库存/物品详情：修数量不显示、隐去批次号与 FEFO 术语、流水类型中文化 ----------
edit('mobile/src/screens/InventoryScreen.tsx', [
  ['import { api, expiryText, idemKey, type Batch, type Item, type Tx } from "../services/api";',
   'import { api, expiryText, idemKey, type Batch, type Item, type Tx } from "../services/api";\n\n// 内部类型值不直接显示\nconst TX_LABEL: Record<string, string> = { receipt: "入库", issue: "领用", transfer_out: "调拨出", transfer_in: "调拨入", adjust: "盘点调整" };'],
  ['            <Text style={{ color: c.text3, fontSize: 12 }}>\n              现有 {detail.item.quantity} {detail.item.base_unit} · 补货点 {detail.item.reorder_point} · 预警 {detail.item.expiry_warn_days} 天\n            </Text>',
   '            <Text style={{ color: c.text3, fontSize: 12 }}>\n              现有 {total} {detail.item.base_unit}（补货点 {detail.item.reorder_point}）· 到期前 {detail.item.expiry_warn_days} 天开始提醒\n            </Text>'],
  ['              <ListRow\n                key={b.id}\n                title={(b.location_name ?? "未知地点") + " · " + (b.batch_no ?? "无批次号")}\n                subtitle={b.expiry_date ? b.expiry_date + "（" + expiryText(b.expiry_date) + "）" : "无到期日"}\n                right={<Text style={{ color: c.text, fontWeight: "700" }}>{b.quantity}{detail.item.base_unit}</Text>}\n              />',
   '              <ListRow\n                key={b.id}\n                title={b.location_name ?? "未知地点"}\n                subtitle={b.expiry_date ? "到期 " + b.expiry_date + "（" + expiryText(b.expiry_date) + "）" : "无到期日"}\n                right={<Text style={{ color: c.text, fontWeight: "700" }}>{b.quantity}{detail.item.base_unit}</Text>}\n              />'],
  ['              <ListRow key={t.id} title={t.type} subtitle={new Date(t.occurred_at).toLocaleString("zh-CN", { hour12: false })} right={<Text style={{ color: c.text }}>{t.quantity}</Text>} />',
   '              <ListRow key={t.id} title={TX_LABEL[t.type] ?? "库存变动"} subtitle={new Date(t.occurred_at).toLocaleString("zh-CN", { hour12: false })} right={<Text style={{ color: c.text }}>{t.quantity}</Text>} />'],
  ['            <Text style={ui.note}>领用按 FEFO 自动扣批次；每次写操作都带幂等键，重复点击不会重复记账。</Text>',
   '            <Text style={ui.note}>领用会先扣快到期的批次；重复点击不会重复记账。</Text>'],
  ['        <SectionTitle title="库存" hint={sorted.length + " 项 · FEFO 排序"} />',
   '        <SectionTitle title="库存" hint={sorted.length + " 项 · 快到期的排前面"} />'],
  ['  const [busy, setBusy] = useState(false);', '  const [busy, setBusy] = useState(false);\n  const total = detail ? detail.batches.reduce((s, b) => s + Number(b.quantity), 0) : 0;'],
]);

// ---------- 4) 今日页：提醒卡片文案去开发味 ----------
edit('mobile/src/screens/TodayScreen.tsx', [
  ['                {summary.counts.expiring + summary.counts.lowStock + summary.counts.tasks === 0\n                  ? "今天没有要处理的事，安心。"\n                  : "打开 App 就能看到，不用记；数据只在本机 SQLite 里。"}',
   '                {summary.counts.expiring + summary.counts.lowStock + summary.counts.tasks === 0\n                  ? "今天没有要处理的事，安心。"\n                  : "都是按你自己的库存算出来的，不用记。"}'],
  ['          <Text style={ui.note}>系统级推送（锁屏通知）在有设计稿/打包成正式 App 后再做：Expo Go 里做不了可靠的定时推送。</Text>',
   '          <Text style={ui.note}>想知道就打开看一眼；手机锁屏提醒要等打包成正式 App 之后。</Text>'],
  ['        <Text style={ui.note}>当前后端：{api.base}</Text>', '        <Text style={ui.note}>数据只存在你自己电脑上的一个文件里。</Text>'],
]);

console.log(done.join('\n'));
console.log('\n命中 ' + done.filter((d) => d.startsWith('ok')).length + ' 处，未命中 ' + done.filter((d) => d.startsWith('MISS')).length + ' 处');
