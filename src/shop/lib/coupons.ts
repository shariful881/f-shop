/** কুপন কোড — যাচাই আর ছাড়ের হিসাব (সবসময় সার্ভারে) */

export type Coupon = {
  id: number; code: string; type: "fixed" | "percent" | "free_delivery"; value: number; max_discount: number | null;
  min_order: number; starts_at: string | null; expires_at: string | null; usage_limit: number | null; used_count: number;
  once_per_phone: number; active: number; created_at: string;
};

export function normalizeCode(s: unknown): string {
  return String(s ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
}

/** ছাড়ের পরিমাণ (টাকা) */
export function discountFor(c: Pick<Coupon, "type" | "value" | "max_discount">, subtotal: number, delivery: number): number {
  if (c.type === "fixed") return Math.min(c.value, subtotal);
  if (c.type === "percent") {
    const d = Math.floor((subtotal * Math.min(100, c.value)) / 100);
    return c.max_discount ? Math.min(d, c.max_discount) : d;
  }
  return delivery;
}

export type CouponCheck =
  | { ok: true; coupon: Coupon; discount: number; message: string }
  | { ok: false; message: string };

export async function checkCoupon(db: D1Database, rawCode: string, subtotal: number, delivery: number, phone?: string | null): Promise<CouponCheck> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, message: "কুপন কোড লিখুন" };
  const c = await db.prepare("SELECT * FROM coupons WHERE code = ?").bind(code).first<Coupon>();
  if (!c || !c.active) return { ok: false, message: "কুপন কোডটি সঠিক নয়" };
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  if (c.starts_at && c.starts_at > now) return { ok: false, message: "এই কুপন এখনো চালু হয়নি" };
  if (c.expires_at && c.expires_at < now) return { ok: false, message: "এই কুপনের মেয়াদ শেষ" };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { ok: false, message: "এই কুপন আর ব্যবহার করা যাবে না" };
  if (subtotal < c.min_order) return { ok: false, message: `এই কুপনের জন্য কমপক্ষে ৳${c.min_order} টাকার পণ্য নিতে হবে` };
  if (phone && c.once_per_phone) {
    const used = await db.prepare("SELECT 1 FROM orders WHERE coupon_code = ? AND phone = ? LIMIT 1").bind(code, phone).first();
    if (used) return { ok: false, message: "এই নম্বরে কুপনটি আগেই ব্যবহার করা হয়েছে" };
  }
  const discount = discountFor(c, subtotal, delivery);
  if (discount <= 0) return { ok: false, message: "এই অর্ডারে কুপনটি প্রযোজ্য নয়" };
  return { ok: true, coupon: c, discount, message: c.type === "free_delivery" ? "ফ্রি ডেলিভারি প্রযোজ্য হয়েছে" : `৳${discount} ছাড় প্রযোজ্য হয়েছে` };
}
