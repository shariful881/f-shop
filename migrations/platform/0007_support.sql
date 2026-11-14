-- সাপোর্ট: দোকানদার ↔ SellxBD টিম — টিকেট আর লাইভ চ্যাট একই "কথোপকথন"
CREATE TABLE support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'ticket' CHECK (channel IN ('ticket', 'chat')),
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  assigned_to INTEGER,
  opened_by TEXT,
  last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_preview TEXT,
  last_sender TEXT,
  team_unread INTEGER NOT NULL DEFAULT 0,
  shop_unread INTEGER NOT NULL DEFAULT 0,
  first_response_at TEXT,
  resolved_at TEXT,
  rating INTEGER,
  rating_comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_support_status ON support_tickets(status, last_message_at);
CREATE INDEX idx_support_shop ON support_tickets(shop_id, id);
CREATE INDEX idx_support_assigned ON support_tickets(assigned_to, status);

CREATE TABLE support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('shop', 'team', 'system')),
  author TEXT,
  body TEXT NOT NULL,
  attachment TEXT,
  internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_support_msgs ON support_messages(ticket_id, id);

-- রেডি উত্তর
CREATE TABLE canned_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO canned_replies (title, body) VALUES
  ('স্বাগতম', 'আসসালামু আলাইকুম! SellxBD সাপোর্টে আপনাকে স্বাগতম। আপনার সমস্যাটা একটু বিস্তারিত বলবেন?'),
  ('রিচার্জ কীভাবে', 'অ্যাডমিন প্যানেল → বিলিং ও রিচার্জ পেজে আমাদের bKash/Nagad নম্বরে Send Money করে Transaction ID দিন। আমরা মিলিয়ে কিছুক্ষণের মধ্যে ব্যালেন্সে যোগ করে দেব।'),
  ('Pixel কোথায় পাবেন', 'Facebook Events Manager → Data sources → আপনার Pixel থেকে Pixel ID কপি করুন। Settings → Conversions API → Generate access token থেকে টোকেন নিন। তারপর অ্যাডমিন → দোকানের সেটিংস → পিক্সেল ও ট্র্যাকিং-এ বসান।'),
  ('ডোমেইন যোগ', 'অ্যাডমিন → ডোমেইন পেজে আপনার ডোমেইন লিখুন। আমরা দুটো নেমসার্ভার দেব — ডোমেইন যেখান থেকে কিনেছেন সেখানে আগের নেমসার্ভার মুছে এই দুটো বসান। চালু হতে কয়েক ঘণ্টা লাগতে পারে।'),
  ('সমাধান হয়েছে?', 'আশা করি সমস্যার সমাধান হয়েছে। আর কোনো সাহায্য লাগলে এখানেই জানাবেন। ধন্যবাদ!');

INSERT OR IGNORE INTO platform_settings (key, value) VALUES
  ('support_hours_start', '10:00'), ('support_hours_end', '22:00'),
  ('telegram_bot_token', ''), ('telegram_chat_id', '');
