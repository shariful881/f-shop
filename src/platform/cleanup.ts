import { deleteShopR2 } from "./r2";
import type { WorkerEnv } from "../worker-env";
import { emailHtml, emailText, type EmailParts } from "./email-template";
import { platformSettings } from "./billing";
import { emailFrom, emailSafeName } from "./verify";
import { hashPassword } from "../shop/lib/auth";

/**
 * অচল দোকান (মোঃ-এর সিদ্ধান্ত, ১৫ নভেম্বর ২০২৬; বদল ২৭ নভেম্বর):
 * - ফ্রি প্ল্যানের চালু দোকানে ৩০ দিন লগইন/প্যানেল ব্যবহার বা কনফার্ম অর্ডার না হলে দোকানের সব ডাটা মুছে যায়
 * - ৩০ দিন গোনা শুরু হয় শেষ লগইন/অর্ডার থেকে, কিন্তু **ট্রায়াল শেষের দিনের আগে নয়** — ট্রায়াল শেষে কমপক্ষে ৩০ দিন সময়
 * - বন্ধ (closed) করা দোকানও ৩০ দিন পরে মোছে
 * - পেইড প্ল্যান, ট্রায়াল, স্থগিত আর ডেমো দোকান মোছে না
 * - ৭ দিন আর ১ দিন আগে ফোনে নোটিফিকেশন + ইমেইল
 * - মোছার আগে দোকানের ডাটার কপি ৯০ দিন রাখা হয় (deleted_backups) — ফিরে এলে সুপার অ্যাডমিন ফেরাতে পারেন;
 *   নিজে থেকে মোছা দোকানের ছবিও (R2) ৯০ দিন থাকে
 * - ট্রায়ালে ৩ আর ৭ দিন প্যানেলে না ঢুকলে "দোকান সাজান" মনে করানো (ফোন + ইমেইল)
 * - মূল ডাটাবেসে থাকে শুধু: দোকানদারের নাম, দোকানের নাম, ফোন, ইমেইল, প্ল্যান, তারিখগুলো আর টাকার লেনদেনের হিসাব
 */

export const INACTIVE_DAYS = 30;
export const BACKUP_DAYS = 90;
const PER_RUN = 10; // একবারে কয়েকটা করে — subrequest-এর সীমা
const PART_BYTES = 1_500_000; // D1-এর এক সারির সীমার নিচে
export const NUDGE_DAYS = [3, 7] as const;

/** দোকানের শেষ কাজের সময় (লগইন/প্যানেল, কনফার্ম অর্ডার, ট্রায়াল শেষ/চালু হওয়া, না থাকলে খোলার দিন) */
const LAST_ACTIVE = "MAX(COALESCE(s.last_login_at, ''), COALESCE(s.last_order_at, ''), COALESCE(s.activated_at, ''), s.created_at)";
/** ফ্রি প্ল্যানের চালু দোকান, পেইড প্ল্যানে যাওয়ার কথা নেই, ডেমো নয় */
const FREE_IDLE = `s.status = 'active' AND s.plan = 'free' AND s.plan_next IS NULL AND s.demo_niche IS NULL AND s.deleted_at IS NULL`;
/** ট্রায়ালে কতদিন প্যানেলে ঢোকেনি (সুপার অ্যাডমিনের "নিষ্ক্রিয় ট্রায়াল" ফিল্টারও) */
export const TRIAL_IDLE_SQL = `s.status = 'trial' AND s.demo_niche IS NULL AND s.deleted_at IS NULL
  AND MAX(COALESCE(s.last_login_at, ''), COALESCE(s.last_order_at, ''), s.created_at) <= datetime('now', '-5 days')`;

export type CleanupResult = { warned: number; deleted: number; nudged: number; expired: number };

type ShopMail = { id: string; slug: string; name: string; owner_email: string | null };

/** দোকানদারকে ইমেইল (না গেলেও কাজ থামে না) */
async function mailOwner(env: WorkerEnv, shop: ShopMail, subject: string, parts: Omit<EmailParts, "lang" | "siteUrl" | "supportPhone">) {
  if (!env.EMAIL || !shop.owner_email) return;
  try {
    const s = await platformSettings(env.PLATFORM_DB);
    const p: EmailParts = { lang: "bn", siteUrl: `https://${env.PLATFORM_DOMAIN}`, supportPhone: s.support_phone || undefined, ...parts };
    await env.EMAIL.send({ to: shop.owner_email, from: { email: emailFrom(env, s), name: "SellxBD" }, subject, text: emailText(p, p.intro), html: emailHtml(p) });
  } catch (e) {
    console.error("cleanup mail", shop.id, e);
  }
}

const adminUrl = (env: WorkerEnv, slug: string) => `https://${slug}.${env.PLATFORM_DOMAIN}/admin`;

export async function runShopCleanup(env: WorkerEnv): Promise<CleanupResult> {
  const db = env.PLATFORM_DB;
  let warned = 0, deleted = 0, nudged = 0;

  // ০) ৯০ দিনের পুরনো কপি মোছা (সাথে রেখে দেওয়া ছবি)
  const expired = await expireBackups(env);

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

  // ২) সতর্কবার্তা: ৭ দিন আর ১ দিন বাকি থাকলে, একবার করে — ফোনে আর ইমেইলে
  for (const [left, mark] of [[1, "1"], [7, "7"]] as const) {
    const { results } = await db.prepare(
      `SELECT s.id, s.slug, s.name, s.owner_email FROM shops s WHERE ${FREE_IDLE}
         AND ${LAST_ACTIVE} <= datetime('now', '-${INACTIVE_DAYS - left} days')
         AND COALESCE(s.delete_warned, '') NOT LIKE ? LIMIT ?`,
    ).bind(`%${mark}%`, PER_RUN).all<ShopMail>();
    for (const s of results) {
      const title = left === 1 ? "আগামীকাল দোকানটি মুছে যাবে" : "৭ দিন পরে দোকানটি মুছে যাবে";
      try {
        await env.SHOP.getByName(s.id).pushNotice({ title, body: "৩০ দিন ব্যবহার হয়নি। প্যানেলে একবার ঢুকুন বা প্ল্যান নিন — তাহলে কিছু মুছবে না।", url: "/admin", tag: "shop-cleanup" });
      } catch { /* নোটিফিকেশন না গেলেও চলবে */ }
      const name = emailSafeName(s.name);
      await mailOwner(env, s, `${name} — ${title}`, {
        preheader: "৩০ দিন দোকান ব্যবহার হয়নি — একবার প্যানেলে ঢুকলেই কিছু মুছবে না।", badge: "দোকান মুছে যাবে", title,
        greeting: "আসসালামু আলাইকুম,",
        intro: `আপনার দোকান <b>${name}</b> প্রায় ৩০ দিন ব্যবহার হয়নি। ফ্রি প্ল্যানে অচল দোকান ${left === 1 ? "আগামীকাল" : "৭ দিন পরে"} নিজে থেকে মুছে যায় — পণ্য, অর্ডার, সেটিংস সব। রাখতে চাইলে নিচের বাটনে চেপে প্যানেলে একবার ঢুকুন, বা একটা প্ল্যান নিন।`,
        facts: [["দোকান", name], ["ঠিকানা", `${s.slug}.${env.PLATFORM_DOMAIN}`]],
        button: { label: "প্যানেলে ঢুকুন", url: adminUrl(env, s.slug) },
        safety: "দোকান আর না রাখতে চাইলে কিছু করতে হবে না। পাসওয়ার্ড মনে না থাকলে লগইন পেজে \"পাসওয়ার্ড ভুলে গেছেন?\" চাপুন।",
      });
      await db.prepare("UPDATE shops SET delete_warned = COALESCE(delete_warned, '') || ? WHERE id = ?").bind(mark, s.id).run();
      warned++;
    }
  }

  // ৩) ট্রায়ালে দোকান সাজাতে মনে করানো: খোলার ৩ আর ৭ দিন পরেও প্যানেলে না ঢুকলে (একবার করে)
  for (const day of NUDGE_DAYS) {
    const mark = `d${day}`;
    const { results } = await db.prepare(
      `SELECT s.id, s.slug, s.name, s.owner_email FROM shops s
       WHERE s.status = 'trial' AND s.demo_niche IS NULL AND s.deleted_at IS NULL
         AND s.created_at <= datetime('now', '-${day} days') AND s.created_at > datetime('now', '-${day + 7} days')
         AND MAX(COALESCE(s.last_login_at, ''), COALESCE(s.last_order_at, ''), s.created_at) <= datetime('now', '-${Math.min(day, 3)} days')
         AND COALESCE(s.nudged, '') NOT LIKE ? LIMIT ?`,
    ).bind(`%${mark}%`, PER_RUN).all<ShopMail>();
    for (const s of results) {
      const name = emailSafeName(s.name);
      try {
        await env.SHOP.getByName(s.id).pushNotice({ title: "দোকান সাজানো বাকি", body: "৫ মিনিটে প্রথম পণ্য যোগ করুন — তারপর লিংক শেয়ার করলেই অর্ডার আসবে।", url: "/admin/products/new", tag: "shop-nudge" });
      } catch { /* চলবে */ }
      await mailOwner(env, s, `${name} — দোকান সাজানো বাকি`, {
        preheader: "৫ মিনিটে প্রথম পণ্য যোগ করে দোকান চালু করুন।", badge: day === 3 ? "শুরু করুন" : "মনে করিয়ে দিচ্ছি",
        title: "আপনার দোকান সাজানো বাকি", greeting: "আসসালামু আলাইকুম,",
        intro: `SellxBD-তে <b>${name}</b> খোলার ${day === 3 ? "৩" : "৭"} দিন হলো, কিন্তু এখনো প্যানেলে কাজ শুরু হয়নি। ফ্রি ট্রায়ালে সব ফিচার খোলা — প্রথম পণ্য যোগ করুন, ল্যান্ডিং পেজ বানান, তারপর Facebook-এ লিংক শেয়ার করলেই অর্ডার আসবে। আটকে গেলে আমাদের ফোন করুন, আমরা সাজিয়ে দিতে সাহায্য করব।`,
        facts: [["দোকান", name], ["ঠিকানা", `${s.slug}.${env.PLATFORM_DOMAIN}`]],
        button: { label: "দোকান সাজান", url: `${adminUrl(env, s.slug)}/products/new` },
        safety: "এই ইমেইল পেয়েছেন কারণ আপনি SellxBD-তে দোকান খুলেছেন। পাসওয়ার্ড মনে না থাকলে লগইন পেজে \"পাসওয়ার্ড ভুলে গেছেন?\" চাপুন।",
      });
      await db.prepare("UPDATE shops SET nudged = COALESCE(nudged, '') || ? WHERE id = ?").bind(mark, s.id).run();
      nudged++;
    }
  }
  return { warned, deleted, nudged, expired };
}

/* ---------- মোছার আগে কপি ---------- */

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}
async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

/** দোকানের ডাটা (shop-data.json-এর ফরম্যাট) gzip করে মূল ডাটাবেসে, ৯০ দিনের জন্য */
export async function backupShop(env: WorkerEnv, shopId: string, reason: string, keepImages: boolean): Promise<number> {
  const db = env.PLATFORM_DB;
  const shop = await db.prepare("SELECT slug, name, images_r2 FROM shops WHERE id = ?").bind(shopId).first<{ slug: string; name: string; images_r2: number }>();
  const data = await env.SHOP.getByName(shopId).exportData(shopId);
  const z = await gzip(new TextEncoder().encode(JSON.stringify(data)));
  const parts: Uint8Array[] = [];
  for (let i = 0; i < z.length; i += PART_BYTES) parts.push(z.subarray(i, i + PART_BYTES));
  await db.batch([
    db.prepare("DELETE FROM deleted_backup_parts WHERE shop_id = ?").bind(shopId),
    db.prepare(
      `INSERT INTO deleted_backups (shop_id, slug, name, reason, bytes, parts, images_r2, images_kept, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+${BACKUP_DAYS} days'))
       ON CONFLICT(shop_id) DO UPDATE SET slug = excluded.slug, name = excluded.name, reason = excluded.reason, bytes = excluded.bytes, parts = excluded.parts,
         images_r2 = excluded.images_r2, images_kept = excluded.images_kept, created_at = excluded.created_at, expires_at = excluded.expires_at`,
    ).bind(shopId, shop?.slug ?? null, shop?.name ?? null, reason, z.length, parts.length, shop?.images_r2 ?? 0, keepImages ? 1 : 0),
    ...parts.map((p, i) => db.prepare("INSERT INTO deleted_backup_parts (shop_id, part, data) VALUES (?, ?, ?)").bind(shopId, i, p)),
  ]);
  return z.length;
}

/** রাখা কপি (JSON) — নেই বা মেয়াদ শেষ হলে null */
export async function loadBackup(env: WorkerEnv, shopId: string): Promise<{ data: { shop_id: string; tables: Record<string, unknown[]> }; images_r2: number; images_kept: number } | null> {
  const db = env.PLATFORM_DB;
  const meta = await db.prepare("SELECT parts, images_r2, images_kept FROM deleted_backups WHERE shop_id = ? AND expires_at > datetime('now')").bind(shopId)
    .first<{ parts: number; images_r2: number; images_kept: number }>();
  if (!meta) return null;
  const { results } = await db.prepare("SELECT data FROM deleted_backup_parts WHERE shop_id = ? ORDER BY part").bind(shopId).all<{ data: ArrayBuffer | number[] }>();
  if (results.length !== meta.parts) return null;
  const chunks = results.map((r) => (r.data instanceof ArrayBuffer ? new Uint8Array(r.data) : new Uint8Array(r.data as number[])));
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const json = new TextDecoder().decode(await gunzip(all));
  return { data: JSON.parse(json), images_r2: meta.images_r2, images_kept: meta.images_kept };
}

async function expireBackups(env: WorkerEnv): Promise<number> {
  const db = env.PLATFORM_DB;
  const { results } = await db.prepare("SELECT shop_id, images_kept FROM deleted_backups WHERE expires_at <= datetime('now') LIMIT ?").bind(PER_RUN)
    .all<{ shop_id: string; images_kept: number }>();
  for (const b of results) {
    // ফেরানো হয়নি এমন দোকানের রাখা ছবি এখন মোছা
    const shop = await db.prepare("SELECT deleted_at FROM shops WHERE id = ?").bind(b.shop_id).first<{ deleted_at: string | null }>();
    if (b.images_kept && (!shop || shop.deleted_at)) await deleteShopR2(env, b.shop_id).catch((e) => console.error("r2 delete on expiry", b.shop_id, e));
    await db.batch([
      db.prepare("DELETE FROM deleted_backup_parts WHERE shop_id = ?").bind(b.shop_id),
      db.prepare("DELETE FROM deleted_backups WHERE shop_id = ?").bind(b.shop_id),
    ]);
  }
  return results.length;
}

/**
 * দোকানের সব ডাটা মোছা (পণ্য, ছবি, অর্ডার, ক্রেতা, পেজ, সেটিংস)।
 * আগে কপি রাখা হয় (৯০ দিন); কপি রাখা না গেলে নিজে থেকে মোছা হয় না (পরের বার চেষ্টা)।
 * নিজে থেকে মোছা দোকানের ছবি ৯০ দিন রাখা হয়, সুপার অ্যাডমিন মুছলে সাথে সাথে মোছে।
 * মূল ডাটাবেসে দোকানদারের পরিচয়, প্ল্যান, তারিখ আর লেনদেনের হিসাব থাকে।
 */
export async function purgeShop(env: WorkerEnv, shopId: string, reason: "auto" | "super"): Promise<void> {
  const keepImages = reason === "auto";
  try {
    await backupShop(env, shopId, reason, keepImages);
  } catch (e) {
    console.error("backup before purge", shopId, e);
    if (reason === "auto") throw e; // কপি ছাড়া নিজে থেকে মুছি না
  }
  await env.SHOP.getByName(shopId).purge();
  if (!keepImages) await deleteShopR2(env, shopId).catch((e) => console.error("r2 delete on purge", shopId, e));
  const db = env.PLATFORM_DB;
  await db.batch([
    db.prepare("DELETE FROM domains WHERE shop_id = ?").bind(shopId),
    db.prepare(
      `UPDATE shops SET status = 'closed', status_changed_at = datetime('now'), deleted_at = datetime('now'),
         db_bytes = 0, db_checked_at = datetime('now'), delete_warned = ?, images_r2 = 0 WHERE id = ?`,
    ).bind(reason, shopId),
  ]);
}

/**
 * মুছে ফেলা দোকান কপি থেকে ফেরানো (সুপার অ্যাডমিন): ডাটা, (রাখা থাকলে) ছবি, মালিকের লগইন।
 * মালিকের পাসওয়ার্ড কপিতে থাকে না — নতুন এলোমেলো পাসওয়ার্ড বসে, মালিক "পাসওয়ার্ড ভুলে গেছেন?" দিয়ে নতুন দেন।
 */
export async function restoreDeletedShop(env: WorkerEnv, shopId: string): Promise<{ ok: boolean; message: string }> {
  const db = env.PLATFORM_DB;
  const shop = await db.prepare("SELECT id, slug, name, owner_name, owner_email, owner_phone, deleted_at FROM shops WHERE id = ?").bind(shopId)
    .first<{ id: string; slug: string; name: string; owner_name: string | null; owner_email: string | null; owner_phone: string | null; deleted_at: string | null }>();
  if (!shop || !shop.deleted_at) return { ok: false, message: "দোকানটা মুছে ফেলা অবস্থায় নেই।" };
  if (!shop.owner_email) return { ok: false, message: "দোকানে মালিকের ইমেইল নেই — ফেরানো যাচ্ছে না।" };
  const b = await loadBackup(env, shopId);
  if (!b) return { ok: false, message: "এই দোকানের কপি নেই বা ৯০ দিন পেরিয়ে গেছে।" };
  const stub = env.SHOP.getByName(shopId);
  const pass = [...crypto.getRandomValues(new Uint8Array(18))].map((x) => x.toString(16).padStart(2, "0")).join("");
  await stub.setupShop({
    shopId, shopName: shop.name, ownerName: shop.owner_name || shop.name, ownerEmail: shop.owner_email, ownerPhone: shop.owner_phone || "",
    passwordHash: await hashPassword(pass), seedDemo: false,
  });
  await stub.importData(shopId, b.data);
  const imgs = b.images_kept && b.images_r2 ? (b.data.tables.images ?? []) as { key: string; type: string; size: number; name?: string; alt?: string; width?: number; height?: number; created_at?: string }[] : [];
  if (imgs.length) await stub.restoreImageMeta(shopId, imgs).catch((e: unknown) => console.error("restore images", shopId, e));
  await db.batch([
    db.prepare(
      `UPDATE shops SET deleted_at = NULL, status = 'active', status_changed_at = datetime('now'), last_login_at = datetime('now'),
         delete_warned = NULL, images_r2 = ? WHERE id = ?`,
    ).bind(imgs.length ? 1 : 0, shopId),
    db.prepare("DELETE FROM deleted_backup_parts WHERE shop_id = ?").bind(shopId),
    db.prepare("DELETE FROM deleted_backups WHERE shop_id = ?").bind(shopId),
  ]);
  return { ok: true, message: `দোকান ফেরানো হয়েছে${imgs.length ? ", ছবিসহ" : b.images_kept ? "" : " (ছবি ছাড়া — ছবি আগেই মোছা হয়েছিল)"}। মালিক লগইন পেজে "পাসওয়ার্ড ভুলে গেছেন?" দিয়ে নতুন পাসওয়ার্ড দেবেন।` };
}
