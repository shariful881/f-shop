/** মূল সাইটের টেকনিক্যাল SEO: title/description, Search Console/GA4, ব্লগের SEO ঘর, RSS, llms.txt */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Browser, DB, resetDb } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { clearSettingsCache } from "../src/platform/billing";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;
const get = (path: string, b = new Browser()) => b.fetch(path, { base: P } as RequestInit);
const head = (html: string) => html.slice(0, html.indexOf("</head>"));
async function owner() {
  await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES ('seo@x.com', 'seo', 'owner', ?, 1)")
    .bind(await hashPassword("teampass123", 1000)).run();
  const b = new Browser();
  expect((await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "seo@x.com", password: "teampass123" }) } as RequestInit)).status).toBe(303);
  return b;
}
const post = (b: Browser, path: string, data: Record<string, string> | FormData) =>
  b.fetch(path, { method: "POST", base: P, body: data instanceof FormData ? data : new URLSearchParams(data) } as RequestInit);

beforeEach(async () => {
  await resetDb();
  await pdb().prepare("DELETE FROM platform_settings WHERE key IN ('gsc_verification', 'bing_verification', 'ga4_id')").run();
  await pdb().prepare("UPDATE blog_posts SET seo_title = '', meta_description = '', cover_image = '', author_name = ''").run();
  clearSettingsCache();
});

describe("title আর description", () => {
  it("হোম, দাম, ব্লগে সার্চের শব্দ; ভুল '১৪ দিন' নেই; FAQ-তে CSV-র পুরনো দাবি নেই", async () => {
    const home = await (await get("/")).text();
    expect(head(home)).toContain("<title>ফ্রিতে ই-কমার্স ওয়েবসাইট বানান");
    expect(head(home)).not.toContain("১৪ দিন");
    expect(head(home)).toMatch(/<meta name="description" content="[^"]*দিন সব ফিচার ফ্রি/);
    expect(home).not.toContain("CSV-তে নামাতে পারেন");
    expect(head(await (await get("/pricing")).text())).toContain("<title>ই-কমার্স ওয়েবসাইটের খরচ ও প্ল্যান");
    expect(head(await (await get("/blog")).text())).toContain("<title>অনলাইন বিজনেস গাইড");
    // হোমে ব্লগ গাইড সেকশন — ব্লগে ইন্টারনাল লিংক
    expect(home).toContain('href="/blog/fake-order-komanor-upay"');
    expect(head(home)).toContain('type="application/rss+xml"');
  });
});

describe("Search Console, Bing, GA4", () => {
  it("সেটিংসে দিলে পাবলিক পেজে বসে, সুপার অ্যাডমিনে বা দোকানে নয়; খারাপ কোড বাতিল", async () => {
    expect(head(await (await get("/")).text())).not.toContain("google-site-verification");
    const s = await owner();
    const bad = await post(s, "/super/settings/seo", { gsc_verification: '"><script>x</script>', bing_verification: "", ga4_id: "UA-1" });
    expect(bad.status).toBe(303);
    expect((await pdb().prepare("SELECT value FROM platform_settings WHERE key = 'gsc_verification'").first())).toBeNull();

    await post(s, "/super/settings/seo", {
      gsc_verification: '<meta name="google-site-verification" content="abcDEF123_-xyz789" />',
      bing_verification: "0123456789ABCDEF0123456789ABCDEF", ga4_id: "g-abc123xyz",
    });
    const home = head(await (await get("/")).text());
    expect(home).toContain('<meta name="google-site-verification" content="abcDEF123_-xyz789"/>');
    expect(home).toContain('<meta name="msvalidate.01" content="0123456789ABCDEF0123456789ABCDEF"/>');
    expect(home).toContain("googletagmanager.com/gtag/js?id=G-ABC123XYZ");
    expect(head(await (await get("/pricing")).text())).toContain("G-ABC123XYZ");
    expect(head(await (await get("/signup")).text())).toContain("G-ABC123XYZ");
    expect(await (await get("/super/login")).text()).not.toContain("G-ABC123XYZ");
    expect(await (await new Browser().get("/")).text()).not.toContain("G-ABC123XYZ"); // দোকানের সাইট
    expect((await pdb().prepare("SELECT action FROM audit_log WHERE action = 'settings.seo'").first())).toBeTruthy();
  });
});

describe("ব্লগের SEO ঘর", () => {
  it("Google শিরোনাম, বিবরণ, কভার, লেখক — পেজ, og:image আর JSON-LD-এ যায়", async () => {
    const s = await owner();
    const row = (await pdb().prepare("SELECT * FROM blog_posts WHERE slug = 'fake-order-komanor-upay'").first<any>())!;
    const r = await post(s, `/super/blog/${row.id}`, {
      title: row.title, slug: row.slug, excerpt: row.excerpt, body_html: row.body_html, status: "published",
      seo_title: "ফেক অর্ডার কমানোর উপায় ২০২৬", meta_description: "ক্যাশ অন ডেলিভারিতে ফেক অর্ডার আর ফেরত কমানোর পরীক্ষিত উপায় — বাংলাদেশি সেলারদের জন্য।",
      cover_image: "https://img.ourdomain.com/blog/fake.jpg", author_name: "মোঃ শরিফুল",
    });
    expect(r.status).toBe(303);
    const html = await (await get("/blog/fake-order-komanor-upay")).text();
    const h = head(html);
    expect(h).toContain("<title>ফেক অর্ডার কমানোর উপায় ২০২৬ — SellxBD</title>");
    expect(h).toContain("পরীক্ষিত উপায়");
    expect(h).toContain('<meta property="og:image" content="https://img.ourdomain.com/blog/fake.jpg"/>');
    expect(h).toContain('"author":{"@type":"Person","name":"মোঃ শরিফুল"');
    expect(html).toContain("লিখেছেন মোঃ শরিফুল");
    expect(html).toContain('width="1200" height="630"');
    expect(await (await get("/blog")).text()).toContain('src="https://img.ourdomain.com/blog/fake.jpg"');

    const bad = await post(s, `/super/blog/${row.id}`, { title: row.title, slug: row.slug, excerpt: "", body_html: row.body_html, status: "published", cover_image: "javascript:alert(1)" });
    expect(await bad.text()).toContain("https://");
  });

  it("লেখক না দিলে SellxBD টিম (প্রতিষ্ঠান)", async () => {
    const h = head(await (await get("/blog/fake-order-komanor-upay")).text());
    expect(h).toContain('"author":{"@type":"Organization","name":"SellxBD টিম"');
  });
});

describe("RSS আর llms.txt", () => {
  it("ফিডে প্রকাশিত পোস্ট, llms.txt-এ মূল পেজ আর গাইড", async () => {
    const feed = await get("/blog/feed.xml");
    expect(feed.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await feed.text();
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("/blog/fake-order-komanor-upay</link>");
    expect(xml).not.toContain("<script");
    const llms = await (await get("/llms.txt")).text();
    expect(llms).toMatch(/^# SellxBD/);
    expect(llms).toContain("/pricing)");
    expect(llms).toContain("/help/");
  });
});

describe("ডেমো দোকান", () => {
  it("ডেমো দোকান noindex, follow; সাধারণ দোকান নয়", async () => {
    expect((await new Browser().get("/")).headers.get("x-robots-tag")).toBeNull();
    await DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_mode', '1')").run();
    const r = await new Browser().get("/");
    expect(r.headers.get("x-robots-tag")).toBe("noindex, follow");
  });
});

describe("Google-এর গাইডলাইন: https আর favicon", () => {
  it("http → https 301 (মূল সাইট আর সাবডোমেইন), https ঠিক থাকে", async () => {
    const { SELF } = await import("cloudflare:test");
    for (const [from, to] of [["http://ourdomain.com/pricing?a=1", "https://ourdomain.com/pricing?a=1"], ["http://demo.ourdomain.com/", "https://demo.ourdomain.com/"]]) {
      const r = await SELF.fetch(from, { redirect: "manual" });
      expect(r.status).toBe(301);
      expect(r.headers.get("location")).toBe(to);
    }
    expect((await SELF.fetch("https://ourdomain.com/", { redirect: "manual" })).status).toBe(200);
  });

  it("favicon: ৪৮px+ ICO আর PNG লিংক; site name-এ alternateName", async () => {
    const h = head(await (await get("/")).text());
    expect(h).toContain('href="/brand/favicon-96.png"');
    expect(h).toContain('sizes="16x16 32x32 48x48 64x64"');
    expect(h).toContain('"alternateName":["Sellx BD","সেলএক্সবিডি"]');
  });
});
