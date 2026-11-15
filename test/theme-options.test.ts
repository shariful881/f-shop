import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM settings WHERE key LIKE 'theme_cfg_%'").run();
  await DB.prepare("UPDATE settings SET value = 'pro' WHERE key = 'theme'").run();
  await DB.prepare("UPDATE settings SET value = '0' WHERE key = 'free_delivery_min'").run();
});
const get = async (path: string) => (await new Browser().get(path)).text();
const save = async (a: Browser, data: Record<string, string>) => a.post("/admin/settings/customize", { header_sticky: "1", ...data });

describe("থিমের বাড়তি অপশন", () => {
  it("হেডারের ৪টা ডিজাইন আর কার্টের আইকন", async () => {
    const a = await adminBrowser();
    for (const [layout, marker] of [["center", "px-h-center"], ["inline", "px-h-inline"], ["colored", 'class="site-header"']] as const) {
      await save(a, { header_layout: layout, header_nav: "1", header_search: "1" });
      expect(await get("/")).toContain(marker);
    }
    await save(a, { header_layout: "standard", cart_icon: "bag" });
    const html = await get("/");
    expect(html).toContain('class="px-header"');
    expect(html).toContain("M5 8h14l-1 13H6z"); // ব্যাগ আইকন
  });

  it("হোমপেজের নতুন সেকশন: নিজে বাছাই করা অফার, নতুন পণ্য, ভিডিও, ফিচার বক্স", async () => {
    const a = await adminBrowser();
    await save(a, {
      home_order: "features,offer1,latest,video,products,banner,categories,offers,midbanner,offer2,offer3,trust,text",
      sec_features: "1", sec_offer1: "1", sec_latest: "1", sec_video: "1", sec_products: "1",
      offer1_title: "ঈদের বাছাই", offer1_products: "3", latest_title: "একদম নতুন", latest_count: "4",
      video_url: "https://youtu.be/dQw4w9WgXcQ", feature_1: "২৪ ঘণ্টায় ডেলিভারি", feature_1_icon: "clock",
    });
    const html = await get("/");
    expect(html).toContain("ঈদের বাছাই");
    expect(html).toContain("একদম নতুন");
    expect(html).toContain('data-yt="dQw4w9WgXcQ"');
    expect(html).toContain("২৪ ঘণ্টায় ডেলিভারি");
    expect(html.indexOf("২৪ ঘণ্টায় ডেলিভারি")).toBeLessThan(html.indexOf("ঈদের বাছাই"));
  });

  it("চার থিমের নিজস্ব ডিজাইন: শিরোনাম, উপরের অংশ, ক্যাটাগরি, কার্ড আলাদা", async () => {
    const want = {
      pro: ["ts-bar", "hs-sidebar", "px-hero-grid", "cs-icons", "cd-pro", "data-countdown-midnight"],
      classic: ["ts-ribbon", "hs-slider", "cs-circle", "cd-classic", "px-features"],
      minimal: ["ts-eyebrow", "hs-full", "cs-tiles", "cd-minimal", "px-h-center"],
      bold: ["ts-marker", "hs-skew", "cs-cards", "cd-bold", "px-marquee", "px-h-inline"],
    } as const;
    for (const [theme, marks] of Object.entries(want)) {
      await DB.prepare("UPDATE settings SET value = ? WHERE key = 'theme'").bind(theme).run();
      const html = await get("/");
      for (const m of marks) expect(html, `${theme}: ${m}`).toContain(m);
    }
    // ব্যানার না থাকলে বড় শিরোনাম (খালি জায়গা নয়)
    expect(await get("/")).toContain("px-hero-text");
  });

  it("বিশ্বাসের ব্যাজ হোম সেকশন আর ফুটার দুটোতে চালু থাকলেও হোমপেজে একবারই দেখায়", async () => {
    const a = await adminBrowser();
    const count = (h: string) => h.split('class="px-trust-strip"').length - 1;
    const t = { trust_1: "ক্যাশ অন ডেলিভারি", trust_2: "সারাদেশে ডেলিভারি" };
    await save(a, { ...t, sec_trust: "1", footer_trust: "1", sec_products: "1", home_order: "products,trust" });
    const h1 = await get("/");
    expect(count(h1)).toBe(1);
    await save(a, { ...t, sec_trust: "1", footer_trust: "", sec_products: "1", home_order: "products,trust" });
    const html = await get("/");
    expect(count(html)).toBe(1);
    expect(html).toContain("px-home-trust");
  });

  it("পপআপ, উপরে যান বাটন, ফ্রি ডেলিভারি ট্যাগ, ছবির অনুপাত, ট্যাবলেটের কলাম", async () => {
    await DB.prepare("UPDATE settings SET value = '1000' WHERE key = 'free_delivery_min'").run();
    const a = await adminBrowser();
    await save(a, { popup_on: "1", popup_image: "theme/abc-123.jpg", popup_link: "/p/wooden-wall-shelf", back_top: "1", free_tag: "1", img_ratio: "4/5", per_row_tablet: "4", sec_products: "1", home_order: "products" });
    const html = await get("/");
    expect(html).toContain("data-popup");
    expect(html).toContain("data-back-top");
    expect(html).toContain("ফ্রি ডেলিভারি</span>");
    expect(html).toContain("aspect-ratio:4/5");
    expect(html).toContain("@media(min-width:700px){.grid,.theme-pro .px-grid{grid-template-columns:repeat(4,1fr)}");
  });

  it("ক্যাটাগরি পেজে সাজানো (দাম কম থেকে বেশি)", async () => {
    const cat = (await DB.prepare("SELECT category_id id FROM products WHERE is_active = 1 GROUP BY category_id HAVING COUNT(*) > 1 LIMIT 1").first<any>());
    if (!cat) return;
    const html = await get(`/c/${cat.id}?sort=price_asc`);
    const prices = [...html.matchAll(/<span class="price">৳([০-৯,]+)<\/span>/g)].map((m) => +m[1]!.replace(/,/g, "").replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))));
    expect(prices.length).toBeGreaterThan(1);
    expect([...prices].sort((x, y) => x - y)).toEqual(prices);
    expect(html).toContain('name="sort"');
  });

  it("দোকান সাময়িক বন্ধ: কাস্টমার শুধু লেখা দেখে, ল্যান্ডিং পেজ খোলা, অ্যাডমিন সব দেখে", async () => {
    const a = await adminBrowser();
    await save(a, { coming_soon: "1", coming_soon_text: "নতুন রূপে আসছি" });
    expect(await get("/")).toContain("নতুন রূপে আসছি");
    expect(await get("/p/wooden-wall-shelf")).not.toContain("নতুন রূপে আসছি");
    expect(await (await a.get("/")).text()).not.toContain("নতুন রূপে আসছি");
  });

  it("অর্ডার ট্র্যাকিং: নম্বর আর মোবাইল মিললে অবস্থা দেখায়", async () => {
    const b = new Browser();
    await b.order({ phone: "01712345678" });
    const o = (await DB.prepare("SELECT order_no FROM orders ORDER BY id DESC LIMIT 1").first<any>())!;
    const ok = await get(`/track?order=${o.order_no}&phone=01712345678`);
    expect(ok).toContain(o.order_no);
    expect(ok).toContain("px-steps");
    const bad = await get(`/track?order=${o.order_no}&phone=01799999999`);
    expect(bad).toContain("কোনো অর্ডার পাওয়া যায়নি");
    expect(bad).not.toContain("px-steps");
  });

  it("ধন্যবাদের লেখায় নাম আর অর্ডার নম্বর বসে", async () => {
    await DB.prepare("UPDATE settings SET value = 'প্রিয় {name}, অর্ডার {order_no} পেয়েছি' WHERE key = 'thanks_message'").run();
    const b = new Browser();
    const r = await b.order({ phone: "01712345678" });
    const loc = r.headers.get("location")!;
    const o = (await DB.prepare("SELECT name, order_no FROM orders ORDER BY id DESC LIMIT 1").first<any>())!;
    const html = await (await b.get(loc)).text();
    expect(html).toContain(`প্রিয় ${o.name}, অর্ডার ${o.order_no} পেয়েছি`);
  });

  it("সেটিংস পেজে ছবি দেখে বাছাই আর পণ্যের তালিকা", async () => {
    const a = await adminBrowser();
    const html = await (await a.get("/admin/design")).text();
    expect(html).toContain("cz-pv-header-center");
    expect(html).toContain('name="offer1_products"');
    expect(html).toContain('enctype="multipart/form-data"');
  });
});
