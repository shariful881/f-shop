-- সাইজ/রং ভ্যারিয়েন্ট
ALTER TABLE products ADD COLUMN options_json TEXT;   -- [{"name":"সাইজ","values":["S","M"]},{"name":"রং","values":["লাল"]}]

CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                 -- যেমন "কালো / XL"
  price INTEGER,                       -- ফাঁকা হলে পণ্যের দাম
  active INTEGER NOT NULL DEFAULT 1,   -- স্টকে নেই হলে 0
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, label)
);
CREATE INDEX idx_variants_product ON product_variants(product_id, sort_order);

ALTER TABLE order_items ADD COLUMN variant_id INTEGER;
ALTER TABLE order_items ADD COLUMN variant_label TEXT;
