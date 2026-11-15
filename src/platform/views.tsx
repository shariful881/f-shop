import type { Plan, PlanKey } from "./plans";
import type { Child } from "hono/jsx";
import { NICHES } from "../shop/lib/niches";
import { ASSET_VERSION } from "../shop/views/layout";
import { bn, dhakaTime, taka } from "../shop/lib/format";

export const PLATFORM_NAME = "SellxBD";
import { SiteFooter } from "./pages";

export type PFlash = { type: "ok" | "error"; text: string } | null;

export const PLayout = (p: { title: string; children?: Child; nav?: Child; flash?: PFlash; admin?: boolean }) => (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{p.title}</title>
      <meta name="description" content="ফেসবুক সেলারদের নিজের অনলাইন দোকান — রেডি দোকান, ৪টা থিম, ল্যান্ডিং পেজ, ফেক অর্ডার আটকানো, Pixel + CAPI, Steadfast/Pathao/RedX, ইনভয়েস, SMS আর ২৪ ঘণ্টা সাপোর্ট। চার্জ শুধু কনফার্ম অর্ডারে।" />
      <meta name="theme-color" content="#0f766e" />
      <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/admin.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/platform.css?v=${ASSET_VERSION}`} />
    </head>
    <body class={p.admin ? "admin" : "platform"}>
      <header class={p.admin ? "admin-header" : "p-header"}>
        <div class="wrap admin-header-inner">
          <a href={p.admin ? "/super" : "/"} class="logo">{PLATFORM_NAME}{p.admin ? " সুপার অ্যাডমিন" : ""}</a>
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

/* ---------- হোম (মার্কেটিং) — বাংলাদেশের ফেসবুক সেলারদের জন্য ---------- */
type HomeFees = { plans: Record<PlanKey, Plan>; staff: number; trialDays: number; trialOrders: number; support: string };
type DemoLink = { key?: string; niche: string; name: string; url: string };

const Check = () => <span class="h-check" aria-hidden="true">✓</span>;
const Cross = () => <span class="h-cross" aria-hidden="true">✕</span>;

/** ফিচারের ভাগ — প্রজেক্টে যা যা আছে */
const FEATURE_GROUPS: { icon: string; title: string; sub: string; items: [string, string, string][] }[] = [
  {
    icon: "🛡️", title: "অর্ডার আর ফেক অর্ডার", sub: "আসল কাস্টমারের অর্ডার, ঝামেলা ছাড়া",
    items: [
      ["🛡️", "ফেক অর্ডার আটকায়", "ভুল নম্বর নেয় না, একই নম্বর বা মোবাইল থেকে বারবার অর্ডার বন্ধ। ফেক ধরলে নম্বর আর ডিভাইস স্থায়ী ব্লক।"],
      ["🛒", "কার্ট আর পরিমাণ", "একসাথে কয়েকটা পণ্য, − ২ + দিয়ে পরিমাণ, ✕ দিয়ে মোছা — পেজ রিলোড ছাড়াই মোট টাকা বদলায়।"],
      ["📝", "নিজের মতো চেকআউট", "নিজের ঘর যোগ (সাইজ, নোট…), ইমেইল ঘর, আগে থেকে বাছা এলাকা, সর্বনিম্ন অর্ডার, অর্ডার নম্বরের নিজের অক্ষর।"],
      ["🔎", "কাস্টমারের অর্ডার ট্র্যাকিং", "মোবাইল নম্বর দিয়ে কাস্টমার নিজেই দেখে অর্ডার কোথায় আছে, ইনভয়েসও নামাতে পারে।"],
    ],
  },
  {
    icon: "🚚", title: "ডেলিভারি আর কুরিয়ার", sub: "অর্ডার থেকে পার্সেল — এক জায়গায়",
    items: [
      ["🚚", "কুরিয়ারে এক ক্লিকে", "Steadfast, Pathao, RedX — নিজের মার্চেন্ট অ্যাকাউন্ট যুক্ত করুন, একসাথে অনেক অর্ডার পাঠান, স্ট্যাটাস দেখুন।"],
      ["📍", "ঢাকার ভিতরে-বাইরে চার্জ", "দুই এলাকার আলাদা ডেলিভারি চার্জ, নির্দিষ্ট টাকার বেশি কিনলে ফ্রি ডেলিভারি — নিজে ঠিক করুন।"],
      ["🧾", "ইনভয়েস আর স্টিকার", "লোগোসহ A4 ইনভয়েস আর ৩×৪ ইঞ্চি পার্সেল স্টিকার, বারকোডসহ — একটা বা একসাথে অনেকগুলো প্রিন্ট।"],
      ["💬", "কাস্টমারকে অটো SMS", "অর্ডার কনফার্ম আর পার্সেল পাঠানোর সাথে সাথে SMS — BulkSMSBD, SMS.net.bd বা নিজের গেটওয়ে।"],
    ],
  },
  {
    icon: "🎨", title: "দোকান সাজানো", sub: "কোড ছাড়াই নিজের পছন্দমতো ডিজাইন",
    items: [
      ["🎨", "৪টা থিম + পুরো কাস্টমাইজ", "প্রো স্টোর, ক্লাসিক, মিনিমাল, বোল্ড। রং, ফন্ট, হেডার, হোমপেজের ১৩টা সেকশন, ফুটার — সব নিজে বদলান।"],
      ["🛍️", "পণ্যের বিস্তারিত পেজ", "গ্যালারি, সাইজ/রং, \"এখনই কিনুন\", কল-WhatsApp বাটন, ডেলিভারি তথ্য, সম্পর্কিত পণ্য — চার থিমেই।"],
      ["📄", "ল্যান্ডিং পেজ বিল্ডার", "অ্যাডের জন্য অর্ডার ফর্মসহ পেজ। রেডি টেমপ্লেট থেকে শুরু, ছবি-ভিডিও-রিভিউ-কাউন্টডাউন সাজান, নিজের টেমপ্লেট সেভ করুন।"],
      ["🖼️", "ছবি আর পেজ", "একসাথে অনেক পণ্যের ছবি আপলোড, ব্যানার, লোগো; আমাদের সম্পর্কে, রিটার্ন পলিসির মতো নিজের পেজ।"],
    ],
  },
  {
    icon: "🎯", title: "মার্কেটিং আর ট্র্যাকিং", sub: "অ্যাডের প্রতিটা টাকার হিসাব",
    items: [
      ["🎯", "Pixel + Conversions API", "দুটোই চালু। Purchase যায় শুধু আপনি কনফার্ম করলে — Facebook আসল ক্রেতা চিনতে শেখে, অ্যাড খরচ কমে।"],
      ["📈", "GA4, GTM, TikTok Pixel", "Google Analytics, Tag Manager আর TikTok — শুধু ID বসালেই চালু।"],
      ["🔍", "Google-এর জন্য SEO", "দোকান আর প্রতিটা পণ্যের টাইটেল-বিবরণ, Google-এ কেমন দেখাবে তার প্রিভিউ, sitemap আর robots নিজে তৈরি।"],
      ["🏷️", "কুপন আর ভ্যারিয়েন্ট", "ঈদ অফার, % ছাড়, ফ্রি ডেলিভারি কুপন। প্রতিটা সাইজ বা রঙের আলাদা দাম আর স্টক।"],
    ],
  },
  {
    icon: "📊", title: "ব্যবসা চালানো", sub: "মালিকের হাতে পুরো নিয়ন্ত্রণ",
    items: [
      ["📊", "ড্যাশবোর্ড আর রিপোর্ট", "আজ, সপ্তাহ, মাসে কত অর্ডার, কত কনফার্ম, কত ফেক, কোন পণ্য বেশি চলছে — চার্টসহ এক নজরে।"],
      ["👥", "স্টাফ আর অনুমতি", "ম্যানেজার আর অর্ডার স্টাফ — কে কী দেখবে আর করবে, আপনি ঠিক করবেন।"],
      ["🌐", "নিজের ডোমেইন", "yourshop.com — নিজের নামে দোকান। না থাকলে ফ্রি subdomain। সবখানে https।"],
      ["🛟", "২৪ ঘণ্টা সাপোর্ট", "প্যানেলের ভিতরেই লাইভ চ্যাট আর স্ক্রিনশটসহ সাপোর্ট টিকেট — দিনে-রাতে যখন দরকার।"],
    ],
  },
];

export const HomePage = ({ devMode, fees: f, demos = [] }: { devMode: boolean; fees: HomeFees; demos?: DemoLink[] }) => {
  const demoOf = (key: string, name: string) => demos.find((d) => d.key === key || d.name === name);
  return (
  <div class="home">
    {/* হিরো */}
    <section class="h-hero">
      <div class="wrap h-hero-grid">
        <div>
          <p class="h-kicker">ফেসবুক পেজে যারা বিক্রি করেন, তাদের জন্য</p>
          <h1>ফেক অর্ডারে আর টাকা নষ্ট নয়।<br /><span>নিজের ওয়েবসাইটে অর্ডার নিন।</span></h1>
          <p class="h-lead">
            রেডি দোকান, সুন্দর থিম, অ্যাডের ল্যান্ডিং পেজ, কুরিয়ারে এক ক্লিকে পাঠানো, ইনভয়েস, SMS আর ২৪ ঘণ্টা সাপোর্ট — সব এক জায়গায়।
            চার্জ দেবেন শুধু <strong>কনফার্ম হওয়া আসল অর্ডারে</strong>।
          </p>
          <div class="h-cta">
            <a href="/signup" class="btn btn-accent btn-lg">ফ্রি দোকান খুলুন →</a>
            <a href="#ready" class="btn h-ghost btn-lg">রেডি দোকান দেখুন</a>
          </div>
          <ul class="h-chips">
            <li>✓ {bn(f.trialDays)} দিন ফ্রি</li>
            <li>✓ কার্ড লাগবে না</li>
            <li>✓ bKash / Nagad</li>
            <li>✓ পুরোটা বাংলায়</li>
            <li>✓ ২৪ ঘণ্টা সাপোর্ট</li>
          </ul>
          {devMode && <p><a href="/?shop=demoshop" class="btn h-ghost">ডেমো দোকান দেখুন</a></p>}
        </div>

        {/* মোবাইলে দোকান দেখতে কেমন — শুধু HTML/CSS দিয়ে আঁকা */}
        <div class="h-phone-wrap" aria-hidden="true">
          <div class="h-phone">
            <div class="h-ph-bar">yourshop.sellxbd.com</div>
            <div class="h-ph-img"></div>
            <div class="h-ph-body">
              <div class="h-ph-title">হাতে বানানো কাঠের শেলফ</div>
              <div class="h-ph-price"><b>৳১,২৫০</b> <s>৳১,৬৫০</s></div>
              <div class="h-ph-qty"><span>−</span><b>২</b><span>+</span><em>মোট ৳২,৫০০</em></div>
              <div class="h-ph-field">আপনার নাম</div>
              <div class="h-ph-field">মোবাইল নম্বর</div>
              <div class="h-ph-btn">অর্ডার করুন — ক্যাশ অন ডেলিভারি</div>
            </div>
          </div>
          <div class="h-toast h-toast-1">🛒 নতুন অর্ডার — রহিম, মিরপুর</div>
          <div class="h-toast h-toast-2">🛡️ ফেক অর্ডার আটকানো হয়েছে</div>
          <div class="h-toast h-toast-3">🚚 Steadfast-এ বুক হয়েছে</div>
          <div class="h-toast h-toast-4">💬 সাপোর্ট: "জি, এখনই দেখছি"</div>
        </div>
      </div>
    </section>

    {/* এক নজরে */}
    <section class="h-stats">
      <div class="wrap h-stats-grid">
        {[
          ["৬টা", "রেডি দোকান"], ["৪টা", "থিম, পুরো কাস্টমাইজ"], ["৩টা", "কুরিয়ার যুক্ত"], ["২ মিনিট", "দোকান চালু"], ["২৪/৭", "সাপোর্ট"],
        ].map(([n, l]) => <div><b>{n}</b><span>{l}</span></div>)}
      </div>
    </section>

    {/* সমস্যা */}
    <section class="h-sec">
      <div class="wrap">
        <h2 class="h-title">এই সমস্যাগুলো চেনা লাগে?</h2>
        <div class="h-pains">
          {[
            ["😩", "ফেক অর্ডার আর রিটার্ন", "পার্সেল পাঠালেন, কাস্টমার ফোন ধরে না। ডেলিভারি চার্জ, প্যাকেজিং — সব গচ্চা।"],
            ["💸", "অ্যাডের খরচ বাড়ছে", "Pixel সব অর্ডারকে বিক্রি ধরে নেয়, তাই Facebook ফেক ক্রেতা খুঁজে আনে। আসল বিক্রির খরচ বাড়ে।"],
            ["📥", "ইনবক্সে অর্ডার হারিয়ে যায়", "\"দাম কত?\" — শত শত মেসেজ। উত্তর দিতে দেরি হলেই কাস্টমার অন্য পেজে।"],
            ["📒", "খাতা, এক্সেল আর কুরিয়ার প্যানেল", "একই ঠিকানা তিন জায়গায় লেখা, ইনভয়েস হাতে লেখা। কোন অর্ডার কোথায়, খুঁজতেই সময় যায়।"],
          ].map(([i, t, d]) => (
            <div class="h-pain"><div class="h-pain-i">{i}</div><div><h3>{t}</h3><p>{d}</p></div></div>
          ))}
        </div>
      </div>
    </section>

    {/* রেডি দোকান */}
    <section class="h-sec h-soft" id="ready">
      <div class="wrap">
        <h2 class="h-title">কী বিক্রি করেন? রেডি দোকান নিন</h2>
        <p class="h-sub">ক্যাটাগরি, থিম, রং, ডেলিভারি চার্জ আর পলিসি পেজ আগে থেকে সাজানো — শুধু নিজের পণ্য বসান</p>
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
                    {d && <a href={d.url} target="_blank" rel="noopener" class="btn btn-sm h-niche-demo">ডেমো দেখুন ↗</a>}
                    <a href={`/signup?niche=${n.key}`} class="btn btn-sm h-niche-go">এই দোকান খুলুন →</a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p class="h-sub h-after">আপনার পণ্য এখানে নেই? সমস্যা নেই — "অন্য কিছু" বেছে নিজের মতো সাজিয়ে নিন।</p>
      </div>
    </section>

    {/* ফিচার — ভাগ করে */}
    <section class="h-sec">
      <div class="wrap">
        <h2 class="h-title">অনলাইনে বিক্রির জন্য যা যা লাগে, সব আছে</h2>
        <p class="h-sub">ফেসবুক সেলারদের রোজকার কাজ মাথায় রেখে বানানো — আলাদা কোনো অ্যাপ বা প্লাগিন লাগবে না</p>
        <div class="h-groups">
          {FEATURE_GROUPS.map((g) => (
            <div class="h-group">
              <div class="h-group-head"><span>{g.icon}</span><div><h3>{g.title}</h3><p>{g.sub}</p></div></div>
              <div class="h-feats">
                {g.items.map(([i, t, d]) => <div class="h-feat"><div class="h-feat-i">{i}</div><h4>{t}</h4><p>{d}</p></div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* দুই ধরনের পেজ */}
    <section class="h-sec h-soft">
      <div class="wrap">
        <h2 class="h-title">এক দোকানে দুই রকম কাস্টমারের জন্য দুই রকম পেজ</h2>
        <div class="h-two">
          <div class="h-two-card">
            <div class="h-two-ico">🏪</div>
            <h3>পুরো দোকান</h3>
            <p>পেজ থেকে যারা ঘুরে দেখতে আসে — হোমপেজ, ক্যাটাগরি, সার্চ, পণ্যের বিস্তারিত পেজ, কার্ট আর চেকআউট।</p>
            <ul><li><Check /> সাজানো থিম, ব্যানার, অফার</li><li><Check /> কয়েকটা পণ্য একসাথে কেনা</li><li><Check /> সম্পর্কিত পণ্য দেখিয়ে বেশি বিক্রি</li></ul>
          </div>
          <div class="h-two-card h-two-accent">
            <div class="h-two-ico">🎯</div>
            <h3>অ্যাডের ল্যান্ডিং পেজ</h3>
            <p>অ্যাড দেখে যারা আসে — এক পেজেই পণ্যের সব কথা আর অর্ডার ফর্ম, অন্য কোথাও যেতে হয় না।</p>
            <ul><li><Check /> রেডি টেমপ্লেট থেকে কয়েক মিনিটে</li><li><Check /> রিভিউ, ভিডিও, কাউন্টডাউন</li><li><Check /> বেশি অর্ডার, কম খরচ</li></ul>
          </div>
        </div>
      </div>
    </section>

    {/* সাপোর্ট */}
    <section class="h-sec">
      <div class="wrap h-support-grid">
        <div>
          <p class="h-eyebrow">২৪ ঘণ্টা পাশে আছি</p>
          <h2>সমস্যা হলে প্যানেলের ভিতরেই সাহায্য</h2>
          <p class="h-lead-dark">দোকানের অ্যাডমিন প্যানেলের কোণে সাপোর্ট বাটন — আলাদা নম্বর খোঁজা বা ইনবক্সে অপেক্ষা নয়।</p>
          <div class="h-support-items">
            <div><b>💬 লাইভ চ্যাট</b><span>ছোট প্রশ্ন, দ্রুত উত্তর — টিম লিখছে কি না সেটাও দেখবেন।</span></div>
            <div><b>🎫 সাপোর্ট টিকেট</b><span>বড় সমস্যা স্ক্রিনশটসহ জানান, সমাধান না হওয়া পর্যন্ত খোলা থাকে।</span></div>
            {f.support && <div><b>📞 কল বা WhatsApp</b><span><a href={`tel:${f.support}`}>{bn(f.support)}</a></span></div>}
          </div>
        </div>
        <div class="h-chat-mock" aria-hidden="true">
          <div class="h-chat-head"><b>SellxBD সাপোর্ট</b><small>● টিম অনলাইনে</small></div>
          <div class="h-chat-tabs"><span class="on">💬 লাইভ চ্যাট</span><span>🎫 সাপোর্ট টিকেট</span></div>
          <div class="h-chat-body">
            <div class="h-bub me">Steadfast-এ পার্সেল যাচ্ছে না, একটু দেখবেন?</div>
            <div class="h-bub them">জি, দেখছি। কুরিয়ার সেটিংসে API key আবার বসিয়ে "যাচাই করুন" চাপুন তো।</div>
            <div class="h-bub me">হয়ে গেছে, ধন্যবাদ! 🙏</div>
          </div>
        </div>
      </div>
    </section>

    {/* কীভাবে */}
    <section class="h-sec h-soft" id="how">
      <div class="wrap">
        <h2 class="h-title">৩ ধাপে দোকান চালু</h2>
        <ol class="h-steps">
          <li><span>১</span><h3>দোকান খুলুন</h3><p>নাম, মোবাইল আর কী বিক্রি করবেন বাছুন। ২ মিনিটে সাজানো দোকান তৈরি: <code>yourshop.sellxbd.com</code></p></li>
          <li><span>২</span><h3>পণ্য আর ডিজাইন</h3><p>ছবি, দাম, সাইজ/রং দিন। থিম আর রং পছন্দমতো করুন, অ্যাডের জন্য টেমপ্লেট থেকে ল্যান্ডিং পেজ বানান।</p></li>
          <li><span>৩</span><h3>লিংক দিয়ে অ্যাড চালান</h3><p>পোস্ট বা অ্যাডে লিংক দিন। অর্ডার আসবে — কনফার্ম করুন, ইনভয়েস প্রিন্ট করুন, এক ক্লিকে কুরিয়ারে পাঠান।</p></li>
        </ol>
      </div>
    </section>

    {/* দাম */}
    <section class="h-sec" id="price">
      <div class="wrap">
        <h2 class="h-title">ন্যায্য দাম — যত বিক্রি, তত খরচ</h2>
        <p class="h-sub">ফেক বা বাতিল অর্ডারে এক টাকাও না</p>
        <div class="h-price-grid">
          <div class="h-price">
            <div class="h-price-top">
              <div class="h-big">৳০<small> থেকে শুরু</small></div>
              <div class="h-plus">{taka(f.plans.small.price)} / {taka(f.plans.grow.price)} / {taka(f.plans.big.price)} প্রতি মাসে — শুধু অর্ডারের সংখ্যায় পার্থক্য</div>
            </div>
            <ul>
              <li><Check /> সব প্ল্যানে সব ফিচার — কোনো লুকানো চার্জ নেই</li>
              <li><Check /> ফ্রি প্ল্যানে মাসে {bn(f.plans.free.orders)}টা অর্ডার — একদম ৳০</li>
              <li><Check /> প্রথম {bn(f.trialDays)} দিন "বাড়ন্ত" প্ল্যান সম্পূর্ণ ফ্রি</li>
              <li><Check /> bKash / Nagad দিয়ে রিচার্জ; বছরে নিলে ২ মাস ফ্রি</li>
              <li><Check /> ফেক বা বাতিল অর্ডার গোনা হয় না</li>
              <li><Check /> ২৪ ঘণ্টা সাপোর্ট সাথেই</li>
            </ul>
            <a href="/pricing" class="btn btn-accent btn-block btn-lg">সব প্ল্যান দেখুন</a>
          </div>
          <div class="h-calc" data-plans={JSON.stringify((["free", "small", "grow", "big"] as const).map((k) => ({ n: f.plans[k].name, p: f.plans[k].price, o: f.plans[k].orders, e: f.plans[k].extra })))}>
            <h3>আপনার মাসিক খরচ কত হবে?</h3>
            <label for="h-orders">মাসে কয়টা অর্ডার কনফার্ম হয়?</label>
            <input type="range" id="h-orders" min="0" max="3000" step="50" value="300" />
            <div class="h-calc-row"><span>কনফার্ম অর্ডার</span><b data-out="orders">৩০০টা</b></div>
            <div class="h-calc-row"><span>সবচেয়ে সস্তা প্ল্যান</span><b data-out="plan">{f.plans.small.name}</b></div>
            <div class="h-calc-total"><span>মোট</span><b data-out="total">৳{bn(f.plans.small.price)}</b></div>
            <p class="h-note">একটা ফেক অর্ডারের ডেলিভারি চার্জেই প্রায় এক মাসের ভাড়া চলে যায় — SellxBD সেটা আগেই আটকায়।</p>
          </div>
        </div>
      </div>
    </section>

    {/* তুলনা */}
    <section class="h-sec h-soft">
      <div class="wrap">
        <h2 class="h-title">অন্য উপায়ের সাথে তুলনা</h2>
        <div class="h-compare-wrap">
          <table class="h-compare">
            <thead><tr><th></th><th>শুধু ফেসবুক পেজ</th><th>ডেভেলপার দিয়ে সাইট</th><th class="h-us">SellxBD</th></tr></thead>
            <tbody>
              <tr><td>শুরুর খরচ</td><td>৳০</td><td>হাজার হাজার টাকা</td><td class="h-us">৳০ — ফ্রি ট্রায়াল</td></tr>
              <tr><td>চালু হতে সময়</td><td>সাথে সাথে</td><td>কয়েক সপ্তাহ</td><td class="h-us">২ মিনিট, রেডি দোকান</td></tr>
              <tr><td>ফেক অর্ডার আটকানো</td><td><Cross /></td><td>আলাদা খরচে</td><td class="h-us"><Check /></td></tr>
              <tr><td>Pixel + CAPI ঠিকমতো</td><td><Cross /></td><td>নির্ভর করে</td><td class="h-us"><Check /></td></tr>
              <tr><td>ডিজাইন বদলানো</td><td><Cross /></td><td>প্রতিবার ডেভেলপার</td><td class="h-us"><Check /> নিজেই, কোড ছাড়া</td></tr>
              <tr><td>কুরিয়ার, SMS, ইনভয়েস</td><td>হাতে হাতে</td><td>আলাদা খরচে</td><td class="h-us"><Check /> সাথেই আছে</td></tr>
              <tr><td>সমস্যা হলে সাহায্য</td><td>—</td><td>ডেভেলপারের সময়মতো</td><td class="h-us"><Check /> ২৪ ঘণ্টা, প্যানেলেই</td></tr>
              <tr><td>আপডেট আর মেইনটেন্যান্স</td><td>—</td><td>আপনার দায়িত্ব</td><td class="h-us"><Check /> আমাদের দায়িত্ব</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    {/* প্রশ্নোত্তর */}
    <section class="h-sec">
      <div class="wrap h-narrow">
        <h2 class="h-title">সাধারণ প্রশ্ন</h2>
        <div class="h-faq">
          {[
            ["কম্পিউটার বা কোডিং জানতে হবে?", "না। ফেসবুকে পোস্ট দিতে পারলেই চালাতে পারবেন। মোবাইল দিয়েই পুরো দোকান চালানো যায়।"],
            ["কোন ধরনের পণ্যের জন্য?", "যেকোনো পণ্য — পোশাক, স্কিনকেয়ার, খাবার, গ্যাজেট, কিচেন, শিশু পণ্য, হাতে বানানো জিনিস। ৬টা ক্যাটাগরির রেডি দোকান আছে, বাকিগুলো নিজের মতো সাজিয়ে নিন।"],
            ["ডিজাইন কি নিজের মতো করা যাবে?", "হ্যাঁ। ৪টা থিম থেকে বাছুন, তারপর রং, ফন্ট, হেডার, হোমপেজের কোন সেকশন কোথায় থাকবে, পণ্যের পেজ, ফুটার — সব প্যানেল থেকে বদলান। কোড লাগে না।"],
            ["ট্রায়াল শেষ হলে কী হবে?", `${bn(f.trialDays)} দিন পর পছন্দের প্ল্যান চালু হয়। রিচার্জ না করলে দোকান ফ্রি প্ল্যানে চলতে থাকে — বন্ধ হয় না, পণ্য আর অর্ডার সব থেকে যায়।`],
            ["টাকা কাটে কীভাবে?", `আগে bKash/Nagad দিয়ে রিচার্জ করবেন। প্ল্যানের টাকা (৳${bn(f.plans.small.price)} থেকে) বিলের দিন কাটে; প্ল্যানের সীমার বেশি অর্ডার হলে মাস শেষে অল্প বাড়তি। ফেক বা বাতিল অর্ডার গোনা হয় না। প্রতিটা হিসাব প্যানেলে দেখা যায়।`],
            ["নিজের ডোমেইন ব্যবহার করা যাবে?", "হ্যাঁ। প্যানেলে ডোমেইন যোগ করলে আমরা দুটো নেমসার্ভার দেব, সেগুলো ডোমেইন প্যানেলে বসালেই চালু। ডোমেইন না থাকলে ফ্রি subdomain পাবেন।"],
            ["কোন কোন কুরিয়ার আর SMS আছে?", "কুরিয়ার: Steadfast, Pathao আর RedX — নিজের মার্চেন্ট অ্যাকাউন্ট, পার্সেলের টাকা সরাসরি আপনার কাছে। SMS: BulkSMSBD, SMS.net.bd অথবা যেকোনো গেটওয়ের লিংক।"],
            ["সমস্যা হলে কীভাবে সাহায্য পাব?", "দোকানের প্যানেলের কোণে সাপোর্ট বাটন আছে — লাইভ চ্যাটে সাথে সাথে কথা বলুন অথবা স্ক্রিনশটসহ টিকেট দিন। সাপোর্ট ২৪ ঘণ্টা খোলা।"],
            ["আমার কাস্টমারের তথ্য কি নিরাপদ?", "প্রতিটা দোকানের তথ্য আলাদা ডাটাবেসে থাকে, অন্য কোনো দোকান দেখতে পায় না। পুরো সাইট https-এ চলে।"],
            ["অনলাইন পেমেন্ট নেওয়া যায়?", "এখন ক্যাশ অন ডেলিভারি — বাংলাদেশে যেটা সবচেয়ে বেশি চলে। কাস্টমার পণ্য হাতে পেয়ে টাকা দেন।"],
          ].map(([q, a]) => (
            <details><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </div>
    </section>

    {/* শেষ ডাক */}
    <section class="h-final">
      <div class="wrap h-narrow center">
        <h2>আজই নিজের অনলাইন দোকান খুলুন</h2>
        <p>{bn(f.trialDays)} দিন ফ্রি। কার্ড লাগবে না। পছন্দ না হলে কোনো খরচ নেই।</p>
        <a href="/signup" class="btn btn-accent btn-lg">ফ্রি দোকান খুলুন →</a>
        {f.support && <p class="h-support">প্রশ্ন আছে? কল বা WhatsApp: <a href={`tel:${f.support}`}>{bn(f.support)}</a></p>}
      </div>
    </section>

    <SiteFooter support={f.support} />
    <script src={`/js/home.js?v=${ASSET_VERSION}`} defer></script>
  </div>
  );
};

/* ---------- সাইনআপ ---------- */
export const SignupPage = (p: { values?: Record<string, string>; errors?: Record<string, string>; alert?: string; domain: string }) => {
  const v = p.values ?? {};
  const e = p.errors ?? {};
  return (
    <div class="wrap narrow">
      <div class="login-box wide">
        <h1>দোকান খুলুন</h1>
        <p class="muted">১৪ দিন অথবা প্রথম ৫০টা অর্ডার ফ্রি। কোনো কার্ড লাগবে না।</p>
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

