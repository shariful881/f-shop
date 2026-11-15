-- ধাপ ৮: নতুন অর্ডারে ফোনে নোটিফিকেশন আর দোকানের ব্লগ
CREATE TABLE push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- পেজ এখন দুই রকম: সাধারণ পেজ আর ব্লগ পোস্ট (/blog-এ তালিকা)
ALTER TABLE pages ADD COLUMN kind TEXT NOT NULL DEFAULT 'page';
ALTER TABLE pages ADD COLUMN excerpt TEXT;
ALTER TABLE pages ADD COLUMN image TEXT;
CREATE INDEX idx_pages_kind ON pages(kind, is_active, created_at);
