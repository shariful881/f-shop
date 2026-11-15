import type { Product } from "./products";

export type OrderStatus = "new" | "confirmed" | "shipped" | "cancelled" | "fake";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "নতুন",
  confirmed: "কনফার্ম",
  shipped: "শিপড",
  cancelled: "বাতিল",
  fake: "ফেক",
};

export type Order = {
  id: number;
  order_no: string;
  name: string;
  phone: string;
  address: string;
  area: "inside" | "outside";
  note: string | null;
  subtotal: number;
  delivery_charge: number;
  total: number;
  status: OrderStatus;
  device_id: string | null;
  ip: string | null;
  user_agent: string | null;
  fbp: string | null;
  fbc: string | null;
  source_url: string | null;
  confirmed_at: string | null;
  purchase_sent_at: string | null;
  purchase_response: string | null;
  purchase_sending_until: string | null;
  coupon_code: string | null;
  discount: number;
  courier: string | null;
  consignment_id: string | null;
  tracking_code: string | null;
  courier_status: string | null;
  courier_sent_at: string | null;
  courier_checked_at: string | null;
  courier_response: string | null;
  outcome?: "delivered" | "returned" | null;
  advance_amount?: number;
  pay_method?: string | null;
  pay_trx?: string | null;
  pay_sender?: string | null;
  pay_status?: "pending" | "verified" | "rejected" | null;
  pay_checked_at?: string | null;
  outcome_at?: string | null;
  created_at: string;
  updated_at: string;
  email?: string | null;
  extra_json?: string | null;
};

/** চেকআউটের নিজের ঘরগুলো (লেবেল → মান) */
export function orderExtras(o: Pick<Order, "extra_json">): [string, string][] {
  try {
    const v = JSON.parse(o.extra_json || "[]");
    return Array.isArray(v) ? v.filter((x) => Array.isArray(x) && x.length === 2).map((x) => [String(x[0]), String(x[1])] as [string, string]) : [];
  } catch {
    return [];
  }
}

/** দোকানের অর্ডার নম্বরের শুরুর অক্ষর (যেমন FS-, KB-, DD) */
export const orderPrefix = (s: Record<string, string | undefined>) => (/^[A-Z0-9-]{1,6}$/.test(s.order_prefix || "") ? s.order_prefix! : "FS-");

export type OrderItem = {
  id: number;
  order_id: number;
  product_id: number | null;
  product_name: string;
  price: number;
  qty: number;
  variant_id?: number | null;
  variant_label?: string | null;
};

export type NewOrder = {
  name: string;
  phone: string;
  address: string;
  area: "inside" | "outside";
  note: string;
  deliveryCharge: number;
  deviceId: string | null;
  ip: string;
  userAgent: string;
  fbp: string | null;
  fbc: string | null;
  sourceUrl: string;
  couponId?: number | null;
  couponCode?: string | null;
  discount?: number;
  email?: string | null;
  extras?: [string, string][];
  prefix?: string;
  /** অগ্রিম পেমেন্ট (ধাপ ৬) */
  advance?: { amount: number; method: string; trx: string; sender: string | null } | null;
};

export const AREA_LABEL = { inside: "ঢাকার ভিতরে", outside: "ঢাকার বাইরে" } as const;

/**
 * অর্ডার আর আইটেম একসাথে (একটা batch = একটা transaction) সেভ করে।
 * অর্ডার নম্বর: FS-100001, FS-100002 …
 */
export async function createOrder(db: D1Database, o: NewOrder, products: Product[]): Promise<{ id: number; order_no: string }> {
  const subtotal = products.reduce((s, p) => s + p.price * (p.qty ?? 1), 0);
  const discount = Math.max(0, Math.min(o.discount ?? 0, subtotal + o.deliveryCharge));
  const total = subtotal + o.deliveryCharge - discount;
  const tmp = "TMP-" + crypto.randomUUID();

  const stmts = [
    db
      .prepare(
        `INSERT INTO orders (order_no, name, phone, address, area, note, subtotal, delivery_charge, total, status,
           device_id, ip, user_agent, fbp, fbc, source_url, coupon_code, discount, email, extra_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(tmp, o.name, o.phone, o.address, o.area, o.note || null, subtotal, o.deliveryCharge, total,
        o.deviceId, o.ip, o.userAgent, o.fbp, o.fbc, o.sourceUrl, discount ? o.couponCode ?? null : null, discount,
        o.email || null, o.extras?.length ? JSON.stringify(o.extras) : null),
    ...products.map((p) =>
      db
        .prepare(
          "INSERT INTO order_items (order_id, product_id, product_name, price, qty, variant_id, variant_label) VALUES ((SELECT id FROM orders WHERE order_no = ?), ?, ?, ?, ?, ?, ?)",
        )
        .bind(tmp, p.id, p.name, p.price, p.qty ?? 1, p.variant_id ?? null, p.variant_label ?? null),
    ),
    ...(o.couponId && discount ? [db.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?").bind(o.couponId)] : []),
    ...(o.advance ? [db.prepare("UPDATE orders SET advance_amount = ?, pay_method = ?, pay_trx = ?, pay_sender = ?, pay_status = 'pending' WHERE order_no = ?")
      .bind(Math.min(o.advance.amount, total), o.advance.method, o.advance.trx, o.advance.sender, tmp)] : []),
    db.prepare("UPDATE orders SET order_no = ? || (100000 + id) WHERE order_no = ? RETURNING id, order_no").bind(o.prefix || "FS-", tmp),
  ];
  const results = await db.batch<{ id: number; order_no: string }>(stmts);
  const row = results[results.length - 1]!.results[0]!;
  return { id: row.id, order_no: row.order_no };
}

export async function getOrderByNo(db: D1Database, orderNo: string) {
  const order = await db.prepare("SELECT * FROM orders WHERE order_no = ?").bind(orderNo).first<Order>();
  if (!order) return null;
  const { results: items } = await db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").bind(order.id).all<OrderItem>();
  return { order, items };
}

export async function getOrderById(db: D1Database, id: number) {
  const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<Order>();
  if (!order) return null;
  const { results: items } = await db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").bind(order.id).all<OrderItem>();
  return { order, items };
}
