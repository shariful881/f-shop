/**
 * ধাপ ৭: রিভিউ, WhatsApp বাটন, লাভের হিসাব
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb, setStatus } from "./helpers";
import { dhakaDate } from "../src/shop/lib/reports";

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM reviews").run();
  await DB.prepare("UPDATE products SET rating_avg = 0, rating_count = 0").run();
  await DB.prepare("DELETE FROM settings WHERE key LIKE 'profit_%' OR key = 'reviews_enabled'").run();
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 20));
});

async function confirmedOrder(phone = "01712345678") {
  const admin = await adminBrowser();
  await new Browser().order({ phone });
  const o = (await lastOrder())!;
  await setStatus(admin, o.id, "confirmed");
  return { admin, o };
}

describe("রিভিউ", () => {
  it("নতুন/বাতিল অর্ডারে দেওয়া যায় না, ভুল মোবাইলে নয়", async () => {
    await new Browser().order();
    const o = (await lastOrder())!;
    const b = new Browser();
    expect(await (await b.get(`/review?o=${o.order_no}&p=01712345678`)).text()).toContain("পণ্য হাতে পাওয়ার পর");
    expect(await (await b.get(`/review?o=${o.order_no}&p=01999999999`)).text()).toContain("মেলেনি");
  });

  it("কেনা ক্রেতা রিভিউ দেয় → অনুমোদনের পর পণ্যের পেজে আর তারা গড়", async () => {
    const { admin, o } = await confirmedOrder();
    const b = new Browser();
    const form = await (await b.get(`/review?o=${o.order_no.toLowerCase()}&p=01712345678`)).text();
    expect(form).toContain("রিভিউ জমা দিন");
    const fd = new FormData();
    for (const [k, v] of Object.entries({ o: o.order_no, p: "01712345678", product_id: "1", rating: "4", body: "দারুণ শেলফ, মজবুত", name: "রহিম উদ্দিন" })) fd.append(k, v);
    fd.append("image", new File([new Uint8Array([255, 216, 255, 0])], "a.jpg", { type: "image/jpeg" }));
    const r = await b.fetch("/review", { method: "POST", body: fd });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("রিভিউর জন্য ধন্যবাদ");
    const rv = (await DB.prepare("SELECT * FROM reviews").first<Record<string, any>>())!;
    expect(rv).toMatchObject({ product_id: 1, order_id: o.id, rating: 4, status: "pending", name: "রহিম উদ্দিন" });
    expect(rv.image).toMatch(/^rv\//);
    // আবার একই পণ্যে নয়
    const fd2 = new FormData();
    for (const [k, v] of Object.entries({ o: o.order_no, p: "01712345678", product_id: "1", rating: "5", name: "x" })) fd2.append(k, v);
    await b.fetch("/review", { method: "POST", body: fd2 });
    expect((await DB.prepare("SELECT COUNT(*) n FROM reviews").first<{ n: number }>())!.n).toBe(1);

    // অনুমোদনের আগে দেখায় না
    expect(await (await b.get("/product/wooden-wall-shelf")).text()).not.toContain("দারুণ শেলফ");
    expect(await (await admin.get("/admin/reviews")).text()).toContain("দারুণ শেলফ");
    await admin.post(`/admin/reviews/${rv.id}`, { status: "approved", reply: "ধন্যবাদ!" });
    const page = await (await b.get("/product/wooden-wall-shelf")).text();
    expect(page).toContain("দারুণ শেলফ");
    expect(page).toContain("রহিম উ.");     // নাম ছোট করে
    expect(page).toContain("দোকানের উত্তর:");
    expect(await DB.prepare("SELECT rating_avg, rating_count FROM products WHERE id = 1").first()).toEqual({ rating_avg: 4, rating_count: 1 });
    expect(await (await b.get("/")).text()).toContain("card-stars");
    // লুকালে গড়ও বদলায়
    await admin.post(`/admin/reviews/${rv.id}`, { status: "hidden" });
    expect(await DB.prepare("SELECT rating_count FROM products WHERE id = 1").first()).toEqual({ rating_count: 0 });
  });

  it("রিভিউ বন্ধ করলে পাতা আর ফর্ম নেই", async () => {
    const admin = await adminBrowser();
    await admin.post("/admin/reviews/settings", {});
    expect((await new Browser().get("/review")).status).toBe(404);
    expect(await (await new Browser().get("/product/wooden-wall-shelf")).text()).not.toContain("ক্রেতাদের রিভিউ");
  });
});

describe("WhatsApp বাটন", () => {
  it("অবস্থা অনুযায়ী মেসেজ, কনফার্মে রিভিউর লিংকসহ", async () => {
    const admin = await adminBrowser();
    await new Browser().order();
    const o = (await lastOrder())!;
    let html = await (await admin.get(`/admin/orders/${o.id}`)).text();
    expect(html).toContain("https://wa.me/8801712345678?text=");
    expect(html).toContain("কনফার্ম করতে");
    await setStatus(admin, o.id, "confirmed");
    html = await (await admin.get(`/admin/orders/${o.id}`)).text();
    expect(html).toContain("কনফার্ম হয়েছে জানাতে");
    expect(html).toContain("রিভিউ চাইতে");
    expect(html).toContain(encodeURIComponent(`/review?o=${o.order_no}&p=01712345678`));
  });
});

describe("লাভের হিসাব", () => {
  it("ক্রয়মূল্য, কুরিয়ার, ফেরত, COD আর অ্যাড বাদ দিয়ে নিট লাভ", async () => {
    await DB.prepare("UPDATE products SET cost_price = 800 WHERE id = 1").run();
    const admin = await adminBrowser();
    await admin.post("/admin/profit/settings", { profit_ship_inside: 60, profit_ship_outside: 120, profit_return_cost: 30, profit_cod_pct: 1 });
    // ২টা বিক্রি (ঢাকার ভিতরে, ৳১২৫০ + ৳৭০), ১টা ফেরত
    const ids: number[] = [];
    for (const ph of ["01711111111", "01722222222", "01733333333"]) {
      await new Browser().order({ phone: ph });
      ids.push((await lastOrder())!.id);
      await setStatus(admin, ids[ids.length - 1]!, "confirmed");
    }
    await admin.post(`/admin/orders/${ids[2]}/outcome`, { outcome: "returned" });
    // পরে ক্রয়মূল্য বদলালেও কনফার্মের সময়েরটা থাকে
    await DB.prepare("UPDATE products SET cost_price = 900 WHERE id = 1").run();
    await admin.post("/admin/ads/spend", { day: dhakaDate(), amount: 500, currency: "bdt" });
    const html = await (await admin.get("/admin/profit?range=7")).text();
    // বিক্রি ২ × ১৩২০ = ২৬৪০; ক্রয় ১৬০০; কুরিয়ার ৩ × ৬০ = ১৮০; ফেরত ৩০; COD ২৬; অ্যাড ৫০০ → নিট ৩০৪
    expect(html).toContain("৳২,৬৪০");
    expect(html).toContain("-৳১,৬০০");
    expect(html).toContain("-৳১৮০");
    expect(html).toContain("-৳৩০");
    expect(html).toContain("-৳২৬");
    expect(html).toContain("-৳৫০০");
    expect(html).toContain("৳৩০৪");
    expect((await DB.prepare("SELECT unit_cost FROM order_items WHERE order_id = ?").bind(ids[0]).first<{ unit_cost: number }>())!.unit_cost).toBe(800);
  });

  it("অর্ডার স্টাফ লাভ আর রিভিউ দেখতে পারে না", async () => {
    const admin = await adminBrowser();
    await DB.prepare("UPDATE users SET role = 'orders'").run();
    expect((await admin.get("/admin/profit")).status).toBe(403);
    expect((await admin.get("/admin/reviews")).status).toBe(403);
  });
});
