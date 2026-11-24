-- দোকানের নিজের অর্ডার নোট (ক্রেতা দেখে না) + মনে করানোর সময় (ফলো-আপ)
CREATE TABLE IF NOT EXISTS order_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  remind_at TEXT,           -- UTC 'YYYY-MM-DD HH:MM:SS'; NULL = শুধু নোট
  done_at TEXT,             -- ফলো-আপ শেষ
  pushed_at TEXT,           -- সময় হলে ফোনে পুশ গেছে
  by_name TEXT,
  by_role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_notes_order ON order_notes(order_id, id);
CREATE INDEX IF NOT EXISTS idx_order_notes_due ON order_notes(remind_at) WHERE remind_at IS NOT NULL AND done_at IS NULL;
