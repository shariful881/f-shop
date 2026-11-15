import type { WorkerEnv } from "./worker-env";
import { clearShopCache, resolveHost, type ShopRow } from "./platform/resolve";
import { cfFromEnv, checkPendingDomains } from "./platform/domains";
import { computeState, endTrial, platformSettings, runDailyBilling, trialExpired } from "./platform/billing";
import { platformApp, unknownHostPage } from "./platform/app";
import { INTERNAL_HEADERS } from "./shop/shop-do";
import { refreshShopStorage } from "./platform/usage";
import { r2Cron } from "./platform/r2";
import { runShopCleanup } from "./platform/cleanup";

export { ShopDO } from "./shop/shop-do";
export { SupportHub } from "./support-hub";

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

    let res = await forwardToShop(env, shop, request);
    // দোকান বললে (যেমন যাচাই শেষ) দোকানের তথ্যের cache মুছে দেওয়া — নতুন অবস্থা সাথে সাথে
    if (res.headers.has("x-fshop-clear-cache")) {
      clearShopCache();
      res = new Response(res.body, res);
      res.headers.delete("x-fshop-clear-cache");
    }
    return withR2Images(env, shop, request, res);
  },

  /** প্রতিদিন একবার: ট্রায়াল শেষ, মাসিক চার্জ */
  async scheduled(event: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
    if (event.cron === "17 0 * * *") {
      ctx.waitUntil(runDailyBilling(env.PLATFORM_DB).then((r) => console.log("daily billing", r)).then(() => markCron(env, "cron_daily_at")));
    } else {
      ctx.waitUntil(checkPendingDomains(env.PLATFORM_DB, cfFromEnv(env)).then((n) => console.log("domains activated", n)).then(() => markCron(env, "cron_domains_at")));
      ctx.waitUntil(refreshShopStorage(env).then((n) => console.log("storage checked", n)).catch((e) => console.error("storage refresh", e)));
      ctx.waitUntil(r2Cron(env).catch((e) => console.error("r2 cron", e)));
      ctx.waitUntil(runShopCleanup(env).then((r) => console.log("shop cleanup", r)).catch((e) => console.error("shop cleanup", e)));
    }
  },
} satisfies ExportedHandler<WorkerEnv>;

/** সুপার অ্যাডমিনের "সিস্টেম" কার্ডের জন্য — cron শেষ কবে চলেছে */
async function markCron(env: WorkerEnv, key: string) {
  await env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key).run();
}

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

/** এই দোকানের ছবি R2-র পাবলিক ঠিকানা থেকে দেখানো যায় কিনা (সব ছবি কপি হয়ে যাচাই হলে) */
export const r2Base = (env: WorkerEnv, shop: Pick<ShopRow, "id" | "images_r2">) =>
  env.IMG_BUCKET && env.IMG_PUBLIC_URL && (shop.images_r2 ?? 0) >= 1 ? `${env.IMG_PUBLIC_URL.replace(/\/+$/, "")}/shops/${shop.id}/` : null;

/** /img/… (placeholder আর সাপোর্টের ছবি বাদে) — আগে উদ্ধৃতি, বন্ধনী, ফাঁকা, কমা বা = থাকলে */
const IMG_RE = /(["'(\s,=])\/img\/(?!placeholder\.svg|support\/|home\/|demo\/)/g;

/**
 * দোকানের পাবলিক পেজের HTML-এ ছবির ঠিকানা /img/… → https://img.<domain>/shops/<id>/…
 * তাহলে ছবিতে Worker চলে না (দিনের ১,০০,০০০ রিকোয়েস্টে গোনা হয় না)। প্যানেল (/admin) আগের মতো।
 */
export async function withR2Images(env: WorkerEnv, shop: ShopRow, request: Request, res: Response): Promise<Response> {
  const base = r2Base(env, shop);
  if (!base || request.method !== "GET" || res.status !== 200) return res;
  if (new URL(request.url).pathname.startsWith("/admin")) return res;
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  const html = (await res.text()).replace(IMG_RE, `$1${base}`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}

async function serveImage(env: WorkerEnv, shop: ShopRow, request: Request, ctx: ExecutionContext) {
  const url = new URL(request.url);
  // ডেমোর ছবি সব দোকানে এক জায়গা থেকে (সাইটের নিজের ফাইল)
  if (url.pathname.startsWith("/img/demo/")) return Response.redirect(`${url.origin}/demo-img/${url.pathname.slice(10)}`, 301);
  // R2-তে থাকলে সেখানে পাঠানো (পুরনো লিংক, ফিড, প্যানেলের JS) — দোকানের Durable Object জাগাতে হয় না
  const base = r2Base(env, shop);
  const key = url.pathname.slice(5);
  if (base && /^[a-z0-9/_.-]+$/i.test(key) && !key.includes("..") && !key.startsWith("support/")) {
    return new Response(null, { status: 301, headers: { location: base + key, "Cache-Control": "public, max-age=86400" } });
  }
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const hit = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined;
  if (hit) return hit;
  const res = await forwardToShop(env, shop, new Request(cacheKey.url, { method: "GET", headers: { "x-forwarded-host": url.host } }));
  if (res.ok && cache) ctx.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
