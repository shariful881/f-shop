/**
 * সাইনআপের পাহারা — বট আর প্রতারক আটকানো।
 *
 * - Cloudflare Turnstile (ফ্রি captcha): সুপার অ্যাডমিন সেটিংসে site key + secret দিলে সাইনআপে চালু
 * - ইমেইল যাচাই (লিংক) আর ফোন যাচাই (OTP SMS): সেটিংসে চালু আর ব্যবস্থা থাকলে নতুন দোকানে লাগে
 * - যাচাই বাকি থাকলে দোকান চলে, কিন্তু অর্ডার নেয় না আর Google-এ যায় না (billing.computeState → "unverified")
 * - সন্দেহের কারণ (risk) সাইনআপেই লেখা হয় — সুপার অ্যাডমিনে "সন্দেহজনক" তালিকা
 */
import type { WorkerEnv as FullEnv } from "../worker-env";

/** দোকানের ভিতর থেকেও চলে — দরকার শুধু এগুলো */
type WorkerEnv = Pick<FullEnv, "PLATFORM_DB" | "EMAIL" | "PLATFORM_DOMAIN">;
import { platformSettings, type PlatformSettings } from "./billing";
import { sendSms } from "../shop/lib/sms";
import type { Settings } from "../shop/lib/settings";

/* ---------- সেটিংস ---------- */

export const turnstileKeys = (s: PlatformSettings) => {
  const site = (s.turnstile_site_key || "").trim();
  const secret = (s.turnstile_secret || "").trim();
  return site && secret ? { site, secret } : null;
};

/** প্ল্যাটফর্মের SMS (দোকানের SMS-এর মতো একই গেটওয়ে কোড) */
export const platformSms = (s: PlatformSettings): Settings | null => {
  const provider = s.sms_provider || "bulksmsbd";
  if (provider === "custom" ? !/^https?:\/\//i.test(s.sms_custom_url || "") : !s.sms_api_key) return null;
  return { sms_provider: provider, sms_api_key: s.sms_api_key || "", sms_sender_id: s.sms_sender_id || "", sms_custom_url: s.sms_custom_url || "" } as Settings;
};

/** ইমেইল পাঠানোর ঠিকানা — sellxbd.com Cloudflare Email Sending-এ চালু থাকতে হবে */
/**
 * দোকানের নামে লিংক, ইমেইল বা ফোন নম্বর আছে কিনা (security/step-8)।
 * নাম ইমেইলের বিষয় আর লেখায় যায় — অন্যের ইমেইল দিয়ে সাইনআপ করে SellxBD-এর নামে প্রতারণার লেখা পাঠানো ঠেকাতে।
 */
const NAME_LINK = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|xyz|top|bd|info|io|me|link|site|online|shop|store|app|co|cc|ru|in|pk)\b|@)/i;
const NAME_PHONE = /(\d[\s\-.]*){7,}/; // ৭টার বেশি অঙ্ক (মাঝে ফাঁকা/ড্যাশ থাকলেও)
const BN_DIGITS = /[০-৯]/g;
export function badShopName(name: string): boolean {
  const n = name.replace(BN_DIGITS, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
  return NAME_LINK.test(n) || NAME_PHONE.test(n);
}
/** ইমেইলে বসানোর আগে নাম নিরাপদ করা — পুরনো দোকানের নামেও লিংক/নম্বর যায় না */
export function emailSafeName(name: string, fallback = "আপনার দোকান"): string {
  const clean = (name || "").replace(/[<>&"]/g, "").trim().slice(0, 60);
  return !clean || badShopName(clean) ? fallback : clean;
}

export const emailFrom = (env: WorkerEnv, s: PlatformSettings) => (s.verify_email_from || `no-reply@${env.PLATFORM_DOMAIN}`).trim();

/**
 * মোবাইল যাচাইয়ের ধরন: "call" = SellxBD টিম ফোন করে হাতে যাচাই করে (সুপার অ্যাডমিন বাটন),
 * "sms" = SMS-এ OTP (প্ল্যাটফর্মের SMS থাকলে), অন্য কিছু = বন্ধ
 */
export const phoneMode = (s: PlatformSettings): "call" | "sms" | "off" =>
  s.verify_phone === "call" ? "call" : (s.verify_phone === "sms" || s.verify_phone === "1") && platformSms(s) ? "sms" : "off";

/** নতুন দোকানে কোন যাচাই লাগবে — চালু আর পাঠানোর ব্যবস্থা দুটোই থাকলে */
export function verifyNeeds(env: WorkerEnv, s: PlatformSettings) {
  return {
    email: s.verify_email === "1" && !!env.EMAIL,
    phone: phoneMode(s) !== "off",
  };
}

/* ---------- Turnstile ---------- */

export async function checkTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { success?: boolean };
    return !!j.success;
  } catch (e) {
    console.error("turnstile", e);
    return false;
  }
}

/* ---------- সন্দেহের কারণ ---------- */

/** প্রতারণা/ফিশিংয়ে প্রায়ই থাকা শব্দ (দোকানের নাম বা ঠিকানায়) */
const PHISH_WORDS = [
  "login", "signin", "sign-in", "verify", "verification", "secure", "account", "password", "wallet", "recovery", "support-team",
  "bkash", "nagad", "rocket", "upay", "paypal", "bank", "dbbl", "brac", "facebook", "meta", "instagram", "whatsapp", "google",
  "apple", "microsoft", "netflix", "binance", "crypto", "airdrop", "lottery", "prize", "gift-card", "giftcard", "অ্যাকাউন্ট যাচাই", "পিন",
];
/** এককালীন/নকল ইমেইলের পরিচিত ডোমেইন */
const DISPOSABLE = [
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com",
  "getnada.com", "sharklasers.com", "dispostable.com", "maildrop.cc", "fakeinbox.com", "throwawaymail.com", "mintemail.com", "emailondeck.com",
];

export const RISK_LABEL: Record<string, string> = {
  phish_word: "নাম/ঠিকানায় প্রতারণার শব্দ",
  disposable: "এককালীন ইমেইল",
  ip_many: "একই IP থেকে ২৪ ঘণ্টায় ৩+ দোকান",
  phone_many: "একই ফোনে ৩+ দোকান",
  email_many: "একই ইমেইলে ২+ দোকান",
};

export async function riskFlags(env: WorkerEnv, v: { shop_name: string; slug: string; email: string; phone: string; ip: string }): Promise<string[]> {
  const flags: string[] = [];
  const text = `${v.shop_name} ${v.slug}`.toLowerCase();
  if (PHISH_WORDS.some((w) => text.includes(w))) flags.push("phish_word");
  const domain = v.email.split("@")[1] || "";
  if (DISPOSABLE.some((d) => domain === d || domain.endsWith(`.${d}`))) flags.push("disposable");
  const c = await env.PLATFORM_DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM shops WHERE signup_ip = ? AND created_at > datetime('now', '-1 day')) ip_n,
       (SELECT COUNT(*) FROM shops WHERE owner_phone = ?) phone_n,
       (SELECT COUNT(*) FROM shops WHERE lower(owner_email) = ?) email_n`,
  ).bind(v.ip || "-", v.phone, v.email).first<{ ip_n: number; phone_n: number; email_n: number }>();
  if ((c?.ip_n ?? 0) >= 2) flags.push("ip_many");
  if ((c?.phone_n ?? 0) >= 2) flags.push("phone_many");
  if ((c?.email_n ?? 0) >= 1) flags.push("email_many");
  return flags;
}

/** "সন্দেহজনক" — সুপার অ্যাডমিন তালিকার শর্ত (shops s) */
export const SUSPICIOUS_SQL = `s.status != 'closed' AND s.risk_cleared = 0 AND (
  COALESCE(s.risk, '') != ''
  OR ((s.email_verified = 0 OR s.phone_verified = 0) AND s.created_at < datetime('now', '-1 day'))
)`;

/** ফোন করে যাচাই বাকি (টিমের কাজের তালিকা) */
export const PHONE_PENDING_SQL = "s.status != 'closed' AND s.deleted_at IS NULL AND s.phone_verified = 0";

/* ---------- কোড ---------- */

const sha = async (x: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const otp = () => String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
const linkToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");

type ShopLite = { id: string; name: string; slug: string; owner_email: string | null; owner_phone: string | null; email_verified: number; phone_verified: number };

export const loadShop = (env: WorkerEnv, id: string) =>
  env.PLATFORM_DB.prepare("SELECT id, name, slug, owner_email, owner_phone, email_verified, phone_verified FROM shops WHERE id = ?").bind(id).first<ShopLite>();

/** একই ধরনের কোড শেষ এক ঘণ্টায় কতবার পাঠানো হয়েছে */
async function sentRecently(env: WorkerEnv, shopId: string, kind: "email" | "phone", minutes: number) {
  const r = await env.PLATFORM_DB.prepare(`SELECT COUNT(*) n FROM verify_codes WHERE shop_id = ? AND kind = ? AND created_at > datetime('now', '-${minutes} minutes')`).bind(shopId, kind).first<{ n: number }>();
  return r?.n ?? 0;
}

export type SendResult = { ok: boolean; message: string };

/** যাচাইয়ের লিংক ইমেইলে — base = দোকানের ঠিকানা (https://slug.sellxbd.com) */
export async function sendEmailLink(env: WorkerEnv, shopId: string, base: string): Promise<SendResult> {
  const s = await platformSettings(env.PLATFORM_DB);
  const shop = await loadShop(env, shopId);
  if (!shop?.owner_email) return { ok: false, message: "দোকানে ইমেইল নেই" };
  if (shop.email_verified) return { ok: true, message: "ইমেইল আগেই যাচাই হয়েছে" };
  if (!env.EMAIL) return { ok: false, message: "ইমেইল পাঠানোর ব্যবস্থা এখনো চালু হয়নি — SellxBD সাপোর্টে জানান" };
  if ((await sentRecently(env, shopId, "email", 60)) >= 5) return { ok: false, message: "এক ঘণ্টায় অনেকবার পাঠানো হয়েছে — পরে চেষ্টা করুন" };
  const token = linkToken();
  await env.PLATFORM_DB.prepare("INSERT INTO verify_codes (shop_id, kind, code_hash, target, expires_at) VALUES (?, 'email', ?, ?, datetime('now', '+2 days'))")
    .bind(shopId, await sha(token), shop.owner_email).run();
  const url = `${base.replace(/\/+$/, "")}/verify/email?t=${token}`;
  const name = emailSafeName(shop.name);
  try {
    await env.EMAIL.send({
      to: shop.owner_email,
      from: { email: emailFrom(env, s), name: "SellxBD" },
      subject: `${name} — ইমেইল যাচাই করুন`,
      text: `আসসালামু আলাইকুম,\n\nআপনার দোকান "${name}" চালু করতে নিচের লিংকে চাপুন (২ দিন কাজ করবে):\n${url}\n\nআপনি দোকান না খুলে থাকলে এই ইমেইল উপেক্ষা করুন।\n\n— SellxBD`,
      html: `<div style="font-family:sans-serif;max-width:520px;line-height:1.6"><p>আসসালামু আলাইকুম,</p><p>আপনার দোকান <b>${name}</b> চালু করতে নিচের বাটনে চাপুন (২ দিন কাজ করবে):</p><p><a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">ইমেইল যাচাই করুন</a></p><p style="color:#64748b;font-size:13px">বাটন কাজ না করলে এই লিংক খুলুন:<br>${url}</p><p style="color:#64748b;font-size:13px">আপনি দোকান না খুলে থাকলে এই ইমেইল উপেক্ষা করুন।</p><p>— SellxBD</p></div>`,
    });
    return { ok: true, message: `যাচাইয়ের লিংক ${shop.owner_email}-এ পাঠানো হয়েছে। ইনবক্স (না পেলে স্প্যাম) দেখুন।` };
  } catch (e) {
    console.error("verify email send", e);
    return { ok: false, message: "ইমেইল পাঠানো যায়নি — কিছুক্ষণ পরে আবার চেষ্টা করুন" };
  }
}

export async function confirmEmailLink(env: WorkerEnv, shopId: string, token: string): Promise<boolean> {
  if (!/^[0-9a-f]{48}$/.test(token)) return false;
  const row = await env.PLATFORM_DB.prepare(
    "SELECT id FROM verify_codes WHERE shop_id = ? AND kind = 'email' AND code_hash = ? AND used_at IS NULL AND expires_at > datetime('now')",
  ).bind(shopId, await sha(token)).first<{ id: number }>();
  if (!row) return false;
  await env.PLATFORM_DB.batch([
    env.PLATFORM_DB.prepare("UPDATE verify_codes SET used_at = datetime('now') WHERE id = ?").bind(row.id),
    env.PLATFORM_DB.prepare("UPDATE shops SET email_verified = 1 WHERE id = ?").bind(shopId),
  ]);
  return true;
}

/** ফোনে ৬ অঙ্কের কোড (১০ মিনিট) */
export async function sendPhoneOtp(env: WorkerEnv, shopId: string): Promise<SendResult> {
  const s = await platformSettings(env.PLATFORM_DB);
  const shop = await loadShop(env, shopId);
  if (!shop?.owner_phone) return { ok: false, message: "দোকানে মোবাইল নম্বর নেই" };
  if (shop.phone_verified) return { ok: true, message: "মোবাইল আগেই যাচাই হয়েছে" };
  const sms = platformSms(s);
  if (!sms) return { ok: false, message: "SMS পাঠানোর ব্যবস্থা এখনো চালু হয়নি — SellxBD সাপোর্টে জানান" };
  if ((await sentRecently(env, shopId, "phone", 2)) >= 1) return { ok: false, message: "২ মিনিট পরে আবার কোড চাইতে পারবেন" };
  if ((await sentRecently(env, shopId, "phone", 24 * 60)) >= 5) return { ok: false, message: "আজ অনেকবার কোড পাঠানো হয়েছে — কাল আবার চেষ্টা করুন বা সাপোর্টে জানান" };
  const code = otp();
  await env.PLATFORM_DB.prepare("INSERT INTO verify_codes (shop_id, kind, code_hash, target, expires_at) VALUES (?, 'phone', ?, ?, datetime('now', '+10 minutes'))")
    .bind(shopId, await sha(`${shopId}:${code}`), shop.owner_phone).run();
  const r = await sendSms(sms, shop.owner_phone, `SellxBD যাচাই কোড: ${code} (১০ মিনিট)। কাউকে বলবেন না।`);
  if (!r.ok) {
    console.error("verify sms", r.response);
    return { ok: false, message: "SMS পাঠানো যায়নি — কিছুক্ষণ পরে আবার চেষ্টা করুন" };
  }
  return { ok: true, message: `${shop.owner_phone} নম্বরে ৬ অঙ্কের কোড পাঠানো হয়েছে।` };
}

export async function confirmPhoneOtp(env: WorkerEnv, shopId: string, code: string): Promise<SendResult> {
  const clean = code.replace(/\D/g, "");
  const row = await env.PLATFORM_DB.prepare(
    "SELECT id, code_hash, attempts FROM verify_codes WHERE shop_id = ? AND kind = 'phone' AND used_at IS NULL AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1",
  ).bind(shopId).first<{ id: number; code_hash: string; attempts: number }>();
  if (!row) return { ok: false, message: "কোডের মেয়াদ শেষ — নতুন কোড চান" };
  if (row.attempts >= 5) return { ok: false, message: "অনেকবার ভুল হয়েছে — নতুন কোড চান" };
  if (clean.length !== 6 || (await sha(`${shopId}:${clean}`)) !== row.code_hash) {
    await env.PLATFORM_DB.prepare("UPDATE verify_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return { ok: false, message: "কোড মেলেনি — আবার দেখে লিখুন" };
  }
  await env.PLATFORM_DB.batch([
    env.PLATFORM_DB.prepare("UPDATE verify_codes SET used_at = datetime('now') WHERE id = ?").bind(row.id),
    env.PLATFORM_DB.prepare("UPDATE shops SET phone_verified = 1 WHERE id = ?").bind(shopId),
  ]);
  return { ok: true, message: "মোবাইল যাচাই হয়েছে ✓" };
}
