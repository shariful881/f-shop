// মূল ডোমেইন আর সব subdomain যাতে Worker-এ আসে: proxied AAAA 100:: রেকর্ড (না থাকলে বানায়)
// চালানো: CLOUDFLARE_API_TOKEN=... node scripts/ensure-dns.mjs
import { readFileSync } from "node:fs";

const cfg = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const domain = /"PLATFORM_DOMAIN":\s*"([^"]+)"/.exec(cfg)?.[1];
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!domain || !token) throw new Error("PLATFORM_DOMAIN বা CLOUDFLARE_API_TOKEN নেই");

const api = async (path, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const j = await r.json();
  if (!j.success) throw new Error(`${path}: ${JSON.stringify(j.errors)}`);
  return j.result;
};

const [zone] = await api(`/zones?name=${domain}`);
if (!zone) throw new Error(`${domain} zone পাওয়া যায়নি`);
for (const name of [domain, `*.${domain}`]) {
  const existing = await api(`/zones/${zone.id}/dns_records?name=${encodeURIComponent(name)}`);
  if (existing.length) {
    console.log(`আছে: ${name} (${existing.map((r) => r.type).join(", ")})`);
    continue;
  }
  await api(`/zones/${zone.id}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ type: "AAAA", name, content: "100::", proxied: true, comment: "SellxBD Worker" }),
  });
  console.log(`তৈরি: ${name} AAAA 100:: (proxied)`);
}
