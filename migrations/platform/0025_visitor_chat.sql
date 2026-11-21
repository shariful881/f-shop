-- sellxbd.com-এর ভিজিটর লাইভ চ্যাট (দোকানদার নয় — যে কেউ সাইটে এসে মেসেজ দিতে পারে)
CREATE TABLE visitor_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,          -- ভিজিটরের কুকির SHA-256
  name TEXT NOT NULL,
  phone TEXT,
  page TEXT,                                -- কোন পেজ থেকে শুরু
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  assigned_to INTEGER,
  last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_preview TEXT,
  last_sender TEXT,
  team_unread INTEGER NOT NULL DEFAULT 0,
  visitor_unread INTEGER NOT NULL DEFAULT 0,
  first_response_at TEXT,
  notified_at TEXT,                         -- শেষ Telegram খবর (বারবার না পাঠাতে)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_visitor_chats_status ON visitor_chats(status, last_message_at);

CREATE TABLE visitor_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES visitor_chats(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('visitor', 'team', 'system')),
  author TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_visitor_msgs ON visitor_messages(chat_id, id);
