-- হাতে রিচার্জে DBBL ব্যাংক যোগ (method CHECK বদলাতে টেবিল নতুন করে) + বাদ দেওয়া অনলাইন গেটওয়ের টেবিল মোছা
CREATE TABLE topups_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('bkash', 'nagad', 'dbbl')),
  sender TEXT NOT NULL,
  trx_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
INSERT INTO topups_new (id, shop_id, amount, method, sender, trx_id, status, note, created_at, decided_at)
  SELECT id, shop_id, amount, method, sender, trx_id, status, note, created_at, decided_at FROM topups;
DROP TABLE topups;
ALTER TABLE topups_new RENAME TO topups;
CREATE INDEX idx_topups_status ON topups(status, id);
CREATE INDEX idx_topups_shop ON topups(shop_id, id);
DROP TABLE IF EXISTS online_payments;
