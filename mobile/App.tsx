/** 家庭仓管日历 — 移动端根组件（Expo Go 真机测试） */
import { StatusBar } from "expo-status-bar";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import React from "react";

import { AuthProvider } from "./src/contexts/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "./src/theme";
import { ToastHost } from "./src/components/ui";

function NavShell() {
  const { c, meta } = useTheme();
  const navTheme = {
    ...DefaultTheme,
    dark: meta.id === "mecha" || meta.id === "midnight",
    colors: { ...DefaultTheme.colors, background: c.bg, card: c.surface, text: c.text, primary: c.primary, border: c.border },
  };
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={navTheme.dark ? "light" : "dark"} />
      <RootNavigator />
      <ToastHost />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <NavShell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
