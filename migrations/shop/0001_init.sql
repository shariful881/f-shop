-- F-Shop প্রথম migration: সব টেবিল
-- সময় সব UTC-তে রাখা হয় ('YYYY-MM-DD HH:MM:SS'), দেখানোর সময় Asia/Dhaka-তে রূপান্তর হয়

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Admin',
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,               -- টোকেনের SHA-256 hash
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price INTEGER NOT NULL,
  compare_price INTEGER,             -- কাটা দাম
  image TEXT,                        -- R2-এর key
  headline TEXT,                     -- ল্যান্ডিং পেজের বড় শিরোনাম
  short_desc TEXT,
  details_html TEXT,
  youtube_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  show_on_home INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_category ON products(category_id, sort_order);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,               -- সবসময় 01XXXXXXXXX ফরম্যাটে
  address TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('inside', 'outside')),
  note TEXT,
  subtotal INTEGER NOT NULL,
  delivery_charge INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'confirmed', 'shipped', 'cancelled', 'fake')),
  device_id TEXT,
  ip TEXT,
  user_agent TEXT,
  fbp TEXT,
  fbc TEXT,
  source_url TEXT,
  confirmed_at TEXT,
  purchase_sent_at TEXT,
  purchase_response TEXT,
  purchase_sending_until TEXT,       -- একসাথে দুবার Purchase পাঠানো আটকাতে
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_orders_status ON orders(status, id);
CREATE INDEX idx_orders_phone ON orders(phone, status);
CREATE INDEX idx_orders_device ON orders(device_id, status);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty = 1)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE blacklist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('phone', 'device')),
  value TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('fake', 'cancelled', 'manual')),
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (type, value)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- একই নম্বর/ডিভাইস থেকে একসাথে দুইবার সাবমিট আটকানোর lock
CREATE TABLE order_locks (
  key TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL        -- ms timestamp
);

-- অর্ডার রুটের rate limit
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- ডিফল্ট সেটিংস
INSERT INTO settings (key, value) VALUES
  ('site_name', 'F-Shop'),
  ('contact_phone', '01700000000'),
  ('delivery_inside', '70'),
  ('delivery_outside', '130'),
  ('fb_pixel_id', ''),
  ('fb_capi_token', ''),
  ('fb_test_event_code', ''),
  ('fb_graph_version', 'v26.0');
