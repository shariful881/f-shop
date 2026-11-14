import type { WorkerEnv } from "../worker-env";

export type ShopRow = { id: string; slug: string; name: string; status: string; seed_demo: number };

/** একই Worker-এ বারবার ডাটাবেসে না গিয়ে ৩০ সেকেন্ড মনে রাখা */
const cache = new Map<string, { at: number; shop: ShopRow | null }>();
const TTL = 30_000;

export function clearShopCache() {
  cache.clear();
}

async function cached(key: string, load: () => Promise<ShopRow | null>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.shop;
  const shop = await load();
  cache.set(key, { at: Date.now(), shop });
  return shop;
}

export function shopBySlug(env: WorkerEnv, slug: string) {
  return cached(`s:${slug}`, () =>
    env.PLATFORM_DB.prepare("SELECT id, slug, name, status, seed_demo FROM shops WHERE slug = ? AND status != 'closed'").bind(slug).first<ShopRow>(),
  );
}

export function shopByDomain(env: WorkerEnv, hostname: string) {
  return cached(`d:${hostname}`, () =>
    env.PLATFORM_DB.prepare(
      `SELECT s.id, s.slug, s.name, s.status, s.seed_demo FROM domains d JOIN shops s ON s.id = d.shop_id
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
    if (!/^[a-z0-9-]+$/.test(slug)) return { kind: "unknown" };
    const shop = await shopBySlug(env, slug);
    return shop ? { kind: "shop", shop } : { kind: "unknown" };
  }
  const shop = await shopByDomain(env, host);
  return shop ? { kind: "shop", shop } : { kind: "unknown" };
}
