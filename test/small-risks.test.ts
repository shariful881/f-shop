import { describe, expect, it } from "vitest";
import { env as rawEnv } from "cloudflare:test";
import type { WorkerEnv } from "../src/worker-env";
import { clearShopCache, resolveHost, shopCacheSize } from "../src/platform/resolve";
import { customersCsv } from "../src/shop/lib/export";
import { DB, resetDb } from "./helpers";

const env = rawEnv as unknown as WorkerEnv;

describe("ছোট ঝুঁকি", () => {
  it("অর্ডারের তারিখে index আছে", async () => {
    await resetDb();
    const r = await DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_orders_created'").first();
    expect(r).not.toBeNull();
  });

  it("কাস্টমার CSV: নম্বর ধরে হিসাব আর শেষ অর্ডারের নাম/ঠিকানা", async () => {
    await resetDb();
    const ins = (name: string, phone: string, status: string, total: number) =>
      DB.prepare("INSERT INTO orders (order_no, name, phone, address, area, subtotal, delivery_charge, total, status) VALUES (?, ?, ?, ?, 'inside', ?, 0, ?, ?)")
        .bind(`C${Math.random()}`, name, phone, `${name}-এর ঠিকানা`, total, total, status).run();
    await ins("পুরনো নাম", "01711111111", "confirmed", 500);
    await ins("নতুন নাম", "01711111111", "cancelled", 300);
    await ins("করিম", "01822222222", "shipped", 1000);
    const csv = await customersCsv(DB as unknown as D1Database);
    const lines = csv.trim().split("\r\n");
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain("01822222222,করিম,করিম-এর ঠিকানা,1,1,0,1000");
    expect(lines[2]).toContain("01711111111,নতুন নাম,নতুন নাম-এর ঠিকানা,2,1,1,500");
  });

  it("এলোমেলো subdomain-এ cache সীমার মধ্যে থাকে, ভুল ঠিকানায় খোঁজই হয় না", async () => {
    clearShopCache();
    for (let i = 0; i < 2100; i++) await resolveHost(env, `rnd${i}.ourdomain.com`);
    expect(shopCacheSize()).toBeLessThanOrEqual(2000);
    clearShopCache();
    expect((await resolveHost(env, "bad_slug!.ourdomain.com")).kind).toBe("unknown");
    expect((await resolveHost(env, "no space here")).kind).toBe("unknown");
    expect(shopCacheSize()).toBe(0);
  });
});
