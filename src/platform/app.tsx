import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { PCtx, PEnv } from "./lib";
import {
  createSuperSession, destroySuperSession, platformPeekRateLimit, platformRateLimit, shopUrl, slugTaken, superFromCookie, SUPER_COOKIE, validateSlug,
} from "./lib";
import { badShopName, checkTurnstile, riskFlags, sendEmailLink, turnstileKeys, verifyNeeds } from "./verify";
import { registerVisitorChat } from "./visitor-chat";
import { HomePage, PLATFORM_NAME, PLayout, SignupPage, SuperLoginPage, SuperSetupPage, type PSeo } from "./views";
import { num, platformSettings } from "./billing";
import { AboutPage, ContactPage, PlatformNotFoundPage, HelpArticlePage, HelpIndexPage, BlogIndexPage, BlogPostPage, PricingPage, PrivacyPage, PublicNav, RefundPage, SiteFooter, TermsPage, type Fees } from "./pages";
import { helpBySlug, HELP } from "./help";
import { okCover, publishedPosts, postBySlug } from "./blog";
import { superApp } from "./super";
import { sameOriginPost, securityHeaders } from "../shop/middleware/base";
import { logError } from "./errors";
import { plans, TRIAL_PLAN } from "./plans";
import { errorPageHtml } from "../shop/lib/error-page";
import { clientIp, isHttps, str, toInt } from "../shop/lib/http";
import { normalizePhone } from "../shop/lib/phone";
import { hashPassword, needsRehash, verifyPassword } from "../shop/lib/auth";
import { clearSession, readSession, SUPER_COOKIES, writeSession } from "../shop/lib/session-cookie";
import { clearShopCache } from "./resolve";
import { nicheByKey } from "../shop/lib/niches";
import { ASSET_VERSION } from "../shop/views/layout";
import { BROWSER_EVENTS, cookieVal, fbcFrom, newPxId, okEventId, pxId, pxLater, pxReady, pxSignupDonePage, type AdClick } from "./fb";

/** প্ল্যাটফর্মের অ্যাপ: ourdomain.com — হোম, সাইনআপ, সুপার অ্যাডমিন */
export const platformApp = new Hono<PEnv>();

platformApp.use("*", securityHeaders, sameOriginPost);
platformApp.onError(async (err, c) => {
  console.error(err);
  await logError(c.env.PLATFORM_DB, { method: c.req.method, path: new URL(c.req.url).pathname, err });
  return c.html(errorPageHtml("platform"), 500);
});

const html = (c: PCtx, node: unknown, status: 200 | 404 | 422 | 429 = 200, cache = false) => {
  // পাবলিক পেজ সবার জন্য একই — ৫ মিনিট cache (দ্রুত খোলে, back বাটনে সাথে সাথে); লগইন/ফর্ম/অ্যাডমিন no-store
  c.header("Cache-Control", cache && status === 200 ? "public, max-age=300" : "no-store");
  return c.html("<!DOCTYPE html>" + String(node), status);
};

/** সাইটের মূল ঠিকানা (canonical, sitemap, JSON-LD) */
const siteBase = (c: PCtx) => `https://${c.env.PLATFORM_DOMAIN}`;
const canon = (c: PCtx, path: string) => siteBase(c) + path;

/** www → মূল ডোমেইন, শেষের / বাদ — একটাই ঠিকানা যাতে Google দুবার না গোনে */
platformApp.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const base = c.env.PLATFORM_DOMAIN;
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    if (url.hostname === `www.${base}`) return c.redirect(`https://${base}${url.pathname}${url.search}`, 301);
    // শুরুর একাধিক / বা \ একটাতে নামানো — নইলে //evil.com/ অন্য সাইটে পাঠিয়ে দিত (open redirect)
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      const clean = "/" + url.pathname.replace(/^[\/\\]+/, "").replace(/\/+$/, "");
      return c.redirect(clean + url.search, 301);
    }
  }
  await next();
});

/** ব্রেডক্রাম্ব (Google-এ ঠিকানার জায়গায় সুন্দর পথ) */
const crumbs = (c: PCtx, items: [string, string][]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: [["হোম", "/"] as [string, string], ...items].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: canon(c, path) })),
});

platformApp.get("/health", async (c) => {
  const row = await c.env.PLATFORM_DB.prepare("SELECT COUNT(*) AS n FROM shops").first<{ n: number }>();
  return c.json({ ok: true, shops: row?.n ?? 0 });
});

const publicNav = <PublicNav />;

/** দাম আর সাপোর্ট নম্বর (সুপার অ্যাডমিনের সেটিংস থেকে) */
async function loadFees(c: PCtx): Promise<Fees> {
  const s = await platformSettings(c.env.PLATFORM_DB);
  const support = /^01[3-9]\d{8}$/.test(s.support_phone || "") ? s.support_phone! : "";
  return { plans: plans(s), staff: num(s, "staff_fee", 49), trialDays: num(s, "trial_days", 30), trialOrders: num(s, "trial_orders", 400), support };
}

/** হোমের description — ট্রায়ালের দিন সেটিংস থেকে (আগে "১৪ দিন" লেখা ছিল, আসলে ৩০) */
const homeDesc = (f: Fees) => `কোড ছাড়া নিজের ই-কমার্স ওয়েবসাইট — রেডি দোকান, ল্যান্ডিং পেজ, ফেক অর্ডার আটকানো, Steadfast/Pathao/RedX, Pixel + CAPI। ${f.trialDays.toLocaleString("bn-BD")} দিন সব ফিচার ফ্রি, ফ্রি প্ল্যান চিরকাল।`;

/** Search Console/Bing যাচাই আর GA4 — সুপার অ্যাডমিন → সেটিংস → Google */
async function siteTags(c: PCtx): Promise<PSeo["site"]> {
  const s = await platformSettings(c.env.PLATFORM_DB);
  return { gsc: s.gsc_verification || "", bing: s.bing_verification || "", ga4: s.ga4_id || "", fbpx: pxId(s) };
}

/** পাবলিক পেজ: মেনু + পেজ + ফুটার */
type PageOpts = { description?: string | ((f: Fees) => string); path?: string; crumbs?: [string, string][]; jsonLd?: unknown[]; ogType?: PSeo["ogType"]; noindex?: boolean; image?: string; fullTitle?: string };
const publicPage = async (c: PCtx, title: string, body: (f: Fees) => Child, status: 200 | 404 = 200, o: PageOpts = {}) => {
  const f = await loadFees(c);
  const path = o.path ?? new URL(c.req.url).pathname;
  const description = typeof o.description === "function" ? o.description(f) : o.description;
  const seo: PSeo = {
    canonical: status === 200 ? canon(c, path) : undefined,
    noindex: o.noindex || status !== 200,
    ogType: o.ogType,
    image: o.image,
    jsonLd: [...(o.crumbs ? [crumbs(c, o.crumbs)] : []), ...(o.jsonLd ?? [])],
    site: status === 200 ? await siteTags(c) : undefined,
  };
  return html(c, <PLayout title={o.fullTitle ?? `${title} — ${PLATFORM_NAME}`} nav={publicNav} description={description} seo={seo}>{body(f)}<SiteFooter support={f.support} /></PLayout>, status, !o.noindex);
};

const tk = (n: number) => "৳" + n.toLocaleString("bn-BD");
platformApp.get("/pricing", (c) => publicPage(c, "দাম ও হিসাব", (f) => <PricingPage f={f} />, 200, {
  fullTitle: `ই-কমার্স ওয়েবসাইটের খরচ ও প্ল্যান — ফ্রি থেকে শুরু | ${PLATFORM_NAME}`,
  description: (f) => `ই-কমার্স ওয়েবসাইট বানাতে কত খরচ? SellxBD-তে ফ্রি প্ল্যান থেকে শুরু, পেইড প্ল্যান মাসে ${tk(f.plans.small.price)} থেকে — ডোমেইন, হোস্টিং, সব ফিচার একসাথে, লুকানো খরচ নেই। ক্যালকুলেটরে হিসাব করে দেখুন।`,
  crumbs: [["দাম ও হিসাব", "/pricing"]],
}));
platformApp.get("/about", (c) => publicPage(c, "আমাদের সম্পর্কে", (f) => <AboutPage f={f} />, 200, {
  description: "SellxBD কারা, কেন বানানো — বাংলাদেশের ফেসবুক সেলারদের ফেক অর্ডার, কুরিয়ার আর হিসাবের ঝামেলা কমাতে তৈরি অনলাইন দোকান প্ল্যাটফর্ম।",
  crumbs: [["আমাদের সম্পর্কে", "/about"]],
}));
platformApp.get("/contact", (c) => publicPage(c, "যোগাযোগ", (f) => <ContactPage f={f} />, 200, {
  fullTitle: `যোগাযোগ — কল/WhatsApp, ২৪ ঘণ্টা সাপোর্ট | ${PLATFORM_NAME}`,
  description: (f) => `SellxBD টিমের সাথে যোগাযোগ — ফোন/WhatsApp${f.support ? ` ${f.support}` : ""}, ২৪ ঘণ্টা সাপোর্ট। দোকান খোলা, ডোমেইন, কুরিয়ার বা বিল নিয়ে প্রশ্ন থাকলে জানান।`,
  crumbs: [["যোগাযোগ", "/contact"]],
}));
platformApp.get("/terms", (c) => publicPage(c, "শর্তাবলি", (f) => <TermsPage f={f} />, 200, { description: "SellxBD ব্যবহারের শর্তাবলি — সেবা, অ্যাকাউন্ট, চার্জ ও রিচার্জ, যা বিক্রি করা যাবে না।", crumbs: [["শর্তাবলি", "/terms"]] }));
platformApp.get("/privacy", (c) => publicPage(c, "প্রাইভেসি নীতি", () => <PrivacyPage />, 200, { description: "SellxBD দোকানদার আর ক্রেতার কোন তথ্য রাখে, কীভাবে সুরক্ষিত রাখে আর কাদের সাথে শেয়ার হয়।", crumbs: [["প্রাইভেসি নীতি", "/privacy"]] }));
platformApp.get("/refund", (c) => publicPage(c, "রিফান্ড নীতি", () => <RefundPage />, 200, { description: "SellxBD-তে রিচার্জের টাকা কখন, কীভাবে ফেরত পাবেন — ব্যবহার না হওয়া ব্যালেন্স, ভুল রিচার্জ আর সময়সীমার নিয়ম।", crumbs: [["রিফান্ড নীতি", "/refund"]] }));
platformApp.notFound((c) => publicPage(c as PCtx, "পাওয়া যায়নি", () => <PlatformNotFoundPage />, 404));
platformApp.get("/help", (c) => {
  const q = (c.req.query("q") || "").slice(0, 60);
  return publicPage(c, "হেল্প সেন্টার", () => <HelpIndexPage q={q} />, 200, {
    fullTitle: `হেল্প সেন্টার — অনলাইন দোকান চালানোর ধাপে ধাপে গাইড | ${PLATFORM_NAME}`,
    description: `SellxBD হেল্প সেন্টার — দোকান খোলা, পণ্য, অর্ডার, ফেক অর্ডার আটকানো, কুরিয়ার, Pixel, পেমেন্টসহ ${HELP.length.toLocaleString("bn-BD")}টা ধাপে ধাপে গাইড।`,
    path: "/help", noindex: !!q, crumbs: [["হেল্প সেন্টার", "/help"]],
  });
});
/* ---------- ব্লগ, sitemap, robots ---------- */
platformApp.get("/blog", async (c) => {
  const posts = await publishedPosts(c.env.PLATFORM_DB);
  return publicPage(c, "ব্লগ", () => <BlogIndexPage posts={posts} />, 200, {
    fullTitle: `অনলাইন বিজনেস গাইড — ফেসবুক সেল, ফেক অর্ডার, কুরিয়ার | ${PLATFORM_NAME} ব্লগ`,
    description: "অনলাইন বিজনেস শুরু, ফেসবুকে বিক্রি বাড়ানো, ফেক অর্ডার কমানো, কুরিয়ার আর অ্যাডের খরচ — বাংলাদেশের সেলারদের জন্য বাংলায় কাজের গাইড।",
    crumbs: [["ব্লগ", "/blog"]],
  });
});
platformApp.get("/blog/:slug{[a-z0-9-]+}", async (c) => {
  const post = await postBySlug(c.env.PLATFORM_DB, c.req.param("slug"));
  if (!post) return publicPage(c, "পাওয়া যায়নি", () => <PlatformNotFoundPage />, 404);
  const more = (await publishedPosts(c.env.PLATFORM_DB, 6)).filter((x) => x.id !== post.id).slice(0, 4);
  const path = `/blog/${post.slug}`;
  const cover = post.cover_image && okCover(post.cover_image) ? post.cover_image : "";
  const desc = post.meta_description || post.excerpt;
  return publicPage(c, post.title, () => <BlogPostPage post={post} more={more} />, 200, {
    fullTitle: `${post.seo_title || post.title} — ${PLATFORM_NAME}`,
    description: desc, path, ogType: "article", image: cover || undefined,
    crumbs: [["ব্লগ", "/blog"], [post.title, path]],
    jsonLd: [{
      "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description: desc,
      datePublished: isoDate(post.published_at || post.created_at), dateModified: isoDate(post.updated_at),
      mainEntityOfPage: canon(c, path), image: cover || canon(c, "/brand/og.jpg"), inLanguage: "bn-BD",
      wordCount: post.body_html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length,
      author: post.author_name ? { "@type": "Person", name: post.author_name, worksFor: { "@id": `${siteBase(c)}/#org` } } : { "@type": "Organization", name: `${PLATFORM_NAME} টিম`, url: siteBase(c) },
      publisher: { "@type": "Organization", name: PLATFORM_NAME, logo: { "@type": "ImageObject", url: canon(c, "/brand/icon-512.png") } },
    }],
  });
});
/** "2026-11-15 10:00:00" (UTC) → ISO */
const isoDate = (d: string) => (d.includes("T") ? d : d.replace(" ", "T") + "Z");

/** ব্লগের RSS — নতুন লেখা দ্রুত খুঁজে পেতে (Google, Feedly, ফিড রিডার) */
platformApp.get("/blog/feed.xml", async (c) => {
  const base = siteBase(c);
  const posts = await publishedPosts(c.env.PLATFORM_DB, 30);
  const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rfc = (d: string) => new Date(isoDate(d)).toUTCString();
  const items = posts.map((p) => `<item><title>${x(p.title)}</title><link>${base}/blog/${p.slug}</link><guid isPermaLink="true">${base}/blog/${p.slug}</guid><pubDate>${rfc(p.published_at || p.created_at)}</pubDate><description>${x(p.meta_description || p.excerpt)}</description></item>`).join("");
  const last = posts[0] ? `<lastBuildDate>${rfc(posts[0].updated_at)}</lastBuildDate>` : "";
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${PLATFORM_NAME} ব্লগ</title><link>${base}/blog</link><atom:link href="${base}/blog/feed.xml" rel="self" type="application/rss+xml"/><description>বাংলাদেশের অনলাইন সেলারদের জন্য গাইড</description><language>bn-BD</language>${last}${items}</channel></rss>`, 200, { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=1800" });
});

/** llms.txt — AI সহকারীদের জন্য সাইটের সংক্ষিপ্ত পরিচয় (ঐচ্ছিক মানদণ্ড, র‍্যাঙ্কিং ফ্যাক্টর নয়) */
platformApp.get("/llms.txt", async (c) => {
  const base = siteBase(c);
  const f = await loadFees(c);
  const posts = await publishedPosts(c.env.PLATFORM_DB, 30);
  const lines = [
    `# ${PLATFORM_NAME}`, "",
    `> বাংলাদেশের ফেসবুক ও অনলাইন সেলারদের জন্য ই-কমার্স ওয়েবসাইট প্ল্যাটফর্ম (SaaS): কোড ছাড়া নিজের অনলাইন দোকান, ল্যান্ডিং পেজ, ফেক অর্ডার আটকানো, Steadfast/Pathao/RedX কুরিয়ার, Facebook Pixel + Conversions API। ফ্রি প্ল্যান আছে; পেইড প্ল্যান মাসে ৳${f.plans.small.price} থেকে।`, "",
    "## মূল পেজ",
    `- [দাম ও প্ল্যান](${base}/pricing)`, `- [দোকান খুলুন](${base}/signup)`, `- [হেল্প সেন্টার](${base}/help)`, `- [আমাদের সম্পর্কে](${base}/about)`, `- [যোগাযোগ](${base}/contact)`, "",
    "## গাইড", ...HELP.map((h) => `- [${h.title}](${base}/help/${h.slug}): ${h.summary}`), "",
    ...(posts.length ? ["## ব্লগ", ...posts.map((p) => `- [${p.title}](${base}/blog/${p.slug}): ${p.meta_description || p.excerpt}`)] : []),
  ];
  return c.text(lines.join("\n") + "\n", 200, { "Cache-Control": "public, max-age=3600" });
});

platformApp.get("/robots.txt", (c) => c.text(`User-agent: *\nDisallow: /super\nDisallow: /admin\nDisallow: /help?q=\nSitemap: https://${c.env.PLATFORM_DOMAIN}/sitemap.xml\n`, 200, { "Cache-Control": "public, max-age=3600" }));
platformApp.get("/sitemap.xml", async (c) => {
  const base = `https://${c.env.PLATFORM_DOMAIN}`;
  const fixed = ["/", "/pricing", "/signup", "/about", "/contact", "/help", "/blog", "/terms", "/privacy", "/refund", ...HELP.map((h) => `/help/${h.slug}`)];
  const posts = await publishedPosts(c.env.PLATFORM_DB, 500);
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const urls = [...fixed.map((p) => `<url><loc>${esc(base + p)}</loc></url>`), ...posts.map((p) => `<url><loc>${esc(`${base}/blog/${p.slug}`)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod></url>`)];
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, 200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
});

platformApp.get("/help/:slug{[a-z0-9-]+}", (c) => {
  const a = helpBySlug(c.req.param("slug"));
  if (!a) return publicPage(c, "পাওয়া যায়নি", () => <PlatformNotFoundPage />, 404);
  const path = `/help/${a.slug}`;
  return publicPage(c, a.title, () => <HelpArticlePage a={a} />, 200, {
    description: `${a.summary} — SellxBD হেল্প সেন্টার, ধাপে ধাপে বাংলায়।`, path,
    crumbs: [["হেল্প সেন্টার", "/help"], [a.title, path]],
  });
});

async function demoLinks(c: PCtx) {
  const { results } = await c.env.PLATFORM_DB.prepare("SELECT slug, demo_niche FROM shops WHERE demo_niche IS NOT NULL AND status = 'active'").all<{ slug: string; demo_niche: string }>();
  return results.flatMap((r) => {
    const n = nicheByKey(r.demo_niche);
    return n ? [{ key: n.key, niche: n.niche, name: n.name, url: shopUrl(c.env, r.slug) }] : [];
  });
}

platformApp.get("/", async (c) => {
  const fees = await loadFees(c);
  const base = siteBase(c);
  const P = fees.plans;
  const org = {
    "@context": "https://schema.org", "@type": "Organization", "@id": `${base}/#org`, name: PLATFORM_NAME, url: base,
    logo: `${base}/brand/icon-512.png`, image: `${base}/brand/og.jpg`,
    description: homeDesc(fees), areaServed: "BD",
    ...(fees.support ? { contactPoint: { "@type": "ContactPoint", telephone: `+88${fees.support}`, contactType: "customer support", areaServed: "BD", availableLanguage: ["bn", "en"] } } : {}),
  };
  const site = { "@context": "https://schema.org", "@type": "WebSite", "@id": `${base}/#site`, name: PLATFORM_NAME, alternateName: ["Sellx BD", "সেলএক্সবিডি"], url: base, inLanguage: "bn-BD", publisher: { "@id": `${base}/#org` } };
  const app = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: PLATFORM_NAME, url: base,
    applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "bn-BD", description: homeDesc(fees),
    publisher: { "@id": `${base}/#org` },
    offers: (["free", "small", "grow", "big"] as const).map((k) => ({ "@type": "Offer", name: P[k].name, price: String(P[k].price), priceCurrency: "BDT", url: `${base}/pricing` })),
  };
  const posts = (await publishedPosts(c.env.PLATFORM_DB, 3)).map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt }));
  return html(c, <PLayout title={`ফ্রিতে ই-কমার্স ওয়েবসাইট বানান — ফেসবুক সেলারদের অনলাইন দোকান | ${PLATFORM_NAME}`} nav={publicNav}
    description={homeDesc(fees)}
    seo={{ canonical: `${base}/`, jsonLd: [org, site, app], site: await siteTags(c) }}
    head={<link rel="stylesheet" href={`/css/home.css?v=${ASSET_VERSION}`} />}><HomePage devMode={c.env.DEV_MODE === "1"} fees={fees} demos={await demoLinks(c)} posts={posts} /></PLayout>, 200, true);
});

/* ---------- সাইনআপ ---------- */
platformApp.get("/signup", async (c) => {
  const niche = nicheByKey(c.req.query("niche"))?.key ?? "";
  return html(c, <PLayout title={`দোকান খুলুন, ১ মাস ফ্রি — ${PLATFORM_NAME}`} nav={publicNav}
    description="২ মিনিটে নিজের অনলাইন দোকান খুলুন — কোনো কোড বা কার্ড লাগবে না। রেডি দোকান, ফেক অর্ডার আটকানো, কুরিয়ার আর Pixel সব সাথেই। ১ মাস ফ্রি।"
    seo={{ canonical: canon(c, "/signup"), jsonLd: [crumbs(c, [["দোকান খুলুন", "/signup"]])], site: await siteTags(c) }}>
    <SignupPage domain={c.env.PLATFORM_DOMAIN} values={niche ? { niche } : undefined} {...await signupGuardProps(c)} /></PLayout>);
});

/**
 * ব্রাউজারের Pixel ইভেন্টের সার্ভার কপি (Conversions API) — একই event_id, তাই Facebook একবার গোনে।
 * শুধু মূল সাইটের পাবলিক ইভেন্ট; দোকান খোলা আর রিচার্জের ইভেন্ট সার্ভার নিজেই পাঠায়।
 */
platformApp.post("/px", async (c) => {
  const ps = await platformSettings(c.env.PLATFORM_DB);
  if (!pxReady(ps)) return c.body(null, 204);
  let b: { n?: unknown; id?: unknown; p?: unknown; u?: unknown } = {};
  try { b = JSON.parse((await c.req.text()).slice(0, 4000)); } catch { return c.body(null, 204); }
  const name = typeof b.n === "string" ? b.n : "";
  if (!BROWSER_EVENTS.has(name) || !okEventId(b.id)) return c.body(null, 204);
  let url = `https://${c.env.PLATFORM_DOMAIN}/`;
  try { const u = new URL(String(b.u)); if (u.hostname === c.env.PLATFORM_DOMAIN || u.hostname.endsWith(`.${c.env.PLATFORM_DOMAIN}`)) url = u.href.slice(0, 500); } catch {}
  if (!(await platformRateLimit(c.env, `px:${clientIp(c)}`, 120, 3600))) return c.body(null, 204);
  const custom: Record<string, unknown> = {};
  if (b.p && typeof b.p === "object") for (const [k, v] of Object.entries(b.p as Record<string, unknown>)) if (/^content_(name|category)$/.test(k) && typeof v === "string") custom[k] = v.slice(0, 60);
  const ck = c.req.header("cookie");
  pxLater(c.executionCtx, ps, [{ name, id: b.id as string, url, custom: Object.keys(custom).length ? custom : undefined,
    user: { ip: clientIp(c), ua: c.req.header("user-agent") || null, fbp: cookieVal(ck, "_fbp"), fbc: fbcFrom(cookieVal(ck, "_fbc"), url) } }]);
  return c.body(null, 204);
});

/** লাইভ চেক: ঠিকানাটি খালি আছে কি না */
platformApp.get("/signup/check", async (c) => {
  const slug = (c.req.query("slug") || "").trim().toLowerCase();
  const err = validateSlug(slug);
  if (err) return c.json({ ok: false, message: err });
  if (await slugTaken(c.env, slug)) return c.json({ ok: false, message: "এই ঠিকানা আগেই নেওয়া হয়েছে" });
  return c.json({ ok: true, message: `${slug}.${c.env.PLATFORM_DOMAIN} খালি আছে ✓` });
});

/** সাইনআপ পেজে Turnstile আর কোন যাচাই লাগবে */
async function signupGuardProps(c: PCtx) {
  const ps = await platformSettings(c.env.PLATFORM_DB);
  return { turnstile: turnstileKeys(ps)?.site, verify: verifyNeeds(c.env, ps) };
}

platformApp.post("/signup", async (c) => {
  const b = await c.req.parseBody();
  const values: Record<string, string> = {
    shop_name: str(b.shop_name, 60),
    slug: str(b.slug, 30).toLowerCase(),
    owner_name: str(b.owner_name, 60),
    phone: str(b.phone, 30),
    email: str(b.email, 120).toLowerCase(),
    seed_demo: b.seed_demo ? "1" : "0",
    niche: nicheByKey(str(b.niche, 30))?.key ?? "",
  };
  const password = typeof b.password === "string" ? b.password : "";
  const guard = await signupGuardProps(c);
  const tags = await siteTags(c);
  const fail = (errors: Record<string, string>, alert?: string, status: 422 | 429 = 422, existing?: { login: string; forgot: string; site: string; by: string }) =>
    html(c, <PLayout title="দোকান খুলুন" nav={publicNav} seo={{ noindex: true, site: tags }}><SignupPage domain={c.env.PLATFORM_DOMAIN} values={values} errors={errors} alert={alert} existing={existing} {...guard} /></PLayout>, status);

  if (!(await platformRateLimit(c.env, `signup:${clientIp(c)}`, 5, 3600))) {
    return fail({}, "এক ঘণ্টায় অনেকবার চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।", 429);
  }

  const errors: Record<string, string> = {};
  if (values.shop_name!.length < 2) errors.shop_name = "দোকানের নাম লিখুন";
  else if (badShopName(values.shop_name!)) errors.shop_name = "দোকানের নামে লিংক, ইমেইল বা ফোন নম্বর দেওয়া যাবে না";
  const slugErr = validateSlug(values.slug!);
  if (slugErr) errors.slug = slugErr;
  else if (await slugTaken(c.env, values.slug!)) errors.slug = "এই ঠিকানা আগেই নেওয়া হয়েছে";
  if (values.owner_name!.length < 2) errors.owner_name = "আপনার নাম লিখুন";
  const phone = normalizePhone(values.phone);
  if (!phone) errors.phone = "সঠিক মোবাইল নম্বর লিখুন";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email!)) errors.email = "সঠিক ইমেইল লিখুন";
  if (password.length < 8) errors.password = "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে";
  const ps = await platformSettings(c.env.PLATFORM_DB);
  const ts = turnstileKeys(ps);
  if (ts && !(await checkTurnstile(ts.secret, str(b["cf-turnstile-response"], 4000), clientIp(c)))) {
    errors.turnstile = "আপনি মানুষ কিনা যাচাই হয়নি — বক্সটায় টিক দিয়ে আবার চেষ্টা করুন";
  }
  if (Object.keys(errors).length) return fail(errors);

  // এক মোবাইল নম্বর বা এক ইমেইলে একটাই দোকান (মোঃ, ২৬ নভেম্বর) — মিললে নতুন দোকান নয়, আগের দোকানে লগইন/পাসওয়ার্ড রিসেট
  const dup = await c.env.PLATFORM_DB.prepare(
    `SELECT slug, owner_phone, lower(owner_email) AS email FROM shops
     WHERE deleted_at IS NULL AND demo_niche IS NULL AND (owner_phone = ? OR lower(owner_email) = ?) ORDER BY created_at LIMIT 1`,
  ).bind(phone, values.email).first<{ slug: string; owner_phone: string | null; email: string | null }>();
  if (dup) {
    const byPhone = dup.owner_phone === phone;
    const byEmail = dup.email === values.email;
    const dupErr: Record<string, string> = {};
    if (byPhone) dupErr.phone = "এই মোবাইল নম্বর দিয়ে আগেই একটা দোকান খোলা আছে";
    if (byEmail) dupErr.email = "এই ইমেইল দিয়ে আগেই একটা দোকান খোলা আছে";
    return fail(dupErr, undefined, 422, {
      site: `${dup.slug}.${c.env.PLATFORM_DOMAIN}`,
      login: shopUrl(c.env, dup.slug, "/admin/login"),
      forgot: shopUrl(c.env, dup.slug, "/admin/forgot"),
      by: byPhone && byEmail ? "এই মোবাইল নম্বর আর ইমেইল" : byPhone ? "এই মোবাইল নম্বর" : "এই ইমেইল",
    });
  }

  const id = crypto.randomUUID();
  const needs = verifyNeeds(c.env, ps);
  const risk = await riskFlags(c.env, { shop_name: values.shop_name!, slug: values.slug!, email: values.email!, phone: phone!, ip: clientIp(c) });
  try {
    await c.env.PLATFORM_DB.prepare(
      `INSERT INTO shops (id, slug, name, owner_name, owner_phone, owner_email, status, trial_ends_at, trial_orders_left, niche, plan, usage_reset_at,
         email_verified, phone_verified, signup_ip, risk)
       VALUES (?, ?, ?, ?, ?, ?, 'trial', datetime('now', '+' || ? || ' days'), ?, ?, ?, datetime('now', '+1 month'), ?, ?, ?, ?)`,
    ).bind(id, values.slug, values.shop_name, values.owner_name, phone, values.email, num(ps, "trial_days", 30), num(ps, "trial_orders", 400), values.niche || null, TRIAL_PLAN,
      needs.email ? 0 : 1, needs.phone ? 0 : 1, clientIp(c) || null, risk.join(",") || null).run();
  } catch {
    return fail({ slug: "এই ঠিকানা আগেই নেওয়া হয়েছে" });
  }

  // দোকানের নিজস্ব ডাটাবেস সাজানো + মালিকের লগইন
  const token = await c.env.SHOP.getByName(id).setupShop({
    shopId: id,
    shopName: values.shop_name!,
    ownerName: values.owner_name!,
    ownerEmail: values.email!,
    ownerPhone: phone!,
    passwordHash: await hashPassword(password),
    seedDemo: values.seed_demo === "1",
    niche: values.niche || undefined,
  });
  // নিশের নমুনা পণ্যে ডেমোর ছবি — কপি নয়, সব দোকান এক জায়গার ছবি দেখায় (দোকানের জায়গায় গোনা হয় না)
  if (values.niche && values.seed_demo === "1") {
    try {
      await c.env.SHOP.getByName(id).useSharedNicheImages(id, values.niche);
    } catch (err) { console.error("niche images", err); }
  }
  clearShopCache();
  // ইমেইল যাচাইয়ের লিংক সাথে সাথে (ফোনের কোড দোকানদার নিজে চাইলে — SMS-এর খরচ বাঁচে)
  if (needs.email) c.executionCtx.waitUntil(sendEmailLink(c.env, id, shopUrl(c.env, values.slug!, "")).catch((e) => console.error("signup email", e)));
  const to = shopUrl(c.env, values.slug!, `/admin/auto-login?t=${token}`);
  // SellxBD-এর নিজের অ্যাড: StartTrial (সার্ভার + ব্রাউজার, একই event_id)
  if (pxId(ps)) {
    const ck = c.req.header("cookie");
    const src = c.req.header("referer") || `https://${c.env.PLATFORM_DOMAIN}/signup`;
    const ad: AdClick = { fbp: cookieVal(ck, "_fbp") ?? undefined, fbc: fbcFrom(cookieVal(ck, "_fbc"), src) ?? undefined, ua: (c.req.header("user-agent") || "").slice(0, 400) || undefined, ip: clientIp(c) || undefined, url: src.slice(0, 300) };
    await c.env.PLATFORM_DB.prepare("UPDATE shops SET ad_click = ? WHERE id = ?").bind(JSON.stringify(ad), id).run().catch(() => {});
    const params = { content_name: values.niche || "shop", status: "trial", currency: "BDT", value: 0 };
    // CompleteRegistration এখানে নয় — সুপার অ্যাডমিন ফোনে কথা বলে মোবাইল যাচাই করলে তবেই (ভুয়া সাইনআপ Facebook-এ যায় না)
    const evs = [{ name: "StartTrial", id: newPxId("trial"), params: { ...params, predicted_ltv: 0 } }];
    pxLater(c.executionCtx, ps, evs.map((e) => ({ name: e.name, id: e.id, url: src, custom: e.params,
      user: { ip: ad.ip, ua: ad.ua, fbp: ad.fbp, fbc: ad.fbc, phone, email: values.email, externalId: id } })));
    return c.html(pxSignupDonePage(pxId(ps), id, evs, to));
  }
  return c.redirect(to, 303);
});

/* ---------- সুপার অ্যাডমিন ---------- */
const SUPER_FAIL_MAX = 8;
platformApp.get("/super/login", (c) => html(c, <PLayout title="সুপার অ্যাডমিন" admin><SuperLoginPage /></PLayout>));

platformApp.post("/super/login", async (c) => {
  const b = await c.req.parseBody();
  const email = str(b.email, 120).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const fail = (msg: string) => html(c, <PLayout title="সুপার অ্যাডমিন" admin><SuperLoginPage error={msg} email={email} /></PLayout>, 422);
  if (!(await platformRateLimit(c.env, `superlogin:${clientIp(c)}`, 10, 900))) return fail("অনেকবার চেষ্টা হয়েছে, ১৫ মিনিট পরে চেষ্টা করুন");
  // অ্যাকাউন্ট ধরে ভুল চেষ্টার সীমা (অনেক IP থেকে চেষ্টাও আটকায়): ১৫ মিনিটে ৮টা ভুল
  if ((await platformPeekRateLimit(c.env, `superfail:${email}`, 900)) >= SUPER_FAIL_MAX) return fail("এই অ্যাকাউন্টে অনেকবার ভুল পাসওয়ার্ড — ১৫ মিনিট পরে চেষ্টা করুন");
  const admin = await c.env.PLATFORM_DB.prepare("SELECT id, password_hash FROM super_admins WHERE email = ? AND active = 1").bind(email).first<{ id: number; password_hash: string }>();
  if (!admin || !(await verifyPassword(password, admin.password_hash))) {
    if (email) await platformRateLimit(c.env, `superfail:${email}`, SUPER_FAIL_MAX, 900);
    return fail("ইমেইল বা পাসওয়ার্ড ভুল");
  }
  if (needsRehash(admin.password_hash)) {
    await c.env.PLATFORM_DB.prepare("UPDATE super_admins SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), admin.id).run();
  }
  await c.env.PLATFORM_DB.batch([
    c.env.PLATFORM_DB.prepare("UPDATE super_admins SET last_login_at = datetime('now') WHERE id = ?").bind(admin.id),
    c.env.PLATFORM_DB.prepare("INSERT INTO audit_log (admin_id, admin_email, action, ip) VALUES (?, ?, 'login', ?)").bind(admin.id, email, clientIp(c)),
  ]);
  writeSession(c, SUPER_COOKIES, await createSuperSession(c.env, admin.id));
  return c.redirect("/super", 303);
});

platformApp.post("/super/logout", async (c) => {
  await destroySuperSession(c.env, readSession(c, SUPER_COOKIES).token);
  clearSession(c, SUPER_COOKIES);
  return c.redirect("/super/login", 303);
});

/**
 * প্রথম সুপার অ্যাডমিন: কেউ না থাকলে, আর platform_settings-এ রাখা এককালীন setup কোড মিললে।
 * কাজ শেষে কোড মুছে যায়।
 */
async function setupAllowed(c: PCtx, code: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{24,}$/.test(code)) return false;
  const db = c.env.PLATFORM_DB;
  const [admins, row] = await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM super_admins").first<{ n: number }>(),
    db.prepare("SELECT value FROM platform_settings WHERE key = 'super_setup_code'").first<{ value: string }>(),
  ]);
  return (admins?.n ?? 0) === 0 && !!row?.value && row.value === code;
}

platformApp.get("/super/setup", async (c) => {
  const code = c.req.query("code") || "";
  if (!(await setupAllowed(c, code))) return c.redirect("/super/login", 303);
  return html(c, <PLayout title="সুপার অ্যাডমিন তৈরি" admin><SuperSetupPage code={code} /></PLayout>);
});

platformApp.post("/super/setup", async (c) => {
  const b = await c.req.parseBody();
  const code = str(b.code, 100);
  if (!(await platformRateLimit(c.env, `supersetup:${clientIp(c)}`, 10, 900)) || !(await setupAllowed(c, code))) return c.redirect("/super/login", 303);
  const email = str(b.email, 120).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const fail = (msg: string) => html(c, <PLayout title="সুপার অ্যাডমিন তৈরি" admin><SuperSetupPage code={code} error={msg} email={email} /></PLayout>, 422);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("সঠিক ইমেইল দিন");
  if (password.length < 10) return fail("পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের দিন");
  if (password !== b.password2) return fail("দুটো পাসওয়ার্ড মেলেনি");
  const db = c.env.PLATFORM_DB;
  await db.batch([
    db.prepare("INSERT INTO super_admins (email, password_hash) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM super_admins)").bind(email, await hashPassword(password)),
    db.prepare("DELETE FROM platform_settings WHERE key = 'super_setup_code'"),
  ]);
  return c.redirect("/super/login", 303);
});

/* সাইটের ভিজিটর লাইভ চ্যাট (/chat/*) */
registerVisitorChat(platformApp);

/* লগইনের পরের সব সুপার অ্যাডমিন পেজ */
platformApp.route("/super", superApp);

export const unknownHostPage = () =>
  new Response(
    `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>দোকান পাওয়া যায়নি</title><link rel="stylesheet" href="/css/app.css?v=95"></head>
<body><main class="wrap narrow empty"><h1>এই ঠিকানায় কোনো দোকান নেই</h1><p class="muted">ঠিকানাটি আবার দেখুন।</p></main></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
