/**
 * প্ল্যান অনুযায়ী ছবির জায়গা, ৩০ দিন অচল দোকান মোছা, ট্রায়াল ১ মাস
 */
import { env, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, createShop, DB, DEMO_SHOP_ID, resetDb, shopStub } from "./helpers";
import { clearSettingsCache } from "../src/platform/billing";
import { clearShopCache } from "../src/platform/resolve";
import { runShopCleanup } from "../src/platform/cleanup";
import type { ShopDO } from "../src/shop/shop-do";

const pdb = () => env.PLATFORM_DB;
const jpg = (kb: number) => new File([new Uint8Array(kb * 1024)], "a.jpg", { type: "image/jpeg" });

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM images").run();
  await pdb().prepare("DELETE FROM platform_settings WHERE key LIKE 'plan_%_storage'").run();
  await pdb().prepare("UPDATE shops SET status = 'active', plan = 'free', created_at = datetime('now', '-1 day') WHERE id = ?").bind(DEMO_SHOP_ID).run();
  clearShopCache();
  clearSettingsCache();
});

describe("অচল দোকান মোছা", () => {
  const make = async (id: string, slug: string, fields: string) => {
    await createShop(id, slug);
    await runInDurableObject(shopStub(id), (i: ShopDO) => i.ensureInit(id, false));
    await pdb().prepare(`UPDATE shops SET ${fields}, owner_name = 'রহিম', owner_phone = '01712345678' WHERE id = ?`).bind(id).run();
    clearShopCache();
  };

  it("৩০ দিন অচল ফ্রি দোকান মোছে, পরিচয় থাকে; পেইড, সচল আর ডেমো দোকান থাকে", async () => {
    await make("idle-1", "idleone", "status = 'active', plan = 'free', created_at = datetime('now', '-60 days'), last_login_at = datetime('now', '-31 days')");
    await make("paid-1", "paidone", "status = 'active', plan = 'small', created_at = datetime('now', '-60 days'), last_login_at = datetime('now', '-40 days')");
    await make("fresh-1", "freshone", "status = 'active', plan = 'free', created_at = datetime('now', '-60 days'), last_login_at = datetime('now', '-3 days')");
    await make("demo-1", "demoone", "status = 'active', plan = 'free', demo_niche = 'x', created_at = datetime('now', '-60 days')");
    const r = await runShopCleanup(env as any);
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    const row = (id: string) => pdb().prepare("SELECT status, deleted_at, name, owner_phone, plan FROM shops WHERE id = ?").bind(id).first<any>();
    expect(await row("idle-1")).toMatchObject({ status: "closed", name: "idleone", owner_phone: "01712345678", plan: "free" });
    expect((await row("idle-1")).deleted_at).toBeTruthy();
    for (const id of ["paid-1", "fresh-1", "demo-1"]) expect((await row(id)).deleted_at).toBeNull();
    // দোকানের ডাটাবেস ফাঁকা, ঠিকানায় দোকান খোলে না
    expect(await runInDurableObject(shopStub("idle-1"), async (i: ShopDO) => (i as any).ctx.storage.sql.databaseSize)).toBeLessThan(20000);
    const res = await new Browser().fetch("/", { base: "https://idleone.ourdomain.com" } as RequestInit);
    expect(res.status).toBe(404);
  });

  it("৭ দিন আর ১ দিন আগে একবার করে সতর্ক করে; প্যানেলে ঢুকলে আবার গোনা শুরু", async () => {
    await pdb().prepare("UPDATE shops SET last_login_at = datetime('now', '-24 days'), created_at = datetime('now', '-40 days'), delete_warned = NULL WHERE id = ?").bind(DEMO_SHOP_ID).run();
    await runShopCleanup(env as any);
    await runShopCleanup(env as any);
    const w = (await pdb().prepare("SELECT delete_warned, deleted_at FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<any>())!;
    expect(w.delete_warned).toBe("7");
    expect(w.deleted_at).toBeNull();
    const a = await adminBrowser();
    await a.get("/admin");
    const after = (await pdb().prepare("SELECT delete_warned, last_login_at > datetime('now', '-1 hour') fresh FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<any>())!;
    expect(after.fresh).toBe(1);
    expect(after.delete_warned).toBeNull();
  });

  it("৩০ দিনের বেশি বন্ধ থাকা দোকানও মোছে; সুপার অ্যাডমিনে ব্যাকআপ/লগইন আটকায়", async () => {
    await make("closed-1", "closedone", "status = 'closed', status_changed_at = datetime('now', '-31 days')");
    await runShopCleanup(env as any);
    expect((await pdb().prepare("SELECT deleted_at FROM shops WHERE id = 'closed-1'").first<any>()).deleted_at).toBeTruthy();
  });
});

describe("ছবির জায়গার সীমা", () => {
  it("সীমা পেরোলে আপলোড আটকায় (JSON বার্তা), কাস্টমারের রিভিউ ছবি আটকায় না, মিডিয়া পেজে সতর্কতা", async () => {
    // ফ্রি প্ল্যান ৫০ MB — আগে থেকেই ৪৯.৬ MB ভরা
    await DB.prepare("INSERT INTO images (key, type, size, chunks) VALUES ('p/old.jpg', 'image/jpeg', ?, 0)").bind(Math.round(49.6 * 1024 * 1024)).run();
    const a = await adminBrowser();
    const up = () => { const fd = new FormData(); fd.append("image", jpg(600)); return a.fetch("/admin/upload-image", { method: "POST", body: fd }); };
    const r = await up();
    expect(r.status).toBe(413);
    expect((await r.json() as any).message).toContain("ছবির জায়গা শেষ");
    expect((await DB.prepare("SELECT COUNT(*) n FROM images").first<any>()).n).toBe(1);
    const html = await (await a.get("/admin/media")).text();
    expect(html).toContain("প্ল্যানের সীমা ৫০ MB");
    await DB.prepare("UPDATE images SET size = 1024 WHERE key = 'p/old.jpg'").run();
    expect((await up()).status).toBe(200);
  });

  it("প্ল্যান অনুযায়ী সীমা: ফ্রি ৫০ MB, বাড়ন্ত ১ GB; দাম পেজে দেখায়", async () => {
    const a = await adminBrowser();
    expect(await (await a.get("/admin/media")).text()).toContain("প্ল্যানের সীমা ৫০ MB");
    await pdb().prepare("UPDATE shops SET plan = 'grow' WHERE id = ?").bind(DEMO_SHOP_ID).run();
    clearShopCache();
    expect(await (await a.get("/admin/media")).text()).toContain("প্ল্যানের সীমা ১ GB");
    const pricing = await (await new Browser().fetch("/pricing", { base: "https://ourdomain.com" } as RequestInit)).text();
    expect(pricing).toContain("ছবির জায়গা ৩ GB");
  });
});

describe("ট্রায়াল ১ মাস", () => {
  it("নতুন দোকানের ট্রায়াল ৩০ দিন, সাইনআপ পেজে লেখা", async () => {
    const html = await (await new Browser().fetch("/signup", { base: "https://ourdomain.com" } as RequestInit)).text();
    expect(html).toContain("১ মাস সব ফিচার ফ্রি");
    const home = await (await new Browser().fetch("/", { base: "https://ourdomain.com" } as RequestInit)).text();
    expect(home).toContain("৩০ দিন");
  });
});
