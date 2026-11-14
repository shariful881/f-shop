import type { Context } from "hono";
type Ctx = Context<any>;

/**
 * আসল ভিজিটরের IP।
 * Cloudflare-এ লাইভ থাকলে CF-Connecting-IP সবসময় থাকে (ভিজিটর এটা বদলাতে পারে না)।
 * Codespaces-এর proxy-র পেছনে X-Forwarded-For থেকে নেওয়া হয় (Laravel-এর TrustProxies-এর মতো)।
 */
export function clientIp(c: Ctx): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return c.req.header("x-real-ip")?.trim() || "0.0.0.0";
}

/** proxy-র পেছনে থাকলেও আসল https://domain বের করে */
export function publicOrigin(c: Ctx): string {
  const url = new URL(c.req.url);
  const proto = (c.req.header("x-forwarded-proto") || url.protocol.replace(":", "")).split(",")[0]!.trim();
  const host = (c.req.header("x-forwarded-host") || c.req.header("host") || url.host).split(",")[0]!.trim();
  return `${proto}://${host}`;
}

export function isHttps(c: Ctx): boolean {
  return publicOrigin(c).startsWith("https://");
}

/** বর্তমান পেজের পূর্ণ URL (আসল domain সহ) */
export function publicUrl(c: Ctx): string {
  const url = new URL(c.req.url);
  return publicOrigin(c) + url.pathname + url.search;
}

export function wantsJson(c: Ctx): boolean {
  return (c.req.header("accept") || "").includes("application/json");
}

export function toInt(v: unknown, def = 0): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

export function str(v: unknown, max = 1000): string {
  return (typeof v === "string" ? v : "").trim().slice(0, max);
}
