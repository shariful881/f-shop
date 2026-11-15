/**
 * Cloudflare ফ্রি প্ল্যানের সীমা নজরে রাখা — জায়গা কতটা খরচ হলো।
 * দোকানের ডাটাবেসের মাপ প্রতি ৩০ মিনিটে কয়েকটা করে দোকান ঘুরে নেওয়া হয় (একবারে সব নয়: subrequest-এর সীমা)।
 */
import type { WorkerEnv } from "../worker-env";

/** Workers Free: সব Durable Object (SQLite) মিলিয়ে ৫ GB; D1: প্রতি ডাটাবেস ৫০০ MB */
export const DO_STORAGE_LIMIT = 5 * 1024 ** 3;
export const D1_DB_LIMIT = 500 * 1024 ** 2;
export const WARN_AT = 0.8;
const PER_RUN = 10;

export async function refreshShopStorage(env: WorkerEnv, limit = PER_RUN): Promise<number> {
  const { results } = await env.PLATFORM_DB.prepare(
    "SELECT id FROM shops WHERE deleted_at IS NULL ORDER BY db_checked_at IS NOT NULL, db_checked_at LIMIT ?",
  ).bind(limit).all<{ id: string }>();
  let n = 0;
  for (const s of results) {
    try {
      const bytes = await env.SHOP.getByName(s.id).storageBytes();
      await env.PLATFORM_DB.prepare("UPDATE shops SET db_bytes = ?, db_checked_at = datetime('now') WHERE id = ?").bind(bytes, s.id).run();
      n++;
    } catch (e) {
      console.error("storage check failed", s.id, e);
    }
  }
  return n;
}

export type Usage = { doBytes: number; doPct: number; d1Bytes: number; d1Pct: number; checked: number; total: number; biggest: { id: string; name: string; bytes: number } | null; warn: boolean };

export async function platformUsage(db: D1Database): Promise<Usage> {
  const agg = await db.prepare("SELECT COALESCE(SUM(db_bytes), 0) b, COUNT(db_bytes) checked, COUNT(*) total FROM shops").first<{ b: number; checked: number; total: number }>();
  const big = await db.prepare("SELECT id, name, db_bytes bytes FROM shops WHERE db_bytes IS NOT NULL ORDER BY db_bytes DESC LIMIT 1").first<{ id: string; name: string; bytes: number }>();
  const ping = await db.prepare("SELECT 1").run();
  const d1Bytes = Number((ping.meta as { size_after?: number }).size_after ?? 0);
  const doBytes = agg?.b ?? 0;
  const doPct = doBytes / DO_STORAGE_LIMIT, d1Pct = d1Bytes / D1_DB_LIMIT;
  return { doBytes, doPct, d1Bytes, d1Pct, checked: agg?.checked ?? 0, total: agg?.total ?? 0, biggest: big ?? null, warn: doPct >= WARN_AT || d1Pct >= WARN_AT };
}
