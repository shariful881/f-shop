/**
 * স্প্যাম ফিল্টার (মোঃ-এর সিদ্ধান্ত, ২৪ নভেম্বর ২০২৬)
 *
 * কাস্টমার সবসময় "অর্ডার সফল" দেখে। পেছনে অর্ডারটা যাচাই হয়:
 * - ঠিক থাকলে "নতুন" তালিকায় (শব্দ, পপআপ, নোটিফিকেশন সব)
 * - সন্দেহজনক হলে "স্প্যাম" তালিকায় — কোনো শব্দ/পপআপ নয়, Facebook-এ কিছু যায় না
 * কোনো অর্ডার মোছে না বা নিজে কনফার্ম হয় না; দোকানদার এক চাপে "নতুনে" ফেরাতে পারেন।
 *
 * লক্ষণ তিন ভাগে:
 * - শক্ত (২ পয়েন্ট): একটা মিললেই স্প্যাম
 * - দুর্বল (১ পয়েন্ট): একটা মিললে শুধু পাশে লেখা থাকে, দুটো মিললে স্প্যাম
 * - নিরাপদ: মিললে কখনো স্প্যাম নয় (পুরনো ভালো ক্রেতা, অগ্রিম দিয়েছে)
 * শুধু IP দিয়ে কাউকে আটকানো হয় না — মোবাইল ডাটায় হাজারো মানুষ একই IP শেয়ার করেন।
 * কুরিয়ার সার্ভার উত্তর না দিলে কুরিয়ারের কোনো লক্ষণই ধরা হয় না।
 */
import type { Settings } from "./settings";
import { bn } from "./format";
import type { CourierSummary, Own, Shared } from "./fraud";

export type SpamLevel = "off" | "soft" | "medium" | "hard";
export const SPAM_LEVELS: Record<SpamLevel, string> = {
  off: "বন্ধ",
  soft: "নরম — শুধু শক্ত লক্ষণে স্প্যাম",
  medium: "মাঝারি — শক্ত লক্ষণে, বা দুটো দুর্বল লক্ষণ মিললে (পরামর্শ)",
  hard: "কড়া — কুরিয়ারে রেকর্ড না থাকলেও স্প্যাম (অ্যাড চালানোর সময়)",
};
export const spamLevel = (s: Settings): SpamLevel =>
  s.spam_level === "off" || s.spam_level === "soft" || s.spam_level === "hard" ? s.spam_level : "medium";
export const spamOn = (s: Settings) => spamLevel(s) !== "off" && s.demo_mode !== "1";

/** w: ২ = শক্ত, ১ = দুর্বল, ০ = শুধু তথ্য, -১ = নিরাপদ */
export type Signal = { k: string; w: -1 | 0 | 1 | 2; t: string };

export type SpamFacts = {
  orderId: number;
  phone: string;
  deviceIds: string[];
  fp: string | null;
  ip: string | null;
  /** ফর্ম খোলা থেকে সাবমিট (মিলিসেকেন্ড); null = ব্রাউজারের স্ক্রিপ্ট চলেনি; undefined = পুরনো পেজ (ঘরটাই নেই) */
  fillMs: number | null | undefined;
  name: string;
  address: string;
  paid: boolean;
};

const DAY = "datetime('now', '-1 day')";
/** কনফার্ম হয়নি এমন অর্ডার (স্প্যামও 'new') — আসল ক্রেতা একদিনে দুবার কিনলে আটকায় না */
const OPEN = "status IN ('new', 'cancelled', 'fake')";

export const FP_RE = /^[0-9a-f]{8,16}$/;
export const cleanFp = (v: unknown) => (typeof v === "string" && FP_RE.test(v) ? v : null);
export const cleanFillMs = (v: unknown) => {
  const n = typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(n, 86_400_000) : null;
};

const secs = (ms: number) => bn(Math.max(1, Math.round(ms / 1000)));

/** নাম বা ঠিকানায় আজেবাজে লেখা (asdf, একই অক্ষর বারবার, test …) */
export function looksJunk(name: string, address: string): boolean {
  const n = (name || "").trim();
  const a = (address || "").trim();
  const junkWord = /^(test|testing|asdf|qwer|qwerty|abc|xyz|fake|null|none|n\/?a|xxx+|aaa+|demo)\b/i;
  if (n.length < 2 || junkWord.test(n) || /(.)\1{3,}/u.test(n) || /\d{3,}/.test(n)) return true;
  if (a.length < 6 || junkWord.test(a) || /(.)\1{4,}/u.test(a) || !/[\p{L}]/u.test(a)) return true;
  if (/^(asdf|qwer|zxcv|hjkl|jkl;)/i.test(n.replace(/\s/g, "")) || /(asdf|qwer|zxcv){1}/i.test(a)) return true;
  return false;
}

/** ডাটাবেস থেকে যে লক্ষণগুলো সাথে সাথে বোঝা যায় (কুরিয়ার ছাড়া) */
export async function localSignals(db: D1Database, f: SpamFacts): Promise<Signal[]> {
  const out: Signal[] = [];
  const ids = f.deviceIds.filter(Boolean);
  const dph = ids.map(() => "?").join(",");
  const q = (sql: string, ...b: unknown[]) => db.prepare(sql).bind(...b);
  const [dev, fpIp, fpAll, ipAll, fakeFpIp, fakeFp, good] = await db.batch<{ n: number }>([
    ids.length ? q(`SELECT COUNT(*) n FROM orders WHERE id != ? AND device_id IN (${dph}) AND ${OPEN} AND created_at >= ${DAY}`, f.orderId, ...ids)
      : q("SELECT 0 n"),
    f.fp && f.ip ? q(`SELECT COUNT(*) n FROM orders WHERE id != ? AND fp = ? AND ip = ? AND ${OPEN} AND created_at >= ${DAY}`, f.orderId, f.fp, f.ip) : q("SELECT 0 n"),
    f.fp ? q(`SELECT COUNT(*) n FROM orders WHERE id != ? AND fp = ? AND ${OPEN} AND created_at >= ${DAY}`, f.orderId, f.fp) : q("SELECT 0 n"),
    f.ip ? q(`SELECT COUNT(*) n FROM orders WHERE id != ? AND ip = ? AND ${OPEN} AND created_at >= ${DAY}`, f.orderId, f.ip) : q("SELECT 0 n"),
    f.fp && f.ip ? q("SELECT COUNT(*) n FROM orders WHERE fp = ? AND ip = ? AND status = 'fake' AND created_at >= datetime('now', '-60 days')", f.fp, f.ip) : q("SELECT 0 n"),
    f.fp ? q("SELECT COUNT(*) n FROM orders WHERE fp = ? AND status = 'fake' AND created_at >= datetime('now', '-60 days')", f.fp) : q("SELECT 0 n"),
    q("SELECT COUNT(*) n FROM orders WHERE phone = ? AND id != ? AND (outcome = 'delivered' OR status IN ('confirmed', 'shipped'))", f.phone, f.orderId),
  ]);
  const n = (r: D1Result<{ n: number }> | undefined) => r?.results?.[0]?.n ?? 0;

  // নিরাপদ
  if (n(good) > 0) out.push({ k: "own_good", w: -1, t: "আগে এই দোকান থেকে কিনেছেন" });
  if (f.paid) out.push({ k: "paid", w: -1, t: "অগ্রিম টাকা পাঠিয়েছেন" });

  // ফর্ম পূরণের সময়
  if (f.fillMs === undefined) { /* পুরনো (cache করা) পেজ থেকে — জানা নেই */ }
  else if (f.fillMs === null) out.push({ k: "nojs", w: 2, t: "ব্রাউজার ছাড়া সরাসরি পাঠানো (বট হতে পারে)" });
  else if (f.fillMs < 3000) out.push({ k: "bot", w: 2, t: `${secs(f.fillMs)} সেকেন্ডে ফর্ম পূরণ — মানুষের পক্ষে খুব দ্রুত` });
  else if (f.fillMs < 10000) out.push({ k: "fast", w: 1, t: `${secs(f.fillMs)} সেকেন্ডে ফর্ম পূরণ` });

  // একই ফোন/নেট থেকে বারবার (আগের অর্ডার + এটা)
  if (n(dev) >= 2) out.push({ k: "dev_repeat", w: 2, t: `একই ফোন থেকে ২৪ ঘণ্টায় ${bn(n(dev) + 1)}টা অর্ডার` });
  else if (n(fpIp) >= 2) out.push({ k: "fp_ip_repeat", w: 2, t: `একই ধরনের ফোন আর একই নেট থেকে ২৪ ঘণ্টায় ${bn(n(fpIp) + 1)}টা অর্ডার` });
  else if (n(fpAll) >= 2) out.push({ k: "fp_repeat", w: 1, t: `একই ধরনের ফোন থেকে ২৪ ঘণ্টায় ${bn(n(fpAll) + 1)}টা অর্ডার` });
  if (n(ipAll) >= 3 && !out.some((s) => s.k === "fp_ip_repeat")) out.push({ k: "ip_repeat", w: 1, t: `একই নেট থেকে ২৪ ঘণ্টায় ${bn(n(ipAll) + 1)}টা অর্ডার` });

  // আগে ফেক দেওয়া ফোন
  if (n(fakeFpIp) > 0) out.push({ k: "fake_fp_ip", w: 2, t: "আগে ফেক দেওয়া ফোন আর নেটের সঙ্গে মিল" });
  else if (n(fakeFp) > 0) out.push({ k: "fake_fp", w: 1, t: "আগে ফেক দেওয়া ফোনের মতো" });

  if (looksJunk(f.name, f.address)) out.push({ k: "junk", w: 1, t: "নাম বা ঠিকানা অস্বাভাবিক" });
  return out;
}

/**
 * কুরিয়ার আর আগের রেকর্ড থেকে লক্ষণ। courier = null মানে কুরিয়ার দেখার ব্যবস্থা নেই,
 * { error } মানে কুরিয়ার উত্তর দেয়নি — দুটোতেই কুরিয়ারের লক্ষণ ধরা হয় না।
 */
export function recordSignals(own: Own | undefined, shared: Shared | undefined, courier: CourierSummary | { error: string } | null): Signal[] {
  const out: Signal[] = [];
  const fake = (own?.fake ?? 0) + (shared?.fake ?? 0);
  const returned = (own?.returned ?? 0) + (shared?.returned ?? 0);
  const delivered = (own?.delivered ?? 0) + (shared?.delivered ?? 0);
  if (fake > 0 || (returned >= 2 && returned > delivered)) out.push({ k: "record_bad", w: 2, t: fake > 0 ? "এই নম্বরে আগে ফেক অর্ডার হয়েছে" : "এই নম্বরে আগে বেশি পার্সেল ফেরত" });
  if (!courier) return out;
  if ("error" in courier) { out.push({ k: "courier_err", w: 0, t: "কুরিয়ার চেক হয়নি" }); return out; }
  const ratio = courier.ratio ?? (courier.total ? Math.round((courier.success / courier.total) * 100) : null);
  if (courier.total >= 3 && ratio != null && ratio < 50) out.push({ k: "courier_bad", w: 2, t: `কুরিয়ারে খারাপ রেকর্ড (${bn(ratio)}% ডেলিভারি)` });
  else if (courier.total >= 2 && ratio != null && ratio >= 80) out.push({ k: "courier_good", w: -1, t: `কুরিয়ারে ভালো রেকর্ড (${bn(ratio)}% ডেলিভারি)` });
  else if (courier.total === 0 && delivered === 0) out.push({ k: "courier_none", w: 1, t: "কুরিয়ারে কোনো রেকর্ড নেই (নতুন নম্বর)" });
  return out;
}

/** রায়: নিরাপদ লক্ষণ থাকলে কখনো স্প্যাম নয় */
export function decide(level: SpamLevel, signals: Signal[]): { spam: boolean; score: number } {
  const weight = (s: Signal) => (s.w <= 0 ? 0 : level === "hard" && s.k === "courier_none" ? 2 : level === "soft" && s.w < 2 ? 0 : s.w);
  const score = signals.reduce((n, s) => n + weight(s), 0);
  if (level === "off" || signals.some((s) => s.w === -1)) return { spam: false, score };
  return { spam: score >= 2, score };
}

export function parseReasons(raw: string | null | undefined): Signal[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.t === "string").map((x) => ({ k: String(x.k), w: Number(x.w) as Signal["w"], t: String(x.t) })) : [];
  } catch {
    return [];
  }
}

/** যাচাইয়ের ফল অর্ডারে লেখা — শুধু "যাচাই চলছে" অবস্থা থেকে (এর মধ্যে দোকানদার কিছু করলে বদলায় না) */
export async function saveDecision(db: D1Database, orderId: number, spam: boolean, score: number, signals: Signal[]): Promise<boolean> {
  const r = await db.prepare("UPDATE orders SET spam = ?, was_spam = ?, spam_score = ?, spam_reasons = ? WHERE id = ? AND spam = 2")
    .bind(spam ? 1 : 0, spam ? 1 : 0, score, JSON.stringify(signals), orderId).run();
  return !!r.meta.changes;
}

/**
 * কোনো কারণে যাচাই শেষ না হলে (৩ মিনিটের বেশি "যাচাই চলছে") অর্ডার নতুন তালিকায় —
 * আসল ক্রেতার অর্ডার আটকে থাকবে না। পুরনো স্প্যাম ৩০ দিন পরে মুছে যায়।
 */
export async function spamHousekeeping(db: D1Database): Promise<void> {
  try {
    await db.prepare(`UPDATE orders SET spam = 0, spam_reasons = ? WHERE spam = 2 AND created_at < datetime('now', '-3 minutes')`)
      .bind(JSON.stringify([{ k: "unchecked", w: 0, t: "যাচাই শেষ হয়নি" }])).run();
    if (Math.random() < 0.1) {
      const old = "SELECT id FROM orders WHERE spam = 1 AND status = 'new' AND created_at < datetime('now', '-30 days')";
      await db.batch([
        db.prepare(`DELETE FROM order_items WHERE order_id IN (${old})`),
        db.prepare(`DELETE FROM orders WHERE id IN (${old})`),
      ]);
    }
  } catch (e) {
    console.error("spam housekeeping", e);
  }
}

export async function spamCount(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) n FROM orders WHERE spam = 1 AND status = 'new'").first<{ n: number }>();
  return r?.n ?? 0;
}

/** গত ৭ দিন: কয়টা স্প্যামে গেছে, কয়টা দোকানদার নতুনে ফিরিয়েছেন */
export async function spamWeek(db: D1Database): Promise<{ caught: number; released: number }> {
  const r = await db.prepare(
    "SELECT COALESCE(SUM(was_spam = 1), 0) caught, COALESCE(SUM(spam_released = 1), 0) released FROM orders WHERE created_at >= datetime('now', '-7 days')",
  ).first<{ caught: number; released: number }>();
  return { caught: r?.caught ?? 0, released: r?.released ?? 0 };
}

/** স্প্যাম থেকে নতুন তালিকায় (দোকানদার) — স্প্যাম থাকলে true */
export async function releaseSpam(db: D1Database, orderId: number): Promise<boolean> {
  const r = await db.prepare("UPDATE orders SET spam = 0, spam_released = 1, updated_at = datetime('now') WHERE id = ? AND spam > 0").bind(orderId).run();
  return !!r.meta.changes;
}
