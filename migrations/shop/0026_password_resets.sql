-- পাসওয়ার্ড ভুলে গেলে ইমেইলে রিসেট লিংক (security/step-3)
-- id = লিংকের টোকেনের SHA-256 (আসল টোকেন ডাটাবেসে থাকে না); ৩০ মিনিট, একবারই চলে
CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);
