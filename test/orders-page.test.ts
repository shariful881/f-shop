import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, DB, resetDb } from "./helpers";

beforeEach(resetDb);

async function addOrder(no: string, phone: string, status: string, created = "now") {
  const r = await DB.prepare(
    `INSERT INTO orders (order_no, name, phone, address, area, subtotal, delivery_charge, total, status, created_at)
     VALUES (?, 'ক্রেতা', ?, 'ঢাকা', 'inside', 500, 60, 560, ?, ${created === "now" ? "datetime('now')" : "?"}) RETURNING id`,
  ).bind(...(created === "now" ? [no, phone, status] : [no, phone, status, created])).first<{ id: number }>();
  return r!.id;
}

describe("অর্ডার পেজ", () => {
  it("একসাথে কয়েকটা অর্ডার ফেক করা যায়, বাকিগুলো থাকে", async () => {
    const a1 = await addOrder("B1", "01711111111", "new");
    const a2 = await addOrder("B2", "01722222222", "new");
    const a3 = await addOrder("B3", "01733333333", "new");
    const a = await adminBrowser();
    const body = new URLSearchParams([["to", "fake"], ["ids", String(a1)], ["ids", String(a2)], ["back", "/admin/orders?status=new"]]);
    const res = await a.fetch("/admin/orders/bulk-status", { method: "POST", body });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/orders?status=new");
    const rows = await DB.prepare("SELECT id, status FROM orders ORDER BY id").all<{ id: number; status: string }>();
    expect(rows.results.map((r) => r.status)).toEqual(["fake", "fake", "new"]);
    expect(a3).toBeGreaterThan(0);
  });

  it("বাইরের ঠিকানায় ফেরত পাঠায় না, ভুল স্ট্যাটাস নেয় না", async () => {
    const id = await addOrder("B1", "01711111111", "new");
    const a = await adminBrowser();
    const res = await a.fetch("/admin/orders/bulk-status", { method: "POST", body: new URLSearchParams([["to", "deleted"], ["ids", String(id)], ["back", "https://evil.test/"]]) });
    expect(res.headers.get("location")).toBe("/admin/orders");
    expect((await DB.prepare("SELECT status FROM orders WHERE id = ?").bind(id).first<{ status: string }>())!.status).toBe("new");
  });

  it("একবারে ১০টার বেশি কনফার্ম হয় না", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 11; i++) ids.push(await addOrder(`C${i}`, `0171111111${i % 10}`, "new"));
    const a = await adminBrowser();
    await a.fetch("/admin/orders/bulk-status", { method: "POST", body: new URLSearchParams([["to", "confirmed"], ...ids.map((i) => ["ids", String(i)] as [string, string])]) });
    const n = await DB.prepare("SELECT COUNT(*) n FROM orders WHERE status = 'confirmed'").first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("তারিখ দিয়ে ছাঁকা আর কাস্টমারের আগের রেকর্ড দেখায়", async () => {
    await addOrder("OLD1", "01711111111", "new", "2020-01-01 00:00:00");
    await addOrder("NEW1", "01711111111", "new");
    await addOrder("D1", "01711111111", "shipped");
    await addOrder("F1", "01711111111", "fake");
    const a = await adminBrowser();
    const today = await (await a.get("/admin/orders?status=new&range=today")).text();
    expect(today).toContain("NEW1");
    expect(today).not.toContain("OLD1");
    expect(today).not.toContain("দোকানে ✓"); // দোকানের নিজের রেকর্ড শুধু ফ্রড রিপোর্টে
    const all = await (await a.get("/admin/orders?status=new&range=all")).text();
    expect(all).toContain("OLD1");
  });
});

describe("একই নম্বরের অর্ডার — ব্যাজ আর পপআপ", () => {
  it("একাধিক অর্ডারে ব্যাজ (রং), নতুন জোড়ায় 'ডুপ্লিকেট?', একটায় কিছু না", async () => {
    await addOrder("P1", "01711111111", "fake", "2026-01-01 10:00:00");
    const cur = await addOrder("P2", "01711111111", "new");
    await addOrder("P3", "01711111111", "new");
    await addOrder("Q1", "01799999999", "new");
    const a = await adminBrowser();
    const html = await (await a.get("/admin/orders?status=new")).text();
    expect(html).toContain(`data-ph-open="01711111111" data-ph-order="${cur}"`);
    expect(html).toContain("ph-badge ph-bad");
    expect(html).toContain("৩টা অর্ডার");
    expect(html).toContain("ডুপ্লিকেট?");
    expect(html).not.toContain('data-ph-open="01799999999"');
    expect(html).toContain('id="ph-dlg"');
  });

  it("পপআপে পণ্য, সাইজ, তারিখ, স্ট্যাটাস, সারাংশ; এখনকার অর্ডার চিহ্নিত", async () => {
    const old = await addOrder("P1", "01711111111", "shipped", "2026-01-05 04:00:00");
    const cur = await addOrder("P2", "01711111111", "new");
    await addOrder("P3", "01711111111", "cancelled");
    await DB.prepare("INSERT INTO order_items (order_id, product_name, price, qty, variant_label) VALUES (?, 'পিরিয়ড প্যান্টি', 599, 2, 'L')").bind(old).run();
    await DB.prepare("INSERT INTO order_items (order_id, product_name, price, qty) VALUES (?, 'ওয়াল শেলফ', 1250, 1)").bind(cur).run();
    const a = await adminBrowser();
    const res = await a.get(`/admin/orders/phone-history?phone=01711111111&order=${cur}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const s of ["P1", "P2", "P3", "পিরিয়ড প্যান্টি", "(L)", "× ২", "ওয়াল শেলফ", "শিপড", "বাতিল", "নতুন", "এই অর্ডার", "is-cur", "/admin/orders?q=01711111111"]) expect(html).toContain(s);
    expect(html).toMatch(/মোট অর্ডার<\/small><b>৩/);
    expect(html).toMatch(/মোট কেনা<\/small><b>৳৫৬০/);
    expect((await a.get("/admin/orders/phone-history?phone=abc")).status).toBe(400);
  });
});
