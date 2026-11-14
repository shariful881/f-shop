import { DurableObject } from "cloudflare:workers";
import { SqlDatabase } from "./sql-adapter";
import { shopApp } from "./app";
import type { WorkerEnv } from "../worker-env";
// প্রতিটা দোকানের ডাটাবেসের টেবিল (ক্রম অনুযায়ী)
import m0001 from "../../migrations/shop/0001_init.sql";
import seedDemoSql from "../../scripts/seed-demo.sql";

export const SHOP_MIGRATIONS: [string, string][] = [["0001_init", m0001]];

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
    };
    const execCtx = {
      waitUntil: (p: Promise<unknown>) => this.ctx.waitUntil(p),
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext;
    return shopApp.fetch(request, env, execCtx);
  }
}
