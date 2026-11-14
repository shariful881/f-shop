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
import seedDemoSql from "../../scripts/seed-demo.sql";

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
];

export type SetupInput = {
  shopId: string;
  shopName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  passwordHash: string;
  seedDemo: boolean;
};

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
    if (input.seedDemo) {
      await this.seedDemo();
      await this.db.prepare("DELETE FROM users WHERE email = 'demo@fshop.test'").run();
    }
    await this.db.batch([
      this.db.prepare("INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, is_admin = 1")
        .bind(input.ownerName, input.ownerEmail, input.passwordHash),
      this.db.prepare("UPDATE settings SET value = ? WHERE key = 'site_name'").bind(input.shopName),
      this.db.prepare("UPDATE settings SET value = ? WHERE key = 'contact_phone'").bind(input.ownerPhone),
    ]);
    const user = await this.db.prepare("SELECT id FROM users WHERE email = ?").bind(input.ownerEmail).first<{ id: number }>();
    return this.createLoginToken(user!.id);
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
      IMAGES: this.env.IMAGES,
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
