/**
 * ধাপ ৩: ক্রেতার রেকর্ড — এই দোকান, SellxBD-এর অন্য দোকান আর কুরিয়ার মিলিয়ে।
 *
 * অন্য দোকানের রেকর্ড মূল ডাটাবেসে (phone_outcomes) থাকে। নম্বর সরাসরি রাখা হয় না,
 * গোপন চাবি দিয়ে HMAC-SHA256 হ্যাশ — আর অন্য দোকানের নাম/অর্ডার কখনো দেখানো হয় না, শুধু সংখ্যা।
 */
import type { Settings } from "./settings";

export type Outcome = "delivered" | "returned" | "cancelled" | "fake";

/** অন্য দোকানগুলোর মিলিত হিসাব */
export type Shared = { delivered: number; returned: number; cancelled: number; fake: number; shops: number };
/** এই দোকানের নিজের হিসাব */
export type Own = { delivered: number; returned: number; cancelled: number; fake: number; open: number };
/** কুরিয়ারের হিসাব (সব কুরিয়ার মিলে) */
export type CourierSummary = { total: number; success: number; cancelled: number; ratio: number | null; reports?: number; source: string; checked_at?: string };

export type Risk = { level: "new" | "good" | "warn" | "bad"; label: string; ratio: number | null; records: number };

const EMPTY_SHARED: Shared = { delivered: 0, returned: 0, cancelled: 0, fake: 0, shops: 0 };

/** দোকানদার রেকর্ড শেয়ার বন্ধ রাখলে নিজেও অন্যদেরটা দেখে না (সমান নিয়ম) */
export const sharingOn = (s: Settings) => s.fraud_share !== "0";

let keyCache: CryptoKey | null = null;

async function hmacKey(platformDb: D1Database): Promise<CryptoKey> {
  if (keyCache) return keyCache;
  let row = await platformDb.prepare("SELECT value FROM platform_settings WHERE key = 'fraud_salt'").first<{ value: string }>();
  if (!row?.value) {
    const salt = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await platformDb.prepare("INSERT OR IGNORE INTO platform_settings (key, value) VALUES ('fraud_salt', ?)").bind(salt).run();
    row = await platformDb.prepare("SELECT value FROM platform_settings WHERE key = 'fraud_salt'").first<{ value: string }>();
  }
  keyCache = await crypto.subtle.importKey("raw", new TextEncoder().encode(row!.value), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return keyCache;
}

/** টেস্টের জন্য */
export function resetFraudKey() {
  keyCache = null;
}

export async function phoneHash(platformDb: D1Database, phone: string): Promise<string> {
  const key = await hmacKey(platformDb);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(phone));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** একটা অর্ডারের ফল মূল ডাটাবেসে লেখা (একই অর্ডার আবার এলে শুধু ফল বদলায়) */
export async function recordOutcome(platformDb: D1Database, s: Settings, shopId: string, orderNo: string, phone: string, outcome: Outcome) {
  if (!sharingOn(s) || s.demo_mode === "1") return;
  try {
    const h = await phoneHash(platformDb, phone);
    await platformDb
      .prepare(
        `INSERT INTO phone_outcomes (shop_id, order_no, phone_hash, outcome) VALUES (?, ?, ?, ?)
         ON CONFLICT(shop_id, order_no) DO UPDATE SET outcome = excluded.outcome, created_at = datetime('now')`,
      )
      .bind(shopId, orderNo, h, outcome)
      .run();
  } catch (e) {
    console.error("fraud record error", e);
  }
}

/** অনেক নম্বরের অন্য দোকানের হিসাব একবারে (এই দোকান বাদ) */
export async function sharedRecords(platformDb: D1Database, s: Settings, shopId: string, phones: string[]): Promise<Record<string, Shared>> {
  const out: Record<string, Shared> = {};
  if (!sharingOn(s) || !phones.length) return out;
  try {
    const hashes = await Promise.all(phones.map((p) => phoneHash(platformDb, p)));
    const byHash = new Map(hashes.map((h, i) => [h, phones[i]!]));
    const { results } = await platformDb
      .prepare(
        `SELECT phone_hash h, outcome, COUNT(*) n FROM phone_outcomes
         WHERE phone_hash IN (${hashes.map(() => "?").join(",")}) AND shop_id != ? GROUP BY phone_hash, outcome`,
      )
      .bind(...hashes, shopId)
      .all<{ h: string; outcome: Outcome; n: number }>();
    const { results: shops } = await platformDb
      .prepare(
        `SELECT phone_hash h, COUNT(DISTINCT shop_id) n FROM phone_outcomes
         WHERE phone_hash IN (${hashes.map(() => "?").join(",")}) AND shop_id != ? GROUP BY phone_hash`,
      )
      .bind(...hashes, shopId)
      .all<{ h: string; n: number }>();
    for (const r of results) {
      const phone = byHash.get(r.h);
      if (!phone) continue;
      (out[phone] ??= { ...EMPTY_SHARED })[r.outcome] = r.n;
    }
    for (const r of shops) {
      const phone = byHash.get(r.h);
      if (phone && out[phone]) out[phone].shops = r.n;
    }
  } catch (e) {
    console.error("fraud read error", e);
  }
  return out;
}

/** এই দোকানের নিজের হিসাব, অনেক নম্বরের একবারে */
export async function ownRecords(db: D1Database, phones: string[], exceptOrderId = 0): Promise<Record<string, Own>> {
  const out: Record<string, Own> = {};
  if (!phones.length) return out;
  const { results } = await db
    .prepare(
      `SELECT phone,
         SUM(outcome = 'delivered') delivered,
         SUM(outcome = 'returned' OR (status = 'cancelled' AND consignment_id IS NOT NULL)) returned,
         SUM(status = 'cancelled' AND consignment_id IS NULL) cancelled,
         SUM(status = 'fake') fake,
         SUM(status IN ('new', 'confirmed', 'shipped') AND outcome IS NULL) open
       FROM orders WHERE phone IN (${phones.map(() => "?").join(",")}) AND id != ? GROUP BY phone`,
    )
    .bind(...phones, exceptOrderId)
    .all<Own & { phone: string }>();
  for (const r of results) out[r.phone] = { delivered: r.delivered ?? 0, returned: r.returned ?? 0, cancelled: r.cancelled ?? 0, fake: r.fake ?? 0, open: r.open ?? 0 };
  return out;
}

/**
 * তিন জায়গার রেকর্ড মিলিয়ে একটা রায়।
 * সফল = ডেলিভারি; ব্যর্থ = ফেরত + ফেক (+ কনফার্মের আগে বাতিল অর্ধেক ধরা — অনেক সময় ক্রেতা শুধু মত বদলায়)
 */
export function riskOf(own?: Own, shared?: Shared, courier?: CourierSummary | null): Risk {
  const ok = (own?.delivered ?? 0) + (shared?.delivered ?? 0) + (courier?.success ?? 0);
  const fake = (own?.fake ?? 0) + (shared?.fake ?? 0);
  const fail = (own?.returned ?? 0) + (shared?.returned ?? 0) + fake + (courier?.cancelled ?? 0)
    + 0.5 * ((own?.cancelled ?? 0) + (shared?.cancelled ?? 0));
  const records = Math.round(ok + fail);
  if (ok + fail === 0) return { level: "new", label: "নতুন ক্রেতা", ratio: null, records: 0 };
  const ratio = Math.round((ok / (ok + fail)) * 100);
  if ((shared?.fake ?? 0) >= 2 || (ratio < 50 && ok + fail >= 2)) return { level: "bad", label: "ঝুঁকি বেশি", ratio, records };
  if (ratio < 80 || fake > 0) return { level: "warn", label: "সাবধানে", ratio, records };
  return { level: "good", label: "ভালো ক্রেতা", ratio, records };
}

/** কুরিয়ারের স্ট্যাটাস লেখা থেকে ফল (সব কুরিয়ারের লেখা আলাদা, তাই শব্দ দেখে) */
export function outcomeFromCourier(status: string | null | undefined): "delivered" | "returned" | null {
  const t = (status || "").toLowerCase();
  if (!t || /pending|approval|processing|assigned|transit|hold|review/.test(t) && !/return(ed)?$|received/.test(t)) return null;
  if (/partial/.test(t) && /deliver/.test(t)) return "delivered"; // কিছু অংশ নিয়েছে = ক্রেতা ঠিক
  if (/return|cancel|refused|reject/.test(t)) return "returned";
  if (/deliver/.test(t)) return "delivered";
  return null;
}
