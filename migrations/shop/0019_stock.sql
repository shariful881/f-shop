-- ধাপ ৪: স্টক আর ইনভেন্টরি
-- track_stock = 1 হলে স্টক গোনা হয়। ভ্যারিয়েন্ট থাকলে স্টক ভ্যারিয়েন্টে, আর products.stock = চালু ভ্যারিয়েন্টগুলোর যোগফল
ALTER TABLE products ADD COLUMN track_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN low_stock INTEGER NOT NULL DEFAULT 5;   -- এর সমান বা কম হলে "কম আছে" সতর্কতা
ALTER TABLE products ADD COLUMN cost_price INTEGER;                      -- ক্রয়মূল্য (লাভের হিসাবের জন্য)
ALTER TABLE product_variants ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_variants ADD COLUMN cost_price INTEGER;

-- কনফার্মে স্টক কমেছে কিনা (দুবার না কমে)
ALTER TABLE orders ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 0;

-- স্টকের প্রতিটা বদল: কোন পণ্য, কত, কেন
CREATE TABLE stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  change INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('order', 'cancel', 'return', 'manual')),
  order_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_stock_moves_product ON stock_moves(product_id, id);
CREATE INDEX idx_stock_moves_order ON stock_moves(order_id);
