import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, DB, resetDb } from "./helpers";

beforeEach(resetDb);

async function addOrder(no: string, name: string, phone: string, status: string, total: number) {
  await DB.prepare(
    `INSERT INTO orders (order_no, name, phone, address, area, subtotal, delivery_charge, total, status)
     VALUES (?, ?, ?, 'ঢাকা', 'inside', ?, 0, ?, ?)`,
  ).bind(no, name, phone, total, total, status).run();
}

describe("কাস্টমার পেজ", () => {
  it("ফোন ধরে অর্ডার, ডেলিভারি/বাতিল আর মোট কেনা দেখায়", async () => {
    await addOrder("C1", "রহিম", "01711111111", "confirmed", 1000);
    await addOrder("C2", "রহিম উদ্দিন", "01711111111", "shipped", 500);
    await addOrder("C3", "রহিম শেখ", "01711111111", "fake", 700);
    await addOrder("C4", "করিম", "01822222222", "new", 300);
    const a = await adminBrowser();
    const html = await (await a.get("/admin/customers")).text();
    expect(html).toContain("কাস্টমার");
    expect(html).toContain("রহিম শেখ"); // শেষ অর্ডারের নাম
    expect(html).toContain("01822222222");
    expect(html).toContain("১,৫০০"); // কনফার্ম + শিপড
    expect(html).toContain("/admin/orders?q=01711111111");
  });

  it("নম্বর দিয়ে খোঁজা যায়", async () => {
    await addOrder("C1", "রহিম", "01711111111", "confirmed", 1000);
    await addOrder("C2", "করিম", "01822222222", "new", 300);
    const a = await adminBrowser();
    const html = await (await a.get("/admin/customers?q=01822222222")).text();
    expect(html).toContain("করিম");
    expect(html).not.toContain("01711111111");
  });
});
