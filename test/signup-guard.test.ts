import { beforeEach, describe, expect, it, vi } from "vitest";
import { env as rawEnv, SELF } from "cloudflare:test";
import type { WorkerEnv } from "../src/worker-env";
import { clearSettingsCache } from "../src/platform/billing";
import { clearShopCache } from "../src/platform/resolve";
import { confirmEmailLink, confirmPhoneOtp, riskFlags } from "../src/platform/verify";

const env = rawEnv as unknown as WorkerEnv;
const P = "https://ourdomain.com";
const set = (k: string, v: string) => env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();

let n = 0;
const form = (over: Record<string, string> = {}) => {
  n++;
  return new URLSearchParams({ shop_name: `টেস্ট দোকান ${n}`, slug: `guard${n}${Date.now() % 100000}`, owner_name: "রহিম", phone: `0171${String(1000000 + n).slice(-7)}`, email: `r${n}_${Date.now()}@example.com`, password: "secret123", ...over });
};
const signup = (body: URLSearchParams, ip = `10.0.0.${n % 250}`) =>
  SELF.fetch(`${P}/signup`, { method: "POST", body, redirect: "manual", headers: { origin: P, "cf-connecting-ip": ip } });

beforeEach(async () => {
  for (const k of ["turnstile_site_key", "turnstile_secret", "verify_email", "verify_phone", "sms_api_key"]) await set(k, "");
  clearSettingsCache();
  clearShopCache();
  vi.restoreAllMocks();
});

describe("সাইনআপের পাহারা", () => {
  it("যাচাই বন্ধ থাকলে আগের মতো: দোকান সাথে সাথে চালু", async () => {
    const b = form();
    const r = await signup(b);
    expect(r.status).toBe(303);
    const s = await env.PLATFORM_DB.prepare("SELECT email_verified, phone_verified FROM shops WHERE slug = ?").bind(b.get("slug")).first<any>();
    expect(s).toEqual({ email_verified: 1, phone_verified: 1 });
  });

  it("Turnstile চালু থাকলে উইজেট দেখায়, টোকেন ছাড়া দোকান হয় না", async () => {
    await set("turnstile_site_key", "site-abc");
    await set("turnstile_secret", "secret-xyz");
    clearSettingsCache();
    const page = await (await SELF.fetch(`${P}/signup`)).text();
    expect(page).toContain('data-sitekey="site-abc"');
    expect(page).toContain("challenges.cloudflare.com/turnstile");
    const b = form();
    const r = await signup(b);
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("মানুষ কিনা যাচাই হয়নি");
    expect(await env.PLATFORM_DB.prepare("SELECT 1 FROM shops WHERE slug = ?").bind(b.get("slug")).first()).toBeNull();
  });

  it("ফোন যাচাই চালু: দোকান অর্ডার নেয় না, noindex; OTP মিললে চালু", async () => {
    await set("verify_phone", "1");
    await set("sms_api_key", "k");
    clearSettingsCache();
    const b = form();
    expect((await signup(b)).status).toBe(303);
    const shop = await env.PLATFORM_DB.prepare("SELECT id, slug, phone_verified, email_verified FROM shops WHERE slug = ?").bind(b.get("slug")).first<any>();
    expect(shop.phone_verified).toBe(0);
    expect(shop.email_verified).toBe(1); // ইমেইল পাঠানোর ব্যবস্থা নেই, তাই লাগে না

    const home = await SELF.fetch(`https://${shop.slug}.ourdomain.com/`);
    expect(home.headers.get("x-robots-tag")).toContain("noindex");

    // OTP হাতে বসানো (SMS নকল করা কঠিন — কোড টেবিলে সরাসরি)
    const sha = async (x: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)))].map((v) => v.toString(16).padStart(2, "0")).join("");
    await env.PLATFORM_DB.prepare("INSERT INTO verify_codes (shop_id, kind, code_hash, target, expires_at) VALUES (?, 'phone', ?, 'x', datetime('now', '+10 minutes'))").bind(shop.id, await sha(`${shop.id}:123456`)).run();
    expect((await confirmPhoneOtp(env, shop.id, "111111")).ok).toBe(false);
    expect((await confirmPhoneOtp(env, shop.id, "123456")).ok).toBe(true);
    clearShopCache();
    const after = await SELF.fetch(`https://${shop.slug}.ourdomain.com/`);
    expect(after.headers.get("x-robots-tag")).toBeNull();
  });

  it("ইমেইলের লিংক একবারই কাজ করে", async () => {
    const b = form();
    await signup(b);
    const shop = await env.PLATFORM_DB.prepare("SELECT id FROM shops WHERE slug = ?").bind(b.get("slug")).first<any>();
    await env.PLATFORM_DB.prepare("UPDATE shops SET email_verified = 0 WHERE id = ?").bind(shop.id).run();
    const token = "a".repeat(48);
    const sha = async (x: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)))].map((v) => v.toString(16).padStart(2, "0")).join("");
    await env.PLATFORM_DB.prepare("INSERT INTO verify_codes (shop_id, kind, code_hash, target, expires_at) VALUES (?, 'email', ?, 'x', datetime('now', '+2 days'))").bind(shop.id, await sha(token)).run();
    expect(await confirmEmailLink(env, shop.id, "b".repeat(48))).toBe(false);
    expect(await confirmEmailLink(env, shop.id, token)).toBe(true);
    expect(await confirmEmailLink(env, shop.id, token)).toBe(false);
    expect((await env.PLATFORM_DB.prepare("SELECT email_verified FROM shops WHERE id = ?").bind(shop.id).first<any>()).email_verified).toBe(1);
  });

  it("সন্দেহের কারণ: প্রতারণার শব্দ, এককালীন ইমেইল, একই IP থেকে অনেক", async () => {
    const f = await riskFlags(env, { shop_name: "bKash Account Verify", slug: "bkash-login", email: "x@mailinator.com", phone: "01999999999", ip: "1.2.3.4" });
    expect(f).toContain("phish_word");
    expect(f).toContain("disposable");
    const ip = "9.9.9.9";
    await signup(form(), ip);
    await signup(form(), ip);
    const b = form();
    await signup(b, ip);
    const s = await env.PLATFORM_DB.prepare("SELECT risk FROM shops WHERE slug = ?").bind(b.get("slug")).first<any>();
    expect(s.risk).toContain("ip_many");
  });
});
