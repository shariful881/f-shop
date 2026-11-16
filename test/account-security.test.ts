/** security/step-3: অ্যাকাউন্ট ধরে ভুল চেষ্টার সীমা, শক্ত hash, নিজের পাসওয়ার্ড বদল, সব ডিভাইস থেকে লগআউট, ইমেইলে রিসেট */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";
import { hashPassword, PASSWORD_ITERATIONS, needsRehash, sha256Hex } from "../src/shop/lib/auth";
import { createResetToken, resetBase } from "../src/shop/lib/password-reset";
import { clearSettingsCache } from "../src/platform/billing";

const P = "https://ourdomain.com";
const iterOf = (h: string) => parseInt(h.split("$")[1]!, 10);
const hashOf = async (email: string) => (await DB.prepare("SELECT password_hash h FROM users WHERE email = ?").bind(email).first<{ h: string }>())!.h;
const userId = async (email: string) => (await DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: number }>())!.id;
const sessions = async (email: string) => (await DB.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ?").bind(await userId(email)).first<{ n: number }>())!.n;

async function login(email: string, password: string, b = new Browser()) {
  const r = await b.post("/admin/login", { email, password });
  return { b, r };
}

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM rate_limits").run();
  await DB.prepare("DELETE FROM password_resets").run();
});

describe("শক্ত পাসওয়ার্ড hash", () => {
  it("নতুন hash ১,০০,০০০ বার; পুরনো hash সঠিক লগইনের পর নিজে নতুন হয়", async () => {
    expect(PASSWORD_ITERATIONS).toBe(100_000);
    expect(iterOf(await hashPassword("x"))).toBe(100_000);
    expect(needsRehash(await hashPassword("x", 20_000))).toBe(true);
    expect(needsRehash(await hashPassword("x"))).toBe(false);

    await adminBrowser("old@test.com", "oldpass123"); // টেস্ট helper ১,০০০ বারের hash বসায়, তারপর লগইন
    expect(iterOf(await hashOf("old@test.com"))).toBe(100_000);
    expect((await login("old@test.com", "oldpass123")).r.status).toBe(303); // নতুন hash দিয়েও লগইন চলে
  });

  it("ভুল পাসওয়ার্ডে hash বদলায় না", async () => {
    await DB.prepare("INSERT INTO users (name,email,password_hash,is_admin) VALUES ('A','w@test.com',?,1)").bind(await hashPassword("rightpass1", 1000)).run();
    await login("w@test.com", "wrongpass1");
    expect(iterOf(await hashOf("w@test.com"))).toBe(1000);
  });
});

describe("অ্যাকাউন্ট ধরে ভুল চেষ্টার সীমা", () => {
  it("আলাদা আলাদা IP থেকে ৮টা ভুলের পর সঠিক পাসওয়ার্ডেও ১৫ মিনিট আটকায়; অন্য অ্যাকাউন্ট চলে", async () => {
    await adminBrowser("owner@test.com", "ownerpass1");
    await adminBrowser("other@test.com", "otherpass1");
    for (let i = 0; i < 8; i++) {
      const { r } = await login("owner@test.com", `wrong${i}xyz`); // প্রতিবার নতুন Browser = নতুন IP
      expect(await r.text()).toContain("ইমেইল বা পাসওয়ার্ড ভুল");
    }
    const blocked = await login("owner@test.com", "ownerpass1");
    expect(blocked.r.status).toBe(422);
    expect(await blocked.r.text()).toContain("অনেকবার ভুল পাসওয়ার্ড");
    expect((await login("other@test.com", "otherpass1")).r.status).toBe(303);
  });

  it("ভুল ইমেইলেও গোনে (কারো ইমেইল আছে কিনা বোঝা যায় না)", async () => {
    for (let i = 0; i < 8; i++) await login("ghost@test.com", "whatever12");
    expect(await (await login("ghost@test.com", "whatever12")).r.text()).toContain("অনেকবার ভুল পাসওয়ার্ড");
  });

  it("সুপার অ্যাডমিনেও — ৮টা ভুলের পর আটকায়", async () => {
    clearSettingsCache();
    const email = `lock${Date.now()}@t.com`;
    await env.PLATFORM_DB.prepare("INSERT INTO super_admins (email, name, role, password_hash, active) VALUES (?, 'L', 'owner', ?, 1)").bind(email, await hashPassword("teampass123", 1000)).run();
    const sl = (password: string) => new Browser().fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email, password }) } as RequestInit);
    for (let i = 0; i < 8; i++) await sl(`bad${i}pass`);
    const r = await sl("teampass123");
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("অনেকবার ভুল পাসওয়ার্ড");
  });

  it("সুপার অ্যাডমিনের পুরনো hash লগইনের পর নতুন হয়", async () => {
    const email = `rh${Date.now()}@t.com`;
    await env.PLATFORM_DB.prepare("INSERT INTO super_admins (email, name, role, password_hash, active) VALUES (?, 'R', 'owner', ?, 1)").bind(email, await hashPassword("teampass123", 1000)).run();
    const r = await new Browser().fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email, password: "teampass123" }) } as RequestInit);
    expect(r.status).toBe(303);
    const h = (await env.PLATFORM_DB.prepare("SELECT password_hash h FROM super_admins WHERE email = ?").bind(email).first<{ h: string }>())!.h;
    expect(iterOf(h)).toBe(100_000);
  });
});

describe("আমার অ্যাকাউন্ট — পাসওয়ার্ড বদল আর সব ডিভাইস থেকে লগআউট", () => {
  it("অর্ডার স্টাফও নিজের অ্যাকাউন্ট পেজ পায়; সাইডবারে লিংক আছে", async () => {
    const owner = await adminBrowser();
    await owner.post("/admin/staff", { name: "স্টাফ", email: "st@shop.test", password: "staffpass1", role: "orders" });
    const { b } = await login("st@shop.test", "staffpass1");
    const r = await b.get("/admin/account");
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("আমার অ্যাকাউন্ট");
    expect(html).toContain('href="/admin/account"');
  });

  it("এখনকার পাসওয়ার্ড ভুল বা নতুনটা না মিললে বদলায় না", async () => {
    const b = await adminBrowser("me@test.com", "mypass1234");
    const before = await hashOf("me@test.com");
    const r1 = await b.post("/admin/account/password", { current: "wrongpass1", password: "newpass1234", password2: "newpass1234" });
    expect(r1.status).toBe(422);
    expect(await r1.text()).toContain("এখনকার পাসওয়ার্ড ভুল");
    const r2 = await b.post("/admin/account/password", { current: "mypass1234", password: "newpass1234", password2: "different12" });
    expect(await r2.text()).toContain("মেলেনি");
    const r3 = await b.post("/admin/account/password", { current: "mypass1234", password: "short", password2: "short" });
    expect(await r3.text()).toContain("কমপক্ষে ৮ অক্ষর");
    expect(await hashOf("me@test.com")).toBe(before);
  });

  it("বদলালে এই ডিভাইস থাকে, অন্য ডিভাইস লগআউট; নতুন পাসওয়ার্ডে লগইন চলে, পুরনোটায় নয়", async () => {
    const phone = await adminBrowser("me@test.com", "mypass1234");
    const { b: laptop } = await login("me@test.com", "mypass1234");
    expect(await sessions("me@test.com")).toBe(2);
    const r = await laptop.post("/admin/account/password", { current: "mypass1234", password: "newpass1234", password2: "newpass1234" });
    expect(r.status).toBe(303);
    expect(await sessions("me@test.com")).toBe(1);
    expect((await laptop.get("/admin/account")).status).toBe(200);
    expect((await phone.get("/admin/orders")).headers.get("location")).toBe("/admin/login");
    expect((await login("me@test.com", "mypass1234")).r.status).toBe(422);
    expect((await login("me@test.com", "newpass1234")).r.status).toBe(303);
  });

  it("'বাকি সব ডিভাইস থেকে লগআউট' — শুধু নিজের অন্য সেশন যায়, অন্য ইউজারের নয়", async () => {
    const a = await adminBrowser("me@test.com", "mypass1234");
    await login("me@test.com", "mypass1234");
    await login("me@test.com", "mypass1234");
    const other = await adminBrowser("other@test.com", "otherpass1");
    expect(await sessions("me@test.com")).toBe(3);
    expect((await a.post("/admin/account/logout-others", {})).status).toBe(303);
    expect(await sessions("me@test.com")).toBe(1);
    expect((await a.get("/admin/orders")).status).toBe(200);
    expect((await other.get("/admin/orders")).status).toBe(200);
  });

  it("সাপোর্ট মোডে দোকানদারের পাসওয়ার্ড বদলানো যায় না", async () => {
    const b = await adminBrowser("me@test.com", "mypass1234");
    b.cookies.set("support_mode", "1");
    const before = await hashOf("me@test.com");
    await b.post("/admin/account/password", { current: "mypass1234", password: "newpass1234", password2: "newpass1234" });
    expect(await hashOf("me@test.com")).toBe(before);
    expect(await (await b.get("/admin/account")).text()).toContain("সাপোর্ট মোডে");
  });
});

describe("পাসওয়ার্ড ভুলে গেলে — ইমেইলে রিসেট", () => {
  it("লগইন পেজে লিংক; জানা আর অজানা ইমেইলে একই উত্তর; জানা ইমেইলে টোকেন তৈরি", async () => {
    await adminBrowser("me@test.com", "mypass1234");
    expect(await (await new Browser().get("/admin/login")).text()).toContain('href="/admin/forgot"');
    const known = await new Browser().post("/admin/forgot", { email: "ME@test.com" });
    const unknown = await new Browser().post("/admin/forgot", { email: "nobody@test.com" });
    const t1 = await known.text(), t2 = await unknown.text();
    expect(t1).toContain("লিংক পাঠানো হয়েছে");
    expect(t2).toContain("লিংক পাঠানো হয়েছে");
    expect(known.headers.get("cache-control")).toBe("no-store");
    const rows = await DB.prepare("SELECT user_id FROM password_resets").all<{ user_id: number }>();
    expect(rows.results.map((r) => r.user_id)).toEqual([await userId("me@test.com")]);
  });

  it("একই ইমেইলে ঘণ্টায় ৩টার বেশি লিংক নয়; নতুন লিংক চাইলে আগেরটা বাতিল", async () => {
    await adminBrowser("me@test.com", "mypass1234");
    for (let i = 0; i < 5; i++) await new Browser().post("/admin/forgot", { email: "me@test.com" });
    const all = await DB.prepare("SELECT used_at FROM password_resets").all<{ used_at: string | null }>();
    expect(all.results.length).toBe(3);
    expect(all.results.filter((r) => r.used_at === null).length).toBe(1);
  });

  it("রিসেট লিংক: পাসওয়ার্ড বদলায়, সব ডিভাইস লগআউট, আটকানো খোলে, লিংক একবারই চলে", async () => {
    const old = await adminBrowser("me@test.com", "mypass1234");
    for (let i = 0; i < 8; i++) await login("me@test.com", `wrong${i}xyz`); // অ্যাকাউন্ট আটকানো
    const token = await createResetToken(DB as unknown as D1Database, await userId("me@test.com"));

    const page = await new Browser().get(`/admin/reset?t=${token}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await page.text()).toContain("me@test.com");

    const b = new Browser();
    expect((await b.post("/admin/reset", { t: token, password: "brandnew12", password2: "nomatch123" })).status).toBe(422);
    const ok = await b.post("/admin/reset", { t: token, password: "brandnew12", password2: "brandnew12" });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/admin/login");
    expect(await (await b.get("/admin/login")).text()).toContain("পাসওয়ার্ড বদলেছে");

    expect((await old.get("/admin/orders")).headers.get("location")).toBe("/admin/login");
    expect((await login("me@test.com", "mypass1234")).r.status).toBe(422);
    expect((await login("me@test.com", "brandnew12")).r.status).toBe(303);
    expect(await (await new Browser().get(`/admin/reset?t=${token}`)).text()).toContain("আর কাজ করছে না");
    expect((await new Browser().post("/admin/reset", { t: token, password: "again12345", password2: "again12345" })).status).toBe(422);
  });

  it("মেয়াদ শেষ, ভুল বা বন্ধ ইউজারের টোকেন চলে না", async () => {
    await adminBrowser("me@test.com", "mypass1234");
    const id = await userId("me@test.com");
    const expired = await createResetToken(DB as unknown as D1Database, id);
    await DB.prepare("UPDATE password_resets SET expires_at = datetime('now', '-1 minute') WHERE id = ?").bind(await sha256Hex(expired)).run();
    expect(await (await new Browser().get(`/admin/reset?t=${expired}`)).text()).toContain("আর কাজ করছে না");
    expect(await (await new Browser().get("/admin/reset?t=abc")).text()).toContain("আর কাজ করছে না");
    const t = await createResetToken(DB as unknown as D1Database, id);
    await DB.prepare("UPDATE users SET active = 0 WHERE id = ?").bind(id).run();
    expect(await (await new Browser().get(`/admin/reset?t=${t}`)).text()).toContain("আর কাজ করছে না");
  });

  it("লিংকের ঠিকানা আসল host থেকে, X-Forwarded-Host থেকে নয়", () => {
    expect(resetBase("https://shop.test/admin/forgot")).toBe("https://shop.test");
    expect(resetBase("http://dokan.com/admin/forgot")).toBe("https://dokan.com");
    expect(resetBase("http://localhost:8787/admin/forgot")).toBe("http://localhost:8787");
  });
});
