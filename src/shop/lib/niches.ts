/**
 * নিশ প্যাক — ডেমো দোকান আর সাইনআপের "রেডি দোকান"-এর ডাটা।
 * ডাটা আসে demo/niches.py থেকে বানানো src/shop/data/niches.json থেকে।
 * পণ্যের slug = <নিশ>-<NN> (যেমন sutokotha-01), তাই ছবির ফাইলের নামের সাথে মেলে।
 */
import data from "../data/niches.json";

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
