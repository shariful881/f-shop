import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { isHttps } from "../lib/http";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/**
 * নিয়ম ৫: ডিভাইস চেনা।
 * প্রথম ভিজিটে UUID বানিয়ে `did` কুকিতে রাখে (২ বছর, এনক্রিপ্ট নয়)।
 * সাথে `did_new` কুকি দেয়, যাতে ব্রাউজারের device.js জানে কুকিটা নতুন বানানো —
 * localStorage-এ পুরনো আইডি থাকলে device.js সেটা কুকিতে ফিরিয়ে আনে।
 */
export const device: MiddlewareHandler<AppEnv> = async (c, next) => {
  let did = getCookie(c, "did");
  if (!isUuid(did)) {
    did = crypto.randomUUID();
    const secure = isHttps(c);
    // Hono ৪০০ দিনের বেশি Max-Age দিতে দেয় না, তাই হেডার সরাসরি লেখা (২ বছর = 63072000 সেকেন্ড)।
    // নোট: Chrome নিজে থেকে কুকির মেয়াদ সর্বোচ্চ ৪০০ দিনে সীমিত করে; device.js প্রতি ভিজিটে মেয়াদ নবায়ন করে।
    c.header("Set-Cookie", `did=${did}; Max-Age=63072000; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`, { append: true });
    setCookie(c, "did_new", "1", { path: "/", maxAge: 300, sameSite: "Lax", secure, httpOnly: false });
  }
  c.set("deviceId", did.toLowerCase());
  await next();
};
