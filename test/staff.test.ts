import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, DEMO_SHOP_ID, lastOrder, resetDb, setStatus } from "./helpers";
import { clearShopCache } from "../src/platform/resolve";

const pdb = () => env.PLATFORM_DB;

beforeEach(async () => {
  await resetDb();
  await pdb().batch([
    pdb().prepare("DELETE FROM ledger"),
    pdb().prepare("UPDATE shops SET status = 'active', balance = 1000, staff_count = 0, low_balance_since = NULL, plan = 'small', plan_next = NULL, cycle_months = 1 WHERE id = ?").bind(DEMO_SHOP_ID),
  ]);
  clearShopCache();
});

async function addStaff(owner: Browser, role: string, email = `${role}@shop.test`) {
  return owner.post("/admin/staff", { name: `স্টাফ ${role}`, email, password: "staffpass1", role });
}
async function staffLogin(email: string, password = "staffpass1") {
  const b = new Browser();
  const r = await b.post("/admin/login", { email, password });
  return { b, status: r.status };
}
const shop = async () => (await pdb().prepare("SELECT * FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<Record<string, any>>())!;

describe("স্টাফ যোগ", () => {
  it("মালিক স্টাফ যোগ করলে স্টাফ লগইন করতে পারে; ছোট দোকানে ১ জন ফ্রি, দ্বিতীয় জনে ৪৯ টাকা", async () => {
    const owner = await adminBrowser();
    expect((await addStaff(owner, "manager")).status).toBe(303);
    expect((await staffLogin("manager@shop.test")).status).toBe(303);
    let s = await shop();
    expect(s.staff_count).toBe(1);
    expect(s.balance).toBe(1000); // প্ল্যানে ১ জন ধরা
    await addStaff(owner, "orders", "o2@shop.test");
    s = await shop();
    expect(s.staff_count).toBe(2);
    expect(s.balance).toBe(1000 - 49);
    const html = await (await owner.get("/admin/staff")).text();
    expect(html).toContain("manager@shop.test");
    expect(html).toContain("ম্যানেজার");
  });

  it("ট্রায়ালে স্টাফ যোগ করলে চার্জ কাটে না, শুধু সংখ্যা বাড়ে", async () => {
    await pdb().prepare("UPDATE shops SET status = 'trial' WHERE id = ?").bind(DEMO_SHOP_ID).run();
    clearShopCache();
    const owner = await adminBrowser();
    await addStaff(owner, "orders");
    const s = await shop();
    expect(s.staff_count).toBe(1);
    expect(s.balance).toBe(1000);
  });

  it("একই ইমেইলে দুবার নয়; ছোট পাসওয়ার্ড নয়", async () => {
    const owner = await adminBrowser();
    await addStaff(owner, "orders", "x@shop.test");
    const r = await addStaff(owner, "manager", "x@shop.test");
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("আগেই অ্যাকাউন্ট আছে");
    const r2 = await owner.post("/admin/staff", { name: "ক", email: "y@shop.test", password: "123", role: "orders" });
    expect(r2.status).toBe(422);
  });

  it("স্টাফ মুছলে লগইন বন্ধ, সংখ্যা কমে", async () => {
    const owner = await adminBrowser();
    await addStaff(owner, "orders");
    const { b } = await staffLogin("orders@shop.test");
    const u = await DB.prepare("SELECT id FROM users WHERE email = 'orders@shop.test'").first<{ id: number }>();
    await owner.post(`/admin/staff/${u!.id}/delete`, {});
    expect((await b.get("/admin/orders")).status).toBe(303); // সেশন বাতিল
    expect((await staffLogin("orders@shop.test")).status).toBe(422);
    expect((await shop()).staff_count).toBe(0);
  });

  it("পাসওয়ার্ড বদলালে পুরনো পাসওয়ার্ডে লগইন হয় না", async () => {
    const owner = await adminBrowser();
    await addStaff(owner, "orders");
    const u = await DB.prepare("SELECT id FROM users WHERE email = 'orders@shop.test'").first<{ id: number }>();
    await owner.post(`/admin/staff/${u!.id}/password`, { password: "newpass999" });
    expect((await staffLogin("orders@shop.test")).status).toBe(422);
    expect((await staffLogin("orders@shop.test", "newpass999")).status).toBe(303);
  });
});

describe("রোল অনুযায়ী অনুমতি", () => {
  it("অর্ডার স্টাফ: শুধু অর্ডার দেখে আর স্ট্যাটাস বদলায়", async () => {
    const owner = await adminBrowser();
    await addStaff(owner, "orders");
    const { b } = await staffLogin("orders@shop.test");
    const html = await (await b.get("/admin/orders")).text();
    expect(html).not.toContain('href="/admin/billing"');
    expect(html).not.toContain('href="/admin/products"');
    for (const path of ["/admin/products", "/admin/categories", "/admin/blacklist", "/admin/settings", "/admin/billing", "/admin/staff"]) {
      expect((await b.get(path)).status).toBe(403);
    }
    // POST-ও আটকায়
    expect((await b.post("/admin/settings", { site_name: "হ্যাক" })).status).toBe(403);
    expect((await b.post("/admin/staff", { name: "x", email: "z@z.com", password: "12345678", role: "manager" })).status).toBe(403);

    await new Browser().order();
    const o = (await lastOrder())!;
    await setStatus(b, o.id, "confirmed");
    expect((await lastOrder())!.status).toBe("confirmed");
  });

  it("ম্যানেজার: অর্ডার, পণ্য, ক্যাটাগরি, ব্ল্যাকলিস্ট — কিন্তু বিলিং, সেটিংস, স্টাফ নয়", async () => {
    const owner = await adminBrowser();
    await addStaff(owner, "manager");
    const { b } = await staffLogin("manager@shop.test");
    for (const path of ["/admin/orders", "/admin/products", "/admin/categories", "/admin/blacklist"]) {
      expect((await b.get(path)).status).toBe(200);
    }
    for (const path of ["/admin/settings", "/admin/billing", "/admin/staff"]) {
      expect((await b.get(path)).status).toBe(403);
    }
  });

  it("মালিককে মোছা বা রোল বদলানো যায় না", async () => {
    const owner = await adminBrowser();
    const me = await DB.prepare("SELECT id FROM users WHERE role = 'owner'").first<{ id: number }>();
    await owner.post(`/admin/staff/${me!.id}/delete`, {});
    await owner.post(`/admin/staff/${me!.id}/role`, { role: "orders" });
    expect(await DB.prepare("SELECT role FROM users WHERE id = ?").bind(me!.id).first()).toEqual({ role: "owner" });
  });

  it("রোল বদলালে অনুমতিও বদলায়", async () => {
    const owner = await adminBrowser();
    await addStaff(owner, "orders");
    const u = await DB.prepare("SELECT id FROM users WHERE email = 'orders@shop.test'").first<{ id: number }>();
    const { b } = await staffLogin("orders@shop.test");
    expect((await b.get("/admin/products")).status).toBe(403);
    await owner.post(`/admin/staff/${u!.id}/role`, { role: "manager" });
    expect((await b.get("/admin/products")).status).toBe(200);
  });

  it("মাসিক বিলে প্ল্যানের বাইরের স্টাফ যোগ হয় (ছোট দোকান ৩৯৯ + ১ × ৪৯)", async () => {
    const owner = await adminBrowser();
    await addStaff(owner, "orders", "a@shop.test");
    await addStaff(owner, "manager", "b@shop.test");
    const { runDailyBilling } = await import("../src/platform/billing");
    await pdb().prepare("UPDATE shops SET balance = 1000, next_bill_at = datetime('now', '-1 hour') WHERE id = ?").bind(DEMO_SHOP_ID).run();
    await runDailyBilling(pdb());
    expect((await shop()).balance).toBe(1000 - 399 - 49);
  });
});
