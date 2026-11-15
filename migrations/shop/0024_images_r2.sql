-- ছবির কপি R2-তে আছে কিনা (0 = না, 1 = আছে, 2 = নিজের কপিও পাওয়া যায়নি — বাদ)
ALTER TABLE images ADD COLUMN r2 INTEGER NOT NULL DEFAULT 0;
