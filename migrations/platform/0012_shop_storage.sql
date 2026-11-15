-- প্রতিটা দোকানের ডাটাবেস কতটা জায়গা নিচ্ছে (৩০ মিনিটের cron ঘুরে ঘুরে আপডেট করে) — ফ্রি প্ল্যানের সীমা নজরে রাখতে
ALTER TABLE shops ADD COLUMN db_bytes INTEGER;
ALTER TABLE shops ADD COLUMN db_checked_at TEXT;
