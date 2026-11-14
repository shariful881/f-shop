import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, DEMO_SHOP_ID, lastOrder, resetDb, setStatus } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { chargeConfirmedOrder, runDailyBilling, clearSettingsCache } from "../src/platform/billing";
import { clearShopCache } from "../src/platform/resolve";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;

async function setShop(fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  await pdb().prepare(`UPDATE shops SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).bind(...Object.values(fields), DEMO_SHOP_ID).run();
  clearShopCache();
}
async function shop() {
  return (await pdb().prepare("SELECT * FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<Record<string, any>>())!;
}
async function ledger(type?: string) {
  const { results } = await pdb().prepare(`SELECT type, amount, ref, balance_after FROM ledger WHERE shop_id = ? AND applied = 1 ${type ? "AND type = ?" : ""} ORDER BY id`)
    .bind(...(type ? [DEMO_SHOP_ID, type] : [DEMO_SHOP_ID])).all<Record<string, any>>();
  return results;
}
/** নতুন একটা অর্ডার দিয়ে অ্যাডমিন থেকে স্ট্যাটাস বদলায় */
async function orderAnd(a: Browser, status: string, phone = "01712345678") {
  await new Browser().order({ phone });
  const o = (await lastOrder())!;
  await setStatus(a, o.id, status);
  return o;
}

beforeEach(async () => {
  await resetDb();
  await pdb().batch([
    pdb().prepare("DELETE FROM ledger"),
    pdb().prepare("DELETE FROM topups"),
    pdb().prepare("UPDATE shops SET status = 'active', balance = 0, low_balance_since = NULL, next_bill_at = datetime('now', '+20 days'), trial_orders_left = 50, trial_ends_at = datetime('now', '+14 days'), staff_count = 0 WHERE id = ?").bind(DEMO_SHOP_ID),
  ]);
  clearShopCache();
  clearSettingsCache();
});

describe("ট্রায়াল", () => {
  it("ট্রায়ালে কনফার্ম অর্ডারে চার্জ নেই, ফ্রি অর্ডার কমে; ফেক/বাতিলে কমে না", async () => {
    await setShop({ status: "trial" });
    const a = await adminBrowser();
    await orderAnd(a, "confirmed", "01711111111");
    await orderAnd(a, "fake", "01722222222");
    await orderAnd(a, "cancelled", "01733333333");
    const s = await shop();
    expect(s.trial_orders_left).toBe(49);
    expect(s.balance).toBe(0);
    expect(await ledger("order_fee")).toHaveLength(0);
  });

  it("শেষ ফ্রি অর্ডার কনফার্ম হলে দোকান চালু হয়, প্রথম মাসের ৯৯ টাকা কাটে", async () => {
    await setShop({ status: "trial", trial_orders_left: 1 });
    const a = await adminBrowser();
    await orderAnd(a, "confirmed");
    const s = await shop();
    expect(s.status).toBe("active");
    expect(s.balance).toBe(-99);
    expect(s.next_bill_at).toBeTruthy();
    expect((await ledger("monthly")).map((l) => l.amount)).toEqual([-99]);
  });

  it("ট্রায়ালের সময় শেষ হলে পরের ভিজিটেই চালু হয়ে মাসিক চার্জ কাটে", async () => {
    await setShop({ status: "trial", trial_ends_at: "2020-01-01 00:00:00" });
    await new Browser().get("/");
    const s = await shop();
    expect(s.status).toBe("active");
    expect(s.balance).toBe(-99);
  });

  it("ড্যাশবোর্ডে ট্রায়ালের তথ্য দেখায়", async () => {
    await setShop({ status: "trial", trial_orders_left: 12 });
    const a = await adminBrowser();
    const html = await (await a.get("/admin/orders")).text();
    expect(html).toContain("ফ্রি ট্রায়াল চলছে");
    expect(html).toContain("১২");
  });
});

describe("প্রতি কনফার্ম অর্ডারে ২ টাকা", () => {
  it("কনফার্মে ২ টাকা কাটে, একই অর্ডারে দুবার না; ফেক/বাতিলে না", async () => {
    await setShop({ balance: 100 });
    const a = await adminBrowser();
    const o = await orderAnd(a, "confirmed", "01711111111");
    await setStatus(a, o.id, "shipped");
    await orderAnd(a, "fake", "01722222222");
    await orderAnd(a, "cancelled", "01733333333");
    // সরাসরি আবার চার্জ করার চেষ্টা
    await chargeConfirmedOrder(pdb(), DEMO_SHOP_ID, o.order_no);
    await chargeConfirmedOrder(pdb(), DEMO_SHOP_ID, o.order_no);

    expect((await shop()).balance).toBe(98);
    const fees = await ledger("order_fee");
    expect(fees).toEqual([{ type: "order_fee", amount: -2, ref: o.order_no, balance_after: 98 }]);
  });

  it("একসাথে দুবার চার্জের চেষ্টা করলেও একবারই কাটে", async () => {
    await Promise.all([1, 2, 3].map(() => chargeConfirmedOrder(pdb(), DEMO_SHOP_ID, "FS-999999")));
    expect((await shop()).balance).toBe(-2);
  });
});

describe("ব্যালেন্স শেষ হলে", () => {
  it("মাইনাস হলে সতর্কবার্তা, অর্ডার তখনো চালু", async () => {
    const a = await adminBrowser();
    await orderAnd(a, "confirmed"); // 0 → -2
    expect((await shop()).low_balance_since).toBeTruthy();
    const html = await (await a.get("/admin/orders")).text();
    expect(html).toContain("রিচার্জ না করলে দোকানে নতুন অর্ডার নেওয়া বন্ধ হবে");
    expect((await new Browser().order({ phone: "01899999999" })).status).toBe(303);
  });

  it("৩ দিন পার হলে নতুন অর্ডার বন্ধ, অ্যাডমিন চালু; রিচার্জ অনুমোদনে আবার চালু", async () => {
    await setShop({ balance: -50, low_balance_since: "2020-01-01 00:00:00" });
    const landing = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(landing).toContain("অনলাইনে অর্ডার নেওয়া বন্ধ আছে");
    expect(landing).not.toContain('id="order-form"');
    const res = await new Browser().order();
    expect(res.status).toBe(403);
    expect(await DB.prepare("SELECT COUNT(*) n FROM orders").first()).toEqual({ n: 0 });

    const a = await adminBrowser();
    const dash = await a.get("/admin/orders");
    expect(dash.status).toBe(200);
    expect(await dash.text()).toContain("নতুন অর্ডার নেওয়া বন্ধ আছে");

    // রিচার্জের অনুরোধ → সুপার অ্যাডমিন অনুমোদন
    const req = await a.post("/admin/billing/topup", { method: "bkash", amount: 200, sender: "01812345678", trx_id: "abc123xyz" });
    expect(req.status).toBe(303);
    const t = await pdb().prepare("SELECT * FROM topups").first<Record<string, any>>();
    expect(t).toMatchObject({ amount: 200, method: "bkash", sender: "01812345678", trx_id: "ABC123XYZ", status: "pending" });
    expect((await shop()).balance).toBe(-50); // অনুমোদনের আগে যোগ হয় না

    const sa = await superBrowser();
    await sa.fetch(`/super/topups/${t!.id}/approve`, { method: "POST", base: P, body: new URLSearchParams() } as RequestInit);
    const s = await shop();
    expect(s.balance).toBe(150);
    expect(s.low_balance_since).toBeNull();
    clearShopCache();
    expect((await new Browser().order()).status).toBe(303);

    // একই রিচার্জ দুবার অনুমোদনে দুবার যোগ হয় না
    await sa.fetch(`/super/topups/${t!.id}/approve`, { method: "POST", base: P, body: new URLSearchParams() } as RequestInit);
    expect((await shop()).balance).toBe(150);
  });

  it("একই Transaction ID দুবার দেওয়া যায় না; বাতিল করলে ব্যালেন্স বদলায় না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/billing/topup", { method: "nagad", amount: 100, sender: "01812345678", trx_id: "DUP12345" });
    const r = await a.post("/admin/billing/topup", { method: "nagad", amount: 100, sender: "01812345678", trx_id: "dup12345" });
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("আগেই দেওয়া হয়েছে");
    const t = await pdb().prepare("SELECT id FROM topups").first<{ id: number }>();
    const sa = await superBrowser();
    await sa.fetch(`/super/topups/${t!.id}/reject`, { method: "POST", base: P, body: new URLSearchParams() } as RequestInit);
    expect((await shop()).balance).toBe(0);
  });

  it("সুপার অ্যাডমিন দোকান স্থগিত করলে অর্ডার বন্ধ", async () => {
    await setShop({ status: "suspended", balance: 500 });
    expect((await new Browser().order()).status).toBe(403);
  });
});

describe("মাসিক চার্জ (দৈনিক cron)", () => {
  it("বিলের তারিখ এলে ৯৯ + প্রতি স্টাফ ৯৯ কাটে, পরের মাসে যায়; দুবার চালালেও একবার", async () => {
    await setShop({ balance: 500, staff_count: 2, next_bill_at: "2026-01-05 10:00:00" });
    // ২০২৬-০১-০৫ থেকে আজ পর্যন্ত যত মাস বাকি সব কাটবে — পরীক্ষার জন্য গত মাসে সেট করি
    const lastMonth = await pdb().prepare("SELECT datetime('now', '-1 day') AS d").first<{ d: string }>();
    await setShop({ next_bill_at: lastMonth!.d });
    const r1 = await runDailyBilling(pdb());
    const r2 = await runDailyBilling(pdb());
    expect(r1.monthsCharged).toBe(1);
    expect(r2.monthsCharged).toBe(0);
    const s = await shop();
    expect(s.balance).toBe(500 - 99 - 2 * 99);
    expect(new Date(s.next_bill_at.replace(" ", "T") + "Z").getTime()).toBeGreaterThan(Date.now());
  });

  it("ট্রায়ালের মেয়াদ শেষ হওয়া দোকান cron-এ চালু হয়", async () => {
    await setShop({ status: "trial", trial_ends_at: "2020-01-01 00:00:00" });
    const r = await runDailyBilling(pdb());
    expect(r.trialsEnded).toBe(1);
    expect((await shop()).status).toBe("active");
  });
});

describe("বিলিং পেজ", () => {
  it("দোকানদার নিজের ব্যালেন্স আর লেনদেন দেখে, অন্য দোকানেরটা নয়", async () => {
    await pdb().prepare("INSERT INTO shops (id, slug, name, balance) VALUES ('other-shop', 'other', 'অন্য', 777)").run();
    await pdb().prepare("INSERT INTO ledger (shop_id, type, amount, ref, note, applied) VALUES ('other-shop', 'topup', 777, 'x', 'অন্য দোকানের রিচার্জ', 1)").run();
    const a = await adminBrowser();
    await orderAnd(a, "confirmed");
    const html = await (await a.get("/admin/billing")).text();
    expect(html).toContain("-৳২");
    expect(html).toContain("অর্ডার চার্জ");
    expect(html).not.toContain("অন্য দোকানের রিচার্জ");
    expect(html).not.toContain("৭৭৭");
  });

  it("সুপার অ্যাডমিন দাম বদলালে নতুন চার্জে লাগে", async () => {
    const sa = await superBrowser();
    const s = await pdb().prepare("SELECT key, value FROM platform_settings").all<{ key: string; value: string }>();
    const form = Object.fromEntries(s.results.map((r) => [r.key, r.value]));
    await sa.fetch("/super/settings", { method: "POST", base: P, body: new URLSearchParams({ ...form, order_fee: "3" }) } as RequestInit);
    clearSettingsCache();
    const a = await adminBrowser();
    await orderAnd(a, "confirmed");
    expect((await shop()).balance).toBe(-3);
  });

  it("সুপার অ্যাডমিন ব্যালেন্স সমন্বয় করতে পারে", async () => {
    const sa = await superBrowser();
    await sa.fetch(`/super/shops/${DEMO_SHOP_ID}/adjust`, { method: "POST", base: P, body: new URLSearchParams({ amount: "50", note: "বোনাস" }) } as RequestInit);
    expect((await shop()).balance).toBe(50);
  });
});

async function superBrowser() {
  await pdb().prepare("INSERT OR REPLACE INTO super_admins (id, email, password_hash) VALUES (1, 'boss@test.com', ?)").bind(await hashPassword("bosspass123", 1000)).run();
  const b = new Browser();
  await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "boss@test.com", password: "bosspass123" }) } as RequestInit);
  return b;
}
