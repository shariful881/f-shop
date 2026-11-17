-- ব্লগ SEO: আলাদা Google শিরোনাম/বিবরণ, কভার ছবি, লেখকের নাম
ALTER TABLE blog_posts ADD COLUMN seo_title TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN meta_description TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN cover_image TEXT NOT NULL DEFAULT '';
ALTER TABLE blog_posts ADD COLUMN author_name TEXT NOT NULL DEFAULT '';
