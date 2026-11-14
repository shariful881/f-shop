import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { imageStorageKey, type AppEnv, type Ctx } from "../env";
import { AdminLayout, BlacklistPage, CategoriesPage, LoginPage, OrderDetailPage, OrdersPage, ProductFormPage, ProductsPage, SettingsPage, STATUS_TABS, type BlacklistRow, type Flash } from "../views/admin";
import { ADMIN_COOKIE, requireAdmin } from "../middleware/admin-auth";
import { createSession, destroySession, hashPassword, sha256Hex, verifyPassword } from "../lib/auth";
import { changeStatus } from "../lib/order-status";
import { getOrderById, type Order, type OrderStatus } from "../lib/orders";
import { productVariants, syncVariants, type Category, type Product } from "../lib/products";
import { normalizePhone } from "../lib/phone";
import { safeColor, saveSettings, THEMES } from "../lib/settings";
import { clientIp, isHttps, str, toInt } from "../lib/http";
import { youtubeId } from "../lib/format";
import { hitRateLimit } from "../lib/order-guard";
import { sendPurchase } from "../lib/capi";
import { CouponsPage, LandingBuilderPage, type CouponRow } from "../views/admin";
import { defaultLanding, normalizeLanding, parseLanding, SECTION_LABEL } from "../lib/landing";
import { Layout } from "../views/layout";
import { BuiltLanding } from "../views/landing";
import { normalizeCode } from "../lib/coupons";
import { BillingPage, DnsPage, DomainPage, StaffPage, type DnsView, type LedgerRow, type StaffRow, type TopupRow } from "../views/admin";
import { addDomain, cfFromEnv, checkDomain, isProtected, normalizeDomain, removeDomain, shopDomains, validateDnsInput } from "../../platform/domains";
import { cfError, type DnsRecord } from "../../platform/cf";
import { applyLedger, billingShop, chargeConfirmedOrder, platformSettings } from "../../platform/billing";
import { clearShopCache } from "../../platform/resolve";

export const admin = new Hono<AppEnv>();

/* ---------- ফ্ল্যাশ মেসেজ ---------- */
function flash(c: Ctx, type: "ok" | "error", text: string) {
  setCookie(c, "flash", encodeURIComponent(JSON.stringify({ type, text })), { path: "/admin", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 });
}
function takeFlash(c: Ctx): Flash {
  const raw = getCookie(c, "flash");
  if (!raw) return null;
  deleteCookie(c, "flash", { path: "/admin" });
  try { return JSON.parse(decodeURIComponent(raw)); } catch { return null; }
}

function render(c: Ctx, title: string, active: string, body: unknown, status: 200 | 404 | 422 = 200) {
  return c.html(
    "<!DOCTYPE html>" +
      String(<AdminLayout title={title} settings={c.var.settings} active={active} flash={takeFlash(c)} email={c.var.admin?.email} role={c.var.admin?.role} state={c.var.shopState}>{body as any}</AdminLayout>),
    status,
  );
}

/* ---------- লগইন ---------- */
admin.get("/login", (c) => c.html("<!DOCTYPE html>" + String(<AdminLayout title="লগইন" settings={c.var.settings}><LoginPage /></AdminLayout>)));

admin.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const fail = (msg: string) =>
    c.html("<!DOCTYPE html>" + String(<AdminLayout title="লগইন" settings={c.var.settings}><LoginPage error={msg} email={email} /></AdminLayout>), 422);

  if (!(await hitRateLimit(c.env.DB, `login:${clientIp(c)}`, 10, 900))) return fail("অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে চেষ্টা করুন।");

  const user = await c.env.DB.prepare("SELECT id, password_hash, is_admin, active FROM users WHERE email = ?").bind(email)
    .first<{ id: number; password_hash: string; is_admin: number; active: number }>();
  if (!user || !user.is_admin || !user.active || !(await verifyPassword(password, user.password_hash))) return fail("ইমেইল বা পাসওয়ার্ড ভুল");

  const token = await createSession(c.env.DB, user.id);
  setCookie(c, ADMIN_COOKIE, token, { path: "/", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 * 60 * 24 * 7 });
  return c.redirect("/admin/orders", 303);
});

/** সাইনআপের পর এককালীন টোকেন দিয়ে সরাসরি ড্যাশবোর্ডে */
admin.get("/auto-login", async (c) => {
  const token = c.req.query("t") || "";
  if (!/^[0-9a-f]{64}$/.test(token)) return c.redirect("/admin/login", 303);
  const db = c.env.DB;
  const id = await sha256Hex(token);
  const row = await db.prepare("SELECT user_id FROM login_tokens WHERE id = ? AND expires_at > datetime('now')").bind(id).first<{ user_id: number }>();
  await db.prepare("DELETE FROM login_tokens WHERE id = ? OR expires_at < datetime('now')").bind(id).run();
  if (!row) return c.redirect("/admin/login", 303);
  const session = await createSession(db, row.user_id);
  setCookie(c, ADMIN_COOKIE, session, { path: "/", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 * 60 * 24 * 7 });
  flash(c, "ok", "স্বাগতম! আপনার দোকান তৈরি হয়ে গেছে। প্রথমে সেটিংস আর পণ্য ঠিক করে নিন।");
  return c.redirect("/admin/orders", 303);
});

admin.post("/logout", async (c) => {
  await destroySession(c.env.DB, getCookie(c, ADMIN_COOKIE));
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
  return c.redirect("/admin/login", 303);
});

/* ---------- এর পরের সব পেজে লগইন লাগবে ---------- */
admin.use("*", requireAdmin);

admin.get("/", (c) => c.redirect("/admin/orders", 303));

/* ---------- অর্ডার ---------- */
const PER_PAGE = 50;

admin.get("/orders", async (c) => {
  const db = c.env.DB;
  const status = (STATUS_TABS as string[]).includes(c.req.query("status") || "") ? (c.req.query("status") as OrderStatus) : "new";
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const page = Math.max(1, toInt(c.req.query("page"), 1));

  const { results: countRows } = await db.prepare("SELECT status, COUNT(*) n FROM orders GROUP BY status").all<{ status: string; n: number }>();
  const counts = Object.fromEntries(countRows.map((r) => [r.status, r.n]));

  let where = "o.status = ?";
  let binds: unknown[] = [status];
  if (q) {
    const phone = normalizePhone(q);
    where = "(o.phone LIKE ? OR o.name LIKE ? OR o.order_no LIKE ?" + (phone ? " OR o.phone = ?" : "") + ")";
    const like = `%${q.replace(/[%_]/g, "")}%`;
    binds = [like, like, like, ...(phone ? [phone] : [])];
  }
  const { results } = await db
    .prepare(
      `SELECT o.*, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
       FROM orders o WHERE ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, PER_PAGE + 1, (page - 1) * PER_PAGE)
    .all<Order & { item_count: number }>();

  return render(c, "অর্ডার", "orders",
    <OrdersPage orders={results.slice(0, PER_PAGE)} counts={counts} status={status} q={q} page={page} hasMore={results.length > PER_PAGE} />);
});

admin.get("/orders/:id{[0-9]+}", async (c) => {
  const db = c.env.DB;
  const data = await getOrderById(db, toInt(c.req.param("id")));
  if (!data) return render(c, "পাওয়া যায়নি", "orders", <p class="empty">অর্ডার পাওয়া যায়নি</p>, 404);
  const o = data.order;
  const [hist, bl] = await db.batch([
    db.prepare(
      `SELECT * FROM orders WHERE id != ? AND (phone = ? OR (device_id IS NOT NULL AND device_id = ?)) ORDER BY id DESC LIMIT 50`,
    ).bind(o.id, o.phone, o.device_id ?? ""),
    db.prepare(
      "SELECT type FROM blacklist_entries WHERE (type='phone' AND value=?) OR (type='device' AND value=?)",
    ).bind(o.phone, o.device_id ?? ""),
  ]);
  const types = (bl!.results as { type: string }[]).map((r) => r.type);
  return render(c, o.order_no, "orders",
    <OrderDetailPage order={o} items={data.items} history={hist!.results as Order[]} blocked={{ phone: types.includes("phone"), device: types.includes("device") }} />);
});

admin.post("/orders/:id{[0-9]+}/status", async (c) => {
  const id = toInt(c.req.param("id"));
  const to = str((await c.req.parseBody()).status, 20) as OrderStatus;
  const res = await changeStatus(c.env.DB, id, to);
  if (!res.ok) {
    flash(c, "error", res.message);
  } else if (to === "confirmed") {
    // বিলিং: ট্রায়ালে ফ্রি অর্ডার কমে, চালু দোকানে প্রতি কনফার্ম অর্ডারে চার্জ (একবারই)
    try {
      await chargeConfirmedOrder(c.env.PLATFORM_DB, c.env.SHOP_ID, res.order.order_no);
      clearShopCache(); // একই Worker-এ পরের রিকোয়েস্টে নতুন ব্যালেন্স (অন্য জায়গায় সর্বোচ্চ ৩০ সেকেন্ড দেরি)
    } catch (e) {
      console.error("billing error", e);
    }
    // কনফার্ম হলে শুধু সার্ভার থেকে (CAPI) Purchase যায়
    const p = await sendPurchase(c.env.DB, id, c.var.settings);
    flash(c, p.ok ? "ok" : "error", p.ok ? "অর্ডার কনফার্ম হয়েছে, Facebook-এ Purchase গেছে।" : `অর্ডার কনফার্ম হয়েছে, কিন্তু Purchase যায়নি: ${p.message}`);
  } else if (to === "cancelled" || to === "fake") {
    flash(c, "ok", "স্ট্যাটাস বদলেছে। নম্বর ও ডিভাইস ব্লক করা হয়েছে।");
  } else {
    flash(c, "ok", "স্ট্যাটাস বদলেছে।");
  }
  return c.redirect(`/admin/orders/${id}`, 303);
});

admin.post("/orders/:id{[0-9]+}/purchase", async (c) => {
  const id = toInt(c.req.param("id"));
  const p = await sendPurchase(c.env.DB, id, c.var.settings);
  flash(c, p.ok ? "ok" : "error", p.ok ? "Purchase পাঠানো হয়েছে।" : `Purchase যায়নি: ${p.message}`);
  return c.redirect(`/admin/orders/${id}`, 303);
});

/* ---------- পণ্য ---------- */
async function allCategories(db: D1Database) {
  return (await db.prepare("SELECT id, name, sort_order FROM categories ORDER BY sort_order, id").all<Category>()).results;
}

admin.get("/products", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM products ORDER BY is_active DESC, category_id, sort_order, id").all<Product>();
  return render(c, "পণ্য", "products", <ProductsPage products={results} categories={await allCategories(c.env.DB)} />);
});

admin.get("/products/new", async (c) =>
  render(c, "নতুন পণ্য", "products", <ProductFormPage categories={await allCategories(c.env.DB)} />));

admin.get("/products/:id{[0-9]+}/edit", async (c) => {
  const p = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(toInt(c.req.param("id"))).first<Product>();
  if (!p) return c.redirect("/admin/products", 303);
  return render(c, "পণ্য এডিট", "products", <ProductFormPage product={p} categories={await allCategories(c.env.DB)} variants={await productVariants(c.env.DB, p.id)} />);
});

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE = 3 * 1024 * 1024;

async function saveProduct(c: Ctx, id: number | null) {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const existing = id ? await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<Product>() : null;
  if (id && !existing) return c.redirect("/admin/products", 303);

  const compare = str(body.compare_price, 12);
  const v = {
    name: str(body.name, 200),
    slug: slugify(str(body.slug, 100)),
    category_id: toInt(body.category_id) || null,
    price: toInt(body.price, -1),
    compare_price: compare ? toInt(compare) : null,
    headline: str(body.headline, 300) || null,
    short_desc: str(body.short_desc, 2000) || null,
    details_html: (typeof body.details_html === "string" ? body.details_html : "").slice(0, 200_000) || null,
    youtube_url: str(body.youtube_url, 300) || null,
    is_active: body.is_active ? 1 : 0,
    show_on_home: body.show_on_home ? 1 : 0,
    sort_order: toInt(body.sort_order),
    options_json: null as string | null,
  };
  const options = [0, 1]
    .map((i) => ({
      name: str(body[`opt${i}_name`], 30),
      values: [...new Set(str(body[`opt${i}_values`], 500).split(/[,،]/).map((x) => x.trim()).filter(Boolean))].slice(0, 20),
    }))
    .filter((o) => o.name && o.values.length);
  v.options_json = options.length ? JSON.stringify(options) : null;
  if (!v.slug) v.slug = slugify(v.name) || `product-${crypto.randomUUID().slice(0, 6)}`;

  const errors: Record<string, string> = {};
  if (!v.name) errors.name = "নাম লিখুন";
  if (v.price < 0) errors.price = "সঠিক দাম লিখুন";
  if (v.youtube_url && !youtubeId(v.youtube_url)) errors.youtube_url = "সঠিক YouTube লিংক দিন";
  const dup = await db.prepare("SELECT id FROM products WHERE slug = ? AND id != ?").bind(v.slug, id ?? 0).first();
  if (dup) errors.slug = "এই slug আগেই ব্যবহার হয়েছে";

  const file = body.image;
  let imageKey = existing?.image ?? null;
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext) errors.image = "শুধু JPG, PNG বা WebP ছবি দিন";
    else if (file.size > MAX_IMAGE) errors.image = "ছবি ৩ MB-এর কম হতে হবে";
  }

  if (Object.keys(errors).length) {
    return render(c, "পণ্য", "products",
      <ProductFormPage product={{ ...existing, ...v, image: existing?.image ?? null }} categories={await allCategories(db)} errors={errors} />, 422);
  }

  if (file instanceof File && file.size > 0) {
    imageKey = `p/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
    await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, imageKey), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    if (existing?.image) await c.env.IMAGES.delete(imageStorageKey(c.env.SHOP_ID, existing.image)).catch(() => {});
  }

  const cols = [v.category_id, v.name, v.slug, v.price, v.compare_price, imageKey, v.headline, v.short_desc, v.details_html, v.youtube_url, v.is_active, v.show_on_home, v.sort_order, v.options_json];
  let productId = id;
  if (id) {
    await db.prepare(
      `UPDATE products SET category_id=?, name=?, slug=?, price=?, compare_price=?, image=?, headline=?, short_desc=?, details_html=?,
         youtube_url=?, is_active=?, show_on_home=?, sort_order=?, options_json=?, updated_at=datetime('now') WHERE id=?`,
    ).bind(...cols, id).run();
  } else {
    const r = await db.prepare(
      `INSERT INTO products (category_id, name, slug, price, compare_price, image, headline, short_desc, details_html, youtube_url, is_active, show_on_home, sort_order, options_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ).bind(...cols).first<{ id: number }>();
    productId = r!.id;
  }
  await syncVariants(db, productId!, options);
  flash(c, "ok", options.length ? "পণ্য সেভ হয়েছে। নিচে ভ্যারিয়েন্টের দাম/স্টক ঠিক করে নিন।" : "পণ্য সেভ হয়েছে।");
  return c.redirect(options.length ? `/admin/products/${productId}/edit` : "/admin/products", 303);
}

admin.post("/products", (c) => saveProduct(c, null));
admin.post("/products/:id{[0-9]+}", (c) => saveProduct(c, toInt(c.req.param("id"))));

admin.post("/products/:id{[0-9]+}/variants", async (c) => {
  const id = toInt(c.req.param("id"));
  const body = await c.req.parseBody();
  const variants = await productVariants(c.env.DB, id);
  if (variants.length) {
    await c.env.DB.batch(variants.map((vr) => {
      const raw = str(body[`price_${vr.id}`], 10);
      const price = raw === "" ? null : Math.max(0, toInt(raw));
      return c.env.DB.prepare("UPDATE product_variants SET price = ?, active = ? WHERE id = ? AND product_id = ?")
        .bind(price, body[`active_${vr.id}`] ? 1 : 0, vr.id, id);
    }));
  }
  flash(c, "ok", "ভ্যারিয়েন্ট সেভ হয়েছে।");
  return c.redirect(`/admin/products/${id}/edit`, 303);
});

admin.post("/products/:id{[0-9]+}/toggle", async (c) => {
  await c.env.DB.prepare("UPDATE products SET is_active = 1 - is_active, updated_at = datetime('now') WHERE id = ?").bind(toInt(c.req.param("id"))).run();
  flash(c, "ok", "পণ্যের অবস্থা বদলেছে।");
  return c.redirect("/admin/products", 303);
});

/* ---------- ক্যাটাগরি ---------- */
admin.get("/categories", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT category_id, COUNT(*) n FROM products GROUP BY category_id").all<{ category_id: number; n: number }>();
  const counts = Object.fromEntries(results.map((r) => [r.category_id, r.n]));
  return render(c, "ক্যাটাগরি", "categories", <CategoriesPage categories={await allCategories(c.env.DB)} counts={counts} />);
});

admin.post("/categories", async (c) => {
  const body = await c.req.parseBody();
  const name = str(body.name, 100);
  if (name) {
    await c.env.DB.prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)").bind(name, toInt(body.sort_order)).run();
    flash(c, "ok", "ক্যাটাগরি যোগ হয়েছে।");
  }
  return c.redirect("/admin/categories", 303);
});

admin.post("/categories/:id{[0-9]+}", async (c) => {
  const body = await c.req.parseBody();
  const name = str(body.name, 100);
  if (name) {
    await c.env.DB.prepare("UPDATE categories SET name = ?, sort_order = ? WHERE id = ?").bind(name, toInt(body.sort_order), toInt(c.req.param("id"))).run();
    flash(c, "ok", "ক্যাটাগরি সেভ হয়েছে।");
  }
  return c.redirect("/admin/categories", 303);
});

admin.post("/categories/:id{[0-9]+}/delete", async (c) => {
  const id = toInt(c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE products SET category_id = NULL WHERE category_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id),
  ]);
  flash(c, "ok", "ক্যাটাগরি মোছা হয়েছে।");
  return c.redirect("/admin/categories", 303);
});

/* ---------- ব্ল্যাকলিস্ট ---------- */
admin.get("/blacklist", async (c) => {
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const phone = normalizePhone(q);
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { results } = await c.env.DB
    .prepare(
      `SELECT b.*, o.order_no FROM blacklist_entries b LEFT JOIN orders o ON o.id = b.order_id
       ${q ? "WHERE b.value LIKE ? OR b.value = ?" : ""} ORDER BY b.id DESC LIMIT 500`,
    )
    .bind(...(q ? [like, phone ?? q] : []))
    .all<BlacklistRow>();
  return render(c, "ব্ল্যাকলিস্ট", "blacklist", <BlacklistPage rows={results} q={q} />);
});

admin.post("/blacklist", async (c) => {
  const phone = normalizePhone(str((await c.req.parseBody()).phone, 30));
  if (!phone) {
    flash(c, "error", "সঠিক মোবাইল নম্বর দিন");
  } else {
    const r = await c.env.DB.prepare("INSERT OR IGNORE INTO blacklist_entries (type, value, reason) VALUES ('phone', ?, 'manual')").bind(phone).run();
    flash(c, "ok", r.meta.changes ? `${phone} ব্লক করা হয়েছে।` : `${phone} আগেই ব্লক করা আছে।`);
  }
  return c.redirect("/admin/blacklist", 303);
});

admin.post("/blacklist/:id{[0-9]+}/delete", async (c) => {
  await c.env.DB.prepare("DELETE FROM blacklist_entries WHERE id = ?").bind(toInt(c.req.param("id"))).run();
  flash(c, "ok", "আনব্লক করা হয়েছে।");
  return c.redirect("/admin/blacklist", 303);
});

/* ---------- সেটিংস ---------- */
admin.get("/settings", (c) => render(c, "সেটিংস", "settings", <SettingsPage s={c.var.settings} />));

admin.post("/settings", async (c) => {
  const b = await c.req.parseBody();
  const values: Record<string, string> = {
    site_name: str(b.site_name, 100) || "F-Shop",
    contact_phone: str(b.contact_phone, 30),
    delivery_inside: String(Math.max(0, toInt(b.delivery_inside))),
    delivery_outside: String(Math.max(0, toInt(b.delivery_outside))),
    fb_pixel_id: str(b.fb_pixel_id, 30).replace(/\D/g, ""),
    fb_test_event_code: str(b.fb_test_event_code, 50),
    fb_graph_version: /^v\d+\.\d+$/.test(str(b.fb_graph_version, 10)) ? str(b.fb_graph_version, 10) : "v26.0",
  };
  values.theme = typeof b.theme === "string" && b.theme in THEMES ? b.theme : (c.var.settings.theme || "classic");
  values.brand_color = safeColor(str(b.brand_color, 7), c.var.settings.brand_color || "#0f766e");
  values.accent_color = safeColor(str(b.accent_color, 7), c.var.settings.accent_color || "#ea580c");

  // লোগো
  const logo = b.logo;
  if (logo instanceof File && logo.size > 0) {
    const ext = IMAGE_TYPES[logo.type];
    if (!ext || logo.size > 1024 * 1024) {
      flash(c, "error", "লোগো PNG/JPG/WebP আর ১ MB-এর কম হতে হবে");
      return c.redirect("/admin/settings", 303);
    }
    const key = `logo/${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, key), await logo.arrayBuffer(), { httpMetadata: { contentType: logo.type } });
    if (c.var.settings.logo) await c.env.IMAGES.delete(imageStorageKey(c.env.SHOP_ID, c.var.settings.logo)).catch(() => {});
    values.logo = key;
  } else if (b.remove_logo && c.var.settings.logo) {
    await c.env.IMAGES.delete(imageStorageKey(c.env.SHOP_ID, c.var.settings.logo)).catch(() => {});
    values.logo = "";
  }

  // টোকেন: ফাঁকা রাখলে আগেরটাই থাকে
  const token = str(b.fb_capi_token, 1000);
  if (token) values.fb_capi_token = token;
  else if (b.clear_token) values.fb_capi_token = "";
  await saveSettings(c.env.DB, values);
  flash(c, "ok", "সেটিংস সেভ হয়েছে।");
  return c.redirect("/admin/settings", 303);
});

/* ---------- বিলিং ---------- */
async function renderBilling(c: Ctx, form?: { errors: Record<string, string>; values: Record<string, string> }) {
  const pdb = c.env.PLATFORM_DB;
  const shopId = c.env.SHOP_ID;
  const [fees, shop] = await Promise.all([platformSettings(pdb), billingShop(pdb, shopId)]);
  const [ledger, topups] = await pdb.batch([
    pdb.prepare("SELECT id, type, amount, balance_after, ref, note, created_at FROM ledger WHERE shop_id = ? AND applied = 1 ORDER BY id DESC LIMIT 200").bind(shopId),
    pdb.prepare("SELECT id, amount, method, sender, trx_id, status, created_at FROM topups WHERE shop_id = ? ORDER BY id DESC LIMIT 20").bind(shopId),
  ]);
  return render(c, "বিলিং", "billing",
    <BillingPage state={c.var.shopState} fees={fees} ledger={ledger!.results as LedgerRow[]} topups={topups!.results as TopupRow[]}
      nextBill={shop?.next_bill_at ?? null} staffCount={shop?.staff_count ?? 0} errors={form?.errors} values={form?.values} />,
    form ? 422 : 200);
}

admin.get("/billing", (c) => renderBilling(c));

admin.post("/billing/topup", async (c) => {
  const b = await c.req.parseBody();
  const fees = await platformSettings(c.env.PLATFORM_DB);
  const values = { method: str(b.method, 10), amount: str(b.amount, 10), sender: str(b.sender, 30), trx_id: str(b.trx_id, 30).toUpperCase() };
  const errors: Record<string, string> = {};
  const amount = toInt(values.amount, 0);
  const min = toInt(fees.min_topup, 100);
  if (amount < min || amount > 100000) errors.amount = `৳${min} থেকে ৳১,০০,০০০ এর মধ্যে দিন`;
  const sender = normalizePhone(values.sender);
  if (!sender) errors.sender = "সঠিক নম্বর দিন";
  if (!/^[A-Z0-9]{6,30}$/.test(values.trx_id)) errors.trx_id = "সঠিক Transaction ID দিন";
  const method = values.method === "nagad" ? "nagad" : "bkash";
  if (!errors.trx_id) {
    const dup = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM topups WHERE trx_id = ?").bind(values.trx_id).first();
    if (dup) errors.trx_id = "এই Transaction ID আগেই দেওয়া হয়েছে";
  }
  if (Object.keys(errors).length) return renderBilling(c, { errors, values });
  try {
    await c.env.PLATFORM_DB.prepare("INSERT INTO topups (shop_id, amount, method, sender, trx_id) VALUES (?, ?, ?, ?, ?)")
      .bind(c.env.SHOP_ID, amount, method, sender, values.trx_id).run();
  } catch {
    return renderBilling(c, { errors: { trx_id: "এই Transaction ID আগেই দেওয়া হয়েছে" }, values });
  }
  flash(c, "ok", "রিচার্জের অনুরোধ পাঠানো হয়েছে। যাচাই হলে ব্যালেন্সে যোগ হবে।");
  return c.redirect("/admin/billing", 303);
});

/* ---------- স্টাফ (শুধু মালিক) ---------- */
async function syncStaffCount(c: Ctx) {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role != 'owner' AND active = 1").first<{ n: number }>();
  await c.env.PLATFORM_DB.prepare("UPDATE shops SET staff_count = ? WHERE id = ?").bind(row?.n ?? 0, c.env.SHOP_ID).run();
}

async function renderStaff(c: Ctx, form?: { errors: Record<string, string>; values: Record<string, string> }) {
  const { results } = await c.env.DB.prepare("SELECT id, name, email, role, active, created_at FROM users ORDER BY role = 'owner' DESC, id").all<StaffRow>();
  const fees = await platformSettings(c.env.PLATFORM_DB);
  return render(c, "স্টাফ", "staff",
    <StaffPage users={results} me={c.var.admin!.id} fee={toInt(fees.staff_fee, 99)} trial={c.var.shopState.status === "trial"} errors={form?.errors} values={form?.values} />,
    form ? 422 : 200);
}

admin.get("/staff", (c) => renderStaff(c));

admin.post("/staff", async (c) => {
  const b = await c.req.parseBody();
  const values = { name: str(b.name, 60), email: str(b.email, 120).toLowerCase(), role: b.role === "manager" ? "manager" : "orders" };
  const password = typeof b.password === "string" ? b.password : "";
  const errors: Record<string, string> = {};
  if (values.name.length < 2) errors.name = "নাম লিখুন";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "সঠিক ইমেইল লিখুন";
  else if (await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(values.email).first()) errors.email = "এই ইমেইলে আগেই অ্যাকাউন্ট আছে";
  if (password.length < 8) errors.password = "কমপক্ষে ৮ অক্ষর";
  if (Object.keys(errors).length) return renderStaff(c, { errors, values });

  const r = await c.env.DB.prepare("INSERT INTO users (name, email, password_hash, is_admin, role, active) VALUES (?, ?, ?, 1, ?, 1) RETURNING id")
    .bind(values.name, values.email, await hashPassword(password), values.role).first<{ id: number }>();
  await syncStaffCount(c);

  // চলতি মাসের স্টাফ চার্জ (ট্রায়ালে নয়)
  if (c.var.shopState.status !== "trial") {
    const fees = await platformSettings(c.env.PLATFORM_DB);
    const fee = toInt(fees.staff_fee, 99);
    if (fee > 0) {
      await applyLedger(c.env.PLATFORM_DB, c.env.SHOP_ID, "monthly", -fee, `staff-add:${r!.id}:${new Date().toISOString().slice(0, 7)}`, `নতুন স্টাফ: ${values.name}`);
    }
  }
  clearShopCache();
  flash(c, "ok", `${values.name} যোগ হয়েছে। সে ${values.email} দিয়ে /admin-এ লগইন করতে পারবে।`);
  return c.redirect("/admin/staff", 303);
});

admin.post("/staff/:id{[0-9]+}/role", async (c) => {
  const role = (await c.req.parseBody()).role === "manager" ? "manager" : "orders";
  await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ? AND role != 'owner'").bind(role, toInt(c.req.param("id"))).run();
  flash(c, "ok", "রোল বদলেছে।");
  return c.redirect("/admin/staff", 303);
});

admin.post("/staff/:id{[0-9]+}/password", async (c) => {
  const password = String((await c.req.parseBody()).password ?? "");
  if (password.length < 8) {
    flash(c, "error", "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে");
  } else {
    const id = toInt(c.req.param("id"));
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND role != 'owner'").bind(await hashPassword(password), id),
      c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND user_id IN (SELECT id FROM users WHERE role != 'owner')").bind(id),
    ]);
    flash(c, "ok", "পাসওয়ার্ড বদলেছে।");
  }
  return c.redirect("/admin/staff", 303);
});

admin.post("/staff/:id{[0-9]+}/delete", async (c) => {
  const id = toInt(c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND user_id IN (SELECT id FROM users WHERE role != 'owner')").bind(id),
    c.env.DB.prepare("DELETE FROM users WHERE id = ? AND role != 'owner'").bind(id),
  ]);
  await syncStaffCount(c);
  clearShopCache();
  flash(c, "ok", "স্টাফ মুছে ফেলা হয়েছে।");
  return c.redirect("/admin/staff", 303);
});

/* ---------- নিজের ডোমেইন (শুধু মালিক) — section "domains" ---------- */
function freeShopUrl(c: Ctx) {
  return `https://${c.env.SHOP_SLUG}.${c.env.PLATFORM_DOMAIN}`;
}

async function renderDomain(c: Ctx, form?: { value: string; error: string }) {
  const rows = await shopDomains(c.env.PLATFORM_DB, c.env.SHOP_ID);
  return render(c, "ডোমেইন", "domains",
    <DomainPage domains={rows} freeUrl={freeShopUrl(c)} configured={cfFromEnv(c.env).configured} value={form?.value} error={form?.error} />,
    form ? 422 : 200);
}

admin.get("/domain", (c) => renderDomain(c));
// "/admin/domain" রোল-চেকে section "domain" — "domains"-এর মতোই মালিকের জন্য

admin.post("/domain", async (c) => {
  const input = str((await c.req.parseBody()).domain, 260);
  const n = normalizeDomain(input, c.env.PLATFORM_DOMAIN);
  if (!n.domain) return renderDomain(c, { value: input, error: n.error! });
  const r = await addDomain(c.env.PLATFORM_DB, cfFromEnv(c.env), c.env.SHOP_ID, n.domain);
  if (!r.ok) return renderDomain(c, { value: input, error: r.message });
  flash(c, "ok", r.message);
  return c.redirect("/admin/domain", 303);
});

admin.post("/domain/check", async (c) => {
  const r = await checkDomain(c.env.PLATFORM_DB, cfFromEnv(c.env), c.env.SHOP_ID);
  flash(c, r.status === "active" ? "ok" : "error", r.message);
  return c.redirect("/admin/domain", 303);
});

admin.post("/domain/remove", async (c) => {
  await removeDomain(c.env.PLATFORM_DB, cfFromEnv(c.env), c.env.SHOP_ID);
  flash(c, "ok", "ডোমেইন সরানো হয়েছে। দোকান এখন শুধু ফ্রি ঠিকানায় চলবে।");
  return c.redirect("/admin/domain", 303);
});

/* ---------- DNS রেকর্ড ---------- */
async function zoneOf(c: Ctx) {
  const rows = await shopDomains(c.env.PLATFORM_DB, c.env.SHOP_ID);
  return rows[0] ? { zoneId: rows[0].zone_id!, root: rows[0].root! } : null;
}

async function renderDns(c: Ctx, form?: { error: string; values: Record<string, string> }) {
  const z = await zoneOf(c);
  if (!z) return c.redirect("/admin/domain", 303);
  const cf = cfFromEnv(c.env);
  const [list, scan] = await Promise.all([cf.listDns(z.zoneId), cf.scanList(z.zoneId)]);
  const toView = (r: DnsRecord): DnsView => ({ id: r.id, type: r.type, name: r.name, content: r.content, priority: r.priority, protected: isProtected(r, z.root) });
  return render(c, "DNS রেকর্ড", "domains",
    <DnsPage root={z.root} records={(list.ok ? list.result ?? [] : []).map(toView)} scanned={(scan.ok ? scan.result ?? [] : []).map(toView)}
      error={form?.error ?? (list.ok ? undefined : "Cloudflare থেকে রেকর্ড আনা যায়নি")} values={form?.values} />,
    form ? 422 : 200);
}

admin.get("/dns", (c) => renderDns(c));

admin.post("/dns", async (c) => {
  const z = await zoneOf(c);
  if (!z) return c.redirect("/admin/domain", 303);
  const b = await c.req.parseBody();
  const values = { type: str(b.type, 10), name: str(b.name, 200), content: str(b.content, 2000), priority: str(b.priority, 6) };
  const v = validateDnsInput(values.type, values.name, values.content, z.root);
  if (!v.record) return renderDns(c, { error: v.error!, values });
  if (values.type === "MX") v.record.priority = Math.min(65535, Math.max(0, toInt(values.priority, 10)));
  const r = await cfFromEnv(c.env).createDns(z.zoneId, v.record);
  if (!r.ok) return renderDns(c, { error: cfError(r), values });
  flash(c, "ok", "রেকর্ড যোগ হয়েছে।");
  return c.redirect("/admin/dns", 303);
});

admin.post("/dns/:id/delete", async (c) => {
  const z = await zoneOf(c);
  if (!z) return c.redirect("/admin/domain", 303);
  const cf = cfFromEnv(c.env);
  const list = await cf.listDns(z.zoneId);
  const rec = (list.result ?? []).find((r) => r.id === c.req.param("id"));
  if (!rec || isProtected(rec, z.root)) {
    flash(c, "error", "এই রেকর্ড মোছা যাবে না");
  } else {
    await cf.deleteDns(z.zoneId, rec.id);
    flash(c, "ok", "রেকর্ড মুছে ফেলা হয়েছে।");
  }
  return c.redirect("/admin/dns", 303);
});

admin.post("/dns/accept-scan", async (c) => {
  const z = await zoneOf(c);
  if (!z) return c.redirect("/admin/domain", 303);
  const cf = cfFromEnv(c.env);
  const scan = await cf.scanList(z.zoneId);
  const recs = scan.ok ? scan.result ?? [] : [];
  const accepts = recs.filter((r) => !isProtected(r, z.root)).map((r) => r.id);
  const rejects = recs.filter((r) => isProtected(r, z.root)).map((r) => r.id);
  await cf.scanReview(z.zoneId, accepts, rejects);
  flash(c, "ok", `${accepts.length}টা রেকর্ড যোগ হয়েছে।`);
  return c.redirect("/admin/dns", 303);
});

/* ---------- কুপন (মালিক ও ম্যানেজার) ---------- */
/** datetime-local (ঢাকার সময়) → UTC 'YYYY-MM-DD HH:MM:SS' */
function dhakaLocalToUtc(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+06:00`);
  return isNaN(d.getTime()) ? null : d.toISOString().replace("T", " ").slice(0, 19);
}

async function renderCoupons(c: Ctx, form?: { errors: Record<string, string>; values: Record<string, string> }) {
  const { results } = await c.env.DB.prepare("SELECT * FROM coupons ORDER BY active DESC, id DESC").all<CouponRow>();
  return render(c, "কুপন", "coupons", <CouponsPage coupons={results} errors={form?.errors} values={form?.values} />, form ? 422 : 200);
}

admin.get("/coupons", (c) => renderCoupons(c));

admin.post("/coupons", async (c) => {
  const b = await c.req.parseBody();
  const values: Record<string, string> = {
    code: normalizeCode(b.code), type: ["fixed", "percent", "free_delivery"].includes(String(b.type)) ? String(b.type) : "fixed",
    value: str(b.value, 10), max_discount: str(b.max_discount, 10), min_order: str(b.min_order, 10), usage_limit: str(b.usage_limit, 10),
    starts_at: str(b.starts_at, 20), expires_at: str(b.expires_at, 20), once_per_phone: b.once_per_phone ? "1" : "0",
  };
  const errors: Record<string, string> = {};
  if (values.code.length < 3) errors.code = "কমপক্ষে ৩ অক্ষরের কোড দিন (ইংরেজি অক্ষর/সংখ্যা)";
  else if (await c.env.DB.prepare("SELECT 1 FROM coupons WHERE code = ?").bind(values.code).first()) errors.code = "এই কোড আগেই আছে";
  const value = toInt(values.value, 0);
  if (values.type === "fixed" && value <= 0) errors.value = "ছাড়ের পরিমাণ দিন";
  if (values.type === "percent" && (value <= 0 || value > 100)) errors.value = "১ থেকে ১০০ এর মধ্যে দিন";
  if (Object.keys(errors).length) return renderCoupons(c, { errors, values });
  await c.env.DB.prepare(
    `INSERT INTO coupons (code, type, value, max_discount, min_order, starts_at, expires_at, usage_limit, once_per_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    values.code, values.type, values.type === "free_delivery" ? 0 : value,
    values.type === "percent" && toInt(values.max_discount) > 0 ? toInt(values.max_discount) : null,
    Math.max(0, toInt(values.min_order, 0)), dhakaLocalToUtc(values.starts_at), dhakaLocalToUtc(values.expires_at),
    toInt(values.usage_limit) > 0 ? toInt(values.usage_limit) : null, values.once_per_phone === "1" ? 1 : 0,
  ).run();
  flash(c, "ok", `কুপন ${values.code} তৈরি হয়েছে।`);
  return c.redirect("/admin/coupons", 303);
});

admin.post("/coupons/:id{[0-9]+}/toggle", async (c) => {
  await c.env.DB.prepare("UPDATE coupons SET active = 1 - active WHERE id = ?").bind(toInt(c.req.param("id"))).run();
  return c.redirect("/admin/coupons", 303);
});

admin.post("/coupons/:id{[0-9]+}/delete", async (c) => {
  await c.env.DB.prepare("DELETE FROM coupons WHERE id = ? AND used_count = 0").bind(toInt(c.req.param("id"))).run();
  flash(c, "ok", "কুপন মুছে ফেলা হয়েছে।");
  return c.redirect("/admin/coupons", 303);
});

/* ---------- ল্যান্ডিং পেজ বিল্ডার (পণ্যের অনুমতি যাদের আছে) ---------- */
async function productById(c: Ctx, id: number) {
  return c.env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<Product>();
}

admin.get("/products/:id{[0-9]+}/landing", async (c) => {
  const p = await productById(c, toInt(c.req.param("id")));
  if (!p) return c.redirect("/admin/products", 303);
  const landing = parseLanding(p.landing_json) ?? defaultLanding(p);
  return render(c, "ল্যান্ডিং পেজ", "products",
    <LandingBuilderPage product={p} landingJson={JSON.stringify(landing)} labels={SECTION_LABEL} custom={!!p.landing_json} />);
});

function landingFromBody(raw: unknown) {
  try {
    return normalizeLanding(JSON.parse(String(raw ?? "")));
  } catch {
    return null;
  }
}

admin.post("/products/:id{[0-9]+}/landing", async (c) => {
  const id = toInt(c.req.param("id"));
  const landing = landingFromBody((await c.req.parseBody()).landing_json);
  if (!landing) {
    flash(c, "error", "সেভ করা যায়নি, আবার চেষ্টা করুন");
  } else {
    await c.env.DB.prepare("UPDATE products SET landing_json = ?, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(landing), id).run();
    flash(c, "ok", "ল্যান্ডিং পেজ সেভ হয়েছে।");
  }
  return c.redirect(`/admin/products/${id}/landing`, 303);
});

admin.post("/products/:id{[0-9]+}/landing/preview", async (c) => {
  const p = await productById(c, toInt(c.req.param("id")));
  const landing = landingFromBody((await c.req.parseBody()).landing_json);
  if (!p || !landing) return c.text("প্রিভিউ করা যায়নি", 400);
  const s = c.var.settings;
  c.header("Cache-Control", "no-store");
  return c.html("<!DOCTYPE html>" + String(
    <Layout title={`প্রিভিউ — ${p.name}`} settings={s}>
      <div class="banner banner-warn">প্রিভিউ — এখনো সেভ হয়নি</div>
      <BuiltLanding p={p} landing={landing} variants={await productVariants(c.env.DB, p.id)} settings={s} />
    </Layout>,
  ));
});

admin.post("/products/:id{[0-9]+}/landing/reset", async (c) => {
  const id = toInt(c.req.param("id"));
  await c.env.DB.prepare("UPDATE products SET landing_json = NULL WHERE id = ?").bind(id).run();
  flash(c, "ok", "সাধারণ ল্যান্ডিং পেজে ফেরানো হয়েছে।");
  return c.redirect(`/admin/products/${id}/landing`, 303);
});

/** বিল্ডারের ছবি আপলোড (গ্যালারি, রিভিউ স্ক্রিনশট) */
admin.post("/upload-image", async (c) => {
  const file = (await c.req.parseBody()).image;
  if (!(file instanceof File) || !file.size) return c.json({ message: "ছবি পাওয়া যায়নি" }, 400);
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return c.json({ message: "শুধু JPG, PNG বা WebP" }, 400);
  if (file.size > MAX_IMAGE) return c.json({ message: "ছবি ৩ MB-এর কম হতে হবে" }, 400);
  const key = `p/${crypto.randomUUID()}.${ext}`;
  await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, key), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return c.json({ key });
});
