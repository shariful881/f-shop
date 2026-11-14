-- সাইনআপ, ফ্রি ট্রায়াল আর সুপার অ্যাডমিন

ALTER TABLE shops ADD COLUMN trial_ends_at TEXT;              -- ট্রায়াল শেষ (১৪ দিন)
ALTER TABLE shops ADD COLUMN trial_orders_left INTEGER NOT NULL DEFAULT 50; -- ট্রায়ালে বাকি ফ্রি অর্ডার
CREATE INDEX idx_shops_phone ON shops(owner_phone);

CREATE TABLE super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE super_sessions (
  id TEXT PRIMARY KEY,                -- টোকেনের SHA-256
  admin_id INTEGER NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE platform_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
