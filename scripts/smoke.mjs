// M0 冒烟测试：起服务后直接跑，验证 初始化 → 登录 → 会话 → 元数据 全链路
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

function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : ""));
  if (!ok) failed++;
}
async function req(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON 响应 */ }
  return { status: res.status, body };
}

const health = await req("/healthz");
check("GET /healthz 200 且 db=ok", health.status === 200 && health.body?.ok === true, JSON.stringify(health.body));

const setup = await req("/api/setup", { method: "POST", body: JSON.stringify({ homeName: "我家", username: USER, password: PASS }) });
check("POST /api/setup 初始化或已初始化", setup.status === 200 || setup.status === 409, "status=" + setup.status);

if (setup.status === 409) {
  const login = await req("/api/login", { method: "POST", body: JSON.stringify({ username: USER, password: PASS }) });
  check("POST /api/login 登录成功（用冒烟账号）", login.status === 200, "status=" + login.status);
}

const me = await req("/api/me");
check("GET /api/me 返回家庭", me.status === 200 && !!me.body?.user?.homeId, JSON.stringify(me.body));

const meta = await req("/api/meta");
const locs = meta.body?.locations?.length ?? 0;
const cats = meta.body?.categories?.length ?? 0;
const tpls = meta.body?.templates?.length ?? 0;
check("GET /api/meta 默认地点齐全（≥5 且含冰箱）", locs >= 5 && (meta.body?.locations ?? []).some((l) => l.name === "冰箱"), "locations=" + locs);
check("GET /api/meta 默认分类齐全（≥9）", cats >= 9, "categories=" + cats);
check("GET /api/meta 默认周期家务模板（≥2）", tpls >= 2, "templates=" + tpls);

const unauth = await fetch(BASE + "/api/me");
check("未登录访问 /api/me 返回 401", unauth.status === 401, "status=" + unauth.status);

console.log(failed === 0 ? "\n冒烟测试全部通过" : "\n冒烟测试失败 " + failed + " 项");
process.exitCode = failed === 0 ? 0 : 1;
