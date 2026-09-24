import { buildCycle, humanCycle, parseCycle } from "../lib/chore";

describe("周期家务的规则读写", () => {
  it("把规则说成人话（界面里不出现 iCalendar 串）", () => {
    expect(humanCycle("FREQ=WEEKLY;BYDAY=SU")).toBe("每周日");
    expect(humanCycle("FREQ=WEEKLY;BYDAY=MO,TH")).toBe("每周一、周四");
    expect(humanCycle("FREQ=MONTHLY;BYMONTHDAY=1")).toBe("每月 1 号");
    expect(humanCycle("FREQ=DAILY;INTERVAL=3")).toBe("每 3 天");
    expect(humanCycle("FREQ=DAILY;INTERVAL=1")).toBe("每天");
  });

  it("人话与规则能来回转（改周期不会把原来的设置弄丢）", () => {
    const spec = parseCycle("FREQ=WEEKLY;BYDAY=WE,SU");
    expect(spec.kind).toBe("weekly");
    expect(spec.weekdays).toEqual(["WE", "SU"]);
    expect(buildCycle(spec)).toBe("FREQ=WEEKLY;BYDAY=WE,SU");

    expect(buildCycle(parseCycle("FREQ=MONTHLY;BYMONTHDAY=10"))).toBe("FREQ=MONTHLY;BYMONTHDAY=10");
    expect(buildCycle(parseCycle("FREQ=DAILY;INTERVAL=14"))).toBe("FREQ=DAILY;INTERVAL=14");
  });

  it("边界：一个都不选就按周日；每月日期压到 1–28；天数至少 1", () => {
    expect(buildCycle({ kind: "weekly", interval: 1, weekdays: [], monthday: 1 })).toBe("FREQ=WEEKLY;BYDAY=SU");
    expect(buildCycle({ kind: "monthly", interval: 1, weekdays: [], monthday: 40 })).toBe("FREQ=MONTHLY;BYMONTHDAY=28");
    expect(buildCycle({ kind: "daily", interval: 0, weekdays: [], monthday: 1 })).toBe("FREQ=DAILY;INTERVAL=1");
  });
});
