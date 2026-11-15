-- ধাপ ৬: অগ্রিম পেমেন্ট (bKash/Nagad/Rocket-এ পাঠিয়ে TrxID)
ALTER TABLE orders ADD COLUMN advance_amount INTEGER NOT NULL DEFAULT 0;  -- কত অগ্রিম চাওয়া/দেওয়া হয়েছে
ALTER TABLE orders ADD COLUMN pay_method TEXT;                            -- bkash | nagad | rocket
ALTER TABLE orders ADD COLUMN pay_trx TEXT;                               -- Transaction ID (বড় হাতের)
ALTER TABLE orders ADD COLUMN pay_sender TEXT;                            -- যে নম্বর থেকে পাঠিয়েছে
ALTER TABLE orders ADD COLUMN pay_status TEXT;                            -- pending | verified | rejected
ALTER TABLE orders ADD COLUMN pay_checked_at TEXT;
-- একই TrxID দুই অর্ডারে নয়
CREATE UNIQUE INDEX idx_orders_pay_trx ON orders(pay_trx) WHERE pay_trx IS NOT NULL;
CREATE INDEX idx_orders_pay_status ON orders(pay_status) WHERE pay_status IS NOT NULL;
