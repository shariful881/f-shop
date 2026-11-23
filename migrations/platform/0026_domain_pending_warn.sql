-- নেমসার্ভার না বসানো ডোমেইন ৭ দিন পরে নিজে সরে যায় — শেষ দিনের সতর্কবার্তা একবারই পাঠাতে
ALTER TABLE domains ADD COLUMN warned_at TEXT;
