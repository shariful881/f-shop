export type Product = {
  id: number;
  category_id: number | null;
  name: string;
  slug: string;
  price: number;
  compare_price: number | null;
  image: string | null;
  headline: string | null;
  short_desc: string | null;
  details_html: string | null;
  youtube_url: string | null;
  is_active: number;
  show_on_home: number;
  sort_order: number;
};

export type Category = { id: number; name: string; sort_order: number };

export type HomeSection = { category: Category; products: Product[] };

/** হোম পেজের সেকশন: ক্যাটাগরির ক্রম অনুযায়ী, শুধু চালু আর হোমে দেখানো পণ্য */
export async function homeSections(db: D1Database): Promise<HomeSection[]> {
  const [cats, prods] = await db.batch([
    db.prepare("SELECT id, name, sort_order FROM categories ORDER BY sort_order, id"),
    db.prepare("SELECT * FROM products WHERE is_active = 1 AND show_on_home = 1 ORDER BY sort_order, id"),
  ]);
  const products = prods!.results as Product[];
  return (cats!.results as Category[])
    .map((category) => ({ category, products: products.filter((p) => p.category_id === category.id) }))
    .filter((s) => s.products.length > 0);
}

export async function activeProductBySlug(db: D1Database, slug: string): Promise<Product | null> {
  return db.prepare("SELECT * FROM products WHERE slug = ? AND is_active = 1").bind(slug).first<Product>();
}

/** আইডিগুলোর চালু পণ্য, আইডির ক্রম ঠিক রেখে */
export async function activeProductsByIds(db: D1Database, ids: number[]): Promise<Product[]> {
  if (!ids.length) return [];
  const { results } = await db
    .prepare(`SELECT * FROM products WHERE is_active = 1 AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<Product>();
  return ids.map((id) => results.find((p) => p.id === id)).filter((p): p is Product => !!p);
}
