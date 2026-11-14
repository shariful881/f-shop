-- প্রফেশনাল দোকানের সেটিংস: SEO, ট্র্যাকিং, ডেলিভারি নিয়ম, অর্ডার সেটিংস, দোকানের তথ্য
INSERT OR IGNORE INTO settings (key, value) VALUES
  -- দোকানের তথ্য
  ('store_email', ''), ('store_address', ''), ('whatsapp', ''), ('facebook_page', ''), ('favicon', ''),
  -- SEO
  ('seo_title', ''), ('seo_description', ''), ('seo_image', ''), ('seo_noindex', '0'),
  -- ট্র্যাকিং
  ('ga4_id', ''), ('gtm_id', ''), ('tiktok_pixel_id', ''),
  -- ডেলিভারি
  ('free_delivery_min', '0'), ('delivery_time_inside', ''), ('delivery_time_outside', ''),
  -- অর্ডার
  ('min_order', '0'), ('show_note', '1'), ('thanks_message', ''), ('order_form_title', '');

-- পণ্যের SEO
ALTER TABLE products ADD COLUMN meta_title TEXT;
ALTER TABLE products ADD COLUMN meta_description TEXT;
