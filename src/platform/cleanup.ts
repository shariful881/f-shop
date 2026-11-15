/**
 * অচল দোকান মোছা (মোঃ-এর সিদ্ধান্ত, ১৫ নভেম্বর ২০২৬):
 * - ফ্রি প্ল্যানের চালু দোকানে ৩০ দিন লগইন/প্যানেল ব্যবহার বা কনফার্ম অর্ডার না হলে দোকানের সব ডাটা মুছে যায়
 * - বন্ধ (closed) করা দোকানও ৩০ দিন পরে মোছে
 * - পেইড প্ল্যান, ট্রায়াল, স্থগিত আর ডেমো দোকান মোছে না
 * - মূল ডাটাবেসে থাকে শুধু: দোকানদারের নাম, দোকানের নাম, ফোন, ইমেইল, প্ল্যান, তারিখগুলো আর টাকার লেনদেনের হিসাব
 * - ৭ দিন আর ১ দিন আগে ফোনে নোটিফিকেশন (যারা চালু করেছে)
 */
import { deleteShopR2 } from "./r2";
import type { WorkerEnv } from "../worker-env";

export const INACTIVE_DAYS = 30;
const PER_RUN = 10; // ফ্রি প্ল্যানে একবারে ৫০টা subrequest — দিনে কয়েকটা করে

/** দোকানের শেষ কাজের সময় (লগইন/প্যানেল, কনফার্ম অর্ডার, না থাকলে খোলার দিন) */
const LAST_ACTIVE = "MAX(COALESCE(s.last_login_at, ''), COALESCE(s.last_order_at, ''), s.created_at)";
/** ফ্রি প্ল্যানের চালু দোকান, পেইড প্ল্যানে যাওয়ার কথা নেই, ডেমো নয় */
const FREE_IDLE = `s.status = 'active' AND s.plan = 'free' AND s.plan_next IS NULL AND s.demo_niche IS NULL AND s.deleted_at IS NULL`;

export type CleanupResult = { warned: number; deleted: number };

export async function runShopCleanup(env: WorkerEnv): Promise<CleanupResult> {
  const db = env.PLATFORM_DB;
  let warned = 0, deleted = 0;

  // ১) মোছা: ৩০ দিন অচল ফ্রি দোকান, অথবা ৩০ দিনের বেশি বন্ধ থাকা দোকান
  const { results: due } = await db.prepare(
    `SELECT s.id FROM shops s WHERE s.deleted_at IS NULL AND (
       (${FREE_IDLE} AND ${LAST_ACTIVE} <= datetime('now', '-${INACTIVE_DAYS} days'))
       OR (s.status = 'closed' AND COALESCE(s.status_changed_at, s.created_at) <= datetime('now', '-${INACTIVE_DAYS} days'))
     ) LIMIT ?`,
  ).bind(PER_RUN).all<{ id: string }>();
  for (const s of due) {
    try {
      await purgeShop(env, s.id, "auto");
      deleted++;
    } catch (e) {
      console.error("purge failed", s.id, e);
    }
  }

  // ২) সতর্কবার্তা: ৭ দিন আর ১ দিন বাকি থাকলে, একবার করে
  for (const [left, mark] of [[1, "1"], [7, "7"]] as const) {
    const { results } = await db.prepare(
      `SELECT s.id FROM shops s WHERE ${FREE_IDLE}
         AND ${LAST_ACTIVE} <= datetime('now', '-${INACTIVE_DAYS - left} days')
         AND COALESCE(s.delete_warned, '') NOT LIKE ? LIMIT ?`,
    ).bind(`%${mark}%`, PER_RUN).all<{ id: string }>();
    for (const s of results) {
      try {
        await env.SHOP.getByName(s.id).pushNotice({
          title: left === 1 ? "আগামীকাল দোকানটি মুছে যাবে" : `${left === 7 ? "৭" : left} দিন পরে দোকানটি মুছে যাবে`,
          body: "৩০ দিন ব্যবহার হয়নি। প্যানেলে একবার ঢুকুন বা প্ল্যান নিন — তাহলে কিছু মুছবে না।",
          url: "/admin",
          tag: "shop-cleanup",
        });
      } catch { /* নোটিফিকেশন না গেলেও চলবে */ }
      await db.prepare("UPDATE shops SET delete_warned = COALESCE(delete_warned, '') || ? WHERE id = ?").bind(mark, s.id).run();
      warned++;
    }
  }
  return { warned, deleted };
}

/**
 * দোকানের সব ডাটা মোছা (পণ্য, ছবি, অর্ডার, ক্রেতা, পেজ, সেটিংস) — ফেরানো যায় না।
 * মূল ডাটাবেসে দোকানদারের পরিচয়, প্ল্যান, তারিখ আর লেনদেনের হিসাব থাকে।
 */
export async function purgeShop(env: WorkerEnv, shopId: string, reason: "auto" | "super"): Promise<void> {
  await env.SHOP.getByName(shopId).purge();
  await deleteShopR2(env, shopId).catch((e) => console.error("r2 delete on purge", shopId, e));
  const db = env.PLATFORM_DB;
  await db.batch([
    db.prepare("DELETE FROM domains WHERE shop_id = ?").bind(shopId),
    db.prepare(
      `UPDATE shops SET status = 'closed', status_changed_at = datetime('now'), deleted_at = datetime('now'),
         db_bytes = 0, db_checked_at = datetime('now'), delete_warned = ?, images_r2 = 0 WHERE id = ?`,
    ).bind(reason, shopId),
  ]);
}
