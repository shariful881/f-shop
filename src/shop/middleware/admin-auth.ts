import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { sessionUser } from "../lib/auth";

export const ADMIN_COOKIE = "admin_session";

/** /admin — শুধু লগইন করা is_admin ইউজার */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await sessionUser(c.env.DB, getCookie(c, ADMIN_COOKIE));
  if (!user) return c.redirect("/admin/login", 303);
  c.set("admin", user);
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  await next();
};
