import type { Child } from "hono/jsx";
import { ASSET_VERSION } from "../shop/views/layout";
import { bn, dhakaTime, taka } from "../shop/lib/format";

export const PLATFORM_NAME = "SellxBD";

export type PFlash = { type: "ok" | "error"; text: string } | null;

export const PLayout = (p: { title: string; children?: Child; nav?: Child; flash?: PFlash; admin?: boolean }) => (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{p.title}</title>
      <meta name="description" content="ফেসবুক সেলারদের জন্য নিজের অনলাইন দোকান — ল্যান্ডিং পেজ, ফেক অর্ডার আটকানো, Pixel + CAPI, কুরিয়ার, SMS। চার্জ শুধু কনফার্ম অর্ডারে।" />
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
type HomeFees = { monthly: number; order: number; staff: number; trialDays: number; trialOrders: number; support: string };

const Check = () => <span class="h-check" aria-hidden="true">✓</span>;
const Cross = () => <span class="h-cross" aria-hidden="true">✕</span>;

export const HomePage = ({ devMode, fees: f }: { devMode: boolean; fees: HomeFees }) => (
  <div class="home">
    {/* হিরো */}
    <section class="h-hero">
      <div class="wrap h-hero-grid">
        <div>
          <p class="h-kicker">ফেসবুক পেজে যারা বিক্রি করেন, তাদের জন্য</p>
          <h1>ফেক অর্ডারে আর টাকা নষ্ট নয়।<br /><span>নিজের ওয়েবসাইটে অর্ডার নিন।</span></h1>
          <p class="h-lead">
            প্রতিটা পণ্যের আলাদা ল্যান্ডিং পেজ, অর্ডার ম্যানেজ, কুরিয়ারে এক ক্লিকে পাঠানো, কাস্টমারকে SMS — সব এক জায়গায়।
            চার্জ দেবেন শুধু <strong>কনফার্ম হওয়া আসল অর্ডারে</strong>।
          </p>
          <div class="h-cta">
            <a href="/signup" class="btn btn-accent btn-lg">ফ্রি দোকান খুলুন →</a>
            <a href="#how" class="btn h-ghost btn-lg">কীভাবে কাজ করে</a>
          </div>
          <ul class="h-chips">
            <li>✓ {bn(f.trialDays)} দিন ফ্রি</li>
            <li>✓ কার্ড লাগবে না</li>
            <li>✓ bKash / Nagad</li>
            <li>✓ পুরোটা বাংলায়</li>
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
              <div class="h-ph-field">আপনার নাম</div>
              <div class="h-ph-field">মোবাইল নম্বর</div>
              <div class="h-ph-field">পুরো ঠিকানা</div>
              <div class="h-ph-btn">অর্ডার করুন — ক্যাশ অন ডেলিভারি</div>
            </div>
          </div>
          <div class="h-toast h-toast-1">🛒 নতুন অর্ডার — রহিম, মিরপুর</div>
          <div class="h-toast h-toast-2">🛡️ ফেক অর্ডার আটকানো হয়েছে</div>
          <div class="h-toast h-toast-3">🚚 Steadfast-এ বুক হয়েছে</div>
        </div>
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
            ["📒", "খাতা, এক্সেল আর কুরিয়ার প্যানেল", "একই ঠিকানা তিন জায়গায় লেখা। কোন অর্ডার কোথায় আছে, খুঁজতেই সময় যায়।"],
          ].map(([i, t, d]) => (
            <div class="h-pain"><div class="h-pain-i">{i}</div><div><h3>{t}</h3><p>{d}</p></div></div>
          ))}
        </div>
      </div>
    </section>

    {/* সমাধান / ফিচার */}
    <section class="h-sec h-soft">
      <div class="wrap">
        <h2 class="h-title">SellxBD সব সমাধান করে দেয়</h2>
        <p class="h-sub">ফেসবুক সেলারদের রোজকার কাজ মাথায় রেখে বানানো</p>
        <div class="h-feats">
          {[
            ["🛡️", "ফেক অর্ডার আটকায়", "ভুল নম্বর নেয় না। একই নম্বর বা মোবাইল থেকে বারবার অর্ডার বন্ধ। ফেক কাস্টমার একবার ধরলে স্থায়ী ব্লক।"],
            ["🎯", "অ্যাড খরচ কমায়", "Pixel + Conversions API দুটোই চালু। Purchase যায় শুধু আপনি কনফার্ম করলে — Facebook আসল ক্রেতা চিনতে শেখে।"],
            ["📄", "ল্যান্ডিং পেজ বিল্ডার", "ছবি, ভিডিও, রিভিউ, অফার কাউন্টডাউন, প্রশ্নোত্তর — সাজিয়ে নিন। কোড লাগবে না।"],
            ["🚚", "কুরিয়ারে এক ক্লিকে", "Steadfast, Pathao, RedX — নিজের অ্যাকাউন্ট যুক্ত করুন। একসাথে অনেক অর্ডার পাঠান, ট্র্যাকিং দেখুন।"],
            ["💬", "কাস্টমারকে অটো SMS", "অর্ডার কনফার্ম আর পার্সেল পাঠানোর সাথে সাথে ট্র্যাকিং নম্বরসহ SMS — নিজের SMS গেটওয়ে দিয়ে।"],
            ["🏷️", "কুপন আর সাইজ/রং", "ঈদ অফার, ফ্রি ডেলিভারি কুপন। প্রতিটা সাইজ বা রঙের আলাদা দাম আর স্টক।"],
            ["📊", "বিক্রির হিসাব", "আজ, সপ্তাহ, মাসে কত অর্ডার, কত কনফার্ম, কত ফেক, কোন পণ্য বেশি চলছে — এক নজরে।"],
            ["🌐", "নিজের ডোমেইন", "yourshop.com — নিজের নামে দোকান। না থাকলে ফ্রি subdomain। সবখানে https।"],
            ["👥", "স্টাফ অ্যাকাউন্ট", "কেউ শুধু অর্ডার দেখবে, কেউ পণ্যও — অনুমতি আপনি ঠিক করবেন।"],
          ].map(([i, t, d]) => (
            <div class="h-feat"><div class="h-feat-i">{i}</div><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </div>
    </section>

    {/* কীভাবে */}
    <section class="h-sec" id="how">
      <div class="wrap">
        <h2 class="h-title">৩ ধাপে দোকান চালু</h2>
        <ol class="h-steps">
          <li><span>১</span><h3>দোকান খুলুন</h3><p>নাম আর মোবাইল নম্বর দিন। ২ মিনিটে আপনার ঠিকানা তৈরি: <code>yourshop.sellxbd.com</code></p></li>
          <li><span>২</span><h3>পণ্য যোগ করুন</h3><p>ছবি, দাম, বিবরণ দিন। প্রতিটা পণ্যের জন্য অর্ডার ফর্মসহ ল্যান্ডিং পেজ নিজে তৈরি হয়।</p></li>
          <li><span>৩</span><h3>লিংক দিয়ে অ্যাড চালান</h3><p>পেজের পোস্ট বা অ্যাডে লিংক দিন। অর্ডার আসবে, কনফার্ম করুন, কুরিয়ারে পাঠান।</p></li>
        </ol>
      </div>
    </section>

    {/* দাম */}
    <section class="h-sec h-soft" id="price">
      <div class="wrap">
        <h2 class="h-title">ন্যায্য দাম — যত বিক্রি, তত খরচ</h2>
        <p class="h-sub">ফেক বা বাতিল অর্ডারে এক টাকাও না</p>
        <div class="h-price-grid">
          <div class="h-price">
            <div class="h-price-top">
              <div class="h-big">৳{bn(f.monthly)}<small>/মাস</small></div>
              <div class="h-plus">+ প্রতিটা কনফার্ম অর্ডারে <b>৳{bn(f.order)}</b></div>
            </div>
            <ul>
              <li><Check /> সব ফিচার — কোনো লুকানো চার্জ নেই</li>
              <li><Check /> প্রথম {bn(f.trialDays)} দিন অথবা {bn(f.trialOrders)}টা অর্ডার সম্পূর্ণ ফ্রি</li>
              <li><Check /> bKash / Nagad দিয়ে আগে রিচার্জ, যখন খুশি</li>
              <li><Check /> বাড়তি স্টাফ: ৳{bn(f.staff)}/মাস (মালিকের অ্যাকাউন্ট ফ্রি)</li>
            </ul>
            <a href="/signup" class="btn btn-accent btn-block btn-lg">ফ্রি ট্রায়াল শুরু করুন</a>
          </div>
          <div class="h-calc" data-monthly={String(f.monthly)} data-order={String(f.order)}>
            <h3>আপনার মাসিক খরচ কত হবে?</h3>
            <label for="h-orders">মাসে কয়টা অর্ডার কনফার্ম হয়?</label>
            <input type="range" id="h-orders" min="0" max="2000" step="50" value="300" />
            <div class="h-calc-row"><span>কনফার্ম অর্ডার</span><b data-out="orders">৩০০টা</b></div>
            <div class="h-calc-row"><span>মাসিক চার্জ</span><b>৳{bn(f.monthly)}</b></div>
            <div class="h-calc-row"><span>অর্ডার চার্জ</span><b data-out="ordercost">৳{bn(300 * f.order)}</b></div>
            <div class="h-calc-total"><span>মোট</span><b data-out="total">৳{bn(f.monthly + 300 * f.order)}</b></div>
            <p class="h-note">একটা ফেক অর্ডারের ডেলিভারি চার্জেই প্রায় এক মাসের ভাড়া চলে যায় — SellxBD সেটা আগেই আটকায়।</p>
          </div>
        </div>
      </div>
    </section>

    {/* তুলনা */}
    <section class="h-sec">
      <div class="wrap">
        <h2 class="h-title">অন্য উপায়ের সাথে তুলনা</h2>
        <div class="h-compare-wrap">
          <table class="h-compare">
            <thead><tr><th></th><th>শুধু ফেসবুক পেজ</th><th>ডেভেলপার দিয়ে সাইট</th><th class="h-us">SellxBD</th></tr></thead>
            <tbody>
              <tr><td>শুরুর খরচ</td><td>৳০</td><td>হাজার হাজার টাকা</td><td class="h-us">৳০ — ফ্রি ট্রায়াল</td></tr>
              <tr><td>চালু হতে সময়</td><td>সাথে সাথে</td><td>কয়েক সপ্তাহ</td><td class="h-us">২ মিনিট</td></tr>
              <tr><td>ফেক অর্ডার আটকানো</td><td><Cross /></td><td>আলাদা খরচে</td><td class="h-us"><Check /></td></tr>
              <tr><td>Pixel + CAPI ঠিকমতো</td><td><Cross /></td><td>নির্ভর করে</td><td class="h-us"><Check /></td></tr>
              <tr><td>কুরিয়ার আর SMS</td><td>হাতে হাতে</td><td>আলাদা খরচে</td><td class="h-us"><Check /> সাথেই আছে</td></tr>
              <tr><td>আপডেট আর মেইনটেন্যান্স</td><td>—</td><td>আপনার দায়িত্ব</td><td class="h-us"><Check /> আমাদের দায়িত্ব</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    {/* প্রশ্নোত্তর */}
    <section class="h-sec h-soft">
      <div class="wrap h-narrow">
        <h2 class="h-title">সাধারণ প্রশ্ন</h2>
        <div class="h-faq">
          {[
            ["কম্পিউটার বা কোডিং জানতে হবে?", "না। ফেসবুকে পোস্ট দিতে পারলেই চালাতে পারবেন। মোবাইল দিয়েই পুরো দোকান চালানো যায়।"],
            ["ট্রায়াল শেষ হলে কী হবে?", `${bn(f.trialDays)} দিন অথবা ${bn(f.trialOrders)}টা কনফার্ম অর্ডার — যেটা আগে শেষ হয়। এরপর bKash/Nagad দিয়ে রিচার্জ করলেই চলতে থাকবে। আপনার পণ্য আর অর্ডার সব থেকে যাবে।`],
            ["টাকা কাটে কীভাবে?", `আগে রিচার্জ করবেন, সেখান থেকে মাসে ৳${bn(f.monthly)} আর প্রতিটা কনফার্ম অর্ডারে ৳${bn(f.order)} কাটবে। ফেক বা বাতিল অর্ডারে কিছুই কাটে না। প্রতিটা হিসাব প্যানেলে দেখা যায়।`],
            ["নিজের ডোমেইন ব্যবহার করা যাবে?", "হ্যাঁ। প্যানেলে ডোমেইন যোগ করলে আমরা দুটো নেমসার্ভার দেব, সেগুলো ডোমেইন প্যানেলে বসালেই চালু। ডোমেইন না থাকলে ফ্রি subdomain পাবেন।"],
            ["কোন কোন কুরিয়ার আছে?", "Steadfast, Pathao আর RedX। নিজের মার্চেন্ট অ্যাকাউন্ট যুক্ত করবেন, পার্সেলের টাকা সরাসরি আপনার অ্যাকাউন্টেই আসবে।"],
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
        {f.support && <p class="h-support">প্রশ্ন আছে? কল বা WhatsApp: <a href={`tel:${f.support}`}>{f.support}</a></p>}
      </div>
    </section>

    <footer class="h-foot">
      <div class="wrap">© {PLATFORM_NAME} · বাংলাদেশের অনলাইন সেলারদের জন্য</div>
    </footer>
    <script src={`/js/home.js?v=${ASSET_VERSION}`} defer></script>
  </div>
);

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
          <label class="small-check"><input type="checkbox" name="seed_demo" value="1" checked={v.seed_demo !== "0"} /> নমুনা পণ্য দিয়ে শুরু করুন (পরে বন্ধ করা যাবে)</label>
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

