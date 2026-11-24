-- স্প্যাম ফিল্টার: সন্দেহজনক অর্ডার "স্প্যাম" তালিকায় (স্ট্যাটাস 'new' থাকে, spam = 1)
-- spam: 0 = সাধারণ, 1 = স্প্যাম তালিকায়, 2 = যাচাই চলছে (কয়েক সেকেন্ড)
ALTER TABLE orders ADD COLUMN spam INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN spam_score INTEGER;
ALTER TABLE orders ADD COLUMN spam_reasons TEXT;
-- একবার স্প্যামে গিয়েছিল (সাপ্তাহিক হিসাব), দোকানদার নতুনে ফিরিয়েছেন
ALTER TABLE orders ADD COLUMN was_spam INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN spam_released INTEGER NOT NULL DEFAULT 0;
-- ফোনের ছাপ (ব্রাউজার বদলালেও একই ফোন চেনা) আর ফর্ম পূরণের সময় (মিলিসেকেন্ড)
ALTER TABLE orders ADD COLUMN fp TEXT;
ALTER TABLE orders ADD COLUMN fill_ms INTEGER;
CREATE INDEX IF NOT EXISTS idx_orders_spam ON orders(spam, id) WHERE spam > 0;
CREATE INDEX IF NOT EXISTS idx_orders_fp ON orders(fp, created_at) WHERE fp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_ip ON orders(ip, created_at);
