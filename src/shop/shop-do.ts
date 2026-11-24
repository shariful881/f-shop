import { DurableObject } from "cloudflare:workers";
import { SqlDatabase } from "./sql-adapter";
import { customersCsv, ordersCsv, productsCsv } from "./lib/export";
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
import m0017 from "../../migrations/shop/0017_media.sql";
import m0018 from "../../migrations/shop/0018_fraud.sql";
import m0019 from "../../migrations/shop/0019_stock.sql";
import m0020 from "../../migrations/shop/0020_ads.sql";
import m0021 from "../../migrations/shop/0021_advance.sql";
import m0022 from "../../migrations/shop/0022_reviews_profit.sql";
import m0023 from "../../migrations/shop/0023_push_blog.sql";
import m0024 from "../../migrations/shop/0024_images_r2.sql";
import m0025 from "../../migrations/shop/0025_orders_created_idx.sql";
import m0026 from "../../migrations/shop/0026_password_resets.sql";
import m0027 from "../../migrations/shop/0027_order_courier_report.sql";
import { newOrderCount, recentActivity, type LiveEvent } from "./lib/live";
import { sessionUser } from "./lib/auth";
import { ADMIN_COOKIES } from "./lib/session-cookie";
import m0028 from "../../migrations/shop/0028_activity.sql";
import m0029 from "../../migrations/shop/0029_product_extra.sql";
import m0030 from "../../migrations/shop/0030_category_extra.sql";
import m0031 from "../../migrations/shop/0031_slug_redirects.sql";
import { MirrorImageStore, QuotaImageStore, r2Key, R2_CACHE, SqlImageStore, type ImageStore } from "./lib/images";
import { pushToShop } from "./lib/push";
import { mediaUsage } from "./lib/media";
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
  ["0017_media", m0017],
  ["0018_fraud", m0018],
  ["0019_stock", m0019],
  ["0020_ads", m0020],
  ["0021_advance", m0021],
  ["0022_reviews_profit", m0022],
  ["0023_push_blog", m0023],
  ["0024_images_r2", m0024],
  ["0025_orders_created_idx", m0025],
  ["0026_password_resets", m0026],
  ["0027_order_courier_report", m0027],
  ["0028_activity", m0028],
  ["0029_product_extra", m0029],
  ["0030_category_extra", m0030],
  ["0031_slug_redirects", m0031],
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
/** ব্যাকআপ থেকে ফেরানোর টেবিল — আগে যার উপর অন্যরা নির্ভর করে */
export const RESTORE_TABLES = ["categories", "products", "product_variants", "orders", "order_items", "coupons", "pages", "settings", "blacklist_entries", "my_templates", "sms_logs", "stock_moves", "ad_spend", "reviews", "incomplete_orders"];

/** অনুরোধের দোকান-অবস্থা থেকে ছবির জায়গার সীমা (না থাকলে সীমা নেই — যেমন ভেতরের কাজ) */
function quotaStore(plain: ImageStore, db: SqlDatabase, stateHeader: string | null) {
  let mb = 0;
  try { mb = Number(JSON.parse(decodeURIComponent(stateHeader || "")).storage_mb) || 0; } catch { mb = 0; }
  return mb > 0 ? new QuotaImageStore(plain, db, mb * 1024 * 1024) : plain;
}

export class ShopDO extends DurableObject<WorkerEnv> {
  readonly db: SqlDatabase;
  shopId: string | null = null;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.db = new SqlDatabase(ctx.storage);
    // ping-এর উত্তর DO না জাগিয়েই (hibernation থাকে)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
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

  /** ছবির জায়গা: R2 চালু থাকলে দোকানের ডাটাবেস + R2, নইলে শুধু ডাটাবেস */
  images(shopId = this.shopId): ImageStore {
    const bucket = this.env.IMG_BUCKET;
    if (!bucket || !shopId) return new SqlImageStore(this.db);
    // R2-তে না গেলে দোকানটা আবার Worker থেকে ছবি দেখাবে (নিজের কপি থেকে) — ছবি ভাঙবে না
    return new MirrorImageStore(this.db, bucket, shopId, async () => {
      await this.env.PLATFORM_DB.prepare("UPDATE shops SET images_r2 = 0 WHERE id = ? AND images_r2 = 1").bind(shopId).run();
    });
  }

  /** R2-তে এখনো না যাওয়া ছবি কপি করা (একবারে limit-টা)। remaining = আরও কতগুলো বাকি */
  async syncImagesToR2(shopId: string, limit = 100): Promise<{ copied: number; missing: number; remaining: number; total: number }> {
    await this.ensureInit(shopId, false);
    const bucket = this.env.IMG_BUCKET;
    if (!bucket) throw new Error("R2 নেই");
    const local = new SqlImageStore(this.db);
    const { results } = await this.db.prepare("SELECT key FROM images WHERE r2 = 0 AND key NOT LIKE 'support/%' ORDER BY key LIMIT ?").bind(limit).all<{ key: string }>();
    let copied = 0, missing = 0;
    for (const { key } of results) {
      const img = await local.get(key);
      if (!img) {
        // নিজের কপি নেই — R2-তে থাকলে ঠিক আছে, নইলে বাদ (ভাঙা ছবি)
        const there = await bucket.head(r2Key(shopId, key));
        await this.db.prepare("UPDATE images SET r2 = ? WHERE key = ?").bind(there ? 1 : 2, key).run();
        if (!there) missing++;
        continue;
      }
      await bucket.put(r2Key(shopId, key), img.body, { httpMetadata: { contentType: img.type, cacheControl: R2_CACHE } });
      await this.db.prepare("UPDATE images SET r2 = 1 WHERE key = ?").bind(key).run();
      copied++;
    }
    const left = await this.db.prepare("SELECT COUNT(*) n FROM images WHERE r2 = 0 AND key NOT LIKE 'support/%'").first<{ n: number }>();
    const all = await this.db.prepare("SELECT COUNT(*) n FROM images WHERE key NOT LIKE 'support/%'").first<{ n: number }>();
    return { copied, missing, remaining: left?.n ?? 0, total: all?.n ?? 0 };
  }

  /** R2-তে নিশ্চিত থাকা ছবির নিজের কপি মুছে জায়গা খালি করা (images-এর তথ্য থাকে, মিডিয়া লাইব্রেরি ঠিক থাকে) */
  async purgeLocalImages(shopId: string, limit = 200): Promise<{ purged: number; remaining: number }> {
    await this.ensureInit(shopId, false);
    const { results } = await this.db.prepare(
      "SELECT key FROM images WHERE r2 = 1 AND key NOT LIKE 'support/%' AND EXISTS (SELECT 1 FROM image_chunks c WHERE c.key = images.key) LIMIT ?",
    ).bind(limit).all<{ key: string }>();
    for (const { key } of results) await this.db.prepare("DELETE FROM image_chunks WHERE key = ?").bind(key).run();
    const left = await this.db.prepare(
      "SELECT COUNT(*) n FROM images WHERE r2 = 1 AND key NOT LIKE 'support/%' AND EXISTS (SELECT 1 FROM image_chunks c WHERE c.key = images.key)",
    ).first<{ n: number }>();
    return { purged: results.length, remaining: left?.n ?? 0 };
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
      await this.images().put(key, Uint8Array.from(atob(logo), (ch) => ch.charCodeAt(0)).buffer, { httpMetadata: { contentType: "image/png" } });
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

  /**
   * নিশের নমুনা পণ্য আর ব্যানারে ডেমোর ছবি — কপি নয়, সব দোকান এক জায়গার ছবি দেখায় (public/demo-img, key "demo/<file>")।
   * শুধু যেখানে ছবি নেই। দোকানের ছবির জায়গায় গোনা হয় না।
   */
  async useSharedNicheImages(shopId: string, niche: string): Promise<number> {
    await this.ensureInit(shopId, false);
    if (!/^[a-z]+$/.test(niche)) return 0;
    const p = await this.db.prepare(
      "UPDATE products SET image = 'demo/' || slug || '.jpg' WHERE slug GLOB ? AND (image IS NULL OR image = '')",
    ).bind(`${niche}-[0-9][0-9]`).run();
    let n = p.meta.changes ?? 0;
    for (const i of [1, 2, 3]) {
      const b = await this.db.prepare("UPDATE settings SET value = ? WHERE key = ? AND value = ''").bind(`demo/${niche}-banner-${i}.jpg`, `banner_${i}`).run();
      n += b.meta.changes ?? 0;
    }
    return n;
  }

  /**
   * আগে কপি হওয়া ডেমোর ছবি (p/<niche>-NN.jpg, bannerN/<niche>-banner-N.jpg) এক জায়গার ছবিতে বদলে কপি মুছে ফেলা।
   * ফেরত দেয় কত বাইট খালি হলো।
   */
  async adoptSharedDemoImages(shopId: string): Promise<number> {
    await this.ensureInit(shopId, false);
    const store = this.images(shopId);
    const isDemo = (f: string) => /^[a-z]+-(\d{2}|banner-[123])\.jpg$/.test(f);
    let freed = 0;
    const { results: prods } = await this.db.prepare("SELECT id, image FROM products WHERE image GLOB 'p/*.jpg'").all<{ id: number; image: string }>();
    const keys = new Set<string>();
    for (const r of prods) {
      const f = r.image.slice(2);
      if (!isDemo(f)) continue;
      await this.db.prepare("UPDATE products SET image = ? WHERE id = ?").bind(`demo/${f}`, r.id).run();
      keys.add(r.image);
    }
    const { results: bans } = await this.db.prepare("SELECT key, value FROM settings WHERE key IN ('banner_1', 'banner_2', 'banner_3') AND value GLOB 'banner[123]/*.jpg'").all<{ key: string; value: string }>();
    for (const b of bans) {
      const f = b.value.slice(b.value.indexOf("/") + 1);
      if (!isDemo(f)) continue;
      await this.db.prepare("UPDATE settings SET value = ? WHERE key = ?").bind(`demo/${f}`, b.key).run();
      keys.add(b.value);
    }
    for (const k of keys) {
      // অন্য কোথাও (ল্যান্ডিং, পেজ, গ্যালারি) ব্যবহার হলে রেখে দেওয়া
      const used = (await mediaUsage(this.db.asD1(), k)).length > 0;
      if (used) continue;
      const row = await this.db.prepare("SELECT size FROM images WHERE key = ?").bind(k).first<{ size: number }>();
      if (!row) continue;
      await store.delete(k);
      freed += row.size;
    }
    return freed;
  }

  /** ডেমো দোকানের পণ্য আর ব্যানারের ছবি (নতুন দোকানে কপির জন্য) */
  async exportNicheImages(): Promise<NicheImage[]> {
    const store = this.images();
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
    const store = this.images();
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

  /** সুপার অ্যাডমিনের জন্য Excel-এ খোলে এমন CSV (দোকানদার নিজে আর নামাতে পারে না) */
  async exportCsv(shopId: string, kind: "orders" | "products" | "customers"): Promise<string> {
    await this.ensureInit(shopId, false);
    const db = this.db as unknown as D1Database;
    return kind === "orders" ? ordersCsv(db) : kind === "products" ? productsCsv(db) : customersCsv(db);
  }

  /** সুপার অ্যাডমিনের পুরো ব্যাকআপ (JSON) — পাসওয়ার্ড, সেশন আর ছবির বাইট বাদে */
  async exportData(shopId: string) {
    await this.ensureInit(shopId, false);
    const tables = ["categories", "products", "product_variants", "orders", "order_items", "coupons", "pages", "settings", "blacklist_entries", "my_templates", "images", "sms_logs", "incomplete_orders", "stock_moves", "ad_spend", "reviews"];
    const out: Record<string, unknown[]> = {};
    for (const t of tables) {
      const r = await this.db.prepare(`SELECT * FROM ${t} LIMIT 50000`).all().catch(() => ({ results: [] }));
      out[t] = r.results;
    }
    out.users = (await this.db.prepare("SELECT id, email, name, role, is_admin, active, created_at FROM users").all().catch(() => ({ results: [] }))).results;
    return { shop_id: shopId, exported_at: new Date().toISOString(), tables: out };
  }

  /**
   * ব্যাকআপ (exportData-এর JSON) থেকে দোকানের ডাটা ফিরিয়ে আনা — সব এক transaction-এ, ভুল হলে কিছুই বদলায় না।
   * ইউজার/পাসওয়ার্ড আর ছবির ফাইল যেমন আছে তেমন থাকে (ব্যাকআপে এগুলো থাকে না)।
   */
  async importData(shopId: string, data: { shop_id?: string; tables?: Record<string, unknown> }) {
    await this.ensureInit(shopId, false);
    if (!data || data.shop_id !== shopId || typeof data.tables !== "object" || !data.tables) throw new Error("ব্যাকআপ ফাইলটা এই দোকানের নয়");
    const order = RESTORE_TABLES;
    const sql = this.ctx.storage.sql;
    const counts: Record<string, number> = {};
    this.ctx.storage.transactionSync(() => {
      sql.exec("PRAGMA defer_foreign_keys = ON");
      for (const t of [...order].reverse()) sql.exec(`DELETE FROM ${t}`);
      for (const t of order) {
        const rows = (data.tables as Record<string, unknown>)[t];
        if (!Array.isArray(rows)) { counts[t] = 0; continue; }
        const cols = new Set(sql.exec(`PRAGMA table_info(${t})`).toArray().map((c) => String(c.name)));
        let n = 0;
        for (const row of rows.slice(0, 50000)) {
          if (!row || typeof row !== "object") continue;
          const keys = Object.keys(row as object).filter((k) => cols.has(k));
          if (!keys.length) continue;
          const vals = keys.map((k) => { const v = (row as Record<string, unknown>)[k]; return v === undefined || (typeof v === "object" && v !== null) ? null : v as SqlStorageValue; });
          sql.exec(`INSERT INTO ${t} (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`, ...vals);
          n++;
        }
        counts[t] = n;
      }
    });
    return counts;
  }

  /** দোকানের সব ডাটা মুছে ফেলা (অচল বা বন্ধ দোকান) — ফেরানো যায় না */
  async purge(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.shopId = null;
  }

  /** দোকানের ফোনে নোটিফিকেশন (মূল সার্ভার থেকে — যেমন মোছার সতর্কবার্তা) */
  async pushNotice(msg: { title: string; body: string; url: string; tag?: string }): Promise<number> {
    if (!this.shopId) return 0;
    return pushToShop(this.db.asD1(), this.env.PLATFORM_DB, msg);
  }

  /** এই দোকানের ডাটাবেস কত বাইট (ছবিসহ) — ফ্রি প্ল্যানের সীমা নজরে রাখতে */
  storageBytes(): number {
    return this.ctx.storage.sql.databaseSize;
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

  /* ---------- লাইভ নোটিফিকেশন (WebSocket, hibernation — অর্ডার না এলে খরচ নেই) ---------- */

  private async liveConnect(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("websocket only", { status: 426 });
    // অন্য সাইট থেকে কেউ লগইন-কুকি দিয়ে যুক্ত হতে পারবে না
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== new URL(request.url).host) return new Response("forbidden", { status: 403 });
    const cookies = Object.fromEntries((request.headers.get("cookie") || "").split(/;\s*/).filter(Boolean).map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
    }));
    const db = this.db.asD1();
    const user = await sessionUser(db, cookies[ADMIN_COOKIES.host] || cookies[ADMIN_COOKIES.legacy]);
    if (!user) return new Response("login required", { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ uid: user.id });
    const last = await db.prepare("SELECT MAX(id) AS id FROM activity").first<{ id: number | null }>();
    server.send(JSON.stringify({ t: "hello", new_count: await newOrderCount(db), last_id: last?.id ?? 0 }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    let m: { t?: string; since?: number };
    try { m = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (m.t === "since") {
      // ইন্টারনেট ফিরলে বা বেল খুললে: বাদ পড়া/শেষ ঘটনাগুলো
      const uid = (ws.deserializeAttachment() as { uid?: number } | null)?.uid;
      const list = await recentActivity(this.db.asD1(), Math.max(0, Number(m.since) || 0), 30);
      ws.send(JSON.stringify({ t: "events", list: list.map((e) => ({ ...e, mine: e.by_id != null && e.by_id === uid })), new_count: await newOrderCount(this.db.asD1()) }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code); } catch { /* আগেই বন্ধ */ }
  }

  liveBroadcast(ev: LiveEvent) {
    for (const ws of this.ctx.getWebSockets()) {
      const uid = (ws.deserializeAttachment() as { uid?: number } | null)?.uid;
      try { ws.send(JSON.stringify({ t: "ev", ev: { ...ev, mine: ev.by_id != null && ev.by_id === uid } })); } catch { /* বন্ধ সংযোগ */ }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const shopId = request.headers.get("x-fshop-id");
    if (!shopId) return new Response("missing shop", { status: 400 });
    await this.ensureInit(shopId, request.headers.get("x-fshop-seed") === "1");

    // লাইভ নোটিফিকেশনের সংযোগ (অ্যাডমিন প্যানেল) — Hono-র বাইরে, সরাসরি এখানে
    if (new URL(request.url).pathname === "/admin/live") return this.liveConnect(request);

    const env = {
      LIVE: { emit: (ev: LiveEvent) => this.liveBroadcast(ev) },
      DB: this.db.asD1(),
      IMAGES: quotaStore(this.images(shopId), this.db, request.headers.get("x-fshop-state")),
      PLATFORM_DB: this.env.PLATFORM_DB,
      SUPPORT: this.env.SUPPORT,
      SHOP_ID: shopId,
      SHOP_SLUG: request.headers.get("x-fshop-slug") || "",
      PLATFORM_DOMAIN: this.env.PLATFORM_DOMAIN,
      CF_API_TOKEN: this.env.CF_API_TOKEN,
      CF_ACCOUNT_ID: this.env.CF_ACCOUNT_ID,
      PORKBUN_API_KEY: this.env.PORKBUN_API_KEY,
      PORKBUN_SECRET_KEY: this.env.PORKBUN_SECRET_KEY,
      PORKBUN_BASE: this.env.PORKBUN_BASE,
      DEV_MODE: this.env.DEV_MODE,
      WORKER_NAME: this.env.WORKER_NAME,
      AI: this.env.AI,
      EMAIL: this.env.EMAIL,
      IS_TEST: this.env.TEST_MIGRATIONS !== undefined,
    };
    const execCtx = {
      waitUntil: (p: Promise<unknown>) => this.ctx.waitUntil(p),
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext;
    return shopApp.fetch(request, env, execCtx);
  }
}
