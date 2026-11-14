import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";
import { buildReport, resolveRange, dhakaDate } from "../src/shop/lib/reports";

beforeEach(resetDb);

async function addOrder(no: string, status: string, total: number, createdUtc: string, extra: Record<string, unknown> = {}) {
  const r = await DB.prepare(
    `INSERT INTO orders (order_no, name, phone, address, area, subtotal, delivery_charge, total, status, created_at, coupon_code, discount)
     VALUES (?, 'ক', '01711111111', 'ঢাকা', ?, ?, 0, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(no, extra.area ?? "inside", total, total, status, createdUtc, extra.coupon ?? null, extra.discount ?? 0).first<{ id: number }>();
  await DB.prepare("INSERT INTO order_items (order_id, product_id, product_name, price) VALUES (?, 1, ?, ?)").bind(r!.id, extra.product ?? "শেলফ", total).run();
}
const utcNow = (offsetHours = 0) => new Date(Date.now() + offsetHours * 3600000).toISOString().replace("T", " ").slice(0, 19);

describe("রিপোর্টের হিসাব", () => {
  it("স্ট্যাটাস, বিক্রি, হার, শীর্ষ পণ্য, কুপন", async () => {
    await addOrder("A1", "confirmed", 1000, utcNow(), { product: "শেলফ", coupon: "EID", discount: 100 });
    await addOrder("A2", "shipped", 500, utcNow(), { product: "ফ্রেম", area: "outside" });
    await addOrder("A3", "confirmed", 1000, utcNow(), { product: "শেলফ" });
    await addOrder("A4", "fake", 700, utcNow());
    await addOrder("A5", "new", 300, utcNow());
    await addOrder("OLD", "confirmed", 9999, "2020-01-01 00:00:00");
    const r = await buildReport(DB as unknown as D1Database, resolveRange("7"));
    expect(r.total).toBe(5);
    expect(r.sales).toBe(2500);
    expect(r.pendingValue).toBe(300);
    expect(r.confirmRate).toBe(60);
    expect(r.fakeRate).toBe(20);
    expect(r.avgOrder).toBe(833);
    expect(r.topProducts[0]).toEqual({ name: "শেলফ", count: 2, revenue: 2000 });
    expect(r.coupons).toEqual([{ code: "EID", uses: 1, discount: 100 }]);
    expect(r.areas).toEqual({ inside: 2, outside: 1 });
    expect(r.days).toHaveLength(7);
    expect(r.days[6]!.orders).toBe(5);
  });

  it("দিন ঢাকার সময়ে ধরা হয় (UTC রাত ৮টা = ঢাকার পরের দিন)", async () => {
    const r0 = resolveRange("custom", "2026-03-10", "2026-03-11");
    await addOrder("D1", "confirmed", 100, "2026-03-10 17:59:00"); // ঢাকা ১০ তারিখ রাত ১১:৫৯
    await addOrder("D2", "confirmed", 200, "2026-03-10 18:01:00"); // ঢাকা ১১ তারিখ রাত ১২:০১
    const r = await buildReport(DB as unknown as D1Database, r0);
    expect(r.days).toEqual([{ date: "2026-03-10", orders: 1, sales: 100 }, { date: "2026-03-11", orders: 1, sales: 200 }]);
  });

  it("ভুল তারিখ দিলে ৭ দিন; ভবিষ্যতের তারিখ আজকে সীমিত", () => {
    expect(resolveRange("custom", "abc", "x").key).toBe("7");
    expect(resolveRange("custom", "2026-01-01", "2099-01-01").to).toBe(dhakaDate());
  });
});

describe("রিপোর্ট পেজ", () => {
  it("মালিক দেখে, অর্ডার স্টাফ দেখে না", async () => {
    await addOrder("A1", "confirmed", 1000, utcNow());
    const a = await adminBrowser();
    const html = await (await a.get("/admin/reports?range=30")).text();
    expect(html).toContain("৳১,০০০");
    expect(html).toContain("<svg");
    await a.post("/admin/staff", { name: "অর্ডার স্টাফ", email: "o@s.test", password: "staffpass1", role: "orders" });
    const o = new Browser();
    await o.post("/admin/login", { email: "o@s.test", password: "staffpass1" });
    expect((await o.get("/admin/reports")).status).toBe(403);
  });
});
