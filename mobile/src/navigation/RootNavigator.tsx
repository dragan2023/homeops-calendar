import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { Text, View } from "react-native";

import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../theme";
import { CalendarScreen } from "../screens/CalendarScreen";
import { ChoresScreen } from "../screens/ChoresScreen";
import { ContainersScreen } from "../screens/ContainersScreen";
import { InventoryScreen } from "../screens/InventoryScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { TasksScreen } from "../screens/TasksScreen";
import { TodayScreen } from "../screens/TodayScreen";

type RootStackParamList = { Main: undefined; Containers: undefined; Chores: undefined };
export type TabParamList = { Today: undefined; Calendar: undefined; Inventory: undefined; Tasks: undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// 说明：先用几何字符做标签图标（零依赖）；P1 换成 @expo/vector-icons 真图标
const GLYPH: Record<keyof TabParamList, string> = { Today: "◉", Calendar: "▦", Inventory: "▤", Tasks: "☑" };

function MainTabs() {
  const { c, n, meta } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: c.surface },
        headerTitleStyle: { color: c.text },
        headerTintColor: c.text,
        headerRight: () => (
          <View style={{ paddingRight: 14 }}>
            <Text style={{ color: c.text3, fontSize: 12 }}>{meta.name}</Text>
          </View>
        ),
        tabBarStyle: { backgroundColor: c.navBg, borderTopWidth: n.borderW, borderTopColor: c.border, height: 62, paddingBottom: 6 },
        // 底栏底色是 navBg（新粗野是纯黑），前景必须用 nav-fg 令牌，不能用 text——否则黑底黑字
        tabBarActiveTintColor: c.navFgActive,
        tabBarInactiveTintColor: c.navFg,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "700" },
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>{GLYPH[route.name as keyof TabParamList]}</Text>,
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} options={{ title: "今日" }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: "日历" }} />
      <Tab.Screen name="Inventory" component={InventoryScreen} options={{ title: "库存" }} />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{ title: "待办" }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { ready, token } = useAuth();
  const { c } = useTheme();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}>
        <Text style={{ color: c.text3 }}>启动中…</Text>
      </View>
    );
  }
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={token ? MainTabs : LoginScreen} />
      {token ? (
        <>
        <Stack.Screen
          name="Containers"
          component={ContainersScreen}
          options={{
            headerShown: true, title: "存储容器",
            headerStyle: { backgroundColor: c.surface }, headerTitleStyle: { color: c.text }, headerTintColor: c.text,
          }}
        />
        <Stack.Screen
          name="Chores"
          component={ChoresScreen}
          options={{
            headerShown: true, title: "周期家务",
            headerStyle: { backgroundColor: c.surface }, headerTitleStyle: { color: c.text }, headerTintColor: c.text,
          }}
        />
        </>
      ) : null}
    </Stack.Navigator>
  );
}
