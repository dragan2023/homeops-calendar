import fs from 'node:fs';
const p = 'mobile/src/screens/LoginScreen.tsx';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('setupStatus')) { console.log('已改'); process.exit(0); }
s = s.replace(
  'import { useAuth } from "../contexts/AuthContext";',
  'import { useAuth } from "../contexts/AuthContext";\nimport { api } from "../services/api";'
);
s = s.replace(
  '  const [busy, setBusy] = useState(false);',
  '  const [busy, setBusy] = useState(false);\n  const [status, setStatus] = useState<{ initialized: boolean; username: string | null; homeName: string | null; counts: { items: number; tasks: number; shopping: number } | null } | null>(null);\n\n  // 关键：先问服务器有没有账号，别让用户"上来就登录"却根本没有账号\n  useEffect(() => {\n    api\n      .setupStatus()\n      .then((st) => {\n        setStatus(st);\n        if (!st.initialized) setMode("setup");\n        else if (st.username) setUsername(st.username);\n      })\n      .catch(() => setStatus(null));\n  }, []);'
);
s = s.replace('import React, { useState } from "react";', 'import React, { useEffect, useState } from "react";');
s = s.replace(
  '        <Text style={ui.h1}>家庭仓管日历</Text>',
  '        <Text style={ui.h1}>家庭仓管日历</Text>\n        {status && (\n          <View style={[ui.card, { padding: 12, marginTop: 12, backgroundColor: status.initialized ? c.surface2 : c.primarySoft }]}>\n            <Text style={{ color: c.text, fontWeight: "700" }}>\n              {status.initialized ? "这台服务器已经有账号了" : "这台服务器还没有账号（第一次使用）"}\n            </Text>\n            <Text style={ui.sub}>\n              {status.initialized\n                ? "账号：" + status.username + (status.homeName ? " · 家庭：" + status.homeName : "") + (status.counts ? " · 已有 " + status.counts.items + " 样物品" : "")\n                : "下面填三行就建好了：家庭名 + 用户名 + 密码（≥6 位）。你就是管理员。"}\n            </Text>\n            {status.initialized && (\n              <Text style={ui.note}>\n                不知道密码？在电脑上双击 set_password.bat 重设，或双击 reset_db.bat 清库重来。\n              </Text>\n            )}\n          </View>\n        )}'
);
s = s.replace(
  '    if (!res.ok) toast("失败：" + (res.message ?? "未知错误"));',
  '    if (!res.ok) {\n      toast(res.message === "already_initialized" ? "已经有账号了，请用已有账号登录（忘记密码就在电脑上跑 set_password.bat）" : "失败：" + (res.message ?? "未知错误"));\n    }'
);
fs.writeFileSync(p, s, 'utf8');
console.log('LoginScreen: 已自动判断初始化状态并给出账号来源说明');
