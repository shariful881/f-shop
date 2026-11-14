-- প্রফেশনাল সুপার অ্যাডমিন: টিম রোল, অডিট লগ, নোট, ঘোষণা, পরিসংখ্যানের কাউন্টার

-- সুপার অ্যাডমিন টিম
ALTER TABLE super_admins ADD COLUMN name TEXT;
ALTER TABLE super_admins ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';   -- owner | admin | support | finance
ALTER TABLE super_admins ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE super_admins ADD COLUMN last_login_at TEXT;

-- দোকানের পরিসংখ্যান (হাজার দোকানেও দ্রুত — প্রতিটা দোকানের ডাটাবেস খুলতে হয় না)
ALTER TABLE shops ADD COLUMN confirmed_orders INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shops ADD COLUMN last_order_at TEXT;
ALTER TABLE shops ADD COLUMN last_login_at TEXT;
ALTER TABLE shops ADD COLUMN status_changed_at TEXT;
ALTER TABLE shops ADD COLUMN activated_at TEXT;          -- ট্রায়াল শেষে চালু হওয়ার সময়
ALTER TABLE shops ADD COLUMN first_topup_at TEXT;        -- প্রথম রিচার্জ (পেইড কাস্টমার)

UPDATE shops SET
  confirmed_orders = (SELECT COUNT(*) FROM ledger l WHERE l.shop_id = shops.id AND l.type IN ('order_fee', 'trial_order') AND l.applied = 1),
  last_order_at = (SELECT MAX(created_at) FROM ledger l WHERE l.shop_id = shops.id AND l.type IN ('order_fee', 'trial_order') AND l.applied = 1),
  activated_at = (SELECT MIN(created_at) FROM ledger l WHERE l.shop_id = shops.id AND l.ref LIKE 'trial-end:%'),
  first_topup_at = (SELECT MIN(created_at) FROM ledger l WHERE l.shop_id = shops.id AND l.type = 'topup' AND l.applied = 1);

CREATE INDEX idx_shops_status_created ON shops(status, created_at);
CREATE INDEX idx_shops_created ON shops(created_at);
CREATE INDEX idx_ledger_type_created ON ledger(type, created_at);

-- অডিট লগ: সুপার অ্যাডমিন টিমের প্রতিটা কাজ
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,          -- shop | topup | admin | settings | announcement
  target_id TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_target ON audit_log(target_type, target_id, id);

-- দোকান নিয়ে টিমের ভিতরের নোট
CREATE TABLE shop_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  admin_email TEXT,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_shop_notes ON shop_notes(shop_id, id);

-- সব দোকানের অ্যাডমিন প্যানেলে ঘোষণা
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'success', 'warn')),
  active INTEGER NOT NULL DEFAULT 1,
  ends_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
