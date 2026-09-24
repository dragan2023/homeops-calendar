import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { addDays, api, todayIso, type CalendarEvent } from "../services/api";
import { useTheme, useUi } from "../theme";
import { ListRow, Pill, SectionTitle, toast } from "../components/ui";

const TYPE_LABEL: Record<CalendarEvent["type"], string> = { expiry: "临期", buy: "采购", chore: "家务", care: "用药" };
const TYPE_TONE: Record<CalendarEvent["type"], "warn" | "info" | "accent" | "success"> = { expiry: "warn", buy: "info", chore: "accent", care: "success" };
const TYPE_COLOR_KEY: Record<CalendarEvent["type"], string> = { expiry: "warn", buy: "info", chore: "accent", care: "success" };

export function CalendarScreen() {
  const { c, n } = useTheme();
  const ui = useUi();
  const today = todayIso();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const anchor = new Date(today + "T00:00:00Z");
  anchor.setUTCMonth(anchor.getUTCMonth() + offset);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const firstIso = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const lastIso = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try {
      const res = await api.calendar(firstIso, lastIso);
      setEvents(res.events);
    } catch (err) {
      toast("日历加载失败：" + String((err as Error).message));
    }
  }, [firstIso, lastIso]);

  useEffect(() => {
    void load();
  }, [load]);

  const startPad = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const dayEvents = events.filter((e) => e.date === selected);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={ui.h1}>
          {year} 年 {String(month + 1).padStart(2, "0")} 月
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={() => setOffset((o) => o - 1)} style={ui.btn}><Text style={{ color: c.text, fontSize: 12 }}>上月</Text></Pressable>
          <Pressable onPress={() => setOffset(0)} style={ui.btn}><Text style={{ color: c.text, fontSize: 12 }}>今天</Text></Pressable>
          <Pressable onPress={() => setOffset((o) => o + 1)} style={ui.btn}><Text style={{ color: c.text, fontSize: 12 }}>下月</Text></Pressable>
        </View>
      </View>

      <View style={[ui.card, { padding: 12, marginTop: 12 }]}>
        <View style={{ flexDirection: "row" }}>
          {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
            <Text key={w} style={{ flex: 1, textAlign: "center", color: c.text3, fontSize: 10.5 }}>{w}</Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
          {cells.map((d, idx) => {
            if (d === null) return <View key={"pad" + idx} style={{ width: "14.28%", aspectRatio: 1 }} />;
            const iso = new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10);
            const evs = events.filter((e) => e.date === iso);
            const isToday = iso === today;
            const isSel = iso === selected;
            return (
              <Pressable
                key={iso}
                onPress={() => setSelected(iso)}
                style={{ width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: n.radiusCtl, backgroundColor: isSel ? c.primary : isToday ? c.primarySoft : "transparent" }}
              >
                <Text style={{ color: isSel ? c.onPrimary : c.text2, fontSize: 13 }}>{d}</Text>
                <View style={{ flexDirection: "row", gap: 2, height: 5, marginTop: 2 }}>
                  {evs.slice(0, 3).map((e, i) => (
                    <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: (c[TYPE_COLOR_KEY[e.type]] ?? c.text3) as string }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          {(Object.keys(TYPE_LABEL) as CalendarEvent["type"][]).map((t) => (
            <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: (c[TYPE_COLOR_KEY[t]] ?? c.text3) as string }} />
              <Text style={{ color: c.text3, fontSize: 11 }}>{TYPE_LABEL[t]}</Text>
            </View>
          ))}
        </View>
      </View>

      <SectionTitle title={selected + " 当天"} hint={dayEvents.length + " 条"} />
      <View style={ui.card}>
        {dayEvents.length === 0 && <Text style={ui.note}>这天没有安排。</Text>}
        {dayEvents.map((e, i) => (
          <ListRow key={e.refId + i} title={e.title} subtitle={e.date} right={<Pill tone={TYPE_TONE[e.type]} label={TYPE_LABEL[e.type]} />} />
        ))}
      </View>
      <Text style={ui.note}>日历范围 {firstIso} ~ {lastIso}；采购事件来自购物清单与缺货建议（{addDays(today, 0)} 起）。</Text>
    </ScrollView>
  );
}
