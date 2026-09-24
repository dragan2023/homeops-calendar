/** 存储容器管理：新增 / 重命名 / 停用（可恢复），以及把容器里的物品整批搬到别的容器 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { ContainerPicker, flattenLocations } from "../components/ContainerPicker";
import { Btn, ListRow, SectionTitle, toast } from "../components/ui";
import { api, idemKey, type Level, type LocationRow } from "../services/api";
import { useKeyboardOverlap } from "../lib/keyboard";
import { useTheme, useUi } from "../theme";

type ContainerItem = { itemId: string; name: string; unit: string; qty: number };

export function ContainersScreen() {
  const { c, n } = useTheme();
  const ui = useUi();
  const keyboard = useKeyboardOverlap();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [moveOpen, setMoveOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ls, lv] = await Promise.all([api.locations(), api.levels()]);
      setLocations(ls.locations);
      setLevels(lv.levels);
    } catch (err) {
      toast("加载失败：" + String((err as Error).message));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRows = useMemo(() => flattenLocations(locations.filter((l) => l.active === 1)), [locations]);
  const stoppedRows = useMemo(() => locations.filter((l) => l.active !== 1), [locations]);
  const openRow = activeRows.find((l) => l.id === openId) ?? null;

  /** 某个容器里现在放着什么（同一物品的多个批次合并成一行） */
  const items = useMemo(() => {
    if (!openId) return [] as ContainerItem[];
    const map = new Map<string, ContainerItem>();
    for (const l of levels) {
      if (l.location_id !== openId) continue;
      const cur = map.get(l.item_id);
      if (cur) cur.qty += Number(l.quantity);
      else map.set(l.item_id, { itemId: l.item_id, name: l.name, unit: l.base_unit, qty: Number(l.quantity) });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }, [levels, openId]);

  const pickedIds = items.filter((i) => picked[i.itemId]).map((i) => i.itemId);

  async function create() {
    const name = newName.trim();
    if (!name) {
      toast("先给容器起个名字");
      return;
    }
    try {
      await api.createLocation({ name, kind: "storage", sortOrder: 0 });
      setNewName("");
      toast("已新建容器：" + name);
      await load();
    } catch (err) {
      toast("新建失败：" + String((err as Error).message));
    }
  }

  async function rename(row: LocationRow) {
    const name = renameText.trim();
    if (!name) return;
    try {
      await api.updateLocation(row.id, { name });
      setRenameId(null);
      toast("已改名：" + name);
      await load();
    } catch (err) {
      toast("改名失败：" + String((err as Error).message));
    }
  }

  function stop(row: LocationRow) {
    const inside = Number(row.item_count);
    Alert.alert(
      "停用「" + row.name + "」？",
      inside > 0
        ? "里面还有 " + inside + " 样东西。停用后它不再出现在选择列表，历史入库记录都会保留；随时可以恢复。"
        : "停用后它不再出现在选择列表，历史入库记录都会保留；随时可以恢复。",
      [
        { text: "算了", style: "cancel" },
        {
          text: "停用", style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await api.updateLocation(row.id, { active: 0 });
                if (openId === row.id) setOpenId(null);
                toast("已停用：" + row.name);
                await load();
              } catch (err) {
                toast("停用失败：" + String((err as Error).message));
              }
            })();
          },
        },
      ],
    );
  }

  async function resume(row: LocationRow) {
    try {
      await api.updateLocation(row.id, { active: 1 });
      toast("已恢复：" + row.name);
      await load();
    } catch (err) {
      toast("恢复失败：" + String((err as Error).message));
    }
  }

  async function moveSelected(target: LocationRow) {
    if (!openId || pickedIds.length === 0) return;
    const from = openRow?.name ?? "原地";
    try {
      const res = await api.transferBatch({ idempotencyKey: idemKey("move", pickedIds.join("")), itemIds: pickedIds, fromLocationId: openId, toLocationId: target.id });
      toast("已把 " + pickedIds.length + " 样（" + Number(res.movedUnits ?? 0) + " 件）从" + from + "搬到" + target.name);
      setPicked({});
      setMoveOpen(false);
      await load();
    } catch (err) {
      toast("搬家失败：" + String((err as Error).message));
    }
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg, marginBottom: keyboard }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      >
        <SectionTitle title="新建容器" hint="比如 冰箱 / 冷冻室 / 药箱" />
        <View style={[ui.card, { padding: 14 }]}>
          <TextInput value={newName} onChangeText={setNewName} placeholder="容器名字" placeholderTextColor={c.text3}
            style={{ borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, color: c.text, borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12 }} />
          <Btn label="建立这个容器" primary onPress={() => void create()} style={{ marginTop: 10 }} />
        </View>

        <SectionTitle title="在用容器" hint={activeRows.length + " 个"} />
        <View style={[ui.card, { padding: 0 }]}>
          {activeRows.map((l) => (
            <View key={l.id}>
              <ListRow
                thumb={l.name.slice(0, 1)}
                title={"　".repeat(l.depth) + l.name}
                subtitle={l.item_count + " 样 · " + Number(l.unit_count) + " 件"}
                onPress={() => { setOpenId(openId === l.id ? null : l.id); setPicked({}); }}
                right={
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Btn label="改名" onPress={() => { setRenameId(l.id); setRenameText(l.name); }} />
                    <Btn label="停用" onPress={() => stop(l)} />
                  </View>
                }
              />
              {renameId === l.id ? (
                <View style={{ padding: 12, gap: 8 }}>
                  <TextInput value={renameText} onChangeText={setRenameText} placeholder="新名字" placeholderTextColor={c.text3}
                    style={{ borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, color: c.text, borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12 }} />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Btn label="取消" onPress={() => setRenameId(null)} style={{ flex: 1 }} />
                    <Btn label="保存" primary onPress={() => void rename(l)} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : null}

              {openId === l.id ? (
                <View style={{ padding: 12, backgroundColor: c.surface2, gap: 8 }}>
                  <Text style={{ color: c.text3, fontSize: 12 }}>这个容器里现在有什么（点一下选中，可多选）</Text>
                  {items.map((i) => (
                    <Pressable key={i.itemId} testID={"item-" + i.itemId} onPress={() => setPicked((p) => ({ ...p, [i.itemId]: !p[i.itemId] }))}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: n.ctlH, borderBottomWidth: n.borderW, borderBottomColor: c.border }}>
                      <View style={{ width: 20, height: 20, borderRadius: n.radiusCtl, borderWidth: n.borderW, borderColor: picked[i.itemId] ? c.accent : c.borderStrong, backgroundColor: picked[i.itemId] ? c.accent : "transparent" }} />
                      <Text style={{ flex: 1, color: c.text, fontSize: 14 }}>{i.name}</Text>
                      <Text style={{ color: c.text3, fontSize: 12 }}>{i.qty} {i.unit}</Text>
                    </Pressable>
                  ))}
                  {items.length === 0 ? <Text style={{ color: c.text3, fontSize: 12 }}>这个容器现在是空的。</Text> : null}
                  {items.length > 0 ? (
                    <Btn label={pickedIds.length ? "把选中的 " + pickedIds.length + " 样搬到…" : "先选中要搬的东西"} primary={pickedIds.length > 0} disabled={pickedIds.length === 0} onPress={() => setMoveOpen(true)} style={{ marginTop: 6 }} />
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
          {activeRows.length === 0 ? <Text style={{ color: c.text3, fontSize: 12, padding: 14 }}>还没有容器，先建一个。</Text> : null}
        </View>

        {stoppedRows.length > 0 ? (
          <>
            <SectionTitle title="已停用" hint={stoppedRows.length + " 个 · 历史记录仍在"} />
            <View style={[ui.card, { padding: 0 }]}>
              {stoppedRows.map((l) => (
                <ListRow key={l.id} title={l.name} subtitle="不参与选择；需要时随时恢复"
                  right={<Btn label="恢复使用" onPress={() => void resume(l)} />} />
              ))}
            </View>
          </>
        ) : null}

        <Text style={ui.note}>容器就是东西放的地方；停用不会删掉历史入库记录。</Text>
      </ScrollView>

      <ContainerPicker
        visible={moveOpen}
        onClose={() => setMoveOpen(false)}
        locations={locations}
        valueId={null}
        onSelect={(target) => void moveSelected(target)}
        onChanged={load}
      />
    </>
  );
}
