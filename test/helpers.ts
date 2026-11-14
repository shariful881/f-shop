import { env, SELF } from "cloudflare:test";
// @ts-expect-error — Vite ?raw import
import seedSql from "../scripts/seed-demo.sql?raw";

export const BASE = "https://shop.test";

/** scripts/seed-demo.sql চালায় (DemoSeeder) */
export async function seedDemo() {
  const statements = (seedSql as string)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
}

/** সব ডাটা মুছে নতুন করে নমুনা ডাটা বসায় */
export async function resetDb() {
  await env.DB.batch(
    ["order_items", "orders", "blacklist_entries", "sessions", "users", "products", "categories", "order_locks", "rate_limits"].map(
      (t) => env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
  await env.DB.prepare("DELETE FROM sqlite_sequence WHERE name IN ('orders','order_items')").run().catch(() => {});
  await env.DB.batch([
    env.DB.prepare("UPDATE settings SET value='' WHERE key IN ('fb_pixel_id','fb_capi_token','fb_test_event_code')"),
    env.DB.prepare("UPDATE settings SET value='01700000000' WHERE key='contact_phone'"),
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
    if ((init.method || "GET") === "POST" && !headers.has("origin")) headers.set("origin", BASE);
    const res = await SELF.fetch(BASE + path, { ...init, headers, redirect: "manual" });
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
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM orders").first<{ n: number }>();
  return r!.n;
}

export async function lastOrder() {
  return env.DB.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 1").first<Record<string, any>>();
}

import { hashPassword } from "../src/lib/auth";

/** টেস্টের জন্য অ্যাডমিন বানায় আর লগইন করা একটা ব্রাউজার ফেরত দেয় */
export async function adminBrowser(email = "admin@test.com", password = "pass12345") {
  const hash = await hashPassword(password, 1000);
  await env.DB.prepare("INSERT OR REPLACE INTO users (name,email,password_hash,is_admin) VALUES ('Admin',?,?,1)").bind(email, hash).run();
  const b = new Browser();
  const res = await b.post("/admin/login", { email, password });
  if (res.status !== 303) throw new Error("admin login failed: " + res.status);
  return b;
}

/** অ্যাডমিন হিসেবে অর্ডারের স্ট্যাটাস বদলায় */
export async function setStatus(adminB: Browser, orderId: number, status: string) {
  return adminB.post(`/admin/orders/${orderId}/status`, { status });
}
