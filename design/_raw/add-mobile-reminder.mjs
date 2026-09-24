import fs from 'node:fs';
const p = 'mobile/src/screens/TodayScreen.tsx';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('今日提醒')) { console.log('已有提醒卡'); process.exit(0); }
const anchor = '        <SectionTitle title="赏味期限"';
const block = [
  '        <SectionTitle title="今日提醒" hint={summary ? summary.date : ""} />',
  '        <View style={[ui.card, { padding: 14 }]}>',
  '          {summary ? (',
  '            <>',
  '              <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }}>',
  '                {summary.counts.expiring} 样快过期 · {summary.counts.lowStock} 样该补货 · {summary.counts.tasks} 件待办',
  '              </Text>',
  '              <Text style={ui.sub}>',
  '                {summary.counts.expiring + summary.counts.lowStock + summary.counts.tasks === 0',
  '                  ? "今天没有要处理的事，安心。"',
  '                  : "打开 App 就能看到，不用记；数据只在本机 SQLite 里。"}',
  '              </Text>',
  '            </>',
  '          ) : (',
  '            <Text style={ui.note}>加载中…</Text>',
  '          )}',
  '          <Text style={ui.note}>系统级推送（锁屏通知）在有设计稿/打包成正式 App 后再做：Expo Go 里做不了可靠的定时推送。</Text>',
  '        </View>',
  '',
  anchor
].join('\n');
s = s.replace(anchor, block);
fs.writeFileSync(p, s, 'utf8');
console.log('TodayScreen: 已加"今日提醒"卡（应用内）');
