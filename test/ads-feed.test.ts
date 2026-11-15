/**
 * ধাপ ৫: ক্যাটালগ ফিড আর অ্যাডের আসল খরচ
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb, setStatus } from "./helpers";
import { dhakaDate } from "../src/shop/lib/reports";

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM ad_spend").run();
  await DB.prepare("DELETE FROM settings WHERE key IN ('feed_enabled', 'feed_brand', 'feed_link', 'ad_usd_rate')").run();
  await DB.prepare("UPDATE products SET image = 'p/test-' || id || '.jpg' WHERE id IN (1, 2)").run();
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 20));
});

describe("ক্যাটালগ ফিড", () => {
  it("XML-এ পণ্যের আইডি, দাম, ছাড়, স্টক আর লিংক থাকে; ছবি ছাড়া পণ্য বাদ", async () => {
    await DB.prepare("UPDATE products SET track_stock = 1, stock = 0 WHERE id = 2").run();
    const r = await new Browser().get("/feed.xml");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/xml");
    const x = await r.text();
    expect(x).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(x).toContain("<g:id>1</g:id>");
    expect(x).toContain("<g:price>1650.00 BDT</g:price>"); // কাটা দাম = আসল দাম
    expect(x).toContain("<g:sale_price>1250.00 BDT</g:sale_price>");
    expect(x).toContain("<link>https://shop.test/p/wooden-wall-shelf</link>");
    expect(x).toContain("<g:image_link>https://shop.test/img/p/test-1.jpg</g:image_link>");
    expect(x).toMatch(/<g:id>2<\/g:id>[\s\S]*?<g:availability>out of stock<\/g:availability>/);
    expect(x).not.toContain("<g:id>3</g:id>"); // ছবি নেই
  });

  it("CSV আর সেটিংস: ব্র্যান্ড, লিংকের ধরন, বন্ধ করা", async () => {
    const admin = await adminBrowser();
    await admin.post("/admin/ads/catalog", { feed_enabled: "1", feed_brand: "কাঠবন", feed_link: "product" });
    const csv = await (await new Browser().get("/feed.csv")).text();
    expect(csv.split("\n")[0]).toContain("id,title,description,availability");
    expect(csv).toContain("কাঠবন");
    expect(csv).toContain("https://shop.test/product/wooden-wall-shelf");
    const page = await (await admin.get("/admin/ads/catalog")).text();
    expect(page).toContain("https://shop.test/feed.xml");
    expect(page).toContain("১টা পণ্যের ছবি নেই");
    await admin.post("/admin/ads/catalog", { feed_link: "landing" });
    expect((await new Browser().get("/feed.xml")).status).toBe(404);
  });
});

describe("অ্যাডের আসল খরচ", () => {
  it("খরচ লেখা, ডলার রেট, আর বাতিল/ফেক/ফেরত বাদ দিয়ে প্রতি ডেলিভারিতে খরচ", async () => {
    const admin = await adminBrowser();
    const today = dhakaDate();
    await admin.post("/admin/ads/rate", { ad_usd_rate: 120 });
    await admin.post("/admin/ads/spend", { day: today, amount: 10, currency: "usd", product_id: "", note: "টেস্ট" });
    await admin.post("/admin/ads/spend", { day: today, amount: 1200, currency: "bdt", product_id: "1" });
    const rows = (await DB.prepare("SELECT amount, usd, product_id FROM ad_spend ORDER BY id").all()).results;
    expect(rows).toEqual([{ amount: 1200, usd: 10, product_id: null }, { amount: 1200, usd: null, product_id: 1 }]);

    // ৪টা অর্ডার: ১টা ডেলিভারি, ১টা কনফার্ম, ১টা ফেক, ১টা ফেরত
    const ids: number[] = [];
    for (const ph of ["01711111111", "01722222222", "01733333333", "01744444444"]) {
      await new Browser().order({ phone: ph });
      ids.push((await lastOrder())!.id);
    }
    await setStatus(admin, ids[0]!, "confirmed");
    await admin.post(`/admin/orders/${ids[0]}/outcome`, { outcome: "delivered" });
    await setStatus(admin, ids[1]!, "confirmed");
    await setStatus(admin, ids[2]!, "fake");
    await setStatus(admin, ids[3]!, "confirmed");
    await admin.post(`/admin/orders/${ids[3]}/outcome`, { outcome: "returned" });

    const html = await (await admin.get("/admin/ads?range=7")).text();
    expect(html).toContain("৳২,৪০০");          // মোট খরচ
    expect(html).toContain("৳৬০০");            // প্রতি অর্ডারে (২৪০০ ÷ ৪)
    expect(html).toContain("৳১,২০০");          // প্রতি কনফার্মে (২৪০০ ÷ ২, ফেরত বাদ)
    expect(html).toContain("৳২,৪০০</div>");    // আসল খরচ (২৪০০ ÷ ১ ডেলিভারি)
    expect(html).toContain("ফেক ১");
    expect(html).toContain("ফেরত ১");

    // পণ্য ধরে: শুধু পণ্য ১-এর খরচ
    const p1 = await (await admin.get("/admin/ads?range=7&product=1")).text();
    expect(p1).toContain("শুধু কাঠের ওয়াল শেলফ");
    expect(p1).toContain("৳১,২০০");
  });

  it("ভুল খরচ নেয় না, মোছা যায়, অর্ডার স্টাফ দেখতে পারে না", async () => {
    const admin = await adminBrowser();
    await admin.post("/admin/ads/spend", { day: "abc", amount: 100, currency: "bdt" });
    await admin.post("/admin/ads/spend", { day: dhakaDate(), amount: -5, currency: "bdt" });
    expect((await DB.prepare("SELECT COUNT(*) n FROM ad_spend").first<{ n: number }>())!.n).toBe(0);
    await admin.post("/admin/ads/spend", { day: dhakaDate(), amount: 500, currency: "bdt" });
    const id = (await DB.prepare("SELECT id FROM ad_spend").first<{ id: number }>())!.id;
    await admin.post(`/admin/ads/spend/${id}/delete`, {});
    expect((await DB.prepare("SELECT COUNT(*) n FROM ad_spend").first<{ n: number }>())!.n).toBe(0);
    await DB.prepare("UPDATE users SET role = 'orders'").run();
    expect((await admin.get("/admin/ads")).status).toBe(403);
  });
});
