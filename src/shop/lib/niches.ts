/**
 * নিশ প্যাক — ডেমো দোকান আর সাইনআপের "রেডি দোকান"-এর ডাটা।
 * ডাটা আসে demo/niches.py থেকে বানানো src/shop/data/niches.json থেকে।
 * পণ্যের slug = <নিশ>-<NN> (যেমন sutokotha-01), তাই ছবির ফাইলের নামের সাথে মেলে।
 */
import data from "../data/niches.json";
import { defaultLanding } from "./landing";
import type { Product } from "./products";

export type NicheProduct = { cat: string; name: string; price: number; compare: number; variants: string[] };
export type Niche = {
  key: string; niche: string; name: string; tagline: string; theme: "pro" | "classic" | "minimal" | "bold";
  colors: { primary: string; accent: string }; delivery: [number, number];
  cats: string[]; products: NicheProduct[]; about: string; bullets: string[];
};

export const NICHES = data as unknown as Niche[];
export const nicheByKey = (key: string | undefined | null) => NICHES.find((n) => n.key === key);
export const nicheProductSlug = (key: string, i: number) => `${key}-${String(i + 1).padStart(2, "0")}`;

type Stmt = { bind(...v: unknown[]): unknown };
type Db = { prepare(q: string): Stmt };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const bnNum = (n: number) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[+d]!);

function pages(n: Niche, phone: string) {
  const [inside, outside] = n.delivery;
  const call = phone ? `<p>যেকোনো প্রশ্নে কল বা WhatsApp করুন: <b>${esc(phone)}</b></p>` : "";
  return [
    ["আমাদের সম্পর্কে", "about", `<p>${esc(n.about)}</p><p>সারাদেশে ক্যাশ অন ডেলিভারিতে পণ্য পাঠানো হয় — পণ্য হাতে পেয়ে টাকা দিন।</p>${call}`],
    ["ডেলিভারি তথ্য", "delivery", `<ul><li>ঢাকার ভেতরে ডেলিভারি চার্জ ৳${bnNum(inside)}, সময় ১–২ দিন</li><li>ঢাকার বাইরে ডেলিভারি চার্জ ৳${bnNum(outside)}, সময় ২–৪ দিন</li><li>অর্ডারের পর ফোন করে কনফার্ম করা হয়</li></ul>`],
    ["রিটার্ন ও রিফান্ড", "return-policy", `<ul><li>ডেলিভারির সময় পণ্য দেখে নিন। ভুল বা ক্ষতিগ্রস্ত পণ্য হলে সাথে সাথে ফেরত দিন।</li><li>পরে সমস্যা পেলে ৩ দিনের মধ্যে জানান — পরিবর্তন করে দেওয়া হবে।</li><li>ব্যবহৃত বা প্যাকেট খোলা পণ্য (স্বাস্থ্য ও খাবারের পণ্য) ফেরত নেওয়া হয় না।</li></ul>`],
    ["সাধারণ প্রশ্ন", "faq", `<h3>কীভাবে অর্ডার করব?</h3><p>পণ্য বেছে "এখনই কিনুন" চাপুন, নাম-ফোন-ঠিকানা লিখে অর্ডার কনফার্ম করুন।</p><h3>টাকা কখন দেব?</h3><p>পণ্য হাতে পেয়ে ডেলিভারিম্যানকে টাকা দেবেন।</p><h3>কত দিনে পাব?</h3><p>ঢাকায় ১–২ দিন, ঢাকার বাইরে ২–৪ দিন।</p>${call}`],
  ] as const;
}

/**
 * দোকানে নিশ বসানোর SQL (একসাথে batch-এ চালাতে হবে)।
 * withProducts=false হলে শুধু ক্যাটাগরি, থিম, রং, ডেলিভারি, পেজ।
 */
export function nicheStatements(db: Db, n: Niche, opts: { withProducts: boolean; phone?: string }) {
  const out: unknown[] = [];
  const set = (k: string, v: string) =>
    out.push(db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v));

  n.cats.forEach((name, i) => out.push(db.prepare("INSERT INTO categories (name, sort_order) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ?)").bind(name, i + 1, name)));

  if (opts.withProducts) {
    const bullets = n.bullets.map((b) => `<li>${esc(b)}</li>`).join("");
    n.products.forEach((p, i) => {
      const slug = nicheProductSlug(n.key, i);
      const details = `<h3>পণ্যের বিবরণ</h3><ul>${bullets}</ul><p>ঢাকার ভেতরে ১–২ দিনে, ঢাকার বাইরে ২–৪ দিনে ক্যাশ অন ডেলিভারি।</p>`;
      out.push(db.prepare(
        `INSERT OR IGNORE INTO products (category_id, name, slug, price, compare_price, headline, short_desc, details_html, is_active, show_on_home, sort_order)
         VALUES ((SELECT id FROM categories WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      ).bind(p.cat, p.name, slug, p.price, p.compare || null, p.name, `${p.name} — ${n.tagline}।`, details, i + 1));
      p.variants.forEach((label, vi) => out.push(db.prepare(
        "INSERT OR IGNORE INTO product_variants (product_id, label, sort_order) VALUES ((SELECT id FROM products WHERE slug = ?), ?, ?)",
      ).bind(slug, label, vi + 1)));
    });
  }

  set("theme", n.theme);
  set("brand_color", n.colors.primary);
  set("accent_color", n.colors.accent);
  set("delivery_inside", String(n.delivery[0]));
  set("delivery_outside", String(n.delivery[1]));
  set("seo_description", n.about);
  set(`theme_cfg_${n.theme}`, JSON.stringify({
    topbar: "1", announcement: n.tagline, header_search: "1", header_nav: "1",
    sec_categories: "1", sec_trust: "1", sec_latest: "1", latest_count: "8",
    footer_about: n.about, footer_trust: "1", float_whatsapp: "1", bottom_nav: "1",
  }));
  for (const [title, slug, content] of pages(n, opts.phone || "")) {
    out.push(db.prepare("INSERT OR IGNORE INTO pages (title, slug, content, in_menu, sort_order) VALUES (?, ?, ?, 1, ?)").bind(title, slug, content, out.length));
  }
  return out;
}

/**
 * "সাধারণ দোকান" — সাইনআপে কোনো নিশ না বাছলে নমুনা পণ্য (মোঃ, ২৭ নভেম্বর ২০২৬):
 * আগের ৩টা কাঠের পণ্যে ছবি ছিল না, প্রো স্টোর থিমে দোকান খালি খালি দেখাত।
 * এখন কয়েকটা নিশের ডেমো ছবি মিলিয়ে ১২টা পণ্য, ৩টা ব্যানার আর ক্যাটাগরির ছবি — কপি নয় (key "demo/<file>")।
 */
type GeneralItem = { cat: string; img: string; name: string; price: number; compare: number; variants?: string[]; features?: string[] };
export const GENERAL_CATS: { name: string; img: string }[] = [
  { name: "গ্যাজেট", img: "gadgetpara-05" },
  { name: "রান্নাঘর", img: "rannaghor-01" },
  { name: "ফ্যাশন", img: "sutokotha-01" },
  { name: "বিউটি ও যত্ন", img: "tokmaya-05" },
  { name: "বাচ্চার পণ্য", img: "chhottosona-11" },
  { name: "খাবার", img: "khatibari-01" },
];
/** ২৪টা নমুনা পণ্য — প্রতি ক্যাটাগরিতে ৪টা (ছবি demo/<img>.jpg) */
export const GENERAL_ITEMS: GeneralItem[] = [
  { cat: "গ্যাজেট", img: "gadgetpara-05", name: "কলিং স্মার্টওয়াচ ১.৯৬\" — ব্ল্যাক", price: 2450, compare: 3200, features: ["ব্লুটুথ কলিং — ঘড়ি থেকেই কথা বলুন", "১.৯৬ ইঞ্চি বড় HD ডিসপ্লে", "হার্ট রেট, ঘুম আর হাঁটার হিসাব", "এক চার্জে ৫–৭ দিন", "পানি-ঘাম প্রতিরোধী (IP67)"] },
  { cat: "গ্যাজেট", img: "gadgetpara-01", name: "TWS ইয়ারবাড ENC — ব্ল্যাক", price: 1450, compare: 1950 },
  { cat: "গ্যাজেট", img: "gadgetpara-13", name: "পাওয়ার ব্যাংক ২০০০০mAh ২২.৫W", price: 2150, compare: 2700 },
  { cat: "গ্যাজেট", img: "gadgetpara-12", name: "ব্লুটুথ স্পিকার মিনি", price: 1450, compare: 1900 },
  { cat: "রান্নাঘর", img: "rannaghor-01", name: "১৪-ইন-১ ভেজিটেবল কাটার", price: 950, compare: 1250 },
  { cat: "রান্নাঘর", img: "rannaghor-07", name: "নন-স্টিক ফ্রাই প্যান ২৬cm", price: 1450, compare: 1850 },
  { cat: "রান্নাঘর", img: "rannaghor-13", name: "ইলেকট্রিক কেটলি ১.৮ লিটার", price: 1150, compare: 1450 },
  { cat: "রান্নাঘর", img: "rannaghor-10", name: "রোটেটিং স্পাইস র‍্যাক ১৬ জার", price: 1650, compare: 2100 },
  { cat: "ফ্যাশন", img: "sutokotha-01", name: "ফ্লোরাল প্রিন্ট লন থ্রি-পিস — গোলাপি", price: 2150, compare: 2650 },
  { cat: "ফ্যাশন", img: "sutokotha-18", name: "রেডিমেড লন কুর্তি — টিল", price: 1250, compare: 1600, variants: ["M", "L", "XL"] },
  { cat: "ফ্যাশন", img: "sutokotha-09", name: "শিফন পার্টি থ্রি-পিস — রয়্যাল ব্লু", price: 4650, compare: 5600 },
  { cat: "ফ্যাশন", img: "sutokotha-17", name: "রেডিমেড এমব্রয়ডারি কুর্তি — নেভি", price: 1450, compare: 1850, variants: ["M", "L", "XL"] },
  { cat: "বিউটি ও যত্ন", img: "tokmaya-05", name: "ভিটামিন সি ব্রাইটেনিং সিরাম — ৩০ml", price: 1450, compare: 1850 },
  { cat: "বিউটি ও যত্ন", img: "tokmaya-01", name: "ওয়াটারি সান জেল SPF50+ — ৫০ml", price: 1150, compare: 1450 },
  { cat: "বিউটি ও যত্ন", img: "tokmaya-13", name: "সেরামাইড ব্যারিয়ার ক্রিম — ৫০ml", price: 1550, compare: 1950 },
  { cat: "বিউটি ও যত্ন", img: "tokmaya-17", name: "রোজমেরি হেয়ার অয়েল — ১০০ml", price: 650, compare: 850 },
  { cat: "বাচ্চার পণ্য", img: "chhottosona-11", name: "সফট টেডি বিয়ার ২৪ ইঞ্চি", price: 990, compare: 1300 },
  { cat: "বাচ্চার পণ্য", img: "chhottosona-05", name: "নিউবর্ন কটন রমপার সেট ৩ পিস", price: 990, compare: 1300, variants: ["০–৩ মাস", "৩–৬ মাস", "৬–১২ মাস"] },
  { cat: "বাচ্চার পণ্য", img: "chhottosona-13", name: "বেবি ক্যারিয়ার ৬-ইন-১", price: 1650, compare: 2100 },
  { cat: "বাচ্চার পণ্য", img: "chhottosona-01", name: "অ্যান্টি-কলিক ফিডার ২৬০ml", price: 750, compare: 950 },
  { cat: "খাবার", img: "khatibari-01", name: "সুন্দরবনের খলিশা ফুলের মধু — ১ কেজি", price: 1350, compare: 1650 },
  { cat: "খাবার", img: "khatibari-05", name: "গাওয়া ঘি — ১ কেজি", price: 1650, compare: 1950 },
  { cat: "খাবার", img: "khatibari-09", name: "আজওয়া খেজুর — ১ কেজি", price: 1650, compare: 1900 },
  { cat: "খাবার", img: "khatibari-16", name: "মিক্সড ড্রাই ফ্রুট — ৫০০g", price: 890, compare: 1100 },
];
export const GENERAL_BANNERS = ["gadgetpara-banner-1", "rannaghor-banner-1", "sutokotha-banner-1"];
/** এই পণ্যে নমুনা ল্যান্ডিং পেজ */
export const GENERAL_LANDING_IMG = "gadgetpara-05";
const GENERAL_ABOUT = "আমরা বাছাই করা মানের পণ্য সারাদেশে ক্যাশ অন ডেলিভারিতে পৌঁছে দিই — পণ্য হাতে পেয়ে দেখে টাকা দিন।";
export const generalSlug = (img: string) => `nomuna-${img}`;

/** সাধারণ নমুনা দোকানের SQL — শুধু খালি জায়গায় (ব্যানার/ক্যাটাগরির ছবি আগে থাকলে বদলায় না) */
export function generalStatements(db: Db, opts: { phone?: string; tagline?: string }) {
  const out: unknown[] = [];
  const setIfEmpty = (k: string, v: string) =>
    out.push(db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value = ''").bind(k, v));
  GENERAL_CATS.forEach((c, i) => {
    out.push(db.prepare("INSERT INTO categories (name, sort_order) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ?)").bind(c.name, i + 1, c.name));
    out.push(db.prepare("UPDATE categories SET image = ? WHERE name = ? AND (image IS NULL OR image = '')").bind(`demo/${c.img}.jpg`, c.name));
  });
  GENERAL_ITEMS.forEach((p, i) => {
    const slug = generalSlug(p.img);
    const features = (p.features ?? []).join("\n");
    const short = `${p.name} — নমুনা পণ্য, নিজের পণ্য যোগ করে এটা মুছে দিন।`;
    const details = "<h3>পণ্যের বিবরণ</h3><p>এটা নমুনা পণ্য — আপনার দোকান কেমন দেখাবে বোঝার জন্য। অ্যাডমিন প্যানেল থেকে নিজের পণ্য যোগ করুন, তারপর পণ্য তালিকার \"সব নমুনা পণ্য মুছুন\" বোতামে চাপ দিন।</p><p>ঢাকার ভেতরে ১–২ দিনে, ঢাকার বাইরে ২–৪ দিনে ক্যাশ অন ডেলিভারি।</p>";
    const landing = p.img === GENERAL_LANDING_IMG ? sampleLanding(p, slug, short, details) : null;
    out.push(db.prepare(
      `INSERT OR IGNORE INTO products (category_id, name, slug, price, compare_price, headline, short_desc, details_html, image, features, landing_json, is_active, show_on_home, sort_order)
       VALUES ((SELECT id FROM categories WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
    ).bind(p.cat, p.name, slug, p.price, p.compare, p.name, short, details, `demo/${p.img}.jpg`, features || null, landing, i + 1));
    (p.variants ?? []).forEach((label, vi) => out.push(db.prepare(
      "INSERT OR IGNORE INTO product_variants (product_id, label, sort_order) VALUES ((SELECT id FROM products WHERE slug = ?), ?, ?)",
    ).bind(slug, label, vi + 1)));
  });
  // দোকানের পেজ (আমাদের সম্পর্কে, ডেলিভারি, রিটার্ন, প্রশ্ন) — নিশের মতো
  const pseudo = { about: GENERAL_ABOUT, delivery: [70, 130] } as unknown as Niche;
  for (const [title, pslug, content] of pages(pseudo, opts.phone || "")) {
    out.push(db.prepare("INSERT OR IGNORE INTO pages (title, slug, content, in_menu, sort_order) VALUES (?, ?, ?, 1, ?)").bind(title, pslug, content, out.length));
  }
  out.push(db.prepare("INSERT INTO settings (key, value) VALUES ('seo_description', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value = ''").bind(GENERAL_ABOUT));
  GENERAL_BANNERS.forEach((b, i) => setIfEmpty(`banner_${i + 1}`, `demo/${b}.jpg`));
  out.push(db.prepare("INSERT INTO settings (key, value) VALUES ('theme_cfg_pro', ?) ON CONFLICT(key) DO NOTHING").bind(JSON.stringify({
    topbar: "1", announcement: opts.tagline || "ক্যাশ অন ডেলিভারি — পণ্য হাতে পেয়ে টাকা দিন", header_search: "1", header_nav: "1",
    sec_categories: "1", sec_trust: "1", sec_latest: "1", latest_count: "8", footer_about: GENERAL_ABOUT, footer_trust: "1", float_whatsapp: "1", bottom_nav: "1",
  })));
  return out;
}

/** নমুনা ল্যান্ডিং পেজ (স্মার্টওয়াচ) — বিল্ডারের ডিফল্ট সাজানো, গ্যালারিতে ৩টা ছবি, কাউন্টডাউন চালু */
function sampleLanding(p: GeneralItem, slug: string, short: string, details: string): string {
  const l = defaultLanding({
    id: 0, slug, name: p.name, price: p.price, compare_price: p.compare, headline: `${p.name} — এখন অফারে`, short_desc: "কল ধরুন, স্বাস্থ্য দেখুন, নোটিফিকেশন পান — সব হাতের কব্জিতে।",
    details_html: details, image: `demo/${p.img}.jpg`, gallery_json: JSON.stringify(["demo/gadgetpara-06.jpg", "demo/gadgetpara-07.jpg"]),
    features: (p.features ?? []).join("\n"), youtube_url: null,
  } as unknown as Product);
  for (const sec of l.sections) if (sec.type === "countdown") sec.enabled = true;
  void short;
  return JSON.stringify(l);
}

/** দোকানের নমুনা পণ্য চেনার নিয়ম (সাধারণ নমুনা + নিশের নমুনা) — "সব নমুনা পণ্য মুছুন"-এর জন্য */
export const SAMPLE_SLUG_SQL = `(slug LIKE 'nomuna-%' OR ${NICHES.map((n) => `slug GLOB '${n.key}-[0-9][0-9]'`).join(" OR ")})`;

/** নিশের ক্যাটাগরিতে ছবি (প্রথম পণ্যের ডেমো ছবি) — টাইলে খালি আইকন না দেখাতে */
export function nicheCategoryImages(db: Db, n: Niche) {
  return n.cats.map((name) => {
    const i = n.products.findIndex((p) => p.cat === name);
    return i < 0 ? null : db.prepare("UPDATE categories SET image = ? WHERE name = ? AND (image IS NULL OR image = '')").bind(`demo/${nicheProductSlug(n.key, i)}.jpg`, name);
  }).filter(Boolean);
}

/** নমুনার ক্যাটাগরির নাম (খালি হলে মোছা যায়) */
export const SAMPLE_CATS = [...new Set([...GENERAL_CATS.map((c) => c.name), "ঘর সাজানো", ...NICHES.flatMap((n) => n.cats)])];
