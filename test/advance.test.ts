/**
 * ধাপ ৬: অগ্রিম পেমেন্ট (bKash/Nagad/Rocket + TrxID)
 */
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb, setStatus } from "./helpers";
import { phoneHash } from "../src/shop/lib/fraud";
import { advanceAmount, codAmount, normalizeTrx } from "../src/shop/lib/payment";

const KEYS = ["payment_bkash", "payment_bkash_type", "payment_nagad", "payment_nagad_type", "payment_rocket", "payment_rocket_type", "advance_mode", "advance_who", "advance_fixed", "advance_note"];

beforeEach(async () => {
  await resetDb();
  await DB.prepare(`DELETE FROM settings WHERE key IN (${KEYS.map(() => "?").join(",")})`).bind(...KEYS).run();
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 20));
});

async function setup(mode = "delivery", who = "all", fixed = "0") {
  const admin = await adminBrowser();
  const r = await admin.post("/admin/settings/payment", {
    _section: "payment", payment_bkash: "01811223344", payment_bkash_type: "personal", payment_nagad: "", payment_nagad_type: "personal",
    payment_rocket: "", payment_rocket_type: "personal", advance_mode: mode, advance_who: who, advance_fixed: fixed, advance_note: "রেফারেন্সে নম্বর লিখুন",
  });
  expect(r.status).toBe(303);
  return admin;
}

describe("সেটিংস আর ফর্ম", () => {
  it("নম্বর আর নিয়ম সেভ হয়, ফর্মে অগ্রিমের বক্স আসে", async () => {
    await setup();
    expect(await DB.prepare("SELECT value FROM settings WHERE key = 'payment_bkash'").first()).toEqual({ value: "01811223344" });
    const html = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(html).toContain("data-advance");
    expect(html).toContain("01811223344");
    expect(html).toContain("রেফারেন্সে নম্বর লিখুন");
    expect(html).toContain("অগ্রিম পাঠান: <strong data-adv-amount=\"true\">৳৭০</strong>");
  });

  it("নম্বর না দিলে বা বন্ধ থাকলে বক্স নেই, আগের মতো অর্ডার হয়", async () => {
    const admin = await adminBrowser();
    await admin.post("/admin/settings/payment", { _section: "payment", advance_mode: "delivery", advance_who: "all", payment_bkash: "" });
    expect(await (await new Browser().get("/p/wooden-wall-shelf")).text()).not.toContain("data-advance");
    expect((await new Browser().order()).status).toBe(303);
  });
});

describe("অর্ডারে অগ্রিম", () => {
  it("TrxID ছাড়া অর্ডার হয় না; দিলে সেভ, একই TrxID আবার নয়", async () => {
    await setup();
    const b = new Browser();
    const r1 = await b.order();
    expect(r1.status).toBe(422);
    expect(await r1.text()).toContain("৳৭০ অগ্রিম পাঠিয়ে Transaction ID দিন");
    expect((await b.order({ pay_method: "bkash", pay_trx: "bad!" })).status).toBe(422);
    const r2 = await b.order({ pay_method: "bkash", pay_trx: " 9k7a2bx4qz ", pay_sender: "01911112222" });
    expect(r2.status).toBe(303);
    const o = (await lastOrder())!;
    expect(o).toMatchObject({ advance_amount: 70, pay_method: "bkash", pay_trx: "9K7A2BX4QZ", pay_sender: "01911112222", pay_status: "pending" });
    const r3 = await new Browser().order({ phone: "01922223333", pay_method: "bkash", pay_trx: "9K7A2BX4QZ" });
    expect(r3.status).toBe(422);
    expect(await r3.text()).toContain("আগেই ব্যবহার হয়েছে");
    // ধন্যবাদ পেজে বাকি টাকা
    const thanks = await (await b.get("/thanks")).text();
    expect(thanks).toContain("বাকি (ক্যাশ অন ডেলিভারি)");
    expect(thanks).toContain("৳১,২৫০");
  });

  it("শুধু ঢাকার বাইরে: ভিতরে লাগে না, বাইরে লাগে", async () => {
    await setup("delivery", "outside");
    expect((await new Browser().order({ area: "inside" })).status).toBe(303);
    expect((await new Browser().order({ phone: "01922223333", area: "outside" })).status).toBe(422);
  });

  it("নির্দিষ্ট আর পুরো টাকা", async () => {
    await setup("fixed", "all", "200");
    await new Browser().order({ pay_trx: "AAAA1111", pay_method: "bkash" });
    expect((await lastOrder())!.advance_amount).toBe(200);
    expect(advanceAmount({ advance_mode: "full", payment_bkash: "01811223344" }, 1320, 70)).toBe(1320);
    expect(advanceAmount({ advance_mode: "fixed", advance_fixed: "5000", payment_bkash: "01811223344" }, 1320, 70)).toBe(1320);
    expect(normalizeTrx("ab-12 cd34")).toBe("AB12CD34");
    expect(normalizeTrx("12")).toBeNull();
  });

  it("শুধু ঝুঁকির ক্রেতা: নতুন ক্রেতা লাগে না, আগে ফেক থাকলে লাগে", async () => {
    await setup("delivery", "risky");
    expect((await new Browser().order()).status).toBe(303);
    const h = await phoneHash(env.PLATFORM_DB, "01955556666");
    await env.PLATFORM_DB.batch([1, 2].map((i) => env.PLATFORM_DB.prepare("INSERT INTO phone_outcomes (shop_id, order_no, phone_hash, outcome) VALUES ('other', ?, ?, 'fake')").bind(`X-${i}`, h)));
    const r = await new Browser().order({ phone: "01955556666" });
    expect(r.status).toBe(422);
    const html = await r.text();
    expect(html).toContain("আগের অর্ডারে সমস্যা ছিল");
    expect(html).toMatch(/data-advance[^>]*data-force="1"/);
    expect((await new Browser().order({ phone: "01955556666", pay_trx: "RISKY123", pay_method: "bkash" })).status).toBe(303);
  });
});

describe("দোকানদারের দিক", () => {
  it("পেয়েছি দিলে কুরিয়ার/স্টিকারে বাকি টাকা; তালিকায় যাচাই বাকি দেখায়", async () => {
    const admin = await setup();
    await new Browser().order({ pay_trx: "TRX55555", pay_method: "bkash" });
    const o = (await lastOrder())!;
    expect(await (await admin.get("/admin/orders")).text()).toContain("অগ্রিম পেমেন্ট যাচাই বাকি");
    expect(await (await admin.get("/admin/orders?pay=pending")).text()).toContain(o.order_no);
    let page = await (await admin.get(`/admin/orders/${o.id}`)).text();
    expect(page).toContain("TRX55555");
    expect(page).toContain("অগ্রিম পেমেন্ট এখনো মেলানো হয়নি");
    await admin.post(`/admin/orders/${o.id}/payment`, { status: "verified" });
    const v = (await lastOrder())!;
    expect(v.pay_status).toBe("verified");
    expect(codAmount(v as never)).toBe(o.total - 70);
    await setStatus(admin, o.id, "confirmed");
    await DB.prepare("INSERT INTO settings (key, value) VALUES ('steadfast_api_key', 'K'), ('steadfast_secret_key', 'S') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    page = await (await admin.get(`/admin/orders/${o.id}`)).text();
    expect(page).toContain(`value="${o.total - 70}"`); // কুরিয়ারের ক্যাশ কালেকশন
    const sticker = await (await admin.get(`/admin/orders/${o.id}/invoice?size=sticker`)).text();
    expect(sticker).toContain("৳১,২৫০");
    await admin.post(`/admin/orders/${o.id}/payment`, { status: "rejected" });
    expect((await lastOrder())!.pay_status).toBe("rejected");
  });
});
