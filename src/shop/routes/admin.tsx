import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { imageStorageKey, type AppEnv, type Ctx } from "../env";
import { AdminLayout, BlacklistPage, BulkImagesPage, CategoriesPage, LoginPage, OrderDetailPage, OrdersPage, ProductFormPage, ProductsPage, STATUS_TABS, type BlacklistRow, type Flash } from "../views/admin";
import { ADMIN_COOKIE, requireAdmin } from "../middleware/admin-auth";
import { createSession, destroySession, hashPassword, sha256Hex, verifyPassword } from "../lib/auth";
import { changeStatus } from "../lib/order-status";
import { getOrderById, type Order, type OrderItem, type OrderStatus } from "../lib/orders";
import { InvoicePage, type InvoiceData } from "../views/invoice";
import { productVariants, syncVariants, type Category, type Product } from "../lib/products";
import { normalizePhone } from "../lib/phone";
import { GA4_RE, GTM_RE, safeColor, loadSettings, saveSettings, themeOf, THEMES, TIKTOK_RE, type ThemeKey } from "../lib/settings";
import { cfgDiff, cfgFromForm, GROUPS, themeConfig } from "../lib/theme-config";
import { clientIp, isHttps, publicOrigin, str, toInt } from "../lib/http";
import { PagesPage, ThemeCustomizePage, SettingsAppearancePage, type PageRow, SettingsCheckoutPage, SettingsDeliveryPage, SettingsGeneralPage, SettingsSeoPage, SettingsTrackingPage, ShopDashboardPage, type ShopDash, type SetupStep } from "../views/admin-pro";
import { bn, youtubeId } from "../lib/format";
import { hitRateLimit } from "../lib/order-guard";
import { sendPurchase } from "../lib/capi";
import { CouponsPage, LandingBuilderPage, LandingListPage, ReportsPage, TemplateGalleryPage, type CouponRow, type LandingRow } from "../views/admin";
import { buildReport, resolveRange } from "../lib/reports";
import { defaultLanding, FONTS, normalizeLanding, parseLanding, SECTION_LABEL } from "../lib/landing";
import { loadTemplate, MAX_MY_TEMPLATES, myTemplates, platformTemplates, thumbBlocks } from "../lib/landing-templates";
import { Layout } from "../views/layout";
import { BuiltLanding } from "../views/landing";
import { normalizeCode } from "../lib/coupons";
import { BillingPage, DnsPage, DomainPage, StaffPage, type DnsView, type LedgerRow, type StaffRow, type TopupRow } from "../views/admin";
import { addDomain, cfFromEnv, checkDomain, isProtected, normalizeDomain, removeDomain, shopDomains, validateDnsInput } from "../../platform/domains";
import { cfError, type DnsRecord } from "../../platform/cf";
import { applyLedger, billingShop, chargeConfirmedOrder, platformSettings } from "../../platform/billing";
import { clearShopCache } from "../../platform/resolve";
import { CustomersPage, CUSTOMERS_PER_PAGE, type CustomerRow } from "../views/customers";
import { configuredCouriers, COURIER_NAME, parcelStatus, pathaoList, redxAreas, sendParcel, type CourierKey, type SendOptions } from "../lib/courier";
import { CourierPage, SmsPage, type SmsLogRow } from "../views/admin";
import { notifyOrder, resendSms, SMS_PROVIDERS, testSms, type SmsEvent } from "../lib/sms";
import { registerSupport } from "./support";

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

/* সুপার অ্যাডমিনের ঘোষণা (সব দোকানে) — ১ মিনিট cache */
type Announcement = { id: number; title: string; body: string | null; level: string };
let annCache: { at: number; list: Announcement[] } | null = null;
async function announcements(c: Ctx): Promise<Announcement[]> {
  if (annCache && Date.now() - annCache.at < 60_000) return annCache.list;
  try {
    const { results } = await c.env.PLATFORM_DB.prepare(
      "SELECT id, title, body, level FROM announcements WHERE active = 1 AND (ends_at IS NULL OR ends_at > datetime('now')) ORDER BY id DESC LIMIT 3",
    ).all<Announcement>();
    annCache = { at: Date.now(), list: results };
  } catch {
    annCache = { at: Date.now(), list: [] };
  }
  return annCache.list;
}
export const clearAnnouncementCache = () => { annCache = null; };

/** দোকানের শেষ লগইন (সুপার অ্যাডমিনের "সক্রিয় দোকান" হিসাবের জন্য) */
async function markShopLogin(c: Ctx) {
  await c.env.PLATFORM_DB.prepare("UPDATE shops SET last_login_at = datetime('now') WHERE id = ?").bind(c.env.SHOP_ID).run().catch(() => {});
}

async function render(c: Ctx, title: string, active: string, body: unknown, status: 200 | 404 | 422 = 200) {
  const ann = await announcements(c);
  const pending = c.var.admin ? await c.env.DB.prepare("SELECT COUNT(*) n FROM orders WHERE status = 'new'").first<{ n: number }>() : null;
  return c.html(
    "<!DOCTYPE html>" +
      String(<AdminLayout title={title} settings={c.var.settings} active={active} flash={takeFlash(c)} email={c.var.admin?.email} role={c.var.admin?.role} state={c.var.shopState} announcements={ann} support={getCookie(c, "support_mode") === "1"} newOrders={pending?.n ?? 0}>{body as any}</AdminLayout>),
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
  await markShopLogin(c);
  return c.redirect("/admin", 303);
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
  if (c.req.query("support") === "1") {
    setCookie(c, "support_mode", "1", { path: "/admin", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 * 60 * 24 * 7 });
    flash(c, "ok", "সুপার অ্যাডমিন থেকে এই দোকানের প্যানেলে ঢুকেছেন।");
  } else {
    await markShopLogin(c);
    flash(c, "ok", "স্বাগতম! আপনার দোকান তৈরি হয়ে গেছে। নিচের ধাপগুলো শেষ করে দোকান সাজিয়ে নিন।");
  }
  return c.redirect("/admin", 303);
});

admin.post("/logout", async (c) => {
  await destroySession(c.env.DB, getCookie(c, ADMIN_COOKIE));
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
  const wasSupport = getCookie(c, "support_mode") === "1";
  deleteCookie(c, "support_mode", { path: "/admin" });
  // সাপোর্ট মোড থেকে বের হলে সুপার অ্যাডমিনে ফেরা
  if (wasSupport) return c.redirect(`https://${c.env.PLATFORM_DOMAIN}/super/shops/${c.env.SHOP_ID}`, 303);
  return c.redirect("/admin/login", 303);
});

/* ---------- এর পরের সব পেজে লগইন লাগবে ---------- */
admin.use("*", requireAdmin);

/* ---------- ড্যাশবোর্ড ---------- */
admin.get("/", async (c) => {
  const db = c.env.DB;
  const s = c.var.settings;
  // ঢাকার দিন: UTC + ৬ ঘণ্টা
  const todayStart = "datetime(date('now', '+6 hours'), '-6 hours')";
  const [t, y, pend, m, ch, rec, top, prods] = await db.batch([
    db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN status NOT IN ('fake', 'cancelled') THEN total END), 0) v FROM orders WHERE created_at >= ${todayStart}`),
    db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN status NOT IN ('fake', 'cancelled') THEN total END), 0) v FROM orders WHERE created_at >= datetime(${todayStart}, '-1 day') AND created_at < ${todayStart}`),
    db.prepare("SELECT COUNT(*) n FROM orders WHERE status = 'new'"),
    db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(status IN ('confirmed', 'shipped')), 0) ok, COALESCE(SUM(status IN ('fake', 'cancelled')), 0) bad,
        COALESCE(SUM(CASE WHEN status IN ('confirmed', 'shipped') THEN total END), 0) sales FROM orders WHERE created_at >= datetime('now', '-30 days')`),
    db.prepare(`SELECT date(created_at, '+6 hours') d, COUNT(*) a, COALESCE(SUM(status IN ('confirmed', 'shipped')), 0) ok FROM orders WHERE created_at >= datetime('now', '-14 days') GROUP BY d`),
    db.prepare("SELECT id, order_no, name, phone, total, status, created_at FROM orders ORDER BY id DESC LIMIT 8"),
    db.prepare(`SELECT i.product_name, SUM(COALESCE(i.qty, 1)) n, SUM(i.price * COALESCE(i.qty, 1)) amount FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.created_at >= datetime('now', '-30 days') AND o.status IN ('confirmed', 'shipped') GROUP BY i.product_name ORDER BY n DESC LIMIT 6`),
    db.prepare("SELECT COUNT(*) total, COALESCE(SUM(is_active), 0) active FROM products"),
  ]);
  const one = (r: D1Result | undefined) => (r!.results[0] ?? {}) as Record<string, number>;
  const byDay = new Map((ch!.results as { d: string; a: number; ok: number }[]).map((r) => [r.d, r]));
  const chart: ShopDash["chart"] = [];
  const now = Date.now() + 6 * 3600e3;
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400e3).toISOString().slice(0, 10);
    const r = byDay.get(d);
    chart.push({ label: bn(`${d.slice(8, 10)}/${d.slice(5, 7)}`), all: r?.a ?? 0, confirmed: r?.ok ?? 0 });
  }
  const mm = one(m);
  const pr = one(prods);
  const domain = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM domains WHERE shop_id = ? AND status = 'active' LIMIT 1").bind(c.env.SHOP_ID).first().catch(() => null);
  const setup: SetupStep[] = [
    { key: "info", label: "দোকানের নাম আর যোগাযোগ নম্বর", desc: "কাস্টমার যাতে আপনাকে খুঁজে পান", done: !!s.site_name && !!s.contact_phone && s.contact_phone !== "01700000000", href: "/admin/settings" },
    { key: "logo", label: "লোগো দিন", desc: "দোকানের পরিচয়", done: !!s.logo, href: "/admin/settings/appearance" },
    { key: "product", label: "প্রথম পণ্য যোগ করুন", desc: "প্রতিটা পণ্যের নিজের ল্যান্ডিং পেজ তৈরি হয়", done: (pr.total ?? 0) > 0, href: "/admin/products/new" },
    { key: "delivery", label: "ডেলিভারি চার্জ ঠিক করুন", desc: "ঢাকার ভিতরে আর বাইরে", done: !!s.delivery_inside && !!s.delivery_outside, href: "/admin/settings/delivery" },
    { key: "pixel", label: "Facebook Pixel + Conversions API", desc: "অ্যাডের ফল মাপতে আর খরচ কমাতে", done: !!s.fb_pixel_id && !!s.fb_capi_token, href: "/admin/settings/tracking" },
    { key: "seo", label: "SEO টাইটেল আর ডেসক্রিপশন", desc: "Google আর শেয়ারে সুন্দর দেখাতে", done: !!s.seo_title && !!s.seo_description, href: "/admin/settings/seo" },
    { key: "courier", label: "কুরিয়ার যুক্ত করুন", desc: "এক ক্লিকে পার্সেল বুকিং", done: configuredCouriers(s).length > 0, href: "/admin/courier" },
    { key: "domain", label: "নিজের ডোমেইন (ঐচ্ছিক)", desc: "yourshop.com", done: !!domain, href: "/admin/domain" },
  ];
  const d: ShopDash = {
    today: { orders: one(t).n ?? 0, value: one(t).v ?? 0 },
    yesterday: { orders: one(y).n ?? 0, value: one(y).v ?? 0 },
    pending: one(pend).n ?? 0,
    d30: { orders: mm.n ?? 0, confirmed: mm.ok ?? 0, fake: mm.bad ?? 0, sales: mm.sales ?? 0, aov: mm.ok ? (mm.sales ?? 0) / mm.ok : 0 },
    chart,
    recent: rec!.results as ShopDash["recent"],
    top: top!.results as ShopDash["top"],
    products: { total: pr.total ?? 0, active: pr.active ?? 0 },
    setup,
    storeUrl: publicOrigin(c),
  };
  return render(c, "ড্যাশবোর্ড", "dashboard", <ShopDashboardPage d={d} role={c.var.admin!.role} />);
});

/* ---------- অর্ডার ---------- */
const PER_PAGE = 50;

/** তারিখের সীমা — ঢাকার দিন ধরে (created_at UTC-তে থাকে) */
const ORDER_RANGES = { all: 0, today: 1, "7": 7, "30": 30 } as const;
type OrderRange = keyof typeof ORDER_RANGES;

admin.get("/orders", async (c) => {
  const db = c.env.DB;
  const status = (STATUS_TABS as string[]).includes(c.req.query("status") || "") ? (c.req.query("status") as OrderStatus) : "new";
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const page = Math.max(1, toInt(c.req.query("page"), 1));
  const range: OrderRange = (c.req.query("range") || "") in ORDER_RANGES ? (c.req.query("range") as OrderRange) : "all";
  const days = ORDER_RANGES[range];
  const dateCond = days ? `date(o.created_at, '+6 hours') >= date('now', '+6 hours', '-${days - 1} days')` : "1";

  const { results: countRows } = await db.prepare(`SELECT status, COUNT(*) n FROM orders o WHERE ${dateCond} GROUP BY status`).all<{ status: string; n: number }>();
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
      `SELECT o.*, (SELECT COALESCE(SUM(qty), 0) FROM order_items i WHERE i.order_id = o.id) AS item_count
       FROM orders o WHERE ${where} AND ${dateCond} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, PER_PAGE + 1, (page - 1) * PER_PAGE)
    .all<Order & { item_count: number }>();
  const orders = results.slice(0, PER_PAGE);

  // কাস্টমারের আগের রেকর্ড: এই পাতার নম্বরগুলোর ডেলিভারি/বাতিল (একটাই কোয়েরি)
  const phones = [...new Set(orders.map((o) => o.phone))];
  const history: Record<string, { good: number; bad: number }> = {};
  if (phones.length) {
    const { results: h } = await db.prepare(
      `SELECT phone, SUM(status IN ('confirmed', 'shipped')) good, SUM(status IN ('cancelled', 'fake')) bad
       FROM orders WHERE phone IN (${phones.map(() => "?").join(",")}) GROUP BY phone`,
    ).bind(...phones).all<{ phone: string; good: number; bad: number }>();
    for (const r of h) history[r.phone] = { good: r.good, bad: r.bad };
  }

  return render(c, "অর্ডার", "orders",
    <OrdersPage orders={orders} counts={counts} status={status} q={q} page={page} range={range} history={history}
      hasMore={results.length > PER_PAGE} couriers={configuredCouriers(c.var.settings)} />);
});

/** কাস্টমার: ফোন নম্বর ধরে অর্ডারের হিসাব */
admin.get("/customers", async (c) => {
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const page = Math.max(1, toInt(c.req.query("page"), 1));
  let where = "";
  let binds: unknown[] = [];
  if (q) {
    const phone = normalizePhone(q);
    const like = `%${q.replace(/[%_]/g, "")}%`;
    where = "WHERE (phone LIKE ? OR name LIKE ?" + (phone ? " OR phone = ?" : "") + ")";
    binds = [like, like, ...(phone ? [phone] : [])];
  }
  const total = await c.env.DB.prepare("SELECT COUNT(DISTINCT phone) n FROM orders").first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT phone,
            (SELECT o2.name FROM orders o2 WHERE o2.phone = o.phone ORDER BY o2.id DESC LIMIT 1) AS name,
            COUNT(*) AS orders,
            SUM(status IN ('confirmed', 'shipped')) AS delivered,
            SUM(status IN ('cancelled', 'fake')) AS bad,
            COALESCE(SUM(CASE WHEN status IN ('confirmed', 'shipped') THEN total END), 0) AS spent,
            MAX(created_at) AS last_at
     FROM orders o ${where} GROUP BY phone ORDER BY MAX(id) DESC LIMIT ? OFFSET ?`,
  ).bind(...binds, CUSTOMERS_PER_PAGE + 1, (page - 1) * CUSTOMERS_PER_PAGE).all<CustomerRow>();
  return render(c, "কাস্টমার", "customers",
    <CustomersPage rows={results.slice(0, CUSTOMERS_PER_PAGE)} q={q} page={page} hasMore={results.length > CUSTOMERS_PER_PAGE} total={total?.n ?? 0} />);
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
  const sms = (await db.prepare("SELECT * FROM sms_logs WHERE order_id = ? ORDER BY id").bind(o.id).all<SmsLogRow>()).results;
  return render(c, o.order_no, "orders",
    <OrderDetailPage order={o} items={data.items} history={hist!.results as Order[]} blocked={{ phone: types.includes("phone"), device: types.includes("device") }} couriers={configuredCouriers(c.var.settings)} sms={sms} />);
});

/** স্ট্যাটাস বদল + তার পরের কাজ (বিলিং, Purchase, SMS) — একটা আর একসাথে অনেক অর্ডার দুটোতেই */
async function applyStatus(c: Ctx, id: number, to: OrderStatus): Promise<{ ok: boolean; message: string; purchaseFail?: string }> {
  const res = await changeStatus(c.env.DB, id, to);
  if (!res.ok) return { ok: false, message: res.message };
  if (to === "confirmed") {
    // বিলিং: ট্রায়ালে ফ্রি অর্ডার কমে, চালু দোকানে প্রতি কনফার্ম অর্ডারে চার্জ (একবারই)
    try {
      await chargeConfirmedOrder(c.env.PLATFORM_DB, c.env.SHOP_ID, res.order.order_no);
      clearShopCache(); // একই Worker-এ পরের রিকোয়েস্টে নতুন ব্যালেন্স (অন্য জায়গায় সর্বোচ্চ ৩০ সেকেন্ড দেরি)
    } catch (e) {
      console.error("billing error", e);
    }
    // কনফার্ম হলে শুধু সার্ভার থেকে (CAPI) Purchase যায়
    const p = await sendPurchase(c.env.DB, id, c.var.settings);
    smsLater(c, id, "confirmed");
    return p.ok
      ? { ok: true, message: "অর্ডার কনফার্ম হয়েছে, Facebook-এ Purchase গেছে।" }
      : { ok: true, message: `অর্ডার কনফার্ম হয়েছে, কিন্তু Purchase যায়নি: ${p.message}`, purchaseFail: p.message };
  }
  if (to === "cancelled" || to === "fake") return { ok: true, message: "স্ট্যাটাস বদলেছে। নম্বর ও ডিভাইস ব্লক করা হয়েছে।" };
  if (to === "shipped") smsLater(c, id, "shipped");
  return { ok: true, message: "স্ট্যাটাস বদলেছে।" };
}

admin.post("/orders/:id{[0-9]+}/status", async (c) => {
  const id = toInt(c.req.param("id"));
  const to = str((await c.req.parseBody()).status, 20) as OrderStatus;
  const r = await applyStatus(c, id, to);
  flash(c, r.ok && !r.purchaseFail ? "ok" : "error", r.message);
  return c.redirect(`/admin/orders/${id}`, 303);
});

/** একসাথে অনেক অর্ডারের স্ট্যাটাস। কনফার্মে বাইরের কল (বিলিং, Purchase) হয়, তাই একবারে সর্বোচ্চ ১০টা */
export const BULK_CONFIRM_MAX = 10;
admin.post("/orders/bulk-status", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const to = str(body.to, 20) as OrderStatus;
  const back = str(body.back, 300);
  const backUrl = back.startsWith("/admin/orders") ? back : "/admin/orders";
  if (!["confirmed", "cancelled", "fake", "shipped"].includes(to)) {
    flash(c, "error", "ভুল স্ট্যাটাস।");
    return c.redirect(backUrl, 303);
  }
  const raw = Array.isArray(body.ids) ? body.ids : body.ids != null ? [body.ids] : [];
  const ids = [...new Set(raw.map((x) => toInt(String(x))).filter((n) => n > 0))].slice(0, 100);
  if (!ids.length) {
    flash(c, "error", "কোনো অর্ডার বাছাই করা হয়নি।");
    return c.redirect(backUrl, 303);
  }
  if (to === "confirmed" && ids.length > BULK_CONFIRM_MAX) {
    flash(c, "error", `একবারে সর্বোচ্চ ${bn(BULK_CONFIRM_MAX)}টা অর্ডার কনফার্ম করা যায় (প্রতিটায় Facebook-এ Purchase যায়)।`);
    return c.redirect(backUrl, 303);
  }
  let done = 0;
  const fails: string[] = [];
  for (const id of ids) {
    const r = await applyStatus(c, id, to);
    if (r.ok) done++;
    if (!r.ok || r.purchaseFail) fails.push(r.message);
  }
  const label = { confirmed: "কনফার্ম", cancelled: "বাতিল", fake: "ফেক", shipped: "শিপড" }[to as "confirmed"];
  flash(c, fails.length ? "error" : "ok",
    `${bn(done)}টা অর্ডার ${label} হয়েছে।` + (fails.length ? ` ${bn(fails.length)}টায় সমস্যা: ${[...new Set(fails)].slice(0, 2).join(" · ")}` : ""));
  return c.redirect(backUrl, 303);
});

admin.post("/orders/:id{[0-9]+}/purchase", async (c) => {
  const id = toInt(c.req.param("id"));
  const p = await sendPurchase(c.env.DB, id, c.var.settings);
  flash(c, p.ok ? "ok" : "error", p.ok ? "Purchase পাঠানো হয়েছে।" : `Purchase যায়নি: ${p.message}`);
  return c.redirect(`/admin/orders/${id}`, 303);
});

/* ---------- SMS (রেসপন্সের পরে পেছনে যায়) ---------- */
function smsLater(c: Ctx, orderId: number, event: SmsEvent) {
  const job = notifyOrder(c.env.DB, c.var.settings, orderId, event).catch((e) => console.error("sms error", e));
  try { c.executionCtx.waitUntil(job); } catch { /* টেস্ট/লোকাল */ }
}

/* ---------- কুরিয়ার ---------- */
const COURIERS: CourierKey[] = ["steadfast", "pathao", "redx"];
const saver = (c: Ctx) => (v: Record<string, string>) => saveSettings(c.env.DB, v);

/**
 * একটা অর্ডার কুরিয়ারে পাঠানো। একই অর্ডার দুবার বুক না হয় সেজন্য আগে "sending" দিয়ে দাবি করা হয়।
 * সফল হলে অর্ডার নিজে থেকে "শিপড" হয়।
 */
async function bookOrder(c: Ctx, id: number, courier: CourierKey, opt: Partial<SendOptions>): Promise<{ ok: boolean; message: string }> {
  const db = c.env.DB;
  const s = c.var.settings;
  if (!configuredCouriers(s).includes(courier)) return { ok: false, message: `${COURIER_NAME[courier]}-এর API তথ্য দেওয়া নেই (সেটিংস → কুরিয়ার)` };
  const data = await getOrderById(db, id);
  if (!data) return { ok: false, message: "অর্ডার পাওয়া যায়নি" };
  const o = data.order;
  if (o.status !== "confirmed") return { ok: false, message: `${o.order_no}: শুধু কনফার্ম হওয়া অর্ডার কুরিয়ারে পাঠানো যায়` };
  if (o.consignment_id) return { ok: false, message: `${o.order_no}: আগেই ${COURIER_NAME[o.courier as CourierKey] ?? o.courier}-এ পাঠানো হয়েছে` };
  const claim = await db.prepare(
    `UPDATE orders SET courier = ?, courier_status = 'sending', courier_sent_at = datetime('now')
     WHERE id = ? AND status = 'confirmed' AND consignment_id IS NULL
       AND (courier_status IS NULL OR courier_status != 'sending' OR courier_sent_at < datetime('now', '-2 minutes'))`,
  ).bind(courier, id).run();
  if (!claim.meta.changes) return { ok: false, message: `${o.order_no}: এখন পাঠানো হচ্ছে, একটু পরে দেখুন` };

  const note = [o.note, data.items.map((i) => i.product_name + (i.variant_label ? ` (${i.variant_label})` : "")).join(", ")].filter(Boolean).join(" | ");
  const r = await sendParcel(courier, s, o, data.items, { cod: o.total, note, ...opt }, saver(c));
  if (!r.ok) {
    await db.prepare("UPDATE orders SET courier = NULL, courier_status = NULL, courier_sent_at = NULL, courier_response = ? WHERE id = ?").bind(r.raw || r.message, id).run();
    return { ok: false, message: `${o.order_no}: ${r.message}` };
  }
  await db.prepare(
    `UPDATE orders SET consignment_id = ?, tracking_code = ?, courier_status = ?, courier_response = ?, courier_sent_at = datetime('now'), courier_checked_at = datetime('now') WHERE id = ?`,
  ).bind(r.consignmentId, r.trackingCode || r.consignmentId, r.status || "", r.raw.slice(0, 4000), id).run();
  const moved = await changeStatus(db, id, "shipped");
  if (moved.ok) smsLater(c, id, "shipped");
  return { ok: true, message: `${o.order_no}: ${r.message} (${r.trackingCode || r.consignmentId})` };
}

admin.post("/orders/:id{[0-9]+}/courier", async (c) => {
  const id = toInt(c.req.param("id"));
  const b = await c.req.parseBody();
  const courier = String(b.courier) as CourierKey;
  if (!COURIERS.includes(courier)) {
    flash(c, "error", "কুরিয়ার বাছাই করুন");
    return c.redirect(`/admin/orders/${id}`, 303);
  }
  const cod = toInt(b.cod, -1);
  const opt: Partial<SendOptions> = {
    pathaoCity: toInt(b.pathao_city) || undefined,
    pathaoZone: toInt(b.pathao_zone) || undefined,
    pathaoArea: toInt(b.pathao_area) || undefined,
    redxAreaId: toInt(b.redx_area_id) || undefined,
    redxAreaName: str(b.redx_area_name, 100),
    weightKg: Math.min(30, Math.max(0.1, Number(b.weight) || 0.5)),
  };
  if (cod >= 0) opt.cod = cod;
  const r = await bookOrder(c, id, courier, opt);
  flash(c, r.ok ? "ok" : "error", r.message);
  return c.redirect(`/admin/orders/${id}`, 303);
});

admin.post("/orders/:id{[0-9]+}/courier/status", async (c) => {
  const id = toInt(c.req.param("id"));
  const o = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<Order>();
  if (!o?.consignment_id) {
    flash(c, "error", "এই অর্ডার কুরিয়ারে পাঠানো হয়নি");
  } else {
    const r = await parcelStatus(c.var.settings, o, saver(c));
    if (r.ok) {
      await c.env.DB.prepare("UPDATE orders SET courier_status = ?, courier_checked_at = datetime('now') WHERE id = ?").bind(r.status, id).run();
      flash(c, "ok", `কুরিয়ার স্ট্যাটাস: ${r.status}`);
    } else {
      flash(c, "error", r.message);
    }
  }
  return c.redirect(`/admin/orders/${id}`, 303);
});

/** অনেক অর্ডার একসাথে (Steadfast বা Pathao — Pathao ঠিকানা দেখে শহর/এলাকা নিজে বোঝে) */
admin.post("/orders/bulk-courier", async (c) => {
  const b = await c.req.parseBody({ all: true });
  const courier = String(b.courier) as CourierKey;
  const raw = b["ids"] ?? b["ids[]"];
  const ids = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => toInt(x)).filter((x) => x > 0))].slice(0, 20); // ফ্রি প্ল্যানে একবারে ৫০টা বাইরের কল — তাই ২০টা অর্ডার
  if (courier !== "steadfast" && courier !== "pathao") {
    flash(c, "error", "একসাথে পাঠানো যায় Steadfast বা Pathao-তে। RedX-এ এলাকা বাছতে হয়, তাই অর্ডার খুলে পাঠান।");
  } else if (!ids.length) {
    flash(c, "error", "অন্তত একটা অর্ডার বাছাই করুন");
  } else {
    const done: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      const r = await bookOrder(c, id, courier, {});
      (r.ok ? done : failed).push(r.message);
    }
    const text = `${done.length}টা অর্ডার ${COURIER_NAME[courier]}-এ গেছে।` + (failed.length ? ` ${failed.length}টা যায়নি — ${failed.join("; ")}` : "");
    flash(c, failed.length ? "error" : "ok", text.slice(0, 1500));
  }
  return c.redirect("/admin/orders?status=confirmed", 303);
});

/** ড্রপডাউনের জন্য শহর/জোন/এলাকা (অর্ডারের অনুমতি থাকলেই) */
admin.get("/orders/courier-locations", async (c) => {
  const s = c.var.settings;
  const which = c.req.query("courier");
  const type = c.req.query("type");
  const id = toInt(c.req.query("id"));
  if (which === "pathao" && configuredCouriers(s).includes("pathao") && (type === "cities" || type === "zones" || type === "areas")) {
    if (type !== "cities" && !id) return c.json({ items: [] });
    const r = await pathaoList(s, saver(c), type, id);
    return c.json(r, r.error ? 502 : 200);
  }
  if (which === "redx" && configuredCouriers(s).includes("redx")) {
    const r = await redxAreas(s);
    return c.json(r, r.error ? 502 : 200);
  }
  return c.json({ items: [], error: "কুরিয়ার চালু নেই" }, 400);
});

/* কুরিয়ার সেটিংস (শুধু মালিক) */
const COURIER_SECRET_KEYS = ["steadfast_secret_key", "pathao_client_secret", "pathao_password", "redx_token"] as const;
const COURIER_PLAIN_KEYS = ["steadfast_api_key", "pathao_client_id", "pathao_username", "pathao_store_id", "redx_pickup_store_id"] as const;

admin.get("/courier", (c) => render(c, "কুরিয়ার", "courier", <CourierPage s={c.var.settings} active={configuredCouriers(c.var.settings)} />));

admin.post("/courier", async (c) => {
  const b = await c.req.parseBody();
  const s = c.var.settings;
  const values: Record<string, string> = {};
  for (const k of COURIER_PLAIN_KEYS) values[k] = str(b[k], 200);
  // গোপন তথ্য: ফাঁকা রাখলে আগেরটাই থাকে; "মুছুন" টিক দিলে মুছে যায়
  for (const k of COURIER_SECRET_KEYS) {
    const v = str(b[k], 2000);
    if (v) values[k] = v;
    else if (b[`clear_${k}`]) values[k] = "";
  }
  values.pathao_sandbox = b.pathao_sandbox ? "1" : "0";
  values.redx_sandbox = b.redx_sandbox ? "1" : "0";
  // Pathao-র তথ্য বদলালে পুরনো টোকেন বাদ
  const pathaoChanged = ["pathao_client_id", "pathao_username", "pathao_client_secret", "pathao_password", "pathao_sandbox"].some((k) => k in values && values[k] !== (s[k] ?? ""));
  if (pathaoChanged) { values.pathao_token = ""; values.pathao_token_expires = "0"; }
  for (const k of ["pathao_store_id", "redx_pickup_store_id"]) values[k] = values[k]!.replace(/\D/g, "");
  await saveSettings(c.env.DB, values);
  flash(c, "ok", "কুরিয়ার সেটিংস সেভ হয়েছে।");
  return c.redirect("/admin/courier", 303);
});

/* ---------- SMS ---------- */
admin.post("/orders/sms/:id{[0-9]+}/resend", async (c) => {
  const log = await c.env.DB.prepare("SELECT order_id FROM sms_logs WHERE id = ?").bind(toInt(c.req.param("id"))).first<{ order_id: number | null }>();
  const r = await resendSms(c.env.DB, c.var.settings, toInt(c.req.param("id")));
  flash(c, r.sent ? "ok" : "error", r.message);
  return c.redirect(log?.order_id ? `/admin/orders/${log.order_id}` : "/admin/sms", 303);
});

async function renderSms(c: Ctx) {
  const { results } = await c.env.DB.prepare(
    "SELECT l.*, o.order_no FROM sms_logs l LEFT JOIN orders o ON o.id = l.order_id ORDER BY l.id DESC LIMIT 100",
  ).all<SmsLogRow & { order_no: string | null }>();
  const counts = await c.env.DB.prepare(
    "SELECT SUM(status='sent') sent, SUM(status='failed') failed FROM sms_logs WHERE created_at >= datetime('now', '-30 days')",
  ).first<{ sent: number | null; failed: number | null }>();
  return render(c, "SMS", "sms", <SmsPage s={c.var.settings} logs={results} sent30={counts?.sent ?? 0} failed30={counts?.failed ?? 0} />);
}
admin.get("/sms", (c) => renderSms(c));

admin.post("/sms", async (c) => {
  const b = await c.req.parseBody();
  const values: Record<string, string> = {
    sms_enabled: b.sms_enabled ? "1" : "0",
    sms_provider: typeof b.sms_provider === "string" && b.sms_provider in SMS_PROVIDERS ? b.sms_provider : "bulksmsbd",
    sms_sender_id: str(b.sms_sender_id, 50),
    sms_custom_url: str(b.sms_custom_url, 1000),
    sms_custom_method: b.sms_custom_method === "POST" ? "POST" : "GET",
    sms_custom_body: str(b.sms_custom_body, 2000),
    sms_custom_success: str(b.sms_custom_success, 100),
    sms_on_confirm: b.sms_on_confirm ? "1" : "0",
    sms_on_shipped: b.sms_on_shipped ? "1" : "0",
    sms_tpl_confirmed: str(b.sms_tpl_confirmed, 600),
    sms_tpl_shipped: str(b.sms_tpl_shipped, 600),
  };
  const key = str(b.sms_api_key, 500);
  if (key) values.sms_api_key = key;
  else if (b.clear_sms_api_key) values.sms_api_key = "";
  if (values.sms_custom_url && !/^https?:\/\//i.test(values.sms_custom_url)) {
    flash(c, "error", "গেটওয়ের URL http:// বা https:// দিয়ে শুরু হতে হবে");
    return c.redirect("/admin/sms", 303);
  }
  await saveSettings(c.env.DB, values);
  flash(c, "ok", "SMS সেটিংস সেভ হয়েছে।");
  return c.redirect("/admin/sms", 303);
});

admin.post("/sms/test", async (c) => {
  const phone = normalizePhone(str((await c.req.parseBody()).phone, 20));
  if (!phone) {
    flash(c, "error", "সঠিক মোবাইল নম্বর দিন");
  } else if (!(await hitRateLimit(c.env.DB, `smstest:${c.var.admin!.id}`, 5, 600))) {
    flash(c, "error", "অনেকবার টেস্ট করেছেন, ১০ মিনিট পর চেষ্টা করুন");
  } else {
    const r = await testSms(c.env.DB, c.var.settings, phone);
    flash(c, r.ok ? "ok" : "error", r.ok ? `টেস্ট SMS ${phone} নম্বরে গেছে।` : `SMS যায়নি: ${r.response.slice(0, 300)}`);
  }
  return c.redirect("/admin/sms", 303);
});

/* ---------- পণ্য ---------- */
async function allCategories(db: D1Database) {
  return (await db.prepare("SELECT id, name, sort_order FROM categories ORDER BY sort_order, id").all<Category>()).results;
}

admin.get("/products", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM products ORDER BY is_active DESC, category_id, sort_order, id").all<Product>();
  return render(c, "পণ্য", "products", <ProductsPage products={results} categories={await allCategories(c.env.DB)} />);
});


/* ---------- একসাথে ছবি (ফাইলের নাম = পণ্যের slug) ---------- */
async function bulkImagesView(c: Ctx, result?: { matched: string[]; unmatched: string[]; errors: string[] }) {
  const { results } = await c.env.DB.prepare("SELECT name, slug, image FROM products ORDER BY sort_order, id").all<{ name: string; slug: string; image: string | null }>();
  return render(c, "একসাথে ছবি", "products", <BulkImagesPage missing={results.filter((r) => !r.image)} total={results.length} result={result} />);
}
admin.get("/products/images", (c) => bulkImagesView(c));
admin.post("/products/images", async (c) => {
  const b = await c.req.parseBody({ all: true });
  const files = ([] as unknown[]).concat(b.files ?? []).filter((f): f is File => f instanceof File && f.size > 0).slice(0, 30);
  const result = { matched: [] as string[], unmatched: [] as string[], errors: [] as string[] };
  for (const file of files) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext || file.size > MAX_IMAGE) { result.errors.push(`${file.name}: JPG/PNG/WebP আর ৩ MB-এর কম হতে হবে`); continue; }
    const stem = file.name.replace(/\.[a-z0-9]+$/i, "").trim().toLowerCase();
    const banner = stem.match(/-banner-([123])$/);
    const target = banner ? { setting: `banner_${banner[1]}` } : stem.endsWith("-logo") ? { setting: "logo" } : null;
    let current: string | null = null;
    let productId = 0;
    if (target) current = c.var.settings[target.setting] || null;
    else {
      const p = await c.env.DB.prepare("SELECT id, image FROM products WHERE slug = ?").bind(stem).first<{ id: number; image: string | null }>();
      if (!p) { result.unmatched.push(file.name); continue; }
      productId = p.id; current = p.image;
    }
    const key = `${target ? target.setting.replace("_", "") : "p"}/${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, key), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    if (target) await saveSettings(c.env.DB, { [target.setting]: key });
    else await c.env.DB.prepare("UPDATE products SET image = ?, updated_at = datetime('now') WHERE id = ?").bind(key, productId).run();
    if (current) await c.env.IMAGES.delete(imageStorageKey(c.env.SHOP_ID, current)).catch(() => {});
    result.matched.push(file.name);
  }
  if (result.matched.length) c.set("settings", { ...c.var.settings, ...(await loadSettings(c.env.DB)) });
  return bulkImagesView(c, result);
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
    meta_title: str(body.meta_title, 100) || null,
    meta_description: str(body.meta_description, 300) || null,
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

  const cols = [v.category_id, v.name, v.slug, v.price, v.compare_price, imageKey, v.headline, v.short_desc, v.details_html, v.youtube_url, v.is_active, v.show_on_home, v.sort_order, v.options_json, v.meta_title, v.meta_description];
  let productId = id;
  if (id) {
    await db.prepare(
      `UPDATE products SET category_id=?, name=?, slug=?, price=?, compare_price=?, image=?, headline=?, short_desc=?, details_html=?,
         youtube_url=?, is_active=?, show_on_home=?, sort_order=?, options_json=?, meta_title=?, meta_description=?, updated_at=datetime('now') WHERE id=?`,
    ).bind(...cols, id).run();
  } else {
    const r = await db.prepare(
      `INSERT INTO products (category_id, name, slug, price, compare_price, image, headline, short_desc, details_html, youtube_url, is_active, show_on_home, sort_order, options_json, meta_title, meta_description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
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
/* ---------- সেটিংস কেন্দ্র ---------- */
const SET_PAGES: Record<string, { title: string; view: (c: Ctx) => unknown }> = {
  general: { title: "দোকানের সেটিংস", view: (c) => <SettingsGeneralPage s={c.var.settings} /> },
  appearance: { title: "থিম ও লোগো", view: (c) => <SettingsAppearancePage s={c.var.settings} /> },
  delivery: { title: "ডেলিভারি", view: (c) => <SettingsDeliveryPage s={c.var.settings} /> },
  checkout: { title: "অর্ডার ফর্ম", view: (c) => <SettingsCheckoutPage s={c.var.settings} /> },
  seo: { title: "SEO", view: (c) => <SettingsSeoPage s={c.var.settings} url={publicOrigin(c)} /> },
  tracking: { title: "পিক্সেল ও ট্র্যাকিং", view: (c) => <SettingsTrackingPage s={c.var.settings} /> },
};

/* থিম কাস্টমাইজ — শুধু দোকানে চালু থিমের সেটিংস (প্রতিটা থিমের সেটিংস আলাদা সেভ থাকে) */
admin.get("/settings/customize", async (c) => {
  const theme = themeOf(c.var.settings);
  const { results: products } = await c.env.DB.prepare("SELECT id, name FROM products WHERE is_active = 1 ORDER BY sort_order, id DESC LIMIT 300").all<{ id: number; name: string }>();
  return render(c, "থিম ও ডিজাইন", "theme", <ThemeCustomizePage s={c.var.settings} theme={theme} cfg={themeConfig(c.var.settings, theme)} products={products} />);
});
admin.post("/settings/customize", async (c) => {
  const b = await c.req.parseBody({ all: true }) as Record<string, unknown>;
  // একই নামের একাধিক মান শুধু পণ্যের তালিকায় থাকে; বাকিগুলোর প্রথমটা
  for (const [k, val] of Object.entries(b)) if (Array.isArray(val) && !k.endsWith("_products")) b[k] = val[0];
  const theme = themeOf(c.var.settings);
  // ছবি (মাঝের ব্যানার, পপআপ)
  for (const f of GROUPS.flatMap((g) => g.fields).filter((f) => f.type === "image")) {
    const file = b[`cfgimg_${f.key}`];
    if (file instanceof File && file.size > 0) {
      const ext = IMAGE_TYPES[file.type];
      if (!ext || file.size > 2 * 1024 * 1024) {
        flash(c, "error", "ছবি PNG/JPG/WebP আর ২ MB-এর কম হতে হবে");
        return c.redirect("/admin/settings/customize", 303);
      }
      const key = `theme/${crypto.randomUUID()}.${ext}`;
      await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, key), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
      b[f.key] = key;
    } else if (b[`remove_${f.key}`]) b[f.key] = "";
  }
  const value = b.reset ? "" : JSON.stringify(cfgDiff(cfgFromForm(b, theme), theme));
  await saveSettings(c.env.DB, { [`theme_cfg_${theme}`]: value });
  flash(c, "ok", b.reset ? `${THEMES[theme].name} থিম শুরুর সেটিংসে ফিরেছে।` : `${THEMES[theme].name} থিমের সেটিংস সেভ হয়েছে।`);
  return c.redirect("/admin/settings/customize", 303);
});

admin.get("/settings", (c) => render(c, SET_PAGES.general!.title, "settings", SET_PAGES.general!.view(c)));
admin.get("/settings/:section{[a-z]+}", (c) => {
  const pg = SET_PAGES[c.req.param("section")];
  if (!pg) return c.redirect("/admin/settings", 303);
  const sec = c.req.param("section");
  const nav = sec === "appearance" ? "theme" : sec === "tracking" || sec === "delivery" ? sec : "settings";
  return render(c, pg.title, nav, pg.view(c));
});

/** ছবি আপলোড (লোগো, ফেভিকন, শেয়ার ইমেজ) — সফল হলে নতুন key, ভুল হলে error */
async function settingImage(c: Ctx, b: Record<string, unknown>, key: "logo" | "favicon" | "seo_image" | "banner_1" | "banner_2" | "banner_3", maxBytes: number): Promise<{ value?: string; error?: string }> {
  const file = b[key];
  const current = c.var.settings[key];
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext || file.size > maxBytes) return { error: `ছবি PNG/JPG/WebP আর ${Math.round(maxBytes / 1024 / 1024)} MB-এর কম হতে হবে` };
    const name = `${key}/${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, name), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    if (current) await c.env.IMAGES.delete(imageStorageKey(c.env.SHOP_ID, current)).catch(() => {});
    return { value: name };
  }
  if (b[`remove_${key}`] && current) {
    await c.env.IMAGES.delete(imageStorageKey(c.env.SHOP_ID, current)).catch(() => {});
    return { value: "" };
  }
  return {};
}

/**
 * সেটিংস সেভ — শুধু ফর্মে যে ঘরগুলো আছে সেগুলোই বদলায়।
 * চেকবক্স না পাঠালে "বন্ধ" ধরা হয় শুধু তার নিজের সেকশনের ফর্ম থেকে এলে।
 */
async function saveSettingsForm(c: Ctx, section: string) {
  const b = await c.req.parseBody();
  const has = (k: string) => k in b;
  const v: Record<string, string> = {};
  const text: [string, number][] = [
    ["contact_phone", 30], ["store_email", 120], ["store_address", 300], ["whatsapp", 20], ["fb_test_event_code", 50],
    ["seo_title", 100], ["seo_description", 300], ["thanks_message", 500], ["order_form_title", 100],
    ["delivery_time_inside", 60], ["delivery_time_outside", 60], ["announcement", 120],
    ["cf1_label", 60], ["cf2_label", 60], ["cf3_label", 60], ["invoice_note", 300],
  ];
  for (const [k, max] of text) if (has(k)) v[k] = str(b[k], max);
  if (has("site_name")) v.site_name = str(b.site_name, 100) || c.var.settings.site_name || "আমার দোকান";
  if (has("facebook_page")) { const u = str(b.facebook_page, 200); v.facebook_page = /^https:\/\/[^\s]+$/.test(u) ? u : ""; }
  for (const k of ["delivery_inside", "delivery_outside", "free_delivery_min", "min_order"]) if (has(k)) v[k] = String(Math.max(0, toInt(b[k])));
  if (has("fb_pixel_id")) v.fb_pixel_id = str(b.fb_pixel_id, 30).replace(/\D/g, "");
  if (has("fb_graph_version")) v.fb_graph_version = /^v\d+\.\d+$/.test(str(b.fb_graph_version, 10)) ? str(b.fb_graph_version, 10) : "v26.0";
  if (has("ga4_id")) { const x = str(b.ga4_id, 20).toUpperCase(); v.ga4_id = GA4_RE.test(x) ? x : ""; }
  if (has("gtm_id")) { const x = str(b.gtm_id, 20).toUpperCase(); v.gtm_id = GTM_RE.test(x) ? x : ""; }
  if (has("tiktok_pixel_id")) { const x = str(b.tiktok_pixel_id, 30).toUpperCase(); v.tiktok_pixel_id = TIKTOK_RE.test(x) ? x : ""; }
  if (has("theme")) v.theme = typeof b.theme === "string" && b.theme in THEMES ? b.theme : (c.var.settings.theme || "classic");
  if (has("brand_color")) v.brand_color = safeColor(str(b.brand_color, 7), c.var.settings.brand_color || "#0f766e");
  if (has("accent_color")) v.accent_color = safeColor(str(b.accent_color, 7), c.var.settings.accent_color || "#ea580c");
  for (const n of [1, 2, 3]) {
    const k = `banner_${n}_link`;
    if (has(k)) { const u = str(b[k], 200); v[k] = /^(\/[^/\s][^\s]*|https:\/\/[^\s]+)$/.test(u) ? u : ""; }
  }
  if (section === "checkout") {
    v.show_note = b.show_note ? "1" : "0";
    v.sticky_submit = b.sticky_submit ? "1" : "0";
    for (const n of [1, 2, 3]) v[`cf${n}_req`] = b[`cf${n}_req`] ? "1" : "0";
    v.invoice_barcode = b.invoice_barcode ? "1" : "0";
    v.invoice_image = b.invoice_image ? "1" : "0";
  }
  if (has("max_qty")) v.max_qty = String(Math.min(50, Math.max(1, toInt(b.max_qty, 5))));
  if (has("invoice_size")) v.invoice_size = b.invoice_size === "sticker" ? "sticker" : "a4";
  if (has("checkout_email")) v.checkout_email = ["off", "optional", "required"].includes(String(b.checkout_email)) ? String(b.checkout_email) : "off";
  if (has("default_area")) v.default_area = ["inside", "outside", "none"].includes(String(b.default_area)) ? String(b.default_area) : "inside";
  if (has("order_prefix")) { const x = str(b.order_prefix, 6).toUpperCase(); v.order_prefix = /^[A-Z0-9-]{1,6}$/.test(x) ? x : "FS-"; }
  if (section === "seo") v.seo_noindex = b.seo_noindex ? "1" : "0";

  // গোপন টোকেন: ফাঁকা রাখলে আগেরটাই থাকে
  const token = str(b.fb_capi_token, 1000);
  if (token) v.fb_capi_token = token;
  else if (b.clear_token) v.fb_capi_token = "";

  // ছবি
  for (const [key, max] of [["logo", 1024 * 1024], ["favicon", 512 * 1024], ["seo_image", 2 * 1024 * 1024],
    ["banner_1", 2 * 1024 * 1024], ["banner_2", 2 * 1024 * 1024], ["banner_3", 2 * 1024 * 1024]] as const) {
    const r = await settingImage(c, b, key, max);
    if (r.error) {
      flash(c, "error", r.error);
      return c.redirect(section === "general" && !has("_section") ? "/admin/settings" : SETTINGS_URL[section] ?? "/admin/settings", 303);
    }
    if (r.value !== undefined) v[key] = r.value;
  }

  await saveSettings(c.env.DB, v);
  flash(c, "ok", "সেটিংস সেভ হয়েছে।");
  return c.redirect(SETTINGS_URL[section] ?? "/admin/settings", 303);
}
const SETTINGS_URL: Record<string, string> = Object.fromEntries(Object.keys(SET_PAGES).map((k) => [k, k === "general" ? "/admin/settings" : `/admin/settings/${k}`]));

admin.post("/settings", (c) => saveSettingsForm(c, "general"));
admin.post("/settings/:section{[a-z]+}", (c) => {
  const section = c.req.param("section");
  if (!SET_PAGES[section]) return c.redirect("/admin/settings", 303);
  return saveSettingsForm(c, section);
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

/* ---------- নিজের পেজ ---------- */
async function pageRows(c: Ctx) {
  return (await c.env.DB.prepare("SELECT * FROM pages ORDER BY sort_order, id").all<PageRow>()).results;
}
function pageInput(b: Record<string, unknown>) {
  const v = {
    title: str(b.title, 80), slug: str(b.slug, 60).toLowerCase(), content: (typeof b.content === "string" ? b.content : "").slice(0, 20000),
    in_menu: b.in_menu ? 1 : 0, is_active: b.is_active ? 1 : 0, sort_order: toInt(b.sort_order, 0),
  };
  const error = !v.title ? "শিরোনাম দিন" : !/^[a-z0-9-]{1,60}$/.test(v.slug) ? "লিংকের নাম শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা আর হাইফেন দিয়ে লিখুন" : "";
  return { v, error };
}
admin.get("/pages", async (c) => render(c, "পেজ", "pages", <PagesPage rows={await pageRows(c)} />));
admin.get("/pages/:id{[0-9]+}", async (c) => {
  const edit = await c.env.DB.prepare("SELECT * FROM pages WHERE id = ?").bind(toInt(c.req.param("id"))).first<PageRow>();
  if (!edit) return c.redirect("/admin/pages", 303);
  return render(c, "পেজ এডিট", "pages", <PagesPage rows={await pageRows(c)} edit={edit} />);
});
const savePage = async (c: Ctx) => {
  const id = toInt(c.req.param("id") ?? "0");
  const { v, error } = pageInput(await c.req.parseBody());
  if (error) return render(c, "পেজ", "pages", <PagesPage rows={await pageRows(c)} edit={{ ...v, id: id || undefined }} error={error} />, 422);
  const taken = await c.env.DB.prepare("SELECT id FROM pages WHERE slug = ? AND id != ?").bind(v.slug, id).first();
  if (taken) return render(c, "পেজ", "pages", <PagesPage rows={await pageRows(c)} edit={{ ...v, id: id || undefined }} error="এই লিংকের নামে আরেকটা পেজ আছে" />, 422);
  if (id) await c.env.DB.prepare("UPDATE pages SET title=?, slug=?, content=?, in_menu=?, is_active=?, sort_order=? WHERE id=?").bind(v.title, v.slug, v.content, v.in_menu, v.is_active, v.sort_order, id).run();
  else await c.env.DB.prepare("INSERT INTO pages (title, slug, content, in_menu, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)").bind(v.title, v.slug, v.content, v.in_menu, v.is_active, v.sort_order).run();
  flash(c, "ok", "পেজ সেভ হয়েছে।");
  return c.redirect("/admin/pages", 303);
};
admin.post("/pages", savePage);
admin.post("/pages/:id{[0-9]+}", savePage);
admin.post("/pages/:id{[0-9]+}/delete", async (c) => {
  await c.env.DB.prepare("DELETE FROM pages WHERE id = ?").bind(toInt(c.req.param("id"))).run();
  flash(c, "ok", "পেজ মুছে ফেলা হয়েছে।");
  return c.redirect("/admin/pages", 303);
});

/* ---------- ইনভয়েস আর স্টিকার প্রিন্ট ---------- */
async function invoiceData(c: Ctx, ids: number[]): Promise<InvoiceData[]> {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  const [orders, items] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT * FROM orders WHERE id IN (${ph})`).bind(...ids),
    c.env.DB.prepare(`SELECT i.*, p.image FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id IN (${ph}) ORDER BY i.id`).bind(...ids),
  ]);
  const all = items!.results as (OrderItem & { image: string | null })[];
  return ids.map((id) => (orders!.results as Order[]).find((o) => o.id === id)).filter((o): o is Order => !!o)
    .map((order) => ({ order, items: all.filter((i) => i.order_id === order.id) }));
}
const invoiceSize = (c: Ctx): "a4" | "sticker" => {
  const q = c.req.queries("size") ?? [];
  return q.includes("sticker") ? "sticker" : q.includes("a4") ? "a4" : c.var.settings.invoice_size === "sticker" ? "sticker" : "a4";
};
function renderInvoices(c: Ctx, list: InvoiceData[]) {
  if (!list.length) return c.text("কোনো অর্ডার বাছাই করা হয়নি", 400);
  c.header("Cache-Control", "no-store");
  return c.html("<!DOCTYPE html>" + String(<InvoicePage list={list} s={c.var.settings} size={invoiceSize(c)} autoPrint={c.req.query("print") === "1"} />));
}
admin.get("/orders/:id{[0-9]+}/invoice", async (c) => renderInvoices(c, await invoiceData(c, [toInt(c.req.param("id"))])));
admin.get("/orders/invoices", async (c) => {
  const ids = [...new Set((c.req.queries("ids") ?? []).map((x) => toInt(x)).filter((n) => n > 0))].slice(0, 200);
  return renderInvoices(c, await invoiceData(c, ids));
});

/* ---------- ল্যান্ডিং পেজ বিল্ডার (পণ্যের অনুমতি যাদের আছে) ---------- */
async function productById(c: Ctx, id: number) {
  return c.env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<Product>();
}

async function productChoices(c: Ctx) {
  const { results } = await c.env.DB.prepare("SELECT id, name, landing_json IS NOT NULL AS has FROM products ORDER BY sort_order, id DESC LIMIT 500")
    .all<{ id: number; name: string; has: number }>();
  return results.map((r) => ({ id: r.id, name: r.name, has: !!r.has }));
}
const FONT_LABELS = Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, v.label]));

/* ---------- ল্যান্ডিং পেজ: তালিকা, টেমপ্লেট গ্যালারি ---------- */
admin.get("/landing", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, slug, price, image, is_active, updated_at FROM products WHERE landing_json IS NOT NULL ORDER BY updated_at DESC, id DESC",
  ).all<LandingRow>();
  return render(c, "ল্যান্ডিং পেজ", "landing", <LandingListPage rows={results} />);
});

admin.get("/landing/new", async (c) => {
  const tab = c.req.query("tab") === "mine" ? "mine" : "sellx";
  const mine = await myTemplates(c.env.DB);
  const cards = tab === "mine"
    ? mine.map((t) => ({ ref: `m:${t.id}`, name: t.name, blocks: thumbBlocks(t.json), deleteUrl: `/admin/landing/my-templates/${t.id}/delete` }))
    : (await platformTemplates(c.env.PLATFORM_DB)).map((t) => ({ ref: `p:${t.id}`, name: t.name, category: t.category, description: t.description, blocks: thumbBlocks(t.json) }));
  return render(c, "টেমপ্লেট বেছে নিন", "landing",
    <TemplateGalleryPage tab={tab} cards={cards} products={await productChoices(c)} productId={toInt(c.req.query("product"))} mineCount={mine.length} />);
});

admin.post("/landing/new", async (c) => {
  const b = await c.req.parseBody();
  const p = await productById(c, toInt(b.product_id));
  const tpl = await loadTemplate(c.env.PLATFORM_DB, c.env.DB, String(b.template ?? ""));
  if (!p || !tpl) {
    flash(c, "error", !p ? "পণ্য বাছাই করুন" : "টেমপ্লেটটি পাওয়া যায়নি");
    return c.redirect("/admin/landing/new", 303);
  }
  await c.env.DB.prepare("UPDATE products SET landing_json = ?, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(tpl), p.id).run();
  flash(c, "ok", "টেমপ্লেট বসানো হয়েছে — এখন সাজিয়ে সেভ করুন।");
  return c.redirect(`/admin/products/${p.id}/landing`, 303);
});

admin.post("/landing/my-templates/:id{[0-9]+}/delete", async (c) => {
  await c.env.DB.prepare("DELETE FROM my_templates WHERE id = ?").bind(toInt(c.req.param("id"))).run();
  flash(c, "ok", "টেমপ্লেট মুছে ফেলা হয়েছে।");
  return c.redirect("/admin/landing/new?tab=mine", 303);
});

admin.get("/products/:id{[0-9]+}/landing", async (c) => {
  const p = await productById(c, toInt(c.req.param("id")));
  if (!p) return c.redirect("/admin/products", 303);
  const landing = parseLanding(p.landing_json) ?? defaultLanding(p);
  return render(c, "ল্যান্ডিং পেজ", "landing",
    <LandingBuilderPage product={p} landingJson={JSON.stringify(landing)} labels={SECTION_LABEL} custom={!!p.landing_json} products={await productChoices(c)} fonts={FONT_LABELS} />);
});

/** ডিজাইনটা অন্য পণ্যে সরানো (এখনকার পরিবর্তনসহ) */
admin.post("/products/:id{[0-9]+}/landing/move", async (c) => {
  const id = toInt(c.req.param("id"));
  const b = await c.req.parseBody();
  const to = await productById(c, toInt(b.to));
  const landing = landingFromBody(b.landing_json);
  if (!to || !landing) {
    flash(c, "error", "পণ্য বদলানো যায়নি");
    return c.redirect(`/admin/products/${id}/landing`, 303);
  }
  if (to.id !== id) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE products SET landing_json = ?, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(landing), to.id),
      c.env.DB.prepare("UPDATE products SET landing_json = NULL WHERE id = ?").bind(id),
    ]);
    flash(c, "ok", `ল্যান্ডিং পেজ এখন "${to.name}" পণ্যের।`);
  }
  return c.redirect(`/admin/products/${to.id}/landing`, 303);
});

/** এডিটর থেকে "আমার টেমপ্লেট"-এ রাখা */
admin.post("/products/:id{[0-9]+}/landing/save-template", async (c) => {
  const b = await c.req.parseBody();
  const name = str(b.name, 80);
  const landing = landingFromBody(b.landing_json);
  if (!name || !landing) return c.json({ message: "টেমপ্লেটের নাম দিন" }, 400);
  const n = await c.env.DB.prepare("SELECT COUNT(*) n FROM my_templates").first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_MY_TEMPLATES) return c.json({ message: `সর্বোচ্চ ${MAX_MY_TEMPLATES}টা টেমপ্লেট রাখা যায় — পুরনো কিছু মুছে দিন` }, 400);
  await c.env.DB.prepare("INSERT INTO my_templates (name, json) VALUES (?, ?)").bind(name, JSON.stringify(landing)).run();
  return c.json({ ok: true, message: `"${name}" আপনার টেমপ্লেটে রাখা হয়েছে।` });
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
  const body = await c.req.parseBody();
  const landing = landingFromBody(body.landing_json);
  if (!p || !landing) return c.text("প্রিভিউ করা যায়নি", 400);
  const editor = body.editor === "1";
  const s = c.var.settings;
  c.header("Cache-Control", "no-store");
  return c.html("<!DOCTYPE html>" + String(
    <Layout title={`প্রিভিউ — ${p.name}`} settings={s} head={editor ? <style>{EDITOR_CSS}</style> : undefined}>
      {!editor && <div class="banner banner-warn">প্রিভিউ — এখনো সেভ হয়নি</div>}
      <BuiltLanding p={p} landing={landing} variants={await productVariants(c.env.DB, p.id)} settings={s} editor={editor} />
    </Layout>,
  ));
});

/** এডিটরের প্রিভিউতে সেকশনের উপর মাউস/বাছাইয়ের দাগ */
const EDITOR_CSS = "[data-sec]{position:relative;cursor:pointer}[data-sec]:hover{outline:2px dashed #3b82f6;outline-offset:-2px}"
  + "[data-sec].lb-sel{outline:3px solid #2563eb;outline-offset:-3px}.sticky-order{display:none}";

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

/* ---------- রিপোর্ট (মালিক ও ম্যানেজার) ---------- */
admin.get("/reports", async (c) => {
  const r = resolveRange(c.req.query("range"), c.req.query("from"), c.req.query("to"));
  return render(c, "রিপোর্ট", "reports", <ReportsPage r={await buildReport(c.env.DB, r)} />);
});

/* ---------- সাপোর্ট (টিকেট + লাইভ চ্যাট) ---------- */
registerSupport(admin, render, flash);
