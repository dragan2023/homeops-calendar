/**
 * 主题层：把 packages/themes/tokens.css 生成的令牌（src/theme/generated.ts）包成 React Context。
 * 组件只消费 c(颜色) / n(尺寸数值) / misc(字体等)，绝不写死色值 —— 与 Web 端同一套令牌。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TextStyle, ViewStyle } from "react-native";
import { DEFAULT_THEME, THEMES, THEME_META, type ThemeId, type ThemeMeta, type RnTokens } from "./generated";

const STORAGE_KEY = "homeops-theme";

type Ctx = {
  themeId: ThemeId;
  meta: ThemeMeta;
  tokens: RnTokens;
  c: Record<string, string>;
  n: Record<string, number>;
  misc: Record<string, unknown>;
  setTheme: (id: ThemeId) => void;
};
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && THEMES[saved as ThemeId]) setThemeId(saved as ThemeId);
      })
      .catch(() => undefined);
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => undefined);
  }, []);

  const value = useMemo<Ctx>(() => {
    const tokens = THEMES[themeId] ?? THEMES[DEFAULT_THEME];
    return {
      themeId,
      meta: THEME_META.find((m) => m.id === themeId) ?? THEME_META[0],
      tokens,
      c: tokens.colors,
      n: tokens.nums,
      misc: tokens.misc,
      setTheme,
    };
  }, [themeId, setTheme]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return ctx;
}

/** 常用样式工厂：全部来自令牌，换主题即换观感 */
export function useUi() {
  const { c, n, misc } = useTheme();
  return useMemo(() => {
    const card: ViewStyle = {
      backgroundColor: c.surface,
      borderRadius: n.radiusCard,
      borderWidth: n.borderW,
      borderColor: c.border,
      overflow: "hidden",
      elevation: n.shadowCardElevation ?? 0,
    };
    const row: ViewStyle = {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: n.ctlH,
      borderBottomWidth: n.borderW,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    };
    const thumb: ViewStyle = {
      width: 40, height: 40, alignItems: "center", justifyContent: "center",
      borderRadius: n.radiusCtl, borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2,
    };
    const pill = (tone: "warn" | "danger" | "success" | "info" | "accent" | "plain"): ViewStyle => ({
      paddingHorizontal: 9, paddingVertical: 4, borderRadius: n.radiusPill,
      backgroundColor: (c[tone + "Soft"] ?? c.surface2) as string,
      borderWidth: n.borderW, borderColor: (c[tone + "Soft"] ?? c.border) as string,
    });
    const pillText = (tone: "warn" | "danger" | "success" | "info" | "accent" | "plain"): TextStyle => ({
      color: (c[tone] ?? c.text3) as string, fontSize: 11, fontWeight: "600",
    });
    const btn: ViewStyle = {
      minHeight: n.ctlH, alignItems: "center", justifyContent: "center", paddingHorizontal: 14,
      borderRadius: n.radiusCtl, borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface,
      elevation: n.shadowCtlElevation ?? 0,
    };
    const btnPrimary: ViewStyle = { ...btn, backgroundColor: c.primary, borderColor: c.primary };
    const h1: TextStyle = { fontSize: n.fsH1, fontWeight: "700", color: c.text };
    const h2: TextStyle = { fontSize: n.fsH2, fontWeight: "700", color: c.text, letterSpacing: Number(misc.labelTracking ?? 0.12) * 12, textTransform: (misc.labelTransform === "uppercase" ? "uppercase" : "none") as TextStyle["textTransform"] };
    const body: TextStyle = { fontSize: 15, color: c.text };
    const sub: TextStyle = { fontSize: 11.5, color: c.text3, marginTop: 2 };
    const note: TextStyle = { fontSize: 11.5, color: c.text3, marginTop: 10 };
    return { card, row, thumb, pill, pillText, btn, btnPrimary, h1, h2, body, sub, note };
  }, [c, n, misc]);
}
