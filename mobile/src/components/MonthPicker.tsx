/** 自绘月历弹窗：只消费主题令牌（8 套主题自动适配），不依赖任何原生日期控件 */
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { addDays, todayIso } from "../services/api";
import { useTheme } from "../theme";
import { Btn, Sheet } from "./ui";

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

function isoOf(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}
function endOfMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return isoOf(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
}
function daysUntil(iso: string): number {
  const a = new Date(todayIso() + "T00:00:00Z").getTime();
  const b = new Date(iso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}
/** 周一起始、含前后补空的月历格子 */
export function monthRows(year: number, month: number): (string | null)[][] {
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(isoOf(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function MonthPicker({ visible, onClose, value, onPick }: {
  visible: boolean;
  onClose: () => void;
  value: string;
  onPick: (iso: string | null) => void;
}) {
  const { c, n } = useTheme();
  const today = todayIso();
  // 没有值（或值被清空）时，月历停在今天所在的月份
  const anchor = /^\d{4}-\d{2}/.test(value) ? value : today;
  const [cursor, setCursor] = useState(() => ({ y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) }));
  useEffect(() => {
    if (visible) setCursor({ y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) });
  }, [visible, anchor]);

  const rows = useMemo(() => monthRows(cursor.y, cursor.m), [cursor]);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(cursor.y, cursor.m - 1 + delta, 1));
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  };

  const quick: Array<[string, string]> = [
    ["今天", today], ["明天", addDays(today, 1)], ["7 天后", addDays(today, 7)], ["30 天后", addDays(today, 30)], ["月底", endOfMonth(today)],
  ];
  const cellStyle = { flex: 1, alignItems: "center" as const, paddingVertical: 7 };

  return (
    <Sheet visible={visible} onClose={onClose} title="什么时候到期">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {quick.map(([label, iso]) => (
          <Pressable key={label} onPress={() => onPick(iso)}
            style={{ borderWidth: n.borderW, borderColor: value === iso ? c.primary : c.border, backgroundColor: value === iso ? c.primary : c.surface2, borderRadius: n.radiusPill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: value === iso ? c.onPrimary : c.text, fontSize: 12, fontWeight: "600" }}>{label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => onPick(null)}
          style={{ borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface, borderRadius: n.radiusPill, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: c.text3, fontSize: 12 }}>不限</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Btn label="‹ 上个月" onPress={() => shift(-1)} />
        <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }}>{cursor.y} 年 {cursor.m} 月</Text>
        <Btn label="下个月 ›" onPress={() => shift(1)} />
      </View>

      <View style={{ flexDirection: "row" }}>
        {WEEK.map((w) => (
          <View key={w} style={cellStyle}><Text style={{ color: c.text3, fontSize: 11 }}>{w}</Text></View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row" }}>
          {row.map((iso, ci) => {
            const isSel = iso === value;
            const isToday = iso === today;
            return (
              <Pressable key={ci} disabled={!iso} onPress={() => iso && onPick(iso)}
                style={[cellStyle, { backgroundColor: isSel ? c.primary : "transparent", borderRadius: n.radiusCtl }]}>
                <Text style={{
                  color: !iso ? "transparent" : isSel ? c.onPrimary : isToday ? c.accent : c.text,
                  fontWeight: isSel || isToday ? "700" : "400", fontSize: 13,
                }}>{iso ? Number(iso.slice(8, 10)) : "0"}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: c.text3, fontSize: 12 }}>
          {value ? "到期 " + value + "（" + (daysUntil(value) >= 0 ? "还有 " + daysUntil(value) + " 天" : "已过 " + Math.abs(daysUntil(value)) + " 天") + "）" : "没有到期日，只能靠你自己记着"}
        </Text>
        <Btn label="好了" primary onPress={onClose} style={{ marginTop: 10 }} />
      </View>
    </Sheet>
  );
}
