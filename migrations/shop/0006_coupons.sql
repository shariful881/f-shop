-- কুপন কোড
CREATE TABLE coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,              -- সবসময় বড় হাতের অক্ষরে
  type TEXT NOT NULL CHECK (type IN ('fixed', 'percent', 'free_delivery')),
  value INTEGER NOT NULL DEFAULT 0,       -- fixed: টাকা, percent: %
  max_discount INTEGER,                   -- percent-এ সর্বোচ্চ ছাড়
  min_order INTEGER NOT NULL DEFAULT 0,   -- সর্বনিম্ন পণ্যের দাম
  starts_at TEXT,
  expires_at TEXT,
  usage_limit INTEGER,                    -- মোট কতবার (ফাঁকা = সীমাহীন)
  used_count INTEGER NOT NULL DEFAULT 0,
  once_per_phone INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE orders ADD COLUMN coupon_code TEXT;
ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_orders_coupon ON orders(coupon_code, phone);
