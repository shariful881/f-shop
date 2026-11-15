import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, DB, resetDb } from "./helpers";

beforeEach(resetDb);

async function product() {
  const p = await DB.prepare("SELECT id, price FROM products WHERE is_active = 1 ORDER BY id LIMIT 1").first<{ id: number; price: number }>();
  await DB.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(p!.id).run();
  return p!;
}

const form = (pairs: [string, string][]) => new URLSearchParams(pairs);

describe("নতুন অর্ডার নিজে লেখা", () => {
  it("অর্ডার পেজে বাটন আছে, ফর্ম খোলে", async () => {
    const a = await adminBrowser();
    expect(await (await a.get("/admin/orders")).text()).toContain('href="/admin/orders/new"');
    const html = await (await a.get("/admin/orders/new")).text();
    expect(html).toContain("data-manual-order");
    expect(html).toContain("এখনই কনফার্ম করুন");
  });

  it("ফোনের অর্ডার 'নতুন'-এ যায়; একই পণ্য দুই সারিতে যোগ হয়; নিজের ডেলিভারি চার্জ আর ছাড়", async () => {
    const p = await product();
    const a = await adminBrowser();
    const res = await a.fetch("/admin/orders/new", { method: "POST", body: form([
      ["item", `${p.id}:0`], ["qty", "2"], ["item", `${p.id}:0`], ["qty", "1"], ["item", ""], ["qty", "1"],
      ["name", "রহিম"], ["phone", "01812345678"], ["address", "মিরপুর ১০, ঢাকা"], ["area", "inside"],
      ["delivery", "50"], ["discount", "20"], ["source", "phone"], ["note", "সন্ধ্যায় দিন"],
    ]) });
    expect(res.status).toBe(303);
    const o = await DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<any>();
    expect(o.status).toBe("new");
    expect(o.phone).toBe("01812345678");
    expect(o.subtotal).toBe(p.price * 3);
    expect(o.delivery_charge).toBe(50);
    expect(o.discount).toBe(20);
    expect(o.total).toBe(p.price * 3 + 50 - 20);
    expect(o.source_url).toBe("manual:phone");
    expect(res.headers.get("location")).toBe(`/admin/orders/${o.id}`);
    const items = await DB.prepare("SELECT qty FROM order_items WHERE order_id = ?").bind(o.id).all<{ qty: number }>();
    expect(items.results).toEqual([{ qty: 3 }]);
  });

  it("'এখনই কনফার্ম' দিলে কনফার্ম হয়; পণ্য না বাছলে বা ভুল নম্বরে হয় না", async () => {
    const p = await product();
    const a = await adminBrowser();
    const bad = await a.fetch("/admin/orders/new", { method: "POST", body: form([["item", ""], ["qty", "1"], ["name", "ক"], ["phone", "123"], ["address", "ঢাকা"], ["area", "inside"]]) });
    expect(bad.status).toBe(422);
    const t = await bad.text();
    expect(t).toContain("অন্তত একটা পণ্য বাছুন");
    expect((await DB.prepare("SELECT COUNT(*) n FROM orders").first<{ n: number }>())!.n).toBe(0);

    await a.fetch("/admin/orders/new", { method: "POST", body: form([
      ["item", `${p.id}:0`], ["qty", "1"], ["name", "করিম"], ["phone", "01912345678"], ["address", "সদর, বগুড়া"], ["area", "outside"], ["source", "whatsapp"], ["confirm", "1"],
    ]) });
    const o = await DB.prepare("SELECT status, area FROM orders ORDER BY id DESC LIMIT 1").first<any>();
    expect(o).toEqual({ status: "confirmed", area: "outside" });
  });

  it("ব্লক করা নম্বর বা খোলা অর্ডার থাকলে আগে সতর্ক করে, আবার চাপলে বানায়", async () => {
    const p = await product();
    await DB.prepare("INSERT INTO blacklist_entries (type, value, reason) VALUES ('phone', '01612345678', 'manual')").run();
    const a = await adminBrowser();
    const base: [string, string][] = [["item", `${p.id}:0`], ["qty", "1"], ["name", "জামাল"], ["phone", "01612345678"], ["address", "উত্তরা, ঢাকা"], ["area", "inside"]];
    const r1 = await a.fetch("/admin/orders/new", { method: "POST", body: form(base) });
    expect(r1.status).toBe(422);
    expect(await r1.text()).toContain("ব্লক তালিকায়");
    expect((await DB.prepare("SELECT COUNT(*) n FROM orders").first<{ n: number }>())!.n).toBe(0);
    const r2 = await a.fetch("/admin/orders/new", { method: "POST", body: form([...base, ["force", "1"]]) });
    expect(r2.status).toBe(303);
    expect((await DB.prepare("SELECT COUNT(*) n FROM orders").first<{ n: number }>())!.n).toBe(1);
  });
});

describe("আসা অর্ডারে ছাড় দেওয়া", () => {
  async function order(status = "new", consignment: string | null = null) {
    const r = await DB.prepare(
      `INSERT INTO orders (order_no, name, phone, address, area, subtotal, delivery_charge, total, status, consignment_id)
       VALUES ('P1', 'ক্রেতা', '01711111111', 'ঢাকা', 'inside', 1000, 60, 1060, ?, ?) RETURNING id`,
    ).bind(status, consignment).first<{ id: number }>();
    return r!.id;
  }

  it("৮০ টাকা ছাড় দিলে মোট কমে, পাতায় দেখায়; ০ দিলে ফেরে", async () => {
    const id = await order();
    const a = await adminBrowser();
    expect(await (await a.get(`/admin/orders/${id}`)).text()).toContain("ছাড় বা ডেলিভারি চার্জ বদলান");
    await a.fetch(`/admin/orders/${id}/price`, { method: "POST", body: form([["discount", "80"], ["delivery", "60"]]) });
    let o = await DB.prepare("SELECT discount, total FROM orders WHERE id = ?").bind(id).first<any>();
    expect(o).toEqual({ discount: 80, total: 980 });
    expect(await (await a.get(`/admin/orders/${id}`)).text()).toContain("-৳৮০");
    await a.fetch(`/admin/orders/${id}/price`, { method: "POST", body: form([["discount", "0"], ["delivery", "120"]]) });
    o = await DB.prepare("SELECT discount, delivery_charge, total FROM orders WHERE id = ?").bind(id).first<any>();
    expect(o).toEqual({ discount: 0, delivery_charge: 120, total: 1120 });
  });

  it("কুরিয়ারে পাঠানো বা শিপড অর্ডারে বদলায় না", async () => {
    const id = await order("confirmed", "CN1");
    const a = await adminBrowser();
    await a.fetch(`/admin/orders/${id}/price`, { method: "POST", body: form([["discount", "80"], ["delivery", "60"]]) });
    expect((await DB.prepare("SELECT total FROM orders WHERE id = ?").bind(id).first<any>()).total).toBe(1060);
  });
});
