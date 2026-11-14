-- নিজের ডোমেইন: Cloudflare zone আর নেমসার্ভার
ALTER TABLE domains ADD COLUMN zone_id TEXT;
ALTER TABLE domains ADD COLUMN nameservers TEXT;        -- JSON: ["ada.ns.cloudflare.com", ...]
ALTER TABLE domains ADD COLUMN root TEXT;                -- মূল ডোমেইন (dokan.com) — www-ও একই root
ALTER TABLE domains ADD COLUMN checked_at TEXT;
ALTER TABLE domains ADD COLUMN error TEXT;
CREATE INDEX idx_domains_status ON domains(status);
