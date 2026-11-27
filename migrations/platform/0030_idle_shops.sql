-- নিষ্ক্রিয় দোকান (মোঃ, ২৭ নভেম্বর ২০২৬)
-- ট্রায়ালে দোকান সাজাতে মনে করানো (৩ আর ৭ দিনে) — কোনটা পাঠানো হয়েছে
ALTER TABLE shops ADD COLUMN nudged TEXT;
-- মুছে ফেলা দোকানের ডাটার কপি — ৯০ দিন (ফিরে এলে ফেরানো যায়); D1-এর এক সারির সীমার জন্য টুকরো করে
CREATE TABLE IF NOT EXISTS deleted_backups (
  shop_id TEXT PRIMARY KEY,
  slug TEXT,
  name TEXT,
  reason TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  parts INTEGER NOT NULL DEFAULT 0,
  images_r2 INTEGER NOT NULL DEFAULT 0,
  images_kept INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deleted_backup_parts (
  shop_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (shop_id, part)
);
CREATE INDEX IF NOT EXISTS idx_deleted_backups_expires ON deleted_backups(expires_at);
