import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api, expiryText, idemKey, type Batch, type Item, type LocationRow, type Tx } from "../services/api";
import { useKeyboardOverlap } from "../lib/keyboard";
import { useTheme, useUi } from "../theme";
import { Btn, CollapsibleList, ListRow, Pill, SectionTitle, Sheet, toast } from "../components/ui";

// 内部类型值不直接显示
const TX_LABEL: Record<string, string> = { receipt: "入库", issue: "领用", transfer_out: "调拨出", transfer_in: "调拨入", adjust: "盘点调整" };

function fieldStyle(c: Record<string, string>, n: Record<string, number>) {
  return {
    borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, color: c.text,
    borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12, marginTop: 6,
  } as const;
}

export function InventoryScreen() {
  const { c, n } = useTheme();
  const ui = useUi();
  const keyboard = useKeyboardOverlap();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [locId, setLocId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ item: Item; batches: Batch[]; transactions: Tx[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reorderText, setReorderText] = useState("");
  const [warnText, setWarnText] = useState("");
  const total = detail ? detail.batches.reduce((s, b) => s + Number(b.quantity), 0) : 0;

  const load = useCallback(async () => {
    try {
      const res = await api.items(query || undefined);
      setItems(res.items);
    } catch (err) {
      toast("加载失败：" + String((err as Error).message));
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.locations().then((ls) => setLocations(ls.locations.filter((l) => l.active === 1))).catch(() => undefined);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await api.item(id);
      setDetail({ item: res.item, batches: res.batches, transactions: res.transactions });
      setReorderText(String(res.item.reorder_point));
      setWarnText(String(res.item.expiry_warn_days));
    } catch (err) {
      toast("详情加载失败：" + String((err as Error).message));
    }
  }, []);

  useEffect(() => {
    if (openId) void loadDetail(openId);
    else setDetail(null);
  }, [openId, loadDetail]);

  async function saveThresholds() {
    if (!detail) return;
    const reorderPoint = Math.max(0, Number(reorderText) || 0);
    const expiryWarnDays = Math.max(0, Number(warnText) || 0);
    setBusy(true);
    try {
      await api.updateItem(detail.item.id, { reorderPoint, expiryWarnDays });
      await Promise.all([loadDetail(detail.item.id), load()]);
      toast("已保存：低于 " + reorderPoint + " " + detail.item.base_unit + " 就提醒补货");
    } catch (err) {
      toast("保存失败：" + String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function act(kind: "receipt" | "issue") {
    if (!detail) return;
    setBusy(true);
    try {
      const body = { idempotencyKey: idemKey(kind, detail.item.id), itemId: detail.item.id, quantity: 1 };
      if (kind === "receipt") await api.receipt(body);
      else await api.issue(body);
      await Promise.all([loadDetail(detail.item.id), load()]);
      toast((kind === "receipt" ? "入库 +1：" : "领用 -1：") + detail.item.name);
    } catch (err) {
      toast("操作失败：" + String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...items]
    .filter((i) => (locId ? i.default_location_id === locId : true))
    .sort((a, b) => ((a.first_expiry ?? "9999") < (b.first_expiry ?? "9999") ? -1 : 1));

  const renderItem = (i: Item) => {
    const low = i.quantity <= i.reorder_point;
    return (
      <ListRow
        key={i.id}
        thumb={i.name.slice(0, 1)}
        title={i.name + "  " + i.quantity + i.base_unit}
        subtitle={(i.category_name ?? "未分类") + (i.first_expiry ? " · " + expiryText(i.first_expiry) : " · 没有到期日")}
        right={<Pill tone={low ? "danger" : i.first_expiry ? "warn" : "plain"} label={low ? "该补货" : i.first_expiry ? expiryText(i.first_expiry) : "—"} />}
        onPress={() => setOpenId(i.id)}
      />
    );
  };

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: c.bg, marginBottom: keyboard }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="找东西：酸奶 / 冰箱 / 药品"
          placeholderTextColor={c.text3}
          style={{ borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface, color: c.text, borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12 }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn label="全部" onPress={() => setLocId(null)} />
            {locations.map((l) => (
              <Btn key={l.id} label={l.name} onPress={() => setLocId(l.id)} />
            ))}
          </View>
        </ScrollView>

        <Btn label="管理存储容器" onPress={() => navigation.navigate("Containers")} style={{ marginTop: 10 }} />

        <SectionTitle title="库存" hint={sorted.length + " 项 · 快到期的在前"} />
        <CollapsibleList
          title="库存"
          items={sorted}
          initial={12}
          renderItem={renderItem}
          emptyText="没有匹配的物品。"
          searchText={(i) => i.name + " " + (i.category_name ?? "")}
          hint="点任意物品可以看批次、入库/领用。"
        />
      </ScrollView>

      <Sheet visible={!!openId} onClose={() => setOpenId(null)} title={detail?.item.name ?? "物品详情"}>
        {detail && (
          <>
            <Text style={{ color: c.text3, fontSize: 12 }}>
              现有 {total} {detail.item.base_unit}（补货点 {detail.item.reorder_point}）· 到期前 {detail.item.expiry_warn_days} 天开始提醒
            </Text>
            <Text style={{ color: c.text3, fontSize: 12, marginTop: 12 }}>低于多少提醒补货（{detail.item.base_unit}）</Text>
            <TextInput style={fieldStyle(c, n)} value={reorderText} onChangeText={setReorderText} keyboardType="numeric" />
            <Text style={{ color: c.text3, fontSize: 12, marginTop: 12 }}>到期前几天开始提醒</Text>
            <TextInput style={fieldStyle(c, n)} value={warnText} onChangeText={setWarnText} keyboardType="numeric" />
            <Btn label="保存这两个数" primary disabled={busy} onPress={() => void saveThresholds()} style={{ marginTop: 12 }} />

            {detail.batches.length === 0 && <Text style={ui.note}>还没有批次（入库才会产生库存）。</Text>}
            {detail.batches.map((b) => (
              <ListRow
                key={b.id}
                title={b.location_name ?? "未知地点"}
                subtitle={b.expiry_date ? "到期 " + b.expiry_date + "（" + expiryText(b.expiry_date) + "）" : "无到期日"}
                right={<Text style={{ color: c.text, fontWeight: "700" }}>{b.quantity}{detail.item.base_unit}</Text>}
              />
            ))}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Btn label="入库 +1" primary disabled={busy} onPress={() => void act("receipt")} style={{ flex: 1 }} />
              <Btn label="领用 -1" disabled={busy || total <= 0} onPress={() => void act("issue")} style={{ flex: 1 }} />
            </View>
            {detail.transactions.slice(0, 6).map((t) => (
              <ListRow key={t.id} title={TX_LABEL[t.type] ?? "库存变动"} subtitle={new Date(t.occurred_at).toLocaleString("zh-CN", { hour12: false })} right={<Text style={{ color: c.text }}>{t.quantity}</Text>} />
            ))}
            <Text style={ui.note}>领用会先扣快到期的批次；重复点击不会重复记账。</Text>
          </>
        )}
      </Sheet>
    </>
  );
}
