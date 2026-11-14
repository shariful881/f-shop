-- স্টাফ আর রোল: owner (মালিক, সব), manager (অর্ডার, পণ্য, ক্যাটাগরি, ব্ল্যাকলিস্ট), orders (শুধু অর্ডার)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'orders'));
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
