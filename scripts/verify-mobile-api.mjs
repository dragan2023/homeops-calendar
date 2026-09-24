// 移动端接口验收：手机（Expo Go）要用的每个接口都必须只用 Bearer Token 跑通（RN 没有 cookie jar）
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
let failed = 0;
let token = "";
const tag = "MOB-" + Date.now().toString().slice(-7);
const key = (s) => "mob-" + s + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : ""));
  if (!ok) failed++;
}
/** 只带 Bearer，不带任何 cookie —— 模拟手机端 */
async function req(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}), ...(init.headers ?? {}) },
  });
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body };
}
const post = (p, b) => req(p, { method: "POST", body: JSON.stringify(b) });

// 1) 登录时直接签发 Token（移动端路径）
const login = await post("/api/login", { username: USER, password: PASS, issueToken: true, tokenName: "verify-mobile" });
token = login.body?.token ?? "";
check("登录直接签发 Bearer Token（移动端不用 cookie）", login.status === 200 && token.startsWith("hpx_"), "prefix=" + login.body?.token_prefix);

// 2) 无 Token 必须 401
const anon = await fetch(BASE + "/api/today");
check("不带 Token 访问被拒（401）", anon.status === 401, "status=" + anon.status);

// 2b) 公开的初始化状态：手机 App 靠它判断该显示"初始化"还是"登录"
const setupStatus = await fetch(BASE + "/api/setup-status");
const stBody = await setupStatus.json();
check("GET /api/setup-status 无需登录即可用，且报告已初始化", setupStatus.status === 200 && stBody?.initialized === true && !!stBody?.username,
  "initialized=" + stBody?.initialized + " username=" + stBody?.username + " home=" + stBody?.homeName);

// 3) 手机端首屏要用的四个接口
const me = await req("/api/me");
const meta = await req("/api/meta");
const today = await req("/api/today");
check("GET /api/me（Token 有效）", me.status === 200 && !!me.body?.user?.homeId, JSON.stringify(me.body?.user?.username));
check("GET /api/meta（地点/分类/模板）", meta.status === 200 && (meta.body?.locations ?? []).length >= 5, "locations=" + (meta.body?.locations ?? []).length);
check("GET /api/today（统计 + 临期 + 缺货 + 待办 + 清单）", today.status === 200 && typeof today.body?.counts?.tasks === "number", JSON.stringify(today.body?.counts));

// 4) 录入 → 领用（走 Token）
const receipt = await post("/api/stock/receipt", { idempotencyKey: key("receipt"), name: tag + "移动端酸奶", quantity: 2, unit: "杯", locationName: "冰箱", expiryDate: day(2) });
const itemId = receipt.body?.itemId;
check("POST /api/stock/receipt（录入并生成批次）", receipt.status === 200 && !!receipt.body?.batchId, "batch=" + String(receipt.body?.batchId).slice(0, 8));
const items = await req("/api/items?q=" + tag);
check("GET /api/items?q=（搜索到刚录入的）", (items.body?.items ?? []).length > 0, "name=" + items.body?.items?.[0]?.name);
const detail = await req("/api/items/" + itemId);
check("GET /api/items/:id（批次 + 流水）", detail.status === 200 && (detail.body?.batches ?? []).length > 0);
const levels = await req("/api/stock/levels");
check("GET /api/stock/levels（库存聚合）", levels.status === 200 && Array.isArray(levels.body?.levels));
const issue = await post("/api/stock/issue", { idempotencyKey: key("issue"), itemId, quantity: 1 });
check("POST /api/stock/issue（FEFO 领用）", issue.status === 200 && (issue.body?.allocations ?? []).length > 0);

// 5) 待办 + 采购闭环 + 主题无关的写接口
const sync = await post("/api/tasks/sync", {});
const tasks = await req("/api/tasks");
check("POST /api/tasks/sync + GET /api/tasks", sync.status === 200 && Array.isArray(tasks.body?.tasks), "tasks=" + (tasks.body?.tasks ?? []).length);
const addShopping = await post("/api/shopping/from-low", {});
const shopping = await req("/api/shopping");
check("POST /api/shopping/from-low + GET /api/shopping", addShopping.status === 200 && Array.isArray(shopping.body?.items), "added=" + JSON.stringify(addShopping.body?.added).slice(0, 60));
const manual = await post("/api/tasks", { title: tag + "交水电费", kind: "purchase", dueDate: day(0) });
check("POST /api/tasks（手工待办）", manual.status === 200 && !!manual.body?.id);

// 6) 同一个 Token 也能调 MCP（手机之外，Agent 客户端共用家庭级 Token）
const mcp = await fetch(BASE + "/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer " + token },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
const mcpBody = await mcp.json();
check("同一个 Token 能调 MCP tools/list", mcp.status === 200 && (mcpBody?.result?.tools ?? []).length >= 25, "tools=" + (mcpBody?.result?.tools ?? []).length);

console.log(failed === 0 ? "\n移动端接口验收全部通过（Bearer-only 路径）" : "\n移动端接口验收失败 " + failed + " 项");
process.exitCode = failed === 0 ? 0 : 1;
