/**
 * ধাপ ৭: নিট লাভ — বিক্রি থেকে ক্রয়মূল্য, কুরিয়ার খরচ, ফেরতের খরচ, COD চার্জ আর অ্যাড খরচ বাদ দিয়ে।
 * বিক্রি = কনফার্ম/শিপড অর্ডার (ফেরত বাদ), তারিখ = অর্ডারের দিন (ঢাকা)।
 */
import { utcBounds, type Range } from "./reports";
import type { Settings } from "./settings";

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : def;
};

/** দোকানদারের নিজের খরচ (কুরিয়ার যা কাটে) — না দিলে ডেলিভারি চার্জের সমান ধরা */
export function profitCosts(s: Settings) {
  return {
    shipInside: num(s.profit_ship_inside, num(s.delivery_inside, 60)),
    shipOutside: num(s.profit_ship_outside, num(s.delivery_outside, 120)),
    returnCost: num(s.profit_return_cost, 0),
    codPct: Math.min(10, num(s.profit_cod_pct, 1)),
  };
}

export type ProfitReport = {
  range: Range;
  sold: number;
  returned: number;
  revenue: number;        // ক্রেতা যা দিয়েছে (পণ্য + ডেলিভারি − ছাড়)
  productSales: number;   // পণ্যের দাম − ছাড়
  deliveryIn: number;     // ক্রেতার কাছ থেকে নেওয়া ডেলিভারি চার্জ
  cogs: number;
  noCost: number;         // ক্রয়মূল্য দেওয়া নেই এমন লাইন
  shipping: number;
  returnLoss: number;
  cod: number;
  ads: number;
  net: number;
  products: { product_id: number; name: string; units: number; sales: number; cogs: number; noCost: number; ads: number }[];
  costs: ReturnType<typeof profitCosts>;
};

const SOLD = "o.status IN ('confirmed', 'shipped') AND COALESCE(o.outcome, '') != 'returned'";
const RETURNED = "(o.outcome = 'returned' OR (o.status = 'cancelled' AND o.consignment_id IS NOT NULL))";
const COST = "COALESCE(i.unit_cost, (SELECT v.cost_price FROM product_variants v WHERE v.id = i.variant_id), (SELECT p.cost_price FROM products p WHERE p.id = i.product_id))";

export async function profitReport(db: D1Database, s: Settings, r: Range): Promise<ProfitReport> {
  const { start, end } = utcBounds(r);
  const W = "o.created_at >= ? AND o.created_at < ?";
  const costs = profitCosts(s);
  const [sum, ship, cg, prods, ads, prodAds] = await db.batch([
    db.prepare(`SELECT SUM(${SOLD}) sold, SUM(${RETURNED}) returned,
        COALESCE(SUM(CASE WHEN ${SOLD} THEN o.total END), 0) revenue,
        COALESCE(SUM(CASE WHEN ${SOLD} THEN o.subtotal - o.discount END), 0) productSales,
        COALESCE(SUM(CASE WHEN ${SOLD} THEN o.delivery_charge END), 0) deliveryIn
      FROM orders o WHERE ${W}`).bind(start, end),
    db.prepare(`SELECT o.area, SUM(${SOLD} OR ${RETURNED}) parcels, SUM(${RETURNED}) returned FROM orders o WHERE ${W} GROUP BY o.area`).bind(start, end),
    db.prepare(`SELECT COALESCE(SUM(COALESCE(i.qty, 1) * COALESCE(${COST}, 0)), 0) cogs, SUM(${COST} IS NULL) noCost
      FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${W} AND ${SOLD}`).bind(start, end),
    db.prepare(`SELECT i.product_id, MAX(i.product_name) name, SUM(COALESCE(i.qty, 1)) units, SUM(i.price * COALESCE(i.qty, 1)) sales,
        SUM(COALESCE(i.qty, 1) * COALESCE(${COST}, 0)) cogs, SUM(${COST} IS NULL) noCost
      FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${W} AND ${SOLD}
      GROUP BY i.product_id ORDER BY sales DESC LIMIT 50`).bind(start, end),
    db.prepare("SELECT COALESCE(SUM(amount), 0) n FROM ad_spend WHERE day >= ? AND day <= ?").bind(r.from, r.to),
    db.prepare("SELECT product_id, SUM(amount) n FROM ad_spend WHERE day >= ? AND day <= ? AND product_id IS NOT NULL GROUP BY product_id").bind(r.from, r.to),
  ]);
  const t = (sum!.results[0] ?? {}) as Record<string, number | null>;
  let shipping = 0;
  for (const x of ship!.results as { area: string; parcels: number; returned: number }[]) {
    shipping += (x.parcels ?? 0) * (x.area === "outside" ? costs.shipOutside : costs.shipInside);
  }
  const returned = t.returned ?? 0;
  const revenue = t.revenue ?? 0;
  const c = (cg!.results[0] ?? {}) as { cogs: number; noCost: number };
  const adsTotal = (ads!.results[0] as { n: number }).n;
  const returnLoss = returned * costs.returnCost;
  const cod = Math.round((revenue * costs.codPct) / 100);
  const pa = new Map((prodAds!.results as { product_id: number; n: number }[]).map((x) => [x.product_id, x.n]));
  return {
    range: r,
    sold: t.sold ?? 0,
    returned,
    revenue,
    productSales: t.productSales ?? 0,
    deliveryIn: t.deliveryIn ?? 0,
    cogs: c.cogs ?? 0,
    noCost: c.noCost ?? 0,
    shipping: Math.round(shipping),
    returnLoss: Math.round(returnLoss),
    cod,
    ads: adsTotal,
    net: Math.round(revenue - (c.cogs ?? 0) - shipping - returnLoss - cod - adsTotal),
    products: (prods!.results as ProfitReport["products"]).map((p) => ({ ...p, ads: pa.get(p.product_id) ?? 0 })),
    costs,
  };
}

/** কনফার্মের সময় ক্রয়মূল্য অর্ডারে রেখে দেওয়া */
export async function snapshotCost(db: D1Database, orderId: number) {
  await db
    .prepare(
      `UPDATE order_items SET unit_cost = COALESCE((SELECT v.cost_price FROM product_variants v WHERE v.id = order_items.variant_id),
         (SELECT p.cost_price FROM products p WHERE p.id = order_items.product_id))
       WHERE order_id = ? AND unit_cost IS NULL`,
    )
    .bind(orderId)
    .run();
}
