import { Hono } from "hono";
import type { AppEnv } from "./env";
import { withSettings, sameOriginPost, securityHeaders } from "./middleware/base";
import { shop, notFound } from "./routes/shop";
import { device } from "./middleware/device";
import { admin } from "./routes/admin";

const app = new Hono<AppEnv>();

app.get("/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM products").first<{ n: number }>();
  return c.json({ ok: true, products: row?.n ?? 0 });
});

app.use("*", securityHeaders, withSettings, sameOriginPost, device);

app.route("/admin", admin);
app.route("/", shop);

app.notFound((c) => notFound(c));

app.onError((err, c) => {
  console.error(err);
  return c.text("দুঃখিত, একটা সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।", 500);
});

export default app;
