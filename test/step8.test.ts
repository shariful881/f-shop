/**
 * ধাপ ৮: AI ল্যান্ডিং লেখা, PWA + নতুন অর্ডারে পুশ নোটিফিকেশন, ব্লগ
 */
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";
import { allowedEndpoint, b64u, encryptPayload, unb64u } from "../src/shop/lib/push";
import { applyCopy, parseAiCopy } from "../src/shop/lib/ai";
import { normalizeLanding } from "../src/shop/lib/landing";
import { hashPassword } from "../src/shop/lib/auth";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;

const AI_JSON = JSON.stringify({
  headline: "হাতে বানানো কাঠের শেলফ",
  subheadline: "ঘর সাজান টেকসই সেগুন কাঠে",
  button_text: "এখনই অর্ডার করুন",
  intro: "আমাদের শেলফ মজবুত আর সুন্দর।",
  benefits_title: "কেন কিনবেন",
  benefits: ["খাঁটি সেগুন কাঠ", "হাতে পালিশ", "সহজে বসানো যায়"],
  comparison: { title: "আমাদের বনাম বাজারের", ours: ["খাঁটি কাঠ"], others: ["পার্টিকেল বোর্ড"] },
  guarantee: "পণ্য হাতে দেখে টাকা দিন",
  faqs: [{ q: "ডেলিভারি কত দিনে?", a: "ঢাকায় ২ দিন, বাইরে ৩–৫ দিন।" }],
  cta: "আজই অর্ডার করুন",
});

let pushHits: { url: string; headers: Headers; body: Uint8Array }[] = [];
let pushStatus = 201;

beforeEach(async () => {
  pushHits = [];
  pushStatus = 201;
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://fcm.googleapis.com/")) {
      pushHits.push({ url, headers: new Headers(init?.headers), body: new Uint8Array(init?.body as ArrayBuffer) });
      return new Response("", { status: pushStatus });
    }
    return real(input, init);
  });
  await resetDb();
  await DB.prepare("DELETE FROM push_subs").run();
  await DB.prepare("DELETE FROM pages").run();
  await DB.prepare("DELETE FROM settings WHERE key LIKE 'ai_%' OR key = 'test_ai_response'").run();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((r) => setTimeout(r, 20));
});

/* ---------- AI ---------- */
describe("AI দিয়ে ল্যান্ডিং লেখা", () => {
  it("JSON পার্স — বাড়তি লেখা থাকলেও, ভুল হলে null", () => {
    expect(parseAiCopy("এই নিন:\n```json\n" + AI_JSON + "\n```")?.headline).toBe("হাতে বানানো কাঠের শেলফ");
    expect(parseAiCopy("দুঃখিত")).toBeNull();
  });

  it("applyCopy লেখা বদলায়, অর্ডার ফর্ম আর গ্যালারি রাখে", () => {
    const cur = normalizeLanding({ sections: [{ type: "hero", title: "পুরনো" }, { type: "gallery", images: ["a.jpg"] }, { type: "order_form" }] });
    const next = applyCopy(cur, parseAiCopy(AI_JSON)!);
    const types = next.sections.map((s: any) => s.type);
    expect(types).toContain("order_form");
    expect(types).toContain("gallery");
    expect(JSON.stringify(next)).toContain("হাতে বানানো কাঠের শেলফ");
    expect(JSON.stringify(next)).not.toContain("পুরনো");
  });

  it("রুট: লেখা বসে, আগেরটায় ফেরা যায়; ছোট বর্ণনায় ভুল", async () => {
    const a = await adminBrowser();
    await DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('test_ai_response', ?)").bind(AI_JSON).run();
    const before = (await DB.prepare("SELECT landing_json FROM products WHERE id = 1").first<any>()).landing_json;

    await a.post("/admin/products/1/landing/ai", { about: "ছোট", tone: "friendly" });
    expect((await DB.prepare("SELECT landing_json FROM products WHERE id = 1").first<any>()).landing_json).toBe(before);

    const r = await a.post("/admin/products/1/landing/ai", { about: "সেগুন কাঠের তিন তাকের শেলফ, বসার ঘরের জন্য", tone: "premium" });
    expect(r.status).toBe(303);
    const after = (await DB.prepare("SELECT landing_json FROM products WHERE id = 1").first<any>()).landing_json;
    expect(after).toContain("হাতে বানানো কাঠের শেলফ");
    const page = await (await a.get("/admin/products/1/landing")).text();
    expect(page).toContain("আগের লেখায় ফিরুন");

    await a.post("/admin/products/1/landing/ai-undo", {});
    expect((await DB.prepare("SELECT landing_json FROM products WHERE id = 1").first<any>()).landing_json).toBe(before);
  });

  it("দোকানে দিনে ১০ বারের বেশি নয়", async () => {
    const a = await adminBrowser();
    await DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('test_ai_response', ?)").bind(AI_JSON).run();
    for (let i = 0; i < 10; i++) await a.post("/admin/products/1/landing/ai", { about: "সেগুন কাঠের তিন তাকের শেলফ", tone: "friendly" });
    await DB.prepare("UPDATE products SET landing_json = NULL WHERE id = 1").run();
    await a.post("/admin/products/1/landing/ai", { about: "সেগুন কাঠের তিন তাকের শেলফ", tone: "friendly" });
    expect((await DB.prepare("SELECT landing_json FROM products WHERE id = 1").first<any>()).landing_json).toBeNull();
  });
});

/* ---------- পুশ ---------- */
async function browserKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, p256dh: b64u(pub), auth: b64u(auth), pub, authRaw: auth };
}
const enc = (s: string) => new TextEncoder().encode(s);
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bits: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bits));
}
/** RFC 8291 — ব্রাউজারের মতো করে খুলে দেখা */
async function decrypt(body: Uint8Array, k: Awaited<ReturnType<typeof browserKeys>>) {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPub = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey } as never, k.pair.privateKey, 256));
  const keyInfo = new Uint8Array([...enc("WebPush: info\0"), ...k.pub, ...asPub]);
  const ikm = await hkdf(k.authRaw, ecdh, keyInfo, 256);
  const cek = await hkdf(salt, ikm, enc("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(salt, ikm, enc("Content-Encoding: nonce\0"), 96);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ct));
  let end = plain.length - 1;
  while (end > 0 && plain[end] === 0) end--;
  expect(plain[end]).toBe(2);
  return new TextDecoder().decode(plain.slice(0, end));
}
const fcm = (id = "abc") => `https://fcm.googleapis.com/fcm/send/${id}`;
const subscribe = (a: Browser, sub: object) =>
  a.fetch("/admin/push/subscribe", { method: "POST", body: JSON.stringify(sub), headers: { "content-type": "application/json" } });

describe("পুশ নোটিফিকেশন", () => {
  it("এনক্রিপশন RFC 8291 মেনে — ব্রাউজার খুলতে পারে", async () => {
    const k = await browserKeys();
    const body = await encryptPayload(k.p256dh, k.auth, JSON.stringify({ title: "নতুন অর্ডার", body: "৳১২০০" }));
    expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096);
    expect(JSON.parse(await decrypt(body, k))).toEqual({ title: "নতুন অর্ডার", body: "৳১২০০" });
    expect(unb64u(k.auth).length).toBe(16);
  });

  it("শুধু পরিচিত পুশ সার্ভিসের ঠিকানা চলে", () => {
    expect(allowedEndpoint(fcm())).toBe(true);
    expect(allowedEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(allowedEndpoint("https://evil.example.com/push")).toBe(false);
    expect(allowedEndpoint("http://fcm.googleapis.com/x")).toBe(false);
  });

  it("সাবস্ক্রাইব যাচাই, টেস্ট পাঠানো, আনসাবস্ক্রাইব", async () => {
    const a = await adminBrowser();
    const k = await browserKeys();
    expect((await subscribe(a, { endpoint: "https://evil.example.com/x", keys: { p256dh: k.p256dh, auth: k.auth } })).status).toBe(400);
    expect((await subscribe(a, { endpoint: fcm(), keys: { p256dh: "short", auth: k.auth } })).status).toBe(400);
    expect((await subscribe(a, { endpoint: fcm(), keys: { p256dh: k.p256dh, auth: k.auth } })).status).toBe(200);
    expect((await DB.prepare("SELECT COUNT(*) n FROM push_subs").first<any>()).n).toBe(1);

    const t = await a.fetch("/admin/push/test", { method: "POST" });
    expect(await t.json()).toMatchObject({ ok: true, sent: 1 });
    expect(pushHits).toHaveLength(1);
    expect(pushHits[0]!.headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(pushHits[0]!.headers.get("Authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{80,}$/);
    expect(JSON.parse(await decrypt(pushHits[0]!.body, k)).title).toContain("টেস্ট");

    await a.fetch("/admin/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: fcm() }), headers: { "content-type": "application/json" } });
    expect((await DB.prepare("SELECT COUNT(*) n FROM push_subs").first<any>()).n).toBe(0);
  });

  it("লগইন ছাড়া সাবস্ক্রাইব করা যায় না", async () => {
    const k = await browserKeys();
    const r = await subscribe(new Browser(), { endpoint: fcm(), keys: { p256dh: k.p256dh, auth: k.auth } });
    expect(r.status).not.toBe(200);
    expect((await DB.prepare("SELECT COUNT(*) n FROM push_subs").first<any>()).n).toBe(0);
  });

  it("নতুন অর্ডারে নোটিফিকেশন যায়; 410 পেলে সাবস্ক্রিপশন মুছে যায়", async () => {
    const a = await adminBrowser();
    const k = await browserKeys();
    await subscribe(a, { endpoint: fcm("x1"), keys: { p256dh: k.p256dh, auth: k.auth } });
    await new Browser().order({ phone: "01712345678" });
    await new Promise((r) => setTimeout(r, 50));
    expect(pushHits.length).toBeGreaterThanOrEqual(1);
    const msg = JSON.parse(await decrypt(pushHits[0]!.body, k));
    expect(msg.title).toContain("নতুন অর্ডার");
    expect(msg.url).toMatch(/^\/admin\/orders/);

    pushStatus = 410;
    await a.fetch("/admin/push/test", { method: "POST" });
    expect((await DB.prepare("SELECT COUNT(*) n FROM push_subs").first<any>()).n).toBe(0);
  });

  it("ম্যানিফেস্ট আর সার্ভিস ওয়ার্কার", async () => {
    const b = new Browser();
    const m = await b.get("/admin-manifest.webmanifest");
    expect(m.status).toBe(200);
    expect(await m.json()).toMatchObject({ start_url: "/admin", scope: "/admin", display: "standalone" });
    const sw = await b.get("/admin-sw.js");
    expect(sw.headers.get("Service-Worker-Allowed")).toBe("/admin");
    expect(await sw.text()).toContain("showNotification");
    const a = await adminBrowser();
    const dash = await (await a.get("/admin")).text();
    expect(dash).toContain("admin-manifest.webmanifest");
    expect(dash).toContain("data-push");
  });
});

/* ---------- প্ল্যাটফর্ম ব্লগ ---------- */
async function superOwner() {
  await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES ('blog@x.com', 'blog', 'owner', ?, 1)")
    .bind(await hashPassword("teampass123", 1000)).run();
  const b = new Browser();
  const r = await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "blog@x.com", password: "teampass123" }) } as RequestInit);
  expect(r.status).toBe(303);
  return b;
}
const pget = (b: Browser, path: string) => b.fetch(path, { base: P } as RequestInit);
const ppost = (b: Browser, path: string, data: Record<string, string>) => b.fetch(path, { method: "POST", base: P, body: new URLSearchParams(data) } as RequestInit);

describe("sellxbd.com ব্লগ", () => {
  it("তালিকা, পোস্ট, sitemap, robots", async () => {
    const b = new Browser();
    const list = await (await pget(b, "/blog")).text();
    expect(list).toContain("ফেক অর্ডার");
    const post = await pget(b, "/blog/fake-order-komanor-upay");
    expect(post.status).toBe(200);
    const html = await post.text();
    expect(html).toMatch(/<meta name="description" content="[^"]{20,}"/);
    expect((await pget(b, "/blog/nai-emon-post")).status).toBe(404);
    const sm = await (await pget(b, "/sitemap.xml")).text();
    expect(sm).toContain("/blog/fake-order-komanor-upay");
    expect(sm).toContain("/help/");
    expect(await (await pget(b, "/robots.txt")).text()).toContain("Disallow: /super");
  });

  it("সুপার অ্যাডমিন পোস্ট লেখে, প্রকাশ করে, মোছে; স্ক্রিপ্ট বাদ যায়", async () => {
    const s = await superOwner();
    expect((await pget(s, "/super/blog")).status).toBe(200);
    const bad = await ppost(s, "/super/blog/new", { title: "নতুন", slug: "Bad Slug", excerpt: "", body_html: "<p>অনেক লম্বা লেখা এখানে আছে, যথেষ্ট বড়</p>", status: "draft" });
    expect(await bad.text()).toContain("লিংকে শুধু");
    const r = await ppost(s, "/super/blog/new", {
      title: "কুরিয়ার বাছাই", slug: "courier-bachai", excerpt: "কোন কুরিয়ার কখন",
      body_html: "<h2>শুরু</h2><p>অনেক লম্বা লেখা এখানে আছে, যথেষ্ট বড়</p><script>alert(1)</script>", status: "draft",
    });
    expect(r.status).toBe(303);
    const row = (await pdb().prepare("SELECT * FROM blog_posts WHERE slug = 'courier-bachai'").first<any>())!;
    expect(row.body_html).not.toContain("<script");
    expect(row.published_at).toBeNull();
    expect((await pget(new Browser(), "/blog/courier-bachai")).status).toBe(404);

    await ppost(s, `/super/blog/${row.id}`, { title: "কুরিয়ার বাছাই", slug: "courier-bachai", excerpt: "কোন কুরিয়ার কখন", body_html: row.body_html, status: "published" });
    expect((await pget(new Browser(), "/blog/courier-bachai")).status).toBe(200);
    const dup = await ppost(s, "/super/blog/new", { title: "আরেকটা", slug: "courier-bachai", excerpt: "", body_html: "<p>অনেক লম্বা লেখা এখানে আছে, যথেষ্ট বড়</p>", status: "draft" });
    expect(await dup.text()).toContain("আরেকটা পোস্ট আছে");

    await ppost(s, `/super/blog/${row.id}/delete`, { confirm: "1" });
    expect(await pdb().prepare("SELECT id FROM blog_posts WHERE slug = 'courier-bachai'").first()).toBeNull();
  });

  it("support রোল ব্লগ বদলাতে পারে না", async () => {
    await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES ('sup@x.com', 'sup', 'support', ?, 1)")
      .bind(await hashPassword("teampass123", 1000)).run();
    const b = new Browser();
    await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "sup@x.com", password: "teampass123" }) } as RequestInit);
    expect((await pget(b, "/super/blog")).status).toBe(403);
  });
});

/* ---------- দোকানের ব্লগ ---------- */
describe("দোকানের ব্লগ", () => {
  it("পোস্ট /blog-এ দেখায়, মেনুতে ব্লগ লিংক, পেজ আলাদা থাকে", async () => {
    const a = await adminBrowser();
    expect((await a.post("/admin/pages", { kind: "page", title: "আমাদের সম্পর্কে", slug: "about", content: "<p>আমরা</p>", in_menu: "1", is_active: "1" })).status).toBe(303);
    expect((await a.post("/admin/pages", { kind: "post", title: "কাঠের যত্ন", slug: "kather-jotno", content: "<p>নিয়মিত তেল দিন</p>", excerpt: "কাঠ ভালো রাখার উপায়", image: "javascript:alert(1)", in_menu: "1", is_active: "1" })).status).toBe(303);
    const post = (await DB.prepare("SELECT * FROM pages WHERE slug = 'kather-jotno'").first<any>())!;
    expect(post).toMatchObject({ kind: "post", in_menu: 0, image: null });

    const b = new Browser();
    const home = await (await b.get("/")).text();
    expect(home).toContain('href="/blog"');
    expect(home).toContain('href="/page/about"');
    const list = await (await b.get("/blog")).text();
    expect(list).toContain("কাঠের যত্ন");
    expect(list).not.toContain("আমাদের সম্পর্কে</h2>");
    const one = await b.get("/blog/kather-jotno");
    expect(one.status).toBe(200);
    expect(await one.text()).toContain('content="কাঠ ভালো রাখার উপায়"');
    const old = await b.get("/page/kather-jotno");
    expect(old.status).toBe(301);
    expect(old.headers.get("location")).toBe("/blog/kather-jotno");
    expect((await b.get("/blog/about")).status).toBe(404);
    expect(await (await b.get("/sitemap.xml")).text()).toContain("/blog/kather-jotno");
  });

  it("পোস্ট না থাকলে মেনুতে ব্লগ লিংক নেই", async () => {
    expect(await (await new Browser().get("/")).text()).not.toContain('href="/blog"');
  });
});
