import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { HELP } from "../src/platform/help";

const get = (path: string) => SELF.fetch(`https://ourdomain.com${path}`, { redirect: "manual" });

describe("sellxbd.com-এর পাবলিক পেজ", () => {
  it("দাম, আমাদের সম্পর্কে, যোগাযোগ, শর্তাবলি, প্রাইভেসি, রিফান্ড খোলে, ফুটারে নীতিমালার লিংক", async () => {
    for (const [path, text] of [["/pricing", "বড় ব্র্যান্ড"], ["/about", "আমাদের সম্পর্কে"], ["/contact", "হেল্প সেন্টার"], ["/terms", "শর্তাবলি"], ["/privacy", "প্রাইভেসি নীতি"], ["/refund", "রিফান্ড নীতি"]] as const) {
      const r = await get(path);
      expect(r.status, path).toBe(200);
      const html = await r.text();
      expect(html).toContain(text);
      expect(html).toContain('href="/terms"');
      expect(html).toContain('href="/help"');
    }
    expect(await (await get("/")).text()).toContain('href="/privacy"');
  });

  it("হেল্প সেন্টার: তালিকা, খোঁজা, প্রতিটা গাইড খোলে, অচেনা লিংকে 404", async () => {
    const idx = await (await get("/help")).text();
    for (const a of HELP) expect(idx).toContain(`/help/${a.slug}`);
    const found = await (await get("/help?q=" + encodeURIComponent("কুরিয়ার"))).text();
    expect(found).toContain("/help/courier");
    expect(found).not.toContain("/help/staff");
    for (const a of HELP.slice(0, 5)) {
      const r = await get(`/help/${a.slug}`);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain(a.steps[0]!.slice(0, 10));
    }
    const miss = await get("/help/nope");
    expect(miss.status).toBe(404);
  });

  it("প্রতিটা গাইডের slug আলাদা আর প্যানেলের লিংক /admin দিয়ে শুরু", () => {
    expect(new Set(HELP.map((a) => a.slug)).size).toBe(HELP.length);
    for (const a of HELP) if (a.admin) expect(a.admin.startsWith("/admin")).toBe(true);
  });
});

describe("হেডার মেনু", () => {
  it("হোমপেজের হেডারে ব্লগ লিংক নেই, ফুটারে আছে, /blog পেজ চলে", async () => {
    const html = await (await get("/")).text();
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain('href="/pricing"');
    expect(header).not.toContain('href="/blog"');
    const footer = html.slice(html.indexOf("<footer"));
    expect(footer).toContain('href="/blog"');
    expect((await get("/blog")).status).toBe(200);
  });
});
