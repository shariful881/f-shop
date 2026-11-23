import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DEMO_SHOP_ID, lastOrder, resetDb, setStatus } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { clearSettingsCache } from "../src/platform/billing";
import { clearShopCache } from "../src/platform/resolve";
import { clearAnnouncementCache } from "../src/shop/routes/admin";

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
const get = (b: Browser, path: string) => b.fetch(path, { base: P } as RequestInit);
const post = (b: Browser, path: string, data: Record<string, string> = {}) =>
  b.fetch(path, { method: "POST", base: P, body: new URLSearchParams(data) } as RequestInit);
const shop = async () => (await pdb().prepare("SELECT * FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<Record<string, any>>())!;

beforeEach(async () => {
  await resetDb();
  await pdb().batch([
    pdb().prepare("DELETE FROM ledger"), pdb().prepare("DELETE FROM topups"), pdb().prepare("DELETE FROM audit_log"),
    pdb().prepare("DELETE FROM shop_notes"), pdb().prepare("DELETE FROM announcements"), pdb().prepare("DELETE FROM super_admins"),
    pdb().prepare("UPDATE shops SET status = 'active', balance = 0, confirmed_orders = 0, last_order_at = NULL, low_balance_since = NULL, next_bill_at = datetime('now', '+20 days') WHERE id = ?").bind(DEMO_SHOP_ID),
  ]);
  clearShopCache();
  clearSettingsCache();
});

describe("ড্যাশবোর্ড আর পরিসংখ্যান", () => {
  it("কনফার্ম অর্ডারে দোকানের কাউন্টার বাড়ে, ড্যাশবোর্ডে আয় আর অর্ডার দেখায়", async () => {
    const a = await adminBrowser();
    await new Browser().order({ phone: "01712345678" });
    await setStatus(a, (await lastOrder())!.id, "confirmed");
    const s = await shop();
    expect(s.confirmed_orders).toBe(1);
    expect(s.last_order_at).toBeTruthy();
    const b = await member("owner@t.com", "owner");
    const html = await (await get(b, "/super")).text();
    expect(html).toContain("আনুমানিক MRR");
    expect(html).toContain("কনফার্ম অর্ডার (৩০ দিন)");
    expect(html).toContain("demo"); // সেরা দোকানে
    expect(html).toContain("<svg");
  });

  it("দোকানের তালিকা: ফিল্টার, সাজানো, CSV (সূত্র-ইনজেকশন থেকে নিরাপদ)", async () => {
    await pdb().prepare("UPDATE shops SET balance = -50, name = '=HYPERLINK(1)' WHERE id = ?").bind(DEMO_SHOP_ID).run();
    const b = await member("owner@t.com", "owner");
    const dues = await (await get(b, "/super/shops?filter=dues")).text();
    expect(dues).toContain("=HYPERLINK(1)");
    expect(await (await get(b, "/super/shops?filter=paying")).text()).toContain("কোনো দোকান পাওয়া যায়নি");
    const csv = await (await get(b, "/super/shops.csv?filter=dues")).text();
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect((await pdb().prepare("SELECT action FROM audit_log WHERE action = 'export.shops'").first())).toBeTruthy();
    expect(dues).toContain("/super/shops.csv?");
  });

  it("দোকানের CSV (সব মালিকের ফোন/ইমেইল) শুধু owner নামাতে পারে", async () => {
    for (const role of ["admin", "support", "finance"]) {
      const b = await member(`${role}@t.com`, role);
      const r = await get(b, "/super/shops.csv");
      expect(r.status).toBe(403);
      expect(await r.text()).not.toContain("owner_phone");
      expect(await (await get(b, "/super/shops")).text()).not.toContain("/super/shops.csv?");
    }
    expect((await pdb().prepare("SELECT action FROM audit_log WHERE action = 'export.shops'").first())).toBeFalsy();
  });
});

describe("রোল আর অনুমতি", () => {
  it("সাপোর্ট দোকান দেখতে পারে কিন্তু ব্যালেন্স, সেটিংস, টিম পারে না", async () => {
    const s = await member("sup@t.com", "support");
    expect((await get(s, `/super/shops/${DEMO_SHOP_ID}`)).status).toBe(200);
    expect((await post(s, `/super/shops/${DEMO_SHOP_ID}/adjust`, { amount: "500", note: "x" })).status).toBe(403);
    expect((await shop()).balance).toBe(0);
    expect((await get(s, "/super/settings")).status).toBe(403);
    expect((await get(s, "/super/team")).status).toBe(403);
    expect((await get(s, "/super/topups")).status).toBe(403);
    const dash = await (await get(s, "/super")).text();
    expect(dash).not.toContain('href="/super/settings"');
  });

  it("ফাইন্যান্স ব্যালেন্স সমন্বয় করতে পারে, দোকান বন্ধ করতে পারে না; সব অডিট লগে", async () => {
    const f = await member("fin@t.com", "finance");
    await post(f, `/super/shops/${DEMO_SHOP_ID}/adjust`, { amount: "75", note: "বোনাস" });
    expect((await shop()).balance).toBe(75);
    expect((await post(f, `/super/shops/${DEMO_SHOP_ID}/status`, { status: "closed" })).status).toBe(403);
    expect((await shop()).status).toBe("active");
    const log = await pdb().prepare("SELECT admin_email, action, target_id, detail FROM audit_log WHERE action = 'shop.adjust'").first<any>();
    expect(log).toMatchObject({ admin_email: "fin@t.com", target_id: DEMO_SHOP_ID });
    expect(log.detail).toContain("বোনাস");
  });

  it("মালিক টিমে সদস্য যোগ করে; বন্ধ করলে সেই সদস্য আর ঢুকতে পারে না", async () => {
    const o = await member("owner@t.com", "owner");
    expect((await post(o, "/super/team", { name: "রনি", email: "rony@t.com", role: "support", password: "short" })).status).toBe(422);
    await post(o, "/super/team", { name: "রনি", email: "rony@t.com", role: "support", password: "ronypass123" });
    const r = new Browser();
    expect((await r.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "rony@t.com", password: "ronypass123" }) } as RequestInit)).status).toBe(303);
    expect((await get(r, "/super")).status).toBe(200);
    const id = (await pdb().prepare("SELECT id FROM super_admins WHERE email = 'rony@t.com'").first<{ id: number }>())!.id;
    await post(o, `/super/team/${id}`, { role: "support", active: "0" });
    expect((await get(r, "/super")).headers.get("location")).toBe("/super/login");
  });
});

describe("দোকানের নিয়ন্ত্রণ", () => {
  it("অবস্থা বদলে কারণসহ অডিট, status_changed_at সেট হয়", async () => {
    const o = await member("owner@t.com", "owner");
    await post(o, `/super/shops/${DEMO_SHOP_ID}/status`, { status: "suspended", reason: "বকেয়া" });
    const s = await shop();
    expect(s.status).toBe("suspended");
    expect(s.status_changed_at).toBeTruthy();
    const log = await pdb().prepare("SELECT detail FROM audit_log WHERE action = 'shop.status'").first<any>();
    expect(log.detail).toContain("active → suspended (বকেয়া)");
  });

  it("সাপোর্ট লগইন: এককালীন লিংকে দোকানের মালিক হিসেবে ঢোকে, অডিটে থাকে", async () => {
    await adminBrowser(); // দোকানে মালিক আছে
    const s = await member("sup@t.com", "support");
    const res = await post(s, `/super/shops/${DEMO_SHOP_ID}/impersonate`, { reason: "টিকেট ১২" });
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/admin/auto-login");
    expect(loc.searchParams.get("support")).toBe("1");
    const shopB = new Browser();
    const login = await shopB.fetch(loc.pathname + loc.search, { base: "https://shop.test" } as RequestInit);
    expect(login.headers.get("location")).toBe("/admin");
    const panel = await (await shopB.fetch("/admin/orders", { base: "https://shop.test" } as RequestInit)).text();
    expect(panel).toContain("সাপোর্ট মোড");
    // বের হলে সুপার অ্যাডমিনের দোকানের পেজে ফেরে, সাপোর্ট মোড মুছে যায়
    const out = await shopB.fetch("/admin/logout", { method: "POST", base: "https://shop.test", body: new URLSearchParams() } as RequestInit);
    expect(out.headers.get("location")).toBe(`https://ourdomain.com/super/shops/${DEMO_SHOP_ID}`);
    expect(shopB.cookies.has("support_mode")).toBe(false);
    // একই লিংক দ্বিতীয়বার কাজ করে না
    expect((await new Browser().fetch(loc.pathname + loc.search, { base: "https://shop.test" } as RequestInit)).headers.get("location")).toBe("/admin/login");
    const log = await pdb().prepare("SELECT admin_email, detail FROM audit_log WHERE action = 'shop.impersonate'").first<any>();
    expect(log).toMatchObject({ admin_email: "sup@t.com", detail: "টিকেট ১২" });
  });

  it("দোকানের তালিকায় এক ক্লিকে ঢোকার বাটন; দোকানের পেজে পণ্য আর অর্ডারের হিসাব", async () => {
    await adminBrowser();
    await new Browser().order({ phone: "01712345678" });
    const o = await member("owner@t.com", "owner");
    const list = await (await get(o, "/super/shops")).text();
    expect(list).toContain(`/super/shops/${DEMO_SHOP_ID}/impersonate`);
    const detail = await (await get(o, `/super/shops/${DEMO_SHOP_ID}`)).text();
    expect(detail).toContain("দোকানের ভিতরে এখন");
    expect(detail).toContain("ORD-1001");
    const f = await member("fin@t.com", "finance");
    expect(await (await get(f, "/super/shops")).text()).not.toContain("/impersonate");
  });

  it("নোট আর মালিকের তথ্য বদল", async () => {
    const o = await member("owner@t.com", "owner");
    await post(o, `/super/shops/${DEMO_SHOP_ID}/notes`, { note: "ফোনে কথা হয়েছে" });
    await post(o, `/super/shops/${DEMO_SHOP_ID}/edit`, { name: "নতুন নাম", owner_name: "করিম", owner_phone: "+8801812345678", owner_email: "K@X.com" });
    const s = await shop();
    expect(s).toMatchObject({ name: "নতুন নাম", owner_phone: "01812345678", owner_email: "k@x.com" });
    const html = await (await get(o, `/super/shops/${DEMO_SHOP_ID}`)).text();
    expect(html).toContain("ফোনে কথা হয়েছে");
  });
});

describe("ঘোষণা", () => {
  it("সুপার অ্যাডমিনের ঘোষণা দোকানের অ্যাডমিন প্যানেলে দেখায়", async () => {
    const o = await member("owner@t.com", "owner");
    await post(o, "/super/announcements", { title: "নতুন ফিচার এসেছে", body: "Pathao যোগ হয়েছে", level: "success", days: "7" });
    clearAnnouncementCache();
    const a = await adminBrowser();
    const html = await (await a.get("/admin/orders")).text();
    expect(html).toContain("নতুন ফিচার এসেছে");
    expect(html).toContain("banner-ann-success");
    // বন্ধ করলে আর দেখায় না
    const id = (await pdb().prepare("SELECT id FROM announcements").first<{ id: number }>())!.id;
    await post(o, `/super/announcements/${id}/toggle`);
    clearAnnouncementCache();
    expect(await (await a.get("/admin/orders")).text()).not.toContain("নতুন ফিচার এসেছে");
  });
});

describe("সেটিংস অডিট", () => {
  it("দাম বদলালে আগে → পরে অডিটে থাকে", async () => {
    const o = await member("owner@t.com", "owner");
    const s = await pdb().prepare("SELECT key, value FROM platform_settings").all<{ key: string; value: string }>();
    const form = Object.fromEntries(s.results.map((r) => [r.key, r.value]));
    await post(o, "/super/settings", { ...form, plan_small_price: "349" });
    const log = await pdb().prepare("SELECT detail FROM audit_log WHERE action = 'settings.update'").first<any>();
    expect(log.detail).toMatch(/plan_small_price: \S* → 349/);
    await post(o, "/super/settings", { ...form });
  });
});

describe("ডেমো দোকান হিসাবে গোনা হয় না", () => {
  it("ডেমো দোকান তালিকা আর গণনায় নেই, শুধু 'ডেমো' ফিল্টারে", async () => {
    const b = await member("owner@t.com", "owner");
    const total = async () => (await pdb().prepare("SELECT COUNT(*) n FROM shops WHERE demo_niche IS NULL").first<{ n: number }>())!.n;
    const n0 = await total();
    const before = await (await get(b, "/super/shops")).text();
    expect(before).toContain("সব");
    // demoshop-কে ডেমো বানানো
    await pdb().prepare("UPDATE shops SET demo_niche = 'test-niche', name = 'ডেমো-টেস্ট-দোকান' WHERE id = ?").bind(DEMO_SHOP_ID).run();
    await pdb().prepare("INSERT INTO ledger (shop_id, type, amount, balance_after, ref, applied) VALUES (?, 'monthly', -999, 0, 'demo-fee', 1)").bind(DEMO_SHOP_ID).run();
    expect(await total()).toBe(n0 - 1);
    const list = await (await get(b, "/super/shops")).text();
    expect(list).not.toContain("ডেমো-টেস্ট-দোকান");
    const demo = await (await get(b, "/super/shops?filter=demo")).text();
    expect(demo).toContain("ডেমো-টেস্ট-দোকান");
    expect(demo).toContain("ডেমো (হিসাবে নেই)");
    // নাম দিয়ে খুঁজলে পাওয়া যায়
    expect(await (await get(b, "/super/shops?q=" + encodeURIComponent("ডেমো-টেস্ট"))).text()).toContain("ডেমো-টেস্ট-দোকান");
    // ড্যাশবোর্ড আর আয়ে ডেমোর টাকা নেই
    const dash = await (await get(b, "/super")).text();
    expect(dash).not.toContain("ডেমো-টেস্ট-দোকান");
    const fin = await (await get(b, "/super/finance")).text();
    expect(fin).not.toContain("৳৯৯৯");
  });
});

describe("কুরিয়ার রিপোর্টের চাবি (সব দোকানের জন্য)", () => {
  it("সেভ হয়, চাবি পেজে দেখায় না, মোছা যায়", async () => {
    const b = await member("owner@t.com", "owner");
    expect((await post(b, "/super/settings/courier-report", { cr_on: "1", cr_bdcourier_token: "SECRET-TOKEN-1", cr_daily_limit: "50" })).status).toBe(303);
    const ps = async () => Object.fromEntries((await pdb().prepare("SELECT key, value FROM platform_settings WHERE key LIKE 'cr_%'").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
    expect(await ps()).toMatchObject({ cr_on: "1", cr_bdcourier_token: "SECRET-TOKEN-1", cr_daily_limit: "50" });
    const page = await (await get(b, "/super/settings")).text();
    expect(page).toContain("কুরিয়ার রিপোর্ট / ফ্রড চেক");
    expect(page).not.toContain("SECRET-TOKEN-1");
    // খালি রাখলে আগের চাবি থাকে; মোছার টিকে মোছে
    await post(b, "/super/settings/courier-report", { cr_on: "1", cr_daily_limit: "50" });
    expect((await ps()).cr_bdcourier_token).toBe("SECRET-TOKEN-1");
    await post(b, "/super/settings/courier-report", { cr_on: "1", cr_bdcourier_token_clear: "1", cr_daily_limit: "50" });
    expect((await ps()).cr_bdcourier_token).toBe("");
    const log = await pdb().prepare("SELECT detail FROM audit_log WHERE action = 'settings.courier_report' ORDER BY id DESC").first<{ detail: string }>();
    expect(log!.detail).not.toContain("SECRET");
  });
});
