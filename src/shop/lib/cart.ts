import { getCookie, setCookie } from "hono/cookie";
import type { Ctx } from "../env";
import { isHttps } from "./http";

/**
 * কার্ট কুকিতে থাকে: শুধু পণ্যের আইডি, কমা দিয়ে আলাদা (যেমন "3,1")।
 * নিয়ম: একটা পণ্য সর্বোচ্চ ১টা — কোয়ান্টিটি বলে কিছু নেই।
 */
const MAX_ITEMS = 30;

/** যেকোনো তালিকা থেকে বৈধ, ডুপ্লিকেট-ছাড়া আইডি বের করে */
export function uniqueIds(values: unknown[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = parseInt(String(v), 10);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function readCart(c: Ctx): number[] {
  return uniqueIds((getCookie(c, "cart") || "").split(","));
}

export function writeCart(c: Ctx, ids: number[]) {
  setCookie(c, "cart", uniqueIds(ids).join(","), {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "Lax",
    secure: isHttps(c),
    httpOnly: false,
  });
}

/** কার্টে যোগ: আগেই থাকলে false */
export function addToCart(c: Ctx, productId: number): boolean {
  const ids = readCart(c);
  if (ids.includes(productId)) return false;
  writeCart(c, [...ids, productId]);
  return true;
}

export function removeFromCart(c: Ctx, productId: number) {
  writeCart(c, readCart(c).filter((id) => id !== productId));
}

export function clearCart(c: Ctx) {
  writeCart(c, []);
}
