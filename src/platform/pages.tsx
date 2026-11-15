/**
 * sellxbd.com-এর বাকি পেজ: দাম, আমাদের সম্পর্কে, যোগাযোগ, শর্তাবলি, প্রাইভেসি, রিফান্ড নীতি, হেল্প সেন্টার।
 * উপরের মেনু আর নিচের ফুটার সব পাবলিক পেজে একই।
 */
import type { Child } from "hono/jsx";
import { bn } from "../shop/lib/format";
import { HELP, HELP_CATS, type HelpArticle } from "./help";
import { PLATFORM_NAME } from "./views";

export type Fees = { monthly: number; order: number; staff: number; trialDays: number; trialOrders: number; support: string };

export const PublicNav = () => (
  <>
    <a href="/pricing" class="p-nav-link">দাম</a>
    <a href="/#ready" class="p-nav-link p-hide-sm">ডেমো</a>
    <a href="/help" class="p-nav-link">সাহায্য</a>
    <a href="/signup" class="p-nav-cta">ফ্রি দোকান খুলুন</a>
  </>
);

export const SiteFooter = ({ support }: { support?: string }) => (
  <footer class="p-foot">
    <div class="wrap p-foot-grid">
      <div>
        <strong class="p-foot-logo">{PLATFORM_NAME}</strong>
        <p>বাংলাদেশের ফেসবুক আর অনলাইন সেলারদের জন্য নিজের দোকান — রেডি দোকান, ল্যান্ডিং পেজ, কুরিয়ার, ফেক অর্ডার আটকানো।</p>
        {support && <p>কল / WhatsApp: <a href={`tel:${support}`}>{bn(support)}</a></p>}
      </div>
      <nav>
        <b>{PLATFORM_NAME}</b>
        <a href="/pricing">দাম ও হিসাব</a>
        <a href="/#ready">ডেমো দোকান</a>
        <a href="/signup">ফ্রি দোকান খুলুন</a>
        <a href="/about">আমাদের সম্পর্কে</a>
      </nav>
      <nav>
        <b>সাহায্য</b>
        <a href="/help">হেল্প সেন্টার</a>
        <a href="/help/open-shop">কীভাবে দোকান খুলবেন</a>
        <a href="/help/landing-page">ল্যান্ডিং পেজ বানানো</a>
        <a href="/contact">যোগাযোগ</a>
      </nav>
      <nav>
        <b>নীতিমালা</b>
        <a href="/terms">শর্তাবলি</a>
        <a href="/privacy">প্রাইভেসি নীতি</a>
        <a href="/refund">রিফান্ড নীতি</a>
      </nav>
    </div>
    <div class="wrap p-foot-copy">© {bn(new Date().getFullYear())} {PLATFORM_NAME} · সব অধিকার সংরক্ষিত</div>
  </footer>
);

const PageHero = (p: { kicker?: string; title: string; sub?: Child }) => (
  <section class="p-hero">
    <div class="wrap p-narrow">
      {p.kicker && <span class="p-kicker">{p.kicker}</span>}
      <h1>{p.title}</h1>
      {p.sub && <p>{p.sub}</p>}
    </div>
  </section>
);

/* ---------- দাম ---------- */
export const PricingPage = ({ f }: { f: Fees }) => (
  <>
    <PageHero kicker="দাম ও হিসাব" title="যত বিক্রি, তত খরচ — ফেক অর্ডারে এক টাকাও না"
      sub={`${bn(f.trialDays)} দিন অথবা ${bn(f.trialOrders)}টা কনফার্ম অর্ডার পর্যন্ত পুরো ফ্রি। কার্ড লাগে না।`} />
    <section class="p-section">
      <div class="wrap p-price-grid">
        <div class="p-price-card p-price-main">
          <span class="p-badge">একটাই প্ল্যান — সব ফিচার</span>
          <div class="p-price-row"><b>৳{bn(f.monthly)}</b><span>/ মাস</span></div>
          <div class="p-price-row p-price-sub"><b>+ ৳{bn(f.order)}</b><span>প্রতি কনফার্ম অর্ডারে</span></div>
          <ul class="p-ticks">
            <li>রেডি দোকান, ৪টা থিম, থিম লাইভ এডিটর</li>
            <li>যত খুশি পণ্য আর ল্যান্ডিং পেজ, ১৪টা রেডি টেমপ্লেট</li>
            <li>ফেক অর্ডার আটকানো, কাস্টমারের আগের রেকর্ড</li>
            <li>Facebook Pixel + Conversions API, GA4, TikTok</li>
            <li>Steadfast, Pathao, RedX — এক ক্লিকে বুকিং</li>
            <li>ইনভয়েস, স্টিকার, রিপোর্ট, কুপন, SMS</li>
            <li>নিজের ডোমেইন, মিডিয়া লাইব্রেরি</li>
            <li>২৪ ঘণ্টা লাইভ চ্যাট সাপোর্ট</li>
          </ul>
          <a href="/signup" class="btn btn-accent btn-lg btn-block">ফ্রি দোকান খুলুন</a>
        </div>
        <div class="p-price-side">
          <div class="p-price-card">
            <h3>বাড়তি স্টাফ</h3>
            <p>প্রতি স্টাফ ৳{bn(f.staff)}/মাস — মালিকের অ্যাকাউন্ট ফ্রি।</p>
          </div>
          <div class="p-price-card">
            <h3>কীভাবে কাটে</h3>
            <ul class="p-plain">
              <li>আগে bKash/Nagad দিয়ে রিচার্জ করবেন।</li>
              <li>শুধু <b>কনফার্ম</b> অর্ডারে চার্জ — ফেক বা বাতিলে না।</li>
              <li>প্রতিটা চার্জের হিসাব প্যানেলে দেখা যায়।</li>
              <li>ব্যালেন্স শেষ হলে ৩ দিন সময় — তারপর শুধু নতুন অর্ডার বন্ধ, পুরনো সব থাকে।</li>
            </ul>
          </div>
          <div class="p-price-card p-calc" data-calc data-monthly={String(f.monthly)} data-order={String(f.order)}>
            <h3>মাসে কত খরচ হবে?</h3>
            <label>মাসে কনফার্ম অর্ডার <input type="number" min="0" max="100000" value="300" data-calc-orders /></label>
            <p class="p-calc-out">আনুমানিক খরচ: <b data-calc-total>৳{bn(f.monthly + 300 * f.order)}</b> / মাস</p>
            <small>অর্ডারপ্রতি মাত্র <span data-calc-per>৳{(Math.round(((f.monthly + 300 * f.order) / 300) * 100) / 100).toLocaleString("bn-BD")}</span></small>
          </div>
        </div>
      </div>
    </section>
    <script dangerouslySetInnerHTML={{ __html: `(function(){var b=document.querySelector("[data-calc]");if(!b)return;var m=+b.dataset.monthly,o=+b.dataset.order,i=b.querySelector("[data-calc-orders]"),t=b.querySelector("[data-calc-total]"),p=b.querySelector("[data-calc-per]");function f(n){return n.toLocaleString("bn-BD")}i.addEventListener("input",function(){var n=Math.max(0,Math.min(100000,parseInt(i.value||"0",10)||0));var tot=m+n*o;t.textContent="৳"+f(tot);p.textContent=n?"৳"+f(Math.round(tot/n*100)/100):"—";});})();` }} />
  </>
);

/* ---------- আমাদের সম্পর্কে / যোগাযোগ ---------- */
export const AboutPage = ({ f }: { f: Fees }) => (
  <>
    <PageHero kicker="আমাদের সম্পর্কে" title="ফেসবুক সেলারদের জন্য, ফেসবুক সেলারদের হাতে বানানো" />
    <section class="p-section">
      <div class="wrap p-narrow p-prose">
        <p>{PLATFORM_NAME} বানানো হয়েছে বাংলাদেশের অনলাইন সেলারদের প্রতিদিনের সমস্যা মাথায় রেখে — ফেক অর্ডার, ফেরত পার্সেল, বিজ্ঞাপনের টাকা নষ্ট আর ওয়েবসাইট বানানোর ঝামেলা।</p>
        <p>আমরা নিজেরাও ফেসবুকে পণ্য বিক্রি করি। তাই যে জিনিসগুলো দরকার — ক্যাশ অন ডেলিভারি, কুরিয়ার, ঠিকমতো পিক্সেল, এক পণ্যের ল্যান্ডিং পেজ — সেগুলোই আগে বানিয়েছি, সহজ বাংলায়।</p>
        <h2>আমরা যা মেনে চলি</h2>
        <ul>
          <li>সহজ দাম: শুধু কনফার্ম অর্ডারে চার্জ, লুকানো খরচ নেই।</li>
          <li>আপনার দোকানের তথ্য আপনার — আলাদা ডাটাবেসে, অন্য কেউ দেখে না।</li>
          <li>বাংলায় সাপোর্ট, ২৪ ঘণ্টা।</li>
        </ul>
        <p><a href="/contact">যোগাযোগ করুন</a> · <a href="/signup">ফ্রি দোকান খুলুন</a></p>
        {f.support && <p>কল / WhatsApp: <a href={`tel:${f.support}`}>{bn(f.support)}</a></p>}
      </div>
    </section>
  </>
);

export const ContactPage = ({ f }: { f: Fees }) => (
  <>
    <PageHero kicker="যোগাযোগ" title="আমরা সাহায্য করতে প্রস্তুত" sub="দোকান খোলা, দাম বা যেকোনো প্রশ্ন — যেভাবে সুবিধা।" />
    <section class="p-section">
      <div class="wrap p-contact-grid">
        {f.support ? (
          <>
            <a class="p-contact-card" href={`tel:${f.support}`}><b>ফোন</b><span>{bn(f.support)}</span><small>সরাসরি কল করুন</small></a>
            <a class="p-contact-card" href={`https://wa.me/88${f.support}`} target="_blank" rel="noopener"><b>WhatsApp</b><span>{bn(f.support)}</span><small>মেসেজ দিন</small></a>
          </>
        ) : null}
        <a class="p-contact-card" href="/help"><b>হেল্প সেন্টার</b><span>{bn(HELP.length)}টা গাইড</span><small>ধাপে ধাপে বাংলায়</small></a>
        <div class="p-contact-card"><b>দোকানদার?</b><span>প্যানেলের সাপোর্ট</span><small>প্যানেলের কোণে "সাপোর্ট" — লাইভ চ্যাট আর টিকেট, ২৪ ঘণ্টা</small></div>
      </div>
    </section>
  </>
);

/* ---------- নীতিমালা ---------- */
const UPDATED = "১৫ নভেম্বর ২০২৬";
const Legal = (p: { title: string; children?: Child }) => (
  <>
    <PageHero kicker="নীতিমালা" title={p.title} sub={`সর্বশেষ হালনাগাদ: ${UPDATED}`} />
    <section class="p-section"><div class="wrap p-narrow p-prose">{p.children}</div></section>
  </>
);

export const TermsPage = ({ f }: { f: Fees }) => (
  <Legal title="শর্তাবলি">
    <p>{PLATFORM_NAME}-এ দোকান খুললে বা ব্যবহার করলে আপনি নিচের শর্তগুলো মেনে নিচ্ছেন।</p>
    <h2>১. সেবা</h2>
    <p>{PLATFORM_NAME} দোকানদারকে অনলাইন দোকান, ল্যান্ডিং পেজ আর অর্ডার সামলানোর সফটওয়্যার দেয়। পণ্য, দাম, ডেলিভারি আর ক্রেতার সাথে লেনদেনের দায়িত্ব দোকানদারের নিজের।</p>
    <h2>২. অ্যাকাউন্ট</h2>
    <ul>
      <li>সঠিক নাম, মোবাইল আর ইমেইল দিয়ে অ্যাকাউন্ট খুলতে হবে।</li>
      <li>পাসওয়ার্ড গোপন রাখা আর স্টাফের কাজের দায়িত্ব দোকানদারের।</li>
    </ul>
    <h2>৩. চার্জ ও রিচার্জ</h2>
    <ul>
      <li>ফ্রি ট্রায়াল: {bn(f.trialDays)} দিন অথবা {bn(f.trialOrders)}টা কনফার্ম অর্ডার, যেটা আগে শেষ হয়।</li>
      <li>এরপর মাসিক ৳{bn(f.monthly)}, প্রতি কনফার্ম অর্ডারে ৳{bn(f.order)} আর প্রতি স্টাফ ৳{bn(f.staff)}/মাস — আগে রিচার্জ করা ব্যালেন্স থেকে কাটে।</li>
      <li>ফেক বা বাতিল অর্ডারে চার্জ নেই। দাম বদলালে অন্তত ৩০ দিন আগে জানানো হবে।</li>
      <li>ব্যালেন্স মাইনাস হলে ৩ দিন পর নতুন অর্ডার নেওয়া বন্ধ হয়; রিচার্জ করলে আবার চালু।</li>
    </ul>
    <h2>৪. যা বিক্রি করা যাবে না</h2>
    <p>বাংলাদেশের আইনে নিষিদ্ধ পণ্য, নকল বা চোরাই পণ্য, মাদক, অস্ত্র, প্রতারণামূলক অফার বা অন্যের ট্রেডমার্ক/ছবি অনুমতি ছাড়া ব্যবহার করা যাবে না। এমন হলে দোকান সাময়িক বা স্থায়ীভাবে বন্ধ করা হতে পারে।</p>
    <h2>৫. দায়</h2>
    <p>আমরা সেবা সবসময় চালু রাখার চেষ্টা করি, তবে ইন্টারনেট, কুরিয়ার, SMS বা Facebook-এর মতো বাইরের সেবার সমস্যার জন্য দায়ী নই। নিজের দরকারি তথ্যের (পণ্য, অর্ডার) কপি নিজের কাছে রাখার পরামর্শ দেওয়া হয়।</p>
    <h2>৬. বন্ধ করা</h2>
    <p>দোকানদার যেকোনো সময় সেবা বন্ধ করতে পারেন। নিয়ম ভাঙলে আমরা আগে জানিয়ে দোকান বন্ধ করতে পারি।</p>
    <p>প্রশ্ন থাকলে <a href="/contact">যোগাযোগ করুন</a>।</p>
  </Legal>
);

export const PrivacyPage = () => (
  <Legal title="প্রাইভেসি নীতি">
    <p>এই নীতি জানায় {PLATFORM_NAME} কোন তথ্য রাখে, কেন রাখে আর কীভাবে সুরক্ষিত রাখে।</p>
    <h2>দোকানদারের তথ্য</h2>
    <p>নাম, মোবাইল, ইমেইল, দোকানের তথ্য আর রিচার্জের হিসাব — শুধু সেবা চালাতে, বিল করতে আর সাপোর্ট দিতে। পাসওয়ার্ড এনক্রিপ্ট করে রাখা হয়, আমরাও দেখতে পাই না।</p>
    <h2>ক্রেতার তথ্য</h2>
    <p>দোকানের ক্রেতারা অর্ডারের সময় যে নাম, মোবাইল আর ঠিকানা দেন, তা সেই দোকানের নিজের আলাদা ডাটাবেসে থাকে। এই তথ্যের মালিক দোকানদার; অন্য কোনো দোকান তা দেখতে পায় না। ফেক অর্ডার আটকাতে ডিভাইস আর IP-এর মতো কিছু তথ্যও রাখা হয়।</p>
    <h2>কাদের সাথে শেয়ার হয়</h2>
    <ul>
      <li>দোকানদার যে সেবা চালু করেন শুধু সেগুলোতে: কুরিয়ার (পার্সেল বুকিং), SMS গেটওয়ে, Facebook/Google/TikTok (বিজ্ঞাপন মাপা)।</li>
      <li>সাইট চলে Cloudflare-এর সার্ভারে।</li>
      <li>আমরা কারো তথ্য বিক্রি করি না।</li>
    </ul>
    <h2>সুরক্ষা</h2>
    <p>পুরো সাইট https-এ চলে, প্রতিটা দোকানের তথ্য আলাদা থাকে, আর প্যানেলে ঢুকতে লগইন লাগে।</p>
    <h2>আপনার অধিকার</h2>
    <p>নিজের তথ্য দেখা, ঠিক করা বা দোকান বন্ধ করে তথ্য মুছে ফেলার অনুরোধ করতে পারেন — <a href="/contact">যোগাযোগ করুন</a>।</p>
  </Legal>
);

export const RefundPage = () => (
  <Legal title="রিফান্ড নীতি">
    <ul>
      <li>ফ্রি ট্রায়ালে কোনো টাকা লাগে না, তাই রিফান্ডেরও কিছু নেই।</li>
      <li>রিচার্জ করা টাকা থেকে শুধু ব্যবহারের চার্জ কাটে (মাসিক, কনফার্ম অর্ডার, স্টাফ)। ফেক বা বাতিল অর্ডারে কাটে না।</li>
      <li>ভুল করে চার্জ কাটলে জানালে যাচাই করে ব্যালেন্সে ফেরত দেওয়া হয়।</li>
      <li>দোকান বন্ধ করলে ব্যবহার না হওয়া ব্যালেন্স ফেরতের অনুরোধ করতে পারেন — বন্ধের ৩০ দিনের মধ্যে, bKash/Nagad-এর খরচ বাদে।</li>
      <li>ভুল Transaction ID দিলে বা টাকা অন্য নম্বরে পাঠালে আমাদের কাছে না এলে আমরা দায়ী নই।</li>
    </ul>
    <p>রিফান্ডের জন্য প্যানেলের সাপোর্ট থেকে টিকেট দিন বা <a href="/contact">যোগাযোগ করুন</a>।</p>
  </Legal>
);

/* ---------- হেল্প সেন্টার ---------- */
export const HelpIndexPage = ({ q }: { q: string }) => {
  const query = q.trim().toLowerCase();
  const list = query ? HELP.filter((a) => (a.title + a.summary + a.steps.join(" ")).toLowerCase().includes(query)) : HELP;
  return (
    <>
      <PageHero kicker="হেল্প সেন্টার" title="কীভাবে করবেন? — ধাপে ধাপে" sub={`${bn(HELP.length)}টা ছোট গাইড, সহজ বাংলায়।`} />
      <section class="p-section">
        <div class="wrap">
          <form method="get" action="/help" class="p-help-search">
            <input type="search" name="q" value={q} placeholder="কী জানতে চান? যেমন: কুরিয়ার, ল্যান্ডিং, পিক্সেল" />
            <button class="btn btn-primary">খুঁজুন</button>
          </form>
          {query && !list.length && <p class="center muted">কিছু পাওয়া যায়নি। <a href="/contact">সরাসরি জিজ্ঞেস করুন</a>।</p>}
          {HELP_CATS.map((cat) => {
            const items = list.filter((a) => a.cat === cat);
            return items.length ? (
              <div class="p-help-cat">
                <h2>{cat}</h2>
                <div class="p-help-grid">
                  {items.map((a) => <a href={`/help/${a.slug}`} class="p-help-card"><b>{a.title}</b><span>{a.summary}</span></a>)}
                </div>
              </div>
            ) : null;
          })}
        </div>
      </section>
    </>
  );
};

export const HelpArticlePage = ({ a }: { a: HelpArticle }) => {
  const related = HELP.filter((x) => x.cat === a.cat && x.slug !== a.slug).slice(0, 4);
  return (
    <>
      <section class="p-hero p-hero-sm">
        <div class="wrap p-narrow">
          <a href="/help" class="p-back">← হেল্প সেন্টার</a>
          <span class="p-kicker">{a.cat}</span>
          <h1>{a.title}</h1>
          <p>{a.summary}</p>
        </div>
      </section>
      <section class="p-section">
        <div class="wrap p-narrow p-prose">
          <h2>ধাপে ধাপে</h2>
          <ol class="p-steps">{a.steps.map((s) => <li>{s}</li>)}</ol>
          {a.tips?.length ? (
            <div class="p-tip"><b>খেয়াল রাখুন</b><ul>{a.tips.map((t) => <li>{t}</li>)}</ul></div>
          ) : null}
          {a.admin && <p class="muted">প্যানেলে এই পেজ: <code>{a.admin}</code></p>}
          <div class="p-help-more">
            <p>এখনো বুঝতে সমস্যা? প্যানেলের কোণে <b>সাপোর্ট</b> চাপুন বা <a href="/contact">যোগাযোগ করুন</a>।</p>
          </div>
          {related.length > 0 && (
            <>
              <h2>আরও দেখুন</h2>
              <ul>{related.map((x) => <li><a href={`/help/${x.slug}`}>{x.title}</a></li>)}</ul>
            </>
          )}
        </div>
      </section>
    </>
  );
};

/** ভুল লিংক (৪০৪) — মেনু আর ফুটারসহ, যাতে মানুষ পথ খুঁজে পায় */
export const PlatformNotFoundPage = () => (
  <>
    <PageHero kicker="৪০৪" title="পেজটা পাওয়া যায়নি" sub="লিংকটা হয়তো ভুল, অথবা পেজটা সরানো হয়েছে।" />
    <section class="p-section"><div class="wrap p-narrow p-prose">
      <p class="nf-links"><a class="btn btn-primary" href="/">হোম পেজ</a> <a class="btn" href="/help">হেল্প সেন্টার</a> <a class="btn" href="/pricing">দাম</a></p>
    </div></section>
  </>
);
