import React, { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";
import { useKeyboardOverlap } from "../lib/keyboard";
import { useTheme, useUi } from "../theme";
import { Btn, toast } from "../components/ui";

export function LoginScreen() {
  const { c, n } = useTheme();
  const ui = useUi();
  const keyboard = useKeyboardOverlap();
  const { login, setup, baseUrl } = useAuth();
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [homeName, setHomeName] = useState("我家");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ initialized: boolean; username: string | null; homeName: string | null; counts: { items: number; tasks: number; shopping: number } | null } | null>(null);

  // 关键：先问服务器有没有账号，别让用户"上来就登录"却根本没有账号
  useEffect(() => {
    api
      .setupStatus()
      .then((st) => {
        setStatus(st);
        if (!st.initialized) setMode("setup");
        else if (st.username) setUsername(st.username);
      })
      .catch(() => setStatus(null));
  }, []);

  const input = {
    borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, color: c.text,
    borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12, marginTop: 8,
  };

  async function submit() {
    if (password.length < 6) {
      toast("密码至少 6 位");
      return;
    }
    setBusy(true);
    const res = mode === "setup" ? await setup(homeName, username, password) : await login(username, password);
    setBusy(false);
    if (!res.ok) {
      toast(res.message === "already_initialized" ? "已经有账号了，请用已有账号登录（忘记密码就在电脑上跑 set_password.bat）" : "失败：" + (res.message ?? "未知错误"));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, marginBottom: keyboard }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 64 }}>
        <Text style={ui.h1}>家庭仓管日历</Text>
        {status && (
          <View style={[ui.card, { padding: 12, marginTop: 12, backgroundColor: status.initialized ? c.surface2 : c.primarySoft }]}>
            <Text style={{ color: c.text, fontWeight: "700" }}>
              {status.initialized ? "这台服务器已经有账号了" : "这台服务器还没有账号（第一次使用）"}
            </Text>
            <Text style={ui.sub}>
              {status.initialized
                ? "账号：" + status.username + (status.homeName ? " · 家庭：" + status.homeName : "") + (status.counts ? " · 已有 " + status.counts.items + " 样物品" : "")
                : "下面填三行就建好了：家庭名 + 用户名 + 密码（≥6 位）。你就是管理员。"}
            </Text>
            {status.initialized && (
              <Text style={ui.note}>
                不知道密码？在电脑上双击 set_password.bat 重设，或双击 reset_db.bat 清库重来。
              </Text>
            )}
          </View>
        )}
        <Text style={ui.note}>记录家里有什么、放在哪，并告诉你今天该吃什么、该买什么、该做什么。</Text>

        <View style={[ui.card, { padding: 16, marginTop: 20 }]}>
          <Text style={{ color: c.text3, fontSize: 12 }}>服务器地址（自动识别的，一般不用管）</Text>
          <Text style={{ color: c.text, fontSize: 12, marginTop: 4 }} selectable>{baseUrl}</Text>

          {mode === "setup" && (
            <>
              <Text style={{ color: c.text3, fontSize: 12, marginTop: 16 }}>家庭名</Text>
              <TextInput style={input} value={homeName} onChangeText={setHomeName} placeholder="我家" placeholderTextColor={c.text3} />
            </>
          )}
          <Text style={{ color: c.text3, fontSize: 12, marginTop: 16 }}>用户名</Text>
          <TextInput style={input} value={username} onChangeText={setUsername} autoCapitalize="none" placeholderTextColor={c.text3} />
          <Text style={{ color: c.text3, fontSize: 12, marginTop: 16 }}>密码（至少 6 位）</Text>
          <TextInput style={input} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={c.text3} />
          <Btn label={busy ? "请稍候…" : mode === "setup" ? "初始化并进入" : "登录"} primary disabled={busy} onPress={() => void submit()} style={{ marginTop: 16 }} />
          <Btn label={mode === "setup" ? "我已经有账号，去登录" : "第一次使用，去初始化"} onPress={() => setMode(mode === "setup" ? "login" : "setup")} style={{ marginTop: 10 }} />
        </View>

        <Text style={ui.note}>登录后就记住你了，下次打开不用再输密码；账号信息只存在这台手机和你自己的电脑上。</Text>
      </ScrollView>
    </View>
  );
}
