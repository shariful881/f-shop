-- মিডিয়া লাইব্রেরি: ছবির নাম, বিবরণ (SEO) আর মাপ
ALTER TABLE images ADD COLUMN name TEXT;
ALTER TABLE images ADD COLUMN alt TEXT;
ALTER TABLE images ADD COLUMN width INTEGER;
ALTER TABLE images ADD COLUMN height INTEGER;
CREATE INDEX idx_images_created ON images(created_at);
