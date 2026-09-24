/** 通用小部件：Toast、底部弹层、胶囊、按钮、行（全部走主题令牌） */
import React, { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useKeyboardOverlap } from "../lib/keyboard";
import { useTheme, useUi } from "../theme";

let toastListener: ((msg: string) => void) | null = null;
export function toast(msg: string): void {
  toastListener?.(msg);
}

export function ToastHost() {
  const { c, n } = useTheme();
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    toastListener = (m: string) => {
      setMsg(m);
      setOpen(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setOpen(false), 2000);
    };
    return () => {
      if (timer) clearTimeout(timer);
      toastListener = null;
    };
  }, []);
  if (!open) return null;
  return (
    <View pointerEvents="none" style={[styles.toast, { backgroundColor: c.text, borderRadius: n.radiusPill }]}>
      <Text style={{ color: c.bg, fontSize: 13 }}>{msg}</Text>
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { c, n } = useTheme();
  // 键盘弹起时，把整个弹层抬到键盘上方——否则输入框会被输入法盖住，用户看不见自己打了什么
  const keyboard = useKeyboardOverlap();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, { marginBottom: keyboard, backgroundColor: c.surface, borderColor: c.borderStrong, borderWidth: n.borderW, borderTopLeftRadius: n.radiusCard, borderTopRightRadius: n.radiusCard }]}>
        <View style={[styles.grip, { backgroundColor: c.borderStrong }]} />
        <Text style={{ color: c.text, fontSize: 19, fontWeight: "700", marginBottom: 4 }}>{title}</Text>
        <ScrollView style={{ maxHeight: Math.max(220, 520 - keyboard) }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function Pill({ tone = "plain", label }: { tone?: "warn" | "danger" | "success" | "info" | "accent" | "plain"; label: string }) {
  const ui = useUi();
  return (
    <View style={ui.pill(tone)}>
      <Text style={ui.pillText(tone)}>{label}</Text>
    </View>
  );
}

export function Btn({ label, onPress, primary, disabled, style }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const { c } = useTheme();
  const ui = useUi();
  const textStyle: TextStyle = { color: primary ? c.onPrimary : c.text, fontWeight: "600", fontSize: 13.5 };
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[primary ? ui.btnPrimary : ui.btn, disabled ? { opacity: 0.5 } : null, style]}>
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

export function ListRow({ title, subtitle, right, onPress, thumb }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; thumb?: string }) {
  const { c } = useTheme();
  const ui = useUi();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={ui.row}>
      {thumb !== undefined && (
        <View style={ui.thumb}>
          <Text style={{ color: c.text, fontWeight: "700" }}>{thumb}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: "600" }} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={ui.sub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  const { c } = useTheme();
  const ui = useUi();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, marginTop: 18 }}>
      <Text style={ui.h2}>{title}</Text>
      {!!hint && <Text style={{ color: c.text3, fontSize: 11.5 }}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { position: "absolute", left: 24, right: 24, bottom: 96, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center", zIndex: 20 },
  scrim: { flex: 1, backgroundColor: "rgba(8,12,20,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28 },
  grip: { width: 44, height: 4, borderRadius: 4, alignSelf: "center", marginBottom: 12 },
});

export { CollapsibleList } from "./CollapsibleList";
