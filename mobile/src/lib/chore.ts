/** 周期家务的规则读写：与后端同一套 iCalendar 风格（FREQ=WEEKLY;BYDAY=SU / FREQ=MONTHLY;BYMONTHDAY=1 / FREQ=DAILY;INTERVAL=3） */

export type CycleKind = "weekly" | "monthly" | "daily";
export type CycleSpec = { kind: CycleKind; interval: number; weekdays: string[]; monthday: number };

export const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const WEEKDAY_LABEL: Record<string, string> = { MO: "一", TU: "二", WE: "三", TH: "四", FR: "五", SA: "六", SU: "日" };

export function buildCycle(spec: CycleSpec): string {
  if (spec.kind === "daily") return "FREQ=DAILY;INTERVAL=" + Math.max(1, Math.floor(spec.interval || 1));
  if (spec.kind === "monthly") return "FREQ=MONTHLY;BYMONTHDAY=" + Math.min(28, Math.max(1, Math.floor(spec.monthday || 1)));
  const days = spec.weekdays.length ? WEEKDAY_CODES.filter((d) => spec.weekdays.includes(d)) : ["SU"];
  return "FREQ=WEEKLY;BYDAY=" + days.join(",");
}

export function parseCycle(rule: string): CycleSpec {
  const parts: Record<string, string> = {};
  for (const kv of String(rule ?? "").split(";")) {
    const [k, v] = kv.split("=");
    if (k) parts[k.trim().toUpperCase()] = (v ?? "").trim();
  }
  const freq = (parts.FREQ ?? "WEEKLY").toUpperCase();
  if (freq === "DAILY") return { kind: "daily", interval: Number(parts.INTERVAL ?? 1) || 1, weekdays: [], monthday: 1 };
  if (freq === "MONTHLY") return { kind: "monthly", interval: 1, weekdays: [], monthday: Number(parts.BYMONTHDAY ?? 1) || 1 };
  const days = (parts.BYDAY ?? "SU").split(",").map((d) => d.trim().toUpperCase()).filter((d) => WEEKDAY_CODES.includes(d));
  return { kind: "weekly", interval: 1, weekdays: days.length ? days : ["SU"], monthday: 1 };
}

/** 界面里只说人话，不显示 iCalendar 串 */
export function humanCycle(rule: string): string {
  const s = parseCycle(rule);
  if (s.kind === "daily") return s.interval === 1 ? "每天" : "每 " + s.interval + " 天";
  if (s.kind === "monthly") return "每月 " + s.monthday + " 号";
  const picked = WEEKDAY_CODES.filter((d) => s.weekdays.includes(d)).map((d) => WEEKDAY_LABEL[d] ?? d);
  if (picked.length === 7) return "每天";
  if (picked.length === 1) return "每周" + picked[0];
  return "每周" + picked.join("、周");
}
