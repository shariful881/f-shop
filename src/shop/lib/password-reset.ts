import { getLang } from "../i18n";
/**
 * পাসওয়ার্ড ভুলে গেলে ইমেইলে রিসেট লিংক (security/step-3)।
 * - টোকেন ৩২ বাইট, ডাটাবেসে শুধু SHA-256; ৩০ মিনিট; একবারই চলে; নতুন লিংক চাইলে আগেরগুলো বাতিল
 * - লিংকের ঠিকানা রিকোয়েস্টের আসল host থেকে (দোকান সেই host দিয়েই খোঁজা হয়েছে) — X-Forwarded-Host নয়
 * - ইমেইল আছে কি নেই — উত্তর সবসময় একই (কারো ইমেইল খুঁজে বের করা যায় না)
 */
import { sha256Hex } from "./auth";
import { platformSettings } from "../../platform/billing";
import { emailFrom, emailSafeName } from "../../platform/verify";
import { emailHtml, emailText, type EmailParts } from "../../platform/email-template";
import type { WorkerEnv } from "../../worker-env";

export const RESET_MINUTES = 30;

const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** লিংকের মূল ঠিকানা: লাইভে সবসময় https + আসল host; লোকালে (localhost) যেমন আছে */
export function resetBase(requestUrl: string): string {
  const u = new URL(requestUrl);
  return /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? u.origin : `https://${u.host}`;
}

export async function createResetToken(db: D1Database, userId: number): Promise<string> {
  const token = newToken();
  await db.batch([
    db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").bind(userId),
    db.prepare(`INSERT INTO password_resets (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+${RESET_MINUTES} minutes'))`).bind(await sha256Hex(token), userId),
    db.prepare("DELETE FROM password_resets WHERE expires_at < datetime('now', '-1 day')"),
  ]);
  return token;
}

/** চালু টোকেন হলে ইউজার, নইলে null */
export async function resetUser(db: D1Database, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return db.prepare(
    `SELECT r.id rid, u.id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.id = ? AND r.used_at IS NULL AND r.expires_at > datetime('now') AND u.is_admin = 1 AND u.active = 1`,
  ).bind(await sha256Hex(token)).first<{ rid: string; id: number; email: string }>();
}

type Env = Pick<WorkerEnv, "PLATFORM_DB" | "EMAIL" | "PLATFORM_DOMAIN">;

/** পাসওয়ার্ড রিসেটের ইমেইল (টেস্ট আর প্রিভিউয়েও ব্যবহার হয়) */
export function resetMail(lang: "bn" | "en", name: string, url: string, supportPhone: string | undefined, siteUrl: string) {
  const bn = lang === "bn";
  const parts: EmailParts = bn
    ? {
        lang, preheader: `${name}-এর অ্যাডমিন প্যানেলে নতুন পাসওয়ার্ড দিন।`, badge: "পাসওয়ার্ড রিসেট",
        title: "নতুন পাসওয়ার্ড দিন", greeting: "আসসালামু আলাইকুম,",
        intro: "আপনার অ্যাডমিন প্যানেলের পাসওয়ার্ড বদলানোর অনুরোধ পেয়েছি। নিচের বাটনে চেপে নতুন পাসওয়ার্ড দিন।",
        facts: [["দোকান", name]], button: { label: "নতুন পাসওয়ার্ড দিন", url }, expiry: `লিংকটা ${RESET_MINUTES} মিনিট কাজ করবে, একবারই`,
        safety: "আপনি পাসওয়ার্ড রিসেট না চেয়ে থাকলে এই ইমেইল উপেক্ষা করুন — আপনার পাসওয়ার্ড বদলাবে না। এই লিংক কাউকে দেবেন না।",
        supportPhone, siteUrl,
      }
    : {
        lang, preheader: `Set a new password for the ${name} admin panel.`, badge: "Password reset",
        title: "Set a new password", greeting: "Hello,",
        intro: "We received a request to change your admin panel password. Press the button below to set a new one.",
        facts: [["Shop", name]], button: { label: "Set new password", url }, expiry: `This link works for ${RESET_MINUTES} minutes, only once`,
        safety: "If you didn't ask for a password reset, ignore this email — your password won't change. Don't share this link.",
        supportPhone, siteUrl,
      };
  return {
    subject: bn ? `${name} — পাসওয়ার্ড রিসেট` : `${name} — password reset`,
    text: emailText(parts, parts.intro),
    html: emailHtml(parts),
  };
}

export async function sendResetEmail(env: Env, to: string, url: string, shopName: string): Promise<boolean> {
  if (!env.EMAIL) return false;
  const s = await platformSettings(env.PLATFORM_DB);
  const name = emailSafeName(shopName);
  try {
    // অ্যাডমিন প্যানেলের ভাষায় (রিকোয়েস্ট /admin/forgot থেকে আসে)
    const mail = resetMail(getLang() === "en" ? "en" : "bn", name, url, s.support_phone || undefined, `https://${env.PLATFORM_DOMAIN}`);
    await env.EMAIL.send({ to, from: { email: emailFrom(env, s), name: "SellxBD" }, ...mail });
    return true;
  } catch (e) {
    console.error("reset email send", e);
    return false;
  }
}
