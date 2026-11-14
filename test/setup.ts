import { applyD1Migrations, env } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      PLATFORM_DB: D1Database;
      SHOP: DurableObjectNamespace<import("../src/shop/shop-do").ShopDO>;
      PLATFORM_DOMAIN: string;
      DEV_MODE?: string;
      CF_API_TOKEN?: string;
      CF_ACCOUNT_ID?: string;
      WORKER_NAME?: string;
      TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    }
  }
}

await applyD1Migrations(env.PLATFORM_DB, env.TEST_MIGRATIONS);
