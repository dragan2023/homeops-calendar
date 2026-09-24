import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 机器守卫：凡是带输入框的地方，都必须保证键盘弹起时不挡住输入框（用户 2026-09-24 实机反馈）。
 *  规则：①整屏里有输入框 → 必须接 useKeyboardOverlap；②组件自己开浮层（Modal/Sheet）且有输入框 → 必须自己避让或渲染在会抬起的 Sheet 里；
 *  ③普通组件（如列表里的搜索框）不开浮层，跟着所在整屏一起让位即可。 */
const SRC = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => join(dir, f));
}
const read = (p: string) => readFileSync(p, "utf8");
const short = (p: string) => p.split(/[\\/]/).slice(-2).join("/");

describe("输入框的机器守卫", () => {
  it("每个带输入框的整屏都接了键盘避让", () => {
    const offenders = tsxFiles(join(SRC, "screens"))
      .filter((p) => read(p).includes("<TextInput"))
      .filter((p) => !read(p).includes("useKeyboardOverlap"))
      .map(short);
    expect(offenders).toEqual([]);
  });

  it("自己开浮层又有输入框的组件，必须自己避让或渲染在会抬起的弹层里", () => {
    const offenders = tsxFiles(join(SRC, "components"))
      .filter((p) => {
        const t = read(p);
        const hasInput = t.includes("<TextInput");
        const ownOverlay = t.includes("Modal") || t.includes("<Sheet");
        if (!hasInput || !ownOverlay) return false;
        return !t.includes("useKeyboardOverlap") && !t.includes("<Sheet");
      })
      .map(short);
    expect(offenders).toEqual([]);
  });
});
