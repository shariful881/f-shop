-- পণ্য/ল্যান্ডিং পেজের লিংক (slug) বদলালে পুরনো লিংক → নতুন লিংকে ৩০১ (বিজ্ঞাপন আর শেয়ার করা লিংক যেন না ভাঙে)
CREATE TABLE IF NOT EXISTS slug_redirects (
  old_slug TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_slug_redirects_product ON slug_redirects(product_id);
