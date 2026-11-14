-- ডেমো দোকান (লোকাল/Codespaces-এ টেস্টের জন্য): ?shop=demoshop
-- দোকানের মালিক লগইন: demo@fshop.test / demo12345
INSERT OR IGNORE INTO shops (id, slug, name, owner_name, owner_phone, owner_email, status, seed_demo, trial_ends_at, trial_orders_left)
VALUES ('00000000-0000-4000-8000-000000000001', 'demoshop', 'ডেমো শপ', 'ডেমো মালিক', '01700000000', 'demo@fshop.test', 'trial', 1, datetime('now', '+14 days'), 50);
