import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { HELP } from "../src/platform/help";

const get = (url: string) => SELF.fetch(url.startsWith("http") ? url : `https://ourdomain.com${url}`, { redirect: "manual" });
const head = (html: string) => html.slice(0, html.indexOf("</head>"));
const ldOf = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));

describe("sellxbd.com SEO", () => {
  it("সব পাবলিক পেজে favicon, canonical, নিজস্ব description, OG ছবি", async () => {
    const seen = new Set<string>();
    for (const path of ["/", "/pricing", "/about", "/contact", "/help", "/blog", "/terms", "/privacy", "/refund", "/signup", `/help/${HELP[0]!.slug}`]) {
      const r = await get(path);
      expect(r.status, path).toBe(200);
      const h = head(await r.text());
      expect(h, path).toContain('href="/favicon.ico"');
      expect(h, path).toContain('rel="apple-touch-icon"');
      expect(h, path).toContain(`<link rel="canonical" href="https://ourdomain.com${path}"/>`);
      expect(h, path).toContain('property="og:image" content="https://ourdomain.com/brand/og.jpg"');
      expect(h, path).not.toContain("noindex");
      const desc = /<meta name="description" content="([^"]+)"/.exec(h)![1]!;
      expect(seen.has(desc), `${path} description আলাদা`).toBe(false);
      seen.add(desc);
    }
  });

  it("হোমে Organization, WebSite আর দামসহ SoftwareApplication; গাইডে ব্রেডক্রাম্ব", async () => {
    const types = ldOf(await (await get("/")).text()).map((x) => x["@type"]);
    expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
    const app = ldOf(await (await get("/")).text())[2];
    expect(app.offers.length).toBe(4);
    expect(app.offers[0].priceCurrency).toBe("BDT");
    const bc = ldOf(await (await get(`/help/${HELP[0]!.slug}`)).text())[0];
    expect(bc["@type"]).toBe("BreadcrumbList");
    expect(bc.itemListElement.map((x: { name: string }) => x.name)).toEqual(["হোম", "হেল্প সেন্টার", HELP[0]!.title]);
  });

  it("www আর শেষের / থেকে 301; অচেনা পেজ 404 + noindex; সুপার লগইন noindex", async () => {
    let r = await get("https://www.ourdomain.com/pricing?x=1");
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://ourdomain.com/pricing?x=1");
    r = await get("/pricing/");
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/pricing");
    r = await get("/nope-page");
    expect(r.status).toBe(404);
    expect(head(await r.text())).toContain('content="noindex, nofollow"');
    expect(head(await (await get("/super/login")).text())).toContain('content="noindex, nofollow"');
    expect(head(await (await get("/help?q=abc")).text())).toContain("noindex");
  });

  it("পাবলিক পেজ cache হয়, সাইনআপ হয় না; sitemap-এ সাইনআপ", async () => {
    expect((await get("/pricing")).headers.get("cache-control")).toBe("public, max-age=300");
    expect((await get("/signup")).headers.get("cache-control")).toBe("no-store");
    const sm = await (await get("/sitemap.xml")).text();
    expect(sm).toContain("<loc>https://ourdomain.com/signup</loc>");
    expect(await (await get("/robots.txt")).text()).toContain("Sitemap: https://ourdomain.com/sitemap.xml");
  });
});
