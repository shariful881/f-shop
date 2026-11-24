import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, DB, resetDb } from "./helpers";

beforeEach(resetDb);

async function addOrder(extra: Partial<{ status: string; area: string; delivery: number; discount: number; consignment: string; advance: number }> = {}) {
  const delivery = extra.delivery ?? 60, discount = extra.discount ?? 0;
  const r = await DB.prepare(
    `INSERT INTO orders (order_no, name, phone, address, area, subtotal, delivery_charge, discount, total, status, consignment_id, advance_amount, pay_status, courier_report)
     VALUES ('E' || abs(random() % 1000000), 'রহিম', '01711111111', 'মিরপুর ১০, ঢাকা', ?, 599, ?, ?, ?, ?, ?, ?, ?, '{"x":1}') RETURNING id`,
  ).bind(extra.area ?? "inside", delivery, discount, 599 + delivery - discount, extra.status ?? "new", extra.consignment ?? null,
    extra.advance ?? 0, extra.advance ? "verified" : "none").first<{ id: number }>();
  return r!.id;
}
const row = (id: number) => DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<any>();

describe("অর্ডারে ক্রেতার তথ্য আর এলাকা বদল", () => {
  it("ফর্ম দেখায়; এলাকা বদলালে ডেলিভারি চার্জ সেটিংস থেকে, ফোন বদলালে পুরনো কুরিয়ার রিপোর্ট মোছে, ইতিহাসে লেখা", async () => {
    const id = await addOrder();
    const a = await adminBrowser();
    const page = await (await a.get(`/admin/orders/${id}`)).text();
    expect(page).toContain(`action="/admin/orders/${id}/customer"`);
    expect(page).toContain("data-cust-edit-open");
    const outside = Number((await DB.prepare("SELECT value FROM settings WHERE key = 'delivery_outside'").first<{ value: string }>())?.value ?? 120);

    const r = await a.post(`/admin/orders/${id}/customer`, { name: "রহিম উদ্দিন", phone: "০১৮১২৩৪৫৬৭৮", address: "সাতমাথা, বগুড়া সদর", area: "outside" });
    expect(r.status).toBe(303);
    const o = await row(id);
    expect(o).toMatchObject({ name: "রহিম উদ্দিন", phone: "01812345678", address: "সাতমাথা, বগুড়া সদর", area: "outside", delivery_charge: outside, total: 599 + outside, courier_report: null });

    const after = await (await a.get(`/admin/orders/${id}`)).text();
    expect(after).toContain("পরিবর্তনের ইতিহাস");
    expect(after).toContain("ঢাকার ভিতরে</s> → <span class=\"oc-new\">ঢাকার বাইরে");
    expect(after).toContain("01711111111</s> → <span class=\"oc-new\">01812345678");
  });

  it("'আগের মতো রাখুন' দিলে চার্জ একই; কিছু না বদলালে ইতিহাস নেই; দাম বদলও ইতিহাসে", async () => {
    const id = await addOrder();
    const a = await adminBrowser();
    await a.post(`/admin/orders/${id}/customer`, { name: "রহিম", phone: "01711111111", address: "মিরপুর ১০, ঢাকা", area: "outside", keep_delivery: "1" });
    expect(await row(id)).toMatchObject({ area: "outside", delivery_charge: 60, total: 659 });
    await a.post(`/admin/orders/${id}/customer`, { name: "রহিম", phone: "01711111111", address: "মিরপুর ১০, ঢাকা", area: "outside" });
    const all = await DB.prepare("SELECT changes_json FROM order_changes WHERE order_id = ?").bind(id).all<{ changes_json: string }>();
    expect(all.results.length).toBe(1);
    await a.post(`/admin/orders/${id}/price`, { discount: "50", delivery: "60" });
    const log = await DB.prepare("SELECT changes_json FROM order_changes WHERE order_id = ? ORDER BY id DESC").bind(id).first<{ changes_json: string }>();
    expect(log!.changes_json).toContain("ছাড়");
  });

  it("ভুল নম্বর, কুরিয়ারে পাঠানো, শিপড আর অগ্রিমের চেয়ে কম মোট আটকায়", async () => {
    const a = await adminBrowser();
    const id = await addOrder();
    const bad = await a.post(`/admin/orders/${id}/customer`, { name: "রহিম", phone: "12345", address: "মিরপুর ১০, ঢাকা", area: "inside" });
    expect(bad.headers.get("location")).toBe(`/admin/orders/${id}?edit=customer`);
    expect((await row(id)).phone).toBe("01711111111");

    const sent = await addOrder({ status: "confirmed", consignment: "C1" });
    await a.post(`/admin/orders/${sent}/customer`, { name: "করিম", phone: "01711111111", address: "মিরপুর ১০, ঢাকা", area: "inside" });
    expect((await row(sent)).name).toBe("রহিম");
    expect(await (await a.get(`/admin/orders/${sent}`)).text()).not.toContain(`/admin/orders/${sent}/customer`);

    const shipped = await addOrder({ status: "shipped" });
    await a.post(`/admin/orders/${shipped}/customer`, { name: "করিম", phone: "01711111111", address: "মিরপুর ১০, ঢাকা", area: "inside" });
    expect((await row(shipped)).name).toBe("রহিম");

    // অগ্রিম ৳৬৫৯ পাওয়া, বাইরে → ভেতরে (চার্জ কমে মোট অগ্রিমের নিচে) আটকায়
    const adv = await addOrder({ area: "outside", delivery: 120, advance: 719 });
    await a.post(`/admin/orders/${adv}/customer`, { name: "রহিম", phone: "01711111111", address: "মিরপুর ১০, ঢাকা", area: "inside" });
    expect((await row(adv)).area).toBe("outside");
  });
});
