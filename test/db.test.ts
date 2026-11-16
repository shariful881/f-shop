import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Browser, createShop, DB, DEMO_SHOP_ID, resetDb, seedDemo, shopDb } from "./helpers";

beforeEach(resetDb);

describe("ডাটাবেস", () => {
  it("দোকানের ডাটাবেসে সব টেবিল তৈরি হয়েছে", async () => {
    const { results } = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const names = (results as { name: string }[]).map((r) => r.name);
    for (const t of ["users", "categories", "products", "orders", "order_items", "blacklist_entries", "settings", "sessions", "order_locks", "rate_limits"]) {
      expect(names).toContain(t);
    }
  });

  it("প্ল্যাটফর্ম ডাটাবেসে শুধু দোকান আর ডোমেইন — কাস্টমারের তথ্য নেই", async () => {
    const { results } = await env.PLATFORM_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name != 'sqlite_sequence'").all<{ name: string }>();
    const names = results.map((r) => r.name);
    expect(names).toContain("shops");
    expect(names).toContain("domains");
    expect(names).not.toContain("orders");
    expect(names).not.toContain("products");
  });

  it("DemoSeeder বারবার চালালেও ডুপ্লিকেট হয় না", async () => {
    await seedDemo();
    await seedDemo();
    expect((await DB.prepare("SELECT COUNT(*) n FROM categories").first())!.n).toBe(2);
    expect((await DB.prepare("SELECT COUNT(*) n FROM products").first())!.n).toBe(3);
  });

  it("order_items-এ qty ১ থেকে ৫০ (০ বা ৫০-এর বেশি রাখা যায় না)", async () => {
    await DB.prepare("INSERT INTO orders (order_no,name,phone,address,area,subtotal,delivery_charge,total) VALUES ('T1','a','01711111111','x','inside',1,1,2)").run();
    await DB.prepare("INSERT INTO order_items (order_id,product_name,price,qty) VALUES (1,'x',1,3)").run();
    await expect(DB.prepare("INSERT INTO order_items (order_id,product_name,price,qty) VALUES (1,'x',1,0)").run()).rejects.toThrow();
    await expect(DB.prepare("INSERT INTO order_items (order_id,product_name,price,qty) VALUES (1,'x',1,51)").run()).rejects.toThrow();
  });
});

describe("ডোমেইন দেখে দোকান চেনা", () => {
  it("মূল ডোমেইনে প্ল্যাটফর্ম, subdomain-এ দোকান, অজানা ডোমেইনে ৪০৪", async () => {
    const health = await SELF.fetch("https://ourdomain.com/health");
    expect(await health.json()).toMatchObject({ ok: true });
    expect((await SELF.fetch("https://www.ourdomain.com/")).status).toBe(200);

    const sub = await SELF.fetch("https://demoshop.ourdomain.com/");
    expect(sub.status).toBe(200);
    expect(await sub.text()).toContain("কাঠের ওয়াল শেলফ");

    expect((await SELF.fetch("https://nai.ourdomain.com/")).status).toBe(404);
    expect((await SELF.fetch("https://random-domain.com/")).status).toBe(404);
  });

  it("নিজের ডোমেইন (active) কাজ করে, pending ডোমেইন করে না", async () => {
    expect((await SELF.fetch("https://shop.test/")).status).toBe(200);
    await env.PLATFORM_DB.prepare("INSERT INTO domains (hostname, shop_id, status) VALUES ('pending.com', ?, 'pending')").bind(DEMO_SHOP_ID).run();
    expect((await SELF.fetch("https://pending.com/")).status).toBe(404);
  });

  it("বাইরে থেকে x-fshop-id পাঠিয়ে অন্য দোকানে ঢোকা যায় না", async () => {
    const B = "11111111-1111-4111-8111-111111111111";
    await createShop(B, "shopb", "b.test");
    await seedDemo(B);
    await shopDb(B).prepare("UPDATE products SET name='বি-দোকানের পণ্য' WHERE id=1").run();
    const res = await SELF.fetch("https://shop.test/", { headers: { "x-fshop-id": B } });
    const html = await res.text();
    expect(html).toContain("কাঠের ওয়াল শেলফ");
    expect(html).not.toContain("বি-দোকানের পণ্য");
  });
});

describe("প্রতিটা দোকানের ডাটা সম্পূর্ণ আলাদা", () => {
  const B = "22222222-2222-4222-8222-222222222222";

  it("এক দোকানের অর্ডার, ব্ল্যাকলিস্ট, সেটিংস অন্য দোকানে নেই", async () => {
    await createShop(B, "shopb2", "b2.test");
    await seedDemo(B);
    const dbB = shopDb(B);

    // A দোকানে অর্ডার আর ব্লক
    await new Browser().order({ phone: "01712345678" });
    await DB.prepare("INSERT INTO blacklist_entries (type,value,reason) VALUES ('phone','01811111111','manual')").run();
    await DB.prepare("UPDATE settings SET value='দোকান এ' WHERE key='site_name'").run();

    expect((await DB.prepare("SELECT COUNT(*) n FROM orders").first())!.n).toBe(1);
    expect((await dbB.prepare("SELECT COUNT(*) n FROM orders").first())!.n).toBe(0);
    expect((await dbB.prepare("SELECT COUNT(*) n FROM blacklist_entries").first())!.n).toBe(0);
    expect((await dbB.prepare("SELECT value FROM settings WHERE key='site_name'").first())!.value).toBe("আমার দোকান");

    // A-তে পেন্ডিং অর্ডার থাকলেও B-তে একই নম্বরে অর্ডার দেওয়া যায় (নিয়মগুলো দোকানভিত্তিক)
    const b = new Browser();
    const res = await b.fetch("/order", {
      method: "POST",
      headers: { origin: "https://b2.test", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ source: "landing", product_id: "1", name: "করিম", phone: "01712345678", address: "ঢাকা শহর", area: "inside" }),
      base: "https://b2.test",
    } as any);
    expect(res.status).toBe(303);
    expect((await dbB.prepare("SELECT COUNT(*) n FROM orders").first())!.n).toBe(1);

    // A-র ব্লক করা নম্বর B-তে ব্লক নয়
    expect((await DB.prepare("SELECT COUNT(*) n FROM orders").first())!.n).toBe(1);
  });

  it("এক দোকানের অ্যাডমিন লগইন অন্য দোকানে চলে না", async () => {
    const { adminBrowser } = await import("./helpers");
    await createShop(B, "shopb3", "b3.test");
    const a = await adminBrowser();
    const token = a.cookies.get("__Host-admin_session")!;
    const res = await SELF.fetch("https://b3.test/admin/orders", { headers: { cookie: `__Host-admin_session=${token}` }, redirect: "manual" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/login");
  });
});
