-- পণ্যের বাড়তি তথ্য: SKU, বারকোড, ব্র্যান্ড, একাধিক ছবি (গ্যালারি), মূল বৈশিষ্ট্য, হাতে বসানো স্টকের অবস্থা
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN brand TEXT;
ALTER TABLE products ADD COLUMN gallery_json TEXT;   -- ["p/abc.jpg", ...] — মূল ছবির পরে দেখায়
ALTER TABLE products ADD COLUMN features TEXT;       -- প্রতি লাইনে একটা বৈশিষ্ট্য
ALTER TABLE products ADD COLUMN stock_status TEXT NOT NULL DEFAULT 'in'; -- 'in' | 'out' (স্টক না গুনলে হাতে বসানো)
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
