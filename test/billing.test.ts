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
    pdb().prepare("DELETE FROM platform_settings WHERE key LIKE 'plan_%'"),
    pdb().prepare("UPDATE shops SET status = 'active', balance = 0, low_balance_since = NULL, next_bill_at = datetime('now', '+20 days'), trial_orders_left = 50, trial_ends_at = datetime('now', '+14 days'), staff_count = 0, plan = 'small', plan_next = NULL, cycle_months = 1, period_orders = 0, usage_reset_at = datetime('now', '+20 days') WHERE id = ?").bind(DEMO_SHOP_ID),
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

  it("ট্রায়াল শেষে ব্যালেন্স থাকলে বেছে নেওয়া প্ল্যান চালু, দাম আগে কাটে", async () => {
    await setShop({ status: "trial", trial_orders_left: 1, plan: "grow", balance: 1000 });
    const a = await adminBrowser();
    await orderAnd(a, "confirmed");
    const s = await shop();
    expect(s.status).toBe("active");
    expect(s.plan).toBe("grow");
    expect(s.balance).toBe(1000 - 999);
    expect(s.next_bill_at).toBeTruthy();
    expect((await ledger("monthly")).map((l) => l.amount)).toEqual([-999]);
  });

  it("ট্রায়ালের সময় শেষ, ব্যালেন্স নেই → দোকান বন্ধ হয় না, ফ্রি প্ল্যানে চলে", async () => {
    await setShop({ status: "trial", trial_ends_at: "2020-01-01 00:00:00", plan: "grow", balance: 0 });
    await new Browser().get("/");
    const s = await shop();
    expect(s.status).toBe("active");
    expect(s.plan).toBe("free");
    expect(s.balance).toBe(0);
    expect((await new Browser().order({ phone: "01899999998" })).status).toBe(303);
  });

  it("ড্যাশবোর্ডে ট্রায়ালের তথ্য দেখায়", async () => {
    await setShop({ status: "trial", trial_orders_left: 12 });
    const a = await adminBrowser();
    const html = await (await a.get("/admin/orders")).text();
    expect(html).toContain("ফ্রি ট্রায়াল চলছে");
    expect(html).toContain("বাড়ন্ত");
  });
});

describe("প্ল্যানের মধ্যে অর্ডার", () => {
  it("কনফার্ম অর্ডার গোনা হয়, টাকা কাটে না; একই অর্ডার দুবার নয়; ফেক/বাতিল গোনা হয় না", async () => {
    await setShop({ balance: 100, plan: "small", period_orders: 0 });
    const a = await adminBrowser();
    const o = await orderAnd(a, "confirmed", "01711111111");
    await setStatus(a, o.id, "shipped");
    await orderAnd(a, "fake", "01722222222");
    await orderAnd(a, "cancelled", "01733333333");
    await chargeConfirmedOrder(pdb(), DEMO_SHOP_ID, o.order_no);
    await chargeConfirmedOrder(pdb(), DEMO_SHOP_ID, o.order_no);
    const s = await shop();
    expect(s.balance).toBe(100);
    expect(s.period_orders).toBe(1);
    expect(await ledger("plan_order")).toHaveLength(1);
  });

  it("একসাথে দুবার গোনার চেষ্টা করলেও একবারই", async () => {
    await setShop({ period_orders: 0 });
    await Promise.all([1, 2, 3].map(() => chargeConfirmedOrder(pdb(), DEMO_SHOP_ID, "FS-999999")));
    expect((await shop()).period_orders).toBe(1);
  });
});

describe("ব্যালেন্স শেষ হলে", () => {
  it("মাইনাস হলে সতর্কবার্তা, অর্ডার তখনো চালু", async () => {
    await setShop({ balance: -20, low_balance_since: new Date().toISOString().replace("T", " ").slice(0, 19) });
    const a = await adminBrowser();
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

describe("প্ল্যানের বিল আর মাস শেষের হিসাব (দৈনিক cron)", () => {
  const yesterday = async () => (await pdb().prepare("SELECT datetime('now', '-1 day') AS d").first<{ d: string }>())!.d;

  it("বিলের দিন প্ল্যানের দাম + প্ল্যানের বাইরের স্টাফ কাটে, পরের মাসে যায়; দুবার চালালেও একবার", async () => {
    await setShop({ balance: 2000, plan: "grow", staff_count: 6, next_bill_at: await yesterday() });
    const r1 = await runDailyBilling(pdb());
    const r2 = await runDailyBilling(pdb());
    expect(r1.monthsCharged).toBe(1);
    expect(r2.monthsCharged).toBe(0);
    const s = await shop();
    expect(s.balance).toBe(2000 - 999 - 2 * 49); // বাড়ন্তে ৪ জন ধরা, বাকি ২ জন × ৪৯
    expect(s.plan).toBe("grow");
    expect(new Date(s.next_bill_at.replace(" ", "T") + "Z").getTime()).toBeGreaterThan(Date.now());
  });

  it("ব্যালেন্সে না কুলালে ফ্রি প্ল্যানে নামে, মাইনাস হয় না", async () => {
    await setShop({ balance: 100, plan: "small", next_bill_at: await yesterday() });
    await runDailyBilling(pdb());
    const s = await shop();
    expect(s.plan).toBe("free");
    expect(s.balance).toBe(100);
  });

  it("বাৎসরিক প্যাকে ১০ মাসের দাম, পরের বিল ১২ মাস পরে", async () => {
    await setShop({ balance: 5000, plan: "small", cycle_months: 12, next_bill_at: await yesterday() });
    await runDailyBilling(pdb());
    const s = await shop();
    expect(s.balance).toBe(5000 - 4490);
    const months = (new Date(s.next_bill_at.replace(" ", "T") + "Z").getTime() - Date.now()) / (30 * 86400000);
    expect(months).toBeGreaterThan(11);
  });

  it("মাস শেষে সীমার বেশি অর্ডারের চার্জ একবারে, তারপর গোনা শূন্য", async () => {
    await setShop({ balance: 500, plan: "small", period_orders: 160, usage_reset_at: await yesterday() });
    await runDailyBilling(pdb());
    await runDailyBilling(pdb());
    const s = await shop();
    expect(s.balance).toBe(500 - 50); // ১৫০-এর বেশি ১০টা × ৳৫
    expect(s.period_orders).toBe(0);
    expect((await ledger("overage")).map((l) => l.amount)).toEqual([-50]);
  });

  it("প্ল্যান অনুযায়ী বাড়তি অর্ডারের রেট (বাড়ন্ত: ৳৪, বড় ব্র্যান্ড: ৳৩)", async () => {
    await setShop({ balance: 0, plan: "grow", period_orders: 403, usage_reset_at: await yesterday() });
    await runDailyBilling(pdb());
    expect((await shop()).balance).toBe(-12); // ৩ × ৳৪
    const twoDaysAgo = (await pdb().prepare("SELECT datetime('now', '-2 days') AS d").first<{ d: string }>())!.d;
    await setShop({ balance: 0, plan: "big", period_orders: 1010, usage_reset_at: twoDaysAgo });
    await runDailyBilling(pdb());
    expect((await shop()).balance).toBe(-30); // ১০ × ৳৩
  });

  it("ট্রায়ালের মেয়াদ শেষ হওয়া দোকান cron-এ চালু হয়", async () => {
    await setShop({ status: "trial", trial_ends_at: "2020-01-01 00:00:00" });
    const r = await runDailyBilling(pdb());
    expect(r.trialsEnded).toBe(1);
    expect((await shop()).status).toBe("active");
  });
});

describe("বিলিং পেজ", () => {
  it("দোকানদার নিজের প্ল্যান, ব্যালেন্স আর লেনদেন দেখে, অন্য দোকানেরটা নয়", async () => {
    await pdb().prepare("INSERT INTO shops (id, slug, name, balance) VALUES ('other-shop', 'other', 'অন্য', 777)").run();
    await pdb().prepare("INSERT INTO ledger (shop_id, type, amount, ref, note, applied) VALUES ('other-shop', 'topup', 777, 'x', 'অন্য দোকানের রিচার্জ', 1)").run();
    await setShop({ plan: "small", period_orders: 120, balance: 50 });
    const a = await adminBrowser();
    const html = await (await a.get("/admin/billing")).text();
    expect(html).toContain("ছোট দোকান");
    expect(html).toContain("১২০ / ১৫০");
    expect(html).toContain("বাড়ন্ত");
    expect(html).not.toContain("অন্য দোকানের রিচার্জ");
    expect(html).not.toContain("৭৭৭");
  });

  it("বড় প্ল্যানে গেলে এখনই চালু, আগের প্ল্যানের বাকি দিনের টাকা বাদ যায়", async () => {
    // ছোট দোকানের (৳৪৪৯) মেয়াদের ১৫ দিন বাকি → ~৳২১৭–২৪০ বাদ; বাড়ন্ত ৳৯৯৯ − সেটা
    const half = (await pdb().prepare("SELECT datetime('now', '+15 days') AS d").first<{ d: string }>())!.d;
    await setShop({ plan: "small", cycle_months: 1, next_bill_at: half, balance: 1000 });
    const a = await adminBrowser();
    expect((await a.post("/admin/billing/plan", { plan: "grow", months: 1 })).status).toBe(303);
    const s = await shop();
    expect(s.plan).toBe("grow");
    expect(s.balance).toBeGreaterThanOrEqual(1000 - 999 + 217);
    expect(s.balance).toBeLessThanOrEqual(1000 - 999 + 241);
    expect((await ledger("plan_change"))).toHaveLength(1);
  });

  it("ব্যালেন্স কম হলে বড় প্ল্যানে যাওয়া যায় না; ছোট প্ল্যানে নামা পরের বিলে", async () => {
    await setShop({ plan: "grow", balance: 10 });
    const a = await adminBrowser();
    await a.post("/admin/billing/plan", { plan: "big", months: 1 });
    expect((await shop()).plan).toBe("grow");
    await a.post("/admin/billing/plan", { plan: "small", months: 1 });
    const s = await shop();
    expect(s.plan).toBe("grow");
    expect(s.plan_next).toBe("small");
    expect(await (await a.get("/admin/billing")).text()).toContain("পরের বিলের দিন থেকে");
  });

  it("সুপার অ্যাডমিন প্ল্যানের দাম বদলালে নতুন বিলে লাগে", async () => {
    const sa = await superBrowser();
    const s = await pdb().prepare("SELECT key, value FROM platform_settings").all<{ key: string; value: string }>();
    const form = Object.fromEntries(s.results.map((r) => [r.key, r.value]));
    await sa.fetch("/super/settings", { method: "POST", base: P, body: new URLSearchParams({ ...form, plan_small_price: "349", plan_small_orders: "300", plan_small_extra: "1", plan_small_staff: "1" }) } as RequestInit);
    clearSettingsCache();
    const y = (await pdb().prepare("SELECT datetime('now', '-1 day') AS d").first<{ d: string }>())!.d;
    await setShop({ balance: 1000, plan: "small", next_bill_at: y });
    await runDailyBilling(pdb());
    expect((await shop()).balance).toBe(1000 - 349);
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

describe("প্ল্যান বদলে টাকা হারায় না (রিভিউ ধাপ ২)", () => {
  const until = async (mod: string) => (await pdb().prepare("SELECT datetime('now', ?) AS d").bind(mod).first<{ d: string }>())!.d;

  it("লম্বা মেয়াদ থেকে বড় প্ল্যানের মাসিকে: বাড়তি না-ব্যবহৃত টাকা ব্যালেন্সে ফেরে", async () => {
    // ছোট দোকান ১২ মাস (৳৪৪৯০) এইমাত্র দেওয়া → বাড়ন্ত মাসিক ৳৯৯৯
    await setShop({ plan: "small", cycle_months: 12, next_bill_at: await until("+12 months"), balance: 100 });
    const a = await adminBrowser();
    await a.post("/admin/billing/plan", { plan: "grow", months: 1 });
    const s = await shop();
    expect(s).toMatchObject({ plan: "grow", cycle_months: 1 });
    expect(s.balance).toBeGreaterThanOrEqual(100 + 4490 - 999 - 2);
    expect(s.balance).toBeLessThanOrEqual(100 + 4490 - 999);
    const cr = await ledger("plan_change");
    expect(cr).toHaveLength(1);
    expect(cr[0]!.amount).toBeGreaterThan(3480);
  });

  it("একই প্ল্যানে মেয়াদ কমানো পরের বিলে; এখনকার মেয়াদ বদলায় না", async () => {
    const end = await until("+12 months");
    await setShop({ plan: "grow", cycle_months: 12, next_bill_at: end, balance: 50 });
    const a = await adminBrowser();
    await a.post("/admin/billing/plan", { plan: "grow", months: 1 });
    const s = await shop();
    expect(s).toMatchObject({ plan: "grow", cycle_months: 12, plan_next: "grow", cycle_next: 1, next_bill_at: end, balance: 50 });
    expect(await (await a.get("/admin/billing")).text()).toContain("মাসিক চালু হবে");
  });

  it("নিচে নামা বেছে রেখে মত বদলে উপরে উঠলে পুরো না-ব্যবহৃত টাকা ধরা হয়", async () => {
    await setShop({ plan: "grow", cycle_months: 12, next_bill_at: await until("+12 months"), balance: 10100 });
    const a = await adminBrowser();
    await a.post("/admin/billing/plan", { plan: "small", months: 1 });
    expect((await shop()).cycle_months).toBe(12);
    // বড় ব্র্যান্ড ১২ মাস ৳১৯৯৯০ − বাড়ন্ত ১২ মাসের না-ব্যবহৃত ~৳৯৯৯০ ≈ ৳১০০০০
    await a.post("/admin/billing/plan", { plan: "big", months: 12 });
    const s = await shop();
    expect(s).toMatchObject({ plan: "big", cycle_months: 12, plan_next: null, cycle_next: null });
    expect(s.balance).toBeGreaterThanOrEqual(10100 - 10002);
    expect(s.balance).toBeLessThanOrEqual(10100 - 9999);
  });

  it("বিলের দিন বেছে রাখা প্ল্যান আর মেয়াদ চালু হয়", async () => {
    await setShop({ plan: "grow", cycle_months: 12, plan_next: "small", cycle_next: 6, next_bill_at: await until("-1 minute"), balance: 5000 });
    await runDailyBilling(pdb());
    const s = await shop();
    expect(s).toMatchObject({ plan: "small", cycle_months: 6, plan_next: null, cycle_next: null });
    expect(s.balance).toBe(5000 - Math.round(449 * 6 * 0.9));
  });

  it("একই প্ল্যান আবার বাছলে বেছে রাখা বদল বাতিল", async () => {
    await setShop({ plan: "grow", cycle_months: 1, balance: 0 });
    const a = await adminBrowser();
    await a.post("/admin/billing/plan", { plan: "small", months: 1 });
    expect((await shop()).plan_next).toBe("small");
    await a.post("/admin/billing/plan", { plan: "grow", months: 1 });
    expect((await shop())).toMatchObject({ plan_next: null, cycle_next: null });
  });

  it("স্থগিত দোকানের বিল কাটে না; আবার চালু করলে মাঝের মাসের নয়, আজ থেকে একটা বিল", async () => {
    await setShop({ status: "suspended", plan: "small", cycle_months: 1, next_bill_at: await until("-75 days"), balance: 2000 });
    await runDailyBilling(pdb());
    expect((await shop()).balance).toBe(2000);
    await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES ('o@x.com', 'o', 'owner', ?, 1)").bind(await hashPassword("teampass123", 1000)).run();
    const b = new Browser();
    await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "o@x.com", password: "teampass123" }) } as RequestInit);
    await b.fetch(`/super/shops/${DEMO_SHOP_ID}/status`, { method: "POST", base: P, body: new URLSearchParams({ status: "active" }) } as RequestInit);
    await runDailyBilling(pdb());
    const s = await shop();
    expect(s.balance).toBe(2000 - 449);
    expect((await ledger("monthly"))).toHaveLength(1);
  });
});

describe("প্ল্যানের সীমার সতর্কবার্তা", () => {
  it("৮০%-এ জানায়, সীমা শেষ হলে বাড়তি রেট দেখায়; কম হলে কিছু নয়", async () => {
    const a = await adminBrowser();
    await setShop({ plan: "small", period_orders: 100 });
    expect(await (await a.get("/admin")).text()).not.toContain("প্ল্যানের ১০০/১৫০");
    await setShop({ plan: "small", period_orders: 120 });
    expect(await (await a.get("/admin")).text()).toContain("প্ল্যানের ১২০/১৫০টা অর্ডার");
    await setShop({ plan: "small", period_orders: 152 });
    const html = await (await a.get("/admin")).text();
    expect(html).toContain("১৫০টা অর্ডার শেষ");
    expect(html).toContain("৳৫");
  });
});
