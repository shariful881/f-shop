-- অনলাইন রিচার্জ (UddoktaPay): দোকানদার পেমেন্ট পেজে পে করলে নিজে থেকে ব্যালেন্সে যোগ
CREATE TABLE IF NOT EXISTS online_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL DEFAULT 'uddoktapay',
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'completed', 'failed')),
  invoice_id TEXT UNIQUE,              -- গেটওয়ের invoice_id
  method TEXT,                         -- bkash / nagad / rocket ...
  sender TEXT,
  trx_id TEXT,
  fee TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_online_payments_shop ON online_payments(shop_id, id);
CREATE INDEX IF NOT EXISTS idx_online_payments_status ON online_payments(status, id);
