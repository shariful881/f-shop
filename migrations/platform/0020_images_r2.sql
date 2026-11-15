-- দোকানের ছবি কোথা থেকে দেখানো হয়: 0 = Worker (দোকানের ডাটাবেস), 1 = R2 (img.<domain>), 2 = R2 আর দোকানের ডাটাবেসের পুরনো কপি মোছা
ALTER TABLE shops ADD COLUMN images_r2 INTEGER NOT NULL DEFAULT 0;
