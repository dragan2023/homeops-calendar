import { DEFAULT_THEME, THEMES, THEME_META } from "../theme/generated";

const IDS = ["swiss", "brutal", "clay", "kawaii", "mecha", "midnight", "memphis", "glass"] as const;

describe("主题令牌（由 packages/themes/tokens.css 生成）", () => {
  it("8 套主题齐全，默认瑞士极简", () => {
    expect(Object.keys(THEMES).sort()).toEqual([...IDS].sort());
    expect(DEFAULT_THEME).toBe("swiss");
    expect(THEME_META).toHaveLength(8);
    THEME_META.forEach((m) => expect(m.swatch).toHaveLength(4));
  });

  it("每套主题都填满了组件真正会用到的令牌", () => {
    for (const id of IDS) {
      const t = THEMES[id];
      for (const key of ["bg", "surface", "surface2", "border", "text", "text2", "text3", "onPrimary", "primary", "primarySoft", "warn", "warnSoft", "danger", "dangerSoft", "success", "successSoft", "accent", "accentSoft", "info", "infoSoft", "navBg", "navFg", "navFgActive"]) {
        expect([id, "colors." + key, typeof t.colors[key]]).toEqual([id, "colors." + key, "string"]);
      }
      for (const key of ["radiusCard", "radiusCtl", "radiusPill", "borderW", "ctlH", "gap", "pad", "fsH1", "fsH2", "iconStroke", "dur"]) {
        expect([id, "nums." + key, typeof t.nums[key]]).toEqual([id, "nums." + key, "number"]);
      }
      expect([id, "misc.labelTracking", t.misc.labelTracking === undefined]).toEqual([id, "misc.labelTracking", false]);
      expect([id, "misc.labelTransform", t.misc.labelTransform === undefined]).toEqual([id, "misc.labelTransform", false]);
    }
  });

  it("深浅主题的差异真实存在（不是复制粘贴）", () => {
    expect(THEMES.mecha.colors.bg).not.toBe(THEMES.swiss.colors.bg);
    expect(THEMES.brutal.nums.borderW).toBeGreaterThan(THEMES.swiss.nums.borderW);
    expect(THEMES.glass.colors.surface).toMatch(/rgba/);
  });
});
