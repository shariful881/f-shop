-- ধাপ ৩: সব দোকানের মিলিত ক্রেতার রেকর্ড
-- নম্বর সরাসরি রাখা হয় না — গোপন চাবি দিয়ে HMAC-SHA256 হ্যাশ। অন্য দোকানের নাম কখনো দেখানো হয় না।
CREATE TABLE phone_outcomes (
  shop_id TEXT NOT NULL,
  order_no TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('delivered', 'returned', 'cancelled', 'fake')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (shop_id, order_no)
);
CREATE INDEX idx_phone_outcomes_hash ON phone_outcomes(phone_hash);
