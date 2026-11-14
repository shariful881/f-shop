import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { isHttps } from "../lib/http";

const NINETY_DAYS = 60 * 60 * 24 * 90;

/**
 * Facebook কুকি (এনক্রিপ্ট নয়, যাতে Pixel নিজেও পড়তে পারে):
 * - _fbp না থাকলে সার্ভার নিজে বানায়: fb.1.<সময় ms>.<র‍্যান্ডম সংখ্যা>
 * - URL-এ fbclid থাকলে _fbc বানায়: fb.1.<সময় ms>.<fbclid>
 */
export const fbCookies: MiddlewareHandler<AppEnv> = async (c, next) => {
  const secure = isHttps(c);
  const opts = { path: "/", maxAge: NINETY_DAYS, sameSite: "Lax" as const, secure, httpOnly: false };

  let fbp = getCookie(c, "_fbp");
  if (!fbp || !/^fb\.\d\.\d+\.\d+$/.test(fbp)) {
    const rand = crypto.getRandomValues(new Uint32Array(1))[0]! % 9_000_000_000 + 1_000_000_000;
    fbp = `fb.1.${Date.now()}.${rand}`;
    setCookie(c, "_fbp", fbp, opts);
  }

  let fbc = getCookie(c, "_fbc") || null;
  const fbclid = new URL(c.req.url).searchParams.get("fbclid");
  if (fbclid && /^[\w-]{1,500}$/.test(fbclid) && !(fbc && fbc.endsWith("." + fbclid))) {
    fbc = `fb.1.${Date.now()}.${fbclid}`;
    setCookie(c, "_fbc", fbc, opts);
  }

  c.set("fbp", fbp);
  c.set("fbc", fbc);
  await next();
};
