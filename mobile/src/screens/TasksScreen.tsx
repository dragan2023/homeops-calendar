import { useNavigation } from "@react-navigation/native";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { addDays, api, todayIso, type ShoppingRow, type Task } from "../services/api";
import { useKeyboardOverlap } from "../lib/keyboard";
import { useTheme, useUi } from "../theme";
import { Btn, CollapsibleList, ListRow, Pill, SectionTitle, Sheet, toast } from "../components/ui";
import { THEME_META } from "../theme/generated";

// 内部枚举值不直接显示给用户
const KIND_LABEL: Record<string, string> = { chore: "周期家务", linked: "缺货补货", expiry: "临期处理", purchase: "要买" };

export function TasksScreen() {
  const { c, n, themeId, setTheme, meta } = useTheme();
  const ui = useUi();
  const today = todayIso();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  const keyboard = useKeyboardOverlap();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [shopping, setShopping] = useState<ShoppingRow[]>([]);
  const [title, setTitle] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([api.tasks(), api.shopping()]);
      setTasks(t.tasks);
      setShopping(s.items);
    } catch (err) {
      toast("加载失败：" + String((err as Error).message));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(t: Task) {
    await api.completeTask(t.id, t.done !== 1);
    await load();
    toast(t.done === 1 ? "已恢复：" + t.title : "完成啦：" + t.title);
  }

  async function receive(row: ShoppingRow) {
    try {
      await api.receiveShopping(row.id, { quantity: Number(row.quantity) });
      await load();
      toast("已入库：" + row.name);
    } catch (err) {
      toast("入库失败：" + String((err as Error).message));
    }
  }

  async function addSuggestions() {
    const res = await api.shoppingFromLow();
    await load();
    toast(res.added.length ? "已加入清单：" + res.added.join("、") : "没有新的缺货项");
  }

  async function syncNow() {
    const res = await api.syncTasks();
    await load();
    toast("对账完成：新增 " + res.created.length + "，自动关闭 " + res.closed.length);
  }

  async function addTask() {
    if (!title.trim()) return;
    await api.createTask({ title: title.trim(), kind: "purchase", dueDate: today });
    setTitle("");
    await load();
    toast("已加待办");
  }

  const group = (pred: (t: Task) => boolean) => tasks.filter(pred);

  const renderTask = (t: Task) => (
    <Pressable key={t.id} onPress={() => void toggle(t)} style={ui.row}>
      <View style={{ width: 44, height: 26, borderRadius: n.radiusPill, borderWidth: n.borderW, borderColor: c.border, backgroundColor: t.done ? c.success : c.surface2, justifyContent: "center" }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.surface, borderWidth: n.borderW, borderColor: c.border, alignSelf: t.done ? "flex-end" : "flex-start", marginHorizontal: 2 }} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.done ? c.text3 : c.text, fontWeight: "600", textDecorationLine: t.done ? "line-through" : "none" }} numberOfLines={1}>
          {t.title}
        </Text>
        <Text style={ui.sub}>
          {t.due_date ? "截止 " + t.due_date : "不急，想起来再做"}
          {t.done ? " · 已完成" : ""}
        </Text>
      </View>
      <Pill tone={t.kind === "chore" ? "accent" : t.kind === "linked" ? "info" : t.kind === "expiry" ? "warn" : "plain"} label={KIND_LABEL[t.kind] ?? "待办"} />
    </Pressable>
  );

  const renderShopping = (s: ShoppingRow) => (
    <ListRow
      key={s.id}
      thumb={s.name.slice(0, 1)}
      title={s.name + " · " + s.quantity + " " + (s.unit ?? "")}
      subtitle={s.planned_date ? "计划 " + s.planned_date : "还没排日子"}
      right={<Btn label="收到入库" onPress={() => void receive(s)} />}
    />
  );

  const todayTasks = group((t) => !t.due_date || t.due_date <= today);
  const soonTasks = group((t) => !!t.due_date && t.due_date > today && t.due_date <= addDays(today, 30));
  const laterTasks = group((t) => !!t.due_date && t.due_date > addDays(today, 30));

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: c.bg, marginBottom: keyboard }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable onPress={() => setThemeOpen(true)} style={[ui.card, { padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
          <View>
            <Text style={{ color: c.text, fontWeight: "700" }}>外观主题：{meta.name}</Text>
            <Text style={ui.sub}>8 套主题，点这里换</Text>
          </View>
        </Pressable>

        <View style={{ marginTop: 12 }}>
          <Btn label="周期家务（到点自动进待办）" onPress={() => navigation.navigate("Chores")} />
        </View>

        <SectionTitle title="要买的" hint={shopping.length ? shopping.length + " 项" : "空"} />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <Btn label="把缺货加进来" onPress={() => void addSuggestions()} />
          <Btn label="重跑对账" onPress={() => void syncNow()} />
        </View>
        <CollapsibleList title="要买的" items={shopping} initial={3} renderItem={renderShopping} emptyText="购物清单是空的。" searchText={(s) => s.name} />

        <SectionTitle title="今天到期" hint={todayTasks.length + " 件"} />
        <CollapsibleList title="今天到期" items={todayTasks} initial={4} renderItem={renderTask} emptyText="今天没有到期的。" searchText={(t) => t.title} />

        <SectionTitle title="接下来" hint="未来 30 天" />
        <CollapsibleList title="接下来" items={soonTasks} initial={4} renderItem={renderTask} emptyText="未来 30 天没有安排。" searchText={(t) => t.title} />

        <SectionTitle title="更远" hint={laterTasks.length ? laterTasks.length + " 件" : "空"} />
        <CollapsibleList title="更远" items={laterTasks} initial={3} renderItem={renderTask} emptyText="没有更远的安排。" searchText={(t) => t.title} />

        <SectionTitle title="手工加一条" hint="其它提醒" />
        <View style={[ui.card, { padding: 12 }]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="例如：交水电费"
            placeholderTextColor={c.text3}
            style={{ borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, color: c.text, borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12 }}
          />
          <Btn label="添加" primary onPress={() => void addTask()} style={{ marginTop: 10 }} />
        </View>
      </ScrollView>

      <Sheet visible={themeOpen} onClose={() => setThemeOpen(false)} title="选择主题">
        {THEME_META.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => { setTheme(m.id); toast("已切换：" + m.name); }}
            style={[ui.row, { borderRadius: n.radiusCtl, borderWidth: n.borderW, borderColor: themeId === m.id ? c.accent : c.border, marginTop: 8 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: "700" }}>{m.name}</Text>
              <Text style={ui.sub}>{m.desc}</Text>
            </View>
            {themeId === m.id && <Pill tone="success" label="当前" />}
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}
