import { z } from "zod";

/** 库存流水类型：入库 / 领用 / 调拨（出+入两条）/ 盘点调整 */
export const txTypeSchema = z.enum(["receipt", "issue", "transfer_out", "transfer_in", "adjust"]);
export type TxType = z.infer<typeof txTypeSchema>;

/** 消耗类型：consumable=用完就没了（触发补货联动）；durable=耐用品；medicine=药品 */
export const consumptionTypeSchema = z.enum(["consumable", "durable", "medicine"]);
export type ConsumptionType = z.infer<typeof consumptionTypeSchema>;

/** 待办来源：chore=周期家务模板；linked=库存联动；expiry=临期；purchase=采购计划 */
export const taskKindSchema = z.enum(["chore", "linked", "expiry", "purchase"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

/** 日历四类事件（计划书 5.1） */
export const calendarEventTypeSchema = z.enum(["expiry", "buy", "chore", "care"]);
export type CalendarEventType = z.infer<typeof calendarEventTypeSchema>;

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  /** 移动端（React Native）没有浏览器 cookie jar，登录时直接签发 Bearer Token */
  issueToken: z.boolean().default(false),
  tokenName: z.string().max(60).optional()
});
export const setupSchema = z.object({
  homeName: z.string().min(1).default("我家"),
  username: z.string().min(1).default("admin"),
  password: z.string().min(6),
  timezone: z.string().default("Asia/Shanghai"),
  defaultCurrency: z.string().default("CNY"),
  /** 移动端首启：初始化完直接给 Token，省掉一次登录 */
  issueToken: z.boolean().default(false)
});

/** 写操作必须带幂等键：同键重放不重复扣减（AL1S 已验证的做法） */
export const idempotent = { idempotencyKey: z.string().min(8).max(120) };
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式 YYYY-MM-DD");

export const locationInputSchema = z.object({
  name: z.string().min(1).max(40),
  parentId: z.string().nullable().optional(),
  kind: z.string().max(20).default("storage"),
  sortOrder: z.number().int().default(0)
});

export const categoryInputSchema = z.object({
  name: z.string().min(1).max(40),
  parentId: z.string().nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  sortOrder: z.number().int().default(0)
});

export const itemInputSchema = z.object({
  name: z.string().min(1).max(80),
  barcode: z.string().max(64).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  baseUnit: z.string().min(1).max(8).default("个"),
  icon: z.string().max(40).nullable().optional(),
  consumptionType: consumptionTypeSchema.default("consumable"),
  reorderPoint: z.number().min(0).default(0),
  reorderQuantity: z.number().min(0).default(1),
  defaultLocationId: z.string().nullable().optional(),
  expiryWarnDays: z.number().int().min(0).max(365).default(7),
  note: z.string().max(500).nullable().optional()
});

export const receiptSchema = z.object({
  ...idempotent,
  itemId: z.string().optional(),
  name: z.string().min(1).max(80).optional(),
  barcode: z.string().max(64).optional(),
  quantity: z.number().positive(),
  unit: z.string().max(8).optional(),
  locationId: z.string().optional(),
  locationName: z.string().max(40).optional(),
  expiryDate: dateStr.nullable().optional(),
  manufacturedDate: dateStr.nullable().optional(),
  unitCostMinor: z.number().int().min(0).nullable().optional(),
  channel: z.string().max(40).nullable().optional(),
  batchNo: z.string().max(40).nullable().optional()
});

export const issueSchema = z.object({
  ...idempotent,
  itemId: z.string(),
  quantity: z.number().positive(),
  locationId: z.string().nullable().optional(),
  batchId: z.string().nullable().optional(),
  reason: z.string().max(80).nullable().optional()
});

export const transferBatchSchema = z.object({
  ...idempotent,
  itemIds: z.array(z.string()).min(1).max(200),
  fromLocationId: z.string(),
  toLocationId: z.string()
});

export const transferSchema = z.object({
  ...idempotent,
  itemId: z.string(),
  quantity: z.number().positive(),
  fromLocationId: z.string(),
  toLocationId: z.string()
});

export const countSchema = z.object({
  ...idempotent,
  itemId: z.string(),
  locationId: z.string().nullable().optional(),
  countedQuantity: z.number().min(0),
  reason: z.string().max(80).nullable().optional()
});
