import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { loadSettings } from "../lib/settings";
import { publicOrigin } from "../lib/http";

/** প্রতিটা রিকোয়েস্টে সেটিংস একবার লোড */
export const withSettings: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("settings", await loadSettings(c.env.DB));
  await next();
};

/**
 * CSRF সুরক্ষা: POST রিকোয়েস্ট শুধু নিজের সাইট থেকে আসতে পারবে।
 * Codespaces-এর proxy-র পেছনে আসল domain X-Forwarded-Host-এ থাকে, তাই সেটাও মানা হয়।
 */
export const sameOriginPost: MiddlewareHandler<any> = async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    const allowed = new Set([new URL(c.req.url).origin, publicOrigin(c)]);
    if (origin && !allowed.has(origin)) {
      return c.text("অনুমতি নেই (ভিন্ন সাইট থেকে রিকোয়েস্ট)", 403);
    }
    if (!origin) {
      const referer = c.req.header("referer");
      if (referer) {
        try {
          if (!allowed.has(new URL(referer).origin)) return c.text("অনুমতি নেই", 403);
        } catch {
          return c.text("অনুমতি নেই", 403);
        }
      }
    }
  }
  await next();
};

/** সুরক্ষা হেডার */
export const securityHeaders: MiddlewareHandler<any> = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // অন্য সাইট আমাদের পেজ iframe-এ বসিয়ে ক্লিক চুরি করতে পারবে না (নিজের প্রিভিউ চলবে)
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (new URL(c.req.url).protocol === "https:") c.header("Strict-Transport-Security", "max-age=15552000");
};
