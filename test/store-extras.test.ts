import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";
import { code128Widths } from "../src/shop/lib/barcode";

beforeEach(async () => {
  await resetDb();
  await DB.batch([
    DB.prepare("DELETE FROM settings WHERE key LIKE 'theme_cfg_%'"),
    DB.prepare("DELETE FROM pages"),
    DB.prepare("UPDATE settings SET value = 'pro' WHERE key = 'theme'"),
    DB.prepare("UPDATE settings SET value = '01711111111' WHERE key = 'whatsapp'"),
    DB.prepare("UPDATE settings SET value = 'off' WHERE key = 'checkout_email'"),
    DB.prepare("UPDATE settings SET value = '' WHERE key IN ('cf1_label','cf2_label','cf3_label')"),
    DB.prepare("UPDATE settings SET value = 'FS-' WHERE key = 'order_prefix'"),
    DB.prepare("UPDATE settings SET value = 'inside' WHERE key = 'default_area'"),
    DB.prepare("UPDATE settings SET value = '1' WHERE key IN ('invoice_barcode','invoice_image')"),
  ]);
});
const get = async (path: string) => (await new Browser().get(path)).text();
const customize = (a: Browser, data: Record<string, string>) => a.post("/admin/settings/customize", { header_sticky: "1", ...data });

describe("পণ্যের পেজ", () => {
  it("কল/WhatsApp বাটন, সম্পর্কিত পণ্য, শেয়ার, জুম, ড্রপডাউনে সাইজ", async () => {
    const a = await adminBrowser();
    await customize(a, { pd_call: "1", pd_call_text: "এখনই কল দিন", pd_wa: "1", pd_share: "1", pd_zoom: "1", pd_related: "1", pd_related_title: "আরও পণ্য", pd_related_count: "4", pd_variant_style: "select", pd_sticky: "1", pd_sticky_text: "কিনুন" });
    const html = await get("/p/wooden-wall-shelf");
    expect(html).toContain("এখনই কল দিন");
    expect(html).toContain("wa.me/8801711111111");
    expect(html).toContain("data-share-url");
    expect(html).toContain("data-zoom-on");
    expect(html).toContain("আরও পণ্য");
    expect(html).toContain("কিনুন —");
    // ভ্যারিয়েন্ট থাকলে ড্রপডাউন
    const withVar = (await DB.prepare("SELECT p.slug FROM products p JOIN product_variants v ON v.product_id = p.id LIMIT 1").first<any>());
    if (withVar) expect(await get(`/p/${withVar.slug}`)).toContain('<select name="variant_id"');
  });

  it("বন্ধ করলে বাটন আর নিচের বার থাকে না", async () => {
    const a = await adminBrowser();
    await customize(a, { pd_sticky_text: "x" });
    const html = await get("/p/wooden-wall-shelf");
    expect(html).not.toContain("pd-call");
    expect(html).toContain(".sticky-order{display:none!important}");
  });
});

describe("চেকআউট", () => {
  it("ইমেইল আর নিজের ঘর বাধ্যতামূলক হলে না দিলে অর্ডার হয় না, দিলে অর্ডারে সেভ হয়", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings/checkout", { checkout_email: "required", cf1_label: "বিকল্প নম্বর", cf1_req: "1", default_area: "none", order_prefix: "kb-", show_note: "1" });
    expect(await get("/p/wooden-wall-shelf")).toContain("বিকল্প নম্বর");
    const fail = await new Browser().order({ phone: "01712345678" });
    expect(fail.status).toBe(422);
    const ok = await new Browser().order({ phone: "01712345678", email: "a@b.com", cf1: "01811111111" });
    expect(ok.status).toBe(303);
    const o = (await DB.prepare("SELECT order_no, email, extra_json FROM orders ORDER BY id DESC LIMIT 1").first<any>())!;
    expect(o.order_no).toMatch(/^KB-\d+$/);
    expect(o.email).toBe("a@b.com");
    expect(JSON.parse(o.extra_json)).toEqual([["বিকল্প নম্বর", "01811111111"]]);
    const id = (await DB.prepare("SELECT id FROM orders ORDER BY id DESC LIMIT 1").first<any>()).id;
    expect(await (await a.get(`/admin/orders/${id}`)).text()).toContain("01811111111");
  });
});

describe("ইনভয়েস আর স্টিকার", () => {
  it("একটা আর একসাথে অনেক অর্ডারের ইনভয়েস/স্টিকার, বারকোডসহ", async () => {
    await new Browser().order({ phone: "01712345678" });
    await new Browser().order({ phone: "01812345678" });
    const ids = (await DB.prepare("SELECT id, order_no FROM orders ORDER BY id").all<any>()).results;
    const a = await adminBrowser();
    const one = await (await a.get(`/admin/orders/${ids[0].id}/invoice`)).text();
    expect(one).toContain("ইনভয়েস");
    expect(one).toContain(ids[0].order_no);
    expect(one).toContain("<svg");
    const many = await (await a.get(`/admin/orders/invoices?ids=${ids[0].id}&ids=${ids[1].id}&size=sticker`)).text();
    expect(many.match(/class="iv-page iv-sticker"/g)?.length).toBe(2);
    expect(many).toContain("size:3in 4in");
  });

  it("কাস্টমার শুধু নিজের নম্বর মিললে ইনভয়েস দেখে", async () => {
    await new Browser().order({ phone: "01712345678" });
    const o = (await DB.prepare("SELECT order_no FROM orders LIMIT 1").first<any>())!;
    expect((await new Browser().get(`/track/invoice?order=${o.order_no}&phone=01712345678`)).status).toBe(200);
    expect((await new Browser().get(`/track/invoice?order=${o.order_no}&phone=01799999999`)).status).toBe(404);
  });

  it("বারকোডের চেক অঙ্ক ঠিক (Code 128B)", () => {
    const w = code128Widths("FS-100025");
    expect(w.slice(0, 6)).toEqual([2, 1, 1, 2, 1, 4]); // Start B
    expect(w.slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2]); // Stop
    expect(w.reduce((x, n) => x + n, 0)).toBe(11 * (1 + 9 + 1) + 13);
  });
});

describe("বাকি অপশন", () => {
  it("নিজের পেজ: বানানো, মেনু আর ফুটারে লিংক, পেজ খোলে; ভুল লিংকের নাম আটকায়", async () => {
    const a = await adminBrowser();
    expect((await a.post("/admin/pages", { title: "আমাদের সম্পর্কে", slug: "Bad Slug!", content: "x" })).status).toBe(422);
    expect((await a.post("/admin/pages", { title: "আমাদের সম্পর্কে", slug: "about-us", content: "<h3>আমরা</h3><script>x()</script>", in_menu: "1", is_active: "1" })).status).toBe(303);
    const page = await get("/page/about-us");
    expect(page).toContain("<h3>আমরা</h3>");
    expect(page).not.toContain("x()");
    expect(await get("/")).toContain('href="/page/about-us"');
  });

  it("পাশের কার্ট, পেমেন্ট ব্যাজ, দামের ফিল্টার আর পাতা ভাগ", async () => {
    const a = await adminBrowser();
    await customize(a, { side_cart: "1", footer_payments: "ক্যাশ অন ডেলিভারি, bKash", list_filter: "1", list_per_page: "24", footer_style: "full" });
    const home = await get("/");
    expect(home).toContain("data-side-cart");
    expect(home).toContain("<span>bKash</span>");
    const cat = (await DB.prepare("SELECT category_id id FROM products WHERE is_active = 1 LIMIT 1").first<any>())!;
    const filtered = await get(`/c/${cat.id}?min=100000`);
    expect(filtered).toContain('name="min"');
    expect(filtered).toContain("(০টা পণ্য)");
  });
});
