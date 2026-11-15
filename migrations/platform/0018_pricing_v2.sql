-- নতুন দাম (১৫ নভেম্বর ২০২৬ বিকেল): প্যাকেজে প্রতি অর্ডার কমপক্ষে ৳২, বড় প্যাকেজে সস্তা; সীমার পরে ৳৫/৪/৩, ফ্রি-তে ৳৮
INSERT INTO platform_settings (key, value) VALUES
  ('plan_free_price', '0'), ('plan_free_orders', '30'), ('plan_free_extra', '8'),
  ('plan_small_price', '449'), ('plan_small_orders', '150'), ('plan_small_extra', '5'),
  ('plan_grow_price', '999'), ('plan_grow_orders', '400'), ('plan_grow_extra', '4'),
  ('plan_big_price', '1999'), ('plan_big_orders', '1000'), ('plan_big_extra', '3'),
  ('trial_orders', '400'),
  -- এর আগে খোলা দোকানে ৩০ দিন আগের দাম
  ('new_prices_from', datetime('now')),
  ('old_prices_until', datetime('now', '+30 days'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value;

-- ট্রায়ালে থাকা দোকানের ফ্রি অর্ডার নতুন সীমার বেশি হলে নামানো
UPDATE shops SET trial_orders_left = 400 WHERE status = 'trial' AND trial_orders_left > 400;

-- আজকের আগের দাম-ঘোষণা বন্ধ, নতুনটা ৩০ দিন
UPDATE announcements SET ends_at = datetime('now') WHERE title LIKE 'নতুন দাম চালু%' AND (ends_at IS NULL OR ends_at > datetime('now'));
INSERT INTO announcements (title, body, level, ends_at, created_by) VALUES (
  'নতুন দাম — আপনার দোকান ৩০ দিন আগের দামেই চলবে',
  'নতুন প্ল্যান: ছোট দোকান ৳৪৪৯ (১৫০ অর্ডার), বাড়ন্ত ৳৯৯৯ (৪০০ অর্ডার), বড় ব্র্যান্ড ৳১,৯৯৯ (১,০০০ অর্ডার); সীমার পরে প্রতি অর্ডার ৳৫/৪/৩। আজকের আগে খোলা দোকানে ৩০ দিন আগের দাম ও সীমা চলবে, তারপর নতুন। বিলিং পেজে দেখুন কোন প্ল্যান আপনার জন্য সস্তা।',
  'info', datetime('now', '+30 days'), 'system');
