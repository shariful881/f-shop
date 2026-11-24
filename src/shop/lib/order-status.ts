import type { Order, OrderStatus } from "./orders";

/**
 * স্ট্যাটাস বদলের নিয়ম: যেকোনো স্ট্যাটাস থেকে অন্য যেকোনোটায় যাওয়া যায় (ভুল হলে ফেরানো যায়)।
 * পার্শ্বফল (স্টক, ব্লক, বিলিং, Purchase) রুটে সামলানো হয় আর সবগুলো একবারই হয়।
 */
const ALL: OrderStatus[] = ["new", "confirmed", "shipped", "cancelled", "fake"];
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = Object.fromEntries(ALL.map((s) => [s, ALL.filter((t) => t !== s)])) as Record<OrderStatus, OrderStatus[]>;

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export type ChangeResult = { ok: true; order: Order } | { ok: false; message: string };

/**
 * স্ট্যাটাস বদলায়। বাতিল বা ফেক হলে নম্বর আর ডিভাইস দুটোই স্থায়ীভাবে ব্ল্যাকলিস্টে যায়।
 * (Purchase পাঠানো হয় রুট থেকে, কনফার্ম সফল হলে।)
 */
export async function changeStatus(db: D1Database, orderId: number, to: OrderStatus): Promise<ChangeResult> {
  const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<Order>();
  if (!order) return { ok: false, message: "অর্ডার পাওয়া যায়নি" };
  if (!canTransition(order.status, to)) {
    return { ok: false, message: "এই অবস্থা থেকে এই স্ট্যাটাসে বদলানো যায় না" };
  }

  // WHERE status = পুরনো স্ট্যাটাস — একসাথে দুজন অ্যাডমিন চাপলেও একবারই বদলাবে
  const upd = await db
    .prepare(
      `UPDATE orders SET status = ?, updated_at = datetime('now'),
         confirmed_at = CASE WHEN ? = 'confirmed' THEN datetime('now') ELSE confirmed_at END,
         spam_released = CASE WHEN spam > 0 AND ? IN ('confirmed', 'shipped') THEN 1 ELSE spam_released END,
         spam = 0
       WHERE id = ? AND status = ?`,
    )
    .bind(to, to, to, orderId, order.status)
    .run();
  if (!upd.meta.changes) return { ok: false, message: "অর্ডারটি এর মধ্যে বদলে গেছে, পেজ রিফ্রেশ করুন" };

  // বাতিল/ফেক থেকে ফেরালে এই অর্ডারের জন্য যে ব্লক হয়েছিল সেটা তুলে নেওয়া (অন্য অর্ডারের ব্লক থাকে)
  const wasBad = order.status === "cancelled" || order.status === "fake";
  if (wasBad && to !== "cancelled" && to !== "fake") {
    await db.prepare("DELETE FROM blacklist_entries WHERE order_id = ?").bind(order.id).run();
  }

  if (to === "cancelled" || to === "fake") {
    const stmts = [
      db.prepare("INSERT OR IGNORE INTO blacklist_entries (type, value, reason, order_id) VALUES ('phone', ?, ?, ?)").bind(order.phone, to, order.id),
    ];
    if (order.device_id) {
      stmts.push(
        db.prepare("INSERT OR IGNORE INTO blacklist_entries (type, value, reason, order_id) VALUES ('device', ?, ?, ?)").bind(order.device_id, to, order.id),
      );
    }
    await db.batch(stmts);
  }

  const fresh = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<Order>();
  return { ok: true, order: fresh! };
}
