/**
 * ধাপ ৪: স্টক।
 * - পণ্যে track_stock = 1 হলে স্টক গোনা হয়
 * - ভ্যারিয়েন্ট থাকলে স্টক ভ্যারিয়েন্টে; products.stock = চালু ভ্যারিয়েন্টগুলোর যোগফল (তালিকায় "স্টক নেই" দেখাতে)
 * - কনফার্মে কমে, বাতিল বা ফেরতে ফেরে — প্রতিটা বদল stock_moves-এ লেখা, ফেরত দেওয়া হয় ঠিক ততটাই যতটা কমেছিল
 */
import type { Product, Variant } from "./products";

export type StockReason = "order" | "cancel" | "return" | "manual";

export const tracked = (p: Pick<Product, "track_stock">) => p.track_stock === 1;
export const soldOut = (p: Pick<Product, "track_stock" | "stock">) => p.track_stock === 1 && (p.stock ?? 0) <= 0;
export const SOLD_OUT_MSG = "দুঃখিত, এই পণ্যটি এখন স্টকে নেই।";

/** দোকানে দেখানোর জন্য: স্টক শেষ হওয়া ভ্যারিয়েন্ট বাছাই করা যাবে না */
export function variantsForSale(p: Pick<Product, "track_stock">, variants: Variant[]): Variant[] {
  if (!tracked(p)) return variants;
  return variants.map((v) => ({ ...v, active: v.active && (v.stock ?? 0) > 0 ? 1 : 0 }));
}

/** ভ্যারিয়েন্টওয়ালা পণ্যের মোট স্টক নতুন করে হিসাব */
export async function recomputeProductStock(db: D1Database, productIds: number[]) {
  const ids = [...new Set(productIds)].filter((x) => x > 0);
  if (!ids.length) return;
  await db
    .prepare(
      `UPDATE products SET stock = (SELECT COALESCE(SUM(MAX(v.stock, 0)), 0) FROM product_variants v WHERE v.product_id = products.id AND v.active = 1)
       WHERE id IN (${ids.map(() => "?").join(",")}) AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = products.id)`,
    )
    .bind(...ids)
    .run();
}

type ItemRow = { product_id: number; variant_id: number | null; qty: number; product_name: string; variant_label: string | null; track_stock: number; p_stock: number; v_id: number | null; v_stock: number | null; has_variants: number };

async function orderItems(db: D1Database, orderId: number): Promise<ItemRow[]> {
  const { results } = await db
    .prepare(
      `SELECT i.product_id, i.variant_id, COALESCE(i.qty, 1) qty, i.product_name, i.variant_label, p.track_stock, p.stock p_stock,
              v.id v_id, v.stock v_stock, EXISTS (SELECT 1 FROM product_variants x WHERE x.product_id = p.id) has_variants
       FROM order_items i JOIN products p ON p.id = i.product_id
       LEFT JOIN product_variants v ON v.id = i.variant_id AND v.product_id = p.id
       WHERE i.order_id = ?`,
    )
    .bind(orderId)
    .all<ItemRow>();
  return results;
}

/** কনফার্মের আগে: স্টকে যথেষ্ট আছে কিনা। না থাকলে কারণ */
export async function checkOrderStock(db: D1Database, orderId: number): Promise<string | null> {
  const need = new Map<string, { label: string; qty: number; left: number }>();
  for (const it of await orderItems(db, orderId)) {
    if (it.track_stock !== 1) continue;
    if (it.has_variants && it.v_id == null) continue; // ভ্যারিয়েন্ট মুছে ফেলা হয়েছে — গোনা যায় না
    const key = it.v_id != null ? `v${it.v_id}` : `p${it.product_id}`;
    const left = it.v_id != null ? it.v_stock ?? 0 : it.p_stock;
    const cur = need.get(key) ?? { label: it.product_name + (it.variant_label ? ` (${it.variant_label})` : ""), qty: 0, left };
    cur.qty += it.qty;
    need.set(key, cur);
  }
  const short = [...need.values()].filter((n) => n.qty > n.left);
  if (!short.length) return null;
  return "স্টকে নেই: " + short.map((n) => `${n.label} — দরকার ${n.qty}, আছে ${Math.max(0, n.left)}`).join("; ") + "। ইনভেন্টরিতে স্টক বাড়িয়ে তারপর কনফার্ম করুন।";
}

/** একটা পণ্য/ভ্যারিয়েন্টের স্টক বদল + লগ */
function moveStmts(db: D1Database, m: { productId: number; variantId: number | null; change: number; reason: StockReason; orderId?: number | null; note?: string | null }): D1PreparedStatement[] {
  const table = m.variantId != null ? "product_variants" : "products";
  const id = m.variantId ?? m.productId;
  return [
    db.prepare(`UPDATE ${table} SET stock = MAX(0, stock + ?) WHERE id = ?`).bind(m.change, id),
    db.prepare(
      `INSERT INTO stock_moves (product_id, variant_id, change, stock_after, reason, order_id, note)
       VALUES (?, ?, ?, (SELECT stock FROM ${table} WHERE id = ?), ?, ?, ?)`,
    ).bind(m.productId, m.variantId, m.change, id, m.reason, m.orderId ?? null, m.note ?? null),
  ];
}

/** কনফার্ম হলে স্টক কমানো (একবারই) */
export async function applyOrderStock(db: D1Database, orderId: number) {
  const flag = await db.prepare("UPDATE orders SET stock_applied = 1 WHERE id = ? AND stock_applied = 0").bind(orderId).run();
  if (!flag.meta.changes) return;
  const stmts: D1PreparedStatement[] = [];
  const touched: number[] = [];
  for (const it of await orderItems(db, orderId)) {
    if (it.track_stock !== 1 || (it.has_variants && it.v_id == null)) continue;
    stmts.push(...moveStmts(db, { productId: it.product_id, variantId: it.v_id, change: -it.qty, reason: "order", orderId }));
    if (it.v_id != null) touched.push(it.product_id);
  }
  if (stmts.length) await db.batch(stmts);
  await recomputeProductStock(db, touched);
}

/** বাতিল বা ফেরত: যতটা কমেছিল ঠিক ততটা ফেরত */
export async function restoreOrderStock(db: D1Database, orderId: number, reason: "cancel" | "return") {
  const flag = await db.prepare("UPDATE orders SET stock_applied = 0 WHERE id = ? AND stock_applied = 1").bind(orderId).run();
  if (!flag.meta.changes) return;
  const { results } = await db
    .prepare("SELECT product_id, variant_id, SUM(change) net FROM stock_moves WHERE order_id = ? GROUP BY product_id, variant_id HAVING SUM(change) != 0")
    .bind(orderId)
    .all<{ product_id: number; variant_id: number | null; net: number }>();
  const stmts = results.flatMap((r) => moveStmts(db, { productId: r.product_id, variantId: r.variant_id, change: -r.net, reason, orderId }));
  if (stmts.length) await db.batch(stmts);
  await recomputeProductStock(db, results.filter((r) => r.variant_id != null).map((r) => r.product_id));
}

/** হাতে স্টক বসানো (নতুন সংখ্যা) — শুধু যেগুলো বদলেছে সেগুলো লগে */
export async function setStock(db: D1Database, items: { productId: number; variantId: number | null; stock: number }[], note = "হাতে বদল") {
  if (!items.length) return 0;
  const cur = new Map<string, number>();
  const pIds = items.filter((i) => i.variantId == null).map((i) => i.productId);
  const vIds = items.filter((i) => i.variantId != null).map((i) => i.variantId!);
  if (pIds.length) for (const r of (await db.prepare(`SELECT id, stock FROM products WHERE id IN (${pIds.map(() => "?").join(",")})`).bind(...pIds).all<{ id: number; stock: number }>()).results) cur.set(`p${r.id}`, r.stock);
  if (vIds.length) for (const r of (await db.prepare(`SELECT id, stock FROM product_variants WHERE id IN (${vIds.map(() => "?").join(",")})`).bind(...vIds).all<{ id: number; stock: number }>()).results) cur.set(`v${r.id}`, r.stock);
  const stmts: D1PreparedStatement[] = [];
  const touched: number[] = [];
  for (const i of items) {
    const key = i.variantId != null ? `v${i.variantId}` : `p${i.productId}`;
    if (!cur.has(key)) continue;
    const next = Math.max(0, Math.min(1_000_000, Math.round(i.stock)));
    const change = next - cur.get(key)!;
    if (!change) continue;
    stmts.push(...moveStmts(db, { productId: i.productId, variantId: i.variantId, change, reason: "manual", note }));
    if (i.variantId != null) touched.push(i.productId);
  }
  if (stmts.length) await db.batch(stmts);
  await recomputeProductStock(db, touched);
  return stmts.length / 2;
}

export type InventoryRow = {
  product_id: number;
  variant_id: number | null;
  name: string;
  label: string | null;
  image: string | null;
  stock: number;
  low_stock: number;
  cost_price: number | null;
  price: number;
  is_active: number;
  sold_30: number;
};

export type InvFilter = "all" | "low" | "out";

/** ইনভেন্টরির তালিকা: স্টক গোনা পণ্য আর তাদের ভ্যারিয়েন্ট, এক লাইনে একটা */
export async function inventoryRows(db: D1Database, filter: InvFilter = "all", q = ""): Promise<InventoryRow[]> {
  const like = q ? `%${q.replace(/[%_]/g, "")}%` : "";
  const { results } = await db
    .prepare(
      `WITH rows AS (
         SELECT p.id product_id, NULL variant_id, p.name, NULL label, p.image, p.stock, p.low_stock, p.cost_price, p.price, p.is_active, p.sort_order, 0 vs
         FROM products p WHERE p.track_stock = 1 AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
         UNION ALL
         SELECT p.id, v.id, p.name, v.label, p.image, v.stock, p.low_stock, COALESCE(v.cost_price, p.cost_price), COALESCE(v.price, p.price), p.is_active * v.active, p.sort_order, v.sort_order
         FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.track_stock = 1
       )
       SELECT r.*, COALESCE((SELECT -SUM(m.change) FROM stock_moves m WHERE m.product_id = r.product_id AND m.variant_id IS r.variant_id
                AND m.reason IN ('order', 'cancel', 'return') AND m.created_at > datetime('now', '-30 days')), 0) sold_30
       FROM rows r
       WHERE ${filter === "out" ? "r.stock <= 0" : filter === "low" ? "r.stock > 0 AND r.stock <= r.low_stock" : "1"}
         ${q ? "AND (r.name LIKE ? OR r.label LIKE ?)" : ""}
       ORDER BY r.stock <= 0 DESC, r.stock <= r.low_stock DESC, r.sort_order, r.product_id, r.vs
       LIMIT 500`,
    )
    .bind(...(q ? [like, like] : []))
    .all<InventoryRow>();
  return results;
}

export async function inventorySummary(db: D1Database) {
  return (await db
    .prepare(
      `WITH rows AS (
         SELECT p.stock, p.low_stock, p.cost_price cost FROM products p WHERE p.track_stock = 1 AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
         UNION ALL
         SELECT v.stock, p.low_stock, COALESCE(v.cost_price, p.cost_price) FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.track_stock = 1
       )
       SELECT COUNT(*) items, SUM(stock <= 0) out_count, SUM(stock > 0 AND stock <= low_stock) low_count,
              COALESCE(SUM(MAX(stock, 0)), 0) units, COALESCE(SUM(MAX(stock, 0) * COALESCE(cost, 0)), 0) value,
              SUM(cost IS NULL) no_cost,
              (SELECT COUNT(*) FROM products WHERE track_stock = 0) untracked
       FROM rows`,
    )
    .first<{ items: number; out_count: number; low_count: number; units: number; value: number; no_cost: number; untracked: number }>())!;
}

export type StockMove = { id: number; product_id: number; variant_id: number | null; change: number; stock_after: number; reason: StockReason; order_id: number | null; note: string | null; created_at: string; name: string; label: string | null; order_no: string | null };

export async function recentMoves(db: D1Database, limit = 50, productId = 0): Promise<StockMove[]> {
  const { results } = await db
    .prepare(
      `SELECT m.*, p.name, v.label, o.order_no FROM stock_moves m JOIN products p ON p.id = m.product_id
       LEFT JOIN product_variants v ON v.id = m.variant_id LEFT JOIN orders o ON o.id = m.order_id
       ${productId ? "WHERE m.product_id = ?" : ""} ORDER BY m.id DESC LIMIT ?`,
    )
    .bind(...(productId ? [productId] : []), limit)
    .all<StockMove>();
  return results;
}
