/** 扫条码：全屏相机取景，Expo Go 里直接可用（不需要自定义 dev build） */
import React, { useEffect, useRef } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera";
import { useTheme, useUi } from "../theme";
import { Btn } from "./ui";

const BARCODE_TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e", "itf14", "code128", "code39", "codabar"];

export function ScanSheet({ visible, onClose, onScanned }: {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
}) {
  const { c, n } = useTheme();
  const ui = useUi();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  // 每次打开只收一个码，避免同一帧被连续识别成多次
  useEffect(() => {
    if (visible) handled.current = false;
  }, [visible]);

  function accept(data: string) {
    if (handled.current) return;
    handled.current = true;
    onScanned(data);
  }

  const granted = permission?.granted === true;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
          <Text style={ui.h2}>扫条码</Text>
          <Btn label="关闭" onPress={onClose} />
        </View>

        {granted ? (
          <View style={{ flex: 1, margin: 16, borderRadius: n.radiusCard, overflow: "hidden", borderWidth: n.borderW, borderColor: c.borderStrong }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={({ data }) => accept(data)}
            />
            <View pointerEvents="none" style={styles.frameWrap}>
              <View style={[styles.frame, { borderColor: c.primary, borderRadius: n.radiusCtl }]} />
            </View>
          </View>
        ) : (
          <View style={[ui.card, { padding: 16, margin: 16 }]}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }}>
              {permission ? "需要相机权限才能扫条码" : "正在准备相机…"}
            </Text>
            <Text style={ui.sub}>
              {permission && !permission.canAskAgain
                ? "系统已不再询问：请到手机的「设置 → 应用 → 家庭仓管日历 → 权限」里打开相机。"
                : "只用来看条码，不会保存照片，也不联网。"}
            </Text>
            {permission && !permission.granted && permission.canAskAgain ? (
              <Btn label="允许使用相机" primary onPress={() => void requestPermission()} style={{ marginTop: 14 }} />
            ) : null}
          </View>
        )}

        <Text style={{ color: c.text3, fontSize: 12, textAlign: "center", paddingHorizontal: 24, paddingBottom: 20 }}>
          把条码对准方框，认出来会自动跳回「随手记」；认错了可以当场改。
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frameWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  frame: { width: "78%", height: 140, borderWidth: 2 },
});
