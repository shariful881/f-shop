import { Hono } from "hono";
import type { AppEnv } from "./env";
import type { ShopState } from "../platform/billing";
import { withSettings, sameOriginPost, securityHeaders } from "./middleware/base";
import { shop, notFound } from "./routes/shop";
import { device } from "./middleware/device";
import { admin } from "./routes/admin";
import { fbCookies } from "./middleware/fb-cookies";

/** একটা দোকানের পুরো অ্যাপ — প্রতিটা দোকানের Durable Object-এর ভিতরে চলে */
export const shopApp = new Hono<AppEnv>();

/** Worker থেকে আসা বিলিং অবস্থা (দোকান অর্ডার নিতে পারবে কি না) */
shopApp.use("*", async (c, next) => {
  let state: ShopState = { status: "active", accepting: true, reason: "ok", balance: 0, trial_ends_at: null, trial_orders_left: 0, grace_ends_at: null };
  const raw = c.req.header("x-fshop-state");
  if (raw) {
    try { state = JSON.parse(decodeURIComponent(raw)); } catch {}
  }
  c.set("shopState", state);
  await next();
});

shopApp.use("*", securityHeaders, withSettings, sameOriginPost, device);
shopApp.use("*", async (c, next) => (c.req.path.startsWith("/admin") ? next() : fbCookies(c, next)));

shopApp.route("/admin", admin);
shopApp.route("/", shop);

shopApp.notFound((c) => notFound(c));

shopApp.onError((err, c) => {
  console.error(err);
  return c.text("দুঃখিত, একটা সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।", 500);
});
