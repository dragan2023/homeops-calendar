import fs from 'node:fs';

// ---------- 1) 验收脚本：按产品真实承诺断言 + 补上"买"待办的完整生命周期 ----------
const vp = 'scripts/verify-m4.mjs';
let v = fs.readFileSync(vp, 'utf8');

const oldCheck = `const inToday = (today1.body?.expiring ?? []).some((b) => b.name === tag + "酸奶");
const inTasks = (today1.body?.tasks ?? []).some((t) => t.title.includes(tag + "酸奶"));
const inCal = (cal7.body?.events ?? []).some((e) => e.type === "expiry" && e.title.includes(tag + "酸奶"));
check("② 自动进入今日视图（临期+待办）", inToday && inTasks, "expiring=" + inToday + " tasks=" + inTasks);`;
const newCheck = `const inToday = (today1.body?.expiring ?? []).some((b) => b.name === tag + "酸奶");
// 临期待办的 due_date = 到期日（今天+2），所以它按语义出现在"临期区块 + 待办列表"，而不是"今天到期"那一段
const allOpen = await req("/api/tasks");
const taskExists = (allOpen.body?.tasks ?? []).some((t) => t.title.includes(tag + "酸奶"));
const inCal = (cal7.body?.events ?? []).some((e) => e.type === "expiry" && e.title.includes(tag + "酸奶"));
check("② 自动进入今日视图（临期区块）+ 全量待办列表", inToday && taskExists, "expiring=" + inToday + " task=" + taskExists);`;
if (!v.includes(oldCheck)) { console.log('② 断言未匹配'); process.exit(1); }
v = v.replace(oldCheck, newCheck);

const oldLow = 'const low = await req("/api/stock/low");';
const newLow = `const syncLow = await post("/api/tasks/sync", {});
const lowTaskCreated = (syncLow.body?.created ?? []).some((t) => t.startsWith("buy:") && t.includes(tag + "酸奶"));
check("④ 缺口一出现，「买」待办立刻由对账生成", lowTaskCreated, "created=" + JSON.stringify(syncLow.body?.created).slice(0, 80));
const low = await req("/api/stock/low");`;
if (!v.includes(oldLow)) { console.log('④ 锚点未匹配'); process.exit(1); }
v = v.replace(oldLow, newLow);
fs.writeFileSync(vp, v, 'utf8');
console.log('verify-m4.mjs: ②④ 断言已修正为产品真实语义');

// ---------- 2) 前端真实缺陷：未来到期的"临期/其它"待办在待办页无处显示 ----------
const tp = 'apps/web/src/screens/Tasks.tsx';
let t = fs.readFileSync(tp, 'utf8');
const oldGroups = `      <div className="block">
        <div className="block-head">
          <h2>周期家务</h2>
          <small>到点自动出现</small>
        </div>
        {renderTasks(group((t) => t.kind === "chore" && !!t.due_date && t.due_date > today))}
      </div>

      <div className="block">
        <div className="block-head">
          <h2>库存联动</h2>
          <small>东西用完自动生成</small>
        </div>
        {renderTasks(group((t) => t.kind === "linked" && !!t.due_date && t.due_date > today))}
      </div>`;
const newGroups = `      <div className="block">
        <div className="block-head">
          <h2>接下来</h2>
          <small>未来 30 天内到期（含临期、家务、联动）</small>
        </div>
        {renderTasks(
          group((t) => !!t.due_date && t.due_date > today && t.due_date <= addDays(today, 30)).sort((a, b) =>
            (a.due_date ?? "") < (b.due_date ?? "") ? -1 : 1,
          ),
        )}
      </div>

      <div className="block">
        <div className="block-head">
          <h2>更远 / 无截止日</h2>
          <small>不着急，但别忘了</small>
        </div>
        {renderTasks(group((t) => !t.due_date || t.due_date > addDays(today, 30)))}
      </div>`;
if (!t.includes(oldGroups)) { console.log('Tasks.tsx 分组未匹配'); process.exit(1); }
t = t.replace(oldGroups, newGroups);
fs.writeFileSync(tp, t, 'utf8');
console.log('Tasks.tsx: 未来待办不再"消失"（原来未来到期的临期待办既不在今天组也不在家务/联动组）');
