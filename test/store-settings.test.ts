import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb, setStatus } from "./helpers";

beforeEach(resetDb);

describe("দোকানের ড্যাশবোর্ড", () => {
  it("লগইনের পর ড্যাশবোর্ড: সেটআপ চেকলিস্ট, আজকের অর্ডার, সাম্প্রতিক অর্ডার, সাইডবার", async () => {
    const a = await adminBrowser();
    await new Browser().order();
    const o = (await lastOrder())!;
    const html = await (await a.get("/admin")).text();
    expect(html).toContain("দোকান সেটআপ");
    expect(html).toContain("Facebook Pixel + Conversions API");
    expect(html).toContain("আজকের অর্ডার");
    expect(html).toContain(o.order_no);
    expect(html).toContain('class="sa-side"');
    await setStatus(a, o.id, "confirmed");
    const after = await (await a.get("/admin")).text();
    expect(after).toContain("কাঠের ওয়াল শেলফ"); // সেরা পণ্য
  });

  it("অর্ডার স্টাফ ড্যাশবোর্ড দেখে কিন্তু সেটআপ চেকলিস্ট আর সেটিংস মেনু দেখে না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/staff", { name: "অর্ডার স্টাফ", email: "o@s.test", password: "staffpass1", role: "orders" });
    const s = new Browser();
    await s.post("/admin/login", { email: "o@s.test", password: "staffpass1" });
    const html = await (await s.get("/admin")).text();
    expect(html).toContain("আজকের অর্ডার");
    expect(html).not.toContain("দোকান সেটআপ");
    expect(html).not.toContain('href="/admin/settings"');
  });
});

describe("সেটিংস কেন্দ্র", () => {
  it("SEO: টাইটেল, ডেসক্রিপশন, noindex দোকানে বসে; robots.txt আর sitemap.xml", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings/seo", { _section: "seo", seo_title: "কাঠবন — হাতে বানানো কাঠের পণ্য", seo_description: "সারা দেশে ক্যাশ অন ডেলিভারি" });
    const home = await (await new Browser().get("/")).text();
    expect(home).toContain("<title>কাঠবন — হাতে বানানো কাঠের পণ্য</title>");
    expect(home).toContain('content="সারা দেশে ক্যাশ অন ডেলিভারি"');
    expect(home).not.toContain("noindex");
    const robots = await (await new Browser().get("/robots.txt")).text();
    expect(robots).toContain("Sitemap: https://shop.test/sitemap.xml");
    const sitemap = await (await new Browser().get("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>https://shop.test/p/");
    // noindex চালু
    await a.post("/admin/settings/seo", { _section: "seo", seo_title: "x", seo_description: "y", seo_noindex: "1" });
    expect(await (await new Browser().get("/")).text()).toContain('content="noindex, nofollow"');
    expect(await (await new Browser().get("/robots.txt")).text()).toContain("Disallow: /\n");
  });

  it("পণ্যের মেটা টাইটেল আর ডেসক্রিপশন ল্যান্ডিং পেজে", async () => {
    await DB.prepare("UPDATE products SET meta_title = 'সেরা কাঠের শেলফ — অফার', meta_description = 'আজই অর্ডার করুন' WHERE id = 1").run();
    const slug = (await DB.prepare("SELECT slug FROM products WHERE id = 1").first<{ slug: string }>())!.slug;
    const html = await (await new Browser().get(`/p/${slug}`)).text();
    expect(html).toContain("<title>সেরা কাঠের শেলফ — অফার</title>");
    expect(html).toContain('name="description" content="আজই অর্ডার করুন"');
  });

  it("ট্র্যাকিং: সঠিক GA4/GTM/TikTok আইডি বসে, ভুল বা ক্ষতিকর আইডি নেয় না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings/tracking", { _section: "tracking", fb_pixel_id: "", fb_test_event_code: "", fb_graph_version: "v26.0",
      ga4_id: "g-abc123xyz", gtm_id: "GTM-'</script><script>alert(1)", tiktok_pixel_id: "C1234567890ABCDEF" });
    const s = Object.fromEntries((await DB.prepare("SELECT key, value FROM settings WHERE key IN ('ga4_id','gtm_id','tiktok_pixel_id')").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
    expect(s).toEqual({ ga4_id: "G-ABC123XYZ", gtm_id: "", tiktok_pixel_id: "C1234567890ABCDEF" });
    const home = await (await new Browser().get("/")).text();
    expect(home).toContain("googletagmanager.com/gtag/js?id=G-ABC123XYZ");
    expect(home).toContain("ttq.load('C1234567890ABCDEF')");
    expect(home).not.toContain("alert(1)");
  });

  it("ডেলিভারি: নির্দিষ্ট টাকার বেশি অর্ডারে ফ্রি ডেলিভারি; সর্বনিম্ন অর্ডার", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings/delivery", { _section: "delivery", delivery_inside: "70", delivery_outside: "130", free_delivery_min: "1000", delivery_time_inside: "১–২ দিন" });
    const slug = (await DB.prepare("SELECT slug FROM products WHERE id = 1").first<{ slug: string }>())!.slug; // দাম ১২৫০
    const landing = await (await new Browser().get(`/p/${slug}`)).text();
    expect(landing).toContain("ডেলিভারি ফ্রি");
    expect(landing).toContain("১–২ দিন");
    await new Browser().order({ area: "outside" });
    expect(await lastOrder()).toMatchObject({ delivery_charge: 0, total: 1250 });

    await a.post("/admin/settings/delivery", { _section: "delivery", delivery_inside: "70", delivery_outside: "130", free_delivery_min: "0" });
    await a.post("/admin/settings/checkout", { _section: "checkout", min_order: "2000", show_note: "1" });
    const r = await new Browser().order({ phone: "01812345678" });
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("সর্বনিম্ন 2000 টাকার অর্ডার");
  });

  it("অর্ডার ফর্ম: নোট ঘর বন্ধ, শিরোনাম আর ধন্যবাদ বার্তা", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings/checkout", { _section: "checkout", min_order: "0", order_form_title: "এখনই অর্ডার করুন", thanks_message: "আপনার পার্সেল আজই পাঠানো হবে!" });
    const slug = (await DB.prepare("SELECT slug FROM products WHERE id = 1").first<{ slug: string }>())!.slug;
    const landing = await (await new Browser().get(`/p/${slug}`)).text();
    expect(landing).toContain("এখনই অর্ডার করুন");
    expect(landing).not.toContain('name="note"');
    const b = new Browser();
    await b.order();
    expect(await (await b.get("/thanks")).text()).toContain("আপনার পার্সেল আজই পাঠানো হবে!");
  });

  it("দোকানের তথ্য ফুটারে; সেকশনের ফর্ম অন্য সেকশনের ঘর মুছে দেয় না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings/tracking", { _section: "tracking", fb_pixel_id: "123456", fb_graph_version: "v26.0", fb_test_event_code: "" });
    await a.post("/admin/settings", { _section: "general", site_name: "রঙিন", contact_phone: "01811111111", whatsapp: "01911111111", facebook_page: "javascript:alert(1)", store_address: "মিরপুর, ঢাকা" });
    const s = Object.fromEntries((await DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
    expect(s.fb_pixel_id).toBe("123456");
    expect(s.facebook_page).toBe("");
    const home = await (await new Browser().get("/")).text();
    expect(home).toContain("https://wa.me/8801911111111");
    expect(home).toContain("মিরপুর, ঢাকা");
  });
});
