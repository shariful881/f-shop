export type Product = {
  id: number;
  meta_title?: string | null;
  meta_description?: string | null;
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
  /** স্টক (ধাপ ৪) — ভ্যারিয়েন্ট থাকলে চালু ভ্যারিয়েন্টের যোগফল */
  track_stock?: number;
  stock?: number;
  low_stock?: number;
  cost_price?: number | null;
  /** বাড়তি তথ্য (shop 0029) */
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  gallery_json?: string | null;
  features?: string | null;
  stock_status?: string | null;
  rating_avg?: number;
  rating_count?: number;
  /** কার্টের লাইনে: কতটা কেনা যায় (স্টক না গুনলে null) */
  stock_left?: number | null;
  /** হোম/তালিকায়: কতগুলো চালু ভ্যারিয়েন্ট আছে */
  variant_count?: number;
  /** কার্ট/অর্ডারের লাইনে: বাছাই করা ভ্যারিয়েন্ট (price তখন ভ্যারিয়েন্টের দাম) */
  variant_id?: number | null;
  variant_label?: string | null;
  /** কার্ট/অর্ডারের লাইনে: পরিমাণ (না থাকলে ১) */
  qty?: number;
};

/** লাইনের মোট দাম (একক দাম × পরিমাণ) */
export const lineTotal = (p: { price: number; qty?: number }) => p.price * (p.qty ?? 1);
export const linesSubtotal = (list: { price: number; qty?: number }[]) => list.reduce((s, p) => s + lineTotal(p), 0);

export type Variant = { id: number; product_id: number; label: string; price: number | null; active: number; sort_order: number; stock?: number; cost_price?: number | null };

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

export type CartEntry = { productId: number; variantId: number | null; qty?: number };

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
    const track = prod.track_stock === 1;
    if (prod.stock_status === "out") continue; // দোকানদার "স্টক নেই" বসিয়েছেন
    if (!own.length) {
      // স্টক শেষ হলে কেনা যায় না
      if (track && (prod.stock ?? 0) <= 0) continue;
      lines.push({ ...prod, variant_id: null, variant_label: null, qty: e.qty ?? 1, stock_left: track ? prod.stock ?? 0 : null });
      continue;
    }
    const chosen = own.find((x) => x.id === e.variantId);
    if (!chosen || (track && (chosen.stock ?? 0) <= 0)) continue;
    lines.push({ ...prod, price: chosen.price ?? prod.price, variant_id: chosen.id, variant_label: chosen.label, qty: e.qty ?? 1, stock_left: track ? chosen.stock ?? 0 : null });
  }
  return lines;
}

export type Category = { id: number; name: string; sort_order: number; parent_id?: number | null; title?: string | null; image?: string | null; description?: string | null };

/** গাছের ক্রমে সাজানো: উপরের ক্যাটাগরি, তার নিচে তার সাব-ক্যাটাগরি (depth 1) */
export function categoryTree<T extends Category>(cats: T[]): (T & { depth: number })[] {
  const ids = new Set(cats.map((c) => c.id));
  const top = cats.filter((c) => !c.parent_id || !ids.has(c.parent_id));
  const out: (T & { depth: number })[] = [];
  for (const t of top) {
    out.push({ ...t, depth: 0 });
    for (const ch of cats.filter((c) => c.parent_id === t.id)) out.push({ ...ch, depth: 1 });
  }
  return out;
}

/** একটা ক্যাটাগরি আর তার সাব-ক্যাটাগরির আইডি */
export const withChildren = (cats: Category[], id: number) => [id, ...cats.filter((c) => c.parent_id === id).map((c) => c.id)];

/** "উপরের › নিচের" নাম */
export function categoryLabel(cats: Category[], c: Category): string {
  const parent = c.parent_id ? cats.find((x) => x.id === c.parent_id) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

export type HomeSection = { category: Category; products: Product[] };

/** হোম পেজের সেকশন: ক্যাটাগরির ক্রম অনুযায়ী, শুধু চালু আর হোমে দেখানো পণ্য */
export async function homeSections(db: D1Database): Promise<HomeSection[]> {
  const [cats, prods] = await db.batch([
    db.prepare("SELECT id, name, sort_order, parent_id, image FROM categories ORDER BY sort_order, id"),
    db.prepare("SELECT p.*, (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.active = 1) AS variant_count FROM products p WHERE p.is_active = 1 AND p.show_on_home = 1 ORDER BY p.sort_order, p.id"),
  ]);
  const products = prods!.results as Product[];
  const all = cats!.results as Category[];
  // হোমে শুধু উপরের ক্যাটাগরি; সাব-ক্যাটাগরির পণ্য তার উপরেরটায় দেখায়
  return categoryTree(all).filter((c) => c.depth === 0)
    .map(({ depth: _d, ...category }) => { const ids = withChildren(all, category.id); return { category, products: products.filter((p) => p.category_id != null && ids.includes(p.category_id)) }; })
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

/** গ্যালারির ছবির key-গুলো (মূল ছবি বাদে), সর্বোচ্চ ৯টা */
export const GALLERY_MAX = 9;
export function parseGallery(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && !!k).slice(0, GALLERY_MAX) : [];
  } catch {
    return [];
  }
}

/** মূল বৈশিষ্ট্য — প্রতি লাইনে একটা */
export const parseFeatures = (s: string | null | undefined): string[] =>
  (s || "").split(/\r?\n/).map((x) => x.replace(/^[\s•\-*✓✔]+/, "").trim()).filter(Boolean).slice(0, 20);
