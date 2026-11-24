import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, DB, resetDb } from "./helpers";
import { endOfTodayUtc, remindAt, remindLabel, remindPresets } from "../src/shop/lib/order-notes";

beforeEach(async () => { await resetDb(); await DB.prepare("DELETE FROM order_notes").run(); });

async function addOrder(no = "N1", status = "new") {
  const r = await DB.prepare(
    `INSERT INTO orders (order_no, name, phone, address, area, subtotal, delivery_charge, total, status) VALUES (?, 'সুমাইয়া', '01812345678', 'বগুড়া', 'outside', 500, 120, 620, ?) RETURNING id`,
  ).bind(no, status).first<{ id: number }>();
  return r!.id;
}

describe("ঢাকার সময়ে মনে করানো", () => {
  // ২০২৬-১১-২৪ ১০:০০ ঢাকা = ০৪:০০ UTC
  const now = Date.UTC(2026, 10, 24, 4, 0, 0);
  it("তৈরি সময় আর নিজে দেওয়া সময় UTC-তে", () => {
    expect(remindAt("t15", "", now)).toBe("2026-11-24 09:00:00");
    expect(remindAt("t19", "", now)).toBe("2026-11-24 13:00:00");
    expect(remindAt("n10", "", now)).toBe("2026-11-25 04:00:00");
    expect(remindAt("1h", "", now)).toBe("2026-11-24 05:00:00");
    expect(remindAt("custom", "2026-11-24T16:30", now)).toBe("2026-11-24 10:30:00");
    expect(remindAt("custom", "2026-11-23T16:30", now)).toBeNull();
    expect(remindAt("custom", "ভুল", now)).toBeNull();
    expect(endOfTodayUtc(now)).toBe("2026-11-24 17:59:59");
    expect(remindLabel("2026-11-24 09:00:00", now)).toBe("আজ 3:00 pm");
    expect(remindLabel("2026-11-25 04:00:00", now)).toBe("আগামীকাল 10:00 am");
    // রাত ৮টায় আজকের ৩টা/৭টা আর দেখায় না
    expect(remindPresets(Date.UTC(2026, 10, 24, 14, 0, 0)).map((p) => p.key)).toEqual(["1h", "n10"]);
  });
});

describe("অর্ডারে নোট আর ফলো-আপ", () => {
  it("পাতায় কল বোতাম আর নোটের ফর্ম; নোট সেভ, ইতিহাসে কে লিখেছে; শুধু নোটে ফলো-আপ নয়", async () => {
    const id = await addOrder();
    const a = await adminBrowser();
    const page = await (await a.get(`/admin/orders/${id}`)).text();
    expect(page).toContain('class="btn btn-sm btn-call"');
    expect(page).toContain(`action="/admin/orders/${id}/notes"`);
    expect(page).toContain("দুপুরের পর কল করতে বলেছে");
    const r = await a.post(`/admin/orders/${id}/notes`, { body: "ঠিকানা আবার জিজ্ঞেস করতে হবে", remind: "" });
    expect(r.headers.get("location")).toBe(`/admin/orders/${id}#notes`);
    const after = await (await a.get(`/admin/orders/${id}`)).text();
    expect(after).toContain("ঠিকানা আবার জিজ্ঞেস করতে হবে");
    const list = await (await a.get("/admin/orders?status=new")).text();
    expect(list).toContain("ঠিকানা আবার জিজ্ঞেস করতে হবে");
    expect(list).toContain('class="call-dot"');
    expect(list).toMatch(/ফলো-আপ <span class="tab-count">০/);
  });

  it("সময়সহ নোট → ফলো-আপ ট্যাবে, 'হয়ে গেছে' দিলে সরে; কনফার্ম করলে নিজে বন্ধ", async () => {
    const id = await addOrder("N1");
    const id2 = await addOrder("N2");
    const a = await adminBrowser();
    await a.post(`/admin/orders/${id}/notes`, { body: "ফোন ধরেনি", remind: "1h" });
    // পেরিয়ে যাওয়া সময়ের একটা (সরাসরি)
    await DB.prepare("INSERT INTO order_notes (order_id, body, remind_at) VALUES (?, 'সন্ধ্যায় কল', datetime('now', '-10 minutes'))").bind(id2).run();
    const tab = await (await a.get("/admin/orders?follow=1")).text();
    expect(tab).toContain("N1");
    expect(tab).toContain("N2");
    expect(tab).toMatch(/tab tab-follow active has/);
    expect(tab).toContain("কল করুন"); // পেরিয়ে যাওয়াটার ব্যাজ
    const due = await DB.prepare("SELECT id FROM order_notes WHERE order_id = ?").bind(id2).first<{ id: number }>();
    const done = await a.post(`/admin/orders/${id2}/notes/${due!.id}/done`, { to_list: "1" });
    expect(done.headers.get("location")).toBe("/admin/orders?follow=1");
    const tab2 = await (await a.get("/admin/orders?follow=1")).text();
    expect(tab2).not.toContain(">N2<");
    // কনফার্ম → N1-এর ফলো-আপ বন্ধ
    await a.post(`/admin/orders/${id}/status`, { status: "confirmed" });
    const open = await DB.prepare("SELECT COUNT(*) n FROM order_notes WHERE done_at IS NULL AND remind_at IS NOT NULL").first<{ n: number }>();
    expect(open!.n).toBe(0);
  });

  it("ফাঁকা নোট বা অতীতের সময় নেয় না", async () => {
    const id = await addOrder();
    const a = await adminBrowser();
    await a.post(`/admin/orders/${id}/notes`, { body: "  ", remind: "" });
    await a.post(`/admin/orders/${id}/notes`, { body: "কল", remind: "custom", remind_custom: "2020-01-01T10:00" });
    expect((await DB.prepare("SELECT COUNT(*) n FROM order_notes").first<{ n: number }>())!.n).toBe(0);
  });
});
