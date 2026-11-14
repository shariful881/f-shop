import type { Context } from "hono";

export type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
};

export type Variables = {
  deviceId: string;
  fbp: string;
  fbc: string | null;
  settings: Record<string, string>;
  admin?: { id: number; email: string; name: string };
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
export type Ctx = Context<AppEnv>;
