/** security/step-6..8: কাস্টম SMS URL-এর পাহারা, অ্যাডমিন/সুপারে CSP, দোকানের নামে লিংক/নম্বর নয় */
import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";
import { customSmsUrlError, sendSms } from "../src/shop/lib/sms";
import { badShopName, emailSafeName } from "../src/platform/verify";
import { clearSettingsCache } from "../src/platform/billing";
import { clearShopCache } from "../src/platform/resolve";

const P = "https://ourdomain.com";
beforeEach(async () => { await resetDb(); });
afterEach(() => vi.restoreAllMocks());

describe("৬ — কাস্টম SMS URL", () => {
  it.each([
    ["https://api.gateway.com.bd/send?to={number}&msg={message}", null],
    ["http://66.45.237.70/api.php?number={number}", null], // পুরনো গেটওয়ে — http আর পাবলিক IP চলে
    ["https://sms.example.com:8443/api?n={number}", null],
  ])("চলে: %s", (url, want) => expect(customSmsUrlError(url, "sellxbd.com")).toBe(want));

  it.each([
    "ftp://gw.com/{number}",
    "javascript:alert(1)",
    "https://user:pass@gw.com/{number}",
    "http://localhost:8787/x?{number}",
    "http://127.0.0.1/x?{number}",
    "http://10.0.0.5/x?{number}",
    "http://192.168.1.1/x?{number}",
    "http://172.20.0.1/x?{number}",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1/x",
    "http://[::1]/x",
    "http://intranet/x",
    "https://evil.sellxbd.com/x?{number}",
    "https://sellxbd.com/admin",
    "not a url",
  ])("আটকায়: %s", (url) => expect(customSmsUrlError(url, "sellxbd.com")).toBeTruthy());

  it("পাঠানোর সময়ও যাচাই — খারাপ URL-এ কোনো রিকোয়েস্টই যায় না", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const r = await sendSms({ sms_provider: "custom", sms_custom_url: "http://169.254.169.254/?n={number}" } as any, "01712345678", "hi");
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("উত্তরের শুধু ৩০০ অক্ষর রাখে আর অন্য ঠিকানায় ঘুরিয়ে দিলে যায় না", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x".repeat(5000), { status: 200 }));
    const r = await sendSms({ sms_provider: "custom", sms_custom_url: "https://gw.example.com/?n={number}" } as any, "01712345678", "hi");
    expect(r.response.length).toBe(300);
    expect((spy.mock.calls[0]![1] as RequestInit).redirect).toBe("manual");
  });

  it("অ্যাডমিনে খারাপ URL সেভ হয় না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/sms", { sms_provider: "custom", sms_custom_url: "http://127.0.0.1/send?to={number}&m={message}" });
    const row = await DB.prepare("SELECT value FROM settings WHERE key = 'sms_custom_url'").first<{ value: string }>();
    expect(row?.value ?? "").not.toContain("127.0.0.1");
  });
});

describe("৭ — অ্যাডমিন আর সুপার অ্যাডমিনে CSP (script শুধু নিজের সাইট থেকে)", () => {
  const csp = (r: Response) => r.headers.get("content-security-policy") || "";

  it("দোকানের অ্যাডমিন পেজে script-src 'self'", async () => {
    expect(csp(await new Browser().get("/admin/login"))).toContain("script-src 'self'");
    const a = await adminBrowser();
    expect(csp(await a.get("/admin/orders"))).toContain("script-src 'self'");
  });

  it("সুপার অ্যাডমিনে script-src 'self'", async () => {
    const r = await SELF.fetch(`${P}/super/login`, { redirect: "manual" });
    expect(csp(r)).toContain("script-src 'self'");
  });

  it("দোকানের পাবলিক পেজে নয় (Pixel/GTM চলে), /admin-sw.js-এও নয়", async () => {
    expect(csp(await new Browser().get("/"))).not.toContain("script-src");
    expect(csp(await new Browser().get("/admin-sw.js"))).not.toContain("script-src");
  });

  it("অ্যাডমিন পেজে inline script বা onclick নেই (CSP-তে চলবে না বলে)", async () => {
    const a = await adminBrowser();
    for (const path of ["/admin/orders", "/admin/account", "/admin/orders/invoices?ids=1", "/admin/design"]) {
      const html = await (await a.get(path)).text();
      expect(html, path).not.toMatch(/<script(?![^>]*\b(src|type="application\/ld\+json")=)[^>]*>/i);
      expect(html, path).not.toMatch(/\son(click|load|error|submit|change)=/i);
    }
  });
});

describe("৮ — দোকানের নামে লিংক, ইমেইল বা ফোন নম্বর নয়", () => {
  it.each([
    ["রহিম ফ্যাশন", false], ["Shop 24", false], ["কাঠবন", false], ["Dream Dolna House", false], ["৭৮৬ স্টোর", false],
    ["bKash verify www.evil.xyz", true], ["https://x.co", true], ["Call 01712345678", true], ["কল করুন ০১৭১২-৩৪৫৬৭৮", true],
    ["Help a@b.com", true], ["evil.com শপ", true],
  ])("%s → %s", (name, bad) => expect(badShopName(name)).toBe(bad));

  it("ইমেইলে খারাপ নাম বসে না", () => {
    expect(emailSafeName("Call 01712345678")).toBe("আপনার দোকান");
    expect(emailSafeName("রহিম <ফ্যাশন>")).toBe("রহিম ফ্যাশন");
  });

  it("সাইনআপে লিংক/নম্বরওয়ালা নাম আটকায়", async () => {
    for (const k of ["turnstile_site_key", "turnstile_secret", "verify_email", "verify_phone"]) {
      await env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, '') ON CONFLICT(key) DO UPDATE SET value = ''").bind(k).run();
    }
    clearSettingsCache(); clearShopCache();
    const slug = `nm${Date.now() % 100000}`;
    const body = new URLSearchParams({ shop_name: "bKash Help 01712345678", slug, owner_name: "রহিম", phone: "01711111111", email: `n${Date.now()}@example.com`, password: "secret123" });
    const r = await SELF.fetch(`${P}/signup`, { method: "POST", body, redirect: "manual", headers: { origin: P, "cf-connecting-ip": "10.9.9.9" } });
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("লিংক, ইমেইল বা ফোন নম্বর");
    expect(await env.PLATFORM_DB.prepare("SELECT 1 FROM shops WHERE slug = ?").bind(slug).first()).toBeNull();
  });
});
