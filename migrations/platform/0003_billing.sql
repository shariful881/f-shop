-- বিলিং: ব্যালেন্স, রিচার্জ, লেজার, প্ল্যাটফর্ম সেটিংস

ALTER TABLE shops ADD COLUMN balance INTEGER NOT NULL DEFAULT 0;   -- টাকা (মাইনাস মানে বকেয়া)
ALTER TABLE shops ADD COLUMN next_bill_at TEXT;                     -- পরের মাসিক চার্জ
ALTER TABLE shops ADD COLUMN low_balance_since TEXT;                -- কবে থেকে ব্যালেন্স মাইনাস
ALTER TABLE shops ADD COLUMN staff_count INTEGER NOT NULL DEFAULT 0; -- অতিরিক্ত স্টাফ (প্রতিজন মাসিক চার্জ)

-- সব টাকার হিসাব। একই (দোকান, ধরন, ref) দুবার হয় না — তাই একই অর্ডারে দুবার চার্জ কাটা অসম্ভব
CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup', 'order_fee', 'monthly', 'trial_order', 'adjust')),
  amount INTEGER NOT NULL,            -- + জমা, - চার্জ
  balance_after INTEGER,
  ref TEXT NOT NULL,                  -- অর্ডার নং / মাস / রিচার্জ আইডি
  note TEXT,
  applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (shop_id, type, ref)
);
CREATE INDEX idx_ledger_shop ON ledger(shop_id, id);

-- bKash/Nagad রিচার্জের অনুরোধ — সুপার অ্যাডমিন অনুমোদন দিলে ব্যালেন্সে যোগ হয়
CREATE TABLE topups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('bkash', 'nagad')),
  sender TEXT NOT NULL,               -- যে নম্বর থেকে পাঠানো
  trx_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE INDEX idx_topups_status ON topups(status, id);
CREATE INDEX idx_topups_shop ON topups(shop_id, id);

CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
INSERT INTO platform_settings (key, value) VALUES
  ('order_fee', '2'),        -- প্রতি কনফার্ম অর্ডার
  ('monthly_fee', '99'),     -- মাসিক সার্ভিস চার্জ
  ('staff_fee', '99'),       -- প্রতি স্টাফ মাসিক
  ('trial_days', '14'),
  ('trial_orders', '50'),
  ('grace_days', '3'),       -- ব্যালেন্স মাইনাস হওয়ার কত দিন পর অর্ডার বন্ধ
  ('min_topup', '100'),
  ('bkash_number', '01XXXXXXXXX'),
  ('nagad_number', '01XXXXXXXXX'),
  ('support_phone', '01XXXXXXXXX');
