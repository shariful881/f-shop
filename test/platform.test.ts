import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Browser, resetDb, shopDb } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { clearShopCache } from "../src/platform/resolve";

const P = "https://ourdomain.com";
let ipN = 1;
const freshIp = () => `172.16.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;

beforeEach(resetDb);

function signup(over: Record<string, string> = {}, ip = freshIp()) {
  const b = new Browser(ip);
  return {
    b,
    res: b.fetch("/signup", {
      method: "POST",
      base: P,
      body: new URLSearchParams({
        shop_name: "রহিমের দোকান", slug: "rahim", owner_name: "রহিম", phone: "+880 1712-345678",
        email: "Rahim@Example.com", password: "secret123", seed_demo: "1", ...over,
      }),
    } as RequestInit),
  };
}

async function shopRow(slug: string) {
  return env.PLATFORM_DB.prepare("SELECT * FROM shops WHERE slug = ?").bind(slug).first<Record<string, any>>();
}

describe("প্ল্যাটফর্মের হোম পেজ", () => {
  it("দাম আর সাইনআপ বাটন দেখায়", async () => {
    const html = await (await new Browser().fetch("/", { base: P } as RequestInit)).text();
    expect(html).toContain("৳৯৯");
    expect(html).toContain('href="/signup"');
  });
});

describe("সাইনআপ", () => {
  it("রেজিস্ট্রেশনের সাথে সাথে আলাদা দোকান, subdomain আর ড্যাশবোর্ড তৈরি হয়", async () => {
    const { res } = signup();
    const r = await res;
    expect(r.status).toBe(303);
    const loc = r.headers.get("location")!;
    expect(loc).toMatch(/^https:\/\/rahim\.ourdomain\.com\/admin\/auto-login\?t=[0-9a-f]{64}$/);

    const s = await shopRow("rahim");
    expect(s).toMatchObject({ name: "রহিমের দোকান", owner_phone: "01712345678", owner_email: "rahim@example.com", status: "trial", trial_orders_left: 50 });
    const days = (new Date(s!.trial_ends_at.replace(" ", "T") + "Z").getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);

    // দোকানের নিজস্ব ডাটাবেস: মালিক, দোকানের নাম, যোগাযোগ নম্বর, নমুনা পণ্য
    const db = shopDb(s!.id);
    expect(await db.prepare("SELECT email, is_admin FROM users").first()).toEqual({ email: "rahim@example.com", is_admin: 1 });
    expect((await db.prepare("SELECT COUNT(*) n FROM users").first())!.n).toBe(1); // ডেমো ইউজার নেই
    expect((await db.prepare("SELECT value FROM settings WHERE key='site_name'").first())!.value).toBe("রহিমের দোকান");
    expect((await db.prepare("SELECT value FROM settings WHERE key='contact_phone'").first())!.value).toBe("01712345678");
    expect((await db.prepare("SELECT COUNT(*) n FROM products").first())!.n).toBe(3);

    // এককালীন টোকেনে সরাসরি ড্যাশবোর্ড
    const shopB = new Browser();
    const url = new URL(loc);
    const auto = await shopB.fetch(url.pathname + url.search, { base: "https://rahim.ourdomain.com" } as RequestInit);
    expect(auto.status).toBe(303);
    expect(auto.headers.get("location")).toBe("/admin/orders");
    const dash = await shopB.fetch("/admin/orders", { base: "https://rahim.ourdomain.com" } as RequestInit);
    expect(dash.status).toBe(200);
    expect(await dash.text()).toContain("স্বাগতম");

    // টোকেন দ্বিতীয়বার কাজ করে না
    const again = await new Browser().fetch(url.pathname + url.search, { base: "https://rahim.ourdomain.com" } as RequestInit);
    expect(again.headers.get("location")).toBe("/admin/login");

    // দোকানের সাইট চালু
    const site = await (await new Browser().fetch("/", { base: "https://rahim.ourdomain.com" } as RequestInit)).text();
    expect(site).toContain("রহিমের দোকান");
  });

  it("নমুনা পণ্য না চাইলে খালি দোকান", async () => {
    const r = await signup({ slug: "khali", seed_demo: "" }).res;
    expect(r.status).toBe(303);
    const s = await shopRow("khali");
    expect((await shopDb(s!.id).prepare("SELECT COUNT(*) n FROM products").first())!.n).toBe(0);
  });

  it("মালিক নিজের ইমেইল-পাসওয়ার্ডে লগইন করতে পারে", async () => {
    await signup({ slug: "login-test" }).res;
    const b = new Browser();
    const r = await b.fetch("/admin/login", {
      method: "POST", base: "https://login-test.ourdomain.com",
      body: new URLSearchParams({ email: "rahim@example.com", password: "secret123" }),
    } as RequestInit);
    expect(r.status).toBe(303);
  });

  it.each([
    ["www", "সংরক্ষিত"],
    ["admin", "সংরক্ষিত"],
    ["ab", "৩-৩০"],
    ["Bad_Name", "৩-৩০"],
    ["-abc", "৩-৩০"],
    ["a--b", "পরপর"],
    ["demoshop", "আগেই নেওয়া"],
  ])("ঠিকানা '%s' নেওয়া যায় না", async (slug, msg) => {
    const r = await signup({ slug }).res;
    expect(r.status).toBe(422);
    expect(await r.text()).toContain(msg);
  });

  it("লাইভ চেক: খালি আর নেওয়া ঠিকানা", async () => {
    const ok = await (await new Browser().fetch("/signup/check?slug=notun", { base: P } as RequestInit)).json<any>();
    expect(ok.ok).toBe(true);
    const taken = await (await new Browser().fetch("/signup/check?slug=demoshop", { base: P } as RequestInit)).json<any>();
    expect(taken.ok).toBe(false);
  });

  it("ভুল নম্বর, ইমেইল বা ছোট পাসওয়ার্ডে দোকান হয় না", async () => {
    const r = await signup({ slug: "vul", phone: "012", email: "x", password: "123" }).res;
    expect(r.status).toBe(422);
    const html = await r.text();
    expect(html).toContain("সঠিক মোবাইল নম্বর");
    expect(html).toContain("সঠিক ইমেইল");
    expect(html).toContain("কমপক্ষে ৮");
    expect(await shopRow("vul")).toBeNull();
  });

  it("একই IP থেকে ঘণ্টায় ৫টার বেশি সাইনআপ নয়", async () => {
    const ip = "192.0.2.77";
    const st: number[] = [];
    for (let i = 0; i < 6; i++) st.push((await signup({ slug: `rl-shop-${i}` }, ip).res).status);
    expect(st.slice(0, 5)).toEqual([303, 303, 303, 303, 303]);
    expect(st[5]).toBe(429);
  });
});

describe("সুপার অ্যাডমিন", () => {
  async function superBrowser() {
    await env.PLATFORM_DB.prepare("INSERT OR REPLACE INTO super_admins (id, email, password_hash) VALUES (1, 'boss@test.com', ?)").bind(await hashPassword("bosspass123", 1000)).run();
    const b = new Browser();
    const r = await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "boss@test.com", password: "bosspass123" }) } as RequestInit);
    expect(r.status).toBe(303);
    return b;
  }
  const get = (b: Browser, path: string) => b.fetch(path, { base: P } as RequestInit);
  const post = (b: Browser, path: string, data: Record<string, string>) =>
    b.fetch(path, { method: "POST", base: P, body: new URLSearchParams(data) } as RequestInit);

  it("লগইন ছাড়া ঢোকা যায় না, দোকানের অ্যাডমিন সেশন দিয়েও না", async () => {
    expect((await get(new Browser(), "/super")).headers.get("location")).toBe("/super/login");
    expect((await get(new Browser(), "/super/shops/x")).headers.get("location")).toBe("/super/login");
    const bad = await post(new Browser(), "/super/login", { email: "boss@test.com", password: "wrong" });
    expect(bad.status).toBe(422);
  });

  it("দোকানের তালিকা, খোঁজা আর ডিটেইল", async () => {
    await signup({ slug: "karim-store", shop_name: "করিম স্টোর", phone: "01898765432" }).res;
    const b = await superBrowser();
    const list = await (await get(b, "/super/shops")).text();
    expect(list).toContain("করিম স্টোর");
    expect(list).toContain("demoshop");
    const found = await (await get(b, "/super/shops?q=" + encodeURIComponent("+8801898765432"))).text();
    expect(found).toContain("করিম স্টোর");
    expect(found).not.toContain("demoshop");
    const s = await shopRow("karim-store");
    const detail = await (await get(b, `/super/shops/${s!.id}`)).text();
    expect(detail).toContain("01898765432");
    expect(detail).toContain(s!.id);
  });

  it("দোকান বন্ধ করলে সাইট আর খোলে না; আবার চালু করলে খোলে", async () => {
    await signup({ slug: "bondho" }).res;
    const s = await shopRow("bondho");
    const b = await superBrowser();
    await post(b, `/super/shops/${s!.id}/status`, { status: "closed" });
    clearShopCache();
    expect((await new Browser().fetch("/", { base: "https://bondho.ourdomain.com" } as RequestInit)).status).toBe(404);
    await post(b, `/super/shops/${s!.id}/status`, { status: "active" });
    clearShopCache();
    expect((await new Browser().fetch("/", { base: "https://bondho.ourdomain.com" } as RequestInit)).status).toBe(200);
  });

  it("ট্রায়াল বাড়ানো যায়", async () => {
    await signup({ slug: "trial-x" }).res;
    const s = await shopRow("trial-x");
    const b = await superBrowser();
    await post(b, `/super/shops/${s!.id}/extend-trial`, { days: "7" });
    const after = await shopRow("trial-x");
    const days = (new Date(after!.trial_ends_at.replace(" ", "T") + "Z").getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(20.9);
  });
});

describe("প্রথম সুপার অ্যাডমিন (এককালীন সেটআপ কোড)", () => {
  const CODE = "abcdefghijklmnopqrstuvwxyz123456";
  it("কোড মিললে আর কেউ না থাকলে একবারই তৈরি হয়; কোড মুছে যায়", async () => {
    const db = env.PLATFORM_DB;
    await db.prepare("DELETE FROM super_admins").run();
    await db.prepare("INSERT OR REPLACE INTO platform_settings (key, value) VALUES ('super_setup_code', ?)").bind(CODE).run();

    const post = (body: Record<string, string>) => SELF.fetch(P + "/super/setup", { method: "POST", body: new URLSearchParams(body), headers: { origin: P }, redirect: "manual" });
    expect((await SELF.fetch(P + "/super/setup?code=wrongwrongwrongwrongwrong1", { redirect: "manual" })).status).toBe(303);
    expect((await SELF.fetch(P + "/super/setup?code=" + CODE, { redirect: "manual" })).status).toBe(200);
    expect((await post({ code: CODE, email: "me@x.com", password: "short", password2: "short" })).status).toBe(422);
    expect((await post({ code: CODE, email: "Me@X.com", password: "longpassword1", password2: "longpassword1" })).status).toBe(303);
    expect((await db.prepare("SELECT email FROM super_admins").all()).results).toEqual([{ email: "me@x.com" }]);
    expect(await db.prepare("SELECT 1 FROM platform_settings WHERE key='super_setup_code'").first()).toBeNull();
    // দ্বিতীয়বার আর হয় না
    await db.prepare("INSERT OR REPLACE INTO platform_settings (key, value) VALUES ('super_setup_code', ?)").bind(CODE).run();
    await post({ code: CODE, email: "hacker@x.com", password: "longpassword1", password2: "longpassword1" });
    expect((await db.prepare("SELECT COUNT(*) n FROM super_admins").first<any>()).n).toBe(1);
    // লগইন হয়
    const login = await SELF.fetch(P + "/super/login", { method: "POST", body: new URLSearchParams({ email: "me@x.com", password: "longpassword1" }), headers: { origin: P }, redirect: "manual" });
    expect(login.headers.get("location")).toBe("/super");
  });
});
