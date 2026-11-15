import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { canAccess, sessionUser } from "../lib/auth";

export const ADMIN_COOKIE = "admin_session";

/** /admin — শুধু লগইন করা is_admin ইউজার */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await sessionUser(c.env.DB, getCookie(c, ADMIN_COOKIE));
  if (!user) return c.redirect("/admin/login", 303);
  c.set("admin", user);
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  // রোল অনুযায়ী অনুমতি: /admin/<section>/...
  const section = c.req.path.split("/")[2] || "orders";
  if (!canAccess(user.role, section)) {
    return c.html(
      `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>অনুমতি নেই</title><link rel="stylesheet" href="/css/app.css?v=31"></head><body><main class="wrap narrow empty"><h1>এই পেজ দেখার অনুমতি আপনার নেই</h1><p><a class="btn btn-primary" href="/admin/orders">অর্ডারে ফিরে যান</a></p></main></body></html>`,
      403,
    );
  }
  await next();
};
