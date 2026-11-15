/**
 * ধাপ ৩: অসম্পূর্ণ অর্ডার, সব দোকানের মিলিত রেকর্ড, কুরিয়ারের ডেলিভারি রেকর্ড
 */
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, DB, DEMO_SHOP_ID, lastOrder, resetDb, setStatus } from "./helpers";
import { outcomeFromCourier, phoneHash, riskOf } from "../src/shop/lib/fraud";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
const PHONE = "01712345678";

beforeEach(async () => {
  await resetDb();
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 30));
  vi.restoreAllMocks();
});

const draft = (b: Browser, over: Record<string, string> = {}) =>
  b.post("/t/draft", { source: "landing", product_id: "1", phone: PHONE, name: "করিম", address: "", area: "", ...over });

describe("অসম্পূর্ণ অর্ডার", () => {
  it("সঠিক নম্বর লিখে চলে গেলে তালিকায় আসে, আবার লিখলে একই লাইন আপডেট হয়", async () => {
    const buyer = new Browser();
    expect((await draft(buyer)).status).toBe(204);
    expect((await draft(buyer, { address: "বাসা ১, ধানমন্ডি", name: "" })).status).toBe(204);
    const rows = (await DB.prepare("SELECT * FROM incomplete_orders").all<Record<string, any>>()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: PHONE, name: "করিম", address: "বাসা ১, ধানমন্ডি", status: "open" });
    expect(JSON.parse(rows[0]!.items)[0].productId).toBe(1);

    const admin = await adminBrowser();
    const html = await (await admin.get("/admin/incomplete")).text();
    expect(html).toContain(PHONE);
    expect(html).toContain("wa.me/8801712345678");
  });

  it("ভুল নম্বর, বন্ধ সেটিং বা ব্লক করা নম্বর হলে কিছু রাখে না", async () => {
    const buyer = new Browser();
    await draft(buyer, { phone: "12345" });
    await DB.prepare("INSERT INTO blacklist_entries (type, value, reason) VALUES ('phone', '01811111111', 'manual')").run();
    await draft(buyer, { phone: "01811111111" });
    await DB.prepare("INSERT INTO settings (key, value) VALUES ('incomplete_capture', '0')").run();
    await draft(buyer, { phone: "01912345678" });
    expect((await DB.prepare("SELECT COUNT(*) n FROM incomplete_orders").first<{ n: number }>())!.n).toBe(0);
  });

  it("ক্রেতা নিজে অর্ডার করলে লাইনটা 'অর্ডার হয়েছে'-তে যায়", async () => {
    const buyer = new Browser();
    await draft(buyer);
    expect((await buyer.order()).status).toBe(303);
    const o = await lastOrder();
    const row = await DB.prepare("SELECT status, order_id FROM incomplete_orders").first<Record<string, any>>();
    expect(row).toMatchObject({ status: "converted", order_id: o!.id });
  });

  it("দোকানদার এক ক্লিকে অর্ডার বানাতে পারে, কল করেছি/বাদ দিতে পারে", async () => {
    const buyer = new Browser();
    await draft(buyer);
    const row = (await DB.prepare("SELECT id FROM incomplete_orders").first<{ id: number }>())!;
    const admin = await adminBrowser();
    await admin.post(`/admin/incomplete/${row.id}/status`, { status: "called" });
    expect((await DB.prepare("SELECT status FROM incomplete_orders").first<{ status: string }>())!.status).toBe("called");

    expect(await (await admin.get(`/admin/incomplete/${row.id}`)).text()).toContain("অর্ডার বানান");
    // ঠিকানা ছাড়া হবে না
    expect((await admin.post(`/admin/incomplete/${row.id}/convert`, { name: "করিম", address: "", area: "inside" })).status).toBe(422);
    const r = await admin.post(`/admin/incomplete/${row.id}/convert`, { name: "করিম", address: "বাসা ৯, উত্তরা, ঢাকা", area: "outside", note: "" });
    expect(r.status).toBe(303);
    const o = (await lastOrder())!;
    expect(r.headers.get("location")).toBe(`/admin/orders/${o.id}`);
    expect(o).toMatchObject({ phone: PHONE, status: "new", area: "outside", name: "করিম" });
    expect((await DB.prepare("SELECT status FROM incomplete_orders").first<{ status: string }>())!.status).toBe("converted");

    // নতুন একটা ধরে বাদ দেওয়া
    await draft(new Browser(), { phone: "01912345678" });
    const r2 = (await DB.prepare("SELECT id FROM incomplete_orders WHERE phone = '01912345678'").first<{ id: number }>())!;
    await admin.post(`/admin/incomplete/${r2.id}/status`, { status: "dismissed" });
    expect((await DB.prepare("SELECT status FROM incomplete_orders WHERE id = ?").bind(r2.id).first<{ status: string }>())!.status).toBe("dismissed");
  });

  it("অর্ডার স্টাফও অসম্পূর্ণ অর্ডার দেখতে পারে", async () => {
    const admin = await adminBrowser();
    await DB.prepare("UPDATE users SET role = 'orders'").run();
    expect((await admin.get("/admin/incomplete")).status).toBe(200);
  });
});

describe("সব দোকানের মিলিত রেকর্ড", () => {
  it("ফেক করলে মূল ডাটাবেসে শুধু হ্যাশ করা নম্বর আর ফল যায়", async () => {
    const buyer = new Browser();
    await buyer.order();
    const o = (await lastOrder())!;
    const admin = await adminBrowser();
    await setStatus(admin, o.id, "fake");
    const rows = (await env.PLATFORM_DB.prepare("SELECT * FROM phone_outcomes").all<Record<string, any>>()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ shop_id: DEMO_SHOP_ID, order_no: o.order_no, outcome: "fake" });
    expect(rows[0]!.phone_hash).not.toContain(PHONE);
    expect(rows[0]!.phone_hash).toHaveLength(64);
  });

  it("অন্য দোকানের ফেক রেকর্ড দেখায়, কিন্তু দোকানের নাম নয়", async () => {
    const h = await phoneHash(env.PLATFORM_DB, PHONE);
    await env.PLATFORM_DB.batch([
      env.PLATFORM_DB.prepare("INSERT INTO phone_outcomes (shop_id, order_no, phone_hash, outcome) VALUES ('other-1', 'X-1', ?, 'fake')").bind(h),
      env.PLATFORM_DB.prepare("INSERT INTO phone_outcomes (shop_id, order_no, phone_hash, outcome) VALUES ('other-2', 'Y-1', ?, 'fake')").bind(h),
      env.PLATFORM_DB.prepare("INSERT INTO phone_outcomes (shop_id, order_no, phone_hash, outcome) VALUES ('other-2', 'Y-2', ?, 'delivered')").bind(h),
    ]);
    await new Browser().order();
    const o = (await lastOrder())!;
    const admin = await adminBrowser();
    const html = await (await admin.get(`/admin/orders/${o.id}`)).text();
    expect(html).toContain("ক্রেতার রেকর্ড");
    expect(html).toContain("ঝুঁকি বেশি");
    expect(html).toContain("২টা দোকান");
    expect(html).not.toContain("other-1");
    expect(await (await admin.get("/admin/orders?status=new")).text()).toContain("ঝুঁকি বেশি");
  });

  it("শেয়ার বন্ধ করলে লেখেও না, দেখায়ও না", async () => {
    const h = await phoneHash(env.PLATFORM_DB, PHONE);
    await env.PLATFORM_DB.prepare("INSERT INTO phone_outcomes (shop_id, order_no, phone_hash, outcome) VALUES ('other-1', 'X-1', ?, 'fake')").bind(h).run();
    const admin = await adminBrowser();
    await admin.post("/admin/courier", {}); // চেকবক্স ছাড়া সেভ = বন্ধ
    expect((await DB.prepare("SELECT value FROM settings WHERE key = 'fraud_share'").first<{ value: string }>())!.value).toBe("0");
    await new Browser().order();
    const o = (await lastOrder())!;
    expect(await (await admin.get(`/admin/orders/${o.id}`)).text()).not.toContain("ঝুঁকি বেশি");
    await setStatus(admin, o.id, "fake");
    expect((await env.PLATFORM_DB.prepare("SELECT COUNT(*) n FROM phone_outcomes WHERE shop_id = ?").bind(DEMO_SHOP_ID).first<{ n: number }>())!.n).toBe(0);
  });

  it("ডেলিভারি/ফেরত নিজে চাপলে বা কুরিয়ারের স্ট্যাটাসে বসে", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/status_by_cid/")) return json({ status: 200, delivery_status: "delivered" });
      return json({ ok: true });
    });
    const admin = await adminBrowser();
    await new Browser().order();
    const o1 = (await lastOrder())!;
    await setStatus(admin, o1.id, "confirmed");
    await admin.post(`/admin/orders/${o1.id}/outcome`, { outcome: "returned" });
    expect((await DB.prepare("SELECT outcome FROM orders WHERE id = ?").bind(o1.id).first<{ outcome: string }>())!.outcome).toBe("returned");
    expect((await env.PLATFORM_DB.prepare("SELECT outcome FROM phone_outcomes WHERE order_no = ?").bind(o1.order_no).first<{ outcome: string }>())!.outcome).toBe("returned");

    // কুরিয়ারে পাঠানো অর্ডার: স্ট্যাটাস আপডেটে "delivered" এলে
    await new Browser().order({ phone: "01912345678" });
    const o2 = (await lastOrder())!;
    await DB.prepare("UPDATE orders SET status = 'shipped', courier = 'steadfast', consignment_id = '77' WHERE id = ?").bind(o2.id).run();
    await DB.prepare("INSERT INTO settings (key, value) VALUES ('steadfast_api_key', 'K'), ('steadfast_secret_key', 'S') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    await admin.post(`/admin/orders/${o2.id}/courier/status`, {});
    expect((await DB.prepare("SELECT outcome FROM orders WHERE id = ?").bind(o2.id).first<{ outcome: string }>())!.outcome).toBe("delivered");

    // নতুন অর্ডারে ফল দেওয়া যায় না
    await new Browser().order({ phone: "01612345678" });
    const o3 = (await lastOrder())!;
    await admin.post(`/admin/orders/${o3.id}/outcome`, { outcome: "delivered" });
    expect((await DB.prepare("SELECT outcome FROM orders WHERE id = ?").bind(o3.id).first<{ outcome: string | null }>())!.outcome).toBeNull();
  });
});

describe("কুরিয়ারের ডেলিভারি রেকর্ড", () => {
  it("Steadfast-এর চাবি দিয়ে খোঁজে আর ক্যাশে রাখে", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      calls.push(url);
      if (url.includes("/fraud_check/score/")) return json({ status: 200, phone: PHONE, delivery_ratio: 92, cancellation_ratio: 7, volume_band: "high", total_reports: 0 });
      return json({ ok: true });
    });
    const admin = await adminBrowser();
    await new Browser().order();
    const o = (await lastOrder())!;
    expect(await (await admin.get(`/admin/orders/${o.id}`)).text()).toContain("কুরিয়ার সেটিংসে");
    await admin.post("/admin/courier", { steadfast_api_key: "K", steadfast_secret_key: "S", fraud_share: "1" });
    expect((await admin.post(`/admin/orders/${o.id}/courier-check`, {})).status).toBe(303);
    expect(calls.some((u) => u.endsWith(`/fraud_check/score/${PHONE}`))).toBe(true);
    const html = await (await admin.get(`/admin/orders/${o.id}`)).text();
    expect(html).toContain("Steadfast (high)");
    expect(html).toContain("৯২%");
    expect(await (await admin.get("/admin/orders?status=new")).text()).toContain("কুরিয়ারে ৯২%");
  });

  it("BD Courier কী থাকলে সব কুরিয়ারের মিলিত হিসাব আগে নেয়", async () => {
    let auth = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://api.bdcourier.com/courier-check") {
        auth = new Headers(init?.headers).get("authorization") || "";
        expect(JSON.parse(init.body).phone).toBe(PHONE);
        return json({ status: "success", data: { summary: { total_parcel: 20, success_parcel: 6, cancelled_parcel: 14, success_ratio: 30 }, reports: [{ id: "a" }] } });
      }
      return json({ ok: true });
    });
    const admin = await adminBrowser();
    await admin.post("/admin/courier", { bdcourier_token: "TOKEN1", fraud_share: "1" });
    await new Browser().order();
    const o = (await lastOrder())!;
    await admin.post(`/admin/orders/${o.id}/courier-check`, {});
    expect(auth).toBe("Bearer TOKEN1");
    const html = await (await admin.get(`/admin/orders/${o.id}`)).text();
    expect(html).toContain("মোট ২০টা");
    expect(html).toContain("১টা ফ্রড রিপোর্ট");
    expect(html).toContain("ঝুঁকি বেশি");
  });

  it("চাবি ভুল হলে এরর দেখায়, কিছু ক্যাশ করে না", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ message: "Unauthenticated." }, 401));
    const admin = await adminBrowser();
    await admin.post("/admin/courier", { bdcourier_token: "BAD", fraud_share: "1" });
    await new Browser().order();
    const o = (await lastOrder())!;
    await admin.post(`/admin/orders/${o.id}/courier-check`, {});
    expect((await DB.prepare("SELECT COUNT(*) n FROM courier_checks").first<{ n: number }>())!.n).toBe(0);
    expect(await (await admin.get(`/admin/orders/${o.id}`)).text()).toContain("Unauthenticated.");
  });
});

describe("রায়ের হিসাব", () => {
  it("কুরিয়ারের স্ট্যাটাস থেকে ফল", () => {
    expect(outcomeFromCourier("delivered")).toBe("delivered");
    expect(outcomeFromCourier("Delivered")).toBe("delivered");
    expect(outcomeFromCourier("partial_delivered")).toBe("delivered");
    expect(outcomeFromCourier("delivered_approval_pending")).toBeNull();
    expect(outcomeFromCourier("cancelled")).toBe("returned");
    expect(outcomeFromCourier("Return")).toBe("returned");
    expect(outcomeFromCourier("cancelled_return_received")).toBe("returned");
    expect(outcomeFromCourier("in_review")).toBeNull();
    expect(outcomeFromCourier(null)).toBeNull();
  });

  it("নতুন, ভালো, সাবধানে, ঝুঁকি", () => {
    expect(riskOf().level).toBe("new");
    expect(riskOf({ delivered: 5, returned: 0, cancelled: 0, fake: 0, open: 0 }).level).toBe("good");
    expect(riskOf({ delivered: 3, returned: 1, cancelled: 0, fake: 0, open: 0 }).level).toBe("warn");
    expect(riskOf(undefined, { delivered: 0, returned: 0, cancelled: 0, fake: 2, shops: 2 }).level).toBe("bad");
    expect(riskOf(undefined, undefined, { total: 10, success: 3, cancelled: 7, ratio: 30, source: "x" }).level).toBe("bad");
    // কনফার্মের আগে একবার বাতিল একা ঝুঁকি নয়
    expect(riskOf({ delivered: 2, returned: 0, cancelled: 1, fake: 0, open: 0 }).level).toBe("good");
  });
});
