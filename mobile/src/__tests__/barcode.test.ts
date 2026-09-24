import { findByBarcode, looksLikeProductCode, normalizeBarcode } from "../lib/barcode";

describe("条码工具", () => {
  it("统一格式后比较：空格、连字符、大小写都不影响", () => {
    expect(normalizeBarcode("690 1234-567892")).toBe("6901234567892");
    expect(normalizeBarcode("ab-12 3")).toBe("AB123");
  });

  it("只认完全相同的条码，不认模糊命中", () => {
    const items = [{ id: "a", barcode: "6901234567892" }, { id: "b", barcode: null }];
    expect(findByBarcode(items, "6901234567892")?.id).toBe("a");
    expect(findByBarcode(items, "690 1234 567892")?.id).toBe("a");
    expect(findByBarcode(items, "690123456789")?.id).toBeUndefined();
    expect(findByBarcode(items, "")).toBeNull();
  });

  it("商品条码判据：8–14 位纯数字", () => {
    expect(looksLikeProductCode("6901234567892")).toBe(true);
    expect(looksLikeProductCode("12345678")).toBe(true);
    expect(looksLikeProductCode("ABC-123")).toBe(false);
    expect(looksLikeProductCode("1234567")).toBe(false);
  });
});
