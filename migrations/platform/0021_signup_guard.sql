-- সাইনআপের পাহারা: ইমেইল/ফোন যাচাই, সাইনআপের IP, সন্দেহের কারণ
-- আগের দোকানগুলো যাচাই করা ধরা হয় (DEFAULT 1); নতুন দোকান সাইনআপের সময় 0 পায় (যাচাই চালু থাকলে)
ALTER TABLE shops ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shops ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shops ADD COLUMN signup_ip TEXT;
ALTER TABLE shops ADD COLUMN risk TEXT;           -- কমা দিয়ে কারণ: phish_word, disposable, ip_many …
ALTER TABLE shops ADD COLUMN risk_cleared INTEGER NOT NULL DEFAULT 0;  -- সুপার অ্যাডমিন দেখে "ঠিক আছে" বললে 1
CREATE INDEX IF NOT EXISTS idx_shops_signup_ip ON shops(signup_ip);

-- যাচাইয়ের কোড/লিংক (ইমেইলের লিংক, ফোনের OTP) — হ্যাশ রাখা হয়, আসল কোড নয়
CREATE TABLE IF NOT EXISTS verify_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'phone')),
  code_hash TEXT NOT NULL,
  target TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_verify_codes_shop ON verify_codes(shop_id, kind, created_at);
