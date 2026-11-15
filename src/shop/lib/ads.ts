/**
 * ধাপ ৫: অ্যাডের আসল খরচ।
 * দোকানদার প্রতিদিনের অ্যাড খরচ লেখেন (টাকায় বা ডলারে)। তারপর একই দিনগুলোর অর্ডার মিলিয়ে:
 * প্রতি অর্ডারে খরচ, প্রতি কনফার্মে খরচ, আর আসল খরচ = প্রতি ডেলিভারি হওয়া অর্ডারে খরচ (বাতিল/ফেক/ফেরত বাদ)।
 */
import { addDays, utcBounds, type Range } from "./reports";

export type SpendRow = { id: number; day: string; amount: number; product_id: number | null; note: string | null; usd: number | null; created_at: string; product_name?: string | null };

export const DEFAULT_USD_RATE = 125;
export const usdRate = (s: Record<string, string | undefined>) => {
  const n = Number(s.ad_usd_rate);
  return Number.isFinite(n) && n >= 50 && n <= 500 ? n : DEFAULT_USD_RATE;
};

export type Funnel = {
  spend: number;
  orders: number;     // সব অর্ডার (ফেক সহ)
  confirmed: number;  // কনফার্ম + শিপড
  delivered: number;  // ডেলিভারি হয়েছে চিহ্ন
  returned: number;   // ফেরত (চিহ্ন বা কুরিয়ারে যাওয়ার পর বাতিল)
  cancelled: number;  // কনফার্মের আগে বাতিল
  fake: number;
  sales: number;      // কনফার্ম + শিপডের মোট টাকা (ফেরত বাদ)
  deliveredSales: number;
};

export type AdReport = {
  range: Range;
  productId: number;
  total: Funnel;
  days: (Funnel & { date: string })[];
  products: (Funnel & { product_id: number; name: string })[];
  spends: SpendRow[];
};

const EMPTY: Funnel = { spend: 0, orders: 0, confirmed: 0, delivered: 0, returned: 0, cancelled: 0, fake: 0, sales: 0, deliveredSales: 0 };

const FUNNEL_SQL = `COUNT(*) orders,
  SUM(o.status IN ('confirmed', 'shipped') AND COALESCE(o.outcome, '') != 'returned') confirmed,
  SUM(o.outcome = 'delivered') delivered,
  SUM(o.outcome = 'returned' OR (o.status = 'cancelled' AND o.consignment_id IS NOT NULL)) returned,
  SUM(o.status = 'cancelled' AND o.consignment_id IS NULL) cancelled,
  SUM(o.status = 'fake') fake,
  COALESCE(SUM(CASE WHEN o.status IN ('confirmed', 'shipped') AND COALESCE(o.outcome, '') != 'returned' THEN o.total END), 0) sales,
  COALESCE(SUM(CASE WHEN o.outcome = 'delivered' THEN o.total END), 0) deliveredSales`;

const fix = (r: Partial<Funnel> | null | undefined): Omit<Funnel, "spend"> => ({
  orders: r?.orders ?? 0, confirmed: r?.confirmed ?? 0, delivered: r?.delivered ?? 0, returned: r?.returned ?? 0,
  cancelled: r?.cancelled ?? 0, fake: r?.fake ?? 0, sales: r?.sales ?? 0, deliveredSales: r?.deliveredSales ?? 0,
});

/** নির্দিষ্ট পণ্যের অ্যাড হলে শুধু সেই পণ্য থাকা অর্ডার */
const productCond = (pid: number) => (pid ? "AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.product_id = ?)" : "");

export async function adReport(db: D1Database, r: Range, productId = 0): Promise<AdReport> {
  const { start, end } = utcBounds(r);
  const pb = productId ? [productId] : [];
  const [tot, daily, sp, spDaily, prods, list] = await db.batch([
    db.prepare(`SELECT ${FUNNEL_SQL} FROM orders o WHERE o.created_at >= ? AND o.created_at < ? ${productCond(productId)}`).bind(start, end, ...pb),
    db.prepare(`SELECT date(o.created_at, '+6 hours') d, ${FUNNEL_SQL} FROM orders o WHERE o.created_at >= ? AND o.created_at < ? ${productCond(productId)} GROUP BY d`).bind(start, end, ...pb),
    db.prepare(`SELECT COALESCE(SUM(amount), 0) n FROM ad_spend WHERE day >= ? AND day <= ? ${productId ? "AND product_id = ?" : ""}`).bind(r.from, r.to, ...pb),
    db.prepare(`SELECT day, SUM(amount) n FROM ad_spend WHERE day >= ? AND day <= ? ${productId ? "AND product_id = ?" : ""} GROUP BY day`).bind(r.from, r.to, ...pb),
    // যেসব পণ্যে আলাদা খরচ লেখা আছে
    db.prepare(`SELECT s.product_id, p.name, SUM(s.amount) spend FROM ad_spend s JOIN products p ON p.id = s.product_id
      WHERE s.day >= ? AND s.day <= ? AND s.product_id IS NOT NULL GROUP BY s.product_id ORDER BY spend DESC LIMIT 20`).bind(r.from, r.to),
    db.prepare(`SELECT s.*, p.name product_name FROM ad_spend s LEFT JOIN products p ON p.id = s.product_id
      WHERE s.day >= ? AND s.day <= ? ${productId ? "AND s.product_id = ?" : ""} ORDER BY s.day DESC, s.id DESC LIMIT 200`).bind(r.from, r.to, ...pb),
  ]);
  const total: Funnel = { ...fix(tot!.results[0] as Partial<Funnel>), spend: (sp!.results[0] as { n: number }).n };
  const byDay = new Map((daily!.results as (Funnel & { d: string })[]).map((x) => [x.d, x]));
  const spendDay = new Map((spDaily!.results as { day: string; n: number }[]).map((x) => [x.day, x.n]));
  const days: AdReport["days"] = [];
  for (let d = r.to; d >= r.from; d = addDays(d, -1)) days.push({ date: d, ...fix(byDay.get(d)), spend: spendDay.get(d) ?? 0 });

  const products: AdReport["products"] = [];
  for (const p of prods!.results as { product_id: number; name: string; spend: number }[]) {
    const f = await db.prepare(`SELECT ${FUNNEL_SQL} FROM orders o WHERE o.created_at >= ? AND o.created_at < ? ${productCond(p.product_id)}`)
      .bind(start, end, p.product_id).first<Partial<Funnel>>();
    products.push({ product_id: p.product_id, name: p.name, ...fix(f), spend: p.spend });
  }
  return { range: r, productId, total, days, products, spends: list!.results as SpendRow[] };
}

/** ভাগ করা যায় না (০ দিয়ে) হলে null */
export const per = (spend: number, n: number) => (n > 0 && spend > 0 ? Math.round(spend / n) : null);
export const roas = (sales: number, spend: number) => (spend > 0 ? Math.round((sales / spend) * 10) / 10 : null);
