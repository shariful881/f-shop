-- নতুন দাম (১৫ নভেম্বর ২০২৬): ফ্রি / ছোট দোকান / বাড়ন্ত / বড় ব্র্যান্ড
-- প্ল্যানের মাসিক ফি আগে কাটে; মাসের অর্ডার গোনা হয়, সীমার বেশি হলে মাস শেষে বাড়তি চার্জ।
ALTER TABLE shops ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE shops ADD COLUMN plan_next TEXT;                         -- ছোট প্ল্যানে নামা — পরের বিলে কার্যকর
ALTER TABLE shops ADD COLUMN cycle_months INTEGER NOT NULL DEFAULT 1; -- ১ / ৬ / ১২ মাস
ALTER TABLE shops ADD COLUMN period_orders INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shops ADD COLUMN usage_reset_at TEXT;

-- এখনকার দোকান: ট্রায়াল → বাড়ন্ত (ট্রায়ালের প্ল্যান), চালু → ছোট দোকান, ডেমো → বড় ব্র্যান্ড (বিল হয় না)
UPDATE shops SET plan = 'grow' WHERE status = 'trial';
UPDATE shops SET plan = 'small' WHERE status IN ('active', 'suspended') AND demo_niche IS NULL;
UPDATE shops SET plan = 'big' WHERE demo_niche IS NOT NULL;
UPDATE shops SET usage_reset_at = datetime('now', '+1 month');

-- নতুন স্টাফ চার্জ ৳৪৯; ট্রায়ালে বাড়ন্ত প্ল্যানের সীমা পর্যন্ত অর্ডার
INSERT INTO platform_settings (key, value) VALUES ('staff_fee', '49') ON CONFLICT(key) DO UPDATE SET value = '49';
INSERT INTO platform_settings (key, value) VALUES ('trial_orders', '1500') ON CONFLICT(key) DO UPDATE SET value = '1500';

-- লেনদেনের নতুন ধরন (plan_order, overage, plan_change) — SQLite-এ CHECK বদলাতে টেবিল নতুন করে বানাতে হয়
PRAGMA defer_foreign_keys = true;
CREATE TABLE ledger_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup', 'order_fee', 'monthly', 'trial_order', 'adjust', 'plan_order', 'overage', 'plan_change')),
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

-- সব দোকানের প্যানেলে ৩০ দিন জানানো
INSERT INTO announcements (title, body, level, ends_at, created_by) VALUES (
  'নতুন দাম চালু — প্রায় সবার খরচ কমল',
  'এখন থেকে প্ল্যান: ফ্রি ৳০, ছোট দোকান ৳৩৯৯, বাড়ন্ত ৳৭৯৯, বড় ব্র্যান্ড ৳১,৪৯৯ (মাসে)। অর্ডারপ্রতি ৳২ আর নেই — প্ল্যানের সীমার মধ্যে সব অর্ডার। চালু দোকানগুলো "ছোট দোকান" প্ল্যানে আছে, ব্যালেন্স যেমন ছিল তেমনই। বিলিং পেজ থেকে প্ল্যান বদলাতে পারবেন।',
  'success', datetime('now', '+30 days'), 'system');
