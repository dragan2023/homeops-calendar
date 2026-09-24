/** 容器选择弹窗：列表 + 搜索 + 就地新建；只消费主题令牌 */
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api, type LocationRow } from "../services/api";
import { useTheme } from "../theme";
import { Btn, Sheet, toast } from "./ui";

/** 把父子层级摊平成「根在前、子缩进」的一列 */
export function flattenLocations(rows: LocationRow[]): Array<LocationRow & { depth: number }> {
  const byParent = new Map<string | null, LocationRow[]>();
  for (const l of rows) {
    const key = l.parent_id ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), l]);
  }
  const out: Array<LocationRow & { depth: number }> = [];
  const walk = (parent: string | null, depth: number) => {
    for (const l of byParent.get(parent) ?? []) {
      out.push({ ...l, depth });
      walk(l.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function ContainerPicker({ visible, onClose, locations, valueId, onSelect, onChanged }: {
  visible: boolean;
  onClose: () => void;
  locations: LocationRow[];
  valueId: string | null;
  onSelect: (loc: LocationRow) => void;
  onChanged: () => void | Promise<void>;
}) {
  const { c, n } = useTheme();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const listed = useMemo(() => {
    const active = locations.filter((l) => l.active === 1);
    const rows = flattenLocations(active);
    const kw = q.trim();
    return kw ? rows.filter((r) => r.name.includes(kw)) : rows;
  }, [locations, q]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await api.createLocation({ name, kind: "storage", sortOrder: 0 });
      await onChanged();
      toast("已新建容器：" + name);
      setNewName("");
      setCreating(false);
      onSelect({ id: res.id, parent_id: null, name, kind: "storage", sort_order: 0, active: 1, item_count: 0, unit_count: 0 });
    } catch (err) {
      toast("新建失败：" + String((err as Error).message));
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="放到哪里">
      <TextInput value={q} onChangeText={setQ} placeholder="搜索容器…" placeholderTextColor={c.text3}
        style={{ borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, color: c.text, borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12 }} />
      <ScrollView style={{ maxHeight: 320, marginTop: 10 }}>
        {listed.map((l) => (
          <Pressable key={l.id} testID={"loc-" + l.id} onPress={() => { onSelect(l); onClose(); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: n.ctlH, paddingLeft: 2 + l.depth * 18, borderBottomWidth: n.borderW, borderBottomColor: c.border }}>
            <Text style={{ flex: 1, color: l.depth ? c.text2 : c.text, fontSize: 14, fontWeight: l.id === valueId ? "700" : "400" }}>{l.name}</Text>
            <Text style={{ color: c.text3, fontSize: 11.5 }}>{l.item_count} 样 · {Number(l.unit_count)} 件</Text>
            {l.id === valueId ? <Text style={{ color: c.accent, fontWeight: "700" }}>✓</Text> : null}
          </Pressable>
        ))}
        {listed.length === 0 ? <Text style={{ color: c.text3, fontSize: 12, paddingVertical: 12 }}>没有匹配的容器。</Text> : null}
      </ScrollView>

      {creating ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: c.text3, fontSize: 12 }}>新容器名字</Text>
          <TextInput value={newName} onChangeText={setNewName} placeholder="例如 储物柜 / 冷冻室" placeholderTextColor={c.text3}
            style={{ borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, color: c.text, borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12, marginTop: 6 }} />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Btn label="取消" onPress={() => { setCreating(false); setNewName(""); }} style={{ flex: 1 }} />
            <Btn label="创建并选中" primary onPress={() => void create()} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Btn label="＋ 新建容器" onPress={() => setCreating(true)} style={{ marginTop: 12 }} />
      )}
    </Sheet>
  );
}
