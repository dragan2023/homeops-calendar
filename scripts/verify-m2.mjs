// M2 验收：周期家务展开 / 临期联动 / 缺货联动(买+换) / 对账幂等 / 来源消失自动关闭 / 日历四类事件
// 说明：所有断言都用本脚本自己新建的数据（带时间戳前缀），不依赖库里已有状态，可以反复跑。
const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
// 闸门：没显式指定 BASE 就拒绝跑——否则会把测试数据写进用户真实库（血案见 AGENTS 坑 13）。
if (!process.env.BASE && !process.argv.includes("--allow-real")) {
  console.error("拒绝连默认后端跑（会污染你自己的数据）。请改用：node scripts/verify-all.mjs（自带临时库+随机端口）");
  console.error("确实要打某个实例：BASE=http://127.0.0.1:<port> node " + process.argv[1]);
  process.exit(2);
}

const USER = process.env.SMOKE_USER ?? "admin";
const PASS = process.env.SMOKE_PASS;
if (!PASS) {
  console.error("拒绝运行：未设置 SMOKE_PASS（冒烟账号口令）。仓库里不存默认口令。");
  console.error("整链路回归请用 node scripts/verify-all.mjs（自动生成一次性口令 + 临时库）；单独跑：SMOKE_PASS=<口令> BASE=http://127.0.0.1:<port> node " + process.argv[1]);
  process.exit(2);
}
let cookie = "";
let failed = 0;
const tag = "M2-" + Date.now().toString().slice(-7);
const key = (s) => "m2-" + s + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = day(0);

function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : ""));
  if (!ok) failed++;
}
async function req(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body };
}
const post = (p, b) => req(p, { method: "POST", body: JSON.stringify(b) });
const titles = (list) => (list ?? []).map((t) => t.title);

await post("/api/login", { username: USER, password: PASS });
const meta = await req("/api/meta");
const locs = Object.fromEntries((meta.body.locations ?? []).map((l) => [l.name, l.id]));
const cats = Object.fromEntries((meta.body.categories ?? []).map((c) => [c.name, c.id]));

// 场景：酸奶临期、牛奶缺货、滤芯缺货且属耗材（应生成"买 + 换"两条）、布洛芬用药（日历 care）
const yoghurt = (await post("/api/items", { name: tag + "酸奶", baseUnit: "杯", categoryId: cats["乳品"], reorderPoint: 0, expiryWarnDays: 3 })).body.id;
const milk = (await post("/api/items", { name: tag + "牛奶", baseUnit: "盒", categoryId: cats["乳品"], reorderPoint: 3, reorderQuantity: 2 })).body.id;
const filter = (await post("/api/items", { name: tag + "滤芯", baseUnit: "支", categoryId: cats["耗材"], reorderPoint: 1 })).body.id;
const pill = (await post("/api/items", { name: tag + "布洛芬", baseUnit: "片", categoryId: cats["药品"], reorderPoint: 0, consumptionType: "medicine", expiryWarnDays: 5 })).body.id;
const yBatch = (await post("/api/stock/receipt", { idempotencyKey: key("r"), itemId: yoghurt, quantity: 2, locationId: locs["冰箱"], expiryDate: day(2) })).body.batchId;
await post("/api/stock/receipt", { idempotencyKey: key("r"), itemId: milk, quantity: 1, locationId: locs["冰箱"], expiryDate: day(30) });
await post("/api/stock/receipt", { idempotencyKey: key("r"), itemId: pill, quantity: 12, locationId: locs["药箱"], expiryDate: day(3) });
check("场景数据就绪（4 物品 + 3 批次）", !!yoghurt && !!milk && !!filter && !!pill && !!yBatch, "batch=" + String(yBatch).slice(0, 8));

// 1. 周期家务：自己建模板，3 天一次 → 14 天窗口内应有 5 次
const tplOwn = await post("/api/task-templates", { title: tag + "扫地", cycleRule: "FREQ=DAILY;INTERVAL=3", nextDueDate: today });
const s1 = await post("/api/tasks/sync", {});
const choreCreated = (s1.body.created ?? []).filter((t) => t.includes(tag + "扫地"));
check("sync 按周期模板展开家务", tplOwn.status === 200 && choreCreated.length === 5, "展开=" + choreCreated.length + " 次，全部 created 共 " + (s1.body.created ?? []).length);

// 2. 临期 / 缺货联动
check("临期生成「吃掉/用掉」待办", (await req("/api/tasks")).body.tasks.filter((t) => t.title.includes(tag + "酸奶")).length === 1);
check("缺货生成「买」待办", (await req("/api/tasks")).body.tasks.some((t) => t.title === "买 " + tag + "牛奶 2 盒"));
check("耗材缺货生成「买 + 换」两条", (await req("/api/tasks")).body.tasks.some((t) => t.title === "买 " + tag + "滤芯 1 支") && (await req("/api/tasks")).body.tasks.some((t) => t.title === "换 " + tag + "滤芯"));

// 3. 再对账一次：必须零新增（幂等）
const s2 = await post("/api/tasks/sync", {});
check("重复 sync 零新增（幂等）", (s2.body.created ?? []).length === 0 && (s2.body.reopened ?? []).length === 0, "created=" + JSON.stringify(s2.body.created));
const yoghurtTasks = (await req("/api/tasks")).body.tasks.filter((t) => t.title.includes(tag + "酸奶"));
check("同一临期批次只有一条待办（无重复）", yoghurtTasks.length === 1, "count=" + yoghurtTasks.length);

// 4. 补货 → 该物品的「买」待办自动关闭
await post("/api/stock/receipt", { idempotencyKey: key("r"), itemId: milk, quantity: 10, locationId: locs["冰箱"], expiryDate: day(30) });
const s3 = await post("/api/tasks/sync", {});
const milkBuyDone = ((await req("/api/tasks?done=1")).body.tasks ?? []).filter((t) => t.title === "买 " + tag + "牛奶 2 盒");
check("补货后「买牛奶」自动完成并写明原因", s3.body.closed.some((c) => c.includes(tag + "牛奶")) && milkBuyDone.some((t) => String(t.note ?? "").includes("已补足")),
  "closed=" + JSON.stringify((s3.body.closed ?? []).filter((c) => c.includes(tag)).slice(0, 2)));

// 5. 手动完成临期待办，但批次还在 → 下次对账应自动恢复（提醒不能丢）
await post("/api/tasks/" + yoghurtTasks[0].id + "/done", { done: true });
const s4 = await post("/api/tasks/sync", {});
check("批次仍在时，已完成的临期待办会自动恢复", (s4.body.reopened ?? []).some((t) => t.includes(tag + "酸奶")), "reopened=" + JSON.stringify(s4.body.reopened));

// 6. 把批次吃光 → 待办自动关闭
await post("/api/stock/issue", { idempotencyKey: key("i"), itemId: yoghurt, quantity: 2 });
const s5 = await post("/api/tasks/sync", {});
check("批次清空后临期待办自动完成", s5.body.closed.some((c) => c.includes(tag + "酸奶")), "closed=" + JSON.stringify(s5.body.closed).slice(0, 120));

// 7. 日历四类事件
const cal = await req("/api/calendar?from=" + today + "&to=" + day(14));
const types = new Set((cal.body.events ?? []).map((e) => e.type));
check("日历含 expiry（临期）", types.has("expiry"), "byType=" + JSON.stringify(cal.body.byType));
check("日历含 chore（家务）", types.has("chore"));
check("日历含 care（用药/耗材）", types.has("care"), "byType=" + JSON.stringify(cal.body.byType));
check("日历含 buy（采购）", types.has("buy"), "byType=" + JSON.stringify(cal.body.byType));

// 8. 今日视图（内部会先对账，且要包含"没有截止日"的积压待办）
const t = await req("/api/today");
check("今日视图：缺货清单含本脚本的滤芯", (t.body.lowStock ?? []).some((i) => i.name.includes(tag + "滤芯")));
check("今日视图：待办非空且含无截止日的积压待办", (t.body.tasks ?? []).some((x) => x.title === "买 " + tag + "滤芯 1 支"), JSON.stringify(t.body.counts));
check("今日视图幂等（sync.created 为空）", (t.body.sync.created ?? []).length === 0, "created=" + JSON.stringify(t.body.sync.created));

// 9. 手工待办（可重复创建，不该被来源唯一索引挡住）+ 模板 CRUD
const manual1 = await post("/api/tasks", { title: tag + "交水电费", kind: "purchase", dueDate: today });
const manual2 = await post("/api/tasks", { title: tag + "交水电费", kind: "purchase", dueDate: today });
const listed = (await req("/api/tasks?to=" + today)).body.tasks ?? [];
check("手工新增待办出现在今日列表", manual1.status === 200 && listed.some((x) => x.title.includes(tag + "交水电费")));
check("同一天可以建两条同名手工待办（不撞唯一索引）", manual2.status === 200, "status=" + manual2.status);
const tpl = await post("/api/task-templates", { title: tag + "擦阳台", cycleRule: "FREQ=WEEKLY;BYDAY=SA", nextDueDate: day(1) });
const sync6 = await post("/api/tasks/sync", {});
check("新增周期模板后 sync 立刻展开", tpl.status === 200 && (sync6.body.created ?? []).some((x) => x.includes(tag + "擦阳台")), "created=" + JSON.stringify((sync6.body.created ?? []).filter((x) => x.includes(tag + "擦阳台"))));

console.log(failed === 0 ? "\nM2 验收全部通过" : "\nM2 验收失败 " + failed + " 项");
process.exitCode = failed === 0 ? 0 : 1;
