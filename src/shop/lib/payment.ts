import { enNum } from "./format";
/**
 * ধাপ ৬: অগ্রিম পেমেন্ট — ক্রেতা দোকানদারের bKash/Nagad/Rocket নম্বরে টাকা পাঠিয়ে Transaction ID দেয়,
 * দোকানদার নিজের অ্যাপে মিলিয়ে "পেয়েছি" চাপে। টাকা সরাসরি দোকানদারের কাছে যায়, আমাদের হাত দিয়ে নয়।
 */
import type { Settings } from "./settings";

export type PayKey = "bkash" | "nagad" | "rocket";
export const PAY_NAME: Record<PayKey, string> = { bkash: "bKash", nagad: "Nagad", rocket: "Rocket" };
export const PAY_TYPE: Record<string, string> = { personal: "পার্সোনাল — Send Money", agent: "এজেন্ট — Cash Out", merchant: "মার্চেন্ট — Payment" };
export const PAY_STATUS: Record<string, string> = { pending: "যাচাই বাকি", verified: "পেয়েছি", rejected: "পাওয়া যায়নি" };

export type PayMethod = { key: PayKey; name: string; number: string; type: string };

export function payMethods(s: Settings): PayMethod[] {
  return (["bkash", "nagad", "rocket"] as PayKey[])
    .filter((k) => /^01[3-9]\d{8,9}$/.test(enNum(s[`payment_${k}`]).trim()))
    .map((k) => ({ key: k, name: PAY_NAME[k], number: enNum(s[`payment_${k}`]).trim(), type: s[`payment_${k}_type`] || "personal" }));
}

export type AdvanceMode = "off" | "delivery" | "full" | "fixed";
export type AdvanceWho = "all" | "outside" | "risky";

export function advanceConfig(s: Settings) {
  const mode = (["delivery", "full", "fixed"].includes(s.advance_mode || "") ? s.advance_mode : "off") as AdvanceMode;
  const who = (["outside", "risky"].includes(s.advance_who || "") ? s.advance_who : "all") as AdvanceWho;
  const fixed = Math.max(0, parseInt(s.advance_fixed || "0", 10) || 0);
  return { mode, who, fixed, on: mode !== "off" && payMethods(s).length > 0 };
}

/** কত অগ্রিম: ডেলিভারি চার্জ, পুরো টাকা, বা নির্দিষ্ট টাকা (মোটের বেশি নয়) */
export function advanceAmount(s: Settings, total: number, delivery: number): number {
  const c = advanceConfig(s);
  if (!c.on) return 0;
  if (c.mode === "full") return Math.max(0, total);
  if (c.mode === "fixed") return Math.min(c.fixed, Math.max(0, total));
  return Math.min(delivery, Math.max(0, total));
}

/** এই অর্ডারে অগ্রিম লাগবে কিনা (ঝুঁকি আগে হিসাব করে দিতে হয়) */
export function needsAdvance(s: Settings, area: string, risky: boolean, amount: number): boolean {
  const c = advanceConfig(s);
  if (!c.on || amount <= 0) return false;
  if (c.who === "outside") return area === "outside";
  if (c.who === "risky") return risky;
  return true;
}

/** TrxID: বড় হাতের ইংরেজি অক্ষর আর সংখ্যা, ৬–২০টা */
export function normalizeTrx(x: unknown): string | null {
  const t = String(x ?? "").toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{6,20}$/.test(t) ? t : null;
}

/** কুরিয়ারে কত টাকা তুলবে: অগ্রিম "পেয়েছি" হলে সেটা বাদ */
export const codAmount = (o: { total: number; advance_amount?: number | null; pay_status?: string | null }) =>
  Math.max(0, o.total - (o.pay_status === "verified" ? o.advance_amount ?? 0 : 0));
