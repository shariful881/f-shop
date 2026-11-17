import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, DB, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM reviews").run();
  await DB.prepare("DELETE FROM settings WHERE key = 'reviews_enabled'").run();
});

async function productWithReview() {
  const p = (await DB.prepare("SELECT id, slug FROM products WHERE is_active = 1 ORDER BY id LIMIT 1").first<{ id: number; slug: string }>())!;
  await DB.prepare("INSERT INTO reviews (product_id, order_id, name, rating, body, status, reply) VALUES (?, 1, 'রহিম উদ্দিন', 5, 'রিভিউ-লেখা-৪২', 'approved', 'উত্তর-৯৯')").bind(p.id).run();
  await DB.prepare("UPDATE products SET rating_avg = 5, rating_count = 1 WHERE id = ?").bind(p.id).run();
  return p;
}

describe("থিম এডিটর — ক্রেতাদের রিভিউ", () => {
  it("শিরোনাম, সাজানো, ব্যাজ, উত্তর, বাটন — খসড়া প্রিভিউতে সেটিং মেনে দেখায়", async () => {
    const p = await productWithReview();
    const a = await adminBrowser();
    const before = await (await a.get(`/product/${p.slug}?__preview=1`)).text();
    expect(before).toContain("ক্রেতাদের রিভিউ");
    expect(before).toContain("✓ যাচাই করা ক্রেতা");
    expect(before).toContain("উত্তর-৯৯");

    // টগল না পাঠালে বন্ধ: rv_verified, rv_reply, rv_btn বন্ধ; rv_show চালু
    const body = new URLSearchParams([["home_order", "banner"], ["rv_show", "1"], ["rv_landing", "1"], ["rv_summary", "1"], ["rv_photos", "1"],
      ["rv_title", "আমাদের ক্রেতারা বলছেন"], ["rv_layout", "slider"], ["rv_count", "3"], ["rv_empty", "show"], ["c_star", "#ff0000"], ["c_star_on", "1"]]);
    expect(await (await a.fetch("/admin/design/draft", { method: "POST", body })).json()).toEqual({ ok: true, changed: true });

    const html = await (await a.get(`/product/${p.slug}?__preview=1`)).text();
    expect(html).toContain("আমাদের ক্রেতারা বলছেন");
    expect(html).toContain("rv-slider");
    expect(html).toContain("রিভিউ-লেখা-৪২");
    expect(html).not.toContain("✓ যাচাই করা ক্রেতা");
    expect(html).not.toContain("উত্তর-৯৯");
    expect(html).not.toContain("/review?from=");
    expect(html).toContain(".stars-on{color:#ff0000}");
  });

  it("রিভিউ অংশ বন্ধ করলে পণ্যের পেজে দেখায় না; রিভিউ না থাকলে লুকানো যায়", async () => {
    const p = (await DB.prepare("SELECT slug FROM products WHERE is_active = 1 ORDER BY id LIMIT 1").first<{ slug: string }>())!;
    const a = await adminBrowser();
    expect(await (await a.get(`/product/${p.slug}?__preview=1`)).text()).toContain("এখনো কোনো রিভিউ নেই");

    await a.fetch("/admin/design/draft", { method: "POST", body: new URLSearchParams([["home_order", "banner"], ["rv_show", "1"], ["rv_empty", "hide"]]) });
    expect(await (await a.get(`/product/${p.slug}?__preview=1`)).text()).not.toContain('id="reviews"');

    await a.fetch("/admin/design/draft", { method: "POST", body: new URLSearchParams([["home_order", "banner"], ["rv_empty", "show"]]) });
    expect(await (await a.get(`/product/${p.slug}?__preview=1`)).text()).not.toContain('id="reviews"');
  });

  it("এডিটরে রিভিউ ভাগ আছে আর পণ্যের পেজের প্রিভিউ লিংক দেয়", async () => {
    const p = await productWithReview();
    const html = await (await (await adminBrowser()).get("/admin/design")).text();
    expect(html).toContain('data-group="reviews"');
    expect(html).toContain(`data-page="/product/${p.slug}#reviews"`);
    expect(html).toContain(`<option value="/product/${p.slug}">`);
  });
});
