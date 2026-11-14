import { Hono } from "hono";
import type { AppEnv } from "./env";

const app = new Hono<AppEnv>();

app.get("/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM products").first<{ n: number }>();
  return c.json({ ok: true, products: row?.n ?? 0 });
});

export default app;
