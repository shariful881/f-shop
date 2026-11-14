-- মূল (প্ল্যাটফর্ম) ডাটাবেস — শুধু দোকানের তালিকা, ডোমেইন আর বিলিং।
-- কোনো দোকানের পণ্য, অর্ডার বা কাস্টমারের তথ্য এখানে থাকে না (সেগুলো দোকানের নিজস্ব ডাটাবেসে)।

CREATE TABLE shops (
  id TEXT PRIMARY KEY,                 -- UUID, দোকানের ডাটাবেসের নামও এটা
  slug TEXT NOT NULL UNIQUE,           -- subdomain: slug.ourdomain.com
  name TEXT NOT NULL,
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'closed')),
  seed_demo INTEGER NOT NULL DEFAULT 0, -- নতুন দোকানে নমুনা পণ্য বসাবে কি না
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE domains (
  hostname TEXT PRIMARY KEY,           -- যেমন dokan.com, www.dokan.com
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_domains_shop ON domains(shop_id);
