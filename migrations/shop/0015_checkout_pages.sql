-- চেকআউটের বাড়তি ঘর (ইমেইল, নিজের ঘর), নিজের পেজ, ইনভয়েস সেটিংস, অর্ডার নম্বরের শুরুর অক্ষর
ALTER TABLE orders ADD COLUMN email TEXT;
ALTER TABLE orders ADD COLUMN extra_json TEXT;

CREATE TABLE pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  in_menu INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('checkout_email', 'off'), ('default_area', 'inside'), ('sticky_submit', '1'),
  ('cf1_label', ''), ('cf1_req', '0'), ('cf2_label', ''), ('cf2_req', '0'), ('cf3_label', ''), ('cf3_req', '0'),
  ('order_prefix', 'FS-'),
  ('invoice_size', 'a4'), ('invoice_note', ''), ('invoice_barcode', '1'), ('invoice_image', '1');
