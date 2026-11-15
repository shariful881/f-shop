import { env, SELF, runInDurableObject } from "cloudflare:test";
import type { ShopDO } from "../src/shop/shop-do";
import { clearShopCache } from "../src/platform/resolve";

export const BASE = "https://shop.test";
export const DEMO_SHOP_ID = "00000000-0000-4000-8000-000000000001";

/** একটা দোকানের Durable Object */
export function shopStub(shopId = DEMO_SHOP_ID) {
  return env.SHOP.getByName(shopId);
}

/**
 * টেস্ট থেকে দোকানের নিজস্ব ডাটাবেসে সরাসরি query (D1-এর মতো API)।
 * ভিতরে runInDurableObject দিয়ে দোকানের Durable Object-এর ভিতরে চলে।
 */
export interface TestStmt {
  query: string;
  params: unknown[];
  bind(...p: unknown[]): TestStmt;
  first<T = any>(col?: string): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

function makeDb(shopId: string) {
  const inDo = <T>(fn: (i: ShopDO) => Promise<T>) => runInDurableObject(shopStub(shopId), fn);
  const stmt = (q: string, params: unknown[] = []): TestStmt => ({
    query: q,
    params,
    bind: (...p: unknown[]) => stmt(q, p),
    first: <T = any>(col?: string) => inDo((i) => i.db.prepare(q).bind(...params).first<T>(col)),
    all: <T = any>() => inDo((i) => i.db.prepare(q).bind(...params).all<T>()),
    run: () => inDo((i) => i.db.prepare(q).bind(...params).run()),
  });
  return {
    prepare: (q: string) => stmt(q),
    batch: (list: TestStmt[]) => inDo((i) => i.db.batch(list.map((s) => i.db.prepare(s.query).bind(...s.params)))),
  };
}

/** ডেমো দোকানের ডাটাবেস */
export const DB = makeDb(DEMO_SHOP_ID);
export const shopDb = (shopId: string) => makeDb(shopId);

/** প্ল্যাটফর্মে দোকান তৈরি (domain দিলে সেটাও) */
export async function createShop(id: string, slug: string, domain?: string) {
  await env.PLATFORM_DB.prepare("INSERT OR IGNORE INTO shops (id, slug, name, status, plan) VALUES (?, ?, ?, 'active', 'small')").bind(id, slug, slug).run();
  if (domain) await env.PLATFORM_DB.prepare("INSERT OR IGNORE INTO domains (hostname, shop_id, status) VALUES (?, ?, 'active')").bind(domain, id).run();
  clearShopCache();
}

/** scripts/seed-demo.sql চালায় (DemoSeeder) */
export async function seedDemo(shopId = DEMO_SHOP_ID) {
  await runInDurableObject(shopStub(shopId), (i: ShopDO) => i.seedDemo());
}

/** সব ডাটা মুছে নতুন করে নমুনা ডাটা বসায় */
export async function resetDb() {
  await createShop(DEMO_SHOP_ID, "demoshop", "shop.test");
  await runInDurableObject(shopStub(), (i: ShopDO) => i.ensureInit(DEMO_SHOP_ID, false));
  await DB.batch(
    ["sms_logs", "order_items", "orders", "coupons", "product_variants", "blacklist_entries", "sessions", "users", "products", "categories", "order_locks", "rate_limits"].map(
      (t) => DB.prepare(`DELETE FROM ${t}`),
    ),
  );
  await DB.prepare("DELETE FROM sqlite_sequence WHERE name IN ('orders','order_items')").run().catch(() => {});
  await DB.batch([
    DB.prepare("UPDATE settings SET value='' WHERE key IN ('fb_pixel_id','fb_capi_token','fb_test_event_code')"),
    DB.prepare("UPDATE settings SET value='01700000000' WHERE key='contact_phone'"),
    DB.prepare("UPDATE settings SET value='' WHERE key LIKE 'steadfast_%' OR key LIKE 'pathao_%' OR key LIKE 'redx_%'"),
    DB.prepare("UPDATE settings SET value='0' WHERE key='sms_enabled'"),
  ]);
  await seedDemo();
}

let ipCounter = 1;

/**
 * কুকি মনে রাখে এমন একটা "ব্রাউজার"।
 * প্রতিটা ব্রাউজার আলাদা IP পায় (rate limit যাতে অন্য টেস্টে না লাগে)।
 */
export class Browser {
  cookies = new Map<string, string>();
  ip: string;
  constructor(ip?: string) {
    this.ip = ip ?? `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async fetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("cookie", this.cookieHeader());
    headers.set("cf-connecting-ip", this.ip);
    if (!headers.has("user-agent")) headers.set("user-agent", "TestBrowser/1.0");
    const base = (init as { base?: string }).base ?? BASE;
    if ((init.method || "GET") === "POST" && !headers.has("origin")) headers.set("origin", base);
    const res = await SELF.fetch(base + path, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i).trim();
      const value = pair!.slice(i + 1).trim();
      if (value === "" || /max-age=0/i.test(sc)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  get(path: string) {
    return this.fetch(path);
  }

  post(path: string, data: Record<string, string | number>, headers: Record<string, string> = {}) {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) body.append(k, String(v));
    return this.fetch(path, { method: "POST", body, headers });
  }

  /** ল্যান্ডিং পেজ থেকে অর্ডার */
  order(over: Record<string, string | number> = {}) {
    return this.post("/order", {
      source: "landing",
      product_id: 1,
      name: "রহিম উদ্দিন",
      phone: "01712345678",
      address: "বাসা ১২, রোড ৩, মিরপুর, ঢাকা",
      area: "inside",
      note: "",
      ...over,
    });
  }
}

export async function countOrders(): Promise<number> {
  const r = await DB.prepare("SELECT COUNT(*) n FROM orders").first<{ n: number }>();
  return r!.n;
}

export async function lastOrder() {
  return DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<Record<string, any>>();
}

import { hashPassword } from "../src/shop/lib/auth";

/** টেস্টের জন্য অ্যাডমিন বানায় আর লগইন করা একটা ব্রাউজার ফেরত দেয় */
export async function adminBrowser(email = "admin@test.com", password = "pass12345") {
  const hash = await hashPassword(password, 1000);
  await DB.prepare("INSERT OR REPLACE INTO users (name,email,password_hash,is_admin) VALUES ('Admin',?,?,1)").bind(email, hash).run();
  const b = new Browser();
  const res = await b.post("/admin/login", { email, password });
  if (res.status !== 303) throw new Error("admin login failed: " + res.status);
  return b;
}

/** অ্যাডমিন হিসেবে অর্ডারের স্ট্যাটাস বদলায় */
export async function setStatus(adminB: Browser, orderId: number, status: string) {
  return adminB.post(`/admin/orders/${orderId}/status`, { status });
}
