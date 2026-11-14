-- দোকানদারের নিজের সেভ করা ল্যান্ডিং টেমপ্লেট (শুধু এই দোকানের তালিকায়)
CREATE TABLE my_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
