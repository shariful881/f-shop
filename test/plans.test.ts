import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DEMO_SHOP_ID, resetDb } from "./helpers";
import { clearShopCache } from "../src/platform/resolve";
import { clearSettingsCache } from "../src/platform/billing";
import { cheapestFor, cyclePrice, onOldPrices, overageCharge, plans, plansForShop } from "../src/platform/plans";

const pdb = () => env.PLATFORM_DB;
beforeEach(async () => {
  await resetDb();
  await pdb().prepare("UPDATE shops SET status = 'active', plan = 'small', balance = 0 WHERE id = ?").bind(DEMO_SHOP_ID).run();
  clearShopCache();
  clearSettingsCache();
});

describe("প্ল্যানের হিসাব", () => {
  it("দাম, ছাড় আর বাড়তি অর্ডার", () => {
    const p = plans({});
    expect([p.free.price, p.small.price, p.grow.price, p.big.price]).toEqual([0, 449, 999, 1999]);
    expect([p.free.orders, p.small.orders, p.grow.orders, p.big.orders]).toEqual([30, 150, 400, 1000]);
    expect([p.free.extra, p.small.extra, p.grow.extra, p.big.extra]).toEqual([8, 5, 4, 3]);
    // প্যাকেজে প্রতি অর্ডার কমপক্ষে ৳২, বড় প্যাকেজে সস্তা, আর বাড়তি অর্ডারের চেয়ে কম
    const per = [p.small, p.grow, p.big].map((x) => x.price / x.orders);
    expect(per.every((v) => v >= 1.99)).toBe(true);
    expect(per[0]! > per[1]! && per[1]! > per[2]!).toBe(true);
    expect([p.small, p.grow, p.big].every((x) => x.price / x.orders < x.extra)).toBe(true);
    expect(cyclePrice(449, 12)).toBe(4580); // ১২ × ৪৪৯ − ১৫%
    expect(cyclePrice(999, 12)).toBe(10190);
    expect(cyclePrice(1999, 12)).toBe(20390);
    expect(cyclePrice(999, 6)).toBe(Math.round(999 * 6 * 0.9));
    expect(overageCharge(p.small, 150)).toBe(0);
    expect(overageCharge(p.big, 1010)).toBe(30); // ১০ × ৳৩
    expect(cheapestFor({}, 200).plan.key).toBe("small");
    expect(cheapestFor({}, 500).plan.key).toBe("grow");
    expect(cheapestFor({}, 1500).plan.key).toBe("big");
    expect(cheapestFor({}, 20).plan.key).toBe("free");
  });

  it("নতুন দামের আগে খোলা দোকান ৩০ দিন আগের দামে, তারপর নতুন", () => {
    const s = { new_prices_from: "2026-11-15 10:00:00", old_prices_until: "2026-12-15 10:00:00" };
    const before = "2026-11-01 00:00:00", after = "2026-11-16 00:00:00";
    const mid = Date.parse("2026-12-01T00:00:00Z"), late = Date.parse("2026-12-20T00:00:00Z");
    expect(onOldPrices(s, before, mid)).toBe(true);
    expect(plansForShop(s, before, mid).small).toMatchObject({ price: 399, orders: 300, extra: 1 });
    expect(plansForShop(s, before, late).small).toMatchObject({ price: 449, orders: 150, extra: 5 });
    expect(plansForShop(s, after, mid).small.price).toBe(449);
    expect(onOldPrices({}, before, mid)).toBe(false);
  });
});

describe("প্ল্যান অনুযায়ী সুবিধা", () => {
  it("ফ্রি প্ল্যানে নিজের ডোমেইন যোগ করা যায় না", async () => {
    await pdb().prepare("UPDATE shops SET plan = 'free' WHERE id = ?").bind(DEMO_SHOP_ID).run();
    const a = await adminBrowser();
    const r = await a.post("/admin/domain", { domain: "myshop.com" });
    expect(await r.text()).toContain("ফ্রি প্ল্যানে নেই");
    expect(await pdb().prepare("SELECT 1 FROM domains WHERE hostname = 'myshop.com'").first()).toBeNull();
  });

  it("সব দোকানের ফুটারে \"SellxBD দিয়ে তৈরি\"", async () => {
    const html = await (await new Browser().get("/")).text();
    expect(html).toContain("SellxBD দিয়ে তৈরি");
    expect(html).toContain("https://sellxbd.com/?ref=shop-footer");
  });

  it("দাম পেজে ৪টা প্ল্যান, হিসাবের ক্যালকুলেটর", async () => {
    const html = await (await new Browser().fetch("/pricing", { base: "https://ourdomain.com" } as RequestInit)).text();
    for (const t of ["ফ্রি", "ছোট দোকান", "বাড়ন্ত", "বড় ব্র্যান্ড", "৳৪৪৯", "৳৯৯৯", "৳১,৯৯৯", "data-calc"]) expect(html).toContain(t);
  });
});

describe("হোমপেজে মাসিক/বাৎসরিক ট্যাব", () => {
  it("মাসিক আগে খোলা (প্রথম ট্যাব), দুই দামই পেজে", async () => {
    const html = await (await new Browser().fetch("/", { base: "https://ourdomain.com" } as RequestInit)).text();
    expect(html).toContain('data-mode="month"');
    expect(html).toMatch(/class="on" aria-selected="true" data-bill="month">মাসিক/);
    expect(html.indexOf('data-bill="month"')).toBeLessThan(html.indexOf('data-bill="year"'));
    expect(html).toContain("৳৪,৫৮০");
    expect(html).toContain("৳৪৪৯");
    expect(html).toContain("/বছর");
  });
});
