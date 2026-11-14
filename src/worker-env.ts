import type { ShopDO } from "./shop/shop-do";

/** মূল Worker-এর binding */
export type WorkerEnv = {
  PLATFORM_DB: D1Database;        // মূল ডাটাবেস: দোকানের তালিকা, ডোমেইন, বিলিং
  SHOP: DurableObjectNamespace<ShopDO>; // প্রতিটা দোকানের আলাদা ডাটাবেস
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
  PLATFORM_DOMAIN: string;        // যেমন ourdomain.com
  DEV_MODE?: string;              // "1" হলে ?shop=slug দিয়ে দোকান খোলা যায় (শুধু Codespaces/লোকাল)
};
