-- সাপোর্ট প্রোফাইল: প্রতিটা দোকান (shop:<id>) আর প্রতিটা ভিজিটর ফোন নম্বর (phone:01XXXXXXXXX) — ভিতরের নোট আর ফলো-আপের অবস্থা
CREATE TABLE support_profiles (
  key TEXT PRIMARY KEY,
  note TEXT,
  follow_up TEXT CHECK (follow_up IS NULL OR follow_up IN ('new', 'called', 'interested', 'not_interested')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
CREATE INDEX idx_visitor_chats_phone ON visitor_chats(phone, id);
CREATE INDEX idx_support_shop_channel ON support_tickets(shop_id, channel, id);
