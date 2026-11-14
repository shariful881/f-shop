import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv, Ctx } from "../env";
import { Layout } from "../views/layout";
import { CartPage, CheckoutPage, HomePage, LandingPage, NotFoundPage, ThanksPage, type FormState } from "../views/shop";
import { activeProductBySlug, activeProductsByIds, homeSections, type Product } from "../lib/products";
import { addToCart, clearCart, readCart, removeFromCart, uniqueIds } from "../lib/cart";
import { createOrder, getOrderByNo } from "../lib/orders";
import { deliveryCharge } from "../lib/settings";
import { clientIp, isHttps, publicUrl, str, toInt, wantsJson } from "../lib/http";
import { imageUrl } from "../lib/format";
import { page } from "../lib/render";
import { validateOrderInput, checkOrderGuards, acquireOrderLocks, releaseOrderLocks, hitRateLimit, ORDER_RATE_LIMIT } from "../lib/order-guard";
import { isUuid } from "../middleware/device";

export const shop = new Hono<AppEnv>();

/* ---------- হোম ---------- */
shop.get("/", async (c) => {
  const sections = await homeSections(c.env.DB);
  const s = c.var.settings;
  return page(c,
    <Layout title={s.site_name || "F-Shop"} settings={s} cartCount={readCart(c).length}>
      <HomePage sections={sections} />
    </Layout>,
  );
});

/* ---------- ল্যান্ডিং পেজ ---------- */
function renderLanding(c: Ctx, p: Product, form?: FormState, status: 200 | 422 | 429 | 403 = 200) {
  const s = c.var.settings;
  return page(c,
    <Layout title={p.headline || p.name} settings={s} cartCount={readCart(c).length}
      description={p.short_desc || undefined} ogImage={new URL(imageUrl(p.image), publicUrl(c)).toString()}>
      <LandingPage p={p} settings={s} form={form} />
    </Layout>,
    status,
  );
}

shop.get("/p/:slug", async (c) => {
  const p = await activeProductBySlug(c.env.DB, c.req.param("slug"));
  if (!p) return notFound(c);
  return renderLanding(c, p);
});

/* ---------- কার্ট ---------- */
shop.post("/cart/add", async (c) => {
  const body = await c.req.parseBody();
  const id = toInt(body.product_id);
  const [product] = await activeProductsByIds(c.env.DB, [id]);
  if (!product) {
    return wantsJson(c) ? c.json({ ok: false, message: "পণ্যটি পাওয়া যায়নি" }, 404) : c.redirect("/cart", 303);
  }
  const added = addToCart(c, id);
  const count = readCart(c).length + (added ? 1 : 0);
  if (wantsJson(c)) {
    return c.json({
      ok: added,
      message: added ? "কার্টে যোগ হয়েছে" : "এই পণ্যটি আগেই কার্টে আছে",
      count,
    });
  }
  return c.redirect("/cart", 303);
});

shop.post("/cart/remove", async (c) => {
  const body = await c.req.parseBody();
  removeFromCart(c, toInt(body.product_id));
  return c.redirect("/cart", 303);
});

shop.get("/cart", async (c) => {
  const products = await activeProductsByIds(c.env.DB, readCart(c));
  const s = c.var.settings;
  return page(c,
    <Layout title="কার্ট" settings={s} cartCount={products.length}>
      <CartPage products={products} />
    </Layout>,
  );
});

function renderCheckout(c: Ctx, products: Product[], form?: FormState, status: 200 | 422 | 429 | 403 = 200) {
  const s = c.var.settings;
  return page(c,
    <Layout title="চেকআউট" settings={s} cartCount={products.length}>
      <CheckoutPage products={products} settings={s} form={form} />
    </Layout>,
    status,
  );
}

shop.get("/checkout", async (c) => {
  const products = await activeProductsByIds(c.env.DB, readCart(c));
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
  };

  // কোন পণ্য: ল্যান্ডিং থেকে হলে শুধু ওই পণ্য, চেকআউট থেকে হলে কার্টের সব (ডুপ্লিকেট বাদ)
  const ids = source === "cart" ? readCart(c) : uniqueIds([body.product_id]);
  const products = await activeProductsByIds(c.env.DB, ids);

  const fail = async (form: FormState, status: 422 | 429 | 403 = 422) => {
    if (source === "landing") {
      const p = products[0] ?? (await c.env.DB.prepare("SELECT * FROM products WHERE id = ? AND is_active = 1").bind(toInt(body.product_id)).first<Product>());
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

  if (!products.length) return fail({ alert: "অর্ডারের জন্য কোনো পণ্য পাওয়া যায়নি।" });

  // ১. ইনপুট যাচাই (ফোন নম্বর নরমালাইজসহ)
  const v = validateOrderInput(values);
  if (!v.ok) return fail({ errors: v.errors });
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

    // ৪. অর্ডার সেভ
    const order = await createOrder(c.env.DB, {
      name: values.name!,
      phone: v.phone,
      address: values.address!,
      area: v.area,
      note: values.note!,
      deliveryCharge: deliveryCharge(s, v.area),
      deviceId,
      ip: clientIp(c),
      userAgent: (c.req.header("user-agent") || "").slice(0, 500),
      fbp: c.var.fbp ?? null,
      fbc: c.var.fbc ?? null,
      sourceUrl: (c.req.header("referer") || publicUrl(c)).slice(0, 1000),
    }, products);

    if (source === "cart") clearCart(c);
    setCookie(c, "lo", order.order_no, { path: "/", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 * 60 * 24 });
    return c.redirect("/thanks", 303);
  } finally {
    await releaseOrderLocks(c.env.DB, locks);
  }
});

/* ---------- ধন্যবাদ ---------- */
shop.get("/thanks", async (c) => {
  const no = getCookie(c, "lo");
  const data = no ? await getOrderByNo(c.env.DB, no) : null;
  if (!data) return c.redirect("/", 303);
  const s = c.var.settings;
  return page(c,
    <Layout title="ধন্যবাদ" settings={s} cartCount={readCart(c).length}>
      <ThanksPage order={data.order} items={data.items} settings={s} />
    </Layout>,
  );
});

/* ---------- ছবি (R2 থেকে) ---------- */
shop.get("/img/:key{.+}", async (c) => {
  const key = c.req.param("key");
  if (key === "placeholder.svg") return c.env.ASSETS.fetch(new URL("/img/placeholder.svg", c.req.url));
  const obj = await c.env.IMAGES.get(key);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});

export function notFound(c: Ctx) {
  const s = c.var.settings;
  return page(c, <Layout title="পাওয়া যায়নি" settings={s}><NotFoundPage /></Layout>, 404);
}

function uniqueStrings(list: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of list) if (isUuid(v) && !out.includes(v.toLowerCase())) out.push(v.toLowerCase());
  return out;
}
