-- সাইনআপের পর সরাসরি ড্যাশবোর্ডে ঢোকার এককালীন টোকেন (৫ মিনিট)
CREATE TABLE login_tokens (
  id TEXT PRIMARY KEY,                -- টোকেনের SHA-256
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
