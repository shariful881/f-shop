import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, countOrders, lastOrder, resetDb, setStatus } from "./helpers";
import { hashPassword } from "../src/lib/auth";

beforeEach(resetDb);

async function orderAs(b: Browser, phone = "01712345678") {
  await b.get("/");
  await b.order({ phone });
  return (await lastOrder())!;
}

async function status(id: number) {
  return (await env.DB.prepare("SELECT status FROM orders WHERE id=?").bind(id).first<{ status: string }>())!.status;
}

describe("অ্যাডমিন লগইন", () => {
  it("লগইন ছাড়া /admin-এ ঢোকা যায় না", async () => {
    const res = await new Browser().get("/admin/orders");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/login");
  });

  it("is_admin না হলে লগইন হয় না", async () => {
    await env.DB.prepare("INSERT INTO users (email,password_hash,is_admin) VALUES ('u@test.com',?,0)").bind(await hashPassword("pass12345", 1000)).run();
    const res = await new Browser().post("/admin/login", { email: "u@test.com", password: "pass12345" });
    expect(res.status).toBe(422);
  });

  it("ভুল পাসওয়ার্ডে লগইন হয় না", async () => {
    await adminBrowser();
    const res = await new Browser().post("/admin/login", { email: "admin@test.com", password: "wrong" });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("ইমেইল বা পাসওয়ার্ড ভুল");
  });

  it("লগইন করলে অর্ডার পেজ খোলে, লগআউট করলে আর খোলে না", async () => {
    const a = await adminBrowser();
    expect((await a.get("/admin/orders")).status).toBe(200);
    await a.post("/admin/logout", {});
    expect((await a.get("/admin/orders")).status).toBe(303);
  });
});

describe("অর্ডার তালিকা", () => {
  it("ট্যাবে সংখ্যা দেখায় আর নম্বর/নাম/অর্ডার নং দিয়ে খোঁজা যায়", async () => {
    const a = await adminBrowser();
    await orderAs(new Browser(), "01712345678");
    await orderAs(new Browser(), "01812345678");
    const html = await (await a.get("/admin/orders?status=new")).text();
    expect(html).toMatch(/নতুন <span class="tab-count">2<\/span>/);
    expect(html).toContain("FS-100001");

    const byPhone = await (await a.get("/admin/orders?q=" + encodeURIComponent("+8801812345678"))).text();
    expect(byPhone).toContain("FS-100002");
    expect(byPhone).not.toContain("FS-100001");
    const byNo = await (await a.get("/admin/orders?q=100001")).text();
    expect(byNo).toContain("FS-100001");
    const byName = await (await a.get("/admin/orders?q=" + encodeURIComponent("রহিম"))).text();
    expect(byName).toContain("FS-100001");
  });

  it("অর্ডার ডিটেইলে কাস্টমার, পণ্য, ট্র্যাকিং তথ্য আর আগের অর্ডার দেখায়", async () => {
    const a = await adminBrowser();
    const b = new Browser("203.0.113.5");
    const o1 = await orderAs(b);
    await env.DB.prepare("UPDATE orders SET status='confirmed'").run();
    const o2 = await orderAs(b);
    const html = await (await a.get(`/admin/orders/${o2.id}`)).text();
    expect(html).toContain("রহিম উদ্দিন");
    expect(html).toContain("কাঠের ওয়াল শেলফ");
    expect(html).toContain("203.0.113.5");
    expect(html).toContain(b.cookies.get("did")!);
    expect(html).toContain(o1.order_no); // আগের অর্ডার
  });
});

describe("স্ট্যাটাস বদলের নিয়ম", () => {
  it("নতুন → কনফার্ম → শিপড → বাতিল চলে", async () => {
    const a = await adminBrowser();
    const o = await orderAs(new Browser());
    await setStatus(a, o.id, "confirmed");
    expect(await status(o.id)).toBe("confirmed");
    const row = await env.DB.prepare("SELECT confirmed_at FROM orders WHERE id=?").bind(o.id).first<{ confirmed_at: string }>();
    expect(row!.confirmed_at).toBeTruthy();
    await setStatus(a, o.id, "shipped");
    expect(await status(o.id)).toBe("shipped");
    await setStatus(a, o.id, "cancelled");
    expect(await status(o.id)).toBe("cancelled");
  });

  it.each([
    ["new", "shipped"],
    ["confirmed", "fake"],
    ["confirmed", "new"],
    ["shipped", "confirmed"],
    ["shipped", "fake"],
    ["cancelled", "confirmed"],
    ["cancelled", "new"],
    ["fake", "confirmed"],
    ["fake", "cancelled"],
  ])("%s → %s বদলানো যায় না", async (from, to) => {
    const a = await adminBrowser();
    const o = await orderAs(new Browser());
    await env.DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(from, o.id).run();
    await setStatus(a, o.id, to);
    expect(await status(o.id)).toBe(from);
  });

  it("বাতিল/ফেক বাটনে নিশ্চিত হওয়ার প্রশ্ন আছে", async () => {
    const a = await adminBrowser();
    const o = await orderAs(new Browser());
    const html = await (await a.get(`/admin/orders/${o.id}`)).text();
    expect(html).toContain("নম্বর ও ডিভাইস স্থায়ীভাবে ব্লক হবে, নিশ্চিত?");
  });
});

describe("নিয়ম ৪: ফেক বা বাতিল = স্থায়ী ব্লক", () => {
  it.each(["fake", "cancelled"])("%s করলে নম্বর আর ডিভাইস ব্ল্যাকলিস্টে যায়, আর অর্ডার দিতে পারে না", async (to) => {
    const a = await adminBrowser();
    const b = new Browser();
    const o = await orderAs(b, "01712345678");
    await setStatus(a, o.id, to);

    const { results } = await env.DB.prepare("SELECT type, value, reason, order_id FROM blacklist_entries ORDER BY type").all();
    expect(results).toEqual([
      { type: "device", value: b.cookies.get("did"), reason: to, order_id: o.id },
      { type: "phone", value: "01712345678", reason: to, order_id: o.id },
    ]);

    // একই নম্বর অন্য ডিভাইস থেকে
    expect((await new Browser().order({ phone: "+880 1712 345678" })).status).toBe(403);
    // একই ডিভাইস অন্য নম্বর দিয়ে
    expect((await b.order({ phone: "01999999999" })).status).toBe(403);
    expect(await countOrders()).toBe(1);
  });

  it("আনব্লক করলে আবার অর্ডার দেওয়া যায়", async () => {
    const a = await adminBrowser();
    const b = new Browser();
    const o = await orderAs(b);
    await setStatus(a, o.id, "fake");
    expect((await b.order()).status).toBe(403);

    const { results } = await env.DB.prepare("SELECT id FROM blacklist_entries").all<{ id: number }>();
    for (const r of results) await a.post(`/admin/blacklist/${r.id}/delete`, {});
    expect((await b.order()).status).toBe(303);
  });

  it("অ্যাডমিন নিজে নম্বর ব্লক করতে পারে (যেকোনো ফরম্যাটে)", async () => {
    const a = await adminBrowser();
    await a.post("/admin/blacklist", { phone: "+৮৮০১৫১১১১১১১১" });
    const row = await env.DB.prepare("SELECT type, value, reason FROM blacklist_entries").first();
    expect(row).toEqual({ type: "phone", value: "01511111111", reason: "manual" });
    expect((await new Browser().order({ phone: "01511111111" })).status).toBe(403);
    const html = await (await a.get("/admin/blacklist?q=01511")).text();
    expect(html).toContain("01511111111");
    expect(html).toContain("নিজে ব্লক");
  });
});

describe("পণ্য, ক্যাটাগরি, সেটিংস", () => {
  it("নতুন পণ্য যোগ (ছবিসহ), এডিট, বন্ধ — মোছা যায় না", async () => {
    const a = await adminBrowser();
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      name: "Test Lamp", slug: "", category_id: "1", price: "999", compare_price: "1200", sort_order: "3",
      headline: "দারুণ ল্যাম্প", short_desc: "ছোট বর্ণনা", details_html: "<b>বিস্তারিত</b>",
      youtube_url: "https://www.youtube.com/watch?v=abcdefghijk", is_active: "1", show_on_home: "1",
    })) fd.append(k, v);
    fd.append("image", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
    const res = await a.fetch("/admin/products", { method: "POST", body: fd });
    expect(res.status).toBe(303);

    const p = await env.DB.prepare("SELECT * FROM products WHERE slug='test-lamp'").first<Record<string, any>>();
    expect(p).toMatchObject({ name: "Test Lamp", price: 999, compare_price: 1200, category_id: 1, is_active: 1 });
    expect(p!.image).toMatch(/^p\/.+\.jpg$/);
    const img = await new Browser().get("/img/" + p!.image);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");

    const landing = await (await new Browser().get("/p/test-lamp")).text();
    expect(landing).toContain("দারুণ ল্যাম্প");
    expect(landing).toContain("<b>বিস্তারিত</b>");

    await a.post(`/admin/products/${p!.id}/toggle`, {});
    expect((await new Browser().get("/p/test-lamp")).status).toBe(404);
    const still = await env.DB.prepare("SELECT COUNT(*) n FROM products WHERE id=?").bind(p!.id).first<{ n: number }>();
    expect(still!.n).toBe(1);
  });

  it("একই slug দুবার দেওয়া যায় না", async () => {
    const a = await adminBrowser();
    const res = await a.post("/admin/products", { name: "X", slug: "wooden-wall-shelf", price: 10 });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("এই slug আগেই ব্যবহার হয়েছে");
  });

  it("ক্যাটাগরি যোগ, নাম/ক্রম বদল, মোছা (পণ্য মোছে না)", async () => {
    const a = await adminBrowser();
    await a.post("/admin/categories", { name: "অফার", sort_order: 0 });
    const cat = await env.DB.prepare("SELECT id FROM categories WHERE name='অফার'").first<{ id: number }>();
    expect(cat).toBeTruthy();
    await a.post(`/admin/categories/1`, { name: "ডেকোর", sort_order: 9 });
    expect(await env.DB.prepare("SELECT name, sort_order FROM categories WHERE id=1").first()).toEqual({ name: "ডেকোর", sort_order: 9 });
    await a.post(`/admin/categories/1/delete`, {});
    expect(await env.DB.prepare("SELECT id FROM categories WHERE id=1").first()).toBeNull();
    const orphan = await env.DB.prepare("SELECT COUNT(*) n FROM products WHERE id IN (1,2) AND category_id IS NULL").first<{ n: number }>();
    expect(orphan!.n).toBe(2);
  });

  it("সেটিংস: ডেলিভারি চার্জ বদলালে অর্ডারে লাগে; টোকেন ফাঁকা রাখলে আগেরটা থাকে", async () => {
    const a = await adminBrowser();
    const base = {
      site_name: "আমার দোকান", contact_phone: "01811111111", delivery_inside: 60, delivery_outside: 120,
      fb_pixel_id: "123456", fb_capi_token: "SECRET_TOKEN", fb_test_event_code: "", fb_graph_version: "v24.0",
    };
    await a.post("/admin/settings", base);
    await a.post("/admin/settings", { ...base, fb_capi_token: "" });
    const tok = await env.DB.prepare("SELECT value FROM settings WHERE key='fb_capi_token'").first<{ value: string }>();
    expect(tok!.value).toBe("SECRET_TOKEN");
    const page = await (await a.get("/admin/settings")).text();
    expect(page).not.toContain("SECRET_TOKEN"); // টোকেন পেজে দেখায় না
    expect(page).toContain('type="password" name="fb_capi_token"');

    await new Browser().order({ area: "outside" });
    expect((await lastOrder())!.delivery_charge).toBe(120);
  });
});

describe("সময় Asia/Dhaka টাইমজোনে", () => {
  it("UTC সময় +৬ ঘণ্টা করে দেখায়", async () => {
    const { dhakaTime } = await import("../src/lib/format");
    expect(dhakaTime("2026-11-14 03:30:00")).toBe("14/11/2026, 09:30 am");
  });
});
