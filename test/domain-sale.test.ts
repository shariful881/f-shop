import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, DEMO_SHOP_ID, readyForDomain, resetDb } from "./helpers";
import { bdtPrice, candidates, offerOf, runDomainRenewals, saleConfig } from "../src/platform/domain-sale";
import { parseCheck, porkbunFromEnv } from "../src/platform/porkbun";
import { clearSettingsCache } from "../src/platform/billing";
import { clearShopCache } from "../src/platform/resolve";

/* ---------- নকল Porkbun + Cloudflare ---------- */
type Pb = { calls: { path: string; body: any; idem?: string }[]; taken: Set<string>; price: Record<string, string>; failCreate?: string; failRenew?: string; owned: Map<string, string> };
let pb: Pb;
let zones: Map<string, { id: string; name: string; status: string }>;

const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
const cfReply = (result: unknown, success = true, errors: unknown[] = []) => ok({ success, result, errors });
const pbCheck = (d: string) => {
  const tld = d.split(".").slice(1).join(".");
  const price = pb.price[tld] ?? "11.08";
  return { avail: pb.taken.has(d) ? "no" : "yes", type: "registration", price, firstYearPromo: "no", regularPrice: price, premium: d.startsWith("gold") ? "yes" : "no", additional: { renewal: { type: "renewal", price: tld === "xyz" ? "14.00" : price } } };
};

async function setSale(on = true) {
  await env.PLATFORM_DB.batch([
    ["domain_sale", on ? "1" : "0"], ["domain_usd_rate", "130"], ["domain_markup", "300"], ["domain_tlds", "com,shop,xyz"], ["domain_max_usd", "30"],
  ].map(([k, v]) => env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v)));
  clearSettingsCache();
}
const setBalance = (n: number) => env.PLATFORM_DB.prepare("UPDATE shops SET balance = ? WHERE id = ?").bind(n, DEMO_SHOP_ID).run();
const balance = async () => (await env.PLATFORM_DB.prepare("SELECT balance FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<{ balance: number }>())!.balance;

beforeEach(async () => {
  await resetDb();
  await readyForDomain();
  await env.PLATFORM_DB.prepare("DELETE FROM domains WHERE zone_id IS NOT NULL").run();
  await env.PLATFORM_DB.prepare("DELETE FROM domain_regs").run();
  await env.PLATFORM_DB.prepare("DELETE FROM ledger WHERE type LIKE 'domain_%'").run();
  await env.PLATFORM_DB.prepare("DELETE FROM platform_rate_limits").run().catch(() => {});
  clearShopCache();
  await setSale(true);
  pb = { calls: [], taken: new Set(["taken.com"]), price: { com: "11.08", shop: "1.99", xyz: "2.04" }, owned: new Map() };
  zones = new Map();
  let n = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (url.hostname === "api.porkbun.com") {
      expect(init.headers["X-API-Key"]).toBe("pk1_sb_test");
      const path = url.pathname.replace("/api/json/v3", "");
      pb.calls.push({ path, body, idem: init.headers["Idempotency-Key"] });
      let m: RegExpMatchArray | null;
      if (path === "/ping") return ok({ status: "SUCCESS", account: "sellxbd", sandbox: true });
      if (path === "/domain/checkDomain") {
        return ok({ status: "SUCCESS", checked: body.domains.length, domains: Object.fromEntries(body.domains.map((d: string) => [d, pbCheck(d)])), unresolved: [], invalid: [] });
      }
      if ((m = path.match(/^\/domain\/checkDomain\/(.+)$/))) return ok({ status: "SUCCESS", response: pbCheck(decodeURIComponent(m[1]!)) });
      if ((m = path.match(/^\/domain\/create\/(.+)$/))) {
        const d = decodeURIComponent(m[1]!);
        if (pb.failCreate) return ok({ status: "ERROR", code: pb.failCreate, message: "nope" });
        const expect$ = Math.round(parseFloat(pbCheck(d).price) * 100);
        if (body.cost !== expect$) return ok({ status: "ERROR", code: "COST_MISMATCH", message: "cost" });
        expect(body.agreeToTerms).toBe("yes");
        pb.owned.set(d, "2027-11-24");
        return ok({ status: "SUCCESS", domain: d, cost: body.cost, orderId: 12345, balance: 99000 });
      }
      if ((m = path.match(/^\/domain\/renew\/(.+)$/))) {
        if (pb.failRenew) return ok({ status: "ERROR", code: pb.failRenew, message: "nope" });
        return ok({ status: "SUCCESS", domain: decodeURIComponent(m[1]!), expirationDate: "2028-11-24", cost: body.cost, orderId: 777 });
      }
      if (path.startsWith("/domain/updateNs/")) return ok({ status: "SUCCESS" });
      if (path.startsWith("/domain/updateAutoRenew/")) return ok({ status: "SUCCESS", results: {} });
      throw new Error("unmocked porkbun " + path);
    }
    if (url.hostname === "api.cloudflare.com") {
      const path = url.pathname.replace("/client/v4", "");
      const method = init?.method || "GET";
      if (method === "POST" && path === "/zones") {
        const id = `zone${++n}`;
        zones.set(id, { id, name: body.name, status: "pending" });
        return cfReply({ id, name_servers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"], status: "pending" });
      }
      if (path.endsWith("/dns_records/scan/trigger")) return cfReply({});
      throw new Error(`unmocked CF ${method} ${path}`);
    }
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("দাম আর খোঁজা (ইউনিট)", () => {
  const cfg = saleConfig({ domain_sale: "1", domain_usd_rate: "130", domain_markup: "300", domain_tlds: "com, .shop,xyz", domain_max_usd: "30" });
  it("দাম = ডলার × রেট + লাভ, ১০ টাকায় উপরে", () => {
    expect(cfg.tlds).toEqual(["com", "shop", "xyz"]);
    expect(bdtPrice(11.08, cfg)).toBe(1750); // 1440.4 + 300 = 1740.4 → 1750
    expect(bdtPrice(1.99, cfg)).toBe(560);
  });
  it("নামের তালিকা", () => {
    expect(candidates("KathBon", cfg).names).toEqual(["kathbon.com", "kathbon.shop", "kathbon.xyz"]);
    expect(candidates("https://www.kathbon.shop/x", cfg).names[0]).toBe("kathbon.shop");
    expect(candidates("কাঠবন", cfg).error).toContain("ইংরেজি");
    expect(candidates("a--b", cfg).error).toBeTruthy();
  });
  it("কেনা যাবে না: নেওয়া, প্রিমিয়াম, দাম বেশি", () => {
    expect(offerOf(parseCheck("x.com", { avail: "no", price: "11" })!, cfg).reason).toContain("নিয়েছে");
    expect(offerOf(parseCheck("x.com", { avail: "yes", premium: "yes", price: "11" })!, cfg).reason).toContain("প্রিমিয়াম");
    expect(offerOf(parseCheck("x.com", { avail: "yes", price: "40" })!, cfg).reason).toContain("রিনিউ খরচ অনেক বেশি");
    const o = offerOf(parseCheck("x.xyz", { avail: "yes", price: "2.04", additional: { renewal: { price: "14.00" } } })!, cfg);
    expect(o).toMatchObject({ buyable: true, bdt: 570, renewBdt: 2120 });
  });
});

describe("দোকানের প্যানেলে ডোমেইন কেনা", () => {
  it("বন্ধ থাকলে কেনার অংশ দেখায় না", async () => {
    await setSale(false);
    const a = await adminBrowser();
    expect(await (await a.get("/admin/domain")).text()).not.toContain("নতুন ডোমেইন কিনুন");
  });

  it("খোঁজা → টাকায় দাম → কেনা: ব্যালেন্স কাটে, Porkbun-এ কেনা, অটো-রিনিউ বন্ধ, Cloudflare zone, নেমসার্ভার বসে", async () => {
    await setBalance(3000);
    const a = await adminBrowser();
    const page = await (await a.get("/admin/domain?q=Kathbon")).text();
    expect(page).toContain("নতুন ডোমেইন কিনুন");
    expect(page).toContain("kathbon.com");
    expect(page).toContain("৳১,৭৫০"); // .com
    expect(page).toContain("৳৫৬০"); // .shop
    expect(page).toContain("পরীক্ষামূলক মোড");
    // .com "সেরা পছন্দ", কাছাকাছি নাম আলাদা অংশে
    expect(page).toMatch(/ds-best[\s\S]*kathbon<b>\.com<\/b>/);
    expect(page).toContain("আরও কিছু নাম");
    expect(page).toContain("kathbonbd<b>.com</b>");
    // .xyz: প্রথম বছর ৳২৭০ (2.04×130+300=565→570), রিনিউ বেশি → হলুদ চিহ্ন
    expect(page).toContain("ds-renew jump");

    const r = await a.post("/admin/domain/buy", { domain: "kathbon.com", bdt: 1750, agree: 1 });
    expect(r.status).toBe(303);
    expect(await balance()).toBe(1250);
    const reg = await env.PLATFORM_DB.prepare("SELECT * FROM domain_regs WHERE domain = 'kathbon.com'").first<any>();
    expect(reg).toMatchObject({ shop_id: DEMO_SHOP_ID, status: "active", cost_cents: 1108, price_bdt: 1750, ns_ok: 1, order_id: "12345", auto_renew: 1 });
    expect(reg.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const create = pb.calls.find((x) => x.path === "/domain/create/kathbon.com")!;
    expect(create.idem).toMatch(/^sx-reg-kathbon\.com-/);
    expect(pb.calls.some((x) => x.path === "/domain/updateAutoRenew/kathbon.com" && x.body.status === "off")).toBe(true);
    const ns = pb.calls.find((x) => x.path === "/domain/updateNs/kathbon.com")!;
    expect(ns.body.ns).toEqual(["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"]);
    expect((await env.PLATFORM_DB.prepare("SELECT COUNT(*) n FROM domains WHERE root = 'kathbon.com'").first<{ n: number }>())!.n).toBe(2);

    const after = await (await a.get("/admin/domain")).text();
    expect(after).toContain("SellxBD থেকে কেনা");
    expect(after).toContain("নেমসার্ভার আমরা নিজে বসিয়েছি");
    expect(after).not.toContain("নতুন ডোমেইন কিনুন");
    // দ্বিতীয়টা কেনা যায় না
    const again = await a.post("/admin/domain/buy", { domain: "kathbon.shop", bdt: 560, agree: 1 });
    const at = await again.text();
    expect([...at.matchAll(/alert-error">([^<]*)/g)].map((m) => m[1]).join(" | ")).toContain("আগেই একটা ডোমেইন আছে");
    expect(await balance()).toBe(1250);
  });

  it("ব্যালেন্স কম, দাম বদল, নেওয়া ডোমেইন — টাকা কাটে না", async () => {
    await setBalance(100);
    const a = await adminBrowser();
    expect(await (await a.post("/admin/domain/buy", { domain: "kathbon.com", bdt: 1750, agree: 1 })).text()).toContain("রিচার্জ");
    await setBalance(5000);
    expect(await (await a.post("/admin/domain/buy", { domain: "kathbon.com", bdt: 1500, agree: 1 })).text()).toContain("দাম বদলেছে");
    expect(await (await a.post("/admin/domain/buy", { domain: "taken.com", bdt: 1750, agree: 1 })).text()).toContain("নিয়েছে");
    expect(await balance()).toBe(5000);
    expect(pb.calls.some((x) => x.path.startsWith("/domain/create"))).toBe(false);
  });

  it("Porkbun-এ কেনা ব্যর্থ হলে পুরো টাকা ফেরত, পরে আবার চেষ্টা করা যায়", async () => {
    await setBalance(3000);
    pb.failCreate = "INSUFFICIENT_FUNDS";
    const a = await adminBrowser();
    const r = await a.post("/admin/domain/buy", { domain: "kathbon.com", bdt: 1750, agree: 1 });
    expect(await r.text()).toContain("ফেরত");
    expect(await balance()).toBe(3000);
    expect((await env.PLATFORM_DB.prepare("SELECT status FROM domain_regs WHERE domain = 'kathbon.com'").first<any>()).status).toBe("failed");
    const led = (await env.PLATFORM_DB.prepare("SELECT type, amount FROM ledger WHERE shop_id = ? AND type LIKE 'domain_%' ORDER BY id").bind(DEMO_SHOP_ID).all<any>()).results;
    expect(led).toEqual([{ type: "domain_buy", amount: -1750 }, { type: "domain_refund", amount: 1750 }]);
    expect(await (await a.get("/admin/billing")).text()).toContain("ডোমেইনের টাকা ফেরত");

    pb.failCreate = undefined;
    expect((await a.post("/admin/domain/buy", { domain: "kathbon.com", bdt: 1750, agree: 1 })).status).toBe(303);
    expect(await balance()).toBe(1250);
  });
});

describe("রিনিউ", () => {
  async function bought(expires: string, autoRenew = 1) {
    await env.PLATFORM_DB.prepare("INSERT INTO domain_regs (domain, shop_id, status, cost_cents, price_bdt, renew_cents, expires_at, auto_renew, ns_ok) VALUES ('kathbon.com', ?, 'active', 1108, 1750, 1108, ?, ?, 1)")
      .bind(DEMO_SHOP_ID, expires, autoRenew).run();
  }
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const notes: { id: string; msg: any }[] = [];
  const notify = (id: string, msg: any) => { notes.push({ id, msg }); };

  it("প্যানেল থেকে এখনই রিনিউ: ব্যালেন্স কাটে, মেয়াদ বাড়ে; একই মেয়াদে দুবার নয়", async () => {
    await bought(day(100));
    await setBalance(2000);
    const a = await adminBrowser();
    expect(await (await a.get("/admin/domain")).text()).toContain("৳১,৭৫০/বছর");
    await a.post("/admin/domain/renew", {});
    expect(await balance()).toBe(250);
    expect((await env.PLATFORM_DB.prepare("SELECT expires_at FROM domain_regs").first<any>()).expires_at).toBe("2028-11-24");
    expect(pb.calls.find((x) => x.path === "/domain/renew/kathbon.com")!.body.cost).toBe(1108);
  });

  it("রিনিউ ব্যর্থ হলে ফেরত", async () => {
    await bought(day(100));
    await setBalance(2000);
    pb.failRenew = "RENEWAL_TOO_SOON";
    const a = await adminBrowser();
    await a.post("/admin/domain/renew", {});
    expect(await balance()).toBe(2000);
  });

  it("cron: ৩০ দিন আগে সতর্কবার্তা (একবারই), ১৪ দিনে ব্যালেন্স থাকলে নিজে রিনিউ, না থাকলে সতর্কবার্তা", async () => {
    const pbc = porkbunFromEnv(env as unknown as { PORKBUN_API_KEY?: string; PORKBUN_SECRET_KEY?: string });
    await bought(day(29));
    await setBalance(5000);
    notes.length = 0;
    let r = await runDomainRenewals(env.PLATFORM_DB, pbc, notify);
    expect(r.warned).toBe(1);
    expect(notes[0]!.msg.title).toContain("২৯".replace("২৯", "29"));
    expect(notes[0]!.id).toBe(DEMO_SHOP_ID);
    r = await runDomainRenewals(env.PLATFORM_DB, pbc, notify);
    expect(r.warned).toBe(0); // একই ধাপে দুবার নয়
    expect(await balance()).toBe(5000);

    await env.PLATFORM_DB.prepare("UPDATE domain_regs SET expires_at = ?").bind(day(10)).run();
    r = await runDomainRenewals(env.PLATFORM_DB, pbc, notify);
    expect(r.renewed).toBe(1);
    expect(await balance()).toBe(3250);

    // ব্যালেন্স কম → রিনিউ হয় না, ৭ দিনের সতর্কবার্তা
    await env.PLATFORM_DB.prepare("UPDATE domain_regs SET expires_at = ?, warned = NULL").bind(day(6)).run();
    await setBalance(100);
    notes.length = 0;
    r = await runDomainRenewals(env.PLATFORM_DB, pbc, notify);
    expect(r.renewed).toBe(0);
    expect(r.warned).toBe(1);
    expect(notes[0]!.msg.body).toContain("ব্যালেন্সে টাকা রাখুন");
  });

  it("অটো-রিনিউ বন্ধ থাকলে নিজে রিনিউ হয় না; মেয়াদ পেরোলে expired", async () => {
    await bought(day(5), 0);
    await setBalance(5000);
    const pbc = porkbunFromEnv(env as unknown as { PORKBUN_API_KEY?: string; PORKBUN_SECRET_KEY?: string });
    let r = await runDomainRenewals(env.PLATFORM_DB, pbc, notify);
    expect(r.renewed).toBe(0);
    await env.PLATFORM_DB.prepare("UPDATE domain_regs SET expires_at = ?").bind(day(-2)).run();
    r = await runDomainRenewals(env.PLATFORM_DB, pbc, notify);
    expect(r.expired).toBe(1);
    expect((await env.PLATFORM_DB.prepare("SELECT status FROM domain_regs").first<any>()).status).toBe("expired");
  });

  it("কেনা ডোমেইন নেমসার্ভারের অপেক্ষায় থাকলেও ৪ দিনের নিয়মে সরে না", async () => {
    await setBalance(3000);
    const a = await adminBrowser();
    await a.post("/admin/domain/buy", { domain: "kathbon.com", bdt: 1750, agree: 1 });
    await env.PLATFORM_DB.prepare("UPDATE domains SET created_at = datetime('now', '-30 days') WHERE root = 'kathbon.com'").run();
    const { expirePendingDomains, cfFromEnv } = await import("../src/platform/domains");
    const out = await expirePendingDomains(env.PLATFORM_DB, cfFromEnv(env));
    expect(out.removed).toBe(0);
    expect((await env.PLATFORM_DB.prepare("SELECT COUNT(*) n FROM domains WHERE root = 'kathbon.com'").first<{ n: number }>())!.n).toBe(2);
  });
});

describe("খোঁজার ফল সাজানো", () => {
  it("ব্যালেন্স কম হলে কেনার বদলে রিচার্জ; নেওয়া নাম আলাদা ভাঁজে", async () => {
    await setBalance(600);
    const a = await adminBrowser();
    pb.taken.add("taken.shop");
    const page = await (await a.get("/admin/domain?q=taken")).text();
    expect(page).toContain("পাওয়া যাচ্ছে না (২)");
    // .xyz ৳৫৭০ কেনা যায়, .com ৳১,৭৫০ নয়
    expect(page).toMatch(/taken<b>\.xyz<\/b><\/span>[^]*?name="bdt" value="570"/);
    expect(page).toMatch(/<details class="ds-taken">[^]*taken<b>\.com<\/b>/);
    const fresh = await (await a.get("/admin/domain?q=freshname")).text();
    const at = fresh.indexOf("freshname<b>.com</b>");
    const comRow = fresh.slice(at, fresh.indexOf('class="ds-row', at));
    expect(comRow).toContain("রিচার্জ করুন");
    expect(comRow).not.toContain('action="/admin/domain/buy"');
  });
});
