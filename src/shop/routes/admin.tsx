import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { imageStorageKey, type AppEnv, type Ctx } from "../env";
import { AdminLayout, BlacklistPage, CategoriesPage, LoginPage, OrderDetailPage, OrdersPage, ProductFormPage, ProductsPage, SettingsPage, STATUS_TABS, type BlacklistRow, type Flash } from "../views/admin";
import { ADMIN_COOKIE, requireAdmin } from "../middleware/admin-auth";
import { createSession, destroySession, sha256Hex, verifyPassword } from "../lib/auth";
import { changeStatus } from "../lib/order-status";
import { getOrderById, type Order, type OrderStatus } from "../lib/orders";
import type { Category, Product } from "../lib/products";
import { normalizePhone } from "../lib/phone";
import { saveSettings } from "../lib/settings";
import { clientIp, isHttps, str, toInt } from "../lib/http";
import { youtubeId } from "../lib/format";
import { hitRateLimit } from "../lib/order-guard";
import { sendPurchase } from "../lib/capi";
import { BillingPage, type LedgerRow, type TopupRow } from "../views/admin";
import { billingShop, chargeConfirmedOrder, platformSettings } from "../../platform/billing";
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
      String(<AdminLayout title={title} settings={c.var.settings} active={active} flash={takeFlash(c)} email={c.var.admin?.email} state={c.var.shopState}>{body as any}</AdminLayout>),
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

  const user = await c.env.DB.prepare("SELECT id, password_hash, is_admin FROM users WHERE email = ?").bind(email)
    .first<{ id: number; password_hash: string; is_admin: number }>();
  if (!user || !user.is_admin || !(await verifyPassword(password, user.password_hash))) return fail("ইমেইল বা পাসওয়ার্ড ভুল");

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
  return render(c, "পণ্য এডিট", "products", <ProductFormPage product={p} categories={await allCategories(c.env.DB)} />);
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
  };
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

  const cols = [v.category_id, v.name, v.slug, v.price, v.compare_price, imageKey, v.headline, v.short_desc, v.details_html, v.youtube_url, v.is_active, v.show_on_home, v.sort_order];
  if (id) {
    await db.prepare(
      `UPDATE products SET category_id=?, name=?, slug=?, price=?, compare_price=?, image=?, headline=?, short_desc=?, details_html=?,
         youtube_url=?, is_active=?, show_on_home=?, sort_order=?, updated_at=datetime('now') WHERE id=?`,
    ).bind(...cols, id).run();
  } else {
    await db.prepare(
      `INSERT INTO products (category_id, name, slug, price, compare_price, image, headline, short_desc, details_html, youtube_url, is_active, show_on_home, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(...cols).run();
  }
  flash(c, "ok", "পণ্য সেভ হয়েছে।");
  return c.redirect("/admin/products", 303);
}

admin.post("/products", (c) => saveProduct(c, null));
admin.post("/products/:id{[0-9]+}", (c) => saveProduct(c, toInt(c.req.param("id"))));

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
