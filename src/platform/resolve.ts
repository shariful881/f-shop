import type { WorkerEnv } from "../worker-env";

import type { BillingShop } from "./billing";

export type ShopRow = BillingShop & { slug: string; name: string; seed_demo: number; images_r2?: number;
  /** চালু নিজের ডোমেইন (যেমন kathbon.com) — থাকলে slug.sellxbd.com-এর পাবলিক পেজ সেখানে পাঠানো হয় */
  custom_root?: string | null };

const COLS = `s.id, s.slug, s.name, s.status, s.seed_demo, s.balance, s.trial_ends_at, s.trial_orders_left, s.next_bill_at, s.low_balance_since, s.staff_count, s.plan, s.period_orders, s.created_at, s.images_r2, s.email_verified, s.phone_verified,
  (SELECT d2.root FROM domains d2 WHERE d2.shop_id = s.id AND d2.status = 'active' AND d2.zone_id IS NOT NULL AND d2.hostname = d2.root ORDER BY d2.created_at LIMIT 1) AS custom_root`;

/** একই Worker-এ বারবার ডাটাবেসে না গিয়ে ৩০ সেকেন্ড মনে রাখা */
const cache = new Map<string, { at: number; shop: ShopRow | null }>();
const TTL = 30_000;

export function clearShopCache() {
  cache.clear();
}

/** এলোমেলো subdomain দিয়ে কেউ অনেক অনুরোধ পাঠালেও মেমোরি সীমার মধ্যে থাকে */
const MAX_ENTRIES = 2000;

async function cached(key: string, load: () => Promise<ShopRow | null>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.shop;
  const shop = await load();
  cache.delete(key);
  if (cache.size >= MAX_ENTRIES) {
    // আগে মেয়াদ শেষ হওয়াগুলো, তারপরও বেশি থাকলে সবচেয়ে পুরনোগুলো (Map ঢোকানোর ক্রম রাখে)
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.at >= TTL) cache.delete(k);
    for (const k of cache.keys()) { if (cache.size < MAX_ENTRIES * 0.9) break; cache.delete(k); }
  }
  cache.set(key, { at: Date.now(), shop });
  return shop;
}

export const shopCacheSize = () => cache.size;

export function shopBySlug(env: WorkerEnv, slug: string) {
  return cached(`s:${slug}`, () =>
    env.PLATFORM_DB.prepare(`SELECT ${COLS} FROM shops s WHERE s.slug = ? AND s.status != 'closed'`).bind(slug).first<ShopRow>(),
  );
}

export function shopByDomain(env: WorkerEnv, hostname: string) {
  return cached(`d:${hostname}`, () =>
    env.PLATFORM_DB.prepare(
      `SELECT ${COLS} FROM domains d JOIN shops s ON s.id = d.shop_id
       WHERE d.hostname = ? AND d.status = 'active' AND s.status != 'closed'`,
    ).bind(hostname).first<ShopRow>(),
  );
}

export type Target = { kind: "platform" } | { kind: "shop"; shop: ShopRow } | { kind: "unknown" };

/**
 * কোন ডোমেইন কার:
 * - ourdomain.com / www.ourdomain.com → প্ল্যাটফর্ম (সাইনআপ, সুপার অ্যাডমিন)
 * - slug.ourdomain.com → সেই দোকান
 * - অন্য যেকোনো ডোমেইন → domains টেবিলে যে দোকানের
 */
export async function resolveHost(env: WorkerEnv, hostname: string): Promise<Target> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const base = (env.PLATFORM_DOMAIN || "ourdomain.com").toLowerCase();
  if (host === base || host === `www.${base}`) return { kind: "platform" };
  if (host.endsWith(`.${base}`)) {
    const slug = host.slice(0, -(base.length + 1));
    // দোকানের ঠিকানার নিয়মের বাইরে হলে ডাটাবেসে খোঁজার দরকার নেই
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) return { kind: "unknown" };
    const shop = await shopBySlug(env, slug);
    return shop ? { kind: "shop", shop } : { kind: "unknown" };
  }
  if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return { kind: "unknown" };
  const shop = await shopByDomain(env, host);
  return shop ? { kind: "shop", shop } : { kind: "unknown" };
}
