import type { WorkerEnv } from "./worker-env";
import { clearShopCache, resolveHost, type ShopRow } from "./platform/resolve";
import { cfFromEnv, checkPendingDomains } from "./platform/domains";
import { computeState, endTrial, platformSettings, runDailyBilling, trialExpired } from "./platform/billing";
import { platformApp, unknownHostPage } from "./platform/app";
import { INTERNAL_HEADERS } from "./shop/shop-do";

export { ShopDO } from "./shop/shop-do";

/**
 * সব রিকোয়েস্ট প্রথমে এখানে আসে। ডোমেইন দেখে ঠিক করে:
 * প্ল্যাটফর্ম (সাইনআপ/সুপার অ্যাডমিন) নাকি কোনো দোকান — দোকান হলে সেই দোকানের নিজস্ব Durable Object-এ পাঠায়।
 */
export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // লোকাল/Codespaces: ?shop=slug দিয়ে যেকোনো দোকান খোলা (লাইভে বন্ধ)
    if (env.DEV_MODE === "1" && url.searchParams.has("shop")) {
      const slug = (url.searchParams.get("shop") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
      url.searchParams.delete("shop");
      const headers = new Headers({ location: url.pathname + url.search });
      headers.append("set-cookie", slug ? `dev_shop=${slug}; Path=/; SameSite=Lax` : "dev_shop=; Path=/; Max-Age=0");
      return new Response(null, { status: 302, headers });
    }

    let host = url.hostname;
    if (env.DEV_MODE === "1") {
      const devShop = /(?:^|;\s*)dev_shop=([a-z0-9-]+)/.exec(request.headers.get("cookie") || "")?.[1];
      // dev_shop কুকি থাকলে সেই দোকান, না থাকলে localhost/Codespaces-এর ঠিকানায় প্ল্যাটফর্ম
      if (devShop) host = `${devShop}.${env.PLATFORM_DOMAIN}`;
      else if (/^(localhost|127\.0\.0\.1)$|\.app\.github\.dev$/.test(host)) host = env.PLATFORM_DOMAIN;
    }

    const target = await resolveHost(env, host);
    if (target.kind === "platform") return platformApp.fetch(request, env, ctx);
    if (target.kind === "unknown") return unknownHostPage();

    let shop = target.shop;

    // ট্রায়ালের সময় শেষ হলে এখনই চালু করা (দৈনিক cron-এর অপেক্ষা না করে)
    if (trialExpired(shop)) {
      await endTrial(env.PLATFORM_DB, shop.id, await platformSettings(env.PLATFORM_DB));
      clearShopCache();
      const again = await resolveHost(env, host);
      if (again.kind === "shop") shop = again.shop;
    }

    // পণ্যের ছবি: আগে Cloudflare-এর edge cache, না পেলে দোকানের ডাটাবেস থেকে এনে cache-এ রাখা
    if (url.pathname.startsWith("/img/") && request.method === "GET") {
      return serveImage(env, shop, request, ctx);
    }

    return forwardToShop(env, shop, request);
  },

  /** প্রতিদিন একবার: ট্রায়াল শেষ, মাসিক চার্জ */
  async scheduled(event: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
    if (event.cron === "17 0 * * *") {
      ctx.waitUntil(runDailyBilling(env.PLATFORM_DB).then((r) => console.log("daily billing", r)));
    } else {
      ctx.waitUntil(checkPendingDomains(env.PLATFORM_DB, cfFromEnv(env)).then((n) => console.log("domains activated", n)));
    }
  },
} satisfies ExportedHandler<WorkerEnv>;

export async function forwardToShop(env: WorkerEnv, shop: ShopRow, request: Request) {
  const headers = new Headers(request.headers);
  for (const h of INTERNAL_HEADERS) headers.delete(h); // বাইরে থেকে কেউ এগুলো পাঠাতে পারবে না
  headers.set("x-fshop-id", shop.id);
  headers.set("x-fshop-slug", shop.slug);
  if (shop.seed_demo) headers.set("x-fshop-seed", "1");
  // বিলিং অবস্থা: দোকান এখন অর্ডার নিতে পারবে কি না (শুধু আমাদের Worker বসায়)
  headers.set("x-fshop-state", encodeURIComponent(JSON.stringify(computeState(shop, await platformSettings(env.PLATFORM_DB)))));
  const stub = env.SHOP.getByName(shop.id);
  return stub.fetch(new Request(request, { headers }));
}

async function serveImage(env: WorkerEnv, shop: ShopRow, request: Request, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const hit = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined;
  if (hit) return hit;
  const res = await forwardToShop(env, shop, new Request(cacheKey.url, { method: "GET", headers: { "x-forwarded-host": url.host } }));
  if (res.ok && cache) ctx.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
