/**
 * লাইভ নোটিফিকেশন: নতুন অর্ডার, স্ট্যাটাস বদল, কুরিয়ারে পাঠানো।
 * ঘটনা activity টেবিলে জমা হয় (🔔 বেলের ইতিহাস) আর খোলা অ্যাডমিন প্যানেলগুলোতে
 * সাথে সাথে WebSocket দিয়ে যায় (দোকানের Durable Object থেকে — shop-do.ts)।
 * এখানে কোনো ভুল হলেও অর্ডার বা স্ট্যাটাস বদল আটকায় না।
 */
export type LiveKind = "order_new" | "status" | "courier";
export type LiveInput = {
  kind: LiveKind;
  order_id: number;
  order_no: string;
  name: string;
  total: number;
  status?: string | null;
  by_id?: number | null;
  by_name?: string | null;
};
export type LiveEvent = LiveInput & { id: number; created_at: string; new_count: number };
export type LiveHub = { emit(ev: LiveEvent): void };

const KEEP = 300;

export async function recordLive(env: { DB: D1Database; LIVE?: LiveHub }, ev: LiveInput): Promise<void> {
  try {
    const r = await env.DB
      .prepare("INSERT INTO activity (kind, order_id, order_no, name, total, status, by_id, by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at")
      .bind(ev.kind, ev.order_id, ev.order_no, (ev.name || "").slice(0, 80), Math.round(ev.total || 0), ev.status ?? null, ev.by_id ?? null, ev.by_name ?? null)
      .first<{ id: number; created_at: string }>();
    if (!r) return;
    if (r.id % 50 === 0) await env.DB.prepare("DELETE FROM activity WHERE id <= ?").bind(r.id - KEEP).run();
    env.LIVE?.emit({ ...ev, id: r.id, created_at: r.created_at, new_count: await newOrderCount(env.DB) });
  } catch (e) {
    console.error("live event", e);
  }
}

export async function newOrderCount(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'new' AND spam = 0").first<{ n: number }>();
  return r?.n ?? 0;
}

/** শেষ কয়েকটা ঘটনা (since দিলে তার পরেরগুলো) — নতুনটা আগে */
export async function recentActivity(db: D1Database, since = 0, limit = 30) {
  const r = await db
    .prepare("SELECT id, kind, order_id, order_no, name, total, status, by_id, by_name, created_at FROM activity WHERE id > ? ORDER BY id DESC LIMIT ?")
    .bind(since, limit)
    .all<Omit<LiveEvent, "new_count">>();
  return r.results ?? [];
}

/** একটা অর্ডারের ঘটনা — অর্ডারের নাম/টাকা/স্ট্যাটাস ডাটাবেস থেকে পড়ে */
export async function liveOrder(env: { DB: D1Database; LIVE?: LiveHub }, orderId: number, kind: LiveKind, by?: { id: number; name?: string | null; email?: string | null } | null): Promise<void> {
  try {
    const o = await env.DB.prepare("SELECT order_no, name, total, status FROM orders WHERE id = ?").bind(orderId)
      .first<{ order_no: string; name: string; total: number; status: string }>();
    if (!o) return;
    await recordLive(env, {
      kind, order_id: orderId, order_no: o.order_no, name: o.name, total: o.total, status: o.status,
      by_id: by?.id ?? null, by_name: by ? (by.name || (by.email || "").split("@")[0] || null) : null,
    });
  } catch (e) {
    console.error("live order", e);
  }
}
