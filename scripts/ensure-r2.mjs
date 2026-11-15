// দোকানের ছবির R2: bucket, img.<domain> custom domain, আর img.<domain>-কে Worker রুটের বাইরে রাখা।
// R2 চালু না থাকলে বা টোকেনে R2 অনুমতি না থাকলে: সতর্কবার্তা দিয়ে wrangler.jsonc থেকে r2_buckets বাদ — ডিপ্লয় আগের মতোই চলে।
// চালানো: CLOUDFLARE_API_TOKEN=... node scripts/ensure-r2.mjs
import { readFileSync, writeFileSync } from "node:fs";

const cfgUrl = new URL("../wrangler.jsonc", import.meta.url);
const cfg = readFileSync(cfgUrl, "utf8");
const domain = /"PLATFORM_DOMAIN":\s*"([^"]+)"/.exec(cfg)?.[1];
const account = /"account_id":\s*"([^"]+)"/.exec(cfg)?.[1];
const bucket = /"bucket_name":\s*"([^"]+)"/.exec(cfg)?.[1];
const publicUrl = /"IMG_PUBLIC_URL":\s*"([^"]+)"/.exec(cfg)?.[1];
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!domain || !account || !token) throw new Error("PLATFORM_DOMAIN, account_id বা CLOUDFLARE_API_TOKEN নেই");

const api = async (path, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const j = await r.json().catch(() => ({ success: false, errors: [{ message: `HTTP ${r.status}` }] }));
  return { ok: !!j.success, status: r.status, result: j.result, errors: j.errors };
};
const warn = (msg) => console.log(`::warning::${msg}`);

/** R2 ছাড়া ডিপ্লয়: r2_buckets লাইন বাদ */
const withoutR2 = (why) => {
  warn(`R2 চালু হয়নি (${why}) — ছবি আগের মতো দোকানের ডাটাবেস থেকে। Cloudflare ড্যাশবোর্ডে R2 চালু করুন আর টোকেনে "Workers R2 Storage: Edit" অনুমতি দিন।`);
  writeFileSync(cfgUrl, cfg.replace(/^\s*"r2_buckets":.*\n/m, ""));
  process.exit(0);
};

if (!bucket) withoutR2("wrangler.jsonc-এ bucket নেই");

// ১. bucket
let b = await api(`/accounts/${account}/r2/buckets/${bucket}`);
if (!b.ok) {
  const made = await api(`/accounts/${account}/r2/buckets`, { method: "POST", body: JSON.stringify({ name: bucket }) });
  if (!made.ok) withoutR2(JSON.stringify(made.errors));
  console.log(`তৈরি: R2 bucket ${bucket}`);
} else console.log(`আছে: R2 bucket ${bucket}`);

// ২. img.<domain> → bucket (custom domain)
const host = publicUrl ? new URL(publicUrl).hostname : `img.${domain}`;
const zones = await api(`/zones?name=${domain}`);
const zone = zones.ok ? zones.result?.[0] : null;
if (!zone) {
  warn(`${domain} zone পাওয়া যায়নি — img ডোমেইন যুক্ত হয়নি`);
} else {
  const list = await api(`/accounts/${account}/r2/buckets/${bucket}/domains/custom`);
  const has = list.ok && (list.result?.domains ?? []).some((d) => d.domain === host);
  if (has) console.log(`আছে: ${host} → ${bucket}`);
  else {
    const add = await api(`/accounts/${account}/r2/buckets/${bucket}/domains/custom`, {
      method: "POST", body: JSON.stringify({ domain: host, zoneId: zone.id, enabled: true, minTLS: "1.2" }),
    });
    if (add.ok) console.log(`যুক্ত: ${host} → ${bucket}`);
    else warn(`${host} R2-তে যুক্ত করা যায়নি: ${JSON.stringify(add.errors)} — ড্যাশবোর্ডে R2 → ${bucket} → Settings → Custom Domains থেকে যুক্ত করুন`);
  }

  // ৩. *.<domain>/* রুট img-কেও Worker-এ নিত — img.<domain>/* রুট Worker ছাড়া (বেশি নির্দিষ্ট রুট আগে খাটে)
  const pattern = `${host}/*`;
  const routes = await api(`/zones/${zone.id}/workers/routes`);
  const existing = routes.ok ? routes.result.find((r) => r.pattern === pattern) : null;
  if (existing && !existing.script) console.log(`আছে: ${pattern} (Worker ছাড়া)`);
  else if (existing) {
    const up = await api(`/zones/${zone.id}/workers/routes/${existing.id}`, { method: "PUT", body: JSON.stringify({ pattern }) });
    up.ok ? console.log(`ঠিক করা: ${pattern} Worker ছাড়া`) : warn(`${pattern} রুট বদলানো যায়নি: ${JSON.stringify(up.errors)}`);
  } else {
    const add = await api(`/zones/${zone.id}/workers/routes`, { method: "POST", body: JSON.stringify({ pattern }) });
    add.ok ? console.log(`তৈরি: ${pattern} (Worker ছাড়া)`) : warn(`${pattern} রুট তৈরি করা যায়নি: ${JSON.stringify(add.errors)} — ছবির পাবলিক ঠিকানা যাচাই পাস করবে না, তাই দোকানে ছবি আগের মতোই দেখাবে`);
  }
}
console.log("R2 প্রস্তুত — ডিপ্লয়ে IMG_BUCKET যুক্ত হবে");
