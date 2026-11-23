-- ক্যাটাগরি: সাব-ক্যাটাগরি (এক ধাপ), পেজের শিরোনাম, ছবি আর বিবরণ
ALTER TABLE categories ADD COLUMN parent_id INTEGER;   -- NULL = উপরের ক্যাটাগরি
ALTER TABLE categories ADD COLUMN title TEXT;          -- ক্যাটাগরি পেজের বড় শিরোনাম (ফাঁকা = নাম)
ALTER TABLE categories ADD COLUMN image TEXT;          -- ছবির key — টাইল আর পেজে
ALTER TABLE categories ADD COLUMN description TEXT;    -- বিবরণ (HTML, এডিটর থেকে)
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id, sort_order);
