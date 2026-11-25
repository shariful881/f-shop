-- SellxBD-এর নিজের Facebook অ্যাডের জন্য: দোকান খোলার সময়ের ব্রাউজার তথ্য (fbp/fbc/ব্রাউজার) —
-- পরে রিচার্জ অনুমোদনে Purchase ইভেন্ট সেই অ্যাড ক্লিকের সাথে মেলাতে
ALTER TABLE shops ADD COLUMN ad_click TEXT;
