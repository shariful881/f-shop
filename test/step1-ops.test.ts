import { env, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, DEMO_SHOP_ID, resetDb, shopStub } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { clearShopCache } from "../src/platform/resolve";
import { platformUsage, refreshShopStorage } from "../src/platform/usage";
import type { ShopDO } from "../src/shop/shop-do";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;

async function member(email: string, role: string) {
  await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES (?, ?, ?, ?, 1)")
    .bind(email, email.split("@")[0], role, await hashPassword("teampass123", 1000)).run();
  const b = new Browser();
  const r = await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email, password: "teampass123" }) } as RequestInit);
  expect(r.status).toBe(303);
  return b;
}

beforeEach(async () => {
  await resetDb();
  await pdb().batch([pdb().prepare("DELETE FROM super_admins"), pdb().prepare("DELETE FROM audit_log"), pdb().prepare("UPDATE shops SET status = 'active', balance = 1000 WHERE id = ?").bind(DEMO_SHOP_ID)]);
  clearShopCache();
});

describe("বাংলা এরর পেজ", () => {
  it("sellxbd.com-এর ভুল লিংকে মেনুসহ বাংলা পেজ", async () => {
    const r = await new Browser().fetch("/no-such-page", { base: P } as RequestInit);
    expect(r.status).toBe(404);
    const html = await r.text();
    expect(html).toContain("পেজটা পাওয়া যায়নি");
    expect(html).toContain('href="/help"');
  });
});

describe("ব্যাকআপ থেকে দোকান ফেরানো", () => {
  it("ডাটা মুছে গেলেও ব্যাকআপ আপলোড করে সব ফিরে আসে; ভুল slug বা অন্য দোকানের ফাইল চলে না", async () => {
    await adminBrowser();
    await new Browser().order({ name: "ফেরানো টেস্ট" });
    await DB.prepare("DELETE FROM incomplete_orders").run();
    await DB.prepare("INSERT INTO incomplete_orders (phone, name, status) VALUES ('01811111111', 'অসম্পূর্ণ টেস্ট', 'called')").run();
    const before = await DB.prepare("SELECT (SELECT COUNT(*) FROM products) p, (SELECT COUNT(*) FROM orders) o, (SELECT COUNT(*) FROM order_items) i").first<{ p: number; o: number; i: number }>();
    const owner = await member("own@t.com", "owner");
    const backup = await (await owner.fetch(`/super/shops/${DEMO_SHOP_ID}/export.json`, { base: P } as RequestInit)).text();

    // দুর্ঘটনা: সব পণ্য আর অর্ডার মুছে গেল
    await DB.batch([DB.prepare("DELETE FROM order_items"), DB.prepare("DELETE FROM orders"), DB.prepare("DELETE FROM product_variants"), DB.prepare("DELETE FROM products"), DB.prepare("DELETE FROM incomplete_orders")]);
    expect((await DB.prepare("SELECT COUNT(*) n FROM products").first<{ n: number }>())!.n).toBe(0);

    const send = (confirm: string, body = backup) => {
      const fd = new FormData();
      fd.append("file", new File([body], "backup.json", { type: "application/json" }));
      fd.append("confirm", confirm);
      return owner.fetch(`/super/shops/${DEMO_SHOP_ID}/restore`, { method: "POST", base: P, body: fd } as RequestInit);
    };
    await send("wrong-slug");
    expect((await DB.prepare("SELECT COUNT(*) n FROM products").first<{ n: number }>())!.n).toBe(0);
    await send("demoshop", JSON.stringify({ shop_id: "someone-else", tables: {} }));
    expect((await DB.prepare("SELECT COUNT(*) n FROM products").first<{ n: number }>())!.n).toBe(0);

    expect((await send("demoshop")).status).toBe(303);
    const after = await DB.prepare("SELECT (SELECT COUNT(*) FROM products) p, (SELECT COUNT(*) FROM orders) o, (SELECT COUNT(*) FROM order_items) i").first<{ p: number; o: number; i: number }>();
    expect(after).toEqual(before);
    expect(await DB.prepare("SELECT name FROM orders WHERE name = 'ফেরানো টেস্ট'").first()).toBeTruthy();
    expect(await DB.prepare("SELECT status FROM incomplete_orders WHERE name = 'অসম্পূর্ণ টেস্ট'").first<{ status: string }>()).toEqual({ status: "called" });
    // ইউজার মোছেনি, দোকান চলে
    expect((await DB.prepare("SELECT COUNT(*) n FROM users").first<{ n: number }>())!.n).toBeGreaterThan(0);
    expect((await new Browser().get("/")).status).toBe(200);
    expect(await pdb().prepare("SELECT 1 FROM audit_log WHERE action = 'shop.restore'").first()).toBeTruthy();

    const admin = await member("adm@t.com", "admin");
    const fd = new FormData();
    fd.append("file", new File([backup], "b.json")); fd.append("confirm", "demoshop");
    expect((await admin.fetch(`/super/shops/${DEMO_SHOP_ID}/restore`, { method: "POST", base: P, body: fd } as RequestInit)).status).toBe(403);
  });
});

describe("ফ্রি প্ল্যানের জায়গার হিসাব", () => {
  it("cron দোকানের মাপ নেয়, ড্যাশবোর্ডে দেখায়", async () => {
    await runInDurableObject(shopStub(), (i: ShopDO) => i.ensureInit(DEMO_SHOP_ID, false));
    expect(await refreshShopStorage(env as any, 50)).toBeGreaterThan(0);
    const row = await pdb().prepare("SELECT db_bytes FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<{ db_bytes: number }>();
    expect(row!.db_bytes).toBeGreaterThan(0);
    const u = await platformUsage(pdb());
    expect(u.doBytes).toBeGreaterThan(0);
    expect(u.warn).toBe(false);
    const owner = await member("own@t.com", "owner");
    const html = await (await owner.fetch("/super", { base: P } as RequestInit)).text();
    expect(html).toContain("দোকানগুলোর জায়গা");
    expect(html).toContain("মূল ডাটাবেস");
  });
});
