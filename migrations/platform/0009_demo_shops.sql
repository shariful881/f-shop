-- ডেমো দোকান: কোন নিশের ডেমো (NULL = সাধারণ দোকান)
ALTER TABLE shops ADD COLUMN demo_niche TEXT;
CREATE UNIQUE INDEX idx_shops_demo_niche ON shops(demo_niche) WHERE demo_niche IS NOT NULL;
-- নতুন দোকানটা কোন নিশ বেছে খোলা হয়েছিল
ALTER TABLE shops ADD COLUMN niche TEXT;

-- SellxBD-এর সাপোর্ট নম্বর (আগে সঠিক নম্বর বসানো না থাকলে)
INSERT INTO platform_settings (key, value) VALUES ('support_phone', '01724212271')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
  WHERE platform_settings.value NOT GLOB '01[3-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';
