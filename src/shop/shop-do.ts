import { DurableObject } from "cloudflare:workers";
import { SqlDatabase } from "./sql-adapter";
import { shopApp } from "./app";
import type { WorkerEnv } from "../worker-env";
// প্রতিটা দোকানের ডাটাবেসের টেবিল (ক্রম অনুযায়ী)
import m0001 from "../../migrations/shop/0001_init.sql";
import m0002 from "../../migrations/shop/0002_login_tokens.sql";
import m0003 from "../../migrations/shop/0003_staff_roles.sql";
import m0004 from "../../migrations/shop/0004_branding.sql";
import m0005 from "../../migrations/shop/0005_variants.sql";
import m0006 from "../../migrations/shop/0006_coupons.sql";
import m0007 from "../../migrations/shop/0007_landing_builder.sql";
import m0008 from "../../migrations/shop/0008_theme.sql";
import m0009 from "../../migrations/shop/0009_courier.sql";
import m0010 from "../../migrations/shop/0010_sms.sql";
import m0011 from "../../migrations/shop/0011_images.sql";
import m0012 from "../../migrations/shop/0012_store_settings.sql";
import m0013 from "../../migrations/shop/0013_my_templates.sql";
import m0014 from "../../migrations/shop/0014_pro_theme.sql";
import m0015 from "../../migrations/shop/0015_checkout_pages.sql";
import m0016 from "../../migrations/shop/0016_order_qty.sql";
import { SqlImageStore } from "./lib/images";
import seedDemoSql from "../../scripts/seed-demo.sql";
import { nicheByKey, nicheStatements } from "./lib/niches";
import { NICHE_LOGOS } from "./data/logos";

export const SHOP_MIGRATIONS: [string, string][] = [
  ["0001_init", m0001],
  ["0002_login_tokens", m0002],
  ["0003_staff_roles", m0003],
  ["0004_branding", m0004],
  ["0005_variants", m0005],
  ["0006_coupons", m0006],
  ["0007_landing_builder", m0007],
  ["0008_theme", m0008],
  ["0009_courier", m0009],
  ["0010_sms", m0010],
  ["0011_images", m0011],
  ["0012_store_settings", m0012],
  ["0013_my_templates", m0013],
  ["0014_pro_theme", m0014],
  ["0015_checkout_pages", m0015],
  ["0016_order_qty", m0016],
];

export type SetupInput = {
  shopId: string;
  shopName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  passwordHash: string;
  seedDemo: boolean;
  /** নিশ বাছলে: ক্যাটাগরি, থিম, রং, ডেলিভারি, পেজ (+ seedDemo হলে নমুনা পণ্য) */
  niche?: string;
};

/** ডেমো দোকান থেকে নতুন দোকানে কপি করার ছবি */
export type NicheImage = { key: string; type: string; data: ArrayBuffer; product?: string; setting?: string };

/** যেসব হেডার শুধু আমাদের Worker বসায় (বাইরে থেকে আসলে মুছে ফেলা হয়) */
export const INTERNAL_HEADERS = ["x-fshop-id", "x-fshop-slug", "x-fshop-seed", "x-fshop-state"];

/**
 * একটা দোকান = একটা Durable Object = দোকানের নিজস্ব আলাদা SQLite ডাটাবেস।
 * এক দোকানের কোড অন্য দোকানের ডাটাবেস দেখতে পারে না।
 */
export class ShopDO extends DurableObject<WorkerEnv> {
  readonly db: SqlDatabase;
  shopId: string | null = null;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.db = new SqlDatabase(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
      this.shopId = (await ctx.storage.get<string>("shop_id")) ?? null;
    });
  }

  /** নতুন migration থাকলে চালায় */
  private migrate() {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
    const done = new Set(sql.exec("SELECT name FROM _migrations").toArray().map((r) => r.name as string));
    for (const [name, body] of SHOP_MIGRATIONS) {
      if (done.has(name)) continue;
      this.ctx.storage.transactionSync(() => {
        sql.exec(body);
        sql.exec("INSERT INTO _migrations (name) VALUES (?)", name);
      });
    }
  }

  /** প্রথমবার: দোকানের আইডি মনে রাখা, দরকার হলে নমুনা ডাটা */
  async ensureInit(shopId: string, seed: boolean) {
    if (this.shopId === shopId) return;
    if (this.shopId && this.shopId !== shopId) throw new Error("shop id mismatch");
    this.shopId = shopId;
    await this.ctx.storage.put("shop_id", shopId);
    if (seed) await this.seedDemo();
  }

  /**
   * সাইনআপের সাথে সাথে নতুন দোকান সাজানো: মালিকের লগইন, দোকানের নাম, যোগাযোগ নম্বর।
   * ফেরত দেয় এককালীন লগইন টোকেন (৫ মিনিট) — দোকানের ঠিকানায় সরাসরি ড্যাশবোর্ডে ঢোকার জন্য।
   */
  async setupShop(input: SetupInput): Promise<string> {
    await this.ensureInit(input.shopId, false);
    const niche = nicheByKey(input.niche);
    if (niche) {
      await this.db.batch(nicheStatements(this.db, niche, { withProducts: input.seedDemo, phone: input.ownerPhone }) as never);
    } else if (input.seedDemo) {
      await this.seedDemo();
      await this.db.prepare("DELETE FROM users WHERE email = 'demo@fshop.test'").run();
    }
    await this.db.batch([
      this.db.prepare("INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, is_admin = 1")
        .bind(input.ownerName, input.ownerEmail, input.passwordHash),
      this.db.prepare("UPDATE settings SET value = ? WHERE key = 'site_name'").bind(input.shopName),
      this.db.prepare("UPDATE settings SET value = ? WHERE key = 'contact_phone'").bind(input.ownerPhone),
      this.db.prepare("UPDATE settings SET value = ? WHERE key = 'whatsapp' AND value = ''").bind(input.ownerPhone),
      // নতুন দোকান শুরু হয় প্রো স্টোর থিমে (নিশ বাছলে নিশের থিম)
      this.db.prepare("UPDATE settings SET value = ? WHERE key = 'theme'").bind(niche?.theme ?? "pro"),
    ]);
    const user = await this.db.prepare("SELECT id FROM users WHERE email = ?").bind(input.ownerEmail).first<{ id: number }>();
    return this.createLoginToken(user!.id);
  }

  /**
   * ডেমো দোকান সাজানো/আপডেট: নিশের সব পণ্য, SellxBD-এর সাপোর্ট নম্বর, ডেমো বার, অর্ডার বন্ধ।
   * আবার চালালে নতুন পণ্য/পেজ যোগ হয়, আগেরগুলো (আর আপলোড করা ছবি) থাকে।
   */
  async setupDemoShop(input: { shopId: string; niche: string; phone: string; ownerEmail: string; passwordHash: string; signupUrl: string }) {
    const n = nicheByKey(input.niche);
    if (!n) throw new Error("unknown niche");
    await this.ensureInit(input.shopId, false);
    const set = (k: string, v: string) =>
      this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v);
    await this.db.batch([
      ...(nicheStatements(this.db, n, { withProducts: true, phone: input.phone }) as never[]),
      set("site_name", n.name), set("contact_phone", input.phone), set("whatsapp", input.phone),
      set("store_address", "ঢাকা, বাংলাদেশ"), set("demo_mode", "1"), set("demo_niche", n.key), set("demo_signup_url", input.signupUrl),
      this.db.prepare("INSERT OR IGNORE INTO users (name, email, password_hash, is_admin) VALUES ('ডেমো অ্যাডমিন', ?, ?, 1)").bind(input.ownerEmail, input.passwordHash),
    ]);
    // লোগো (আগে না থাকলে)
    const logo = NICHE_LOGOS[n.key];
    const cur = await this.db.prepare("SELECT value FROM settings WHERE key = 'logo'").first<{ value: string }>();
    if (logo && !cur?.value) {
      const key = `logo/${n.key}.png`;
      await new SqlImageStore(this.db).put(key, Uint8Array.from(atob(logo), (ch) => ch.charCodeAt(0)).buffer, { httpMetadata: { contentType: "image/png" } });
      await set("logo", key).run();
    }
    const p = await this.db.prepare("SELECT COUNT(*) n, COALESCE(SUM(image IS NOT NULL AND image != ''), 0) img FROM products").first<{ n: number; img: number }>();
    return { products: p?.n ?? 0, withImage: p?.img ?? 0 };
  }

  /** কোন নিশ-পণ্য আর ব্যানারে এখনো ছবি নেই (ডেমোতে ছবি বসানোর জন্য) */
  async missingNicheImages(): Promise<{ products: string[]; banners: string[] }> {
    const p = await this.db.prepare("SELECT slug FROM products WHERE image IS NULL OR image = ''").all<{ slug: string }>();
    const b = await this.db.prepare("SELECT key FROM settings WHERE key IN ('banner_1', 'banner_2', 'banner_3') AND value = ''").all<{ key: string }>();
    return { products: p.results.map((r) => r.slug), banners: b.results.map((r) => r.key) };
  }

  /** ডেমো দোকানের পণ্য আর ব্যানারের ছবি (নতুন দোকানে কপির জন্য) */
  async exportNicheImages(): Promise<NicheImage[]> {
    const store = new SqlImageStore(this.db);
    const { results } = await this.db.prepare("SELECT slug, image FROM products WHERE image IS NOT NULL AND image != ''").all<{ slug: string; image: string }>();
    const banners = await this.db.prepare("SELECT key, value FROM settings WHERE key IN ('banner_1', 'banner_2', 'banner_3') AND value != ''").all<{ key: string; value: string }>();
    const out: NicheImage[] = [];
    for (const [k, extra] of [...results.map((r) => [r.image, { product: r.slug }] as const), ...banners.results.map((b) => [b.value, { setting: b.key }] as const)]) {
      const img = await store.get(k);
      if (img) out.push({ key: k, type: img.type, data: img.body.slice().buffer as ArrayBuffer, ...extra });
    }
    return out;
  }

  /** নতুন দোকানে ডেমোর ছবি বসানো — শুধু যে পণ্যের slug মেলে আর যার ছবি নেই */
  async importNicheImages(shopId: string, images: NicheImage[]) {
    await this.ensureInit(shopId, false);
    const store = new SqlImageStore(this.db);
    for (const im of images) {
      if (im.product) {
        const p = await this.db.prepare("SELECT id FROM products WHERE slug = ? AND (image IS NULL OR image = '')").bind(im.product).first<{ id: number }>();
        if (!p) continue;
        await store.put(im.key, im.data, { httpMetadata: { contentType: im.type } });
        await this.db.prepare("UPDATE products SET image = ? WHERE id = ?").bind(im.key, p.id).run();
      } else if (im.setting) {
        await store.put(im.key, im.data, { httpMetadata: { contentType: im.type } });
        await this.db.prepare("UPDATE settings SET value = ? WHERE key = ? AND value = ''").bind(im.key, im.setting).run();
      }
    }
  }

  /** সুপার অ্যাডমিনের জন্য দোকানের সংক্ষিপ্ত হিসাব (পণ্য, অর্ডার, বিক্রি) */
  async quickStats(shopId: string) {
    await this.ensureInit(shopId, false);
    const p = await this.db.prepare("SELECT COUNT(*) total, COALESCE(SUM(is_active), 0) active FROM products").first<{ total: number; active: number }>();
    const o = await this.db.prepare(
      `SELECT COUNT(*) total,
         COALESCE(SUM(status = 'new'), 0) new_orders, COALESCE(SUM(status = 'confirmed'), 0) confirmed, COALESCE(SUM(status = 'shipped'), 0) shipped,
         COALESCE(SUM(status IN ('cancelled', 'fake')), 0) cancelled,
         COALESCE(SUM(CASE WHEN status IN ('confirmed', 'shipped') THEN total ELSE 0 END), 0) sales,
         COALESCE(SUM(created_at >= datetime('now', '-1 day')), 0) last24h
       FROM orders`,
    ).first<Record<string, number>>();
    const recent = await this.db.prepare("SELECT order_no, name, total, status, created_at FROM orders ORDER BY id DESC LIMIT 5")
      .all<{ order_no: string; name: string; total: number; status: string; created_at: string }>();
    const staff = await this.db.prepare("SELECT COUNT(*) n FROM users WHERE is_admin = 1 AND active = 1").first<{ n: number }>();
    return { products: p!, orders: o!, recent: recent.results, users: staff?.n ?? 0 };
  }

  /** সুপার অ্যাডমিনের সাপোর্ট লগইন: দোকানের মালিকের জন্য ৫ মিনিটের এককালীন টোকেন */
  async ownerLoginToken(shopId: string): Promise<string | null> {
    await this.ensureInit(shopId, false);
    const owner = await this.db.prepare(
      "SELECT id FROM users WHERE is_admin = 1 AND active = 1 ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, id LIMIT 1",
    ).first<{ id: number }>();
    return owner ? this.createLoginToken(owner.id) : null;
  }

  async createLoginToken(userId: number): Promise<string> {
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    await this.db.prepare("INSERT INTO login_tokens (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+5 minutes'))").bind(hash, userId).run();
    return token;
  }

  async seedDemo() {
    const statements = seedDemoSql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    await this.db.batch(statements.map((s) => this.db.prepare(s)));
  }

  async fetch(request: Request): Promise<Response> {
    const shopId = request.headers.get("x-fshop-id");
    if (!shopId) return new Response("missing shop", { status: 400 });
    await this.ensureInit(shopId, request.headers.get("x-fshop-seed") === "1");

    const env = {
      DB: this.db.asD1(),
      IMAGES: new SqlImageStore(this.db),
      PLATFORM_DB: this.env.PLATFORM_DB,
      SHOP_ID: shopId,
      SHOP_SLUG: request.headers.get("x-fshop-slug") || "",
      PLATFORM_DOMAIN: this.env.PLATFORM_DOMAIN,
      CF_API_TOKEN: this.env.CF_API_TOKEN,
      CF_ACCOUNT_ID: this.env.CF_ACCOUNT_ID,
      WORKER_NAME: this.env.WORKER_NAME,
    };
    const execCtx = {
      waitUntil: (p: Promise<unknown>) => this.ctx.waitUntil(p),
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext;
    return shopApp.fetch(request, env, execCtx);
  }
}
