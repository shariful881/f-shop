import { getCookie, setCookie } from "hono/cookie";
import type { Ctx } from "../env";
import { isHttps } from "./http";
import type { CartEntry } from "./products";

/**
 * কার্ট কুকিতে থাকে: "পণ্যআইডি" বা "পণ্যআইডি:ভ্যারিয়েন্টআইডি", কমা দিয়ে আলাদা (যেমন "3,1:7")।
 * নিয়ম: একটা পণ্য সর্বোচ্চ ১টা (যেকোনো একটা ভ্যারিয়েন্ট) — কোয়ান্টিটি বলে কিছু নেই।
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

/** কুকি থেকে কার্টের লাইন — একই পণ্য একবারই (প্রথমটা থাকে) */
export function parseCart(raw: string): CartEntry[] {
  const out: CartEntry[] = [];
  for (const part of raw.split(",")) {
    const [p, v] = part.split(":");
    const productId = parseInt(p ?? "", 10);
    if (!(Number.isInteger(productId) && productId > 0)) continue;
    if (out.some((e) => e.productId === productId)) continue;
    const variantId = v ? parseInt(v, 10) : NaN;
    out.push({ productId, variantId: Number.isInteger(variantId) && variantId > 0 ? variantId : null });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function readCartEntries(c: Ctx): CartEntry[] {
  return parseCart(getCookie(c, "cart") || "");
}

/** শুধু পণ্যের আইডি (গণনার জন্য) */
export function readCart(c: Ctx): number[] {
  return readCartEntries(c).map((e) => e.productId);
}

export function writeCart(c: Ctx, entries: CartEntry[]) {
  const value = parseCart(entries.map((e) => (e.variantId ? `${e.productId}:${e.variantId}` : String(e.productId))).join(","))
    .map((e) => (e.variantId ? `${e.productId}:${e.variantId}` : String(e.productId)))
    .join(",");
  setCookie(c, "cart", value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "Lax",
    secure: isHttps(c),
    httpOnly: false,
  });
}

/** কার্টে যোগ: পণ্যটা (যেকোনো ভ্যারিয়েন্টে) আগেই থাকলে false */
export function addToCart(c: Ctx, productId: number, variantId: number | null = null): boolean {
  const entries = readCartEntries(c);
  if (entries.some((e) => e.productId === productId)) return false;
  writeCart(c, [...entries, { productId, variantId }]);
  return true;
}

export function removeFromCart(c: Ctx, productId: number) {
  writeCart(c, readCartEntries(c).filter((e) => e.productId !== productId));
}

export function clearCart(c: Ctx) {
  writeCart(c, []);
}

/** "এখনই কিনুন": পণ্যটা কার্টে রাখে (আগে থাকলে বাছাই করা ভ্যারিয়েন্ট দিয়ে বদলায়) */
export function upsertCart(c: Ctx, productId: number, variantId: number | null = null) {
  const entries = readCartEntries(c).filter((e) => e.productId !== productId);
  writeCart(c, [...entries, { productId, variantId }]);
}
