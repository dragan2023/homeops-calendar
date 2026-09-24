/**
 * 长列表收敛器：主页面只放前 N 条，其余点「显示全部」进入该门类自己的整屏页面。
 * 目的：数据变多以后（几十条临期、上百样物品）主页面不会被长表单淹没。
 */
import React, { useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useKeyboardOverlap } from "../lib/keyboard";
import { useTheme, useUi } from "../theme";

type Props<T> = {
  title: string;
  items: T[];
  initial?: number;
  renderItem: (item: T, index: number) => ReactNode;
  emptyText?: string;
  /** 传了就在"全部"页面里显示搜索框（客户端过滤） */
  searchText?: (item: T) => string;
  /** 全屏页顶部右侧的补充说明 */
  hint?: string;
};

export function CollapsibleList<T>({ title, items, initial = 4, renderItem, emptyText = "暂无。", searchText, hint }: Props<T>) {
  const { c, n } = useTheme();
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const keyboard = useKeyboardOverlap();

  const filtered = useMemo(() => {
    if (!open || !searchText || !q.trim()) return items;
    const needle = q.trim();
    return items.filter((it) => searchText(it).includes(needle));
  }, [items, open, q, searchText]);

  const shown = items.slice(0, initial);

  return (
    <>
      <View style={ui.card}>{items.length === 0 ? <Text style={ui.note}>{emptyText}</Text> : shown.map((it, i) => renderItem(it, i))}</View>

      {items.length > initial && (
        <Pressable onPress={() => setOpen(true)} style={[ui.btn, { marginTop: 8 }]}>
          <Text style={{ color: c.text, fontWeight: "600", fontSize: 13.5 }}>
            显示全部 {items.length} 条 →
          </Text>
        </Pressable>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, marginBottom: keyboard }} edges={["top", "bottom"]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: n.borderW, borderBottomColor: c.border, backgroundColor: c.surface }}>
            <Pressable onPress={() => setOpen(false)} style={[ui.btn, { minHeight: 38 }]}>
              <Text style={{ color: c.text, fontSize: 13 }}>返回</Text>
            </Pressable>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "700", flex: 1 }} numberOfLines={1}>
              {title}
            </Text>
            <Text style={{ color: c.text3, fontSize: 12 }}>{items.length} 条</Text>
          </View>

          {!!searchText && (
            <View style={{ padding: 12 }}>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={"在" + title + "里搜索"}
                placeholderTextColor={c.text3}
                style={{ borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface, color: c.text, borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12 }}
              />
            </View>
          )}

          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 28 }}>
            {filtered.length === 0 ? <Text style={ui.note}>没找到。</Text> : <View style={ui.card}>{filtered.map((it, i) => renderItem(it, i))}</View>}
            {!!hint && <Text style={ui.note}>{hint}</Text>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
