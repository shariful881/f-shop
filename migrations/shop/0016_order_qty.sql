-- অর্ডারে একই পণ্যের একাধিক পরিমাণ: order_items-এর "qty = 1" শর্ত তুলে দেওয়া (১–৫০)
-- SQLite-এ CHECK বদলানো যায় না, তাই টেবিল নতুন করে বানিয়ে সব পুরনো ডাটা কপি
CREATE TABLE order_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 50),
  variant_id INTEGER,
  variant_label TEXT
);
INSERT INTO order_items_new (id, order_id, product_id, product_name, price, qty, variant_id, variant_label)
  SELECT id, order_id, product_id, product_name, price, qty, variant_id, variant_label FROM order_items;
DROP TABLE order_items;
ALTER TABLE order_items_new RENAME TO order_items;
CREATE INDEX idx_order_items_order ON order_items(order_id);
