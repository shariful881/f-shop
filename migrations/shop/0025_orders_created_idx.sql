-- রিপোর্ট, লাভ আর অ্যাডের হিসাব তারিখ ধরে অর্ডার খোঁজে — হাজার অর্ডারেও পুরো টেবিল পড়তে না হয়
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
