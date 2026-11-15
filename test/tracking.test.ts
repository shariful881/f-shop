import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, lastOrder, resetDb, setStatus, DB } from "./helpers";
import { sha256Hex } from "../src/shop/lib/auth";

type Captured = { url: string; body: any };
let calls: Captured[] = [];
let fbReply: () => Response;

beforeEach(async () => {
  await resetDb();
  await DB.batch([
    DB.prepare("UPDATE settings SET value='1234567890' WHERE key='fb_pixel_id'"),
    DB.prepare("UPDATE settings SET value='TOKEN_ABC' WHERE key='fb_capi_token'"),
    DB.prepare("UPDATE settings SET value='TEST999' WHERE key='fb_test_event_code'"),
  ]);
  calls = [];
  fbReply = () => new Response(JSON.stringify({ events_received: 1, fbtrace_id: "x" }), { status: 200 });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      calls.push({ url, body: JSON.parse(init.body) });
      return fbReply();
    }
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 100)); // পেছনের (waitUntil) ইভেন্টগুলো শেষ হতে দেওয়া
  vi.restoreAllMocks();
});

const events = () => calls.flatMap((c) => c.body.data as any[]);
const named = (n: string) => events().filter((e) => e.event_name === n);
const settle = () => new Promise((r) => setTimeout(r, 80));

describe("ব্রাউজার + সার্ভার ইভেন্ট, একই event_id", () => {
  it("PageView আর ViewContent: Pixel কোড আর CAPI-তে একই event_id", async () => {
    const b = new Browser("203.0.113.20");
    const html = await (await b.get("/p/wooden-wall-shelf")).text();
    expect(html).toContain("fbq('init', \"1234567890\"");
    const vcId = html.match(/"name":"ViewContent","id":"(vc_[^"]+)"/)![1];
    const pvId = html.match(/"name":"PageView","id":"(pv_[^"]+)"/)![1];

    await vi.waitFor(() => expect(named("ViewContent")).toHaveLength(1));
    await vi.waitFor(() => expect(named("PageView")).toHaveLength(1));
    const vc = named("ViewContent")[0];
    expect(vc.event_id).toBe(vcId);
    expect(named("PageView")[0].event_id).toBe(pvId);
    expect(vc.custom_data).toMatchObject({ content_ids: ["1"], value: 1250, currency: "BDT" });
    expect(vc.event_source_url).toBe("https://shop.test/p/wooden-wall-shelf");

    // user_data: IP, user agent, fbp, hashed external_id (ডিভাইস), hashed country = bd
    expect(vc.user_data.client_ip_address).toBe("203.0.113.20");
    expect(vc.user_data.client_user_agent).toBe("TestBrowser/1.0");
    expect(vc.user_data.fbp).toBe(b.cookies.get("_fbp"));
    expect(vc.user_data.external_id).toEqual([await sha256Hex(b.cookies.get("did")!)]);
    expect(vc.user_data.country).toEqual([await sha256Hex("bd")]);
    expect(vc.user_data.ph).toBeUndefined();

    // টোকেন, ভার্সন আর Test Event Code
    expect(calls[0].url).toBe("https://graph.facebook.com/v26.0/1234567890/events");
    expect(calls[0].body.access_token).toBe("TOKEN_ABC");
    expect(calls[0].body.test_event_code).toBe("TEST999");
  });

  it("_fbp না থাকলে সার্ভার বানায়, fbclid থাকলে _fbc বানায় (এনক্রিপ্ট নয়)", async () => {
    const b = new Browser();
    await b.get("/p/wooden-wall-shelf?fbclid=AbC_123-xyz");
    expect(b.cookies.get("_fbp")).toMatch(/^fb\.1\.\d{13}\.\d{10}$/);
    expect(b.cookies.get("_fbc")).toMatch(/^fb\.1\.\d{13}\.AbC_123-xyz$/);
    await vi.waitFor(() => expect(named("ViewContent")).toHaveLength(1));
    expect(named("ViewContent")[0].user_data.fbc).toBe(b.cookies.get("_fbc"));

    // কুকি থাকলে আবার বানায় না
    const fbp = b.cookies.get("_fbp");
    const res = await b.get("/");
    expect(res.headers.getSetCookie().some((c) => c.startsWith("_fbp="))).toBe(false);
    expect(b.cookies.get("_fbp")).toBe(fbp);
  });

  it("AddToCart: রেসপন্সে event_id, সার্ভারেও একই event_id", async () => {
    const b = new Browser();
    const d = await (await b.post("/cart/add", { product_id: 3 }, { accept: "application/json" })).json<any>();
    expect(d.event_id).toMatch(/^atc_/);
    await vi.waitFor(() => expect(named("AddToCart")).toHaveLength(1));
    expect(named("AddToCart")[0].event_id).toBe(d.event_id);
    expect(named("AddToCart")[0].custom_data.content_ids).toEqual(["3"]);
  });

  it("InitiateCheckout: চেকআউট পেজে, আর ল্যান্ডিং ফর্মে ফোকাসে (/t/ic) একই event_id", async () => {
    const b = new Browser();
    await b.post("/cart/add", { product_id: 1 });
    const html = await (await b.get("/checkout")).text();
    const icId = html.match(/"name":"InitiateCheckout","id":"(ic_[^"]+)"/)![1];
    await vi.waitFor(() => expect(named("InitiateCheckout").map((e) => e.event_id)).toContain(icId));

    await b.post("/t/ic", { event_id: "ic_1234abcd-5678", product_id: 2 });
    await vi.waitFor(() => expect(named("InitiateCheckout").map((e) => e.event_id)).toContain("ic_1234abcd-5678"));
  });

  it("Lead: সাবমিটে সার্ভার থেকে lead_{অর্ডার নং}, ধন্যবাদ পেজে ব্রাউজারে একই আইডি — আর Purchase কখনো না", async () => {
    const b = new Browser();
    await b.get("/");
    await b.order();
    await vi.waitFor(() => expect(named("Lead")).toHaveLength(1));
    expect(named("Lead")[0].event_id).toBe("lead_FS-100001");
    expect(named("Lead")[0].custom_data.value).toBe(1250 + 70);

    const thanks = await (await b.get("/thanks")).text();
    expect(thanks).toContain('"name":"Lead","id":"lead_FS-100001"');
    await settle();
    expect(named("Lead")).toHaveLength(1); // ধন্যবাদ পেজ থেকে সার্ভার Lead আবার যায় না
    expect(named("Purchase")).toHaveLength(0);
  });

  it("Pixel ID না থাকলে Pixel কোড লোড হয় না, CAPI-ও যায় না", async () => {
    await DB.prepare("UPDATE settings SET value='' WHERE key='fb_pixel_id'").run();
    const html = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(html).not.toContain("fbevents.js");
    await settle();
    expect(calls).toHaveLength(0);
  });
});

describe("Purchase ইভেন্ট", () => {
  async function placeOrder() {
    const b = new Browser("198.51.100.44");
    await b.get("/p/wooden-wall-shelf?fbclid=CLICK1");
    await b.order({ phone: "+880 1712-345678" });
    return { b, o: (await lastOrder())! };
  }

  it("অর্ডার সাবমিটে Purchase যায় না", async () => {
    await placeOrder();
    await settle();
    expect(named("Purchase")).toHaveLength(0);
    expect((await lastOrder())!.purchase_sent_at).toBeNull();
  });

  it("কনফার্ম চাপলে সার্ভার থেকে একবারই যায়, অর্ডারের সময়ের তথ্যসহ", async () => {
    const { b, o } = await placeOrder();
    const a = await adminBrowser();
    calls = [];
    await setStatus(a, o.id, "confirmed");

    const purchases = named("Purchase");
    expect(purchases).toHaveLength(1);
    const p = purchases[0];
    expect(p.event_id).toBe("purchase_FS-100001");
    expect(p.action_source).toBe("website");
    expect(p.custom_data).toEqual({
      currency: "BDT",
      value: 1320,
      content_type: "product",
      content_ids: ["1"],
      contents: [{ id: "1", quantity: 1, item_price: 1250 }],
      num_items: 1,
      order_id: "FS-100001",
    });
    // অর্ডার করার সময়ের কাস্টমারের তথ্য — অ্যাডমিনের ব্রাউজারের নয়
    expect(p.user_data.client_ip_address).toBe("198.51.100.44");
    expect(p.user_data.client_user_agent).toBe("TestBrowser/1.0");
    expect(p.user_data.fbp).toBe(b.cookies.get("_fbp"));
    expect(p.user_data.fbc).toBe(b.cookies.get("_fbc"));
    expect(p.user_data.external_id).toEqual([await sha256Hex(b.cookies.get("did")!)]);
    expect(p.user_data.ph).toEqual([await sha256Hex("8801712345678")]);
    expect(p.user_data.country).toEqual([await sha256Hex("bd")]);

    const row = (await lastOrder())!;
    expect(row.purchase_sent_at).toBeTruthy();
    expect(row.purchase_response).toContain("events_received");

    // আবার পাঠানোর চেষ্টা বা শিপড করলেও দ্বিতীয়বার যায় না
    await a.post(`/admin/orders/${o.id}/purchase`, {});
    await setStatus(a, o.id, "shipped");
    await settle();
    expect(named("Purchase")).toHaveLength(1);
  });

  it("ব্যর্থ হলে রেসপন্স সেভ হয়, অ্যাডমিনে 'যায়নি' আর 'আবার পাঠান' — তারপর সফল হলে একবারই", async () => {
    const { o } = await placeOrder();
    const a = await adminBrowser();
    fbReply = () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token" } }), { status: 400 });
    await setStatus(a, o.id, "confirmed");

    let row = (await lastOrder())!;
    expect(row.status).toBe("confirmed");
    expect(row.purchase_sent_at).toBeNull();
    expect(row.purchase_response).toContain("Invalid OAuth access token");
    const html = await (await a.get(`/admin/orders/${o.id}`)).text();
    expect(html).toContain("যায়নি");
    expect(html).toContain("Purchase আবার পাঠান");

    fbReply = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    calls = [];
    await a.post(`/admin/orders/${o.id}/purchase`, {});
    expect(named("Purchase")).toHaveLength(1);
    row = (await lastOrder())!;
    expect(row.purchase_sent_at).toBeTruthy();

    await a.post(`/admin/orders/${o.id}/purchase`, {});
    expect(named("Purchase")).toHaveLength(1);
  });

  it("একসাথে দুবার 'আবার পাঠান' চাপলেও একবারই যায়", async () => {
    const { o } = await placeOrder();
    const a = await adminBrowser();
    fbReply = () => new Response("{}", { status: 500 });
    await setStatus(a, o.id, "confirmed");
    fbReply = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    calls = [];
    await Promise.all([a.post(`/admin/orders/${o.id}/purchase`, {}), a.post(`/admin/orders/${o.id}/purchase`, {})]);
    expect(named("Purchase")).toHaveLength(1);
  });

  it.each(["fake", "cancelled"])("%s অর্ডারের Purchase কখনো যায় না", async (to) => {
    const { o } = await placeOrder();
    const a = await adminBrowser();
    calls = [];
    await setStatus(a, o.id, to);
    await a.post(`/admin/orders/${o.id}/purchase`, {});
    await settle();
    expect(named("Purchase")).toHaveLength(0);
  });

  it("নতুন অর্ডারে 'আবার পাঠান' দিয়েও Purchase যায় না", async () => {
    const { o } = await placeOrder();
    const a = await adminBrowser();
    calls = [];
    await a.post(`/admin/orders/${o.id}/purchase`, {});
    expect(named("Purchase")).toHaveLength(0);
  });

  it("Pixel/টোকেন সেট না থাকলে 'যায়নি' দেখায়, কারণ সেভ হয়", async () => {
    await DB.prepare("UPDATE settings SET value='' WHERE key='fb_capi_token'").run();
    const { o } = await placeOrder();
    const a = await adminBrowser();
    await setStatus(a, o.id, "confirmed");
    const row = (await lastOrder())!;
    expect(row.purchase_sent_at).toBeNull();
    expect(row.purchase_response).toContain("সেট করা নেই");
  });
});

describe("Purchase গার্ড (চালু/বন্ধ)", () => {
  async function order() {
    const b = new Browser("198.51.100.45");
    await b.get("/p/wooden-wall-shelf");
    await b.order({ phone: "01712345679" });
    return { b, o: (await lastOrder())! };
  }

  it("ডিফল্টে চালু: অর্ডারে Purchase যায় না, ধন্যবাদ পেজেও না; সেটিংসে সুইচ চালু দেখায়", async () => {
    const { b } = await order();
    await settle();
    expect(named("Purchase")).toHaveLength(0);
    const thanks = await (await b.get("/thanks")).text();
    expect(thanks).not.toContain('"name":"Purchase"');
    const page = await (await (await adminBrowser()).get("/admin/settings/tracking")).text();
    expect(page).toContain("Purchase গার্ড চালু");
  });

  it("বন্ধ করলে: অর্ডার আসার সাথে সাথে সার্ভার থেকে একবার, ধন্যবাদ পেজে ব্রাউজার থেকে একই event_id; পরে কনফার্মে আবার যায় না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings/tracking", { _section: "tracking", fb_pixel_id: "1234567890", fb_graph_version: "v26.0" }); // চেকবক্স না পাঠালে = বন্ধ
    expect((await DB.prepare("SELECT value FROM settings WHERE key='purchase_guard'").first<{ value: string }>())!.value).toBe("0");

    const { b, o } = await order();
    await vi.waitFor(() => expect(named("Purchase")).toHaveLength(1));
    expect(named("Purchase")[0].event_id).toBe(`purchase_${o.order_no}`);
    expect((await lastOrder())!.purchase_sent_at).not.toBeNull();
    expect((await lastOrder())!.status).toBe("new");

    const thanks = await (await b.get("/thanks")).text();
    expect(thanks).toContain(`"name":"Purchase","id":"purchase_${o.order_no}"`);

    await setStatus(a, o.id, "confirmed");
    await settle();
    expect(named("Purchase")).toHaveLength(1);

    // আবার চালু
    await a.post("/admin/settings/tracking", { _section: "tracking", purchase_guard: "1", fb_pixel_id: "1234567890", fb_graph_version: "v26.0" });
    expect((await DB.prepare("SELECT value FROM settings WHERE key='purchase_guard'").first<{ value: string }>())!.value).toBe("1");
  });
});
