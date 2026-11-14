-- সাপোর্ট ২৪ ঘণ্টা (মোঃ-এর সিদ্ধান্ত): শুরু আর শেষ একই = সারাদিন খোলা
UPDATE platform_settings SET value = '00:00' WHERE key IN ('support_hours_start', 'support_hours_end');
