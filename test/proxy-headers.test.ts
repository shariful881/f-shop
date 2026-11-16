/** security/step-5: লাইভে বাইরের X-Forwarded-* হেডার মানা হয় না */
import { describe, expect, it, beforeEach } from "vitest";
import { Browser, resetDb } from "./helpers";
import { stripProxyHeaders, PROXY_HEADERS } from "../src/index";

const EVIL = { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" };

beforeEach(async () => { await resetDb(); });

describe("stripProxyHeaders", () => {
  const req = () => new Request("https://shop.test/x", { headers: { ...EVIL, "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4", cookie: "a=1" } });

  it("লাইভে সব proxy হেডার মোছে, বাকি হেডার থাকে", () => {
    const r = stripProxyHeaders(req(), false);
    for (const h of PROXY_HEADERS) expect(r.headers.has(h)).toBe(false);
    expect(r.headers.get("cookie")).toBe("a=1");
    expect(r.url).toBe("https://shop.test/x");
  });

  it("DEV_MODE-এ (Codespaces) হেডার রাখে", () => {
    expect(stripProxyHeaders(req(), true).headers.get("x-forwarded-host")).toBe("evil.example");
  });

  it("হেডার না থাকলে একই রিকোয়েস্ট ফেরত (বাড়তি কাজ নেই)", () => {
    const r = new Request("https://shop.test/");
    expect(stripProxyHeaders(r, false)).toBe(r);
  });
});

describe("লাইভে লিংক আর যাচাই আসল host থেকে", () => {
  it("sitemap.xml আর robots.txt-এ অন্য ডোমেইন ঢোকানো যায় না", async () => {
    const b = new Browser();
    const sm = await (await b.fetch("/sitemap.xml", { headers: EVIL })).text();
    expect(sm).not.toContain("evil.example");
    expect(sm).toContain("https://shop.test/");
    const rb = await (await b.fetch("/robots.txt", { headers: EVIL })).text();
    expect(rb).not.toContain("evil.example");
  });

  it("প্ল্যাটফর্মেও — হেডার দিয়ে CSRF যাচাই ঘোরানো যায় না", async () => {
    const r = await new Browser().fetch("/signup", {
      method: "POST", base: "https://ourdomain.com", body: new URLSearchParams({ shop_name: "x" }),
      headers: { origin: "https://evil.example", ...EVIL },
    } as RequestInit);
    expect(r.status).toBe(403);
  });
});
