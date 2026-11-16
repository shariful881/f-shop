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
 * Codespaces-এর proxy-র পেছনে আসল domain X-Forwarded-Host-এ থাকে, তাই সেটাও মানা হয় — শুধু DEV_MODE=1-এ;
 * লাইভে ওই হেডার Worker-এর শুরুতেই মুছে যায় (src/index.ts stripProxyHeaders)।
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
  // পেজ নিজে কড়া নিয়ম দিলে (যেমন রিসেট লিংকের পেজে no-referrer) সেটাই থাকে
  if (!c.res.headers.has("Referrer-Policy")) c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // অন্য সাইট আমাদের পেজ iframe-এ বসিয়ে ক্লিক চুরি করতে পারবে না (নিজের প্রিভিউ চলবে)
  c.header("X-Frame-Options", "SAMEORIGIN");
  // অ্যাডমিন আর সুপার অ্যাডমিনে script শুধু নিজের সাইট থেকে (inline বা অন্য সাইটের script চলে না) — XSS হলে দ্বিতীয় দেয়াল (security/step-7)।
  // দোকানের পাবলিক পেজে নয় — সেখানে Pixel, GTM, GA4, TikTok আর inline ট্র্যাকিং চলে।
  const path = new URL(c.req.url).pathname;
  const panel = /^\/(admin|super)(\/|$)/.test(path);
  c.header("Content-Security-Policy", `frame-ancestors 'self'; base-uri 'self'; object-src 'none'${panel ? "; script-src 'self'" : ""}`);
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (new URL(c.req.url).protocol === "https:") c.header("Strict-Transport-Security", "max-age=15552000");
};
