/**
 * দোকানের ছবি R2-তে (img.<domain>) — ছবিতে Worker চলে না, দিনের ১ লাখ অনুরোধ বাঁচে।
 *
 * ধাপ:
 * 1. R2 চালু (wrangler.jsonc-এ IMG_BUCKET + IMG_PUBLIC_URL) → নতুন ছবি দুই জায়গায় যায়
 * 2. পাবলিক ঠিকানা কাজ করছে কিনা যাচাই (r2_public_ok)
 * 3. প্রতিটা দোকানের পুরনো ছবি কপি → শেষ হলে shops.images_r2 = 1 (পেজে ছবি R2 থেকে)
 * 4. (সুপার অ্যাডমিন চালু করলে) দোকানের ডাটাবেস থেকে পুরনো কপি মোছা → images_r2 = 2
 */
import type { WorkerEnv } from "../worker-env";
import { clearShopCache } from "./resolve";

const set = (db: D1Database, key: string, value: string) =>
  db.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
const get = async (db: D1Database, key: string) =>
  (await db.prepare("SELECT value FROM platform_settings WHERE key = ?").bind(key).first<{ value: string }>())?.value ?? "";

export const r2Configured = (env: WorkerEnv) => !!(env.IMG_BUCKET && env.IMG_PUBLIC_URL);

/** R2-তে একটা ছোট ফাইল রেখে পাবলিক ঠিকানা থেকে পড়ে দেখা */
export async function verifyR2Public(env: WorkerEnv): Promise<{ ok: boolean; message: string }> {
  if (!r2Configured(env)) return { ok: false, message: "R2 চালু হয়নি (bucket বা পাবলিক ঠিকানা নেই)" };
  const token = crypto.randomUUID();
  await env.IMG_BUCKET!.put("_check/ok.txt", token, { httpMetadata: { contentType: "text/plain", cacheControl: "no-store" } });
  try {
    const r = await fetch(`${env.IMG_PUBLIC_URL!.replace(/\/+$/, "")}/_check/ok.txt?t=${token}`, { cf: { cacheTtl: 0 } } as RequestInit);
    const text = r.ok ? (await r.text()).trim() : "";
    const ok = text === token;
    await set(env.PLATFORM_DB, "r2_public_ok", ok ? "1" : "0");
    await set(env.PLATFORM_DB, "r2_checked_at", new Date().toISOString());
    return { ok, message: ok ? "পাবলিক ঠিকানা কাজ করছে" : `পাবলিক ঠিকানা থেকে পড়া যায়নি (HTTP ${r.status}) — img ডোমেইন R2 bucket-এ যুক্ত হয়েছে কিনা দেখুন` };
  } catch (e) {
    await set(env.PLATFORM_DB, "r2_public_ok", "0");
    return { ok: false, message: `পাবলিক ঠিকানায় যাওয়া যায়নি: ${(e as Error).message}` };
  }
}

/** পুরনো ছবি কপি — একবারে কয়েকটা দোকান; শেষ হলে দোকানটা R2 থেকে ছবি দেখায় */
export async function syncShopsToR2(env: WorkerEnv, maxShops = 8, callsPerShop = 3): Promise<{ shops: number; copied: number; done: number }> {
  if (!r2Configured(env) || (await get(env.PLATFORM_DB, "r2_public_ok")) !== "1") return { shops: 0, copied: 0, done: 0 };
  const { results } = await env.PLATFORM_DB.prepare("SELECT id FROM shops WHERE images_r2 = 0 AND status != 'closed' ORDER BY created_at LIMIT ?").bind(maxShops).all<{ id: string }>();
  let copied = 0, done = 0;
  for (const { id } of results) {
    try {
      const stub = env.SHOP.getByName(id);
      for (let i = 0; i < callsPerShop; i++) {
        const r = await stub.syncImagesToR2(id, 100);
        copied += r.copied;
        if (r.remaining === 0) {
          await env.PLATFORM_DB.prepare("UPDATE shops SET images_r2 = 1 WHERE id = ? AND images_r2 = 0").bind(id).run();
          done++;
          break;
        }
      }
    } catch (e) {
      console.error("r2 sync failed", id, e);
    }
  }
  if (done) clearShopCache();
  return { shops: results.length, copied, done };
}

/** R2-তে থাকা ছবির পুরনো কপি দোকানের ডাটাবেস থেকে মোছা (জায়গা খালি) — সুপার অ্যাডমিন চালু করলে */
export async function purgeShopsLocal(env: WorkerEnv, maxShops = 8, callsPerShop = 3): Promise<{ shops: number; purged: number; done: number }> {
  if (!r2Configured(env) || (await get(env.PLATFORM_DB, "r2_auto_purge")) !== "1") return { shops: 0, purged: 0, done: 0 };
  const { results } = await env.PLATFORM_DB.prepare("SELECT id FROM shops WHERE images_r2 = 1 LIMIT ?").bind(maxShops).all<{ id: string }>();
  let purged = 0, done = 0;
  for (const { id } of results) {
    try {
      const stub = env.SHOP.getByName(id);
      for (let i = 0; i < callsPerShop; i++) {
        const r = await stub.purgeLocalImages(id, 200);
        purged += r.purged;
        if (r.remaining === 0) {
          await env.PLATFORM_DB.prepare("UPDATE shops SET images_r2 = 2 WHERE id = ? AND images_r2 = 1").bind(id).run();
          done++;
          break;
        }
      }
    } catch (e) {
      console.error("r2 purge failed", id, e);
    }
  }
  if (done) clearShopCache();
  return { shops: results.length, purged, done };
}

/** cron: যাচাই (না হয়ে থাকলে) → কপি → (চালু থাকলে) মোছা */
export async function r2Cron(env: WorkerEnv) {
  if (!r2Configured(env)) return;
  if ((await get(env.PLATFORM_DB, "r2_public_ok")) !== "1") {
    const v = await verifyR2Public(env);
    console.log("r2 public check", v.message);
    if (!v.ok) return;
  }
  console.log("r2 sync", await syncShopsToR2(env));
  console.log("r2 purge", await purgeShopsLocal(env));
}

export type R2Status = { configured: boolean; publicOk: boolean; publicUrl: string; autoPurge: boolean; total: number; onR2: number; purged: number };

export async function r2Status(env: WorkerEnv): Promise<R2Status> {
  const c = await env.PLATFORM_DB.prepare(
    "SELECT COUNT(*) total, COALESCE(SUM(images_r2 >= 1), 0) on_r2, COALESCE(SUM(images_r2 = 2), 0) purged FROM shops WHERE status != 'closed'",
  ).first<{ total: number; on_r2: number; purged: number }>();
  return {
    configured: r2Configured(env),
    publicOk: (await get(env.PLATFORM_DB, "r2_public_ok")) === "1",
    publicUrl: env.IMG_PUBLIC_URL || "",
    autoPurge: (await get(env.PLATFORM_DB, "r2_auto_purge")) === "1",
    total: c?.total ?? 0, onR2: c?.on_r2 ?? 0, purged: c?.purged ?? 0,
  };
}

export const setAutoPurge = (env: WorkerEnv, on: boolean) => set(env.PLATFORM_DB, "r2_auto_purge", on ? "1" : "0");
