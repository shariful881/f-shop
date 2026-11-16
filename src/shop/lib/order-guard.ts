import type { Settings } from "./settings";
import { normalizePhone } from "./phone";

export type OrderInput = Record<string, string>;

export type ValidationResult =
  | { ok: true; phone: string; area: "inside" | "outside" }
  | { ok: false; errors: Record<string, string> };

/** ফর্মের ইনপুট যাচাই (সার্ভারে — JS বন্ধ করেও এড়ানো যাবে না) */
export function validateOrderInput(v: OrderInput): ValidationResult {
  const errors: Record<string, string> = {};
  if (!v.name || v.name.length < 2) errors.name = "আপনার নাম লিখুন";
  const phone = normalizePhone(v.phone);
  if (!v.phone) errors.phone = "মোবাইল নম্বর লিখুন";
  else if (!phone) errors.phone = "সঠিক মোবাইল নম্বর লিখুন (যেমন 01712345678)";
  if (!v.address || v.address.length < 5) errors.address = "সম্পূর্ণ ঠিকানা লিখুন";
  if (v.area !== "inside" && v.area !== "outside") errors.area = "ডেলিভারি এলাকা বাছাই করুন";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, phone: phone!, area: v.area as "inside" | "outside" };
}

export const MSG_BLOCKED = (contact: string) =>
  `দুঃখিত, এই মুহূর্তে আপনার অর্ডার নেওয়া সম্ভব হচ্ছে না। যোগাযোগ করুন: ${contact}`;

export const MSG_PENDING = (contact: string) =>
  `আপনার আগের অর্ডারটি এখনো কনফার্মের অপেক্ষায় আছে। কনফার্ম হলে আবার অর্ডার দিতে পারবেন। দরকার হলে যোগাযোগ করুন: ${contact}`;

/**
 * নিয়ম ৩ আর ৪:
 * - নম্বর বা ডিভাইস ব্ল্যাকলিস্টে থাকলে অর্ডার নয়
 * - একই নম্বর বা একই ডিভাইসের কোনো অর্ডার "নতুন" অবস্থায় থাকলে নতুন অর্ডার নয়
 */
export async function checkOrderGuards(
  db: D1Database,
  phone: string,
  deviceIds: string[],
  s: Settings,
): Promise<{ ok: true } | { ok: false; reason: "blocked" | "pending"; message: string }> {
  const contact = s.contact_phone || "";
  const dph = deviceIds.map(() => "?").join(",");

  const blocked = await db
    .prepare(
      `SELECT 1 FROM blacklist_entries
       WHERE (type = 'phone' AND value = ?) ${deviceIds.length ? `OR (type = 'device' AND value IN (${dph}))` : ""}
       LIMIT 1`,
    )
    .bind(phone, ...deviceIds)
    .first();
  if (blocked) return { ok: false, reason: "blocked", message: MSG_BLOCKED(contact) };

  const pending = await db
    .prepare(
      `SELECT 1 FROM orders
       WHERE status = 'new' AND (phone = ? ${deviceIds.length ? `OR device_id IN (${dph})` : ""})
       LIMIT 1`,
    )
    .bind(phone, ...deviceIds)
    .first();
  if (pending) return { ok: false, reason: "pending", message: MSG_PENDING(contact) };

  return { ok: true };
}

const LOCK_MS = 20_000;

/**
 * নিয়ম ৬: একই নম্বর বা ডিভাইস দিয়ে একসাথে দুইবার সাবমিট আটকানোর lock।
 * D1 সব write এক এক করে চালায়, তাই এই INSERT একসাথে দুজন পেতে পারে না।
 * lock না পেলে null।
 */
export async function acquireOrderLocks(db: D1Database, phone: string, deviceIds: string[]): Promise<string[] | null> {
  const keys = [`phone:${phone}`, ...deviceIds.map((d) => `device:${d}`)];
  const got: string[] = [];
  const now = Date.now();
  for (const key of keys) {
    const r = await db
      .prepare(
        `INSERT INTO order_locks (key, expires_at) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at WHERE order_locks.expires_at < ?`,
      )
      .bind(key, now + LOCK_MS, now)
      .run();
    if (!r.meta.changes) {
      await releaseOrderLocks(db, got);
      return null;
    }
    got.push(key);
  }
  return got;
}

export async function releaseOrderLocks(db: D1Database, keys: string[]) {
  if (!keys.length) return;
  await db.prepare(`DELETE FROM order_locks WHERE key IN (${keys.map(() => "?").join(",")})`).bind(...keys).run();
}

/**
 * Rate limit: নির্দিষ্ট সময়ে একটা key থেকে সর্বোচ্চ কতবার।
 * সীমা পার হলে false।
 */
export async function hitRateLimit(db: D1Database, key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSec * 1000));
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(`${key}:${bucket}`, (bucket + 1) * windowSec * 1000)
    .first<{ count: number }>();
  if (Math.random() < 0.05) {
    await db.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now).run();
    await db.prepare("DELETE FROM order_locks WHERE expires_at < ?").bind(now).run();
  }
  return (row?.count ?? 1) <= max;
}

/** গোনা না বাড়িয়ে শুধু দেখা — এই সময়-ঘরে কয়বার হয়েছে */
export async function peekRateLimit(db: D1Database, key: string, windowSec: number): Promise<number> {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const row = await db.prepare("SELECT count FROM rate_limits WHERE key = ?").bind(`${key}:${bucket}`).first<{ count: number }>();
  return row?.count ?? 0;
}

export const ORDER_RATE_LIMIT = { max: 5, windowSec: 60 };
