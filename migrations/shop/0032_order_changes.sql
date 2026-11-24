-- অর্ডারে ক্রেতার তথ্য/এলাকা/দাম বদলের ইতিহাস (কে, কখন, কী থেকে কী)
CREATE TABLE IF NOT EXISTS order_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  changes_json TEXT NOT NULL,
  by_name TEXT,
  by_role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_changes_order ON order_changes(order_id, id);
