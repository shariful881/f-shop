import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Browser, countOrders, lastOrder, resetDb, DB } from "./helpers";

beforeEach(resetDb);

describe("হোম পেজ", () => {
  it("ক্যাটাগরি অনুযায়ী সেকশন আর পণ্যের কার্ড দেখায়", async () => {
    const res = await new Browser().get("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ঘর সাজানো");
    expect(html).toContain("রান্নাঘর");
    expect(html).toContain("কাঠের ওয়াল শেলফ");
    expect(html).toContain("৳১,২৫০");
    expect(html).toContain("<del"); // কাটা দাম
    expect(html).toContain('href="/product/wooden-wall-shelf"'); // কার্ড → পণ্যের বিস্তারিত পেজ
    expect(html).toContain("কার্টে যোগ");
  });

  it("অ্যাডমিনের ঠিক করা ক্রমে ক্যাটাগরি দেখায়", async () => {
    await DB.prepare("UPDATE categories SET sort_order = CASE id WHEN 1 THEN 5 ELSE 1 END").run();
    const html = await (await new Browser().get("/")).text();
    expect(html.indexOf("রান্নাঘর")).toBeLessThan(html.indexOf("ঘর সাজানো"));
  });

  it("বন্ধ বা হোমে-না-দেখানো পণ্য দেখায় না", async () => {
    await DB.prepare("UPDATE products SET is_active = 0 WHERE id = 1").run();
    await DB.prepare("UPDATE products SET show_on_home = 0 WHERE id = 2").run();
    const html = await (await new Browser().get("/")).text();
    expect(html).not.toContain("কাঠের ওয়াল শেলফ");
    expect(html).not.toContain("হাতে বানানো ফটো ফ্রেম");
    expect(html).toContain("কাঠের চপিং বোর্ড");
  });
});

describe("ল্যান্ডিং পেজ", () => {
  it("শিরোনাম, দাম, বর্ণনা, বিস্তারিত HTML আর অর্ডার ফর্ম দেখায়", async () => {
    const res = await new Browser().get("/p/wooden-wall-shelf");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ঘরের দেয়ালে আনুন প্রাকৃতিক কাঠের সৌন্দর্য");
    expect(html).toContain("<h3>কেন এই শেলফ?</h3>");
    expect(html).toContain('id="order-form"');
    expect(html).toContain("sticky-order");
  });

  it("YouTube লিংক থাকলে ভিডিও দেখায়", async () => {
    await DB.prepare("UPDATE products SET youtube_url='https://youtu.be/abcdefghijk' WHERE id=1").run();
    const html = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(html).toContain('data-yt="abcdefghijk"');
  });

  it("বন্ধ পণ্যের পেজ ৪০৪", async () => {
    await DB.prepare("UPDATE products SET is_active = 0 WHERE id = 1").run();
    expect((await new Browser().get("/p/wooden-wall-shelf")).status).toBe(404);
    expect((await new Browser().get("/p/nai")).status).toBe(404);
  });
});

describe("কার্ট আর অর্ডার", () => {
  it("এক অর্ডারে একাধিক আলাদা পণ্য নেওয়া যায়, ডেলিভারি চার্জসহ মোট ঠিক হয়", async () => {
    const b = new Browser();
    await b.post("/cart/add", { product_id: 1 });
    await b.post("/cart/add", { product_id: 3 });
    const cart = await (await b.get("/cart")).text();
    expect(cart).toContain("কাঠের ওয়াল শেলফ");
    expect(cart).toContain("কাঠের চপিং বোর্ড");
    expect((await b.get("/checkout")).status).toBe(200);

    const res = await b.post("/order", {
      source: "cart", name: "করিম", phone: "01812345678", address: "চট্টগ্রাম সদর", area: "outside",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/thanks");

    const o = await lastOrder();
    expect(o!.order_no).toBe("FS-100001");
    expect(o!.subtotal).toBe(1250 + 690);
    expect(o!.delivery_charge).toBe(130);
    expect(o!.total).toBe(1250 + 690 + 130);
    expect(o!.status).toBe("new");
    const items = await DB.prepare("SELECT * FROM order_items WHERE order_id=?").bind(o!.id).all();
    expect(items.results).toHaveLength(2);

    // কার্ট খালি হয়েছে, ধন্যবাদ পেজে অর্ডার নম্বর আর সারাংশ
    expect(b.cookies.get("cart") ?? "").toBe("");
    const thanks = await (await b.get("/thanks")).text();
    expect(thanks).toContain("FS-100001");
    expect(thanks).toContain("৳২,০৭০");
  });

  it("ল্যান্ডিং ফর্ম থেকে শুধু ওই পণ্যের অর্ডার হয়, ঢাকার ভিতরের চার্জসহ", async () => {
    const b = new Browser();
    await b.post("/cart/add", { product_id: 2 }); // কার্টে অন্য পণ্য থাকলেও
    const res = await b.order({ product_id: 3 });
    expect(res.status).toBe(303);
    const o = await lastOrder();
    expect(o!.total).toBe(690 + 70);
    const items = await DB.prepare("SELECT product_id FROM order_items WHERE order_id=?").bind(o!.id).all();
    expect(items.results).toEqual([{ product_id: 3 }]);
  });

  it("ঘর ফাঁকা থাকলে অর্ডার হয় না, ভুল দেখায়", async () => {
    const res = await new Browser().order({ name: "", address: "" });
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain("আপনার নাম লিখুন");
    expect(await countOrders()).toBe(0);
  });

  it("বন্ধ পণ্যের অর্ডার হয় না", async () => {
    await DB.prepare("UPDATE products SET is_active = 0 WHERE id = 1").run();
    await new Browser().order();
    expect(await countOrders()).toBe(0);
  });

  it("অন্য সাইট থেকে POST আটকায় (CSRF)", async () => {
    const res = await new Browser().post("/cart/add", { product_id: 1 }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("Codespaces proxy-র পেছনে (X-Forwarded-Host) POST কাজ করে", async () => {
    const res = await new Browser().post("/cart/add", { product_id: 1 }, {
      origin: "https://abc-8000.app.github.dev",
      "x-forwarded-host": "abc-8000.app.github.dev",
      "x-forwarded-proto": "https",
    });
    expect(res.status).toBe(303);
  });
});
