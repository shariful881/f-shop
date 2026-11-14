-- কুরিয়ার: Steadfast, Pathao, RedX
ALTER TABLE orders ADD COLUMN courier TEXT;             -- steadfast | pathao | redx
ALTER TABLE orders ADD COLUMN consignment_id TEXT;
ALTER TABLE orders ADD COLUMN tracking_code TEXT;
ALTER TABLE orders ADD COLUMN courier_status TEXT;
ALTER TABLE orders ADD COLUMN courier_sent_at TEXT;
ALTER TABLE orders ADD COLUMN courier_checked_at TEXT;
ALTER TABLE orders ADD COLUMN courier_response TEXT;

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('steadfast_api_key', ''), ('steadfast_secret_key', ''),
  ('pathao_client_id', ''), ('pathao_client_secret', ''), ('pathao_username', ''), ('pathao_password', ''),
  ('pathao_store_id', ''), ('pathao_sandbox', '0'), ('pathao_token', ''), ('pathao_token_expires', '0'),
  ('redx_token', ''), ('redx_pickup_store_id', ''), ('redx_sandbox', '0');
