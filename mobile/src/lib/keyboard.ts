/** 键盘遮挡量：纯 JS 计算，安卓/iOS 都能用，并且不会和系统自带的窗口缩放重复抬高 */
import { useEffect, useState } from "react";
import { Dimensions, Keyboard } from "react-native";

/** 还需要自己补的遮挡量 = 键盘高度 − 系统已经压缩掉的窗口高度（负数取 0） */
export function keyboardOverlap(keyboardHeight: number, baseWindowHeight: number, currentWindowHeight: number): number {
  const shrink = Math.max(0, baseWindowHeight - currentWindowHeight);
  return Math.max(0, Math.round(keyboardHeight - shrink));
}

/** 键盘弹起时返回"还需要让出多少高度"，收起时返回 0 */
export function useKeyboardOverlap(): number {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    const base = Dimensions.get("window").height;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setOverlap(keyboardOverlap(e.endCoordinates.height, base, Dimensions.get("window").height));
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setOverlap(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return overlap;
}
