/**
 * অসম্পূর্ণ অর্ডার: ক্রেতা ফর্মে সঠিক নম্বর লিখে অর্ডার না করে চলে গেলে।
 * একই নম্বরের খোলা লাইন একটাই — আবার লিখলে সেটাই আপডেট হয়।
 */
export type DraftItem = { productId: number; variantId: number | null; qty: number };

export type IncompleteRow = {
  id: number;
  phone: string;
  name: string | null;
  address: string | null;
  area: string | null;
  source: string;
  items: string;
  subtotal: number;
  device_id: string | null;
  source_url: string | null;
  status: "open" | "called" | "converted" | "dismissed";
  order_id: number | null;
  created_at: string;
  updated_at: string;
  /** তালিকায় দেখানোর জন্য */
  product_names?: string | null;
  order_no?: string | null;
};

export type DraftInput = {
  phone: string;
  name: string;
  address: string;
  area: string;
  source: "landing" | "cart";
  items: DraftItem[];
  subtotal: number;
  deviceId: string | null;
  sourceUrl: string;
};

export const KEEP_DAYS = 30;

export async function saveDraft(db: D1Database, d: DraftInput) {
  await db
    .prepare(
      `INSERT INTO incomplete_orders (phone, name, address, area, source, items, subtotal, device_id, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(phone) WHERE status IN ('open', 'called') DO UPDATE SET
         name = COALESCE(NULLIF(excluded.name, ''), name),
         address = COALESCE(NULLIF(excluded.address, ''), address),
         area = COALESCE(NULLIF(excluded.area, ''), area),
         source = excluded.source, items = excluded.items, subtotal = excluded.subtotal,
         device_id = COALESCE(excluded.device_id, device_id), source_url = excluded.source_url,
         updated_at = datetime('now')`,
    )
    .bind(d.phone, d.name || null, d.address || null, d.area || null, d.source, JSON.stringify(d.items), d.subtotal, d.deviceId, d.sourceUrl)
    .run();
  if (Math.random() < 0.03) {
    await db.prepare(`DELETE FROM incomplete_orders WHERE updated_at < datetime('now', '-${KEEP_DAYS} days')`).run();
  }
}

/** অর্ডার হয়ে গেলে (ক্রেতা নিজে বা দোকানদার) খোলা লাইন বন্ধ */
export async function markConverted(db: D1Database, phone: string, orderId: number) {
  await db
    .prepare("UPDATE incomplete_orders SET status = 'converted', order_id = ?, updated_at = datetime('now') WHERE phone = ? AND status IN ('open', 'called')")
    .bind(orderId, phone)
    .run();
}

export function draftItems(row: Pick<IncompleteRow, "items">): DraftItem[] {
  try {
    const v = JSON.parse(row.items || "[]");
    return Array.isArray(v)
      ? v.filter((x) => x && Number(x.productId) > 0).map((x) => ({ productId: Number(x.productId), variantId: Number(x.variantId) || null, qty: Math.max(1, Number(x.qty) || 1) })).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

export const INCOMPLETE_TABS = { open: "নতুন", called: "কল করা হয়েছে", converted: "অর্ডার হয়েছে", dismissed: "বাদ" } as const;
export type IncompleteTab = keyof typeof INCOMPLETE_TABS;

export async function incompleteCounts(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db.prepare("SELECT status, COUNT(*) n FROM incomplete_orders GROUP BY status").all<{ status: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.status, r.n]));
}

export async function listIncomplete(db: D1Database, status: IncompleteTab, limit = 100): Promise<IncompleteRow[]> {
  const { results } = await db
    .prepare(
      `SELECT i.*, o.order_no FROM incomplete_orders i LEFT JOIN orders o ON o.id = i.order_id
       WHERE i.status = ? ORDER BY i.updated_at DESC LIMIT ?`,
    )
    .bind(status, limit)
    .all<IncompleteRow>();
  // পণ্যের নাম (একটাই কোয়েরি)
  const ids = [...new Set(results.flatMap((r) => draftItems(r).map((i) => i.productId)))];
  if (ids.length) {
    const { results: ps } = await db.prepare(`SELECT id, name FROM products WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{ id: number; name: string }>();
    const name = new Map(ps.map((p) => [p.id, p.name]));
    for (const r of results) r.product_names = draftItems(r).map((i) => `${name.get(i.productId) ?? "মুছে ফেলা পণ্য"}${i.qty > 1 ? ` × ${i.qty}` : ""}`).join(", ");
  }
  return results;
}

/** WhatsApp লিংক: 01XXXXXXXXX → 8801XXXXXXXXX, সাথে তৈরি মেসেজ */
export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/88${phone}?text=${encodeURIComponent(text)}`;
}
