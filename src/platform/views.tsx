import { cyclePrice, storageLabel, type Plan, type PlanKey } from "./plans";
import type { Child } from "hono/jsx";
import { NICHES } from "../shop/lib/niches";
import { ASSET_VERSION } from "../shop/views/layout";
import { bn, dhakaTime, taka } from "../shop/lib/format";

export const PLATFORM_NAME = "SellxBD";
import { SiteFooter } from "./pages";
import { HELP } from "./help";
import { Icon, type IconName } from "../shop/views/icons";
import { raw } from "hono/html";

export type PFlash = { type: "ok" | "error"; text: string } | null;

export const DEFAULT_DESC = "ফেসবুক সেলারদের নিজের অনলাইন দোকান — ফেক অর্ডার আটকানো, রেডি দোকান, ল্যান্ডিং পেজ, Pixel + CAPI, Steadfast/Pathao/RedX এক ক্লিকে, ইনভয়েস, SMS আর ২৪ ঘণ্টা সাপোর্ট। ফ্রি প্ল্যান চিরকাল।";

/** JSON-LD নিরাপদে বসানো (</script> ভাঙতে না পারে) */
const ld = (o: unknown) => raw(`<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`);

export type PSeo = {
  /** পুরো ঠিকানা, যেমন https://sellxbd.com/pricing */
  canonical?: string;
  /** সার্চ থেকে বাদ (লগইন, সুপার অ্যাডমিন) */
  noindex?: boolean;
  ogType?: "website" | "article";
  /** পুরো ঠিকানা; না দিলে সাধারণ ছবি */
  image?: string;
  jsonLd?: unknown[];
  /** Search Console / Bing যাচাইয়ের কোড আর GA4 আইডি (শুধু পাবলিক পেজে) */
  site?: { gsc?: string; bing?: string; ga4?: string };
};

/** সেটিংসে মেটা ট্যাগ পুরোটা পেস্ট করলেও শুধু কোডটা নেওয়া */
export const verifyCode = (v: string) => { const m = /content=["']([^"']+)["']/.exec(v); return (m ? m[1]! : v).trim(); };
export const okVerify = (v: string) => /^[A-Za-z0-9_\-]{10,100}$/.test(v);
export const okGa4 = (v: string) => /^G-[A-Z0-9]{4,15}$/.test(v);

export const PLayout = (p: { title: string; children?: Child; nav?: Child; flash?: PFlash; admin?: boolean; description?: string; head?: Child; seo?: PSeo }) => {
  const desc = p.description || DEFAULT_DESC;
  const seo = p.seo ?? {};
  const origin = seo.canonical ? new URL(seo.canonical).origin : "";
  const image = seo.image || (origin ? `${origin}/brand/og.jpg` : "/brand/og.jpg");
  return (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{p.title}</title>
      <meta name="description" content={desc} />
      {(p.admin || seo.noindex) && <meta name="robots" content="noindex, nofollow" />}
      {seo.canonical && <link rel="canonical" href={seo.canonical} />}
      {!p.admin && seo.site?.gsc && okVerify(seo.site.gsc) && <meta name="google-site-verification" content={seo.site.gsc} />}
      {!p.admin && seo.site?.bing && okVerify(seo.site.bing) && <meta name="msvalidate.01" content={seo.site.bing} />}
      {!p.admin && seo.site?.ga4 && okGa4(seo.site.ga4) && <>
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${seo.site.ga4}`}></script>
        {raw(`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${seo.site.ga4}");</script>`)}
      </>}
      {!p.admin && <link rel="alternate" type="application/rss+xml" title={`${PLATFORM_NAME} ব্লগ`} href="/blog/feed.xml" />}
      <meta name="theme-color" content="#0f766e" />
      {/* Google: ICO/PNG সমর্থিত (SVG নয়), ৪৮px-এর বড় ভালো */}
      <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48 64x64" />
      <link rel="icon" href="/brand/favicon-96.png" type="image/png" sizes="96x96" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/site.webmanifest" />
      {!p.admin && <>
        <meta property="og:site_name" content={PLATFORM_NAME} />
        <meta property="og:locale" content="bn_BD" />
        <meta property="og:type" content={seo.ogType || "website"} />
        <meta property="og:title" content={p.title} />
        <meta property="og:description" content={desc} />
        {seo.canonical && <meta property="og:url" content={seo.canonical} />}
        <meta property="og:image" content={image} />
        {!seo.image && <><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /></>}
        <meta property="og:image:alt" content={`${PLATFORM_NAME} — ফেসবুক সেলারদের নিজের অনলাইন দোকান`} />
        <meta name="twitter:card" content="summary_large_image" />
      </>}
      <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/admin.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/platform.css?v=${ASSET_VERSION}`} />
      {p.head}
      {(seo.jsonLd ?? []).map(ld)}
    </head>
    <body class={p.admin ? "admin" : "platform"}>
      <header class={p.admin ? "admin-header" : "p-header"}>
        <div class="wrap admin-header-inner">
          {p.admin
            ? <a href="/super" class="logo">{PLATFORM_NAME} সুপার অ্যাডমিন</a>
            : <a href="/" class="logo p-logo" aria-label={PLATFORM_NAME}><BrandMark /><BrandName /></a>}
          <nav class="admin-nav">{p.nav}</nav>
        </div>
      </header>
      <main class={p.admin ? "wrap admin-main" : ""}>
        {p.flash && <div class="wrap"><div class={`alert ${p.flash.type === "ok" ? "alert-ok" : "alert-error"}`}>{p.flash.text}</div></div>}
        {p.children}
      </main>
      <script src={`/js/admin.js?v=${ASSET_VERSION}`} defer></script>
    </body>
  </html>
  );
};

/* ---------- হোম (মার্কেটিং) — বাংলাদেশের ফেসবুক সেলারদের জন্য ---------- */
type HomeFees = { plans: Record<PlanKey, Plan>; staff: number; trialDays: number; trialOrders: number; support: string };
type DemoLink = { key?: string; niche: string; name: string; url: string };

const Check = () => <span class="h-check" aria-hidden="true">✓</span>;
const Cross = () => <span class="h-cross" aria-hidden="true">✕</span>;

/** বিক্রির পুরো পথ — ট্যাবে ভাগ করা ফিচার। প্রতিটা: [আইকন, নাম, কোন সমস্যা, কীভাবে সমাধান]। নতুন ফিচার এলে এখানে যোগ করুন। */
const FEATURE_TABS: { key: string; icon: IconName; title: string; short: string; sub: string; hot?: boolean; items: [IconName, string, string, string][] }[] = [
  {
    key: "orders", icon: "shield-check", title: "অর্ডার আর ফেক আটকানো", short: "ফেক আটকানো", sub: "বাংলাদেশে অনলাইন বিক্রির সবচেয়ে বড় সমস্যা — আসল ক্রেতা, কম ফেরত", hot: true,
    items: [
      ["shield-check", "Facebook Purchase গার্ড", "ফেক অর্ডারকেও Facebook বিক্রি ধরে — ভুল লোককে অ্যাড দেখায়, খরচ বাড়ে", "অর্ডার এলে Purchase যায় না, অর্ডার \"নতুন\"-এ থাকে; আপনি কনফার্ম করলে তবেই Facebook-এ Purchase যায়। ফেক বা বাতিল অর্ডারের কখনো না — চালু/বন্ধ দোকানের সেটিংসে আপনার হাতে।"],
      ["shield-alert", "ফেক অর্ডার ব্লক", "ভুয়া নম্বরে অর্ডার, পার্সেল ফেরত", "ভুল নম্বর নেয় না, বারবার অর্ডার আটকায়; ফেক ধরলে নম্বর আর ডিভাইস ব্লক।"],
      ["users", "ক্রেতার রেকর্ড", "কে পার্সেল নেবে আর কে নেবে না, আগে জানা যায় না", "আগে কতবার নিয়েছে আর ফেরত দিয়েছে — সব SellxBD দোকান আর কুরিয়ারের রেকর্ড মিলিয়ে।"],
      ["hourglass", "অসম্পূর্ণ অর্ডার", "নম্বর লিখে অর্ডার না করেই চলে যায়", "সেই নম্বর তালিকায় আসে — কল বা WhatsApp করে এক ক্লিকে অর্ডার বানান।"],
      ["wallet", "অগ্রিম পেমেন্ট", "ঝুঁকির ক্রেতার কাছে পার্সেল পাঠানো জুয়া", "ডেলিভারি চার্জ বা পুরো টাকা bKash/Nagad/Rocket-এ অগ্রিম — শুধু যার কাছে দরকার।"],
      ["shopping-cart", "কার্ট আর চেকআউট", "একসাথে কয়েকটা পণ্য কিনতে ইনবক্সে লম্বা কথা", "কয়েকটা পণ্য একসাথে, পরিমাণ বদলানো, নিজের ঘর যোগ — কাস্টমার নিজেই অর্ডার করে।"],
      ["bell", "ফোনে অর্ডারের খবর", "নতুন অর্ডার এসে পড়ে থাকে, দেরিতে ফোন", "প্যানেল অ্যাপের মতো ফোনে বসান — অর্ডার এলেই নোটিফিকেশন।"],
    ],
  },
  {
    key: "build", icon: "store", title: "দোকান আর পেজ", short: "দোকান", sub: "কোড ছাড়াই সুন্দর দোকান আর অ্যাডের পেজ",
    items: [
      ["store", "রেডি দোকান", "ওয়েবসাইট বানাতে ডেভেলপার আর সপ্তাহের পর সপ্তাহ", "কী বিক্রি করেন বাছলেই ক্যাটাগরি, থিম, রং আর পলিসি পেজ সাজানো দোকান — ২ মিনিটে।"],
      ["palette", "থিম লাইভ এডিটর", "ডিজাইনে একটু বদলাতেও কাউকে টাকা দিতে হয়", "৪টা থিম, তৈরি রঙের জোড়া, সেকশন টেনে সাজানো — বদলাতেই দেখতে পান, ভুল হলে আগেরটায় ফিরুন।"],
      ["layout-template", "ল্যান্ডিং পেজ বিল্ডার", "অ্যাডের কাস্টমার দোকানে এসে হারিয়ে যায়", "এক পেজে পণ্যের সব কথা আর অর্ডার ফর্ম — ২০টা নিশ টেমপ্লেট থেকে কয়েক মিনিটে।"],
      ["sparkles", "AI দিয়ে লেখা", "পণ্যের বিবরণ লিখতে ঘণ্টার পর ঘণ্টা", "পণ্যের নাম দিলেই শিরোনাম, সুবিধা আর প্রশ্নোত্তর বাংলায় লিখে দেয়।"],
      ["star", "আসল ক্রেতার রিভিউ", "নতুন কাস্টমার পেজকে বিশ্বাস করে না", "শুধু যে কিনেছে সে-ই ছবিসহ রিভিউ দেয় — পণ্যের পাশে তারা দেখে ভরসা বাড়ে।"],
      ["file-text", "ব্লগ আর নিজের পেজ", "শুধু অ্যাড বন্ধ হলেই বিক্রি বন্ধ", "রিটার্ন পলিসি, আমাদের সম্পর্কে, ব্লগ — Google থেকেও ফ্রিতে কাস্টমার আসে।"],
    ],
  },
  {
    key: "ads", icon: "megaphone", title: "অ্যাড আর মার্কেটিং", short: "অ্যাড", sub: "অ্যাডের প্রতিটা টাকার হিসাব",
    items: [
      ["trending-up", "Pixel + Conversions API", "অ্যাড ব্লকার আর iPhone-এ Pixel অনেক ইভেন্ট হারায়", "ব্রাউজার আর সার্ভার — দুই দিক থেকে ইভেন্ট, একই event_id; Purchase গার্ডের সাথে মিলে Facebook আসল ক্রেতা চেনে।"],
      ["boxes", "ক্যাটালগ ফিড", "প্রতিটা পণ্য হাতে হাতে Facebook-এ তোলা", "সব পণ্য নিজে থেকে Facebook আর Google ক্যাটালগে — দাম বা স্টক বদলালে সেখানেও বদলায়।"],
      ["calculator", "অ্যাডের আসল খরচ", "কোন অ্যাডে লাভ আর কোনটায় লোকসান বোঝা যায় না", "প্রতি কনফার্ম অর্ডারে কত খরচ আর খরচের কত গুণ বিক্রি — পণ্য ধরে আলাদা।"],
      ["chart-line", "GA4, GTM, TikTok", "কোথা থেকে কাস্টমার আসছে অজানা", "Google Analytics, Tag Manager আর TikTok Pixel — শুধু ID বসালেই চালু।"],
      ["search", "Google-এর জন্য SEO", "Google-এ খুঁজলে দোকান পাওয়া যায় না", "প্রতিটা পণ্যের টাইটেল-বিবরণ, Google-এ কেমন দেখাবে তার প্রিভিউ, sitemap নিজে তৈরি।"],
      ["tag", "কুপন আর অফার", "উৎসবের অফার চালাতে ঝামেলা", "ঈদ অফার, % ছাড়, ফ্রি ডেলিভারি কুপন, কাটা দাম — এক মিনিটে চালু।"],
    ],
  },
  {
    key: "delivery", icon: "truck", title: "ডেলিভারি", short: "ডেলিভারি", sub: "অর্ডার থেকে পার্সেল — এক জায়গায়",
    items: [
      ["truck", "কুরিয়ারে এক ক্লিকে", "প্রতিটা ঠিকানা কুরিয়ার প্যানেলে কপি-পেস্ট", "Steadfast, Pathao, RedX — টিক দিয়ে একসাথে অনেক অর্ডার পাঠান, স্ট্যাটাস নিজে আসে।"],
      ["map-pin", "ঢাকার ভিতরে-বাইরে চার্জ", "প্রতিবার কাস্টমারকে চার্জ হিসাব করে বলা", "দুই এলাকার আলাদা চার্জ, নির্দিষ্ট টাকার বেশি কিনলে ফ্রি ডেলিভারি — নিজে থেকে যোগ হয়।"],
      ["printer", "ইনভয়েস আর স্টিকার", "হাতে লেখা ইনভয়েস, ভুল ঠিকানা", "লোগোসহ ইনভয়েস আর বারকোডসহ পার্সেল স্টিকার — একসাথে অনেকগুলো প্রিন্ট।"],
      ["message-square", "অটো SMS", "কাস্টমার জানে না অর্ডার কনফার্ম হলো কি না", "কনফার্ম আর পার্সেল পাঠানোর সাথে সাথে কাস্টমারকে SMS যায়।"],
      ["message-circle", "WhatsApp মেসেজ", "প্রতিটা কাস্টমারকে একই কথা টাইপ করা", "কনফার্ম, পাঠানো হয়েছে, রিভিউ চাওয়া — লেখা তৈরি, এক চাপে পাঠান।"],
      ["package", "কাস্টমারের ট্র্যাকিং", "\"আমার পার্সেল কোথায়?\" — সারাদিন ফোন", "মোবাইল নম্বর দিয়ে কাস্টমার নিজেই দেখে অর্ডার কোথায় আছে।"],
    ],
  },
  {
    key: "money", icon: "chart-column", title: "হিসাব আর নিয়ন্ত্রণ", short: "হিসাব", sub: "মালিকের হাতে পুরো ব্যবসা",
    items: [
      ["boxes", "স্টক আর ইনভেন্টরি", "যে মাল নেই সেটাও অর্ডার আসে", "কনফার্মে কমে, ফেরতে ফেরে, শেষ হলে দোকানে \"স্টক নেই\" — কম থাকলে আগেই সতর্ক।"],
      ["wallet", "আসল লাভের হিসাব", "বিক্রি অনেক, কিন্তু মাস শেষে টাকা কোথায়?", "মালের দাম, কুরিয়ার, ফেরত, COD আর অ্যাড খরচ বাদ দিয়ে নিট লাভ — পণ্য ধরে।"],
      ["layout-dashboard", "ড্যাশবোর্ড আর রিপোর্ট", "খাতা আর এক্সেলে হিসাব মেলানো", "আজ, সপ্তাহ, মাসে কত অর্ডার, কত কনফার্ম, কোন পণ্য বেশি চলছে — চার্টসহ।"],
      ["users", "স্টাফ আর অনুমতি", "স্টাফকে পাসওয়ার্ড দিলে সব দেখে ফেলে", "ম্যানেজার আর অর্ডার স্টাফ — কে কী দেখবে আর করবে, আপনি ঠিক করবেন।"],
      ["globe", "নিজের ডোমেইন", "ফেসবুক পেজ দেখে ক্রেতা ব্র্যান্ডকে ছোট ভাবে", "yourshop.com — নিজের নামে দোকান, সবখানে https। না থাকলে ফ্রি subdomain।"],
      ["download", "নিরাপদ ডাটা", "তথ্য হারানোর ভয়", "পণ্য, অর্ডার আর কাস্টমার নিরাপদে রাখা — দরকার হলে সাপোর্ট থেকে Excel কপি।"],
    ],
  },
];

/** সমস্যা → সমাধান → ফল */
const PAINS: { ic: IconName; pain: string; fix: string; win: string }[] = [
  { ic: "shield-check", pain: "পার্সেল পাঠালেন, কাস্টমার ফোন ধরে না — ডেলিভারি চার্জ আর প্যাকেজিং গচ্চা।", fix: "পাঠানোর আগে ক্রেতার রেকর্ড দেখুন, ঝুঁকি থাকলে অগ্রিম নিন। ফেক নম্বর নিজে থেকে আটকায়।", win: "ফেরত পার্সেল কমে" },
  { ic: "trending-up", pain: "অ্যাডে টাকা বাড়ছে, কিন্তু আসল বিক্রি বাড়ছে না।", fix: "Facebook-এ Purchase যায় শুধু কনফার্ম অর্ডারে — আসল ক্রেতা খোঁজে। প্রতি অর্ডারে খরচ চোখের সামনে।", win: "অ্যাডের খরচ কমে" },
  { ic: "smartphone", pain: "ইনবক্সে \"দাম কত?\" — উত্তর দিতে দেরি, কাস্টমার অন্য পেজে চলে যায়।", fix: "লিংকেই দাম, ছবি, রিভিউ আর অর্ডার ফর্ম — কাস্টমার নিজেই অর্ডার করে।", win: "রাত ৩টাতেও অর্ডার" },
  { ic: "truck", pain: "প্রতিটা অর্ডারের ঠিকানা কুরিয়ার প্যানেলে কপি-পেস্ট, ইনভয়েস হাতে লেখা।", fix: "টিক দিয়ে একসাথে কুরিয়ারে পাঠান, ইনভয়েস আর স্টিকার এক ক্লিকে প্রিন্ট।", win: "ঘণ্টার কাজ মিনিটে" },
  { ic: "boxes", pain: "যে মাল শেষ, সেটারও অর্ডার আসে — পরে কাস্টমারকে না বলতে হয়।", fix: "কনফার্মে স্টক কমে, ফেরতে ফেরে, শেষ হলে দোকানে নিজে থেকে \"স্টক নেই\"।", win: "স্টক সবসময় মিলে" },
  { ic: "calculator", pain: "খাতা, এক্সেল, কুরিয়ার প্যানেল — মাস শেষে লাভ কত বোঝা যায় না।", fix: "অর্ডার, স্টক, কুরিয়ার, অ্যাড খরচ এক জায়গায় — নিট লাভ নিজে থেকে হিসাব হয়।", win: "আসল লাভ স্পষ্ট" },
];

/** লোগো — শপিং ব্যাগ চিহ্ন + SellxBD */
export const BrandMark = ({ size = 30 }: { size?: number }) =>
  raw(`<svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14b8a6"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#bm)"/><path d="M9.5 12.5h13l-1 11a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8z" fill="#fff"/><path d="M12.5 12.5V11a3.5 3.5 0 0 1 7 0v1.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="23.5" cy="8.5" r="3.2" fill="#f97316" stroke="#fff" stroke-width="1.6"/></svg>`);
export const BrandName = () => <span class="brand-name">Sell<span class="brand-x">x</span>BD</span>;

export const HomePage = ({ devMode, fees: f, demos = [], posts = [] }: { devMode: boolean; fees: HomeFees; demos?: DemoLink[]; posts?: { slug: string; title: string; excerpt: string }[] }) => {
  const demoOf = (key: string, name: string) => demos.find((d) => d.key === key || d.name === name);
  const P = f.plans;
  return (
  <div class="home hp">
    {/* ===== হিরো ===== */}
    <section class="hp-hero">
      <div class="wrap hp-hero-grid">
        <div class="hp-hero-copy">
          <p class="hp-kicker"><span class="hp-dot"></span>ফেসবুক সেলারদের জন্য বাংলাদেশের অনলাইন দোকান</p>
          <h1>ফেক অর্ডারে আর টাকা নষ্ট নয়।<br /><span>নিজের ওয়েবসাইটে অর্ডার নিন।</span></h1>
          <p class="hp-lead">
            রেডি দোকান, অ্যাডের ল্যান্ডিং পেজ, ফেক আটকানো, কুরিয়ারে এক ক্লিক, স্টক আর লাভের হিসাব — দোকান চালানোর সব এক প্যানেলে, মোবাইল থেকেই।
          </p>
          <div class="hp-cta">
            <a href="/signup" class="btn btn-accent btn-lg">ফ্রিতে দোকান খুলুন <Icon name="arrow-right" /></a>
            <a href="#ready" class="btn hp-ghost btn-lg">রেডি দোকান দেখুন</a>
          </div>
          <ul class="hp-trust">
            <li><Icon name="check" size="sm" /> {bn(f.trialDays)} দিন সব ফিচার ফ্রি</li>
            <li><Icon name="check" size="sm" /> কার্ড লাগবে না</li>
            <li><Icon name="check" size="sm" /> ফ্রি প্ল্যান চিরকাল</li>
            <li><Icon name="check" size="sm" /> ২৪ ঘণ্টা বাংলায় সাপোর্ট</li>
          </ul>
          {devMode && <p><a href="/?shop=demoshop" class="btn hp-ghost">ডেমো দোকান (লোকাল)</a></p>}
        </div>

        {/* প্যানেল আর ফোন — শুধু HTML/CSS দিয়ে আঁকা */}
        <div class="hp-visual" aria-hidden="true">
          <div class="hp-panel">
            <div class="hp-panel-bar"><i></i><i></i><i></i><span>প্যানেল · আজ</span></div>
            <div class="hp-panel-kpis">
              <div><small>নতুন অর্ডার</small><b>৪৮</b><em class="up">▲ ১২%</em></div>
              <div><small>কনফার্ম</small><b>৪১</b><em class="up">৮৫%</em></div>
              <div><small>ফেক আটকানো</small><b>৬</b><em class="warn">৳৭২০ বাঁচল</em></div>
            </div>
            <div class="hp-panel-chart">{[38, 52, 44, 61, 57, 70, 66, 82, 74, 90].map((h) => <span style={`height:${h}%`}></span>)}</div>
            <div class="hp-panel-rows">
              <div><b>রুমানা আক্তার</b><span class="ok">✓৫ · ✕০</span><em>কনফার্ম</em></div>
              <div><b>নতুন ক্রেতা</b><span class="risk">✓০ · ✕৩</span><em class="hold">অগ্রিম চান</em></div>
            </div>
          </div>
          <div class="hp-phone">
            <div class="hp-ph-img"></div>
            <div class="hp-ph-t">হাতে বানানো কাঠের শেলফ</div>
            <div class="hp-ph-p"><b>৳১,২৫০</b> <s>৳১,৬৫০</s> <span>★ ৪.৯</span></div>
            <div class="hp-ph-f"></div><div class="hp-ph-f"></div>
            <div class="hp-ph-btn">অর্ডার করুন</div>
          </div>
          <div class="hp-float hp-f1"><Icon name="bell" size="sm" /> নতুন অর্ডার · মিরপুর</div>
          <div class="hp-float hp-f2"><Icon name="truck" size="sm" /> Steadfast-এ বুক হয়েছে</div>
        </div>
      </div>
    </section>

    {/* ===== যুক্ত আছে ===== */}
    <section class="hp-logos">
      <div class="wrap">
        <span>সাথেই যুক্ত</span>
        <ul>{["Steadfast", "Pathao", "RedX", "bKash", "Nagad", "Rocket", "Facebook Pixel", "Conversions API", "Google Analytics", "TikTok", "WhatsApp"].map((n) => <li>{n}</li>)}</ul>
      </div>
    </section>

    {/* ===== সংখ্যা ===== */}
    <section class="hp-numbers">
      <div class="wrap hp-numbers-grid">
        {[
          ["২ মিনিট", "দোকান চালু"], ["৬টা", "রেডি দোকান"], ["২০টা", "ল্যান্ডিং টেমপ্লেট"], ["৪টা", "থিম, লাইভ এডিটর"], ["২৪/৭", "বাংলায় সাপোর্ট"],
        ].map(([n, l]) => <div><b>{n}</b><span>{l}</span></div>)}
      </div>
    </section>

    {/* ===== সমস্যা → সমাধান ===== */}
    <section class="hp-sec" id="solve">
      <div class="wrap">
        <p class="hp-eyebrow">চেনা সমস্যা, সহজ সমাধান</p>
        <h2 class="hp-title">ফেসবুকে বিক্রির যে ঝামেলাগুলো আর থাকবে না</h2>
        <p class="hp-sub">প্রতিদিনের ৬টা বড় মাথাব্যথা — আর SellxBD কীভাবে সেগুলো মেটায়</p>
        <div class="hp-pains">
          {PAINS.map((x, i) => (
            <article class="hp-pain">
              <div class="hp-pain-top"><span class="hp-pain-n">{bn(i + 1)}</span><span class="hp-pain-win"><Icon name="circle-check-big" size="sm" /> {x.win}</span></div>
              <p class="hp-pain-q"><span class="hp-tag-bad">সমস্যা</span>{x.pain}</p>
              <div class="hp-pain-arrow" aria-hidden="true"><Icon name="arrow-right" size="sm" /></div>
              <p class="hp-pain-a"><span class="hp-ic"><Icon name={x.ic} /></span><span><span class="hp-tag-good">সমাধান</span>{x.fix}</span></p>
            </article>
          ))}
        </div>
      </div>
    </section>

    {/* ===== বিক্রির পুরো পথ (ট্যাব) ===== */}
    <section class="hp-sec hp-soft" id="features">
      <div class="wrap">
        <p class="hp-eyebrow">সব ফিচার, এক প্যানেলে</p>
        <h2 class="hp-title">দোকান বানানো থেকে লাভের হিসাব — পুরো পথ</h2>
        <p class="hp-sub">প্রতিটা ফিচার কোন সমস্যা মেটায়, পাশেই লেখা। আলাদা অ্যাপ বা ডেভেলপার লাগবে না — সব প্ল্যানে সব ফিচার।</p>
        <div class="hp-tabs" data-hp-tabs>
          <div class="hp-tablist" role="tablist">
            {FEATURE_TABS.map((t, i) => (
              <button type="button" role="tab" class={`${i === 0 ? "active" : ""}${t.hot ? " hot" : ""}`} data-hp-tab={t.key} aria-selected={i === 0 ? "true" : "false"}>
                <Icon name={t.icon} /> <span class="hp-tl-long">{t.title}</span><span class="hp-tl-short">{t.short}</span>{t.hot && <em class="hp-tab-hot">সবচেয়ে জরুরি</em>}
              </button>
            ))}
          </div>
          {FEATURE_TABS.map((t, i) => (
            <div class={`hp-panel-tab${t.hot ? " hot" : ""}`} data-hp-panel={t.key} role="tabpanel" data-first={i === 0 ? "1" : undefined}>
              {t.hot && <p class="hp-hot-note"><Icon name="shield-alert" /> <span><b>বাংলাদেশে অনলাইন বিক্রির সবচেয়ে বড় সমস্যা ফেক অর্ডার আর পার্সেল ফেরত।</b> তাই এই ভাগটা SellxBD-এর সবচেয়ে শক্তিশালী — অর্ডার আসার মুহূর্ত থেকে পার্সেল পাঠানো পর্যন্ত প্রতিটা ধাপে পাহারা।</span></p>}
              <h3 class="hp-tab-h"><Icon name={t.icon} /> {t.title} <small>{t.sub}</small></h3>
              <div class="hp-feats">
                {t.items.map(([ic, title, problem, d], j) => (
                  <div class={`hp-feat${t.hot && j === 0 ? " hp-feat-star" : ""}`}>
                    {t.hot && j === 0 && <span class="hp-star-badge"><Icon name="star" size="sm" /> ফেক অর্ডারের বিরুদ্ধে ১ নম্বর ঢাল</span>}
                    <span class="hp-ic"><Icon name={ic} /></span>
                    <div class="hp-feat-body">
                      <h4>{title}</h4>
                      <p class="hp-feat-problem"><Icon name="x" size="sm" /> {problem}</p>
                      <p class="hp-feat-fix"><Icon name="check" size="sm" /> {d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ===== স্পটলাইট ১: ফেক অর্ডার ===== */}
    <section class="hp-sec">
      <div class="wrap hp-spot">
        <div class="hp-spot-copy">
          <p class="hp-eyebrow">সবচেয়ে বড় পার্থক্য</p>
          <h2>পার্সেল পাঠানোর আগেই জানুন, কে নেবে আর কে নেবে না</h2>
          <ul class="hp-list">
            <li><Icon name="users" /> <span><b>ক্রেতার রেকর্ড:</b> সব SellxBD দোকান আর কুরিয়ারের ডেলিভারি মিলিয়ে — কতবার নিয়েছে, কতবার ফেরত। অন্য দোকানের নাম গোপন থাকে।</span></li>
            <li><Icon name="wallet" /> <span><b>অগ্রিম শুধু যেখানে দরকার:</b> ঝুঁকির ক্রেতা বা ঢাকার বাইরে হলে ডেলিভারি চার্জ অগ্রিম — TrxID দিয়ে যাচাই।</span></li>
            <li><Icon name="hourglass" /> <span><b>হারানো অর্ডার ফেরান:</b> ফর্ম অর্ধেক পূরণ করে চলে যাওয়া ক্রেতার নম্বর তালিকায় — এক ক্লিকে কল বা WhatsApp।</span></li>
            <li><Icon name="shield-alert" /> <span><b>ফেক চিহ্নিত করলেই ব্লক:</b> সেই নম্বর আর মোবাইল থেকে আর অর্ডার আসে না।</span></li>
          </ul>
        </div>
        <div class="hp-mock" aria-hidden="true">
          <div class="hp-mock-h"><b>অর্ডার</b><span>আজ · ১২টা নতুন</span></div>
          {([
            ["#১০৪২", "সাবরিনা ই.", "উত্তরা, ঢাকা", "✓৭ · ✕০", "ok", "নিরাপদ"],
            ["#১০৪১", "নতুন ক্রেতা", "কুমিল্লা", "✓০ · ✕০", "new", "প্রথম অর্ডার"],
            ["#১০৪০", "অজানা", "রাজশাহী", "✓১ · ✕৪", "risk", "অগ্রিম চান"],
            ["#১০৩৯", "আধা পূরণ", "০১৭•••৪৫৬", "অসম্পূর্ণ", "half", "কল করুন"],
          ] as string[][]).map(([no, n, a, rec, cls, act]) => (
            <div class={`hp-mrow ${cls}`}><span class="hp-mno">{no}</span><div><b>{n}</b><small>{a}</small></div><span class="hp-mrec">{rec}</span><em>{act}</em></div>
          ))}
        </div>
      </div>
    </section>

    {/* ===== স্পটলাইট ২: লাভ আর অ্যাড ===== */}
    <section class="hp-sec hp-soft">
      <div class="wrap hp-spot hp-spot-rev">
        <div class="hp-spot-copy">
          <p class="hp-eyebrow">আন্দাজ নয়, হিসাব</p>
          <h2>বিক্রি নয় — মাস শেষে আসল লাভ কত, সেটা দেখুন</h2>
          <ul class="hp-list">
            <li><Icon name="calculator" /> <span><b>নিট লাভ নিজে থেকে:</b> মালের দাম, কুরিয়ার, ফেরত পার্সেল, COD চার্জ আর অ্যাড খরচ বাদ দিয়ে — পণ্য ধরে।</span></li>
            <li><Icon name="trending-up" /> <span><b>অ্যাডের আসল ফল:</b> প্রতি কনফার্ম অর্ডারে কত খরচ, খরচের কত গুণ বিক্রি — কোন পণ্যের অ্যাড বন্ধ করবেন বুঝে যাবেন।</span></li>
            <li><Icon name="boxes" /> <span><b>স্টক মিলে থাকে:</b> কনফার্মে কমে, ফেরতে ফেরে — না থাকা মাল বিক্রি হয় না।</span></li>
          </ul>
        </div>
        <div class="hp-mock hp-profit" aria-hidden="true">
          <div class="hp-mock-h"><b>এই মাসের হিসাব</b><span>নভেম্বর</span></div>
          {([["বিক্রি (ডেলিভারি হয়েছে)", "৳১,৮৪,৫০০", ""], ["মালের দাম", "− ৳৯৮,২০০", "m"], ["কুরিয়ার ও COD চার্জ", "− ৳১৮,৯৬০", "m"], ["ফেরত পার্সেলের খরচ", "− ৳৩,১২০", "m"], ["ফেসবুক অ্যাড", "− ৳২৪,৬০০", "m"]] as string[][]).map(([l, v, c]) => (
            <div class="hp-prow"><span>{l}</span><b class={c}>{v}</b></div>
          ))}
          <div class="hp-prow hp-ptotal"><span>নিট লাভ</span><b>৳৩৯,৬২০</b></div>
          <div class="hp-pchips"><span>প্রতি অর্ডারে অ্যাড খরচ ৳৯৮</span><span>খরচের ৭.৫ গুণ বিক্রি</span></div>
        </div>
      </div>
    </section>

    {/* ===== রেডি দোকান ===== */}
    <section class="hp-sec" id="ready">
      <div class="wrap">
        <p class="hp-eyebrow">২ মিনিটে শুরু</p>
        <h2 class="hp-title">কী বিক্রি করেন? সাজানো দোকান নিন</h2>
        <p class="hp-sub">ক্যাটাগরি, থিম, রং, ডেলিভারি চার্জ আর পলিসি পেজ আগে থেকে সাজানো — শুধু নিজের পণ্য বসান</p>
        <p class="hp-swipe" aria-hidden="true"><Icon name="arrow-left" size="sm" /> সরিয়ে দেখুন <Icon name="arrow-right" size="sm" /></p>
        <div class="h-niches">
          {NICHES.map((n) => {
            const d = demoOf(n.key, n.name);
            return (
              <div class="h-niche" style={`--n1:${n.colors.primary};--n2:${n.colors.accent}`}>
                <div class="h-niche-img"><img src={`/img/home/${n.key}.jpg`} alt={`${n.name} — ${n.niche} দোকানের নমুনা`} loading="lazy" width="1600" height="600" /></div>
                <div class="h-niche-body">
                  <span class="h-niche-tag">{n.niche}</span>
                  <h3>{n.name}</h3>
                  <p>{n.tagline}</p>
                  <div class="h-niche-cats">{n.cats.slice(0, 4).map((c) => <span>{c}</span>)}</div>
                  <div class="h-niche-actions">
                    {d && <a href={d.url} target="_blank" rel="noopener" class="btn btn-sm h-niche-demo">ডেমো দেখুন <Icon name="external-link" size="sm" /></a>}
                    <a href={`/signup?niche=${n.key}`} class="btn btn-sm h-niche-go">এই দোকান খুলুন</a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p class="hp-sub hp-after">আপনার পণ্য এখানে নেই? "অন্য কিছু" বেছে নিজের মতো সাজিয়ে নিন — পোশাক থেকে কাঠের গিফট, সব চলে।</p>
      </div>
    </section>

    {/* ===== সাপোর্ট আর শেখা ===== */}
    <section class="hp-sec hp-soft">
      <div class="wrap">
        <p class="hp-eyebrow">একা নন</p>
        <h2 class="hp-title">আটকে গেলে সাহায্য — দিনে-রাতে, বাংলায়</h2>
        <div class="hp-help">
          <div class="hp-help-card">
            <span class="hp-ic"><Icon name="message-circle" /></span>
            <h3>লাইভ চ্যাট আর টিকেট</h3>
            <p>প্যানেলের কোণে সাপোর্ট বাটন — ছোট প্রশ্নে চ্যাট, বড় সমস্যায় স্ক্রিনশটসহ টিকেট। ২৪ ঘণ্টা খোলা।</p>
          </div>
          <div class="hp-help-card">
            <span class="hp-ic"><Icon name="book-open" /></span>
            <h3>{bn(HELP.length)}টা ধাপে ধাপে গাইড</h3>
            <p>দোকান খোলা, পণ্য, ল্যান্ডিং পেজ, কুরিয়ার, Pixel — প্রতিটা কাজ ছবির মতো সহজ বাংলায়।</p>
            <a href="/help" class="hp-link">হেল্প সেন্টার <Icon name="arrow-right" size="sm" /></a>
          </div>
          <div class="hp-help-card">
            <span class="hp-ic"><Icon name="phone" /></span>
            <h3>কল বা WhatsApp</h3>
            <p>শুরু করার আগে কিছু জানতে চান? সরাসরি কথা বলুন।</p>
            {f.support ? <a href={`tel:${f.support}`} class="hp-link">{bn(f.support)} <Icon name="arrow-right" size="sm" /></a> : <a href="/contact" class="hp-link">যোগাযোগ <Icon name="arrow-right" size="sm" /></a>}
          </div>
        </div>
      </div>
    </section>

    {/* ===== ৩ ধাপ ===== */}
    <section class="hp-sec" id="how">
      <div class="wrap">
        <h2 class="hp-title">৩ ধাপে বিক্রি শুরু</h2>
        <ol class="hp-steps">
          <li><span>১</span><h3>দোকান খুলুন</h3><p>নাম, মোবাইল আর কী বিক্রি করবেন বাছুন। ২ মিনিটে সাজানো দোকান: <code>yourshop.sellxbd.com</code></p></li>
          <li><span>২</span><h3>পণ্য আর পেজ</h3><p>ছবি, দাম, সাইজ/রং দিন। টেমপ্লেট থেকে অ্যাডের ল্যান্ডিং পেজ বানান — লেখা চাইলে AI দিয়ে।</p></li>
          <li><span>৩</span><h3>লিংক দিয়ে অ্যাড চালান</h3><p>অর্ডার এলে ফোনে খবর — রেকর্ড দেখে কনফার্ম, ইনভয়েস প্রিন্ট, এক ক্লিকে কুরিয়ার।</p></li>
        </ol>
      </div>
    </section>

    {/* ===== দাম ===== */}
    <section class="hp-sec hp-soft" id="price">
      <div class="wrap">
        <p class="hp-eyebrow">ন্যায্য দাম</p>
        <h2 class="hp-title">৳০ থেকে শুরু — যত বড় হবেন, তত প্ল্যান</h2>
        <p class="hp-sub">সব প্ল্যানে সব ফিচার। পার্থক্য শুধু মাসে কয়টা কনফার্ম অর্ডার। ফেক বা বাতিল অর্ডার গোনা হয় না।</p>
        <div class="hp-bill-tabs" role="tablist" aria-label="মাসিক বা বাৎসরিক">
          <button type="button" role="tab" class="on" aria-selected="true" data-bill="year">বাৎসরিক <span>১৫% ছাড়</span></button>
          <button type="button" role="tab" aria-selected="false" data-bill="month">মাসিক</button>
        </div>
        <div class="hp-plans" data-mode="year">
          {(["free", "small", "grow", "big"] as const).map((k) => (
            <div class={`hp-plan${k === "grow" ? " hp-plan-hot" : ""}`}>
              {k === "grow" && <span class="hp-plan-badge">সবচেয়ে জনপ্রিয়</span>}
              <h3>{P[k].name}</h3>
              <p class="hp-plan-for">{P[k].for}</p>
              <div class="hp-py">
                <div class="hp-plan-price">{P[k].price ? taka(cyclePrice(P[k].price, 12)) : "৳০"}<small>/বছর</small></div>
                <small class="hp-plan-year">{P[k].price ? <>মাসে {taka(Math.round(cyclePrice(P[k].price, 12) / 12))} পড়ে · <s>{taka(P[k].price * 12)}</s></> : "চিরকাল ফ্রি"}</small>
              </div>
              <div class="hp-pm">
                <div class="hp-plan-price">{P[k].price ? taka(P[k].price) : "৳০"}<small>/মাস</small></div>
                <small class="hp-plan-year">{P[k].price ? "বছরে নিলে ১৫% ছাড়" : "চিরকাল ফ্রি"}</small>
              </div>
              <ul>
                <li><Icon name="check" size="sm" /> মাসে {bn(P[k].orders)}টা কনফার্ম অর্ডার</li>
                <li><Icon name="check" size="sm" /> {P[k].staff ? `${bn(P[k].staff)} জন স্টাফ` : "শুধু মালিক"}</li>
                <li><Icon name="check" size="sm" /> ছবির জায়গা {storageLabel(P[k].storage)}</li>
                <li>{P[k].domain ? <><Icon name="check" size="sm" /> নিজের ডোমেইন</> : <><Icon name="x" size="sm" class="hp-no" /> নিজের ডোমেইন নেই</>}</li>
              </ul>
            </div>
          ))}
        </div>
        <div class="hp-price-foot">
          <div class="h-calc" data-plans={JSON.stringify((["free", "small", "grow", "big"] as const).map((k) => ({ n: P[k].name, p: P[k].price, o: P[k].orders, e: P[k].extra })))}>
            <h3>আপনার জন্য কোনটা সস্তা?</h3>
            <label for="h-orders">মাসে কয়টা অর্ডার কনফার্ম হয়?</label>
            <input type="range" id="h-orders" min="0" max="3000" step="50" value="300" />
            <div class="h-calc-row"><span>কনফার্ম অর্ডার</span><b data-out="orders">৩০০টা</b></div>
            <div class="h-calc-row"><span>সবচেয়ে সস্তা প্ল্যান</span><b data-out="plan">{P.small.name}</b></div>
            <div class="h-calc-total"><span>মাসে মোট</span><b data-out="total">৳{bn(P.small.price)}</b></div>
          </div>
          <ul class="hp-price-notes">
            <li><Icon name="gift" /> প্রথম {bn(f.trialDays)} দিন "{P.grow.name}" প্ল্যানের সব সুবিধা ফ্রি</li>
            <li><Icon name="rotate-ccw" /> রিচার্জ না করলে দোকান বন্ধ হয় না — ফ্রি প্ল্যানে চলতে থাকে</li>
            <li><Icon name="wallet" /> bKash / Nagad দিয়ে রিচার্জ; বছরে নিলে ১৫% ছাড়</li>
            <li><Icon name="info" /> একটা ফেক পার্সেলের খরচেই অনেক সময় এক মাসের প্ল্যান চলে যায়</li>
            <li><a href="/pricing" class="hp-link">সব প্ল্যানের বিস্তারিত <Icon name="arrow-right" size="sm" /></a></li>
          </ul>
        </div>
      </div>
    </section>

    {/* ===== তুলনা ===== */}
    <section class="hp-sec">
      <div class="wrap">
        <h2 class="hp-title">অন্য উপায়ের সাথে তুলনা</h2>
        <div class="h-compare-wrap">
          <table class="h-compare">
            <thead><tr><th></th><th>শুধু ফেসবুক পেজ</th><th>ডেভেলপার দিয়ে সাইট</th><th class="h-us">SellxBD</th></tr></thead>
            <tbody>
              <tr><td>শুরুর খরচ</td><td>৳০</td><td>হাজার হাজার টাকা</td><td class="h-us">৳০ — ফ্রি প্ল্যান</td></tr>
              <tr><td>চালু হতে সময়</td><td>সাথে সাথে</td><td>কয়েক সপ্তাহ</td><td class="h-us">২ মিনিট, রেডি দোকান</td></tr>
              <tr><td>ফেক অর্ডার আর ক্রেতার রেকর্ড</td><td><Cross /></td><td>আলাদা খরচে</td><td class="h-us"><Check /></td></tr>
              <tr><td>Pixel + CAPI ঠিকমতো</td><td><Cross /></td><td>নির্ভর করে</td><td class="h-us"><Check /></td></tr>
              <tr><td>ডিজাইন আর ল্যান্ডিং পেজ বদলানো</td><td><Cross /></td><td>প্রতিবার ডেভেলপার</td><td class="h-us"><Check /> নিজেই, কোড ছাড়া</td></tr>
              <tr><td>কুরিয়ার, SMS, ইনভয়েস</td><td>হাতে হাতে</td><td>আলাদা খরচে</td><td class="h-us"><Check /> সাথেই আছে</td></tr>
              <tr><td>স্টক আর আসল লাভের হিসাব</td><td>খাতায়</td><td>আলাদা খরচে</td><td class="h-us"><Check /> নিজে থেকে</td></tr>
              <tr><td>সমস্যা হলে সাহায্য</td><td>—</td><td>ডেভেলপারের সময়মতো</td><td class="h-us"><Check /> ২৪ ঘণ্টা, প্যানেলেই</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    {/* ===== প্রশ্নোত্তর ===== */}
    <section class="hp-sec hp-soft">
      <div class="wrap h-narrow">
        <h2 class="hp-title">সাধারণ প্রশ্ন</h2>
        <div class="h-faq">
          {[
            ["কম্পিউটার বা কোডিং জানতে হবে?", "না। ফেসবুকে পোস্ট দিতে পারলেই চালাতে পারবেন। মোবাইল দিয়েই পুরো দোকান চালানো যায় — প্যানেল অ্যাপের মতো ফোনে বসিয়ে নিলে নতুন অর্ডারের নোটিফিকেশনও পাবেন।"],
            ["সত্যিই ফ্রি?", `হ্যাঁ। ফ্রি প্ল্যানে মাসে ${bn(P.free.orders)}টা কনফার্ম অর্ডার পর্যন্ত একদম ৳০, সব ফিচারসহ। বেশি অর্ডার হলে বা স্টাফ/নিজের ডোমেইন লাগলে পেইড প্ল্যান নিন। শুধু খেয়াল রাখবেন: ফ্রি দোকান ৩০ দিন একদম ব্যবহার না হলে মুছে যায় (৭ দিন আগে জানানো হয়)।`],
            ["কোন ধরনের পণ্যের জন্য?", "যেকোনো পণ্য — পোশাক, স্কিনকেয়ার, খাবার, গ্যাজেট, কিচেন, শিশু পণ্য, হাতে বানানো জিনিস। ৬টা ধরনের রেডি দোকান আছে, বাকিগুলো নিজের মতো সাজিয়ে নিন।"],
            ["ফেক অর্ডার কীভাবে কমবে?", "ভুল নম্বর আর বারবার অর্ডার নিজে থেকে আটকায়। প্রতিটা অর্ডারে ক্রেতার আগের রেকর্ড দেখায় — কতবার নিয়েছে আর ফেরত দিয়েছে। ঝুঁকি থাকলে অগ্রিম ডেলিভারি চার্জ নিতে পারেন।"],
            ["অনলাইন পেমেন্ট নেওয়া যায়?", "ক্যাশ অন ডেলিভারি মূল। চাইলে ডেলিভারি চার্জ বা পুরো টাকা bKash/Nagad/Rocket-এ অগ্রিম নিতে পারেন — কাস্টমার Transaction ID দেয়, আপনি মিলিয়ে নেন। কার্ড পেমেন্ট এখনো নেই।"],
            ["টাকা কাটে কীভাবে?", `আগে bKash/Nagad দিয়ে রিচার্জ করবেন। প্ল্যানের টাকা (৳${bn(P.small.price)} থেকে) বিলের দিন কাটে; সীমার বেশি অর্ডার হলে মাস শেষে প্রতি অর্ডারে ৳${bn(P.small.extra)}/${bn(P.grow.extra)}/${bn(P.big.extra)} (প্ল্যান অনুযায়ী) — সীমার কাছে গেলে আগেই জানানো হয়। প্রতিটা হিসাব প্যানেলে দেখা যায়।`],
            ["নিজের ডোমেইন ব্যবহার করা যাবে?", "হ্যাঁ, পেইড প্ল্যানে। প্যানেলে ডোমেইন যোগ করলে দুটো নেমসার্ভার পাবেন, ডোমেইন প্যানেলে বসালেই চালু। ডোমেইন না থাকলে ফ্রি subdomain।"],
            ["কোন কোন কুরিয়ার আর SMS আছে?", "কুরিয়ার: Steadfast, Pathao আর RedX — নিজের মার্চেন্ট অ্যাকাউন্ট, পার্সেলের টাকা সরাসরি আপনার কাছে। SMS: BulkSMSBD, SMS.net.bd অথবা যেকোনো গেটওয়ের লিংক।"],
            ["আমার আর কাস্টমারের তথ্য কি নিরাপদ?", "প্রতিটা দোকানের তথ্য আলাদা ডাটাবেসে থাকে, অন্য দোকান দেখতে পায় না। ক্রেতার রেকর্ডে নম্বর গোপন কোডে রাখা হয়, দোকানের নাম দেখায় না। নিরাপত্তার জন্য প্যানেল থেকে এক ক্লিকে সব কাস্টমারের তালিকা নামানো বন্ধ — Excel কপি লাগলে সাপোর্ট থেকে পাবেন।"],
            ["সমস্যা হলে কীভাবে সাহায্য পাব?", "প্যানেলের কোণে সাপোর্ট বাটন — লাইভ চ্যাট বা স্ক্রিনশটসহ টিকেট, ২৪ ঘণ্টা। এছাড়া হেল্প সেন্টারে ধাপে ধাপে গাইড আছে।"],
          ].map(([q, a]) => (
            <details><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </div>
    </section>

    {/* ===== সেলারদের জন্য গাইড (ব্লগ) — Google-এর কাছে ব্লগের গুরুত্ব বাড়ায় ===== */}
    {posts.length > 0 && (
      <section class="hp-sec">
        <div class="wrap">
          <p class="hp-eyebrow">ব্লগ</p>
          <h2 class="hp-title">অনলাইনে বিক্রির গাইড — সেলারদের জন্য</h2>
          <div class="hp-help">
            {posts.slice(0, 3).map((x) => (
              <article class="hp-help-card">
                <span class="hp-ic"><Icon name="file-text" /></span>
                <h3><a href={`/blog/${x.slug}`}>{x.title}</a></h3>
                <p>{x.excerpt}</p>
                <a href={`/blog/${x.slug}`} class="hp-link">পুরোটা পড়ুন <Icon name="arrow-right" size="sm" /></a>
              </article>
            ))}
          </div>
          <p class="hp-more"><a href="/blog" class="hp-link">সব লেখা দেখুন <Icon name="arrow-right" size="sm" /></a></p>
        </div>
      </section>
    )}

    {/* ===== শেষ ডাক ===== */}
    <section class="hp-final">
      <div class="wrap hp-final-in">
        <div>
          <h2>আজই নিজের অনলাইন দোকান খুলুন</h2>
          <p>২ মিনিটে চালু। {bn(f.trialDays)} দিন সব ফিচার ফ্রি, তারপরও ফ্রি প্ল্যানে চলতে পারে। কার্ড লাগবে না।</p>
        </div>
        <div class="hp-final-cta">
          <a href="/signup" class="btn btn-accent btn-lg">ফ্রিতে দোকান খুলুন <Icon name="arrow-right" /></a>
          {f.support && <a href={`tel:${f.support}`} class="hp-final-call"><Icon name="phone" size="sm" /> {bn(f.support)}</a>}
        </div>
      </div>
    </section>

    <SiteFooter support={f.support} />
    <div class="hp-sticky" data-hp-sticky>
      <div><b>{bn(f.trialDays)} দিন ফ্রি</b><small>কার্ড লাগবে না</small></div>
      <a href="/signup" class="btn btn-accent">দোকান খুলুন <Icon name="arrow-right" size="sm" /></a>
    </div>
    <script src={`/js/home.js?v=${ASSET_VERSION}`} defer></script>
  </div>
  );
};

/* ---------- সাইনআপ ---------- */
export const SignupPage = (p: { values?: Record<string, string>; errors?: Record<string, string>; alert?: string; domain: string; turnstile?: string; verify?: { email: boolean; phone: boolean } }) => {
  const v = p.values ?? {};
  const e = p.errors ?? {};
  return (
    <div class="wrap narrow">
      <div class="login-box wide">
        <h1>দোকান খুলুন</h1>
        <p class="muted">১ মাস সব ফিচার ফ্রি। কোনো কার্ড লাগবে না।</p>
        {p.alert && <div class="alert alert-error">{p.alert}</div>}
        <form method="post" action="/signup" class="order-form" data-signup>
          <label class="field"><span>দোকানের নাম *</span><input type="text" name="shop_name" value={v.shop_name ?? ""} required maxlength={60} />{e.shop_name && <small class="error">{e.shop_name}</small>}</label>
          <label class="field"><span>দোকানের ঠিকানা *</span>
            <div class="slug-input"><input type="text" name="slug" value={v.slug ?? ""} required maxlength={30} pattern="[a-z0-9-]+" placeholder="myshop" autocomplete="off" data-slug /><span>.{p.domain}</span></div>
            <small class="muted" data-slug-msg>ছোট ইংরেজি অক্ষর, সংখ্যা আর - । পরে নিজের ডোমেইন যোগ করতে পারবেন।</small>
            {e.slug && <small class="error">{e.slug}</small>}
          </label>
          <label class="field"><span>আপনার নাম *</span><input type="text" name="owner_name" value={v.owner_name ?? ""} required maxlength={60} />{e.owner_name && <small class="error">{e.owner_name}</small>}</label>
          <label class="field"><span>মোবাইল নম্বর *</span><input type="tel" name="phone" value={v.phone ?? ""} required placeholder="01XXXXXXXXX" />{e.phone && <small class="error">{e.phone}</small>}</label>
          <label class="field"><span>ইমেইল (লগইনের জন্য) *</span><input type="email" name="email" value={v.email ?? ""} required autocomplete="username" />{e.email && <small class="error">{e.email}</small>}</label>
          <label class="field"><span>পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর) *</span><input type="password" name="password" required minlength={8} autocomplete="new-password" />{e.password && <small class="error">{e.password}</small>}</label>
          <label class="field"><span>কী বিক্রি করবেন?</span>
            <select name="niche">
              <option value="">অন্য কিছু / নিজে সাজাব</option>
              {NICHES.map((n) => <option value={n.key} selected={v.niche === n.key}>{n.niche}</option>)}
            </select>
            <small class="muted">বাছলে ক্যাটাগরি, থিম, রং, ডেলিভারি চার্জ আর পলিসি পেজ আগে থেকে সাজানো থাকবে।</small>
          </label>
          <label class="small-check"><input type="checkbox" name="seed_demo" value="1" checked={v.seed_demo !== "0"} /> নমুনা পণ্য দিয়ে শুরু করুন (পরে মুছে ফেলা যাবে)</label>
          {p.verify && (p.verify.email || p.verify.phone) && (
            <p class="muted small">
              {p.verify.email && "দোকান খোলার পর ইমেইলে একটা লিংক যাবে। "}
              {p.verify.phone && "SellxBD টিম আপনার মোবাইলে ফোন করে নম্বর যাচাই করবে — সঠিক নম্বর দিন। "}
              যাচাই হলে অর্ডার নেওয়া চালু হবে — প্রতারণা ঠেকাতে, যাতে সব দোকানের ক্রেতা নিরাপদ থাকে।
            </p>
          )}
          {p.turnstile && <>
            <div class="cf-turnstile" data-sitekey={p.turnstile} data-language="bn" data-theme="light" style="margin:6px 0 12px"></div>
            {e.turnstile && <small class="error">{e.turnstile}</small>}
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
          </>}
          <button class="btn btn-primary btn-block btn-lg" data-submit>দোকান তৈরি করুন</button>
        </form>
      </div>
      <script src={`/js/signup.js?v=${ASSET_VERSION}`} defer></script>
    </div>
  );
};

export const SuperLoginPage = ({ error, email }: { error?: string; email?: string }) => (
  <div class="login-box">
    <h1>সুপার অ্যাডমিন লগইন</h1>
    {error && <div class="alert alert-error">{error}</div>}
    <form method="post" action="/super/login" class="order-form">
      <label class="field"><span>ইমেইল</span><input type="email" name="email" value={email ?? ""} required /></label>
      <label class="field"><span>পাসওয়ার্ড</span><input type="password" name="password" required /></label>
      <button class="btn btn-primary btn-block">লগইন</button>
    </form>
  </div>
);

/** প্রথম সুপার অ্যাডমিন বানানো (এককালীন সেটআপ কোড দিয়ে) */
export const SuperSetupPage = ({ code, error, email }: { code: string; error?: string; email?: string }) => (
  <div class="login-box">
    <h1>সুপার অ্যাডমিন তৈরি</h1>
    <p class="muted">এই পেজ একবারই কাজ করে। নিজের ইমেইল আর শক্ত পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর) দিন।</p>
    {error && <div class="alert alert-error">{error}</div>}
    <form method="post" action="/super/setup" class="order-form">
      <input type="hidden" name="code" value={code} />
      <label class="field"><span>ইমেইল</span><input type="email" name="email" value={email ?? ""} required autocomplete="username" /></label>
      <label class="field"><span>পাসওয়ার্ড</span><input type="password" name="password" required minlength={10} autocomplete="new-password" /></label>
      <label class="field"><span>আবার পাসওয়ার্ড</span><input type="password" name="password2" required minlength={10} autocomplete="new-password" /></label>
      <button class="btn btn-primary btn-block">তৈরি করুন</button>
    </form>
  </div>
);

