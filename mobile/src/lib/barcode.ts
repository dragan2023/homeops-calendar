/** 条码工具：纯字符串处理，方便单测；相机部分在 components/ScanBarcode.tsx */

/** 各家扫码库返回的格式不一，统一去掉分隔符并转大写后比较 */
export function normalizeBarcode(raw: string): string {
  return String(raw ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/** 后端按模糊匹配返回候选，这里只认条码完全相同的那个 */
export function findByBarcode<T extends { barcode?: string | null }>(items: T[], code: string): T | null {
  const want = normalizeBarcode(code);
  if (!want) return null;
  for (const i of items) if (normalizeBarcode(String(i.barcode ?? "")) === want) return i;
  return null;
}

/** 商品条码（EAN-8/13、UPC-A/E、ITF-14）都是 8–14 位纯数字；扫到别的码也能存，只是提示一下 */
export function looksLikeProductCode(raw: string): boolean {
  return /^\d{8,14}$/.test(normalizeBarcode(raw));
}
