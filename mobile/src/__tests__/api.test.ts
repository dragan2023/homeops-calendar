import { ApiError, api, idemKey, setToken } from "../services/api";

function mockFetch(payload: unknown, ok = true, status = 200) {
  const fn = jest.fn(async () => ({ ok, status, text: async () => JSON.stringify(payload) }));
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

describe("移动端 API 客户端", () => {
  beforeEach(() => setToken(null));

  it("不登录时不带 Authorization，请求路径正确", async () => {
    const f = mockFetch({ ok: true, date: "2026-09-21" });
    await api.today();
    const [url, init] = f.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toMatch(/\/api\/today$/);
    expect(init.headers.authorization).toBeUndefined();
  });

  it("setToken 之后所有请求都带 Bearer（RN 没有 cookie jar）", async () => {
    setToken("hpx_test_token");
    const f = mockFetch({ ok: true, tasks: [] });
    await api.tasks();
    const [, init] = f.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers.authorization).toBe("Bearer hpx_test_token");
  });

  it("写操作带 content-type 与 body（幂等键在其中）", async () => {
    setToken("t");
    const f = mockFetch({ ok: true, batchId: "b1" });
    await api.receipt({ idempotencyKey: "k".repeat(10), name: "酸奶", quantity: 1 });
    const [, init] = f.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body).idempotencyKey).toHaveLength(10);
  });

  it("非 2xx 抛 ApiError（含状态码与 error 文本）", async () => {
    mockFetch({ error: "unauthorized" }, false, 401);
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    await expect(api.me()).rejects.toMatchObject({ status: 401, message: "unauthorized" });
  });

  it("幂等键每次不同（防重复记账靠它）", () => {
    const keys = new Set(Array.from({ length: 50 }, () => idemKey("receipt", "item-123")));
    expect(keys.size).toBe(50);
  });
});
