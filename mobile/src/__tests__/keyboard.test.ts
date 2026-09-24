import { keyboardOverlap } from "../lib/keyboard";

describe("键盘遮挡量（输入框必须待在输入法上方）", () => {
  it("系统没压缩窗口时，键盘高度全部由自己让出", () => {
    expect(keyboardOverlap(300, 800, 800)).toBe(300);
  });

  it("系统已经压缩过窗口时只补差额，避免重复抬高", () => {
    expect(keyboardOverlap(300, 800, 500)).toBe(0);
    expect(keyboardOverlap(400, 800, 600)).toBe(200);
  });

  it("键盘收起或窗口变大都不会算出负数", () => {
    expect(keyboardOverlap(0, 800, 800)).toBe(0);
    expect(keyboardOverlap(300, 800, 900)).toBe(300);
  });
});
