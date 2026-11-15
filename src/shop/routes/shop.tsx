import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv, Ctx } from "../env";
import { Layout } from "../views/layout";
import { CartPage, CheckoutPage, HomePage, LandingPage, NotFoundPage, ThanksPage, type FormState } from "../views/shop";
import { ComingSoonPage, ListingPage, SORTS, StoreHome, TrackPage } from "../views/pro";
import { normalizePhone } from "../lib/phone";
import { InvoicePage } from "../views/invoice";
import { sanitizeHtml } from "../lib/sanitize";
import { ADMIN_COOKIE } from "../middleware/admin-auth";
import { themeConfig } from "../lib/theme-config";
import { themeOf } from "../lib/settings";
import { activeProductBySlug, activeProductsByIds, cartLines, homeSections, linesSubtotal, productVariants, type Product } from "../lib/products";
import { addToCart, clearCart, maxQty, readCart, readCartEntries, removeFromCart, setCartQty, upsertCart } from "../lib/cart";
import { ProductPage } from "../views/product";
import { parseLanding } from "../lib/landing";
import { createOrder, getOrderByNo, orderPrefix } from "../lib/orders";
import { checkCoupon, normalizeCode } from "../lib/coupons";
import { deliveryCharge, minOrderAmount } from "../lib/settings";
import { publicOrigin, clientIp, isHttps, publicUrl, str, toInt, wantsJson } from "../lib/http";
import { bn, imageUrl, taka } from "../lib/format";
import { page } from "../lib/render";
import { newEventId, trackServer, type CustomData } from "../lib/capi";
import { PixelHead, type BrowserEvent } from "../views/pixel";
import { validateOrderInput, checkOrderGuards, acquireOrderLocks, releaseOrderLocks, hitRateLimit, ORDER_RATE_LIMIT } from "../lib/order-guard";
import { isUuid } from "../middleware/device";
import { markConverted, saveDraft } from "../lib/incomplete";
import { SOLD_OUT_MSG, soldOut, variantsForSale } from "../lib/stock";
import { feedItems, feedOn, toFeedCsv, toRss } from "../lib/feed";
import { advanceAmount, advanceConfig, needsAdvance, normalizeTrx, payMethods } from "../lib/payment";
import { ownRecords, riskOf, sharedRecords } from "../lib/fraud";
import { productReviews, reviewableOrder } from "../lib/reviews";
import { ReviewPage, ReviewsBlock, type ReviewFormState } from "../views/reviews";
import { imageStorageKey } from "../env";

export const shop = new Hono<AppEnv>();

/** কার্টের লাইন, প্রতিটার পরিমাণ দোকানের সর্বোচ্চ সীমার মধ্যে */
async function shopCartLines(c: Ctx, entries = readCartEntries(c)): Promise<Product[]> {
  const max = maxQty(c.var.settings);
  return (await cartLines(c.env.DB, entries)).map((l) => ({ ...l, qty: Math.min(max, l.qty ?? 1) }));
}

/* প্রো থিমে হেডারের ক্যাটাগরি মেনু (যেসব ক্যাটাগরিতে চালু পণ্য আছে) */
shop.use("*", async (c, next) => {
  if (c.req.method === "GET") {
    // দোকান সাময়িক বন্ধ: ল্যান্ডিং পেজ, অর্ডার, ধন্যবাদ, ট্র্যাকিং খোলা; অ্যাডমিন লগইন থাকলে সব দেখা যায়
    const cfg = themeConfig(c.var.settings);
    const p = c.req.path;
    if (cfg.coming_soon === "1" && !getCookie(c, ADMIN_COOKIE) && (p === "/" || /^\/(c|search|cart|checkout)(\/|$)/.test(p))) {
      c.header("X-Robots-Tag", "noindex");
      return page(c, <ComingSoonPage s={c.var.settings} cfg={cfg} />);
    }
    c.set("navCats", await navCategories(c.env.DB));
    c.set("navPages", (await c.env.DB.prepare("SELECT title, slug FROM pages WHERE is_active = 1 AND in_menu = 1 ORDER BY sort_order, id LIMIT 12").all<{ title: string; slug: string }>()).results);
  }
  await next();
});

async function navCategories(db: D1Database) {
  const { results } = await db.prepare(
    "SELECT c.id, c.name FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.is_active = 1) ORDER BY c.sort_order, c.id LIMIT 30",
  ).all<{ id: number; name: string }>();
  return results;
}

/* ---------- Facebook ট্র্যাকিং ---------- */
type TrackEvent = BrowserEvent & { serverAlreadySent?: boolean };

/**
 * পেজের Pixel কোড বানায়: PageView + পেজের নিজস্ব ইভেন্ট।
 * প্রতিটার জন্য একই event_id দিয়ে সার্ভার থেকেও (CAPI) পাঠায়, রেসপন্সের পরে।
 */
function pixel(c: Ctx, events: TrackEvent[] = []) {
  const all: TrackEvent[] = [{ name: "PageView", id: newEventId("pv") }, ...events];
  for (const e of all) if (!e.serverAlreadySent) trackServer(c, e.name, e.id, e.params);
  return <PixelHead settings={c.var.settings} deviceId={c.var.deviceId} events={all.map(({ serverAlreadySent, ...e }) => e)} />;
}

function productData(products: Product[]): CustomData {
  return {
    content_type: "product",
    content_ids: products.map((p) => String(p.id)),
    contents: products.map((p) => ({ id: String(p.id), quantity: p.qty ?? 1, item_price: p.price })),
    num_items: products.reduce((n, p) => n + (p.qty ?? 1), 0),
    value: linesSubtotal(products),
    currency: "BDT",
  };
}

/* ---------- হোম ---------- */
shop.get("/", async (c) => {
  const sections = await homeSections(c.env.DB);
  const s = c.var.settings;
  const cfg = themeConfig(s);
  const on = (k: string) => cfg[`sec_${k}`] === "1";
  // নিজে বাছাই করা অফারের পণ্য আর নতুন পণ্য
  const ids = [1, 2, 3].filter((n) => on(`offer${n}`)).flatMap((n) => (cfg[`offer${n}_products`] || "").split(",")).map((x) => parseInt(x, 10)).filter((n) => n > 0);
  const picked = new Map<number, Product>();
  if (ids.length) {
    const { results } = await c.env.DB.prepare(`${LISTING_SQL} AND p.id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<Product>();
    for (const p of results) picked.set(p.id, p);
  }
  const latest = on("latest")
    ? (await c.env.DB.prepare(`${LISTING_SQL} ORDER BY p.id DESC LIMIT ?`).bind(Math.min(12, parseInt(cfg.latest_count || "8", 10))).all<Product>()).results
    : [];
  return page(c,
    <Layout title={s.seo_title || s.site_name || "দোকান"} settings={s} cartCount={readCart(c).length} head={pixel(c)} nav={c.var.navCats} pages={c.var.navPages}>
      <StoreHome s={s} cfg={cfg} sections={sections} picked={picked} latest={latest} />
    </Layout>,
  );
});

/* ---------- ল্যান্ডিং পেজ ---------- */
async function renderLanding(c: Ctx, p: Product, form?: FormState, status: 200 | 422 | 429 | 403 = 200) {
  const s = c.var.settings;
  const variants = variantsForSale(p, await productVariants(c.env.DB, p.id));
  const cfg = themeConfig(s);
  const related = cfg.pd_related === "1" && p.category_id
    ? (await c.env.DB.prepare(`${LISTING_SQL} AND p.category_id = ? AND p.id != ? ORDER BY p.sort_order, p.id LIMIT ?`).bind(p.category_id, p.id, parseInt(cfg.pd_related_count || "4", 10)).all<Product>()).results
    : [];
  const head = pixel(c, [{ name: "ViewContent", id: newEventId("vc"), params: { ...productData([p]), content_name: p.name } }]);
  return page(c,
    <Layout title={p.meta_title || p.headline || p.name} settings={s} cartCount={readCart(c).length} head={head} nav={c.var.navCats} pages={c.var.navPages} bare
      description={p.meta_description || p.short_desc || undefined} ogImage={new URL(imageUrl(p.image), publicUrl(c)).toString()}>
      <LandingPage p={p} variants={variants} settings={s} form={form} cfg={cfg} related={related}
        reviews={reviewsOn(c) ? <ReviewsBlock reviews={await productReviews(c.env.DB, p.id)} avg={p.rating_avg ?? 0} count={p.rating_count ?? 0} slug={p.slug} /> : undefined} closed={!c.var.shopState.accepting ? ordersClosedMessage(s.contact_phone || "") : soldOut(p) ? SOLD_OUT_MSG : undefined} />
    </Layout>,
    status,
  );
}

shop.get("/p/:slug", async (c) => {
  const p = await activeProductBySlug(c.env.DB, c.req.param("slug"));
  if (!p) return notFound(c);
  return renderLanding(c, p);
});

/* ---------- পণ্যের বিস্তারিত পেজ ---------- */
async function renderProduct(c: Ctx, p: Product, error?: string) {
  const s = c.var.settings;
  const cfg = themeConfig(s);
  const variants = variantsForSale(p, await productVariants(c.env.DB, p.id));
  // ছবি: পণ্যের মূল ছবি + ল্যান্ডিং পেজের গ্যালারির ছবি (থাকলে)
  const images = [p.image, ...(parseLanding(p.landing_json)?.sections.filter((x) => x.type === "gallery").flatMap((x) => x.data.images ?? []) ?? [])]
    .filter((k, i, a): k is string => !!k && a.indexOf(k) === i).slice(0, 10);
  const [rel, cat] = await Promise.all([
    cfg.pd_related === "1" && p.category_id
      ? c.env.DB.prepare(`${LISTING_SQL} AND p.category_id = ? AND p.id != ? ORDER BY p.sort_order, p.id LIMIT ?`).bind(p.category_id, p.id, parseInt(cfg.pd_related_count || "4", 10)).all<Product>()
      : Promise.resolve({ results: [] as Product[] }),
    p.category_id ? c.env.DB.prepare("SELECT id, name FROM categories WHERE id = ?").bind(p.category_id).first<{ id: number; name: string }>() : Promise.resolve(null),
  ]);
  const head = pixel(c, [{ name: "ViewContent", id: newEventId("vc"), params: { ...productData([p]), content_name: p.name } }]);
  return page(c,
    <Layout title={p.meta_title || p.name} settings={s} cartCount={readCart(c).length} head={head} nav={c.var.navCats} pages={c.var.navPages} bare
      description={p.meta_description || p.short_desc || undefined} ogImage={new URL(imageUrl(p.image), publicUrl(c)).toString()}>
      <ProductPage p={p} images={images} variants={variants} s={s} cfg={cfg} related={rel.results} category={cat} error={error}
        reviews={reviewsOn(c) ? <ReviewsBlock reviews={await productReviews(c.env.DB, p.id)} avg={p.rating_avg ?? 0} count={p.rating_count ?? 0} slug={p.slug} /> : undefined}
        closed={!c.var.shopState.accepting ? ordersClosedMessage(s.contact_phone || "") : soldOut(p) ? SOLD_OUT_MSG : undefined} />
    </Layout>,
    error ? 422 : 200,
  );
}

shop.get("/product/:slug", async (c) => {
  const p = await activeProductBySlug(c.env.DB, c.req.param("slug"));
  if (!p) return notFound(c);
  return renderProduct(c, p, c.req.query("need") === "variant" ? "সাইজ/রং বাছাই করুন" : undefined);
});

/* ---------- ক্যাটাগরি আর সার্চ ---------- */
const ORDER_SQL: Record<string, string> = { "": "p.sort_order, p.id", new: "p.id DESC", price_asc: "p.price, p.id", price_desc: "p.price DESC, p.id", name: "p.name, p.id" };
const sortKey = (v: unknown) => (typeof v === "string" && v in SORTS ? v : "");
const LISTING_SQL = "SELECT p.*, (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.active = 1) AS variant_count FROM products p WHERE p.is_active = 1";

/** দামের ফিল্টার আর পাতা ভাগ */
function listParams(c: Ctx) {
  const cfg = themeConfig(c.var.settings);
  const per = [24, 48, 96].includes(toInt(cfg.list_per_page)) ? toInt(cfg.list_per_page) : 24;
  const min = Math.max(0, toInt(c.req.query("min")));
  const max = Math.max(0, toInt(c.req.query("max")));
  const pageNo = Math.max(1, toInt(c.req.query("page"), 1));
  const where = `${min ? " AND p.price >= " + min : ""}${max ? " AND p.price <= " + max : ""}`;
  return { per, min, max, pageNo, where, offset: (pageNo - 1) * per };
}

shop.get("/c/:id{[0-9]+}", async (c) => {
  const cat = await c.env.DB.prepare("SELECT id, name FROM categories WHERE id = ?").bind(toInt(c.req.param("id"))).first<{ id: number; name: string }>();
  if (!cat) return notFound(c);
  const sort = sortKey(c.req.query("sort"));
  const lp = listParams(c);
  const [rows, cnt] = await c.env.DB.batch([
    c.env.DB.prepare(`${LISTING_SQL} AND p.category_id = ?${lp.where} ORDER BY ${ORDER_SQL[sort]} LIMIT ? OFFSET ?`).bind(cat.id, lp.per, lp.offset),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM products p WHERE p.is_active = 1 AND p.category_id = ?${lp.where}`).bind(cat.id),
  ]);
  const results = rows!.results as Product[];
  const total = (cnt!.results[0] as { n: number }).n;
  const s = c.var.settings;
  return page(c,
    <Layout title={`${cat.name} — ${s.site_name || ""}`} settings={s} cartCount={readCart(c).length} head={pixel(c)} nav={c.var.navCats} pages={c.var.navPages}>
      <ListingPage title={cat.name} products={results} nav={c.var.navCats ?? []} activeId={cat.id} cfg={themeConfig(s)} sort={sort} total={total} lp={lp} />
    </Layout>,
  );
});

shop.get("/search", async (c) => {
  const q = str(c.req.query("q"), 60);
  const sort = sortKey(c.req.query("sort"));
  const lp = listParams(c);
  let results: Product[] = [];
  let total = 0;
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
    const cond = `(p.name LIKE ? ESCAPE '\\' OR p.headline LIKE ? ESCAPE '\\')${lp.where}`;
    const [rows, cnt] = await c.env.DB.batch([
      c.env.DB.prepare(`${LISTING_SQL} AND ${cond} ORDER BY ${ORDER_SQL[sort]} LIMIT ? OFFSET ?`).bind(like, like, lp.per, lp.offset),
      c.env.DB.prepare(`SELECT COUNT(*) n FROM products p WHERE p.is_active = 1 AND ${cond}`).bind(like, like),
    ]);
    results = rows!.results as Product[];
    total = (cnt!.results[0] as { n: number }).n;
  }
  const s = c.var.settings;
  return page(c,
    <Layout title={q ? `"${q}" খোঁজার ফল` : "পণ্য খুঁজুন"} settings={s} cartCount={readCart(c).length} head={pixel(c)} nav={c.var.navCats} pages={c.var.navPages} q={q}>
      <ListingPage title={q ? `"${q}" খোঁজার ফল` : "পণ্য খুঁজুন"} products={results} q={q} nav={c.var.navCats ?? []} cfg={themeConfig(s)} sort={sort} total={total} lp={lp} />
    </Layout>,
  );
});

/* ---------- অর্ডার ট্র্যাকিং (অর্ডার নম্বর + মোবাইল নম্বর মিললে) ---------- */
shop.get("/track", async (c) => {
  const s = c.var.settings;
  const no = str(c.req.query("order"), 30).toUpperCase();
  const phone = normalizePhone(str(c.req.query("phone"), 20));
  let result: Awaited<ReturnType<typeof getOrderByNo>> = null;
  let error = "";
  if (no || c.req.query("phone")) {
    if (!(await hitRateLimit(c.env.DB, `track:${clientIp(c)}`, 20, 600))) error = "অনেকবার চেষ্টা করেছেন, কিছুক্ষণ পরে আবার চেষ্টা করুন।";
    else {
      const data = no ? await getOrderByNo(c.env.DB, no) : null;
      if (data && phone && data.order.phone === phone) result = data;
      else error = "এই অর্ডার নম্বর আর মোবাইল নম্বরে কোনো অর্ডার পাওয়া যায়নি।";
    }
  }
  c.header("X-Robots-Tag", "noindex");
  return page(c,
    <Layout title="অর্ডার ট্র্যাক করুন" settings={s} cartCount={readCart(c).length} nav={c.var.navCats} pages={c.var.navPages}>
      <TrackPage s={s} order={result} error={error} values={{ order: no, phone: str(c.req.query("phone"), 20) }} />
    </Layout>,
  );
});

/* ---------- নিজের পেজ (আমাদের সম্পর্কে, রিটার্ন নীতি...) ---------- */
shop.get("/page/:slug", async (c) => {
  const pg = await c.env.DB.prepare("SELECT title, content FROM pages WHERE slug = ? AND is_active = 1").bind(str(c.req.param("slug"), 80)).first<{ title: string; content: string }>();
  if (!pg) return notFound(c);
  const s = c.var.settings;
  return page(c,
    <Layout title={`${pg.title} — ${s.site_name || ""}`} settings={s} cartCount={readCart(c).length} head={pixel(c)} nav={c.var.navCats} pages={c.var.navPages}>
      <div class="wrap narrow px-page"><h1 class="page-title">{pg.title}</h1><div class="details" dangerouslySetInnerHTML={{ __html: sanitizeHtml(pg.content) }} /></div>
    </Layout>,
  );
});

/* কাস্টমারের ইনভয়েস ডাউনলোড (অর্ডার নম্বর + মোবাইল মিললে) */
shop.get("/track/invoice", async (c) => {
  const no = str(c.req.query("order"), 30).toUpperCase();
  const phone = normalizePhone(str(c.req.query("phone"), 20));
  if (!(await hitRateLimit(c.env.DB, `track:${clientIp(c)}`, 20, 600))) return c.text("অনেকবার চেষ্টা করেছেন, কিছুক্ষণ পরে আবার চেষ্টা করুন।", 429);
  const data = no ? await getOrderByNo(c.env.DB, no) : null;
  if (!data || !phone || data.order.phone !== phone) return notFound(c);
  c.header("X-Robots-Tag", "noindex");
  return page(c, <InvoicePage list={[data]} s={c.var.settings} size="a4" />);
});

/* ---------- কার্ট ---------- */
shop.post("/cart/add", async (c) => {
  const body = await c.req.parseBody();
  const id = toInt(body.product_id);
  const variantId = toInt(body.variant_id) || null;
  const [product] = await cartLines(c.env.DB, [{ productId: id, variantId }]);
  if (!product) {
    const exists = await activeProductsByIds(c.env.DB, [id]);
    if (exists[0]) {
      // ভ্যারিয়েন্ট বাছাই করা দরকার — পণ্যের পেজে ফেরত
      const back = `/product/${exists[0].slug}?need=variant#buy`;
      return wantsJson(c)
        ? c.json({ ok: false, message: "সাইজ/রং বাছাই করুন", redirect: back }, 422)
        : c.redirect(back, 303);
    }
    return wantsJson(c) ? c.json({ ok: false, message: "পণ্যটি পাওয়া যায়নি" }, 404) : c.redirect("/cart", 303);
  }
  const max = maxQty(c.var.settings);
  const qty = Math.min(max, Math.max(1, toInt(body.qty, 1)));
  // এখনই কিনুন: কার্টে রেখে সরাসরি চেকআউটে
  if (body.buy_now) {
    const already = readCartEntries(c).some((e) => e.productId === id);
    upsertCart(c, id, product.variant_id ?? null, qty, max);
    if (!already) trackServer(c, "AddToCart", newEventId("atc"), { ...productData([{ ...product, qty }]), content_name: product.name });
    return c.redirect("/checkout", 303);
  }
  const result = addToCart(c, id, product.variant_id ?? null, qty, max);
  const before = readCartEntries(c).reduce((n, e) => n + (e.qty ?? 1), 0);
  const prevQty = readCartEntries(c).find((e) => e.productId === id)?.qty ?? 0;
  const count = result === "max" ? before : before - prevQty + Math.min(max, prevQty + qty);
  let eventId: string | null = null;
  const fbParams = { ...productData([{ ...product, qty }]), content_name: product.name };
  if (result !== "max") {
    eventId = newEventId("atc");
    trackServer(c, "AddToCart", eventId, fbParams);
  }
  if (wantsJson(c)) {
    return c.json({
      ok: result !== "max",
      message: result === "added" ? "কার্টে যোগ হয়েছে" : result === "more" ? "কার্টে পরিমাণ বাড়ানো হয়েছে" : `এই পণ্য একবারে সর্বোচ্চ ${bn(max)}টা নেওয়া যায়`,
      count,
      event_id: eventId,
      fb_params: fbParams,
    });
  }
  return c.redirect(typeof body.back === "string" && body.back === "/checkout" ? "/checkout" : "/cart", 303);
});

/** কার্ট/চেকআউটে পরিমাণ বদলানো (+/−) */
shop.post("/cart/qty", async (c) => {
  const body = await c.req.parseBody();
  const max = maxQty(c.var.settings);
  const q = setCartQty(c, toInt(body.product_id), toInt(body.qty, 1), max);
  const back = body.back === "/checkout" ? "/checkout" : "/cart";
  if (!wantsJson(c)) return c.redirect(back, 303);
  if (q === null) return c.json({ ok: false, message: "পণ্যটি কার্টে নেই" }, 404);
  // নতুন হিসাব
  const entries = readCartEntries(c).map((e) => (e.productId === toInt(body.product_id) ? { ...e, qty: q } : e));
  const lines = await shopCartLines(c, entries);
  const line = lines.find((l) => l.id === toInt(body.product_id));
  return c.json({ ok: true, qty: q, max, line_total: line ? line.price * q : 0, subtotal: linesSubtotal(lines), count: entries.reduce((n, e) => n + (e.qty ?? 1), 0) });
});

shop.post("/cart/remove", async (c) => {
  const body = await c.req.parseBody();
  const id = toInt(body.product_id);
  removeFromCart(c, id);
  if (wantsJson(c)) {
    const entries = readCartEntries(c).filter((e) => e.productId !== id);
    const lines = await shopCartLines(c, entries);
    return c.json({ ok: true, subtotal: linesSubtotal(lines), count: entries.reduce((n, e) => n + (e.qty ?? 1), 0), empty: lines.length === 0 });
  }
  return c.redirect(body.back === "/checkout" ? "/checkout" : "/cart", 303);
});

shop.get("/cart", async (c) => {
  const products = await shopCartLines(c);
  const s = c.var.settings;
  return page(c,
    <Layout title="কার্ট" settings={s} cartCount={products.reduce((n, p) => n + (p.qty ?? 1), 0)} head={pixel(c)} nav={c.var.navCats} pages={c.var.navPages}>
      <CartPage products={products} max={maxQty(s)} />
    </Layout>,
  );
});

function renderCheckout(c: Ctx, products: Product[], form?: FormState, status: 200 | 422 | 429 | 403 = 200) {
  const s = c.var.settings;
  const head = pixel(c, [{ name: "InitiateCheckout", id: newEventId("ic"), params: productData(products) }]);
  return page(c,
    <Layout title="চেকআউট" settings={s} cartCount={products.reduce((n, p) => n + (p.qty ?? 1), 0)} head={head} nav={c.var.navCats} pages={c.var.navPages} bare>
      <CheckoutPage products={products} settings={s} form={form} max={maxQty(s)} closed={c.var.shopState.accepting ? undefined : ordersClosedMessage(s.contact_phone || "")} />
    </Layout>,
    status,
  );
}

shop.get("/checkout", async (c) => {
  const products = await shopCartLines(c);
  if (!products.length) return c.redirect("/cart", 303);
  return renderCheckout(c, products);
});

/* ---------- অর্ডার সাবমিট ---------- */
shop.post("/order", async (c) => {
  const body = await c.req.parseBody();
  const source = body.source === "cart" ? "cart" : "landing";
  const values: Record<string, string> = {
    name: str(body.name, 100),
    phone: str(body.phone, 30),
    address: str(body.address, 500),
    area: str(body.area, 10),
    note: str(body.note, 300),
    variant_id: str(body.variant_id, 12),
    coupon: normalizeCode(body.coupon),
    email: str(body.email, 120),
    pay_method: str(body.pay_method, 10), pay_trx: str(body.pay_trx, 24), pay_sender: str(body.pay_sender, 20),
    cf1: str(body.cf1, 200), cf2: str(body.cf2, 200), cf3: str(body.cf3, 200),
  };

  // কোন পণ্য: ল্যান্ডিং থেকে হলে শুধু ওই পণ্য, চেকআউট থেকে হলে কার্টের সব (ডুপ্লিকেট বাদ)
  // কার্টের লাইন: ল্যান্ডিং থেকে হলে শুধু ওই পণ্য (+ বাছাই করা ভ্যারিয়েন্ট); একই পণ্য দুবার নয়
  const entries = source === "cart"
    ? readCartEntries(c)
    : toInt(body.product_id) > 0 ? [{ productId: toInt(body.product_id), variantId: toInt(body.variant_id) || null }] : [];
  const products = await shopCartLines(c, entries);

  const fail = async (form: FormState, status: 422 | 429 | 403 = 422) => {
    if (source === "landing") {
      const p = (await c.env.DB.prepare("SELECT * FROM products WHERE id = ? AND is_active = 1").bind(toInt(body.product_id)).first<Product>());
      if (!p) return c.redirect("/", 303);
      return renderLanding(c, p, { ...form, values }, status);
    }
    if (!products.length) return c.redirect("/cart", 303);
    return renderCheckout(c, products, { ...form, values }, status);
  };

  // ০. rate limit: একই IP থেকে মিনিটে সর্বোচ্চ ৫ বার অর্ডার সাবমিট
  if (!(await hitRateLimit(c.env.DB, `order:${clientIp(c)}`, ORDER_RATE_LIMIT.max, ORDER_RATE_LIMIT.windowSec))) {
    return fail({ alert: "অনেকবার চেষ্টা করা হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।" }, 429);
  }

  if (!products.length) {
    if (source === "landing" && toInt(body.product_id) > 0) {
      const [lp] = await activeProductsByIds(c.env.DB, [toInt(body.product_id)]);
      if (lp && soldOut(lp)) return fail({ alert: SOLD_OUT_MSG });
      const vs = await productVariants(c.env.DB, toInt(body.product_id), true);
      if (vs.length) {
        const chosen = vs.find((x) => x.id === toInt(body.variant_id));
        return chosen ? fail({ alert: `দুঃখিত, "${chosen.label}" এখন স্টকে নেই — অন্যটা বাছাই করুন।` }) : fail({ errors: { variant: "সাইজ/রং বাছাই করুন" } });
      }
    }
    return fail({ alert: source === "cart" && entries.length ? "কার্টের পণ্যগুলো এখন স্টকে নেই।" : "অর্ডারের জন্য কোনো পণ্য পাওয়া যায়নি।" });
  }
  // স্টক: কার্টের কিছু পণ্য শেষ হয়ে গেছে, বা চাওয়া পরিমাণ নেই
  if (source === "cart" && products.length < entries.length) {
    return fail({ alert: "কার্টের কিছু পণ্য এখন স্টকে নেই — কার্ট দেখে আবার চেষ্টা করুন।" });
  }
  const short = products.find((l) => l.stock_left != null && (l.qty ?? 1) > l.stock_left);
  if (short) {
    return fail({ alert: `দুঃখিত, "${short.name}${short.variant_label ? ` (${short.variant_label})` : ""}" মাত্র ${bn(short.stock_left!)}টা আছে — পরিমাণ কমিয়ে দিন।` });
  }

  // ডেমো দোকানে অর্ডার হয় না
  if (c.var.settings.demo_mode === "1") {
    return fail({ alert: "এটা ডেমো দোকান — এখানে অর্ডার নেওয়া হয় না। এই ডিজাইনে নিজের দোকান খুলতে উপরের লিংকে যান।" }, 403);
  }

  // দোকানের বিলিং বকেয়া বা স্থগিত থাকলে অনলাইনে অর্ডার বন্ধ
  if (!c.var.shopState.accepting) return fail({ alert: ordersClosedMessage(c.var.settings.contact_phone || "") }, 403);

  // সর্বনিম্ন অর্ডার (দোকানের সেটিংস)
  const minOrder = minOrderAmount(c.var.settings);
  if (minOrder && linesSubtotal(products) < minOrder) {
    return fail({ alert: `সর্বনিম্ন ${minOrder} টাকার অর্ডার করতে হবে।` });
  }

  // ১. ইনপুট যাচাই (ফোন নম্বর নরমালাইজসহ)
  const v = validateOrderInput(values);
  // চেকআউটের বাড়তি ঘর (দোকানের সেটিংস অনুযায়ী)
  const st = c.var.settings;
  const extraErrors: Record<string, string> = {};
  if (st.checkout_email === "required" && !values.email) extraErrors.email = "ইমেইল লিখুন";
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) extraErrors.email = "সঠিক ইমেইল লিখুন";
  const extras: [string, string][] = [];
  for (const n of [1, 2, 3]) {
    const label = (st[`cf${n}_label`] || "").trim();
    if (!label) continue;
    if (st[`cf${n}_req`] === "1" && !values[`cf${n}`]) extraErrors[`cf${n}`] = `${label} লিখুন`;
    if (values[`cf${n}`]) extras.push([label, values[`cf${n}`]!]);
  }
  if (!v.ok || Object.keys(extraErrors).length) return fail({ errors: { ...(v.ok ? {} : v.errors), ...extraErrors } });
  values.phone = v.phone;

  const s = c.var.settings;
  const deviceId = c.var.deviceId ?? null;
  const deviceIds = uniqueStrings([deviceId, str(body.did_ls, 64)]);

  // ২. একই নম্বর/ডিভাইস থেকে একসাথে দুইবার সাবমিট আটকানো
  const locks = await acquireOrderLocks(c.env.DB, v.phone, deviceIds);
  if (!locks) return fail({ alert: "আপনার অর্ডারটি প্রসেস হচ্ছে, অনুগ্রহ করে কয়েক সেকেন্ড অপেক্ষা করুন।" }, 429);

  try {
    // ৩. ব্ল্যাকলিস্ট আর পেন্ডিং অর্ডার চেক
    const guard = await checkOrderGuards(c.env.DB, v.phone, deviceIds, s);
    if (!guard.ok) return fail({ alert: guard.message }, 403);

    // ৪. কুপন (থাকলে) — সার্ভারে যাচাই
    const subtotal = linesSubtotal(products);
    const delivery = deliveryCharge(s, v.area, subtotal);
    let coupon: { id: number; code: string; discount: number } | null = null;
    if (values.coupon) {
      const cc = await checkCoupon(c.env.DB, values.coupon, subtotal, delivery, v.phone);
      if (!cc.ok) return fail({ errors: { coupon: cc.message } });
      coupon = { id: cc.coupon.id, code: cc.coupon.code, discount: cc.discount };
    }

    // ৪খ. অগ্রিম পেমেন্ট (দোকানের সেটিং অনুযায়ী — সব অর্ডারে, ঢাকার বাইরে, বা ঝুঁকির ক্রেতার কাছে)
    let advance: { amount: number; method: string; trx: string; sender: string | null } | null = null;
    const advCfg = advanceConfig(s);
    if (advCfg.on) {
      const total = subtotal + delivery - (coupon?.discount ?? 0);
      const amount = advanceAmount(s, total, delivery);
      let risky = false;
      if (advCfg.who === "risky") {
        const [own, shared] = await Promise.all([ownRecords(c.env.DB, [v.phone]), sharedRecords(c.env.PLATFORM_DB, s, c.env.SHOP_ID, [v.phone])]);
        const r = riskOf(own[v.phone], shared[v.phone]);
        risky = r.level === "bad" || r.level === "warn";
      }
      const need = needsAdvance(s, v.area, risky, amount);
      const trx = normalizeTrx(values.pay_trx);
      if (values.pay_trx && !trx) return fail({ errors: { pay_trx: "সঠিক Transaction ID লিখুন (ইংরেজি অক্ষর আর সংখ্যা)" }, needAdvance: need });
      if (need && !trx) {
        return fail({ alert: risky ? `এই নম্বরে আগের অর্ডারে সমস্যা ছিল, তাই অর্ডার নিশ্চিত করতে ${taka(amount)} অগ্রিম পাঠাতে হবে।` : `অর্ডার নিশ্চিত করতে ${taka(amount)} অগ্রিম পাঠিয়ে Transaction ID দিন।`, errors: { pay_trx: "Transaction ID লিখুন" }, needAdvance: true });
      }
      if (trx) {
        if (await c.env.DB.prepare("SELECT 1 FROM orders WHERE pay_trx = ?").bind(trx).first()) {
          return fail({ errors: { pay_trx: "এই Transaction ID আগেই ব্যবহার হয়েছে" }, needAdvance: true });
        }
        const method = payMethods(s).some((m) => m.key === values.pay_method) ? values.pay_method! : payMethods(s)[0]!.key;
        advance = { amount: amount > 0 ? amount : delivery, method, trx, sender: normalizePhone(values.pay_sender) };
      }
    }

    // ৫. অর্ডার সেভ
    const order = await createOrder(c.env.DB, {
      name: values.name!,
      phone: v.phone,
      address: values.address!,
      area: v.area,
      note: values.note!,
      deliveryCharge: delivery,
      deviceId,
      ip: clientIp(c),
      userAgent: (c.req.header("user-agent") || "").slice(0, 500),
      fbp: c.var.fbp ?? null,
      fbc: c.var.fbc ?? null,
      sourceUrl: (c.req.header("referer") || publicUrl(c)).slice(0, 1000),
      couponId: coupon?.id ?? null,
      couponCode: coupon?.code ?? null,
      discount: coupon?.discount ?? 0,
      email: st.checkout_email !== "off" ? values.email || null : null,
      extras,
      prefix: orderPrefix(st),
      advance,
    }, products);

    // Lead: সার্ভার এখন (রেসপন্সের পরে), ব্রাউজার ধন্যবাদ পেজে — দুই জায়গায় একই event_id
    // (Purchase এখানে কখনো যায় না — শুধু অ্যাডমিন কনফার্ম করলে)
    trackServer(c, "Lead", `lead_${order.order_no}`, { ...productData(products), value: subtotal + delivery - (coupon?.discount ?? 0) });

    await markConverted(c.env.DB, v.phone, order.id);
    if (source === "cart") clearCart(c);
    setCookie(c, "lo", order.order_no, { path: "/", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 * 60 * 24 });
    return c.redirect("/thanks", 303);
  } finally {
    await releaseOrderLocks(c.env.DB, locks);
  }
});

/* ---------- কুপন যাচাই (ফর্মে "প্রয়োগ" চাপলে) ---------- */
shop.post("/coupon/check", async (c) => {
  if (!(await hitRateLimit(c.env.DB, `coupon:${clientIp(c)}`, 20, 60))) {
    return c.json({ ok: false, message: "অনেকবার চেষ্টা হয়েছে, একটু পরে চেষ্টা করুন" }, 429);
  }
  const body = await c.req.parseBody();
  const source = body.source === "cart" ? "cart" : "landing";
  const entries = source === "cart" ? readCartEntries(c) : [{ productId: toInt(body.product_id), variantId: toInt(body.variant_id) || null }];
  let lines = await shopCartLines(c, entries);
  if (!lines.length && source === "landing") {
    // ভ্যারিয়েন্ট এখনো বাছাই হয়নি — মূল দামে হিসাব
    lines = await activeProductsByIds(c.env.DB, [toInt(body.product_id)]);
  }
  const subtotal = linesSubtotal(lines);
  const delivery = deliveryCharge(c.var.settings, body.area === "outside" ? "outside" : "inside", subtotal);
  const r = await checkCoupon(c.env.DB, String(body.coupon ?? ""), subtotal, delivery);
  if (!r.ok) return c.json({ ok: false, message: r.message });
  const cp = r.coupon;
  return c.json({ ok: true, message: r.message, code: cp.code, type: cp.type, value: cp.value, max_discount: cp.max_discount, min_order: cp.min_order, discount: r.discount });
});

/* ---------- অসম্পূর্ণ অর্ডার: সঠিক নম্বর লিখে অর্ডার না করলে ---------- */
shop.post("/t/draft", async (c) => {
  const s = c.var.settings;
  if (s.incomplete_capture === "0" || s.demo_mode === "1") return c.body(null, 204);
  if (!(await hitRateLimit(c.env.DB, `draft:${clientIp(c)}`, 20, 60))) return c.body(null, 204);
  const b = await c.req.parseBody();
  const phone = normalizePhone(str(b.phone, 20));
  if (!phone) return c.body(null, 204);
  const source = b.source === "cart" ? "cart" : "landing";
  const entries = source === "cart"
    ? readCartEntries(c)
    : toInt(b.product_id) > 0 ? [{ productId: toInt(b.product_id), variantId: toInt(b.variant_id) || null }] : [];
  const lines = await shopCartLines(c, entries);
  if (!lines.length) return c.body(null, 204);
  // এই মাত্র অর্ডার করেছে বা ব্লক করা নম্বর — তালিকায় তোলার দরকার নেই
  const skip = await c.env.DB.prepare(
    `SELECT 1 FROM orders WHERE phone = ? AND created_at > datetime('now', '-30 minutes')
     UNION ALL SELECT 1 FROM blacklist_entries WHERE type = 'phone' AND value = ? LIMIT 1`,
  ).bind(phone, phone).first();
  if (skip) return c.body(null, 204);
  await saveDraft(c.env.DB, {
    phone,
    name: str(b.name, 100),
    address: str(b.address, 300),
    area: b.area === "inside" || b.area === "outside" ? b.area : "",
    source,
    items: lines.map((l) => ({ productId: l.id, variantId: l.variant_id ?? null, qty: l.qty ?? 1 })),
    subtotal: linesSubtotal(lines),
    deviceId: c.var.deviceId ?? null,
    sourceUrl: (c.req.header("referer") || "").slice(0, 500),
  });
  return c.body(null, 204);
});

/* ---------- InitiateCheckout: ল্যান্ডিং ফর্মে প্রথম ফোকাস ---------- */
shop.post("/t/ic", async (c) => {
  const body = await c.req.parseBody();
  const eventId = str(body.event_id, 80);
  if (!/^ic_[A-Za-z0-9-]{8,64}$/.test(eventId)) return c.body(null, 204);
  if (!(await hitRateLimit(c.env.DB, `track:${clientIp(c)}`, 30, 60))) return c.body(null, 204);
  const [p] = await activeProductsByIds(c.env.DB, [toInt(body.product_id)]);
  if (p) trackServer(c, "InitiateCheckout", eventId, productData([p]));
  return c.body(null, 204);
});

/* ---------- রিভিউ: শুধু যে কিনেছে (অর্ডার নম্বর + মোবাইল) ---------- */
const REVIEW_IMG: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const reviewsOn = (c: Ctx) => c.var.settings.reviews_enabled !== "0";

async function renderReview(c: Ctx, f: ReviewFormState, status: 200 | 422 | 429 = 200) {
  const s = c.var.settings;
  return page(c,
    <Layout title="রিভিউ দিন" settings={s} cartCount={readCart(c).length} head={pixel(c)} nav={c.var.navCats} pages={c.var.navPages}>
      <ReviewPage f={f} />
    </Layout>, status);
}

shop.get("/review", async (c) => {
  if (!reviewsOn(c)) return notFound(c);
  const orderNo = str(c.req.query("o"), 30).toUpperCase();
  const phone = normalizePhone(str(c.req.query("p"), 20));
  if (!orderNo || !phone) return renderReview(c, { orderNo, phone: c.req.query("p") ?? "" });
  if (!(await hitRateLimit(c.env.DB, `review:${clientIp(c)}`, 30, 3600))) return renderReview(c, { orderNo, error: "অনেকবার চেষ্টা হয়েছে, পরে আবার চেষ্টা করুন" }, 429);
  const r = await reviewableOrder(c.env.DB, orderNo, phone);
  if ("error" in r) return renderReview(c, { orderNo, phone, error: r.error }, 422);
  return renderReview(c, { orderNo, phone, order: r.order, items: r.items });
});

shop.post("/review", async (c) => {
  if (!reviewsOn(c)) return notFound(c);
  if (!(await hitRateLimit(c.env.DB, `review-post:${clientIp(c)}`, 10, 3600))) return renderReview(c, { error: "অনেকবার চেষ্টা হয়েছে, পরে আবার চেষ্টা করুন" }, 429);
  const b = await c.req.parseBody();
  const orderNo = str(b.o, 30).toUpperCase();
  const phone = normalizePhone(str(b.p, 20));
  if (!phone) return renderReview(c, { orderNo, error: "সঠিক মোবাইল নম্বর দিন" }, 422);
  const r = await reviewableOrder(c.env.DB, orderNo, phone);
  if ("error" in r) return renderReview(c, { orderNo, phone, error: r.error }, 422);
  const values = { product_id: str(b.product_id, 10), rating: str(b.rating, 1), body: str(b.body, 1000), name: str(b.name, 60) };
  const again = (error: string) => renderReview(c, { orderNo, phone, order: r.order, items: r.items, values, error }, 422);
  const item = r.items.find((i) => i.product_id === toInt(values.product_id));
  const rating = toInt(values.rating);
  if (!item) return again("পণ্য বাছাই করুন");
  if (item.done) return again("এই পণ্যের রিভিউ আগেই দেওয়া হয়েছে");
  if (rating < 1 || rating > 5) return again("তারা বাছাই করুন");
  if (!values.name) return again("আপনার নাম লিখুন");
  let image: string | null = null;
  const file = b.image;
  if (file instanceof File && file.size > 0) {
    const ext = REVIEW_IMG[file.type];
    if (!ext) return again("ছবি JPG, PNG বা WebP হতে হবে");
    if (file.size > 2 * 1024 * 1024) return again("ছবি ২ MB-এর কম হতে হবে");
    image = `rv/${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, image), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  }
  await c.env.DB.prepare("INSERT OR IGNORE INTO reviews (product_id, order_id, name, rating, body, image) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(item.product_id, r.order.id, values.name, rating, values.body || null, image).run();
  item.done = 1;
  return renderReview(c, { orderNo, phone, done: true, items: r.items });
});

/* ---------- ক্যাটালগ ফিড (Facebook / Google) ---------- */
async function feedResponse(c: Ctx, kind: "xml" | "csv") {
  const s = c.var.settings;
  if (!feedOn(s)) return c.text("ফিড বন্ধ আছে", 404);
  const origin = publicOrigin(c);
  const { items } = await feedItems(c.env.DB, s, origin);
  const body = kind === "xml" ? toRss(items, s, origin) : toFeedCsv(items);
  return c.body(body, 200, {
    "Content-Type": kind === "xml" ? "application/xml; charset=utf-8" : "text/csv; charset=utf-8",
    "Cache-Control": "public, max-age=1800",
    "X-Robots-Tag": "noindex",
  });
}
shop.get("/feed.xml", (c) => feedResponse(c, "xml"));
shop.get("/feed.csv", (c) => feedResponse(c, "csv"));

/* ---------- সার্চ ইঞ্জিন: robots.txt আর sitemap.xml ---------- */
shop.get("/robots.txt", (c) => {
  const origin = publicOrigin(c);
  const body = c.var.settings.seo_noindex === "1"
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nDisallow: /admin\nDisallow: /cart\nDisallow: /checkout\nDisallow: /thanks\nSitemap: ${origin}/sitemap.xml\n`;
  return c.text(body, 200, { "Cache-Control": "public, max-age=3600" });
});

shop.get("/sitemap.xml", async (c) => {
  const origin = publicOrigin(c);
  const { results } = await c.env.DB.prepare("SELECT slug, updated_at FROM products WHERE is_active = 1 ORDER BY id DESC LIMIT 5000").all<{ slug: string; updated_at: string }>();
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const urls = [`<url><loc>${esc(origin)}/</loc></url>`, ...results.map((p) => `<url><loc>${esc(`${origin}/p/${encodeURIComponent(p.slug)}`)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod></url>`)];
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, 200,
    { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
});

/* ---------- ধন্যবাদ ---------- */
shop.get("/thanks", async (c) => {
  const no = getCookie(c, "lo");
  const data = no ? await getOrderByNo(c.env.DB, no) : null;
  if (!data) return c.redirect("/", 303);
  const s = c.var.settings;
  const o = data.order;
  const head = pixel(c, [{
    name: "Lead",
    id: `lead_${o.order_no}`,
    once: true,
    serverAlreadySent: true,
    params: {
      content_type: "product",
      content_ids: data.items.map((i) => String(i.product_id ?? i.id)),
      contents: data.items.map((i) => ({ id: String(i.product_id ?? i.id), quantity: i.qty || 1, item_price: i.price })),
      num_items: data.items.reduce((n, i) => n + (i.qty || 1), 0),
      value: o.total,
      currency: "BDT",
    },
  }]);
  return page(c,
    <Layout title="ধন্যবাদ" settings={s} cartCount={readCart(c).length} head={head} nav={c.var.navCats} pages={c.var.navPages}>
      <ThanksPage order={data.order} items={data.items} settings={s} />
    </Layout>,
  );
});

export const ordersClosedMessage = (contact: string) =>
  `দুঃখিত, এই মুহূর্তে অনলাইনে অর্ডার নেওয়া বন্ধ আছে। অর্ডার করতে কল করুন: ${contact}`;

export function notFound(c: Ctx) {
  const s = c.var.settings;
  return page(c, <Layout title="পাওয়া যায়নি" settings={s} nav={c.var.navCats} pages={c.var.navPages}><NotFoundPage /></Layout>, 404);
}

function uniqueStrings(list: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of list) if (isUuid(v) && !out.includes(v.toLowerCase())) out.push(v.toLowerCase());
  return out;
}
