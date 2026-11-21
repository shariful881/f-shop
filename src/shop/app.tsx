import { errorPageHtml } from "./lib/error-page";
import { ImageQuotaError } from "./lib/images";
import { mb } from "./lib/media";
import { flash } from "./routes/admin";
import { logError } from "../platform/errors";
import { Hono } from "hono";
import { i18n, clientScript } from "./i18n";
import type { AppEnv } from "./env";
import type { ShopState } from "../platform/billing";
import { withSettings, sameOriginPost, securityHeaders } from "./middleware/base";
import { shop, notFound } from "./routes/shop";
import { device } from "./middleware/device";
import { admin } from "./routes/admin";
import { fbCookies } from "./middleware/fb-cookies";
import { setCookie } from "hono/cookie";
import { sessionUser } from "./lib/auth";
import { adminToken } from "./middleware/admin-auth";
import { themeOf } from "./lib/settings";
import { confirmEmailLink } from "../platform/verify";

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
  // যাচাই বাকি দোকানের পাবলিক পেজ Google-এ নয়
  if (state.reason === "unverified" && !c.req.path.startsWith("/admin")) c.header("X-Robots-Tag", "noindex, nofollow");
  // ডেমো দোকান: পণ্য আসল নয়, অর্ডার বন্ধ — Google-এ নয় (লিংক ধরে sellxbd.com-এ ফেরা চলে)
  else if (c.var.settings?.demo_mode === "1" && !c.req.path.startsWith("/admin")) c.header("X-Robots-Tag", "noindex, follow");
});

/** ইমেইলের যাচাই লিংক (লগইন লাগে না — লিংকের টোকেনই প্রমাণ) */
shopApp.get("/verify/email", async (c) => {
  const ok = await confirmEmailLink(c.env, c.env.SHOP_ID, c.req.query("t") || "");
  if (ok) c.header("x-fshop-clear-cache", "1");
  setCookie(c, "flash", encodeURIComponent(JSON.stringify(ok
    ? { type: "ok", text: "ইমেইল যাচাই হয়েছে ✓" }
    : { type: "error", text: "লিংকটা কাজ করছে না (মেয়াদ শেষ বা আগেই ব্যবহার হয়েছে) — নতুন লিংক পাঠান" })), { path: "/admin", httpOnly: true, sameSite: "Lax", secure: new URL(c.req.url).protocol === "https:", maxAge: 60 });
  return c.redirect("/admin/verify", 303);
});

/** ছবি: দোকানের নিজের ডাটাবেস থেকে (key-তে uuid থাকে, তাই চিরকাল cache) */
shopApp.get("/img/*", async (c) => {
  const key = c.req.path.slice(5);
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) return c.text("not found", 404);
  if (key.startsWith("demo/")) return c.redirect(`/demo-img/${key.slice(5)}`, 301);
  const img = await c.env.IMAGES.get(key);
  if (!img) return c.text("not found", 404);
  return new Response(img.body, {
    headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
});

/** ভাষার অভিধান (ব্রাউজারে JavaScript-এর লেখা অনুবাদের জন্য) — ইংরেজি মোডের পেজ থেকে লোড হয় */
for (const [path, scope] of [["/i18n/en.js", "admin"], ["/i18n/en-site.js", "site"]] as const) {
  shopApp.get(path, () => new Response(clientScript(scope), {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" },
  }));
}

shopApp.use("*", securityHeaders, withSettings, i18n, sameOriginPost, device);

/**
 * নিরাপত্তা (security/step-4): GTM দিয়ে দোকানের পেজে যেকোনো JavaScript চালানো যায় —
 * তাই যাচাই বাকি (ইমেইল/মোবাইল) দোকানে GTM লোড হয় না (প্রতারণার পেজ বানিয়ে sellxbd.com-এর নাম ব্যবহার ঠেকাতে)।
 * Pixel, GA4, TikTok শুধু আইডি নেয় — নিজের কোড চালানো যায় না, তাই সেগুলো সবসময় চলে।
 */
shopApp.use("*", async (c, next) => {
  // অ্যাডমিনে নয় — নইলে সেটিংস পেজে ঘর খালি দেখাত আর সেভ করলে মুছে যেত
  if (!c.req.path.startsWith("/admin") && c.var.shopState?.reason === "unverified" && c.var.settings.gtm_id) c.set("settings", { ...c.var.settings, gtm_id: "" });
  await next();
});
shopApp.use("*", async (c, next) => (c.req.path.startsWith("/admin") ? next() : fbCookies(c, next)));

/**
 * থিম এডিটরের প্রিভিউ: ?__preview=1 আর মালিকের লগইন থাকলে খসড়া সেটিংস দিয়ে দোকান দেখায়।
 * ক্রেতারা কখনো খসড়া দেখে না (লগইন ছাড়া প্যারামিটার কিছুই করে না)।
 */
shopApp.use("*", async (c, next) => {
  if (c.req.path.startsWith("/admin") || c.req.query("__preview") !== "1") return next();
  const user = await sessionUser(c.env.DB, adminToken(c));
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
  if (err instanceof ImageQuotaError) {
    // প্ল্যানের ছবির জায়গা শেষ — ভুল নয়, দোকানদারকে পরিষ্কার বার্তা
    const text = `ছবির জায়গা শেষ — ব্যবহার ${mb(err.usedBytes)} MB, প্ল্যানের সীমা ${mb(err.limitBytes)} MB। মিডিয়া থেকে অব্যবহৃত ছবি মুছুন বা বড় প্ল্যান নিন।`;
    const path = new URL(c.req.url).pathname;
    if (path === "/admin/upload-image" || (c.req.header("accept") || "").includes("json")) return c.json({ message: text }, 413);
    flash(c, "error", text);
    const back = c.req.header("referer") || "";
    let to = "/admin/media";
    try { const u = new URL(back); if (u.host === new URL(c.req.url).host && u.pathname.startsWith("/admin")) to = u.pathname + u.search; } catch { /* থাক */ }
    return c.redirect(to, 303);
  }
  console.error(err);
  await logError(c.env.PLATFORM_DB, { shopId: c.req.header("x-fshop-id"), method: c.req.method, path: new URL(c.req.url).pathname, err });
  return c.html(errorPageHtml("shop"), 500);
});
