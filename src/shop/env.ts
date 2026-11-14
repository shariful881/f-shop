import type { Context } from "hono";
import type { ShopState } from "../platform/billing";

/** দোকানের ভিতরের binding — DB হলো এই দোকানের নিজস্ব ডাটাবেস */
export type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  PLATFORM_DB: D1Database;
  SHOP_ID: string;
  SHOP_SLUG: string;
};

export type Variables = {
  deviceId: string;
  fbp: string;
  fbc: string | null;
  settings: Record<string, string>;
  admin?: { id: number; email: string; name: string };
  shopState: ShopState;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
export type Ctx = Context<AppEnv>;

/** R2-তে এই দোকানের ছবির আসল key (প্রতিটা দোকানের ফোল্ডার আলাদা) */
export const imageStorageKey = (shopId: string, key: string) => `shops/${shopId}/${key}`;
