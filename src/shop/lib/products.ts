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
  options_json?: string | null;
  landing_json?: string | null;
  /** হোম/তালিকায়: কতগুলো চালু ভ্যারিয়েন্ট আছে */
  variant_count?: number;
  /** কার্ট/অর্ডারের লাইনে: বাছাই করা ভ্যারিয়েন্ট (price তখন ভ্যারিয়েন্টের দাম) */
  variant_id?: number | null;
  variant_label?: string | null;
};

export type Variant = { id: number; product_id: number; label: string; price: number | null; active: number; sort_order: number };

export type ProductOption = { name: string; values: string[] };

export function parseOptions(json: string | null | undefined): ProductOption[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((o) => o && typeof o.name === "string" && Array.isArray(o.values)).slice(0, 2) : [];
  } catch {
    return [];
  }
}

/** অপশন থেকে সব কম্বিনেশন: [["লাল","S"],["লাল","M"],...] → "লাল / S" */
export function variantLabels(options: ProductOption[]): string[] {
  const opts = options.filter((o) => o.values.length);
  if (!opts.length) return [];
  let combos: string[][] = [[]];
  for (const o of opts) combos = combos.flatMap((c) => o.values.map((v) => [...c, v]));
  return combos.map((c) => c.join(" / "));
}

export async function productVariants(db: D1Database, productId: number, onlyActive = false): Promise<Variant[]> {
  const { results } = await db
    .prepare(`SELECT * FROM product_variants WHERE product_id = ? ${onlyActive ? "AND active = 1" : ""} ORDER BY sort_order, id`)
    .bind(productId)
    .all<Variant>();
  return results;
}

/** পণ্যের অপশন বদলালে ভ্যারিয়েন্ট নতুন করে সাজানো (আগের দাম/স্টক ঠিক রেখে) */
export async function syncVariants(db: D1Database, productId: number, options: ProductOption[]) {
  const labels = variantLabels(options);
  const stmts = labels.map((label, i) =>
    db.prepare("INSERT INTO product_variants (product_id, label, sort_order) VALUES (?, ?, ?) ON CONFLICT(product_id, label) DO UPDATE SET sort_order = excluded.sort_order")
      .bind(productId, label, i),
  );
  if (labels.length) {
    stmts.push(db.prepare(`DELETE FROM product_variants WHERE product_id = ? AND label NOT IN (${labels.map(() => "?").join(",")})`).bind(productId, ...labels));
  } else {
    stmts.push(db.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(productId));
  }
  await db.batch(stmts);
}

export type CartEntry = { productId: number; variantId: number | null };

/**
 * কার্ট/অর্ডারের লাইন: চালু পণ্য + (থাকলে) চালু ভ্যারিয়েন্ট।
 * যে পণ্যের ভ্যারিয়েন্ট আছে কিন্তু বাছাই করা হয়নি বা স্টকে নেই — সেটা বাদ যায়।
 */
export async function cartLines(db: D1Database, entries: CartEntry[]): Promise<Product[]> {
  if (!entries.length) return [];
  const ids = entries.map((e) => e.productId);
  const ph = ids.map(() => "?").join(",");
  const [p, v] = await db.batch([
    db.prepare(`SELECT * FROM products WHERE is_active = 1 AND id IN (${ph})`).bind(...ids),
    db.prepare(`SELECT * FROM product_variants WHERE active = 1 AND product_id IN (${ph})`).bind(...ids),
  ]);
  const products = p!.results as Product[];
  const variants = v!.results as Variant[];
  const lines: Product[] = [];
  for (const e of entries) {
    const prod = products.find((x) => x.id === e.productId);
    if (!prod) continue;
    const own = variants.filter((x) => x.product_id === prod.id);
    if (!own.length) {
      lines.push({ ...prod, variant_id: null, variant_label: null });
      continue;
    }
    const chosen = own.find((x) => x.id === e.variantId);
    if (!chosen) continue;
    lines.push({ ...prod, price: chosen.price ?? prod.price, variant_id: chosen.id, variant_label: chosen.label });
  }
  return lines;
}

export type Category = { id: number; name: string; sort_order: number };

export type HomeSection = { category: Category; products: Product[] };

/** হোম পেজের সেকশন: ক্যাটাগরির ক্রম অনুযায়ী, শুধু চালু আর হোমে দেখানো পণ্য */
export async function homeSections(db: D1Database): Promise<HomeSection[]> {
  const [cats, prods] = await db.batch([
    db.prepare("SELECT id, name, sort_order FROM categories ORDER BY sort_order, id"),
    db.prepare("SELECT p.*, (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.active = 1) AS variant_count FROM products p WHERE p.is_active = 1 AND p.show_on_home = 1 ORDER BY p.sort_order, p.id"),
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
