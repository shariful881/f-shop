/** SellxBD-এর নিজের Facebook Pixel + Conversions API (মূল সাইট, সাইনআপ, রিচার্জ) */
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, DEMO_SHOP_ID, resetDb } from "./helpers";
import { hashPassword, sha256Hex } from "../src/shop/lib/auth";
import { clearSettingsCache } from "../src/platform/billing";

const P = "https://ourdomain.com";
let sent: any[] = [];
const wait = () => new Promise((r) => setTimeout(r, 60));

async function setPx(on = true) {
  const kv = on ? [["fb_px_id", "1234567890"], ["fb_px_token", "EAAtoken"], ["fb_px_test", "TEST99"]] : [["fb_px_id", ""], ["fb_px_token", ""]];
  await env.PLATFORM_DB.batch(kv.map(([k, v]) => env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v)));
  clearSettingsCache();
}
const events = (name?: string) => sent.flatMap((p) => p.data).filter((e: any) => !name || e.event_name === name);

beforeEach(async () => {
  await resetDb();
  sent = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://graph.facebook.com/")) {
      expect(url).toContain("/1234567890/events");
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
});
afterEach(async () => {
  await wait();
  await setPx(false);
  vi.restoreAllMocks();
});

describe("SellxBD Pixel", () => {
  it("চাবি না থাকলে কিছুই বসে না, সাইনআপ আগের মতো সরাসরি দোকানে", async () => {
    const home = await new Browser().fetch("/", { base: P } as RequestInit);
    expect(await home.text()).not.toContain("fbevents.js");
    const r = await new Browser("172.31.0.21").fetch("/signup", { method: "POST", base: P, body: new URLSearchParams({
      shop_name: "পিক্সেল নেই", slug: "nopx", owner_name: "মালিক", phone: "01811111112", email: "a@nopx.test", password: "secret123" }) } as RequestInit);
    expect(r.status).toBe(303);
  });

  it("পাবলিক পেজে Pixel; /px ব্রাউজার ইভেন্ট সার্ভারে একই event_id দিয়ে পাঠায়, অজানা ইভেন্ট বাদ", async () => {
    await setPx();
    const b = new Browser();
    const html = await (await b.fetch("/", { base: P } as RequestInit)).text();
    expect(html).toContain("fbevents.js");
    expect(html).toContain("fbq('init',\"1234567890\")");
    expect(html).toContain("T('PageView')");
    const post = (d: unknown) => b.fetch("/px", { method: "POST", base: P, body: JSON.stringify(d), headers: { "content-type": "application/json", cookie: "_fbp=fb.1.1700000000000.123456789" } } as RequestInit);
    expect((await post({ n: "Lead", id: "Lead_abc12345", p: { content_name: "signup", evil: "x" }, u: `${P}/signup?fbclid=AbCdEf123456` })).status).toBe(204);
    expect((await post({ n: "Purchase", id: "Purchase_abc12345", u: P })).status).toBe(204);
    await wait();
    const ev = events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ event_name: "Lead", event_id: "Lead_abc12345", action_source: "website", custom_data: { content_name: "signup" } });
    expect(ev[0].user_data.fbp).toBe("fb.1.1700000000000.123456789");
    expect(ev[0].user_data.fbc).toMatch(/^fb\.1\.\d+\.AbCdEf123456$/);
    expect(sent[0].test_event_code).toBe("TEST99");
  });

  it("সাইনআপে শুধু StartTrial; ফোনে যাচাইয়ে CompleteRegistration একবার; রিচার্জ পেজে InitiateCheckout; অনুমোদনে Purchase", async () => {
    await setPx();
    const owner = new Browser("172.31.0.22");
    const r = await owner.fetch("/signup", { method: "POST", base: P, headers: { cookie: "_fbp=fb.1.1700000000000.987654321" }, body: new URLSearchParams({
      shop_name: "পিক্সেল দোকান", slug: "pxshop", owner_name: "মালিক", phone: "01811111113", email: "Owner@PX.test", password: "secret123" }) } as RequestInit);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("pxshop.ourdomain.com/admin/auto-login?t=");
    await wait();
    expect(events("CompleteRegistration")).toHaveLength(0); // ভুয়া সাইনআপ ঠেকাতে — যাচাইয়ের আগে নয়
    const trial = events("StartTrial")[0];
    expect(trial).toBeTruthy();
    expect(html).toContain(trial.event_id);
    const shop = (await env.PLATFORM_DB.prepare("SELECT id, ad_click FROM shops WHERE slug = 'pxshop'").first<{ id: string; ad_click: string }>())!;
    expect(trial.user_data.em).toEqual([await sha256Hex("owner@px.test")]);
    expect(trial.user_data.external_id).toEqual([await sha256Hex(shop.id)]);
    expect(trial.user_data.ph).toBeTruthy();
    expect(JSON.parse(shop.ad_click).fbp).toBe("fb.1.1700000000000.987654321");

    // রিচার্জ পেজ — দিনে একবার
    sent = [];
    const a = await adminBrowser();
    await a.get("/admin/billing");
    await a.get("/admin/billing");
    await wait();
    expect(events("InitiateCheckout")).toHaveLength(1);

    // অনুমোদনে Purchase, দোকান খোলার সময়ের fbp সহ (ডেমো দোকানের বদলে pxshop-এর রিচার্জ)
    await env.PLATFORM_DB.prepare("INSERT INTO topups (shop_id, amount, method, sender, trx_id) VALUES (?, 500, 'bkash', '01812345678', 'PXTRX1')").bind(shop.id).run();
    const t = (await env.PLATFORM_DB.prepare("SELECT id FROM topups WHERE trx_id = 'PXTRX1'").first<{ id: number }>())!;
    await env.PLATFORM_DB.prepare("INSERT OR REPLACE INTO super_admins (id, email, password_hash) VALUES (1, 'boss@test.com', ?)").bind(await hashPassword("bosspass123", 1000)).run();
    const sa = new Browser();
    await sa.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "boss@test.com", password: "bosspass123" }) } as RequestInit);
    // ফোনে কথা বলে মোবাইল যাচাই → CompleteRegistration, একবারই
    sent = [];
    await sa.fetch(`/super/shops/${shop.id}/verify`, { method: "POST", base: P, body: new URLSearchParams({ what: "phone" }) } as RequestInit);
    await sa.fetch(`/super/shops/${shop.id}/verify`, { method: "POST", base: P, body: new URLSearchParams({ what: "both" }) } as RequestInit);
    await sa.fetch(`/super/shops/${shop.id}/verify`, { method: "POST", base: P, body: new URLSearchParams({ what: "email" }) } as RequestInit);
    await wait();
    const regs = events("CompleteRegistration");
    expect(regs).toHaveLength(1);
    expect(regs[0]).toMatchObject({ event_id: `reg_${shop.id}`, custom_data: { status: "verified" } });
    expect(regs[0].user_data.fbp).toBe("fb.1.1700000000000.987654321");

    sent = [];
    await sa.fetch(`/super/topups/${t.id}/approve`, { method: "POST", base: P, body: new URLSearchParams() } as RequestInit);
    await wait();
    const pur = events("Purchase")[0];
    expect(pur).toMatchObject({ event_id: `topup_${t.id}`, custom_data: { currency: "BDT", value: 500 } });
    expect(pur.user_data.fbp).toBe("fb.1.1700000000000.987654321");
    expect(pur.user_data.client_user_agent).toBeTruthy();
    expect(DEMO_SHOP_ID).toBeTruthy();
  });

  it("সুপার অ্যাডমিনে সেভ: টোকেন পেজে দেখায় না, ভুল আইডি নেয় না", async () => {
    await env.PLATFORM_DB.prepare("INSERT OR REPLACE INTO super_admins (id, email, password_hash) VALUES (1, 'boss@test.com', ?)").bind(await hashPassword("bosspass123", 1000)).run();
    const sa = new Browser();
    await sa.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "boss@test.com", password: "bosspass123" }) } as RequestInit);
    await sa.fetch("/super/settings/fb-pixel", { method: "POST", base: P, body: new URLSearchParams({ fb_px_id: "abc", fb_px_token: "x" }) } as RequestInit);
    clearSettingsCache();
    expect((await env.PLATFORM_DB.prepare("SELECT value FROM platform_settings WHERE key = 'fb_px_id'").first())?.value ?? "").toBe("");
    await sa.fetch("/super/settings/fb-pixel", { method: "POST", base: P, body: new URLSearchParams({ fb_px_id: "1234567890", fb_px_token: "SECRETTOKEN123" }) } as RequestInit);
    clearSettingsCache();
    const page = await (await sa.fetch("/super/settings", { base: P } as RequestInit)).text();
    expect(page).toContain("1234567890");
    expect(page).not.toContain("SECRETTOKEN123");
    expect(page).toContain("দেওয়া আছে");
  });
});
