import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb, setStatus } from "./helpers";
import { discountFor } from "../src/shop/lib/coupons";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

async function makeCoupon(a: Browser, data: Record<string, string | number>) {
  return a.post("/admin/coupons", { once_per_phone: 1, min_order: 0, ...data });
}

describe("কুপনের হিসাব", () => {
  it("টাকা, শতাংশ (সর্বোচ্চ সীমাসহ), ফ্রি ডেলিভারি", () => {
    expect(discountFor({ type: "fixed", value: 100, max_discount: null }, 1250, 70)).toBe(100);
    expect(discountFor({ type: "fixed", value: 5000, max_discount: null }, 1250, 70)).toBe(1250);
    expect(discountFor({ type: "percent", value: 10, max_discount: null }, 1250, 70)).toBe(125);
    expect(discountFor({ type: "percent", value: 50, max_discount: 200 }, 1250, 70)).toBe(200);
    expect(discountFor({ type: "free_delivery", value: 0, max_discount: null }, 1250, 130)).toBe(130);
  });
});

describe("অ্যাডমিনে কুপন", () => {
  it("তৈরি, একই কোড দুবার নয়, বন্ধ/চালু; ছোট হাতের কোড বড় হয়", async () => {
    const a = await adminBrowser();
    expect((await makeCoupon(a, { code: "eid100", type: "fixed", value: 100 })).status).toBe(303);
    const dup = await makeCoupon(a, { code: "EID100", type: "fixed", value: 50 });
    expect(dup.status).toBe(422);
    expect(await dup.text()).toContain("আগেই আছে");
    const c = await DB.prepare("SELECT id, code, active FROM coupons").first<any>();
    expect(c.code).toBe("EID100");
    await a.post(`/admin/coupons/${c.id}/toggle`, {});
    expect((await DB.prepare("SELECT active FROM coupons").first<any>()).active).toBe(0);
  });

  it("অর্ডার স্টাফ কুপন পেজ দেখতে পারে না, ম্যানেজার পারে", async () => {
    const a = await adminBrowser();
    await a.post("/admin/staff", { name: "অর্ডার স্টাফ", email: "o@s.test", password: "staffpass1", role: "orders" });
    await a.post("/admin/staff", { name: "ম্যানেজার", email: "m@s.test", password: "staffpass1", role: "manager" });
    const o = new Browser(); await o.post("/admin/login", { email: "o@s.test", password: "staffpass1" });
    const m = new Browser(); await m.post("/admin/login", { email: "m@s.test", password: "staffpass1" });
    expect((await o.get("/admin/coupons")).status).toBe(403);
    expect((await m.get("/admin/coupons")).status).toBe(200);
  });
});

describe("কাস্টমারের অর্ডারে কুপন", () => {
  it("টাকায় ছাড়: মোট থেকে বাদ যায়, অর্ডারে কোড সেভ হয়, ব্যবহারের সংখ্যা বাড়ে", async () => {
    const a = await adminBrowser();
    await makeCoupon(a, { code: "SAVE100", type: "fixed", value: 100 });
    const b = new Browser();
    expect((await b.order({ coupon: "save100" })).status).toBe(303);
    const o = (await lastOrder())!;
    expect(o).toMatchObject({ subtotal: 1250, delivery_charge: 70, discount: 100, total: 1220, coupon_code: "SAVE100" });
    expect((await DB.prepare("SELECT used_count FROM coupons").first<any>()).used_count).toBe(1);
    const thanks = await (await b.get("/thanks")).text();
    expect(thanks).toContain("কুপন ছাড় (SAVE100)");
    const detail = await (await a.get(`/admin/orders/${o.id}`)).text();
    expect(detail).toContain("কুপন ছাড় (SAVE100)");
  });

  it("শতাংশ আর ফ্রি ডেলিভারি", async () => {
    const a = await adminBrowser();
    await makeCoupon(a, { code: "TEN", type: "percent", value: 10, max_discount: 100 });
    await makeCoupon(a, { code: "FREEDEL", type: "free_delivery" });
    await new Browser().order({ coupon: "TEN", phone: "01711111111" });
    expect((await lastOrder())!).toMatchObject({ discount: 100, total: 1250 + 70 - 100 });
    await new Browser().order({ coupon: "FREEDEL", phone: "01722222222", area: "outside" });
    expect((await lastOrder())!).toMatchObject({ delivery_charge: 130, discount: 130, total: 1250 });
  });

  it("ভুল, বন্ধ, মেয়াদ শেষ, সর্বনিম্ন দাম না হলে অর্ডার হয় না — বার্তা দেখায়", async () => {
    const a = await adminBrowser();
    await makeCoupon(a, { code: "BIG", type: "fixed", value: 50, min_order: 2000 });
    await makeCoupon(a, { code: "OLD", type: "fixed", value: 50, expires_at: "2020-01-01T10:00" });
    const cases: [string, string][] = [["NAI", "সঠিক নয়"], ["BIG", "কমপক্ষে ৳2000"], ["OLD", "মেয়াদ শেষ"]];
    for (const [code, msg] of cases) {
      const r = await new Browser().order({ coupon: code });
      expect(r.status).toBe(422);
      expect(await r.text()).toContain(msg);
    }
    expect(await DB.prepare("SELECT COUNT(*) n FROM orders").first()).toEqual({ n: 0 });
  });

  it("এক নম্বরে একবারই; মোট ব্যবহারের সীমা", async () => {
    const a = await adminBrowser();
    await makeCoupon(a, { code: "ONCE", type: "fixed", value: 50 });
    await makeCoupon(a, { code: "TWO", type: "fixed", value: 50, usage_limit: 1, once_per_phone: 0 });
    await new Browser().order({ coupon: "ONCE", phone: "01711111111" });
    const o = (await lastOrder())!;
    await setStatus(a, o.id, "confirmed"); // কনফার্মের পর আবার অর্ডার দেওয়া যায়, কিন্তু কুপন নয়
    const r = await new Browser().order({ coupon: "ONCE", phone: "01711111111" });
    expect(await r.text()).toContain("আগেই ব্যবহার করা হয়েছে");

    await new Browser().order({ coupon: "TWO", phone: "01733333333" });
    const r2 = await new Browser().order({ coupon: "TWO", phone: "01744444444" });
    expect(await r2.text()).toContain("আর ব্যবহার করা যাবে না");
  });

  it("লাইভ চেক (/coupon/check) ছাড় আর নিয়ম ফেরত দেয়", async () => {
    const a = await adminBrowser();
    await makeCoupon(a, { code: "TEN", type: "percent", value: 10 });
    const ok = await (await new Browser().post("/coupon/check", { coupon: "ten", source: "landing", product_id: 1, area: "inside" })).json<any>();
    expect(ok).toMatchObject({ ok: true, code: "TEN", type: "percent", value: 10, discount: 125 });
    const bad = await (await new Browser().post("/coupon/check", { coupon: "x1", source: "landing", product_id: 1 })).json<any>();
    expect(bad.ok).toBe(false);
  });

  it("Purchase-এ ছাড়ের পরের মোট টাকা যায়", async () => {
    const a = await adminBrowser();
    await makeCoupon(a, { code: "SAVE100", type: "fixed", value: 100 });
    await DB.prepare("UPDATE settings SET value = CASE key WHEN 'fb_pixel_id' THEN '123' WHEN 'fb_capi_token' THEN 'T' ELSE value END WHERE key IN ('fb_pixel_id','fb_capi_token')").run();
    const bodies: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_i: any, init?: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    });
    await new Browser().order({ coupon: "SAVE100" });
    const o = (await lastOrder())!;
    await setStatus(a, o.id, "confirmed");
    await new Promise((r) => setTimeout(r, 50));
    const purchase = bodies.flatMap((b) => b.data).find((e: any) => e.event_name === "Purchase");
    expect(purchase.custom_data.value).toBe(1220);
  });
});
