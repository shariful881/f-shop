/** রিপোর্ট — সব সময় ঢাকার সময় (UTC+6) অনুযায়ী দিন ধরা হয় */

export type Range = { from: string; to: string; label: string; key: string }; // from/to: ঢাকার তারিখ YYYY-MM-DD (দুটোই সহ)

const DHAKA_MS = 6 * 3600 * 1000;
export const dhakaDate = (ms = Date.now()) => new Date(ms + DHAKA_MS).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

export function resolveRange(key: string | undefined, from?: string, to?: string): Range {
  const today = dhakaDate();
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (key === "custom" && ok(from) && ok(to) && from! <= to!) {
    const f = from!, t = to! > today ? today : to!;
    const span = (Date.parse(t) - Date.parse(f)) / 86400000;
    return { from: span > 366 ? addDays(t, -366) : f, to: t, label: "নিজের বাছাই", key: "custom" };
  }
  if (key === "today") return { from: today, to: today, label: "আজ", key };
  if (key === "30") return { from: addDays(today, -29), to: today, label: "শেষ ৩০ দিন", key };
  return { from: addDays(today, -6), to: today, label: "শেষ ৭ দিন", key: "7" };
}

/** ঢাকার তারিখের সীমা → UTC সময়ের সীমা (ডাটাবেসে UTC) */
function utcBounds(r: Range) {
  const start = new Date(Date.parse(r.from + "T00:00:00Z") - DHAKA_MS).toISOString().replace("T", " ").slice(0, 19);
  const end = new Date(Date.parse(addDays(r.to, 1) + "T00:00:00Z") - DHAKA_MS).toISOString().replace("T", " ").slice(0, 19);
  return { start, end };
}

export type Report = {
  range: Range;
  total: number;
  byStatus: Record<string, number>;
  sales: number;          // কনফার্ম + শিপড অর্ডারের মোট টাকা
  pendingValue: number;   // নতুন অর্ডারের মোট টাকা
  confirmRate: number;    // %
  fakeRate: number;       // %
  avgOrder: number;
  days: { date: string; orders: number; sales: number }[];
  topProducts: { name: string; count: number; revenue: number }[];
  coupons: { code: string; uses: number; discount: number }[];
  areas: { inside: number; outside: number };
};

const SOLD = "('confirmed', 'shipped')";

export async function buildReport(db: D1Database, r: Range): Promise<Report> {
  const { start, end } = utcBounds(r);
  const W = "o.created_at >= ? AND o.created_at < ?";
  const [st, money, daily, top, cps, areas] = await db.batch([
    db.prepare(`SELECT status, COUNT(*) n FROM orders o WHERE ${W} GROUP BY status`).bind(start, end),
    db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN status IN ${SOLD} THEN total END), 0) AS sales,
        COALESCE(SUM(CASE WHEN status = 'new' THEN total END), 0) AS pending
      FROM orders o WHERE ${W}`).bind(start, end),
    db.prepare(`SELECT date(o.created_at, '+6 hours') AS d, COUNT(*) AS orders,
        COALESCE(SUM(CASE WHEN status IN ${SOLD} THEN total END), 0) AS sales
      FROM orders o WHERE ${W} GROUP BY d ORDER BY d`).bind(start, end),
    db.prepare(`SELECT i.product_name AS name, COUNT(*) AS count, SUM(i.price) AS revenue
      FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE ${W} AND o.status IN ${SOLD} GROUP BY i.product_name ORDER BY count DESC, revenue DESC LIMIT 10`).bind(start, end),
    db.prepare(`SELECT coupon_code AS code, COUNT(*) AS uses, SUM(discount) AS discount
      FROM orders o WHERE ${W} AND coupon_code IS NOT NULL AND status != 'fake' GROUP BY coupon_code ORDER BY uses DESC LIMIT 10`).bind(start, end),
    db.prepare(`SELECT area, COUNT(*) n FROM orders o WHERE ${W} AND status IN ${SOLD} GROUP BY area`).bind(start, end),
  ]);
  const byStatus: Record<string, number> = {};
  for (const x of st!.results as { status: string; n: number }[]) byStatus[x.status] = x.n;
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const sold = (byStatus.confirmed ?? 0) + (byStatus.shipped ?? 0);
  const m = (money!.results[0] ?? { sales: 0, pending: 0 }) as { sales: number; pending: number };

  // প্রতিটা দিন (অর্ডার না থাকলেও ০)
  const map = new Map((daily!.results as { d: string; orders: number; sales: number }[]).map((x) => [x.d, x]));
  const days: Report["days"] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
    const x = map.get(d);
    days.push({ date: d, orders: x?.orders ?? 0, sales: x?.sales ?? 0 });
  }
  const ar = Object.fromEntries((areas!.results as { area: string; n: number }[]).map((x) => [x.area, x.n]));

  return {
    range: r,
    total,
    byStatus,
    sales: m.sales,
    pendingValue: m.pending,
    confirmRate: total ? Math.round((sold / total) * 100) : 0,
    fakeRate: total ? Math.round(((byStatus.fake ?? 0) / total) * 100) : 0,
    avgOrder: sold ? Math.round(m.sales / sold) : 0,
    days,
    topProducts: top!.results as Report["topProducts"],
    coupons: cps!.results as Report["coupons"],
    areas: { inside: ar.inside ?? 0, outside: ar.outside ?? 0 },
  };
}
