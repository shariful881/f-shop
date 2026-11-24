import { beforeEach, describe, expect, it } from "vitest";
import { BASE, Browser, DB, adminBrowser, lastOrder, resetDb } from "./helpers";
import { decide, looksJunk, recordSignals, type Signal } from "../src/shop/lib/spam";

beforeEach(async () => {
  await resetDb();
});

/** পেছনের যাচাই শেষ হওয়া পর্যন্ত অপেক্ষা */
async function screened(id: number) {
  for (let i = 0; i < 150; i++) {
    const o = await DB.prepare("SELECT spam, spam_reasons, status FROM orders WHERE id = ?").bind(id).first<{ spam: number; spam_reasons: string | null; status: string }>();
    if (o && o.spam !== 2) return o;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("screening did not finish");
}
const level = (v: string) => DB.prepare("INSERT INTO settings (key, value) VALUES ('spam_level', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(v).run();
const human = { ft: 25000, fp: "a1b2c3d4e5f60718" };
let n = 0;
const phone = () => `0171${String(1000000 + n++).slice(-7)}`;

describe("স্প্যাম রায় (নিয়ম)", () => {
  const s = (k: string, w: Signal["w"]): Signal => ({ k, w, t: k });
  it("শক্ত লক্ষণ একটাই যথেষ্ট, দুর্বল একটা না — দুটো হলে হ্যাঁ", () => {
    expect(decide("medium", [s("bot", 2)]).spam).toBe(true);
    expect(decide("medium", [s("fast", 1)]).spam).toBe(false);
    expect(decide("medium", [s("fast", 1), s("courier_none", 1)]).spam).toBe(true);
  });
  it("নরম মাত্রায় দুর্বল লক্ষণ গোনা হয় না; কড়ায় কুরিয়ারে রেকর্ড না থাকাই যথেষ্ট", () => {
    expect(decide("soft", [s("fast", 1), s("ip_repeat", 1)]).spam).toBe(false);
    expect(decide("soft", [s("dev_repeat", 2)]).spam).toBe(true);
    expect(decide("medium", [s("courier_none", 1)]).spam).toBe(false);
    expect(decide("hard", [s("courier_none", 1)]).spam).toBe(true);
  });
  it("নিরাপদ লক্ষণ থাকলে কখনো স্প্যাম না; বন্ধ থাকলেও না", () => {
    expect(decide("hard", [s("bot", 2), s("dev_repeat", 2), s("own_good", -1)]).spam).toBe(false);
    expect(decide("off", [s("bot", 2)]).spam).toBe(false);
  });
  it("কুরিয়ার: খারাপ = শক্ত, ভালো = নিরাপদ, রেকর্ড নেই = দুর্বল, উত্তর না দিলে কিছুই না", () => {
    const c = (total: number, success: number) => ({ total, success, cancelled: total - success, ratio: total ? Math.round((success / total) * 100) : null, source: "test" });
    expect(recordSignals(undefined, undefined, c(6, 1)).map((x) => [x.k, x.w])).toEqual([["courier_bad", 2]]);
    expect(recordSignals(undefined, undefined, c(5, 5)).map((x) => [x.k, x.w])).toEqual([["courier_good", -1]]);
    expect(recordSignals(undefined, undefined, c(0, 0)).map((x) => [x.k, x.w])).toEqual([["courier_none", 1]]);
    expect(recordSignals(undefined, undefined, { error: "timeout" }).map((x) => x.w)).toEqual([0]);
    expect(recordSignals(undefined, undefined, null)).toEqual([]);
  });
  it("আজেবাজে নাম/ঠিকানা ধরে, আসল বাংলা নাম-ঠিকানা না", () => {
    expect(looksJunk("asdf", "বাসা ১২, মিরপুর, ঢাকা")).toBe(true);
    expect(looksJunk("রহিম", "aaaaaaaa")).toBe(true);
    expect(looksJunk("test", "Mirpur 10, Dhaka")).toBe(true);
    expect(looksJunk("মোছাঃ রহিমা খাতুন", "গ্রাম: চকপাড়া, শিবগঞ্জ, বগুড়া")).toBe(false);
    expect(looksJunk("Md Karim", "House 5, Road 2, Uttara, Dhaka")).toBe(false);
  });
});

describe("স্প্যাম ফিল্টার (অর্ডারে)", () => {
  it("মানুষের মতো অর্ডার নতুন তালিকায়; কয়েক সেকেন্ডে পূরণ করা অর্ডার স্প্যামে — কাস্টমার দুটোতেই সফল দেখে", async () => {
    const ok = new Browser();
    const r1 = await ok.order({ phone: phone(), ...human });
    expect(r1.headers.get("location")).toBe("/thanks");
    expect((await screened((await lastOrder())!.id)).spam).toBe(0);

    const bot = new Browser();
    const r2 = await bot.order({ phone: phone(), ft: 1200, fp: "ffff0000ffff0000" });
    expect(r2.headers.get("location")).toBe("/thanks");
    const o = (await lastOrder())!;
    const sc = await screened(o.id);
    expect(sc.spam).toBe(1);
    expect(sc.status).toBe("new");
    expect(sc.spam_reasons).toContain("সেকেন্ডে ফর্ম পূরণ");

    // ধন্যবাদ পেজ স্বাভাবিক, কিন্তু Facebook-এ Lead যায় না
    await DB.prepare("UPDATE settings SET value = '123456789' WHERE key = 'fb_pixel_id'").run();
    const thanks = await (await bot.get("/thanks")).text();
    expect(thanks).toContain(o.order_no);
    expect(thanks).not.toContain("lead_" + o.order_no);
    const thanksOk = await (await ok.get("/thanks")).text();
    expect(thanksOk).toContain("lead_");
  });

  it("ব্রাউজারের স্ক্রিপ্ট ছাড়া পাঠানো (ft ফাঁকা) স্প্যাম; পুরনো পেজ (ft ঘরই নেই) স্প্যাম নয়", async () => {
    await new Browser().order({ phone: phone(), ft: "", fp: "" });
    expect((await screened((await lastOrder())!.id)).spam).toBe(1);
    await new Browser().order({ phone: phone() });
    expect((await screened((await lastOrder())!.id)).spam).toBe(0);
  });

  it("নাম-নম্বর বদলে একই ফোন আর নেট থেকে বারবার: তৃতীয়টা থেকে স্প্যাম", async () => {
    const fp = "0123456789abcdef";
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const b = new Browser("10.9.9.9"); // প্রতিবার নতুন কুকি (Incognito), একই নেট
      await b.order({ phone: phone(), name: `ক্রেতা ${["এক", "দুই", "তিন"][i]}`, ...human, fp });
      ids.push((await lastOrder())!.id);
      await screened(ids[i]!);
    }
    const rows = await DB.prepare(`SELECT spam FROM orders WHERE id IN (${ids.join(",")}) ORDER BY id`).all<{ spam: number }>();
    expect(rows.results.map((r) => r.spam)).toEqual([0, 0, 1]);
  });

  it("আগে এই দোকান থেকে কেনা নম্বর কখনো স্প্যামে যায় না", async () => {
    const p = phone();
    await new Browser().order({ phone: p, ...human });
    const first = (await lastOrder())!;
    await screened(first.id);
    await DB.prepare("UPDATE orders SET status = 'shipped' WHERE id = ?").bind(first.id).run();
    await new Browser().order({ phone: p, ft: 900, fp: "" });
    expect((await screened((await lastOrder())!.id)).spam).toBe(0);
  });

  it("ফিল্টার বন্ধ থাকলে সব অর্ডার নতুনে", async () => {
    await level("off");
    await new Browser().order({ phone: phone(), ft: 500, fp: "" });
    const o = (await lastOrder())!;
    expect(o.spam).toBe(0);
  });

  it("অ্যাডমিন: স্প্যাম তালিকা আলাদা, নতুন তালিকায় দেখায় না, এক চাপে নতুনে পাঠানো যায়, হিসাব থাকে", async () => {
    await new Browser().order({ phone: phone(), ft: 800, fp: "" });
    const o = (await lastOrder())!;
    await screened(o.id);
    const a = await adminBrowser();
    const newList = await (await a.get("/admin/orders")).text();
    expect(newList).not.toContain(o.order_no);
    const spamList = await (await a.get("/admin/orders?status=spam")).text();
    expect(spamList).toContain(o.order_no);
    expect(spamList).toContain("নতুনে পাঠান");
    const detail = await (await a.get(`/admin/orders/${o.id}`)).text();
    expect(detail).toContain("স্প্যাম তালিকায় আছে");

    const r = await a.post("/admin/orders/bulk-status", { to: "release", ids: o.id, back: "/admin/orders?status=spam" });
    expect(r.status).toBe(303);
    const after = await DB.prepare("SELECT spam, spam_released, was_spam, status FROM orders WHERE id = ?").bind(o.id).first<any>();
    expect(after).toMatchObject({ spam: 0, spam_released: 1, was_spam: 1, status: "new" });
    expect(await (await a.get("/admin/orders")).text()).toContain(o.order_no);
    expect(await (await a.get("/admin/orders?status=spam")).text()).toContain("নতুনে ফিরিয়েছেন");
  });

  it("স্প্যাম থেকে সরাসরি ফেক দিলে স্প্যাম তালিকা থেকে সরে ফেক হয়", async () => {
    await new Browser().order({ phone: phone(), ft: 800, fp: "" });
    const o = (await lastOrder())!;
    await screened(o.id);
    const a = await adminBrowser();
    await a.post(`/admin/orders/${o.id}/status`, { status: "fake" });
    const after = await DB.prepare("SELECT spam, status FROM orders WHERE id = ?").bind(o.id).first<any>();
    expect(after).toMatchObject({ spam: 0, status: "fake" });
  });

  it("সেটিংসে মাত্রা বদলানো যায়", async () => {
    const a = await adminBrowser();
    const page = await (await a.get("/admin/settings/checkout")).text();
    expect(page).toContain("স্প্যাম ফিল্টার");
    await a.post("/admin/settings/checkout", { _section: "checkout", spam_level: "hard", max_qty: 5 });
    const r = await DB.prepare("SELECT value FROM settings WHERE key = 'spam_level'").first<{ value: string }>();
    expect(r?.value).toBe("hard");
  });

  it("যাচাই আটকে গেলে ৩ মিনিট পরে নিজে নতুন তালিকায় আসে", async () => {
    await new Browser().order({ phone: phone(), ...human });
    const o = (await lastOrder())!;
    await screened(o.id);
    await DB.prepare("UPDATE orders SET spam = 2, created_at = datetime('now', '-5 minutes') WHERE id = ?").bind(o.id).run();
    const a = await adminBrowser();
    expect(await (await a.get("/admin/orders")).text()).toContain(o.order_no);
    expect((await DB.prepare("SELECT spam FROM orders WHERE id = ?").bind(o.id).first<{ spam: number }>())!.spam).toBe(0);
  });
});
void BASE;
