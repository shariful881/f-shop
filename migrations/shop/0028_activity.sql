-- লাইভ নোটিফিকেশনের ইতিহাস (🔔 বেল): নতুন অর্ডার, স্ট্যাটাস বদল, কুরিয়ার — শেষ কয়েকশো রাখা হয়
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,            -- order_new | status | courier
  order_id INTEGER,
  order_no TEXT,
  name TEXT,                     -- ক্রেতার নাম
  total INTEGER,
  status TEXT,                   -- নতুন স্ট্যাটাস (status/courier হলে)
  by_id INTEGER,                 -- কে করল (অ্যাডমিন ইউজার); ক্রেতার অর্ডারে NULL
  by_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
