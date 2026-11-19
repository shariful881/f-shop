-- প্রতিটা অর্ডারে একবার কুরিয়ারে খোঁজা ক্রেতার রিপোর্ট — স্থায়ীভাবে অর্ডারের সাথে (JSON)
ALTER TABLE orders ADD COLUMN courier_report TEXT;
