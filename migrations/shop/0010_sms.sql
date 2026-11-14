-- SMS: দোকানদারের নিজের গেটওয়ে
CREATE TABLE sms_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  event TEXT NOT NULL,            -- confirmed | shipped | test
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending',  -- sending | sent | failed
  response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- একই অর্ডারের একই ঘটনায় একবারই SMS
CREATE UNIQUE INDEX sms_logs_order_event ON sms_logs(order_id, event) WHERE order_id IS NOT NULL;
CREATE INDEX sms_logs_created ON sms_logs(created_at);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('sms_enabled', '0'), ('sms_provider', 'bulksmsbd'), ('sms_api_key', ''), ('sms_sender_id', ''),
  ('sms_custom_url', ''), ('sms_custom_method', 'GET'), ('sms_custom_body', ''), ('sms_custom_success', ''),
  ('sms_on_confirm', '1'), ('sms_on_shipped', '1'),
  ('sms_tpl_confirmed', 'প্রিয় {নাম}, আপনার অর্ডার {অর্ডার} কনফার্ম হয়েছে। মোট {টাকা} টাকা। ধন্যবাদ - {দোকান}'),
  ('sms_tpl_shipped', 'প্রিয় {নাম}, আপনার অর্ডার {অর্ডার} {কুরিয়ার}-এ পাঠানো হয়েছে। ট্র্যাকিং: {ট্র্যাকিং}। পণ্য হাতে পেয়ে {টাকা} টাকা দিন - {দোকান}');
