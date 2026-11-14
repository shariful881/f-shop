import { getCookie, setCookie } from "hono/cookie";
import type { Ctx } from "../env";
import { isHttps } from "./http";
import type { CartEntry } from "./products";

/**
 * কার্ট কুকিতে থাকে: "পণ্যআইডি[:ভ্যারিয়েন্টআইডি][*পরিমাণ]", কমা দিয়ে আলাদা (যেমন "3*2,1:7")।
 * নিয়ম: একটা পণ্যের এক লাইন (যেকোনো একটা ভ্যারিয়েন্ট), পরিমাণ ১ থেকে দোকানের সর্বোচ্চ সীমা পর্যন্ত।
 */
const MAX_ITEMS = 30;
/** একটা পণ্য একবারে সর্বোচ্চ কয়টা (দোকানের সেটিং, ১–৫০) */
export const maxQty = (s: Record<string, string | undefined>) => Math.min(50, Math.max(1, parseInt(s.max_qty || "5", 10) || 5));
const clampQty = (q: number, max = 50) => Math.min(max, Math.max(1, Number.isInteger(q) ? q : 1));

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
    const [main, q] = part.split("*");
    const [p, v] = (main ?? "").split(":");
    const productId = parseInt(p ?? "", 10);
    if (!(Number.isInteger(productId) && productId > 0)) continue;
    if (out.some((e) => e.productId === productId)) continue;
    const variantId = v ? parseInt(v, 10) : NaN;
    out.push({ productId, variantId: Number.isInteger(variantId) && variantId > 0 ? variantId : null, qty: clampQty(parseInt(q ?? "1", 10)) });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function readCartEntries(c: Ctx): CartEntry[] {
  return parseCart(getCookie(c, "cart") || "");
}

/** কার্টের প্রতিটা পণ্যের আইডি, পরিমাণ অনুযায়ী (length = মোট পণ্যের সংখ্যা) */
export function readCart(c: Ctx): number[] {
  return readCartEntries(c).flatMap((e) => Array(e.qty ?? 1).fill(e.productId) as number[]);
}

const entryStr = (e: CartEntry) => `${e.productId}${e.variantId ? `:${e.variantId}` : ""}${(e.qty ?? 1) > 1 ? `*${e.qty}` : ""}`;

export function writeCart(c: Ctx, entries: CartEntry[]) {
  const value = parseCart(entries.map(entryStr).join(",")).map(entryStr).join(",");
  setCookie(c, "cart", value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "Lax",
    secure: isHttps(c),
    httpOnly: false,
  });
}

/**
 * কার্টে যোগ: নতুন হলে "added"; আগে থাকলে পরিমাণ বাড়ে ("more", নতুন ভ্যারিয়েন্ট দিলে সেটাই থাকে);
 * সর্বোচ্চ সীমায় পৌঁছালে "max"।
 */
export function addToCart(c: Ctx, productId: number, variantId: number | null = null, qty = 1, max = 50): "added" | "more" | "max" {
  const entries = readCartEntries(c);
  const old = entries.find((e) => e.productId === productId);
  if (!old) {
    writeCart(c, [...entries, { productId, variantId, qty: clampQty(qty, max) }]);
    return "added";
  }
  if ((old.qty ?? 1) >= max) return "max";
  writeCart(c, entries.map((e) => (e.productId === productId ? { productId, variantId: variantId ?? e.variantId, qty: clampQty((e.qty ?? 1) + qty, max) } : e)));
  return "more";
}

/** কার্টে পণ্যের পরিমাণ বদলানো (১ থেকে সর্বোচ্চ সীমা) */
export function setCartQty(c: Ctx, productId: number, qty: number, max = 50): number | null {
  const entries = readCartEntries(c);
  const old = entries.find((e) => e.productId === productId);
  if (!old) return null;
  const q = clampQty(qty, max);
  writeCart(c, entries.map((e) => (e.productId === productId ? { ...e, qty: q } : e)));
  return q;
}

export function removeFromCart(c: Ctx, productId: number) {
  writeCart(c, readCartEntries(c).filter((e) => e.productId !== productId));
}

export function clearCart(c: Ctx) {
  writeCart(c, []);
}

/** "এখনই কিনুন": পণ্যটা কার্টে রাখে (আগে থাকলে বাছাই করা ভ্যারিয়েন্ট দিয়ে বদলায়) */
export function upsertCart(c: Ctx, productId: number, variantId: number | null = null, qty = 1, max = 50) {
  const entries = readCartEntries(c).filter((e) => e.productId !== productId);
  writeCart(c, [...entries, { productId, variantId, qty: clampQty(qty, max) }]);
}
