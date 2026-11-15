-- ধাপ ৩: ফেক অর্ডার আর ফেরত কমানো
-- ডেলিভারির ফল (কুরিয়ার থেকে বা দোকানদার নিজে): delivered | returned
ALTER TABLE orders ADD COLUMN outcome TEXT;
ALTER TABLE orders ADD COLUMN outcome_at TEXT;

-- অসম্পূর্ণ অর্ডার: ফর্মে নম্বর লিখে অর্ডার না করে চলে গেলে
CREATE TABLE incomplete_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  name TEXT,
  address TEXT,
  area TEXT,
  source TEXT NOT NULL DEFAULT 'landing',
  items TEXT NOT NULL DEFAULT '[]',          -- [{productId, variantId, qty}]
  subtotal INTEGER NOT NULL DEFAULT 0,
  device_id TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'called', 'converted', 'dismissed')),
  order_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- একই নম্বরের খোলা একটাই লাইন (আবার লিখলে সেটাই আপডেট হয়)
CREATE UNIQUE INDEX idx_incomplete_open_phone ON incomplete_orders(phone) WHERE status IN ('open', 'called');
CREATE INDEX idx_incomplete_status ON incomplete_orders(status, updated_at);

-- কুরিয়ারের ডেলিভারি রেকর্ড (Steadfast / BD Courier) — একই নম্বর বারবার না খুঁজতে
CREATE TABLE courier_checks (
  phone TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
