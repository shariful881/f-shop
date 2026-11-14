import type { Settings } from "./settings";

export type OrderInput = Record<string, string>;

export type ValidationResult =
  | { ok: true; phone: string; area: "inside" | "outside" }
  | { ok: false; errors: Record<string, string> };

/** ফর্মের ইনপুট যাচাই */
export function validateOrderInput(v: OrderInput): ValidationResult {
  const errors: Record<string, string> = {};
  if (!v.name || v.name.length < 2) errors.name = "আপনার নাম লিখুন";
  if (!v.phone) errors.phone = "মোবাইল নম্বর লিখুন";
  if (!v.address || v.address.length < 5) errors.address = "সম্পূর্ণ ঠিকানা লিখুন";
  if (v.area !== "inside" && v.area !== "outside") errors.area = "ডেলিভারি এলাকা বাছাই করুন";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, phone: v.phone!, area: v.area as "inside" | "outside" };
}

// ধাপ (গ)-তে আসল নিয়ম বসবে
export async function acquireOrderLocks(_db: D1Database, _phone: string, _deviceIds: string[]): Promise<string[] | null> {
  return [];
}
export async function releaseOrderLocks(_db: D1Database, _keys: string[]) {}
export async function checkOrderGuards(_db: D1Database, _phone: string, _deviceIds: string[], _s: Settings): Promise<{ ok: true } | { ok: false; message: string }> {
  return { ok: true };
}
