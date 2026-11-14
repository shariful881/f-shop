-- ছবি দোকানের নিজের ডাটাবেসে (R2 ছাড়া, Cloudflare ফ্রি প্ল্যানে চলে)
-- বড় ছবি ১MB-এর টুকরোয় ভাগ করে রাখা হয় (একটা ঘরে সর্বোচ্চ ২MB রাখা যায়)
CREATE TABLE images (
  key TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE image_chunks (
  key TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (key, idx)
);
