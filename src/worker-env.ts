import type { ShopDO } from "./shop/shop-do";

/** মূল Worker-এর binding */
export type WorkerEnv = {
  PLATFORM_DB: D1Database;        // মূল ডাটাবেস: দোকানের তালিকা, ডোমেইন, বিলিং
  SHOP: DurableObjectNamespace<ShopDO>; // প্রতিটা দোকানের আলাদা ডাটাবেস
  ASSETS: Fetcher;
  PLATFORM_DOMAIN: string;        // যেমন ourdomain.com
  DEV_MODE?: string;
  WORKER_NAME?: string;           // এই Worker-এর নাম (wrangler.jsonc-এর name)
  CF_ACCOUNT_ID?: string;         // নিজের ডোমেইন ফিচারের জন্য
  CF_API_TOKEN?: string;          // secret: Zone Edit + DNS Edit + Workers Routes Edit              // "1" হলে ?shop=slug দিয়ে দোকান খোলা যায় (শুধু Codespaces/লোকাল)
};
