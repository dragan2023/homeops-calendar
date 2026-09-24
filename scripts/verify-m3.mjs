// M3 验收：采购闭环（缺货→清单→收货一键入库）+ MCP 端点（token 认证 / tools.list / tools.call）
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
let token = "";
let failed = 0;
const tag = "M3-" + Date.now().toString().slice(-7);
const key = (s) => "m3-" + s + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : ""));
  if (!ok) failed++;
}
async function req(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });
  const sc = res.headers.getSetCookie?.() ?? [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body };
}
const post = (p, b) => req(p, { method: "POST", body: JSON.stringify(b) });

// --- MCP 客户端 ---
let rpcId = 0;
async function mcp(method, params, opts = {}) {
  const res = await fetch(BASE + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(opts.token === null ? {} : { authorization: "Bearer " + (opts.token ?? token) }) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params: params ?? {} }),
  });
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body, sessionHeader: res.headers.get("mcp-session-id") };
}
const callTool = async (name, args) => {
  const r = await mcp("tools/call", { name, arguments: args ?? {} });
  const text = r.body?.result?.content?.[0]?.text ?? "";
  let parsed = null; try { parsed = JSON.parse(text); } catch {}
  return { isError: r.body?.result?.isError === true, parsed, text, status: r.status };
};

await post("/api/login", { username: USER, password: PASS });
const meta = await req("/api/meta");
const locs = Object.fromEntries((meta.body.locations ?? []).map((l) => [l.name, l.id]));

// 1. 家庭级 Token
const created = await post("/api/tokens", { name: tag + " Cherry Studio" });
token = created.body.token ?? "";
check("POST /api/tokens 签发家庭级 Token（只显示一次）", created.status === 200 && token.startsWith("hpx_") && created.body.token_prefix?.length === 12, "prefix=" + created.body.token_prefix);
const listed = await req("/api/tokens");
check("Token 列表只暴露前缀，不返回明文", (listed.body.tokens ?? []).some((t) => t.token_prefix === created.body.token_prefix) && !JSON.stringify(listed.body).includes(token.slice(10)));

// 2. MCP 握手
const init = await mcp("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "verify-m3", version: "0" } });
check("MCP initialize 成功并返回 serverInfo", init.status === 200 && init.body?.result?.serverInfo?.name === "homeops-calendar", JSON.stringify(init.body?.result?.capabilities));
check("MCP 返回 mcp-session-id 头", String(init.sessionHeader ?? "").startsWith("homeops-"), String(init.sessionHeader));
const note = await fetch(BASE + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
check("MCP 通知（无 id）返回 202 且无响应体", note.status === 202, "status=" + note.status);

// 3. 工具清单
const list = await mcp("tools/list", {});
const tools = list.body?.result?.tools ?? [];
const names = tools.map((t) => t.name);
const must = ["get_home_overview", "search_items", "record_receipt", "record_issue", "transfer_stock", "count_stock", "expiring_soon", "low_stock", "list_tasks", "sync_tasks", "list_shopping", "add_shopping", "receive_shopping", "suggestions_to_shopping", "get_calendar"];
check("tools/list 返回 ≥25 个工具", tools.length >= 25, "count=" + tools.length);
check("核心工具齐全", must.every((m) => names.includes(m)), "缺失=" + must.filter((m) => !names.includes(m)).join(","));
check("每个工具都有 JSON Schema（参数可被标准客户端渲染）", tools.every((t) => t.inputSchema && t.inputSchema.type === "object"), JSON.stringify(tools[0].inputSchema).slice(0, 90));

// 4. 未授权必须被挡
const noAuth = await mcp("tools/list", {}, { token: null });
check("无 Token 调 MCP 返回 401", noAuth.status === 401, "status=" + noAuth.status);

// 5. 只读工具
const overview = await callTool("get_home_overview", {});
check("tools/call get_home_overview 返回总览", !overview.isError && typeof overview.parsed?.counts?.tasks === "number", JSON.stringify(overview.parsed?.counts));
check("get_home_overview 顺带做了待办对账", typeof overview.parsed?.sync?.created?.length === "number", "created=" + (overview.parsed?.sync?.created?.length ?? "?"));

// 6. 写工具：建物品 + 入库（幂等）
const item = await callTool("create_item", { name: tag + "洗衣液", baseUnit: "瓶", categoryName: "日化", reorderPoint: 3, reorderQuantity: 2 });
const itemId = item.parsed?.id;
const rk = key("receipt");
const r1 = await callTool("record_receipt", { idempotencyKey: rk, itemId, quantity: 2, locationName: "储物柜", expiryDate: day(300), unitCostMinor: 3900 });
const r1again = await callTool("record_receipt", { idempotencyKey: rk, itemId, quantity: 2, locationName: "储物柜" });
check("create_item + record_receipt 可用", !item.isError && !r1.isError && r1.parsed?.quantity === 2, "itemId=" + String(itemId).slice(0, 8));
check("MCP 写操作幂等重放不重复入库", r1again.parsed?.replayed === true, "replayed=" + r1again.parsed?.replayed);
const search = await callTool("search_items", { q: tag + "洗衣液" });
check("search_items 能查到刚入库的物品（数量=2）", Number(search.parsed?.[0]?.quantity) === 2, JSON.stringify(search.parsed?.[0]?.quantity));

// 7. 采购闭环：缺货 → 清单 → 收货一键入库
const low = await callTool("low_stock", {});
const suggestions = await callTool("suggestions_to_shopping", {});
const shopping = await callTool("list_shopping", {});
const myRow = (shopping.parsed ?? []).find((s) => s.name === tag + "洗衣液");
check("缺货建议能一键进购物清单", !suggestions.isError && !!myRow, "added=" + JSON.stringify(suggestions.parsed?.added).slice(0, 80));
const receive = await callTool("receive_shopping", { shoppingId: myRow?.id, quantity: 3, expiryDate: day(300), locationName: "储物柜" });
const afterReceive = await callTool("search_items", { q: tag + "洗衣液" });
check("receive_shopping 一键入库（2+3=5 且清单行完成）", !receive.isError && receive.parsed?.fullyCompleted === true && Number(afterReceive.parsed?.[0]?.quantity) === 5,
  "qty=" + afterReceive.parsed?.[0]?.quantity);
const shoppingAfter = await callTool("list_shopping", {});
check("收货后清单里不再有未完成行", !(shoppingAfter.parsed ?? []).some((s) => s.id === myRow?.id), "行已移到已完成");

// 8. 领用/调拨/盘点 通过 MCP
const issue = await callTool("record_issue", { idempotencyKey: key("issue"), itemId, quantity: 1, reason: "洗衣服" });
const transfer = await callTool("transfer_stock", { idempotencyKey: key("tr"), itemId, quantity: 2, fromLocationName: "储物柜", toLocationName: "阳台" });
const counted = await callTool("count_stock", { idempotencyKey: key("cnt"), itemId, locationName: "储物柜", countedQuantity: 1 });
const lv = await callTool("list_items", { itemId });
check("MCP 领用/调拨/盘点都能跑通", !issue.isError && !transfer.isError && !counted.isError && counted.parsed?.after === 1,
  "count: before=" + counted.parsed?.before + " after=" + counted.parsed?.after);

// 9. 待办与日历工具
const tasks = await callTool("list_tasks", {});
const cal = await callTool("get_calendar", {});
check("list_tasks / get_calendar 可用", Array.isArray(tasks.parsed) && Array.isArray(cal.parsed?.events), "tasks=" + (tasks.parsed?.length ?? 0) + " events=" + (cal.parsed?.events?.length ?? 0));

// 10. 参数校验：缺幂等键必须被挡下
const bad = await callTool("record_issue", { itemId, quantity: 1 });
check("缺幂等键的写操作被参数校验挡住", bad.isError === true && String(bad.text).includes("参数不合法"));
const unknown = await mcp("tools/call", { name: "no_such_tool", arguments: {} });
check("未知工具返回 JSON-RPC 错误", unknown.body?.error?.code === -32602, JSON.stringify(unknown.body?.error));

// 11. 纯 HTTP 采购闭环（前端路径）
const httpAdd = await post("/api/shopping", { name: tag + "纸巾", quantity: 2, unit: "包", plannedDate: day(1) });
const httpReceive = await post("/api/shopping/" + httpAdd.body.id + "/receive", { quantity: 2, locationName: "储物柜", expiryDate: day(400) });
const httpList = await req("/api/shopping");
check("HTTP 采购闭环：加清单 → 收货入库 → 清单完成", httpReceive.status === 200 && httpReceive.body.fullyCompleted === true && !(httpList.body.items ?? []).some((s) => s.id === httpAdd.body.id),
  "batchCreated=" + !!httpReceive.body.batchId);

// 12. 撤销 Token 后立即失效
const revoked = await req("/api/tokens/" + created.body.id, { method: "DELETE" });
const afterRevoke = await mcp("tools/list", {});
check("撤销 Token 后 MCP 立刻 401", revoked.status === 200 && afterRevoke.status === 401, "status=" + afterRevoke.status);

console.log(failed === 0 ? "\nM3 验收全部通过" : "\nM3 验收失败 " + failed + " 项");
process.exitCode = failed === 0 ? 0 : 1;
