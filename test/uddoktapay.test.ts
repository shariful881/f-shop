import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env as rawEnv, SELF } from "cloudflare:test";
import type { WorkerEnv } from "../src/worker-env";
import { clearSettingsCache } from "../src/platform/billing";
import { clearShopCache } from "../src/platform/resolve";
import { adminBrowser, DEMO_SHOP_ID, resetDb } from "./helpers";

const env = rawEnv as unknown as WorkerEnv;
const P = "https://ourdomain.com";
const GW = "https://pay.example.com";
const KEY = "test-key-123";
const set = (k: string, v: string) => env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();
const balance = async () => (await env.PLATFORM_DB.prepare("SELECT balance FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<{ balance: number }>())!.balance;

type Call = { url: string; body: any; key: string | null };
let calls: Call[] = [];
/** গেটওয়ের verify-এর উত্তর — টেস্ট বদলায় */
let verify: (inv: string) => Record<string, unknown> = () => ({ status: "ERROR", message: "x" });

beforeEach(async () => {
  await resetDb();
  await env.PLATFORM_DB.prepare("DELETE FROM online_payments").run();
  await env.PLATFORM_DB.prepare("DELETE FROM ledger WHERE ref LIKE 'uddokta:%'").run();
  await set("uddokta_on", "1"); await set("uddokta_url", GW); await set("uddokta_key", KEY); await set("min_topup", "100");
  clearSettingsCache(); clearShopCache();
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body, key: new Headers(init?.headers).get("rt-uddoktapay-api-key") });
    if (url === `${GW}/api/checkout-v2`) return new Response(JSON.stringify({ status: true, message: "ok", payment_url: `${GW}/payment/abc` }));
    if (url === `${GW}/api/verify-payment`) return new Response(JSON.stringify(verify(body.invoice_id)));
    return new Response("{}", { status: 404 });
  });
});
afterEach(() => vi.restoreAllMocks());

async function startPay(amount = "500") {
  const a = await adminBrowser();
  const r = await a.post("/admin/billing/pay", { amount });
  return { a, r };
}
const lastPay = () => env.PLATFORM_DB.prepare("SELECT * FROM online_payments ORDER BY id DESC LIMIT 1").first<{ id: number; amount: number; status: string; invoice_id: string | null; trx_id: string | null }>();
const done = (pay: { id: number }, amount = "500") => ({ status: "COMPLETED", amount, fee: "0", charged_amount: amount, invoice_id: "INV12345", payment_method: "bkash", sender_number: "01711111111", transaction_id: "TRX9", metadata: { shop_id: DEMO_SHOP_ID, pay_id: String(pay.id) } });

describe("অনলাইন রিচার্জ (UddoktaPay)", () => {
  it("বিলিং পেজে অনলাইন ফর্ম শুধু চালু থাকলে", async () => {
    const a = await adminBrowser();
    expect(await (await a.get("/admin/billing")).text()).toContain('action="/admin/billing/pay"');
    await set("uddokta_on", "0"); clearSettingsCache();
    expect(await (await a.get("/admin/billing")).text()).not.toContain('action="/admin/billing/pay"');
  });

  it("পে করুন → গেটওয়ের পেজে যায়, সঠিক তথ্য আর API key পাঠায়", async () => {
    const { r } = await startPay("500");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`${GW}/payment/abc`);
    const c = calls.find((x) => x.url.endsWith("/checkout-v2"))!;
    expect(c.key).toBe(KEY);
    expect(c.body.amount).toBe("500");
    expect(c.body.metadata.shop_id).toBe(DEMO_SHOP_ID);
    expect(c.body.webhook_url).toBe(`${P}/api/uddoktapay/ipn`);
    expect(c.body.redirect_url).toContain("/admin/billing/pay/return?p=");
    expect((await lastPay())!.status).toBe("created");
  });

  it("কম টাকায় পেজ খোলে না", async () => {
    const { r } = await startPay("50");
    expect(r.status).toBe(422);
    expect(calls.length).toBe(0);
  });

  it("ফেরত এলে যাচাই করে একবারই ব্যালেন্সে যোগ (দুবার ফেরত/ওয়েবহুক এলেও না)", async () => {
    const { a } = await startPay("500");
    const pay = (await lastPay())!;
    verify = () => done(pay);
    const before = await balance();
    const r = await a.get(`/admin/billing/pay/return?p=${pay.id}&invoice_id=INV12345`);
    expect(r.status).toBe(303);
    expect(await balance()).toBe(before + 500);
    const p2 = (await lastPay())!;
    expect(p2.status).toBe("completed");
    expect(p2.trx_id).toBe("TRX9");
    // আবার ফেরত আর webhook — দ্বিতীয়বার যোগ নয়
    await a.get(`/admin/billing/pay/return?p=${pay.id}&invoice_id=INV12345`);
    const w = await SELF.fetch(`${P}/api/uddoktapay/ipn`, { method: "POST", headers: { "RT-UDDOKTAPAY-API-KEY": KEY, "content-type": "application/json" }, body: JSON.stringify({ invoice_id: "INV12345", status: "COMPLETED" }) });
    expect(w.status).toBe(200);
    expect(await balance()).toBe(before + 500);
    expect(await (await a.get("/admin/billing")).text()).toContain("bKash (অনলাইন)");
  });

  it("webhook: ভুল key হলে 401, ঠিক key হলে verify দিয়ে যোগ", async () => {
    await startPay("300");
    const pay = (await lastPay())!;
    verify = () => done(pay, "300");
    const before = await balance();
    const bad = await SELF.fetch(`${P}/api/uddoktapay/ipn`, { method: "POST", headers: { "RT-UDDOKTAPAY-API-KEY": "wrong", "content-type": "application/json" }, body: JSON.stringify({ invoice_id: "INV12345" }) });
    expect(bad.status).toBe(401);
    expect(await balance()).toBe(before);
    const ok = await SELF.fetch(`${P}/api/uddoktapay/ipn`, { method: "POST", headers: { "RT-UDDOKTAPAY-API-KEY": KEY, "content-type": "application/json" }, body: JSON.stringify({ invoice_id: "INV12345" }) });
    expect(ok.status).toBe(200);
    expect(await balance()).toBe(before + 300);
  });

  it("webhook-এর body-তে COMPLETED লিখলেও গেটওয়ে না বললে যোগ হয় না", async () => {
    await startPay("400");
    const pay = (await lastPay())!;
    verify = () => ({ ...done(pay, "400"), status: "PENDING" });
    const before = await balance();
    await SELF.fetch(`${P}/api/uddoktapay/ipn`, { method: "POST", headers: { "RT-UDDOKTAPAY-API-KEY": KEY, "content-type": "application/json" }, body: JSON.stringify({ invoice_id: "INV12345", status: "COMPLETED", amount: "400" }) });
    expect(await balance()).toBe(before);
    expect((await lastPay())!.status).toBe("pending");
  });

  it("কম টাকা পে হলে, অন্য দোকানের পেমেন্ট হলে যোগ হয় না", async () => {
    const { a } = await startPay("500");
    const pay = (await lastPay())!;
    const before = await balance();
    verify = () => ({ ...done(pay), metadata: { shop_id: "other-shop", pay_id: String(pay.id) } });
    await a.get(`/admin/billing/pay/return?p=${pay.id}&invoice_id=INV12345`);
    expect(await balance()).toBe(before);
    verify = () => done(pay, "100");
    await a.get(`/admin/billing/pay/return?p=${pay.id}&invoice_id=INV12345`);
    expect(await balance()).toBe(before);
    expect((await lastPay())!.status).toBe("failed");
  });

  it("বাতিল করলে কিছু যোগ হয় না", async () => {
    const { a } = await startPay("500");
    const pay = (await lastPay())!;
    const before = await balance();
    const r = await a.get(`/admin/billing/pay/return?p=${pay.id}&cancel=1`);
    expect(r.status).toBe(303);
    expect(await balance()).toBe(before);
    expect((await lastPay())!.status).toBe("failed");
  });
});
