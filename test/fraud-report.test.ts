/**
 * কুরিয়ার রিপোর্ট কার্ড, পুরো ফ্রড রিপোর্ট, ফ্রড চেকার, সুপার অ্যাডমিনের চাবি
 */
import { env as rawEnv } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerEnv } from "../src/worker-env";
import { clearSettingsCache } from "../src/platform/billing";
import { adminBrowser, Browser, DB, lastOrder, resetDb } from "./helpers";

const env = rawEnv as unknown as WorkerEnv;
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
const PHONE = "01712345678";
const setP = (k: string, v: string) => env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();

const BD = {
  status: "success",
  data: {
    pathao: { name: "Pathao", logo: "https://api.bdcourier.com/c-logo/pathao.png", total_parcel: 3, success_parcel: 3, cancelled_parcel: 0, success_ratio: 100 },
    steadfast: { name: "Steadfast", logo: "https://api.bdcourier.com/c-logo/steadfast.png", total_parcel: 19, success_parcel: 18, cancelled_parcel: 1, success_ratio: 94.7 },
    redx: { name: "RedX", logo: "javascript:alert(1)", total_parcel: 0, success_parcel: 0, cancelled_parcel: 0, success_ratio: 0 },
    summary: { total_parcel: 22, success_parcel: 21, cancelled_parcel: 1, success_ratio: 95.45 },
  },
  reports: [],
};

let calls: { url: string; auth: string }[] = [];
beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM courier_checks").run();
  await DB.prepare("DELETE FROM rate_limits").run();
  for (const k of ["cr_bdcourier_token", "cr_steadfast_key", "cr_steadfast_secret"]) await setP(k, "");
  await setP("cr_on", "1"); await setP("cr_daily_limit", "100");
  clearSettingsCache();
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") || "" });
    if (url === "https://api.bdcourier.com/courier-check") return json(BD);
    return json({ ok: true });
  });
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 30));
  vi.restoreAllMocks();
});

describe("কুরিয়ার রিপোর্ট", () => {
  it("চাবি না থাকলে তালিকায় কার্ড নেই, সুপার অ্যাডমিনের চাবি দিলে খোঁজার কার্ড আসে", async () => {
    const admin = await adminBrowser();
    await new Browser().order({ phone: PHONE });
    expect(await (await admin.get("/admin/orders?status=new")).text()).not.toContain("cr-card");
    await setP("cr_bdcourier_token", "PLATFORM-TOKEN"); clearSettingsCache();
    const html = await (await admin.get("/admin/orders?status=new")).text();
    expect(html).toContain(`data-cr-auto="${(await lastOrder())!.id}"`);
    expect(html).toContain('id="fr-dlg"');
  });

  it("অর্ডার এলেই একবার খুঁজে অর্ডারে সেভ; তালিকা বা আবার দেখলে আর খোঁজে না", async () => {
    await setP("cr_bdcourier_token", "PLATFORM-TOKEN"); clearSettingsCache();
    const admin = await adminBrowser();
    await new Browser().order({ phone: PHONE });
    const o = (await lastOrder())!;
    await new Promise((r) => setTimeout(r, 50));
    const bd = () => calls.filter((c) => c.url.includes("bdcourier")).length;
    expect(bd()).toBe(1);
    expect(calls[0]!.auth).toBe("Bearer PLATFORM-TOKEN");
    const saved = await DB.prepare("SELECT courier_report FROM orders WHERE id = ?").bind(o.id).first<{ courier_report: string }>();
    expect(JSON.parse(saved!.courier_report)).toMatchObject({ total: 22, success: 21, source: "BD Courier" });
    // তালিকায় সেভ করা থেকে, বাইরের কল ছাড়া
    const list = await (await admin.get("/admin/orders?status=new")).text();
    expect(list).toContain("২২টার মধ্যে ২১টা ডেলিভারি");
    expect(list).not.toContain(`data-cr-auto="${o.id}"`);
    await admin.post("/admin/fraud-report/card", { order_id: String(o.id) });
    await admin.get(`/admin/fraud-report?phone=${PHONE}&order=${o.id}`);
    expect(bd()).toBe(1);
    // "আবার খুঁজুন" চাপলেই শুধু নতুন করে খোঁজে আর অর্ডারে সেভ
    await admin.post(`/admin/fraud-report?phone=${PHONE}&order=${o.id}`, {});
    expect(bd()).toBe(2);
  });

  it("পুরনো অর্ডারে (রিপোর্ট নেই) তালিকা খুললে কার্ড একবার খুঁজে সেভ করে", async () => {
    const admin = await adminBrowser();
    await new Browser().order({ phone: PHONE }); // তখন চাবি ছিল না → খোঁজা হয়নি
    const o = (await lastOrder())!;
    expect(calls.length).toBe(0);
    await setP("cr_bdcourier_token", "PLATFORM-TOKEN"); clearSettingsCache();
    expect(await (await admin.get("/admin/orders?status=new")).text()).toContain(`data-cr-auto="${o.id}"`);
    const card = await (await admin.post("/admin/fraud-report/card", { order_id: String(o.id) })).text();
    expect(card).toContain("২২টার মধ্যে ২১টা ডেলিভারি");
    await admin.post("/admin/fraud-report/card", { order_id: String(o.id) });
    expect(calls.filter((c) => c.url.includes("bdcourier")).length).toBe(1);
    expect((await DB.prepare("SELECT courier_report FROM orders WHERE id = ?").bind(o.id).first<{ courier_report: string | null }>())!.courier_report).toBeTruthy();
  });

  it("শুধু সুপার অ্যাডমিনের Steadfast চাবি: অর্ডারে Steadfast-এর রিপোর্ট সেভ", async () => {
    vi.restoreAllMocks();
    calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      calls.push({ url, auth: new Headers(init?.headers).get("api-key") || "" });
      if (url.includes("/fraud_check/score/")) return json({ delivery_ratio: 88, volume_band: "medium", total_reports: 1 });
      return json({ ok: true });
    });
    await setP("cr_steadfast_key", "SF-K"); await setP("cr_steadfast_secret", "SF-S"); clearSettingsCache();
    const admin = await adminBrowser();
    await new Browser().order({ phone: PHONE });
    const o = (await lastOrder())!;
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.find((c) => c.url.includes("/fraud_check/score/"))!.auth).toBe("SF-K");
    const list = await (await admin.get("/admin/orders?status=new")).text();
    expect(list).toContain("ডেলিভারি সফল ৮৮% (Steadfast)");
    expect(list).toContain("১টা ফ্রড রিপোর্ট");
    expect(JSON.parse((await DB.prepare("SELECT courier_report FROM orders WHERE id = ?").bind(o.id).first<{ courier_report: string }>())!.courier_report).source).toBe("Steadfast (medium)");
  });

  it("পুরো রিপোর্ট: কুরিয়ার অনুযায়ী ভাগ, নিরাপদ লোগো, এই দোকানের অর্ডার", async () => {
    await setP("cr_bdcourier_token", "PLATFORM-TOKEN"); clearSettingsCache();
    const admin = await adminBrowser();
    await new Browser().order({ phone: PHONE });
    const o = (await lastOrder())!;
    const html = await (await admin.get(`/admin/fraud-report?phone=${PHONE}`)).text();
    for (const t of ["Steadfast", "Pathao", "RedX", "১৯", "১৮", "৯৫%", "চমৎকার ক্রেতা", o.order_no, "সূত্র: BD Courier"]) expect(html).toContain(t);
    expect(html).toContain('src="https://api.bdcourier.com/c-logo/pathao.png"');
    expect(html).not.toContain("javascript:");
    // আবার খোঁজা (POST) বাইরের কল করে
    const n = calls.length;
    await admin.post(`/admin/fraud-report?phone=${PHONE}`, {});
    expect(calls.length).toBe(n + 1);
  });

  it("দোকানপ্রতি দৈনিক সীমা — শেষ হলে সুপার অ্যাডমিনের চাবিতে আর খোঁজে না", async () => {
    await setP("cr_bdcourier_token", "PLATFORM-TOKEN"); await setP("cr_daily_limit", "2"); clearSettingsCache();
    const admin = await adminBrowser();
    for (const p of ["01711111111", "01722222222", "01733333333"]) await admin.get(`/admin/fraud-check?phone=${p}`);
    expect(calls.filter((c) => c.url.includes("bdcourier")).length).toBe(2);
    const html = await (await admin.get("/admin/fraud-report?phone=01744444444")).text();
    expect(html).toContain("আজকের ফ্রি খোঁজার সীমা শেষ");
  });

  it("ফ্রড চেকার পেজ: ভুল নম্বরে এরর, ঠিক নম্বরে রিপোর্ট; মেনুতে আছে", async () => {
    await setP("cr_bdcourier_token", "PLATFORM-TOKEN"); clearSettingsCache();
    const admin = await adminBrowser();
    const empty = await (await admin.get("/admin/fraud-check")).text();
    expect(empty).toContain("ফ্রড চেকার");
    expect(empty).toContain('href="/admin/fraud-check"');
    expect(await (await admin.get("/admin/fraud-check?phone=123")).text()).toContain("সঠিক মোবাইল নম্বর দিন");
    const r = await (await admin.get("/admin/fraud-check?phone=+8801712345678")).text();
    expect(r).toContain("২২");
    expect(r).toContain("কুরিয়ার অনুযায়ী");
  });

  it("সুপার অ্যাডমিন বন্ধ রাখলে প্ল্যাটফর্মের চাবি ব্যবহার হয় না", async () => {
    await setP("cr_bdcourier_token", "PLATFORM-TOKEN"); await setP("cr_on", "0"); clearSettingsCache();
    const admin = await adminBrowser();
    const html = await (await admin.get(`/admin/fraud-report?phone=${PHONE}`)).text();
    expect(calls.length).toBe(0);
    expect(html).toContain("কুরিয়ার সেটিংসে");
  });
});
