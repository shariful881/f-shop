-- ধাপ ৭: রিভিউ আর লাভের হিসাব
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,            -- শুধু যে কিনেছে (অর্ডার নং + মোবাইল মিলিয়ে)
  name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  image TEXT,                           -- ছবির key (ঐচ্ছিক)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  reply TEXT,                           -- দোকানের উত্তর
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (order_id, product_id)
);
CREATE INDEX idx_reviews_product ON reviews(product_id, status, id);
CREATE INDEX idx_reviews_status ON reviews(status, id);

-- কার্ডে তারা দেখাতে (অনুমোদিত রিভিউ থেকে)
ALTER TABLE products ADD COLUMN rating_avg REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;

-- কনফার্মের সময়ের ক্রয়মূল্য (পরে দাম বদলালেও পুরনো লাভের হিসাব ঠিক থাকে)
ALTER TABLE order_items ADD COLUMN unit_cost INTEGER;
