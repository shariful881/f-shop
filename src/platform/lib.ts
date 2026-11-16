import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { WorkerEnv } from "../worker-env";
import { sha256Hex } from "../shop/lib/auth";

export type SuperRole = "owner" | "admin" | "support" | "finance";
export type SuperAdmin = { id: number; email: string; name: string | null; role: SuperRole };
export type PEnv = { Bindings: WorkerEnv; Variables: { superAdmin?: SuperAdmin } };
export type PCtx = Context<PEnv>;

export const SUPER_COOKIE = "super_session";

/** subdomain-এর জন্য সংরক্ষিত নাম */
export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "super", "mail", "email", "smtp", "ftp", "ns1", "ns2", "dns", "cdn", "static", "assets",
  "img", "images", "blog", "help", "support", "docs", "status", "billing", "pay", "payment", "shop", "store", "demo",
  "test", "dev", "staging", "login", "signup", "register", "dashboard", "account", "root", "system",
]);

export function validateSlug(slug: string): string | null {
  if (!slug) return "দোকানের ঠিকানা লিখুন";
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug)) return "৩-৩০ অক্ষর, শুধু ছোট ইংরেজি অক্ষর, সংখ্যা আর - (শুরু ও শেষে - নয়)";
  if (slug.includes("--")) return "পরপর দুটো - দেওয়া যাবে না";
  if (RESERVED_SLUGS.has(slug)) return "এই নামটি সংরক্ষিত, অন্য নাম দিন";
  return null;
}

export async function slugTaken(env: WorkerEnv, slug: string): Promise<boolean> {
  return !!(await env.PLATFORM_DB.prepare("SELECT 1 FROM shops WHERE slug = ?").bind(slug).first());
}

/** দোকানের ঠিকানা (লোকালে ?shop=slug) */
export function shopUrl(env: WorkerEnv, slug: string, path = "/"): string {
  if (env.DEV_MODE === "1") {
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}shop=${slug}`;
  }
  return `https://${slug}.${env.PLATFORM_DOMAIN}${path}`;
}

export async function platformRateLimit(env: WorkerEnv, key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSec * 1000));
  const row = await env.PLATFORM_DB.prepare(
    `INSERT INTO platform_rate_limits (key, count, expires_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`,
  ).bind(`${key}:${bucket}`, (bucket + 1) * windowSec * 1000).first<{ count: number }>();
  if (Math.random() < 0.05) await env.PLATFORM_DB.prepare("DELETE FROM platform_rate_limits WHERE expires_at < ?").bind(now).run();
  return (row?.count ?? 1) <= max;
}

/** গোনা না বাড়িয়ে শুধু দেখা */
export async function platformPeekRateLimit(env: WorkerEnv, key: string, windowSec: number): Promise<number> {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const row = await env.PLATFORM_DB.prepare("SELECT count FROM platform_rate_limits WHERE key = ?").bind(`${key}:${bucket}`).first<{ count: number }>();
  return row?.count ?? 0;
}

/* ---------- সুপার অ্যাডমিন সেশন ---------- */
export async function createSuperSession(env: WorkerEnv, adminId: number): Promise<string> {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.PLATFORM_DB.prepare("INSERT INTO super_sessions (id, admin_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))")
    .bind(await sha256Hex(token), adminId).run();
  return token;
}

export async function superFromCookie(c: PCtx) {
  const token = getCookie(c, SUPER_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return c.env.PLATFORM_DB.prepare(
    `SELECT a.id, a.email, a.name, a.role FROM super_sessions s JOIN super_admins a ON a.id = s.admin_id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND a.active = 1`,
  ).bind(await sha256Hex(token)).first<SuperAdmin>();
}

export async function destroySuperSession(env: WorkerEnv, token: string | undefined) {
  if (token) await env.PLATFORM_DB.prepare("DELETE FROM super_sessions WHERE id = ?").bind(await sha256Hex(token)).run();
}
