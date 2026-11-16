/**
 * পাসওয়ার্ড ভুলে গেলে ইমেইলে রিসেট লিংক (security/step-3)।
 * - টোকেন ৩২ বাইট, ডাটাবেসে শুধু SHA-256; ৩০ মিনিট; একবারই চলে; নতুন লিংক চাইলে আগেরগুলো বাতিল
 * - লিংকের ঠিকানা রিকোয়েস্টের আসল host থেকে (দোকান সেই host দিয়েই খোঁজা হয়েছে) — X-Forwarded-Host নয়
 * - ইমেইল আছে কি নেই — উত্তর সবসময় একই (কারো ইমেইল খুঁজে বের করা যায় না)
 */
import { sha256Hex } from "./auth";
import { platformSettings } from "../../platform/billing";
import { emailFrom } from "../../platform/verify";
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

export async function sendResetEmail(env: Env, to: string, url: string, shopName: string): Promise<boolean> {
  if (!env.EMAIL) return false;
  const s = await platformSettings(env.PLATFORM_DB);
  const name = (shopName || "আপনার দোকান").replace(/[<>&"]/g, "").slice(0, 60);
  try {
    await env.EMAIL.send({
      to,
      from: { email: emailFrom(env, s), name: "SellxBD" },
      subject: `${name} — পাসওয়ার্ড রিসেট`,
      text: `আসসালামু আলাইকুম,\n\n"${name}"-এর অ্যাডমিন প্যানেলে নতুন পাসওয়ার্ড দিতে নিচের লিংকে চাপুন (${RESET_MINUTES} মিনিট কাজ করবে, একবারই):\n${url}\n\nআপনি পাসওয়ার্ড রিসেট না চেয়ে থাকলে এই ইমেইল উপেক্ষা করুন — আপনার পাসওয়ার্ড বদলাবে না।\n\n— SellxBD`,
      html: `<div style="font-family:sans-serif;max-width:520px;line-height:1.6"><p>আসসালামু আলাইকুম,</p><p><b>${name}</b>-এর অ্যাডমিন প্যানেলে নতুন পাসওয়ার্ড দিতে নিচের বাটনে চাপুন (${RESET_MINUTES} মিনিট কাজ করবে, একবারই):</p><p><a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">নতুন পাসওয়ার্ড দিন</a></p><p style="color:#64748b;font-size:13px">বাটন কাজ না করলে এই লিংক খুলুন:<br>${url}</p><p style="color:#64748b;font-size:13px">আপনি পাসওয়ার্ড রিসেট না চেয়ে থাকলে এই ইমেইল উপেক্ষা করুন — আপনার পাসওয়ার্ড বদলাবে না।</p><p>— SellxBD</p></div>`,
    });
    return true;
  } catch (e) {
    console.error("reset email send", e);
    return false;
  }
}
