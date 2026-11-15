/**
 * SellxBD-এর প্ল্যান (১৫ নভেম্বর ২০২৬ থেকে)।
 * সব প্ল্যানে সব ফিচার — পার্থক্য শুধু মাসে কতটা কনফার্ম অর্ডার, কতজন স্টাফ আর নিজের ডোমেইন।
 * দাম/সীমা সুপার অ্যাডমিনের সেটিংস (plan_<key>_price / _orders / _extra / _staff) থেকে বদলানো যায় — কোড লাগে না।
 */
import type { PlatformSettings } from "./billing";

export type PlanKey = "free" | "small" | "grow" | "big";
export const PLAN_KEYS: PlanKey[] = ["free", "small", "grow", "big"];
export const isPlan = (v: unknown): v is PlanKey => typeof v === "string" && (PLAN_KEYS as string[]).includes(v);

export type Plan = {
  key: PlanKey;
  name: string;
  price: number;   // মাসিক ৳
  orders: number;  // মাসে কনফার্ম অর্ডার
  extra: number;   // সীমার পরে প্রতি অর্ডার ৳ (দশমিক হতে পারে; মাস শেষে মোট হিসাব করে উপরের পূর্ণ টাকায়)
  staff: number;   // মালিক ছাড়া কতজন স্টাফ প্ল্যানে আছে
  domain: boolean; // নিজের ডোমেইন
  for: string;
};

const DEFAULTS: Record<PlanKey, Plan> = {
  free: { key: "free", name: "ফ্রি", price: 0, orders: 30, extra: 3, staff: 0, domain: false, for: "নতুন বিক্রেতা, পরীক্ষা" },
  small: { key: "small", name: "ছোট দোকান", price: 399, orders: 300, extra: 1, staff: 1, domain: true, for: "ফেসবুক পেজের বিক্রেতা" },
  grow: { key: "grow", name: "বাড়ন্ত", price: 799, orders: 1500, extra: 0.5, staff: 4, domain: true, for: "নিয়মিত অ্যাড চালান যারা" },
  big: { key: "big", name: "বড় ব্র্যান্ড", price: 1499, orders: 5000, extra: 0.3, staff: 14, domain: true, for: "দল আর গুদাম আছে যাদের" },
};

/** ট্রায়ালে কোন প্ল্যানের সুবিধা */
export const TRIAL_PLAN: PlanKey = "grow";
/** বাৎসরিক: ১২ মাসে ১০ মাসের দাম; ৬ মাসে ১০% ছাড় */
export const CYCLES = [1, 6, 12] as const;
export type Cycle = (typeof CYCLES)[number];
export const isCycle = (n: number): n is Cycle => (CYCLES as readonly number[]).includes(n);

const f = (s: PlatformSettings, key: string, def: number) => {
  const n = parseFloat(s[key] ?? "");
  return Number.isFinite(n) && n >= 0 ? n : def;
};

export function plans(s: PlatformSettings): Record<PlanKey, Plan> {
  const out = {} as Record<PlanKey, Plan>;
  for (const k of PLAN_KEYS) {
    const d = DEFAULTS[k];
    out[k] = {
      ...d,
      price: Math.round(f(s, `plan_${k}_price`, d.price)),
      orders: Math.round(f(s, `plan_${k}_orders`, d.orders)),
      extra: f(s, `plan_${k}_extra`, d.extra),
      staff: Math.round(f(s, `plan_${k}_staff`, d.staff)),
    };
  }
  return out;
}

export const planOf = (s: PlatformSettings, key: string | null | undefined): Plan => plans(s)[isPlan(key) ? key : "free"];

/** এক বিলে কত টাকা (মাসিক দাম × মাস, ছাড়সহ) */
export function cyclePrice(price: number, months: number): number {
  if (months === 12) return price * 10;
  if (months === 6) return Math.round(price * 6 * 0.9);
  return price * Math.max(1, months);
}

/** সীমার বেশি অর্ডারের চার্জ (উপরের পূর্ণ টাকায়) */
export function overageCharge(plan: Plan, orders: number): number {
  const over = Math.max(0, orders - plan.orders);
  return Math.max(0, Math.ceil(Math.round(over * plan.extra * 100) / 100));
}

/** প্ল্যানের বাইরের স্টাফ */
export const extraStaff = (plan: Plan, staffCount: number) => Math.max(0, staffCount - plan.staff);

/** মাসে এত অর্ডারে কোন প্ল্যান সবচেয়ে সস্তা (দোকানদারকে পরামর্শ দিতে) */
export function cheapestFor(s: PlatformSettings, orders: number): { plan: Plan; cost: number } {
  let best: { plan: Plan; cost: number } | null = null;
  for (const p of Object.values(plans(s))) {
    const cost = p.price + overageCharge(p, orders);
    if (!best || cost < best.cost) best = { plan: p, cost };
  }
  return best!;
}
