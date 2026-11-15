-- সার্ভারের এরর — সুপার অ্যাডমিনের "এরর লগ" পেজে দেখা যায়। একই এরর বারবার হলে একটাই লাইন, count বাড়ে।
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  shop_id TEXT,
  method TEXT,
  path TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  first_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_error_log_last ON error_log(resolved, last_at);
