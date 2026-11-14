import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv, Ctx } from "../env";
import { Layout } from "../views/layout";
import { CartPage, CheckoutPage, HomePage, LandingPage, NotFoundPage, ThanksPage, type FormState } from "../views/shop";
import { activeProductBySlug, activeProductsByIds, cartLines, homeSections, productVariants, type Product } from "../lib/products";
import { addToCart, clearCart, readCart, readCartEntries, removeFromCart } from "../lib/cart";
import { createOrder, getOrderByNo } from "../lib/orders";
import { deliveryCharge } from "../lib/settings";
import { clientIp, isHttps, publicUrl, str, toInt, wantsJson } from "../lib/http";
import { imageUrl } from "../lib/format";
import { page } from "../lib/render";
import { newEventId, trackServer, type CustomData } from "../lib/capi";
import { PixelHead, type BrowserEvent } from "../views/pixel";
import { validateOrderInput, checkOrderGuards, acquireOrderLocks, releaseOrderLocks, hitRateLimit, ORDER_RATE_LIMIT } from "../lib/order-guard";
import { isUuid } from "../middleware/device";

export const shop = new Hono<AppEnv>();

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
    contents: products.map((p) => ({ id: String(p.id), quantity: 1, item_price: p.price })),
    num_items: products.length,
    value: products.reduce((sum, p) => sum + p.price, 0),
    currency: "BDT",
  };
}

/* ---------- হোম ---------- */
shop.get("/", async (c) => {
  const sections = await homeSections(c.env.DB);
  const s = c.var.settings;
  return page(c,
    <Layout title={s.site_name || "F-Shop"} settings={s} cartCount={readCart(c).length} head={pixel(c)}>
      <HomePage sections={sections} />
    </Layout>,
  );
});

/* ---------- ল্যান্ডিং পেজ ---------- */
async function renderLanding(c: Ctx, p: Product, form?: FormState, status: 200 | 422 | 429 | 403 = 200) {
  const s = c.var.settings;
  const variants = await productVariants(c.env.DB, p.id);
  const head = pixel(c, [{ name: "ViewContent", id: newEventId("vc"), params: { ...productData([p]), content_name: p.name } }]);
  return page(c,
    <Layout title={p.headline || p.name} settings={s} cartCount={readCart(c).length} head={head}
      description={p.short_desc || undefined} ogImage={new URL(imageUrl(p.image), publicUrl(c)).toString()}>
      <LandingPage p={p} variants={variants} settings={s} form={form} closed={c.var.shopState.accepting ? undefined : ordersClosedMessage(s.contact_phone || "")} />
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
  const variantId = toInt(body.variant_id) || null;
  const [product] = await cartLines(c.env.DB, [{ productId: id, variantId }]);
  if (!product) {
    const exists = await activeProductsByIds(c.env.DB, [id]);
    if (exists[0]) {
      // ভ্যারিয়েন্ট বাছাই করা দরকার
      return wantsJson(c)
        ? c.json({ ok: false, message: "সাইজ/রং বাছাই করুন", redirect: `/p/${exists[0].slug}#order` }, 422)
        : c.redirect(`/p/${exists[0].slug}#order`, 303);
    }
    return wantsJson(c) ? c.json({ ok: false, message: "পণ্যটি পাওয়া যায়নি" }, 404) : c.redirect("/cart", 303);
  }
  const added = addToCart(c, id, product.variant_id ?? null);
  const count = readCart(c).length + (added ? 1 : 0);
  let eventId: string | null = null;
  const fbParams = { ...productData([product]), content_name: product.name };
  if (added) {
    eventId = newEventId("atc");
    trackServer(c, "AddToCart", eventId, fbParams);
  }
  if (wantsJson(c)) {
    return c.json({
      ok: added,
      message: added ? "কার্টে যোগ হয়েছে" : "এই পণ্যটি আগেই কার্টে আছে",
      count,
      event_id: eventId,
      fb_params: fbParams,
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
  const products = await cartLines(c.env.DB, readCartEntries(c));
  const s = c.var.settings;
  return page(c,
    <Layout title="কার্ট" settings={s} cartCount={products.length} head={pixel(c)}>
      <CartPage products={products} />
    </Layout>,
  );
});

function renderCheckout(c: Ctx, products: Product[], form?: FormState, status: 200 | 422 | 429 | 403 = 200) {
  const s = c.var.settings;
  const head = pixel(c, [{ name: "InitiateCheckout", id: newEventId("ic"), params: productData(products) }]);
  return page(c,
    <Layout title="চেকআউট" settings={s} cartCount={products.length} head={head}>
      <CheckoutPage products={products} settings={s} form={form} closed={c.var.shopState.accepting ? undefined : ordersClosedMessage(s.contact_phone || "")} />
    </Layout>,
    status,
  );
}

shop.get("/checkout", async (c) => {
  const products = await cartLines(c.env.DB, readCartEntries(c));
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
  };

  // কোন পণ্য: ল্যান্ডিং থেকে হলে শুধু ওই পণ্য, চেকআউট থেকে হলে কার্টের সব (ডুপ্লিকেট বাদ)
  // কার্টের লাইন: ল্যান্ডিং থেকে হলে শুধু ওই পণ্য (+ বাছাই করা ভ্যারিয়েন্ট); একই পণ্য দুবার নয়
  const entries = source === "cart"
    ? readCartEntries(c)
    : toInt(body.product_id) > 0 ? [{ productId: toInt(body.product_id), variantId: toInt(body.variant_id) || null }] : [];
  const products = await cartLines(c.env.DB, entries);

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
    if (source === "landing" && toInt(body.product_id) > 0 && (await productVariants(c.env.DB, toInt(body.product_id), true)).length) {
      return fail({ errors: { variant: "সাইজ/রং বাছাই করুন" } });
    }
    return fail({ alert: "অর্ডারের জন্য কোনো পণ্য পাওয়া যায়নি।" });
  }

  // দোকানের বিলিং বকেয়া বা স্থগিত থাকলে অনলাইনে অর্ডার বন্ধ
  if (!c.var.shopState.accepting) return fail({ alert: ordersClosedMessage(c.var.settings.contact_phone || "") }, 403);

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

    // Lead: সার্ভার এখন (রেসপন্সের পরে), ব্রাউজার ধন্যবাদ পেজে — দুই জায়গায় একই event_id
    // (Purchase এখানে কখনো যায় না — শুধু অ্যাডমিন কনফার্ম করলে)
    trackServer(c, "Lead", `lead_${order.order_no}`, { ...productData(products), value: products.reduce((x, p) => x + p.price, 0) + deliveryCharge(s, v.area) });

    if (source === "cart") clearCart(c);
    setCookie(c, "lo", order.order_no, { path: "/", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 * 60 * 24 });
    return c.redirect("/thanks", 303);
  } finally {
    await releaseOrderLocks(c.env.DB, locks);
  }
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
      contents: data.items.map((i) => ({ id: String(i.product_id ?? i.id), quantity: 1, item_price: i.price })),
      num_items: data.items.length,
      value: o.total,
      currency: "BDT",
    },
  }]);
  return page(c,
    <Layout title="ধন্যবাদ" settings={s} cartCount={readCart(c).length} head={head}>
      <ThanksPage order={data.order} items={data.items} settings={s} />
    </Layout>,
  );
});

export const ordersClosedMessage = (contact: string) =>
  `দুঃখিত, এই মুহূর্তে অনলাইনে অর্ডার নেওয়া বন্ধ আছে। অর্ডার করতে কল করুন: ${contact}`;

export function notFound(c: Ctx) {
  const s = c.var.settings;
  return page(c, <Layout title="পাওয়া যায়নি" settings={s}><NotFoundPage /></Layout>, 404);
}

function uniqueStrings(list: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of list) if (isUuid(v) && !out.includes(v.toLowerCase())) out.push(v.toLowerCase());
  return out;
}
