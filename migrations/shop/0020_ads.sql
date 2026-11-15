-- ধাপ ৫: অ্যাডের খরচ (দোকানদার নিজে লেখে) — আসল খরচ = খরচ ÷ ডেলিভারি হওয়া অর্ডার
CREATE TABLE ad_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,                 -- ঢাকার তারিখ YYYY-MM-DD
  amount INTEGER NOT NULL,           -- টাকায় (ডলারে দিলে রেট দিয়ে টাকায় বদলে রাখা)
  product_id INTEGER,                -- কোন পণ্যের অ্যাড (ফাঁকা = পুরো দোকান)
  note TEXT,
  usd REAL,                          -- ডলারে দিলে আসল পরিমাণ
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ad_spend_day ON ad_spend(day);
