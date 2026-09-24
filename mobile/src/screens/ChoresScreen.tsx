/** 周期家务：到点自动出现在待办里的固定家务（清冰箱、换滤芯…），这里建/改/停用 */
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { MonthPicker } from "../components/MonthPicker";
import { Btn, ListRow, SectionTitle, toast } from "../components/ui";
import { addDays, api, todayIso, type TaskTemplate } from "../services/api";
import { buildCycle, humanCycle, parseCycle, WEEKDAY_CODES, type CycleKind, type CycleSpec } from "../lib/chore";
import { useKeyboardOverlap } from "../lib/keyboard";
import { useTheme, useUi } from "../theme";

const WEEKDAY_LABEL: Record<string, string> = { MO: "一", TU: "二", WE: "三", TH: "四", FR: "五", SA: "六", SU: "日" };

export function ChoresScreen() {
  const { c, n } = useTheme();
  const ui = useUi();
  const keyboard = useKeyboardOverlap();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState<CycleSpec>({ kind: "weekly", interval: 1, weekdays: ["SU"], monthday: 1 });
  const [countText, setCountText] = useState("3");
  const [monthdayText, setMonthdayText] = useState("1");
  const [nextDue, setNextDue] = useState(addDays(todayIso(), 7));
  const [dateOpen, setDateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.taskTemplates();
      setTemplates(res.templates);
    } catch (err) {
      toast("加载失败：" + String((err as Error).message));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditId(null);
    setTitle("");
    setSpec({ kind: "weekly", interval: 1, weekdays: ["SU"], monthday: 1 });
    setCountText("3");
    setMonthdayText("1");
    setNextDue(addDays(todayIso(), 7));
  }

  function startEdit(t: TaskTemplate) {
    const s = parseCycle(t.cycle_rule);
    setEditId(t.id);
    setTitle(t.title);
    setSpec(s);
    setCountText(String(s.interval));
    setMonthdayText(String(s.monthday));
    setNextDue(t.next_due_date);
  }

  function currentSpec(): CycleSpec {
    if (spec.kind === "daily") return { ...spec, interval: Number(countText) || 1 };
    if (spec.kind === "monthly") return { ...spec, monthday: Number(monthdayText) || 1 };
    return spec;
  }

  async function save() {
    const name = title.trim();
    if (!name) {
      toast("先写清楚这件事叫什么");
      return;
    }
    const body = { title: name, cycleRule: buildCycle(currentSpec()), nextDueDate: nextDue };
    setBusy(true);
    try {
      if (editId) await api.updateTaskTemplate(editId, body);
      else await api.createTaskTemplate(body);
      await api.syncTasks();
      toast(editId ? "已保存：" + name : "已建立，并已排进待办：" + name);
      resetForm();
      await load();
    } catch (err) {
      toast("保存失败：" + String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function setActive(t: TaskTemplate, active: boolean) {
    try {
      await api.updateTaskTemplate(t.id, { active: active ? 1 : 0 });
      await api.syncTasks();
      toast(active ? "已恢复：" + t.title : "已停用：" + t.title);
      await load();
    } catch (err) {
      toast("操作失败：" + String((err as Error).message));
    }
  }

  const kindBtn = (kind: CycleKind, label: string) => (
    <Btn
      key={kind}
      label={label}
      primary={spec.kind === kind}
      onPress={() => setSpec((s) => ({ ...s, kind }))}
      style={{ flex: 1 }}
    />
  );
  const inputStyle = {
    borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, color: c.text,
    borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12, marginTop: 6,
  } as const;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg, marginBottom: keyboard }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      >
        <SectionTitle title={editId ? "修改这件家务" : "添加一件周期家务"} hint="到点自动进待办" />
        <View style={[ui.card, { padding: 14 }]}>
          <Text style={{ color: c.text3, fontSize: 12 }}>这件事叫什么</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="例如 刷洗饮水机 / 换净水滤芯" placeholderTextColor={c.text3} style={inputStyle} />

          <Text style={{ color: c.text3, fontSize: 12, marginTop: 12 }}>多久做一次</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            {kindBtn("weekly", "每周")}
            {kindBtn("monthly", "每月")}
            {kindBtn("daily", "每 N 天")}
          </View>

          {spec.kind === "weekly" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {WEEKDAY_CODES.map((code) => {
                const on = spec.weekdays.includes(code);
                return (
                  <Btn
                    key={code}
                    label={"周" + WEEKDAY_LABEL[code]}
                    primary={on}
                    onPress={() => setSpec((s) => ({
                      ...s,
                      weekdays: s.weekdays.includes(code) ? s.weekdays.filter((d) => d !== code) : [...s.weekdays, code],
                    }))}
                  />
                );
              })}
            </View>
          ) : null}

          {spec.kind === "monthly" ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: c.text3, fontSize: 12 }}>每月几号（1–28）</Text>
              <TextInput value={monthdayText} onChangeText={setMonthdayText} keyboardType="numeric" style={inputStyle} />
            </View>
          ) : null}

          {spec.kind === "daily" ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: c.text3, fontSize: 12 }}>每隔多少天</Text>
              <TextInput value={countText} onChangeText={setCountText} keyboardType="numeric" style={inputStyle} />
            </View>
          ) : null}

          <Text style={{ color: c.text3, fontSize: 12, marginTop: 12 }}>下一次什么时候做</Text>
          <Btn label={nextDue} onPress={() => setDateOpen(true)} style={{ marginTop: 6 }} />
          <Text style={ui.note}>这次说 "{humanCycle(buildCycle(currentSpec()))}"，从 {nextDue} 开始排。</Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            {editId ? <Btn label="取消修改" onPress={resetForm} style={{ flex: 1 }} /> : null}
            <Btn label={editId ? "保存修改" : "建立这件家务"} primary disabled={busy} onPress={() => void save()} style={{ flex: 1 }} />
          </View>
        </View>

        <SectionTitle title="已有的周期家务" hint={templates.filter((t) => t.active === 1).length + " 件在用"} />
        <View style={[ui.card, { padding: 0 }]}>
          {templates.map((t) => (
            <ListRow
              key={t.id}
              title={t.title}
              subtitle={humanCycle(t.cycle_rule) + " · 下次 " + t.next_due_date + (t.active === 1 ? "" : " · 已停用")}
              onPress={() => startEdit(t)}
              right={
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Btn label="改" onPress={() => startEdit(t)} />
                  <Btn label={t.active === 1 ? "停用" : "恢复"} onPress={() => void setActive(t, t.active !== 1)} />
                </View>
              }
            />
          ))}
          {templates.length === 0 ? <Text style={{ color: c.text3, fontSize: 12, padding: 14 }}>还没有周期家务。</Text> : null}
        </View>

        <Text style={ui.note}>点任意一条可以改它的周期；停用后不再生成待办，已有待办不受影响。</Text>
      </ScrollView>

      <MonthPicker visible={dateOpen} onClose={() => setDateOpen(false)} value={nextDue} onPick={(iso) => { if (iso) setNextDue(iso); setDateOpen(false); }} />
    </>
  );
}
