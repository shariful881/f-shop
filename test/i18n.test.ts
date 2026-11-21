import { beforeEach, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { BASE, Browser, DB, adminBrowser, resetDb } from "./helpers";
import { makeTranslator } from "../src/shop/i18n/engine";
import { t, runWithLang, tLines } from "../src/shop/i18n";
import { bn, taka } from "../src/shop/lib/format";
import { waMessages } from "../src/shop/lib/whatsapp";

beforeEach(resetDb);

const setLang = (site: string, admin: string) =>
  DB.prepare("INSERT INTO settings (key,value) VALUES ('site_lang',?),('admin_lang',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(site, admin).run();

describe("অনুবাদের ইঞ্জিন", () => {
  const T = makeTranslator({
    "কার্টে যোগ করুন": "Add to cart",
    "{x}টা পণ্য": "{x} items",
    "ছবি {x}": "Image {x}",
    "মাসে {x}টা অর্ডার": "{x} orders a month",
    "দুঃখিত, \"{x}\" মাত্র {x}টা আছে": "Sorry, only {x2} of \"{x1}\" left",
    "কল করে অর্ডার করুন": "Call to order",
    "সেট করা নেই": "not set",
    "নতুন": "New",
    "অবস্থা: {x}": "Status: {x}",
  });
  it("হুবহু, সংখ্যা, ফাঁকা জায়গা ঠিক থাকে", () => {
    expect(T.tr("  কার্টে যোগ করুন ")).toBe("  Add to cart ");
    expect(T.tr("৩টা পণ্য")).toBe("3 items");
    expect(T.tr("12টা পণ্য")).toBe("12 items");
    expect(T.tr("মাসে ১৫০টা অর্ডার")).toBe("150 orders a month");
  });
  it("{x1}{x2} দিয়ে ক্রম বদলানো যায়", () => {
    expect(T.tr("দুঃখিত, \"শাড়ি\" মাত্র ২টা আছে")).toBe("Sorry, only 2 of \"শাড়ি\" left");
  });
  it("ভেতরের পরিচিত লেখাও অনুবাদ হয়", () => {
    expect(T.tr("অবস্থা: নতুন")).toBe("Status: New");
  });
  it("দুই পাশের ইমোজি/বন্ধনী আর লেখার মাঝের বাংলা অংশ", () => {
    expect(T.tr("📞 কল করে অর্ডার করুন")).toBe("📞 Call to order");
    expect(T.tr("CAPI Access Token (সেট করা নেই)")).toBe("CAPI Access Token (not set)");
  });
  it("অচেনা লেখা (দোকানদারের নিজের) বদলায় না, ছোট টেমপ্লেট ভুল করে মেলে না", () => {
    expect(T.tr("কাঠের ওয়াল শেলফ")).toBeNull();
    expect(T.tr("ছবি বাছুন ▾")).toBeNull();
    expect(T.tr("ঘর সাজানো — কার্টে যোগ করুন")).toBeNull();
    expect(T.tr("Hello")).toBeNull();
    expect(T.tr("৳৪৫০")).toBeNull();
  });
});

describe("সার্ভারের সাহায্যকারী", () => {
  it("t(), সংখ্যা আর টাকা চলতি ভাষায়", () => {
    expect(t("কার্টে যোগ করুন", "en")).toBe("Add to cart");
    expect(t("কার্টে যোগ করুন", "bn")).toBe("কার্টে যোগ করুন");
    expect(runWithLang("en", () => taka(1250))).toBe("৳1,250");
    expect(runWithLang("bn", () => taka(1250))).toBe("৳১,২৫০");
    expect(bn(5)).toBe("৫");
  });
  it("কয়েক লাইনের লেখায় লাইন ভাঙা ঠিক থাকে", () => {
    expect(tLines("কার্টে যোগ করুন\nঅর্ডার করুন", "en")).toBe("Add to cart\nOrder now");
  });
  it("WhatsApp মেসেজ ওয়েবসাইটের ভাষায়", () => {
    const o = { status: "confirmed", name: "Rahim", order_no: "FS-12", total: 1250, phone: "01712345678", address: "Dhaka", pay_trx: null, advance_amount: 0, tracking_code: null, outcome: null } as any;
    const en = waMessages(o, [{ product_name: "Shelf", variant_label: null, qty: 1 }], { site_name: "KathBon", site_lang: "en" }, "https://x.test");
    expect(en[0]!.text).toContain("Hello Rahim, this is KathBon.");
    expect(en[0]!.text).toContain("Your order FS-12 is confirmed");
    expect(en[0]!.text).not.toMatch(/[ঀ-৲]/);
    const bnMsg = waMessages(o, [{ product_name: "Shelf", variant_label: null, qty: 1 }], { site_name: "KathBon" }, "https://x.test");
    expect(bnMsg[0]!.text).toContain("আসসালামু আলাইকুম");
  });
});

describe("দোকান আর অ্যাডমিনের ভাষা", () => {
  it("ডিফল্ট বাংলা — কিছু বদলায় না", async () => {
    const h = await (await SELF.fetch(BASE + "/")).text();
    expect(h).toContain('<html lang="bn"');
    expect(h).not.toContain("/i18n/");
    expect(h).toContain("কার্টে যোগ");
  });

  it("ওয়েবসাইট ইংরেজি: বাটন-মেনু ইংরেজি, দাম ইংরেজি অঙ্কে, পণ্যের নাম যেমন আছে; অ্যাডমিন বাংলাই", async () => {
    await setLang("en", "bn");
    const h = await (await SELF.fetch(BASE + "/")).text();
    expect(h).toContain('<html lang="en"');
    expect(h).toContain("/i18n/en-site.js");
    expect(h).toContain("Add to cart");
    expect(h).toContain("Track order");
    expect(h).toContain("কাঠের ওয়াল শেলফ"); // দোকানদারের পণ্যের নাম
    expect(h).toMatch(/৳1,250/);
    const p = await DB.prepare("SELECT slug FROM products LIMIT 1").first<{ slug: string }>();
    const lp = await (await SELF.fetch(BASE + "/p/" + p!.slug)).text();
    expect(lp).toContain("Full address *");
    expect(lp).toContain("Inside Dhaka");
    // textarea-র placeholder অনুবাদ হয়, দামের পরে বাড়তি চিহ্ন আসে না
    expect(lp).toContain('placeholder="House, road, area, thana, district"');
    expect(lp).not.toMatch(/৳[0-9,]+%/);
    const a = await adminBrowser();
    const ad = await (await a.get("/admin")).text();
    expect(ad).toContain('<html lang="bn"');
    expect(ad).toContain("ড্যাশবোর্ড");
  });

  it("অ্যাডমিন ইংরেজি: প্যানেল ইংরেজি, দোকান বাংলাই", async () => {
    await setLang("bn", "en");
    const a = await adminBrowser();
    const ad = await (await a.get("/admin/orders")).text();
    expect(ad).toContain('<html lang="en"');
    expect(ad).toContain("/i18n/en.js");
    expect(ad).toContain("Dashboard");
    expect(ad).toContain("Search by number / name / order no.");
    expect(ad).not.toContain("ড্যাশবোর্ড");
    const h = await (await SELF.fetch(BASE + "/")).text();
    expect(h).toContain('<html lang="bn"');
  });

  it("ইনভয়েস অ্যাডমিন থেকে খুললেও ওয়েবসাইটের ভাষায়", async () => {
    const b = new Browser();
    await b.order();
    const o = await DB.prepare("SELECT id FROM orders ORDER BY id DESC LIMIT 1").first<{ id: number }>();
    await setLang("en", "bn");
    const a = await adminBrowser();
    const inv = await (await a.get(`/admin/orders/${o!.id}/invoice`)).text();
    expect(inv).toContain('<html lang="en"');
    expect(inv).toContain("Ship to");
    await setLang("bn", "en");
    const inv2 = await (await a.get(`/admin/orders/${o!.id}/invoice`)).text();
    expect(inv2).toContain("যাকে পাঠানো হবে");
  });

  it("সেটিংস থেকে ভাষা বাছা যায়; ভুল মান হলে বাংলা", async () => {
    const a = await adminBrowser();
    const base = { site_name: "আমার দোকান", contact_phone: "01811111111" };
    await a.post("/admin/settings", { ...base, site_lang: "en", admin_lang: "bn" });
    const got = async (k: string) => (await DB.prepare("SELECT value FROM settings WHERE key=?").bind(k).first<{ value: string }>())?.value;
    expect(await got("site_lang")).toBe("en");
    expect(await got("admin_lang")).toBe("bn");
    await a.post("/admin/settings", { ...base, site_lang: "fr", admin_lang: "<x>" });
    expect(await got("site_lang")).toBe("bn");
    expect(await got("admin_lang")).toBe("bn");
    const page = await (await a.get("/admin/settings")).text();
    expect(page).toContain('name="site_lang"');
    expect(page).toContain('name="admin_lang"');
  });

  it("ব্রাউজারের অভিধান ফাইল আসে (দুটো আলাদা মাপের)", async () => {
    const adm = await SELF.fetch(BASE + "/i18n/en.js");
    const site = await SELF.fetch(BASE + "/i18n/en-site.js");
    expect(adm.headers.get("content-type")).toContain("javascript");
    const [aj, sj] = [await adm.text(), await site.text()];
    expect(aj).toContain("makeTranslator");
    expect(sj.length).toBeLessThan(aj.length);
    // ব্রাউজারে চালানো যায় এমন JavaScript
    expect(() => new Function(aj)).not.toThrow();
  });
});
