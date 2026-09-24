-- 家用仓管日历 · 初始 schema
-- 约定：TEXT 主键存 UUID；时间一律 ISO8601 文本（UTC）；金额存"分"（整数）；
-- 所有业务表带 home_id（MVP 单家庭，但模型预留多家庭）。

CREATE TABLE IF NOT EXISTS homes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'home',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  default_currency TEXT NOT NULL DEFAULT 'CNY',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  home_id TEXT REFERENCES homes(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  home_id TEXT REFERENCES homes(id),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 地点树：冰箱 / 冷冻室 / 储物柜 / 药箱 / 阳台
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id),
  parent_id TEXT REFERENCES locations(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'storage',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(home_id, parent_id, name)
);

CREATE TABLE IF NOT EXISTS item_categories (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id),
  parent_id TEXT REFERENCES item_categories(id),
  name TEXT NOT NULL,
  icon TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(home_id, parent_id, name)
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id),
  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES item_categories(id),
  base_unit TEXT NOT NULL DEFAULT '个',
  icon TEXT,
  consumption_type TEXT NOT NULL DEFAULT 'consumable',
  reorder_point REAL NOT NULL DEFAULT 0,
  reorder_quantity REAL NOT NULL DEFAULT 1,
  default_location_id TEXT REFERENCES locations(id),
  expiry_warn_days INTEGER NOT NULL DEFAULT 7,
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(home_id, sku)
);

-- 批次：临期与成本都挂这里（FEFO 先过期先出）
CREATE TABLE IF NOT EXISTS stock_batches (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  batch_no TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  manufactured_date TEXT,
  expiry_date TEXT,
  unit_cost_minor INTEGER,
  channel TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 流水：唯一真相来源；幂等键防重放
CREATE TABLE IF NOT EXISTS stock_transactions (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  batch_id TEXT REFERENCES stock_batches(id),
  location_id TEXT REFERENCES locations(id),
  to_location_id TEXT REFERENCES locations(id),
  type TEXT NOT NULL CHECK(type IN ('receipt','issue','transfer_out','transfer_in','adjust')),
  quantity REAL NOT NULL,
  unit_cost_minor INTEGER,
  reason TEXT,
  idempotency_key TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(home_id, idempotency_key)
);

-- 购物清单（采购闭环）
CREATE TABLE IF NOT EXISTS shopping_list (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id),
  item_id TEXT REFERENCES items(id),
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT,
  planned_date TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

-- 周期家务模板（清理冰箱 / 换滤芯 / 查药箱）
CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id),
  title TEXT NOT NULL,
  note TEXT,
  cycle_rule TEXT NOT NULL,
  next_due_date TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  item_id TEXT REFERENCES items(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- 待办：周期家务 / 库存联动 / 临期处理 / 采购计划
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id),
  title TEXT NOT NULL,
  note TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('chore','linked','expiry','purchase')),
  source_type TEXT,
  source_id TEXT,
  template_id TEXT REFERENCES task_templates(id),
  item_id TEXT REFERENCES items(id),
  location_id TEXT REFERENCES locations(id),
  due_date TEXT,
  remind_at TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_events (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL REFERENCES homes(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  item_name TEXT NOT NULL,
  location_id TEXT,
  location_name TEXT,
  type TEXT NOT NULL,
  quantity REAL,
  reason TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_locations_home ON locations(home_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_items_home ON items(home_id, active, name);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(home_id, barcode);
CREATE INDEX IF NOT EXISTS idx_batches_fefo ON stock_batches(home_id, item_id, expiry_date, received_at);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON stock_batches(home_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_location ON stock_batches(home_id, location_id, item_id);
CREATE INDEX IF NOT EXISTS idx_tx_item ON stock_transactions(home_id, item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_batch ON stock_transactions(home_id, batch_id, type);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(home_id, done, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_kind ON tasks(home_id, kind, done);
CREATE INDEX IF NOT EXISTS idx_shopping_pending ON shopping_list(home_id, completed, planned_date);
CREATE INDEX IF NOT EXISTS idx_events_item ON item_events(home_id, item_id, occurred_at DESC);
