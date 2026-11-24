import type { ShopDO } from "./shop/shop-do";

/** মূল Worker-এর binding */
export type WorkerEnv = {
  PLATFORM_DB: D1Database;        // মূল ডাটাবেস: দোকানের তালিকা, ডোমেইন, বিলিং
  SUPPORT: DurableObjectNamespace<import("./support-hub").SupportHub>;
  SHOP: DurableObjectNamespace<ShopDO>; // প্রতিটা দোকানের আলাদা ডাটাবেস
  ASSETS: Fetcher;
  AI?: Ai;                        // Cloudflare Workers AI (ফ্রি সীমা)
  IMG_BUCKET?: R2Bucket;          // দোকানের ছবি (R2) — চালু না থাকলে ছবি শুধু দোকানের ডাটাবেসে
  IMG_PUBLIC_URL?: string;
  /** Cloudflare Email Sending (send_email binding) — দোকানদারের ইমেইল যাচাই */
  EMAIL?: {
    send(m: { to: string | string[]; from: string | { email: string; name?: string }; subject: string; html?: string; text?: string }): Promise<{ messageId?: string }>;
  };        // R2-র পাবলিক ঠিকানা, যেমন https://img.sellxbd.com
  TEST_MIGRATIONS?: unknown;      // শুধু টেস্টে থাকে
  PLATFORM_DOMAIN: string;        // যেমন ourdomain.com
  DEV_MODE?: string;
  WORKER_NAME?: string;           // এই Worker-এর নাম (wrangler.jsonc-এর name)
  CF_ACCOUNT_ID?: string;         // নিজের ডোমেইন ফিচারের জন্য
  PORKBUN_API_KEY?: string;       // secret: ডোমেইন বিক্রি (pk1_… আসল, pk1_sb_… পরীক্ষা)
  PORKBUN_SECRET_KEY?: string;    // secret: sk1_…
  CF_API_TOKEN?: string;          // secret: Zone Edit + DNS Edit + Workers Routes Edit              // "1" হলে ?shop=slug দিয়ে দোকান খোলা যায় (শুধু Codespaces/লোকাল)
};
