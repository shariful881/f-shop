import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM settings WHERE key LIKE 'theme_cfg_%'").run();
});

describe("পণ্যের বিস্তারিত পেজ", () => {
  for (const theme of ["pro", "classic", "minimal", "bold"]) {
    it(`${theme} থিমে পেজ খোলে: ছবি, দাম, এখনই কিনুন, কার্টে যোগ, ডেলিভারি তথ্য — অর্ডার ফর্ম নয়`, async () => {
      await DB.prepare("UPDATE settings SET value = ? WHERE key = 'theme'").bind(theme).run();
      const html = await (await new Browser().get("/product/wooden-wall-shelf")).text();
      expect(html).toContain('class="pp-title"');
      expect(html).toContain("এখনই কিনুন");
      expect(html).toContain("কার্টে যোগ করুন");
      expect(html).toContain("ঢাকার বাইরে");
      expect(html).not.toContain('action="/order"'); // চেকআউটের ফর্ম না
      expect(html).toContain(`class="theme-${theme}"`);
    });
  }

  it("এখনই কিনুন → কার্টে রেখে চেকআউটে; কার্টে যোগ → কার্টে", async () => {
    const b = new Browser();
    const r = await b.post("/cart/add", { product_id: "1", buy_now: "1" });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/checkout");
    const co = await (await b.get("/checkout")).text();
    expect(co).toContain("কাঠের ওয়াল শেলফ");
    expect(co).toContain('action="/order"');
  });

  it("ভ্যারিয়েন্ট থাকলে বাছাই ছাড়া কেনা যায় না; বাছাই করলে সেটাই কার্টে", async () => {
    const a = await adminBrowser();
    const form = await (await a.get("/admin/products/1/edit")).text();
    expect(form).toContain("opt0_name");
    await DB.prepare("UPDATE products SET options_json = ? WHERE id = 1").bind(JSON.stringify([{ name: "সাইজ", values: ["ছোট", "বড়"] }])).run();
    await DB.batch([
      DB.prepare("INSERT INTO product_variants (product_id, label, sort_order, active) VALUES (1, 'ছোট', 0, 1)"),
      DB.prepare("INSERT INTO product_variants (product_id, label, sort_order, active, price) VALUES (1, 'বড়', 1, 1, 1500)"),
    ]);
    const b = new Browser();
    const no = await b.post("/cart/add", { product_id: "1", buy_now: "1" });
    expect(no.headers.get("location")).toBe("/product/wooden-wall-shelf?need=variant#buy");
    expect(await (await b.get("/product/wooden-wall-shelf?need=variant")).text()).toContain("সাইজ/রং বাছাই করুন");
    const big = (await DB.prepare("SELECT id FROM product_variants WHERE label = 'বড়'").first<any>()).id;
    await b.post("/cart/add", { product_id: "1", variant_id: String(big), buy_now: "1" });
    const co = await (await b.get("/checkout")).text();
    expect(co).toContain("বড়");
    expect(co).toContain("৳১,৫০০");
  });

  it("কার্ডের লিংক সেটিং: বিস্তারিত পেজ বা সরাসরি ল্যান্ডিং পেজ", async () => {
    await DB.prepare("UPDATE settings SET value = 'pro' WHERE key = 'theme'").run();
    expect(await (await new Browser().get("/")).text()).toContain('href="/product/wooden-wall-shelf"');
    const a = await adminBrowser();
    await a.post("/admin/settings/customize", { product_link: "landing", header_sticky: "1", card_order_btn: "1", card_cart_btn: "1" });
    const cat = (await DB.prepare("SELECT category_id id FROM products WHERE slug = 'wooden-wall-shelf'").first<any>())!.id;
    const html = await (await new Browser().get(`/c/${cat}`)).text();
    expect(html).toContain('href="/p/wooden-wall-shelf"');
    expect(html).not.toContain('href="/product/wooden-wall-shelf"');
  });

  it("ল্যান্ডিং পেজ (/p/) আগের মতোই অর্ডার ফর্মসহ খোলে", async () => {
    const html = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(html).toContain('action="/order"');
  });
});
