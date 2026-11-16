/** security/step-4: লগইন কুকি `__Host-` নামে, আর যাচাই বাকি দোকানে GTM বন্ধ */
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, DEMO_SHOP_ID, resetDb } from "./helpers";
import { createSession, hashPassword } from "../src/shop/lib/auth";
import { clearShopCache } from "../src/platform/resolve";

const P = "https://ourdomain.com";
const setVerified = async (v: 0 | 1) => {
  await env.PLATFORM_DB.prepare("UPDATE shops SET email_verified = ?, phone_verified = ? WHERE id = ?").bind(v, v, DEMO_SHOP_ID).run();
  clearShopCache();
};
const userId = async (email: string) => (await DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: number }>())!.id;

beforeEach(async () => { await resetDb(); await setVerified(1); });
afterEach(async () => { await setVerified(1); });

describe("লগইন কুকি __Host- নামে", () => {
  it("দোকানের লগইনে __Host-admin_session — Secure, Path=/, Domain নেই; পুরনো নাম বসে না", async () => {
    await adminBrowser("me@test.com", "mypass1234").catch(() => null); // ইউজার বানানো
    const r = await new Browser().post("/admin/login", { email: "me@test.com", password: "mypass1234" });
    expect(r.status).toBe(303);
    const sc = r.headers.getSetCookie();
    const host = sc.find((x) => x.startsWith("__Host-admin_session="))!;
    expect(host).toBeTruthy();
    expect(host).toMatch(/;\s*Secure/i);
    expect(host).toMatch(/;\s*Path=\//i);
    expect(host).not.toMatch(/Domain=/i);
    expect(host).toMatch(/HttpOnly/i);
    expect(sc.some((x) => /^admin_session=[0-9a-f]/.test(x))).toBe(false);
  });

  it("পুরনো নামের কুকিতে লগইন থাকে আর পরের রিকোয়েস্টে নতুন নামে সরে (কেউ লগআউট হয় না)", async () => {
    await adminBrowser("me@test.com", "mypass1234");
    const token = await createSession(DB as unknown as D1Database, await userId("me@test.com"));
    const b = new Browser();
    b.cookies.set("admin_session", token);
    const r = await b.get("/admin/orders");
    expect(r.status).toBe(200);
    expect(b.cookies.get("__Host-admin_session")).toBe(token);
    expect(b.cookies.has("admin_session")).toBe(false);
    expect((await b.get("/admin/orders")).status).toBe(200);
  });

  it("অন্য subdomain থেকে বসানো পুরনো নামের কুকি আসল __Host- কুকিকে ঢাকতে পারে না", async () => {
    await adminBrowser("victim@test.com", "victimpass1");
    await DB.prepare("INSERT INTO users (name,email,password_hash,is_admin) VALUES ('A','attacker@test.com',?,1)").bind(await hashPassword("attackpass1", 1000)).run();
    const victimToken = await createSession(DB as unknown as D1Database, await userId("victim@test.com"));
    const attackerToken = await createSession(DB as unknown as D1Database, await userId("attacker@test.com"));
    const b = new Browser();
    b.cookies.set("admin_session", attackerToken); // tossed কুকি
    b.cookies.set("__Host-admin_session", victimToken);
    const html = await (await b.get("/admin/account")).text();
    expect(html).toContain("victim@test.com");
    expect(html).not.toContain("attacker@test.com");
  });

  it("লগআউটে দুই নামের কুকিই মোছে", async () => {
    const b = await adminBrowser("me@test.com", "mypass1234");
    b.cookies.set("admin_session", "x");
    const r = await b.post("/admin/logout", {});
    const sc = r.headers.getSetCookie().join("\n");
    expect(sc).toMatch(/__Host-admin_session=;/);
    expect(sc).toMatch(/(^|\n)admin_session=;/);
    expect((await b.get("/admin/orders")).headers.get("location")).toBe("/admin/login");
  });

  it("সুপার অ্যাডমিনেও __Host-super_session", async () => {
    const email = `ck${Date.now()}@t.com`;
    await env.PLATFORM_DB.prepare("INSERT INTO super_admins (email, name, role, password_hash, active) VALUES (?, 'C', 'owner', ?, 1)").bind(email, await hashPassword("teampass123", 1000)).run();
    const b = new Browser();
    const r = await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email, password: "teampass123" }) } as RequestInit);
    expect(r.status).toBe(303);
    expect(r.headers.getSetCookie().find((x) => x.startsWith("__Host-super_session="))).toMatch(/Secure/i);
    expect((await b.fetch("/super", { base: P } as RequestInit)).status).toBe(200);
  });
});

describe("যাচাই বাকি দোকানে GTM বন্ধ", () => {
  beforeEach(async () => {
    await DB.prepare("INSERT INTO settings (key, value) VALUES ('gtm_id', 'GTM-ABC1234') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  });

  it("যাচাই করা দোকানে GTM লোড হয়", async () => {
    const html = await (await new Browser().get("/")).text();
    expect(html).toContain("GTM-ABC1234");
  });

  it("যাচাই বাকি দোকানে GTM লোড হয় না, কিন্তু অ্যাডমিনের সেটিংসে আইডি থাকে (মুছে যায় না)", async () => {
    const a = await adminBrowser();
    await setVerified(0);
    const html = await (await new Browser().get("/")).text();
    expect(html).not.toContain("GTM-ABC1234");
    expect(html).not.toContain("googletagmanager.com/gtm.js");
    const settings = await (await a.get("/admin/settings/tracking")).text();
    expect(settings).toContain('value="GTM-ABC1234"');
  });
});
