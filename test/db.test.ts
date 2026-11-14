import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { seedDemo } from "./helpers";

describe("ডাটাবেস আর সেটআপ", () => {
  it("সব টেবিল তৈরি হয়েছে", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const t of [
      "users", "categories", "products", "orders", "order_items",
      "blacklist_entries", "settings", "sessions", "order_locks", "rate_limits",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("ডিফল্ট সেটিংস বসেছে", async () => {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='delivery_inside'").first<{ value: string }>();
    expect(row?.value).toBe("70");
  });

  it("DemoSeeder: ২টা ক্যাটাগরি আর ৩টা পণ্য, বারবার চালালেও ডুপ্লিকেট হয় না", async () => {
    await seedDemo();
    await seedDemo();
    const c = await env.DB.prepare("SELECT COUNT(*) n FROM categories").first<{ n: number }>();
    const p = await env.DB.prepare("SELECT COUNT(*) n FROM products").first<{ n: number }>();
    expect(c?.n).toBe(2);
    expect(p?.n).toBe(3);
    const res = await SELF.fetch("https://shop.test/health");
    expect(await res.json()).toEqual({ ok: true, products: 3 });
  });

  it("order_items-এ qty ১ ছাড়া অন্য কিছু রাখা যায় না", async () => {
    await env.DB.prepare(
      "INSERT INTO orders (order_no,name,phone,address,area,subtotal,delivery_charge,total) VALUES ('T1','a','01711111111','x','inside',1,1,2)",
    ).run();
    await expect(
      env.DB.prepare("INSERT INTO order_items (order_id,product_name,price,qty) VALUES (1,'x',1,2)").run(),
    ).rejects.toThrow();
  });
});
