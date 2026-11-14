import type { Context } from "hono";
import type { ShopState } from "../platform/billing";

/** দোকানের ভিতরের binding — DB হলো এই দোকানের নিজস্ব ডাটাবেস */
export type Bindings = {
  DB: D1Database;
  IMAGES: import("./lib/images").ImageStore;
  PLATFORM_DB: D1Database;
  SUPPORT: DurableObjectNamespace<import("../support-hub").SupportHub>;
  SHOP_ID: string;
  SHOP_SLUG: string;
  PLATFORM_DOMAIN: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  WORKER_NAME?: string;
};

export type Variables = {
  deviceId: string;
  fbp: string;
  fbc: string | null;
  settings: Record<string, string>;
  admin?: { id: number; email: string; name: string; role: import("./lib/auth").Role };
  shopState: ShopState;
  /** প্রো থিমের ক্যাটাগরি মেনু */
  navCats?: { id: number; name: string }[];
  /** নিজের পেজ (মেনুতে) */
  navPages?: { title: string; slug: string }[];
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
export type Ctx = Context<AppEnv>;

/** এই দোকানের ছবির key (প্রতিটা দোকানের ফোল্ডার আলাদা) */
export const imageStorageKey = (shopId: string, key: string) => `shops/${shopId}/${key}`;
