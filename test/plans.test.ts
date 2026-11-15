import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DEMO_SHOP_ID, resetDb } from "./helpers";
import { clearShopCache } from "../src/platform/resolve";
import { clearSettingsCache } from "../src/platform/billing";
import { cheapestFor, cyclePrice, overageCharge, plans } from "../src/platform/plans";

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
    expect([p.free.price, p.small.price, p.grow.price, p.big.price]).toEqual([0, 399, 799, 1499]);
    expect(cyclePrice(399, 12)).toBe(3990);
    expect(cyclePrice(799, 6)).toBe(Math.round(799 * 6 * 0.9));
    expect(overageCharge(p.small, 300)).toBe(0);
    expect(overageCharge(p.big, 5010)).toBe(3); // ১০ × ০.৩ = ৩
    expect(cheapestFor({}, 200).plan.key).toBe("small");
    expect(cheapestFor({}, 1000).plan.key).toBe("grow");
    expect(cheapestFor({}, 3000).plan.key).toBe("big");
    expect(cheapestFor({}, 20).plan.key).toBe("free");
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
    for (const t of ["ফ্রি", "ছোট দোকান", "বাড়ন্ত", "বড় ব্র্যান্ড", "৳৩৯৯", "৳৭৯৯", "৳১,৪৯৯", "data-calc"]) expect(html).toContain(t);
  });
});
