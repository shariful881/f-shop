-- ডোমেইন বিক্রি (Porkbun): দোকানের ব্যালেন্স থেকে কেনা/রিনিউ — লেনদেনের নতুন ধরন আর কেনা ডোমেইনের তালিকা
PRAGMA defer_foreign_keys = true;
CREATE TABLE ledger_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup', 'order_fee', 'monthly', 'trial_order', 'adjust', 'plan_order', 'overage', 'plan_change', 'domain_buy', 'domain_renew', 'domain_refund')),
  amount INTEGER NOT NULL,
  balance_after INTEGER,
  ref TEXT NOT NULL,
  note TEXT,
  applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (shop_id, type, ref)
);
INSERT INTO ledger_new (id, shop_id, type, amount, balance_after, ref, note, applied, created_at)
  SELECT id, shop_id, type, amount, balance_after, ref, note, applied, created_at FROM ledger;
DROP TABLE ledger;
ALTER TABLE ledger_new RENAME TO ledger;
CREATE INDEX IF NOT EXISTS idx_ledger_shop ON ledger(shop_id, id);
CREATE INDEX IF NOT EXISTS idx_ledger_type_created ON ledger(type, created_at);

-- SellxBD থেকে কেনা ডোমেইন (Porkbun-এ আমাদের অ্যাকাউন্টে)
CREATE TABLE domain_regs (
  domain TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registering' CHECK (status IN ('registering', 'active', 'failed', 'expired', 'transferred')),
  cost_cents INTEGER,            -- Porkbun-কে দেওয়া (USD পয়সা)
  price_bdt INTEGER,             -- দোকানদারের কাছ থেকে নেওয়া (টাকা)
  renew_cents INTEGER,           -- শেষ জানা রিনিউ দাম
  order_id TEXT,
  expires_at TEXT,               -- YYYY-MM-DD
  auto_renew INTEGER NOT NULL DEFAULT 1,
  ns_ok INTEGER NOT NULL DEFAULT 0,   -- Cloudflare-এর নেমসার্ভার Porkbun-এ বসেছে কি না
  warned TEXT,                   -- শেষ যে সতর্কবার্তা গেছে (মেয়াদ:দিন)
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_domain_regs_shop ON domain_regs(shop_id);
CREATE INDEX IF NOT EXISTS idx_domain_regs_expiry ON domain_regs(status, expires_at);

INSERT OR IGNORE INTO platform_settings (key, value) VALUES
  ('domain_sale', '0'),
  ('domain_usd_rate', '130'),
  ('domain_markup', '300'),
  ('domain_tlds', 'com,shop,store,online,xyz,net'),
  ('domain_max_usd', '30');
