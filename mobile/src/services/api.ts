/**
 * 家庭仓管日历 — 移动端 API 客户端
 * 真机（Expo Go）下后端地址自动推导：手机加载 Metro 的那台电脑就是后端所在电脑，
 * IP 相同、端口换成 app.json 里的 extra.apiPort（默认 8787）。
 * 需要固定地址（隧道/远程后端）时用 EXPO_PUBLIC_API_URL=http://<IP>:8787 覆盖。
 * 认证：React Native 没有浏览器 cookie jar，所以登录时让后端直接签发 Bearer Token（issueToken: true）。
 */
import Constants from "expo-constants";
import appConfig from "../../app.json";

const API_PORT = (appConfig.expo?.extra?.apiPort as number | undefined) ?? 8787;

function deriveLanApiBase(): string {
  const host = (Constants.expoConfig?.hostUri ?? "").split(":")[0] ?? "";
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? "http://" + host + ":" + API_PORT : "";
}

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL || deriveLanApiBase() || ((appConfig.expo?.extra?.apiBaseUrl as string) || "") || "http://localhost:" + API_PORT;

let token: string | null = null;
export function setToken(next: string | null): void {
  token = next;
}
export function getToken(): string | null {
  return token;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, String(body?.error ?? res.statusText));
  return body as T;
}

const post = <T,>(p: string, body?: unknown) => request<T>(p, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T,>(p: string, body: unknown) => request<T>(p, { method: "PATCH", body: JSON.stringify(body) });

export const api = {
  base: API_BASE,
  health: () => request<{ ok: boolean }>("/healthz"),
  login: (input: { username: string; password: string }) =>
    post<{ ok: boolean; token?: string; username: string }>("/api/login", { ...input, issueToken: true, tokenName: "移动端" }),
  setup: (input: { homeName: string; username: string; password: string }) =>
    post<{ ok: boolean; token?: string }>("/api/setup", { ...input, issueToken: true }),
  me: () => request<{ ok: boolean; user: { username: string; homeId: string; homeName: string } }>("/api/me"),
  /** 公开接口：这台服务器是否已经有账号（App 靠它决定显示"初始化"还是"登录"） */
  setupStatus: () =>
    request<{ ok: boolean; initialized: boolean; homeName: string | null; username: string | null; counts: { items: number; tasks: number; shopping: number } | null }>(
      "/api/setup-status",
    ),
  meta: () => request<Meta>("/api/meta"),
  today: () => request<TodaySummary>("/api/today"),
  calendar: (from: string, to: string) => request<{ ok: boolean; events: CalendarEvent[]; byType: Record<string, number> }>("/api/calendar?from=" + from + "&to=" + to),
  items: (q?: string) => request<{ ok: boolean; items: Item[] }>("/api/items" + (q ? "?q=" + encodeURIComponent(q) : "")),
  item: (id: string) => request<{ ok: boolean; item: Item; batches: Batch[]; transactions: Tx[] }>("/api/items/" + id),
  levels: () => request<{ ok: boolean; levels: Level[] }>("/api/stock/levels"),
  receipt: (body: Record<string, unknown>) => post<Record<string, unknown>>("/api/stock/receipt", body),
  issue: (body: Record<string, unknown>) => post<Record<string, unknown>>("/api/stock/issue", body),
  tasks: (params: { done?: boolean } = {}) => request<{ ok: boolean; tasks: Task[] }>("/api/tasks" + (params.done ? "?done=1" : "")),
  syncTasks: () => post<{ ok: boolean; created: string[]; reopened: string[]; closed: string[] }>("/api/tasks/sync"),
  createTask: (body: Record<string, unknown>) => post<{ ok: boolean; id: string }>("/api/tasks", body),
  completeTask: (id: string, done: boolean) => post<{ ok: boolean }>("/api/tasks/" + id + "/done", { done }),
  shopping: () => request<{ ok: boolean; items: ShoppingRow[] }>("/api/shopping"),
  shoppingFromLow: () => post<{ ok: boolean; added: string[] }>("/api/shopping/from-low"),
  receiveShopping: (id: string, body: Record<string, unknown>) => post<Record<string, unknown>>("/api/shopping/" + id + "/receive", body),
  updateItem: (id: string, body: Record<string, unknown>) => patch<{ ok: boolean }>("/api/items/" + id, body),
  /** 容器（地点）列表：带启用状态与「几样 / 几件」，供选择弹窗与管理页使用 */
  locations: () => request<{ ok: boolean; locations: LocationRow[] }>("/api/locations"),
  createLocation: (body: { name: string; kind?: string; parentId?: string | null; sortOrder?: number }) =>
    post<{ ok: boolean; id: string }>("/api/locations", body),
  updateLocation: (id: string, body: { name?: string; kind?: string; sortOrder?: number; active?: number }) =>
    patch<{ ok: boolean }>("/api/locations/" + id, body),
  /** 周期家务模板：建/改/停用 */
  taskTemplates: () => request<{ ok: boolean; templates: TaskTemplate[] }>("/api/task-templates"),
  createTaskTemplate: (body: { title: string; cycleRule: string; nextDueDate: string; note?: string | null }) =>
    post<{ ok: boolean; id: string }>("/api/task-templates", body),
  updateTaskTemplate: (id: string, body: { title?: string; cycleRule?: string; nextDueDate?: string; active?: number }) =>
    patch<{ ok: boolean }>("/api/task-templates/" + id, body),
  /** 批量调拨：把选中的物品在来源容器里的全部数量搬到目标容器 */
  transferBatch: (body: { idempotencyKey: string; itemIds: string[]; fromLocationId: string; toLocationId: string }) =>
    post<{ ok: boolean; replayed?: boolean; movedItems?: string[]; movedUnits?: number }>("/api/stock/transfer-batch", body),
};

export type Meta = {
  ok: boolean;
  home: { id: string; name: string };
  counts: { items: number; batches: number; tasks: number; shopping: number };
  locations: { id: string; name: string; kind: string; sort_order: number }[];
  categories: { id: string; name: string }[];
  templates: { id: string; title: string; cycle_rule: string; next_due_date: string }[];
};
export type Item = {
  id: string; sku: string; barcode: string | null; name: string; base_unit: string; consumption_type: string;
  reorder_point: number; default_location_id: string | null; expiry_warn_days: number;
  category_name: string | null; quantity: number; first_expiry: string | null;
};
export type Batch = { id: string; batch_no: string | null; quantity: number; expiry_date: string | null; location_name: string | null };
export type Tx = { id: string; type: string; quantity: number; reason: string | null; occurred_at: string };
export type Level = { item_id: string; name: string; base_unit: string; location_id: string; location_name: string; quantity: number; first_expiry: string | null };
export type LocationRow = {
  id: string; parent_id: string | null; name: string; kind: string; sort_order: number;
  active: number; item_count: number; unit_count: number;
};
export type TaskTemplate = { id: string; title: string; note: string | null; cycle_rule: string; next_due_date: string; active: number };
export type Task = { id: string; title: string; note: string | null; kind: string; source_type: string; due_date: string | null; done: number };
export type ShoppingRow = { id: string; item_id: string | null; name: string; quantity: number; unit: string | null; planned_date: string | null; source: string; completed: number };
export type CalendarEvent = { date: string; type: "expiry" | "buy" | "chore" | "care"; title: string; refId: string };
export type TodaySummary = {
  ok: boolean; date: string;
  expiring: { batch_id: string; quantity: number; expiry_date: string; item_id: string; name: string; base_unit: string; location_name: string | null }[];
  lowStock: { item_id: string; name: string; base_unit: string; reorder_point: number; reorder_quantity: number; quantity: number }[];
  tasks: Task[];
  events: CalendarEvent[];
  shoppingPending: ShoppingRow[];
  counts: { expiring: number; lowStock: number; tasks: number; shopping: number };
};

/** 幂等键：重复点击不会重复记账 */
export function idemKey(action: string, subject = "x"): string {
  return action + "-" + subject.slice(0, 12) + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}
export function todayIso(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysUntil(iso: string): number {
  return Math.round((new Date(iso + "T00:00:00Z").getTime() - new Date(todayIso() + "T00:00:00Z").getTime()) / 86400000);
}
export function expiryText(iso: string): string {
  const n = daysUntil(iso);
  if (n < 0) return "已过期 " + -n + " 天";
  if (n === 0) return "今天到期";
  if (n === 1) return "明天到期";
  return "还剩 " + n + " 天";
}
