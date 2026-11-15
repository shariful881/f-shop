/**
 * ধাপ ৭: পণ্যের রিভিউ — শুধু যে কিনেছে সে দিতে পারে (অর্ডার নম্বর + মোবাইল মিলিয়ে),
 * দোকানদার অনুমোদন করলে তবেই দোকানে দেখায়। বানানো রিভিউয়ের সুযোগ রাখা হয়নি।
 */
export type ReviewStatus = "pending" | "approved" | "hidden";
export type Review = {
  id: number;
  product_id: number;
  order_id: number;
  name: string;
  rating: number;
  body: string | null;
  image: string | null;
  status: ReviewStatus;
  reply: string | null;
  created_at: string;
  product_name?: string;
  order_no?: string;
};

export const REVIEW_TABS: Record<ReviewStatus, string> = { pending: "অনুমোদনের অপেক্ষায়", approved: "দোকানে দেখাচ্ছে", hidden: "লুকানো" };

/** রিভিউ দেওয়া যায় এমন অর্ডার: কনফার্ম/শিপড, ফেরত নয় */
export async function reviewableOrder(db: D1Database, orderNo: string, phone: string) {
  const o = await db
    .prepare("SELECT id, order_no, name, phone, status, outcome FROM orders WHERE order_no = ? AND phone = ?")
    .bind(orderNo, phone)
    .first<{ id: number; order_no: string; name: string; phone: string; status: string; outcome: string | null }>();
  if (!o) return { error: "এই অর্ডার নম্বর আর মোবাইল মেলেনি" as const };
  if (!["confirmed", "shipped"].includes(o.status) || o.outcome === "returned") return { error: "পণ্য হাতে পাওয়ার পর রিভিউ দেওয়া যায়" as const };
  const { results: items } = await db
    .prepare(
      `SELECT DISTINCT i.product_id, i.product_name, (SELECT 1 FROM reviews r WHERE r.order_id = i.order_id AND r.product_id = i.product_id) done
       FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = ?`,
    )
    .bind(o.id)
    .all<{ product_id: number; product_name: string; done: number | null }>();
  return { order: o, items };
}

/** অনুমোদিত রিভিউ থেকে পণ্যের গড় তারা */
export async function refreshRating(db: D1Database, productId: number) {
  await db
    .prepare(
      `UPDATE products SET
         rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ?1 AND status = 'approved'),
         rating_avg = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = ?1 AND status = 'approved'), 0)
       WHERE id = ?1`,
    )
    .bind(productId)
    .run();
}

export async function productReviews(db: D1Database, productId: number, limit = 20): Promise<Review[]> {
  const { results } = await db
    .prepare("SELECT * FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY (image IS NOT NULL) DESC, id DESC LIMIT ?")
    .bind(productId, limit)
    .all<Review>();
  return results;
}

export async function adminReviews(db: D1Database, status: ReviewStatus): Promise<Review[]> {
  const { results } = await db
    .prepare(
      `SELECT r.*, p.name product_name, o.order_no FROM reviews r JOIN products p ON p.id = r.product_id LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.status = ? ORDER BY r.id DESC LIMIT 200`,
    )
    .bind(status)
    .all<Review>();
  return results;
}

export async function reviewCounts(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db.prepare("SELECT status, COUNT(*) n FROM reviews GROUP BY status").all<{ status: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.status, r.n]));
}

/** নাম ছোট করে দেখানো: "রহিম উদ্দিন" → "রহিম উ." (গোপনীয়তা) */
export function shortName(n: string) {
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]!.slice(0, 1)}.` : parts[0] || "ক্রেতা";
}

export const stars = (n: number) => "★★★★★".slice(0, Math.round(n)) + "☆☆☆☆☆".slice(0, 5 - Math.round(n));
