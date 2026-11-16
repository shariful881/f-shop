/**
 * লগইন কুকির নাম `__Host-` দিয়ে (security/step-4)।
 * `__Host-` কুকি ব্রাউজার শুধু ঠিক সেই host-এর জন্য রাখে (Domain দেওয়া যায় না, Secure আর Path=/ লাগে) —
 * তাই অন্য কোনো দোকানের subdomain-এ চলা JavaScript (যেমন GTM) `.sellxbd.com`-এ কুকি বসিয়ে
 * এই কুকিকে ঢেকে বা বদলে দিতে পারে না। আমরা সবসময় আগে `__Host-` কুকি পড়ি।
 * লোকাল http-তে (Secure চলে না) পুরনো নাম থাকে। পুরনো নামের কুকি পেলে পরের রিকোয়েস্টে নতুন নামে সরানো হয়।
 */
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isHttps } from "./http";

type Ctx = Context<any>;
const WEEK = 60 * 60 * 24 * 7;

export type CookiePair = { host: string; legacy: string };
export const ADMIN_COOKIES: CookiePair = { host: "__Host-admin_session", legacy: "admin_session" };
export const SUPER_COOKIES: CookiePair = { host: "__Host-super_session", legacy: "super_session" };

/** আগে `__Host-`, না থাকলে পুরনো নাম (পুরনো লগইন যাতে হঠাৎ বের না হয়ে যায়) */
export function readSession(c: Ctx, p: CookiePair): { token: string | undefined; legacy: boolean } {
  const host = getCookie(c, p.host);
  if (host) return { token: host, legacy: false };
  const old = getCookie(c, p.legacy);
  return { token: old, legacy: !!old };
}

export function writeSession(c: Ctx, p: CookiePair, token: string) {
  if (isHttps(c)) {
    setCookie(c, p.host, token, { path: "/", httpOnly: true, sameSite: "Lax", secure: true, maxAge: WEEK });
    deleteCookie(c, p.legacy, { path: "/" });
  } else {
    setCookie(c, p.legacy, token, { path: "/", httpOnly: true, sameSite: "Lax", secure: false, maxAge: WEEK });
  }
}

export function clearSession(c: Ctx, p: CookiePair) {
  deleteCookie(c, p.legacy, { path: "/" });
  if (isHttps(c)) deleteCookie(c, p.host, { path: "/", secure: true });
}
