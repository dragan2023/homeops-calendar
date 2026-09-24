import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { ContainerPicker } from "../components/ContainerPicker";
import { MonthPicker } from "../components/MonthPicker";
import { addDays, api, expiryText, idemKey, todayIso, type LocationRow, type TodaySummary } from "../services/api";
import { useKeyboardOverlap } from "../lib/keyboard";
import { useTheme, useUi } from "../theme";
import { Btn, CollapsibleList, ListRow, Pill, SectionTitle, Sheet, toast } from "../components/ui";
import { ScanSheet } from "../components/ScanBarcode";
import { findByBarcode, looksLikeProductCode, normalizeBarcode } from "../lib/barcode";

/** 同一物品同一到期日的多个批次合并成一行（否则会出现一堆"布洛芬 12 片"） */
type ExpiryRow = { key: string; itemId: string; name: string; baseUnit: string; qty: number; expiry: string; location: string | null };

function groupExpiring(summary: TodaySummary | null): ExpiryRow[] {
  const map = new Map<string, ExpiryRow>();
  for (const b of summary?.expiring ?? []) {
    const key = b.item_id + "|" + b.expiry_date;
    const cur = map.get(key);
    if (cur) cur.qty += Number(b.quantity);
    else map.set(key, { key, itemId: b.item_id, name: b.name, baseUnit: b.base_unit, qty: Number(b.quantity), expiry: b.expiry_date, location: b.location_name });
  }
  return [...map.values()].sort((a, b) => (a.expiry < b.expiry ? -1 : 1));
}

export function TodayScreen() {
  const { c, n } = useTheme();
  const ui = useUi();
  const keyboard = useKeyboardOverlap();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [expiry, setExpiry] = useState(addDays(todayIso(), 7));
  const [barcode, setBarcode] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, m, ls] = await Promise.all([api.today(), api.meta(), api.locations()]);
      setSummary(t);
      const usable = ls.locations.filter((l) => l.active === 1);
      setLocations(usable);
      setLocationId((cur) => cur ?? usable[0]?.id ?? null);
    } catch (err) {
      toast("加载失败：" + String((err as Error).message));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!name.trim()) {
      toast("名称不能为空");
      return;
    }
    try {
      await api.receipt({
        idempotencyKey: idemKey("receipt", name),
        name: name.trim(),
        barcode: barcode ?? undefined,
        quantity: Number(qty) || 1,
        locationId: locationId ?? undefined,
        expiryDate: expiry || null,
      });
      toast("已入库：" + name.trim());
      setAddOpen(false);
      setName("");
      setBarcode(null);
      await load();
    } catch (err) {
      toast("入库失败：" + String((err as Error).message));
    }
  }

  /** 扫到码：先查家里有没有同条码的东西，有就带出名字，没有就等用户填一次名字（下次就自动认了） */
  async function handleScanned(raw: string) {
    setScanOpen(false);
    const code = normalizeBarcode(raw);
    if (!code) return;
    setBarcode(code);
    if (!looksLikeProductCode(code)) toast("扫到的不是商品条码，先按编号存着");
    try {
      const found = findByBarcode((await api.items(code)).items, code);
      if (found) {
        setName(found.name);
        setQty("1");
        if (found.default_location_id) setLocationId(found.default_location_id);
        toast("认出来了：" + found.name);
      } else {
        setName("");
        toast("新条码：填个名字，下次就自动认了");
      }
    } catch {
      setName("");
      toast("条码没查成，手动填也行");
    }
    setAddOpen(true);
  }

  async function addToShopping(label: string) {
    try {
      await api.shoppingFromLow();
      toast("已加入购物清单：" + label);
    } catch (err) {
      toast("失败：" + String((err as Error).message));
    }
  }

  const expiryRows = useMemo(() => groupExpiring(summary), [summary]);
  const worst = expiryRows[0];

  const expiryRow = (r: ExpiryRow) => {
    const text = expiryText(r.expiry);
    const urgent = text.includes("过期") || text.includes("今天") || text.includes("明天");
    return (
      <ListRow
        key={r.key}
        thumb={r.name.slice(0, 1)}
        title={r.name + " · " + r.qty + " " + r.baseUnit}
        subtitle={(r.location ?? "未知地点") + " · 到期 " + r.expiry}
        right={<Pill tone={urgent ? "danger" : "warn"} label={text} />}
      />
    );
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg, marginBottom: keyboard }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      >
        <View style={[ui.card, { backgroundColor: c.primarySoft, padding: 16 }]}>
          <Text style={{ color: c.text3, fontSize: 11 }}>最该先做的一件事</Text>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 6 }}>
            {worst ? "先处理 " + worst.name + " ×" + worst.qty : "冰箱很干净"}
          </Text>
          <Text style={{ color: c.text2, fontSize: 13, marginTop: 4 }}>
            {worst ? expiryText(worst.expiry) + " · " + (worst.location ?? "未知地点") : "这周没有临期的东西"}
          </Text>
        </View>

        <SectionTitle title="今日提醒" hint={summary ? summary.date : ""} />
        <View style={[ui.card, { padding: 14 }]}>
          {summary ? (
            <>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }}>
                {expiryRows.length} 样快过期 · {summary.counts.lowStock} 样该补货 · {summary.counts.tasks} 件待办
              </Text>
              <Text style={ui.sub}>
                {expiryRows.length + summary.counts.lowStock + summary.counts.tasks === 0
                  ? "今天没有要处理的事，安心。"
                  : "都是按你自己的库存算出来的，不用记。"}
              </Text>
            </>
          ) : (
            <Text style={ui.note}>加载中…</Text>
          )}
          <Text style={ui.note}>想知道就打开看一眼；手机锁屏提醒要等打包成正式 App 之后。</Text>
        </View>

        <SectionTitle title="赏味期限" hint={expiryRows.length ? expiryRows.length + " 样 · 快到期的在前" : ""} />
        <CollapsibleList
          title="赏味期限"
          items={expiryRows}
          initial={4}
          renderItem={expiryRow}
          emptyText="暂时没有临期物品。"
          searchText={(r) => r.name + " " + (r.location ?? "")}
          hint="同一物品同一到期日的批次已合并成一行。"
        />

        <SectionTitle title="该补货了" hint="低于你设的阈值" />
        <CollapsibleList
          title="该补货了"
          items={summary?.lowStock ?? []}
          initial={4}
          renderItem={(i) => (
            <ListRow
              key={i.item_id}
              thumb={i.name.slice(0, 1)}
              title={i.name}
              subtitle={"现有 " + i.quantity + " " + i.base_unit + " · 低于补货点 " + i.reorder_point}
              right={<Btn label="加清单" onPress={() => void addToShopping(i.name)} />}
            />
          )}
          emptyText="库存都在阈值之上。"
          searchText={(i) => i.name}
        />

        <SectionTitle title="随手记" hint={barcode ? "扫到条码了，填个名字就能入库" : "填个名字就行，其它可以后补"} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Btn label="扫条码" onPress={() => setScanOpen(true)} style={{ flex: 1 }} />
          <Btn label="＋ 手动录入一笔" primary onPress={() => { setBarcode(null); setAddOpen(true); }} style={{ flex: 1 }} />
        </View>
        <Text style={ui.note}>扫过的东西记住了条码，下次扫同一个码直接带出名字。</Text>

        <Text style={ui.note}>数据只存在你自己电脑上的一个文件里。</Text>
      </ScrollView>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="随手记一笔">
        {barcode ? <Text style={{ color: c.text3, fontSize: 12, marginBottom: 8 }}>{"条码 " + barcode + "（下次扫同一个码会自动认出来）"}</Text> : null}
        <Text style={{ color: c.text3, fontSize: 12 }}>{barcode ? "名称（扫到的新东西，填一次就记住）" : "名称（不存在会自动建物品）"}</Text>
        <TextInput style={inputStyle(c, n)} value={name} onChangeText={setName} placeholder="例如 酸奶" placeholderTextColor={c.text3} />
        <Text style={{ color: c.text3, fontSize: 12, marginTop: 12 }}>数量</Text>
        <TextInput style={inputStyle(c, n)} value={qty} onChangeText={setQty} keyboardType="numeric" />
        <Text style={{ color: c.text3, fontSize: 12, marginTop: 12 }}>放哪儿</Text>
        <Pressable testID="pick-location" onPress={() => setLocPickerOpen(true)} style={rowStyle(c, n)}>
          <Text style={{ color: c.text, fontSize: 14 }}>{locations.find((l) => l.id === locationId)?.name ?? "选择容器"}</Text>
          <Text style={{ color: c.text3, fontSize: 12 }}>点击选择 ▾</Text>
        </Pressable>
        <Text style={{ color: c.text3, fontSize: 12, marginTop: 12 }}>到期日</Text>
        <Pressable testID="pick-expiry" onPress={() => setDatePickerOpen(true)} style={rowStyle(c, n)}>
          <Text style={{ color: c.text, fontSize: 14 }}>{expiry || "不限"}</Text>
          <Text style={{ color: c.text3, fontSize: 12 }}>{expiry ? expiryText(expiry) : "点击选择 ▾"}</Text>
        </Pressable>
        <Btn label="入库" primary onPress={() => void submit()} style={{ marginTop: 16 }} />
      </Sheet>

      <ScanSheet visible={scanOpen} onClose={() => setScanOpen(false)} onScanned={(code) => void handleScanned(code)} />

      <ContainerPicker
        visible={locPickerOpen}
        onClose={() => setLocPickerOpen(false)}
        locations={locations}
        valueId={locationId}
        onSelect={(l) => setLocationId(l.id)}
        onChanged={load}
      />

      <MonthPicker
        visible={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        value={expiry}
        onPick={(iso) => { setExpiry(iso ?? ""); setDatePickerOpen(false); }}
      />
    </>
  );
}

function rowStyle(c: Record<string, string>, n: Record<string, number>) {
  return {
    borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, borderRadius: n.radiusCtl,
    minHeight: n.ctlH, paddingHorizontal: 12, marginTop: 6,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  } as const;
}

function inputStyle(c: Record<string, string>, n: Record<string, number>) {
  return {
    borderWidth: n.borderW, borderColor: c.border, backgroundColor: c.surface2, color: c.text,
    borderRadius: n.radiusCtl, minHeight: n.ctlH, paddingHorizontal: 12, marginTop: 6,
  } as const;
}
