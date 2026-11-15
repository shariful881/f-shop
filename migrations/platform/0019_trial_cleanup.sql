-- ট্রায়াল ১ মাস (মোঃ-এর সিদ্ধান্ত, ১৫ নভেম্বর ২০২৬)
INSERT INTO platform_settings (key, value) VALUES ('trial_days', '30') ON CONFLICT(key) DO UPDATE SET value = excluded.value;
-- এখন ট্রায়ালে থাকা দোকানও খোলার দিন থেকে ৩০ দিন পায়
UPDATE shops SET trial_ends_at = datetime(created_at, '+30 days')
  WHERE status = 'trial' AND (trial_ends_at IS NULL OR trial_ends_at < datetime(created_at, '+30 days'));

-- অচল দোকান মোছা: ডাটা মোছা হলে কবে, আর কোন সতর্কবার্তা গেছে (৭ / ১ দিন আগে)
ALTER TABLE shops ADD COLUMN deleted_at TEXT;
ALTER TABLE shops ADD COLUMN delete_warned TEXT;
CREATE INDEX IF NOT EXISTS idx_shops_cleanup ON shops(status, plan, deleted_at);
