/** অর্ডারের পরিবর্তনের ইতিহাস — [ঘরের নাম, আগে, পরে] */
export type ChangeRow = [string, string, string];
export type OrderChange = { id: number; order_id: number; changes: ChangeRow[]; by_name: string | null; by_role: string | null; created_at: string };

export function logChangeStatement(db: D1Database, orderId: number, changes: ChangeRow[], by?: { name?: string; email?: string; role?: string }) {
  return db.prepare("INSERT INTO order_changes (order_id, changes_json, by_name, by_role) VALUES (?, ?, ?, ?)")
    .bind(orderId, JSON.stringify(changes), by?.name || by?.email || null, by?.role ?? null);
}

export async function orderChanges(db: D1Database, orderId: number): Promise<OrderChange[]> {
  const { results } = await db.prepare("SELECT * FROM order_changes WHERE order_id = ? ORDER BY id DESC LIMIT 30").bind(orderId)
    .all<{ id: number; order_id: number; changes_json: string; by_name: string | null; by_role: string | null; created_at: string }>();
  return results.map((r) => {
    let changes: ChangeRow[] = [];
    try { changes = JSON.parse(r.changes_json); } catch { /* ভাঙা হলে ফাঁকা */ }
    return { id: r.id, order_id: r.order_id, changes, by_name: r.by_name, by_role: r.by_role, created_at: r.created_at };
  });
}
