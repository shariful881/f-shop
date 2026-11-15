import { errorPageHtml } from "./lib/error-page";
import { logError } from "../platform/errors";
import { Hono } from "hono";
import type { AppEnv } from "./env";
import type { ShopState } from "../platform/billing";
import { withSettings, sameOriginPost, securityHeaders } from "./middleware/base";
import { shop, notFound } from "./routes/shop";
import { device } from "./middleware/device";
import { admin } from "./routes/admin";
import { fbCookies } from "./middleware/fb-cookies";
import { getCookie } from "hono/cookie";
import { sessionUser } from "./lib/auth";
import { ADMIN_COOKIE } from "./middleware/admin-auth";
import { themeOf } from "./lib/settings";

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

/** ছবি: দোকানের নিজের ডাটাবেস থেকে (key-তে uuid থাকে, তাই চিরকাল cache) */
shopApp.get("/img/*", async (c) => {
  const key = c.req.path.slice(5);
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) return c.text("not found", 404);
  const img = await c.env.IMAGES.get(key);
  if (!img) return c.text("not found", 404);
  return new Response(img.body, {
    headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
});

shopApp.use("*", securityHeaders, withSettings, sameOriginPost, device);
shopApp.use("*", async (c, next) => (c.req.path.startsWith("/admin") ? next() : fbCookies(c, next)));

/**
 * থিম এডিটরের প্রিভিউ: ?__preview=1 আর মালিকের লগইন থাকলে খসড়া সেটিংস দিয়ে দোকান দেখায়।
 * ক্রেতারা কখনো খসড়া দেখে না (লগইন ছাড়া প্যারামিটার কিছুই করে না)।
 */
shopApp.use("*", async (c, next) => {
  if (c.req.path.startsWith("/admin") || c.req.query("__preview") !== "1") return next();
  const user = await sessionUser(c.env.DB, getCookie(c, ADMIN_COOKIE));
  if (!user || user.role !== "owner") return next();
  const s = c.var.settings;
  const theme = themeOf(s);
  const draft = s[`theme_draft_${theme}`];
  if (draft) c.set("settings", { ...s, [`theme_cfg_${theme}`]: draft });
  await next();
  c.header("Cache-Control", "no-store");
  if (!(c.res.headers.get("content-type") || "").includes("text/html")) return;
  // প্রিভিউর ভেতরে লিংকে ক্লিক করলেও প্রিভিউতেই থাকে; অর্ডার/ফর্ম জমা বন্ধ
  const html = await c.res.text();
  const script = `<script>(function(){document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var u=new URL(a.href,location.href);if(u.origin!==location.origin||u.pathname.indexOf("/admin")===0){e.preventDefault();return;}u.searchParams.set("__preview","1");a.href=u.toString();},true);document.addEventListener("submit",function(e){e.preventDefault();},true);})();</script>`;
  const headers = new Headers(c.res.headers);
  headers.delete("content-length");
  c.res = new Response(html.replace("</body>", `${script}</body>`), { status: c.res.status, headers });
});

shopApp.route("/admin", admin);
shopApp.route("/", shop);

shopApp.notFound((c) => notFound(c));

shopApp.onError(async (err, c) => {
  console.error(err);
  await logError(c.env.PLATFORM_DB, { shopId: c.req.header("x-fshop-id"), method: c.req.method, path: new URL(c.req.url).pathname, err });
  return c.html(errorPageHtml("shop"), 500);
});
