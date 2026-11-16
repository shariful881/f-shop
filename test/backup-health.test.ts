import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, DEMO_SHOP_ID, lastOrder, resetDb, setStatus } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { clearShopCache } from "../src/platform/resolve";
import { logError } from "../src/platform/errors";
import { toCsv } from "../src/shop/lib/export";

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
const sget = (b: Browser, path: string) => b.fetch(path, { base: P } as RequestInit);

beforeEach(async () => {
  await resetDb();
  await pdb().batch([
    pdb().prepare("DELETE FROM ledger"), pdb().prepare("DELETE FROM error_log"), pdb().prepare("DELETE FROM super_admins"), pdb().prepare("DELETE FROM audit_log"),
    pdb().prepare("UPDATE shops SET status = 'active', balance = 1000, low_balance_since = NULL WHERE id = ?").bind(DEMO_SHOP_ID),
  ]);
  clearShopCache();
});

describe("CSV", () => {
  it("BOM, কমা/উদ্ধৃতি আর Excel সূত্র নিরাপদ", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'বলল "হ্যাঁ"'], ["=HYPERLINK(1)", 5]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"x,y","বলল ""হ্যাঁ"""');
    expect(csv).toContain("'=HYPERLINK(1),5");
  });
});

describe("পুরো ফ্লো: অর্ডার → কনফার্ম → ব্যাকআপ", () => {
  it("কাস্টমার অর্ডার দেয়, মালিক কনফার্ম করে, CSV-তে সব আসে", async () => {
    const owner = await adminBrowser();
    // ১. দোকান খোলে, পণ্য দেখা যায়
    const home = await new Browser().get("/");
    expect(home.status).toBe(200);
    // ২. কাস্টমার অর্ডার দেয়
    const res = await new Browser().order({ name: "ফ্লো টেস্ট", phone: "01799998888" });
    expect(res.status).toBe(303);
    const o = (await lastOrder())!;
    expect(o.name).toBe("ফ্লো টেস্ট");
    // ৩. অ্যাডমিনে দেখা যায়, কনফার্ম হয়
    expect(await (await owner.get("/admin/orders")).text()).toContain("ফ্লো টেস্ট");
    expect((await setStatus(owner, o.id, "confirmed")).status).toBe(303);
    // ৪. ব্যাকআপ: দোকান থেকে CSV বন্ধ — শুধু স্টোরেজ দেখা যায়, কপি সুপার অ্যাডমিন থেকে
    const page = await (await owner.get("/admin/export")).text();
    expect(page).toContain("স্টোরেজ");
    expect(page).not.toContain("ব্যাকআপ ও স্টোরেজ");
    expect(page).not.toContain(".csv");
    for (const k of ["orders", "products", "customers", "users"]) {
      const r = await owner.get(`/admin/export/${k}.csv`);
      expect(r.status).toBe(404);
      expect(await r.text()).not.toContain("01799998888");
    }
    const sup = await member("csv-own@t.com", "owner");
    const ocsv = await sget(sup, `/super/shops/${DEMO_SHOP_ID}/export/orders.csv`);
    expect(ocsv.status).toBe(200);
    expect(ocsv.headers.get("content-type")).toContain("text/csv");
    expect(ocsv.headers.get("content-disposition")).toMatch(/attachment; filename="[a-z0-9-]+-orders-\d{4}-\d{2}-\d{2}\.csv"/);
    const text = await ocsv.text();
    expect(text).toContain("অর্ডার নং");
    expect(text).toContain("ফ্লো টেস্ট");
    expect(text).toContain("কনফার্ম");
    expect(text).toContain("01799998888");
    expect(await (await sget(sup, `/super/shops/${DEMO_SHOP_ID}/export/customers.csv`)).text()).toContain("01799998888");
    const pcsv = await (await sget(sup, `/super/shops/${DEMO_SHOP_ID}/export/products.csv`)).text();
    const firstProduct = await DB.prepare("SELECT name FROM products ORDER BY id LIMIT 1").first<{ name: string }>();
    expect(pcsv).toContain(firstProduct!.name);
    expect((await sget(sup, `/super/shops/${DEMO_SHOP_ID}/export/users.csv`)).status).toBe(404);
    expect(await pdb().prepare("SELECT action FROM audit_log WHERE action = 'shop.export'").first()).toBeTruthy();
    for (const role of ["admin", "support", "finance"]) {
      const m = await member(`csv-${role}@t.com`, role);
      expect((await sget(m, `/super/shops/${DEMO_SHOP_ID}/export/orders.csv`)).status).toBe(403);
    }
  });

  it("অর্ডার স্টাফ ব্যাকআপ নামাতে পারে না", async () => {
    const owner = await adminBrowser();
    await owner.post("/admin/staff", { name: "স্টাফ", email: "o@shop.test", password: "staffpass1", role: "orders" });
    const b = new Browser();
    expect((await b.post("/admin/login", { email: "o@shop.test", password: "staffpass1" })).status).toBe(303);
    expect((await b.get("/admin/export/orders.csv")).status).not.toBe(200);
    expect(await (await b.get("/admin/orders")).text()).not.toContain("/admin/export");
  });
});

describe("নিরাপত্তা হেডার", () => {
  it("দোকান আর প্ল্যাটফর্মে clickjacking বন্ধ", async () => {
    const r = await new Browser().get("/");
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(r.headers.get("strict-transport-security")).toContain("max-age");
    const p = await new Browser().fetch("/", { base: P } as RequestInit);
    expect(p.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});

describe("সুপার অ্যাডমিন: ব্যাকআপ আর এরর লগ", () => {
  it("মালিক পুরো দোকানের JSON নামাতে পারে, পাসওয়ার্ড থাকে না, অডিটে লেখা হয়", async () => {
    await adminBrowser();
    await new Browser().order({ name: "জেসন" });
    const owner = await member("own@t.com", "owner");
    const r = await sget(owner, `/super/shops/${DEMO_SHOP_ID}/export.json`);
    expect(r.status).toBe(200);
    const raw = await r.text();
    expect(raw).not.toContain("password_hash");
    const data = JSON.parse(raw);
    expect(data.tables.orders.some((o: { name: string }) => o.name === "জেসন")).toBe(true);
    expect(data.tables.products.length).toBeGreaterThan(0);
    const a = await pdb().prepare("SELECT action FROM audit_log WHERE action = 'shop.export'").first();
    expect(a).toBeTruthy();
    const support = await member("sup@t.com", "support");
    expect((await sget(support, `/super/shops/${DEMO_SHOP_ID}/export.json`)).status).toBe(403);
  });

  it("একই এরর একটাই লাইন, count বাড়ে; সমাধান চাপলে বন্ধ, আবার হলে খোলে", async () => {
    const err = new Error("টেস্ট এরর");
    await logError(pdb(), { shopId: DEMO_SHOP_ID, method: "GET", path: "/admin/orders/12", err });
    await logError(pdb(), { shopId: DEMO_SHOP_ID, method: "GET", path: "/admin/orders/13", err });
    const rows = await pdb().prepare("SELECT * FROM error_log").all<Record<string, any>>();
    expect(rows.results.length).toBe(1);
    expect(rows.results[0]!.count).toBe(2);
    const owner = await member("own@t.com", "owner");
    const html = await (await sget(owner, "/super/errors")).text();
    expect(html).toContain("টেস্ট এরর");
    expect(html).toContain("demoshop");
    await owner.fetch(`/super/errors/${rows.results[0]!.id}/resolve`, { method: "POST", base: P, body: new URLSearchParams({}) } as RequestInit);
    expect(await (await sget(owner, "/super/errors")).text()).not.toContain("টেস্ট এরর");
    await logError(pdb(), { shopId: DEMO_SHOP_ID, method: "GET", path: "/admin/orders/14", err });
    expect((await pdb().prepare("SELECT resolved FROM error_log").first<{ resolved: number }>())!.resolved).toBe(0);
    const support = await member("sup@t.com", "support");
    expect((await sget(support, "/super/errors")).status).toBe(403);
  });
});
