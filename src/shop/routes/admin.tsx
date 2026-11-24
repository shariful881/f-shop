import { siteLang } from "../i18n";
import { liveOrder, recentActivity } from "../lib/live";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { imageStorageKey, type AppEnv, type Ctx } from "../env";
import { freeShopUrl, safeShopPath, storeOrigin } from "../lib/store-origin";
import { priceEditable } from "../views/admin";
import { AdminLayout, BlacklistPage, BulkImagesPage, CategoriesPage, CategoryFormPage, type DomainSaleView, LoginPage, OrderDetailPage, OrdersPage, ProductFormPage, ProductsPage, STATUS_TABS, type BlacklistRow, type Flash } from "../views/admin";
import { adminToken, requireAdmin } from "../middleware/admin-auth";
import { ADMIN_COOKIES, clearSession, writeSession } from "../lib/session-cookie";
import { createSession, destroyOtherSessions, destroySession, hashPassword, needsRehash, sha256Hex, verifyPassword } from "../lib/auth";
import { changeStatus } from "../lib/order-status";
import { getOrderById, type Order, type OrderItem, type OrderStatus } from "../lib/orders";
import { InvoicePage, type InvoiceData } from "../views/invoice";
import { GALLERY_MAX, slugChangeStatements, categoryTree, parseFeatures, parseGallery, productVariants, withChildren, syncVariants, type Category, type Product } from "../lib/products";
import { normalizePhone } from "../lib/phone";
import { GA4_RE, GTM_RE, safeColor, loadSettings, saveSettings, themeOf, THEMES, TIKTOK_RE, type ThemeKey } from "../lib/settings";
import { cfgDiff, cfgFromForm, GROUPS, themeConfig, type Cfg } from "../lib/theme-config";
import { clientIp, isHttps, str, toInt } from "../lib/http";
import { PagesPage, SettingsAppearancePage, type PageRow, SettingsCheckoutPage, SettingsDeliveryPage, SettingsPaymentPage, SettingsGeneralPage, SettingsSeoPage, SettingsTrackingPage, ShopDashboardPage, type ShopDash, type SetupStep } from "../views/admin-pro";
import { bn, taka, youtubeId } from "../lib/format";
import { AccountPage, ForgotPage, ResetPage } from "../views/account";
import { createResetToken, resetBase, resetUser, sendResetEmail } from "../lib/password-reset";
import { hitRateLimit, peekRateLimit } from "../lib/order-guard";
import { sendPurchase } from "../lib/capi";
import { CouponsPage, LandingBuilderPage, LandingInfoPage, LandingListPage, ReportsPage, TemplateGalleryPage, type CouponRow, type LandingRow } from "../views/admin";
import { buildReport, resolveRange } from "../lib/reports";
import { defaultLanding, FONTS, normalizeLanding, parseLanding, SECTION_LABEL } from "../lib/landing";
import { loadTemplate, MAX_MY_TEMPLATES, myTemplates, platformTemplates, thumbBlocks } from "../lib/landing-templates";
import { Layout } from "../views/layout";
import { BuiltLanding } from "../views/landing";
import { normalizeCode } from "../lib/coupons";
import { BillingPage, DnsPage, DomainPage, StaffPage, type DnsView, type LedgerRow, type StaffRow, type TopupRow } from "../views/admin";
import { addDomain, cfFromEnv, checkDomain, isProtected, normalizeDomain, removeDomain, shopDomains, validateDnsInput } from "../../platform/domains";
import { bdtPrice, buyDomain, candidates, offerOf, variants, pushNameservers, renewDomain, saleConfig, shopReg, type Offer } from "../../platform/domain-sale";
import { pbError, porkbunFromEnv, type PbCheck } from "../../platform/porkbun";
import { cfError, type DnsRecord } from "../../platform/cf";
import { applyLedger, billingShop, changePlan, chargeConfirmedOrder, platformSettings, type BillingShop, type PlatformSettings } from "../../platform/billing";
import { cheapestFor, extraStaff, isCycle, isPlan, onOldPrices, overageCharge, planForShop, plansForShop, TRIAL_PLAN, type PlanKey } from "../../platform/plans";
import { PlanPanel } from "../views/billing-plans";
import { UsageOverview, type BillRow, type UsageDay, type UsageView } from "../views/billing-usage";
import { clearShopCache } from "../../platform/resolve";
import { CustomersPage, CUSTOMERS_PER_PAGE, type CustomerRow } from "../views/customers";
import { FOLDER_LABEL, listMedia, mediaExists, mediaUsage, newMediaKey, recordMedia, type MediaFolder } from "../lib/media";
import { MediaPage } from "../views/media";
import { DesignEditorPage } from "../views/design";
import { cachedCourierRecords, configuredCouriers, COURIER_NAME, courierRecord, courierRecordReady, orderCourierReport, parseOrderReport, platformCourierKeys, type PlatformCourierKeys, parcelStatus, pathaoList, redxAreas, sendParcel, type CourierKey, type SendOptions } from "../lib/courier";
import { releaseSpam, spamHousekeeping, spamLevel, spamWeek } from "../lib/spam";
import { clearOutcome, outcomeFromCourier, ownRecords, recordOutcome, riskOf, sharedRecords, type CourierSummary, type Risk } from "../lib/fraud";
import { CourierCard, FraudCheckPage, FraudDialog, FraudReport, type ReportData, type ReportOrder } from "../views/fraud-report";
import { CourierPage, SmsPage, type SmsLogRow } from "../views/admin";
import { customSmsUrlError, notifyOrder, resendSms, SMS_PROVIDERS, testSms, type SmsEvent } from "../lib/sms";
import { registerSupport } from "./support";
import { BackupPage, type StorageStats } from "../views/backup";
import { UiKitPage } from "../views/ui";
import { IncompleteConvertPage, IncompletePage } from "../views/incomplete";
import { draftItems, INCOMPLETE_TABS, incompleteCounts, listIncomplete, markConverted, type IncompleteRow, type IncompleteTab } from "../lib/incomplete";
import { cartLines } from "../lib/products";
import { createOrder, orderPrefix } from "../lib/orders";
import { deliveryCharge, freeDeliveryMin } from "../lib/settings";
import { emptyManual, MANUAL_ROWS, MANUAL_SOURCES, ManualOrderPage, type ManualOption, type ManualSource, type ManualValues } from "../views/manual-order";
import { maxQty } from "../lib/cart";
import { validateOrderInput } from "../lib/order-guard";
import { applyOrderStock, checkOrderStock, inventoryRows, inventorySummary, recentMoves, recomputeProductStock, restoreOrderStock, setStock, type InvFilter } from "../lib/stock";
import { InventoryPage } from "../views/inventory";
import { AdsPage, CatalogPage } from "../views/ads";
import { codAmount } from "../lib/payment";
import { adminReviews, refreshRating, reviewCounts, REVIEW_TABS, type ReviewStatus } from "../lib/reviews";
import { ReviewsAdminPage } from "../views/reviews";
import { profitReport, snapshotCost } from "../lib/profit";
import { ProfitPage } from "../views/profit";
import { waMessages } from "../lib/whatsapp";
import { AI_SHOP_DAILY, applyCopy, generateCopy, TONE_LABEL } from "../lib/ai";
import { allowedEndpoint, pushToShop, vapidKeys } from "../lib/push";
import { adReport, usdRate } from "../lib/ads";
import { feedItems } from "../lib/feed";

import { confirmPhoneOtp, loadShop as loadVerifyShop, phoneMode, platformSms, sendEmailLink, sendPhoneOtp } from "../../platform/verify";
import { VerifyPage } from "../views/verify";

export const admin = new Hono<AppEnv>();

/* ---------- ফ্ল্যাশ মেসেজ ---------- */
export function flash(c: Ctx, type: "ok" | "error", text: string) {
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
  const pending = c.var.admin ? await c.env.DB.prepare("SELECT COUNT(*) n FROM orders WHERE status = 'new' AND spam = 0").first<{ n: number }>() : null;
  return c.html(
    "<!DOCTYPE html>" +
      String(<AdminLayout title={title} settings={c.var.settings} active={active} flash={takeFlash(c)} email={c.var.admin?.email} role={c.var.admin?.role} state={c.var.shopState} announcements={ann} support={getCookie(c, "support_mode") === "1"} newOrders={pending?.n ?? 0}>{body as any}</AdminLayout>),
    status,
  );
}

/* ---------- লগইন ---------- */
const LOGIN_FAIL_MAX = 8;
const LOGIN_FAIL_WINDOW = 900;
admin.get("/login", (c) => c.html("<!DOCTYPE html>" + String(<AdminLayout title="লগইন" settings={c.var.settings} flash={takeFlash(c)}><LoginPage /></AdminLayout>)));

admin.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const fail = (msg: string) =>
    c.html("<!DOCTYPE html>" + String(<AdminLayout title="লগইন" settings={c.var.settings}><LoginPage error={msg} email={email} /></AdminLayout>), 422);

  if (!(await hitRateLimit(c.env.DB, `login:${clientIp(c)}`, 10, 900))) return fail("অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে চেষ্টা করুন।");

  // অ্যাকাউন্ট ধরে ভুল চেষ্টার সীমা — অনেক IP থেকে একই অ্যাকাউন্টে চেষ্টাও আটকায়
  if ((await peekRateLimit(c.env.DB, `loginfail:${email}`, LOGIN_FAIL_WINDOW)) >= LOGIN_FAIL_MAX) {
    return fail("এই অ্যাকাউন্টে অনেকবার ভুল পাসওয়ার্ড দেওয়া হয়েছে। ১৫ মিনিট পরে চেষ্টা করুন, অথবা নিচে \"পাসওয়ার্ড ভুলে গেছেন?\" থেকে নতুন পাসওয়ার্ড নিন।");
  }
  const user = await c.env.DB.prepare("SELECT id, password_hash, is_admin, active FROM users WHERE email = ?").bind(email)
    .first<{ id: number; password_hash: string; is_admin: number; active: number }>();
  if (!user || !user.is_admin || !user.active || !(await verifyPassword(password, user.password_hash))) {
    if (email) await hitRateLimit(c.env.DB, `loginfail:${email}`, LOGIN_FAIL_MAX, LOGIN_FAIL_WINDOW);
    return fail("ইমেইল বা পাসওয়ার্ড ভুল");
  }
  // পুরনো (কম শক্ত) hash নিজে নতুন করে — দোকানদারকে কিছু করতে হয় না
  if (needsRehash(user.password_hash)) {
    await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), user.id).run();
  }

  const token = await createSession(c.env.DB, user.id);
  writeSession(c, ADMIN_COOKIES, token);
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
  writeSession(c, ADMIN_COOKIES, session);
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
  await destroySession(c.env.DB, adminToken(c));
  clearSession(c, ADMIN_COOKIES);
  const wasSupport = getCookie(c, "support_mode") === "1";
  deleteCookie(c, "support_mode", { path: "/admin" });
  // সাপোর্ট মোড থেকে বের হলে সুপার অ্যাডমিনে ফেরা
  if (wasSupport) return c.redirect(`https://${c.env.PLATFORM_DOMAIN}/super/shops/${c.env.SHOP_ID}`, 303);
  return c.redirect("/admin/login", 303);
});

/* ---------- পাসওয়ার্ড ভুলে গেলে (লগইন ছাড়া) — security/step-3 ---------- */
const shell = (c: Ctx, title: string, body: unknown, status: 200 | 422 | 429 = 200) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  c.header("Referrer-Policy", "no-referrer"); // লিংকের টোকেন অন্য সাইটে না যায়
  return c.html("<!DOCTYPE html>" + String(<AdminLayout title={title} settings={c.var.settings}>{body as any}</AdminLayout>), status);
};

admin.get("/forgot", (c) => shell(c, "পাসওয়ার্ড ভুলে গেছেন", <ForgotPage unavailable={!c.env.EMAIL} />));

admin.post("/forgot", async (c) => {
  const email = str((await c.req.parseBody()).email, 200).toLowerCase();
  if (!c.env.EMAIL) return shell(c, "পাসওয়ার্ড ভুলে গেছেন", <ForgotPage unavailable />);
  if (!(await hitRateLimit(c.env.DB, `forgot:${clientIp(c)}`, 5, 3600))) {
    return shell(c, "পাসওয়ার্ড ভুলে গেছেন", <ForgotPage email={email} error="এক ঘণ্টায় অনেকবার চাওয়া হয়েছে — পরে চেষ্টা করুন" />, 429);
  }
  // একই ইমেইলে ঘণ্টায় ৩টার বেশি লিংক নয় — কিন্তু উত্তর সবসময় একই (কারো ইমেইল আছে কিনা বোঝা যায় না)
  if (email && (await hitRateLimit(c.env.DB, `forgotmail:${email}`, 3, 3600))) {
    const user = await c.env.DB.prepare("SELECT id, email FROM users WHERE email = ? AND is_admin = 1 AND active = 1").bind(email).first<{ id: number; email: string }>();
    if (user) {
      const token = await createResetToken(c.env.DB, user.id);
      const url = `${resetBase(c.req.url)}/admin/reset?t=${token}`;
      const job = sendResetEmail(c.env, user.email, url, c.var.settings.site_name || "");
      try { c.executionCtx.waitUntil(job); } catch { await job; }
    }
  }
  return shell(c, "পাসওয়ার্ড ভুলে গেছেন", <ForgotPage sent />);
});

admin.get("/reset", async (c) => {
  const token = str(c.req.query("t"), 100);
  const u = await resetUser(c.env.DB, token);
  return shell(c, "নতুন পাসওয়ার্ড", u ? <ResetPage token={token} email={u.email} /> : <ResetPage token="" invalid />);
});

admin.post("/reset", async (c) => {
  const b = await c.req.parseBody();
  const token = str(b.t, 100);
  const password = typeof b.password === "string" ? b.password : "";
  if (!(await hitRateLimit(c.env.DB, `reset:${clientIp(c)}`, 20, 3600))) return shell(c, "নতুন পাসওয়ার্ড", <ResetPage token="" invalid />, 429);
  const u = await resetUser(c.env.DB, token);
  if (!u) return shell(c, "নতুন পাসওয়ার্ড", <ResetPage token="" invalid />, 422);
  const err = password.length < 8 ? "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের দিন" : password.length > 200 ? "পাসওয়ার্ড খুব লম্বা" : password !== b.password2 ? "দুই ঘরের পাসওয়ার্ড মেলেনি" : "";
  if (err) return shell(c, "নতুন পাসওয়ার্ড", <ResetPage token={token} email={u.email} error={err} />, 422);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), u.id),
    c.env.DB.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").bind(u.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id), // সব ডিভাইস থেকে লগআউট
    c.env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE ?").bind(`loginfail:${u.email}:%`), // ভুল চেষ্টার আটকানো খুলে দেওয়া
  ]);
  flash(c, "ok", "পাসওয়ার্ড বদলেছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।");
  return c.redirect("/admin/login", 303);
});

/* ---------- এর পরের সব পেজে লগইন লাগবে ---------- */
admin.use("*", requireAdmin);

/* ---------- আমার অ্যাকাউন্ট (সব রোল) — security/step-3 ---------- */
async function renderAccount(c: Ctx, errors?: Record<string, string>) {
  const me = c.var.admin!;
  const n = await c.env.DB.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires_at > datetime('now')").bind(me.id).first<{ n: number }>();
  return render(c, "আমার অ্যাকাউন্ট", "account",
    <AccountPage email={me.email} name={me.name} role={me.role} sessions={n?.n ?? 1} support={getCookie(c, "support_mode") === "1"} errors={errors} />, errors ? 422 : 200);
}

admin.get("/account", (c) => renderAccount(c));

admin.post("/account/password", async (c) => {
  if (getCookie(c, "support_mode") === "1") return c.redirect("/admin/account", 303);
  const me = c.var.admin!;
  const b = await c.req.parseBody();
  const current = typeof b.current === "string" ? b.current : "";
  const password = typeof b.password === "string" ? b.password : "";
  const errors: Record<string, string> = {};
  if (!(await hitRateLimit(c.env.DB, `pwchange:${me.id}`, 10, 900))) errors.form = "অনেকবার চেষ্টা হয়েছে — ১৫ মিনিট পরে চেষ্টা করুন";
  else {
    const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(me.id).first<{ password_hash: string }>();
    if (!row || !(await verifyPassword(current, row.password_hash))) errors.current = "এখনকার পাসওয়ার্ড ভুল";
    if (password.length < 8) errors.password = "কমপক্ষে ৮ অক্ষর";
    else if (password.length > 200) errors.password = "খুব লম্বা";
    else if (password === current) errors.password = "নতুন পাসওয়ার্ড আগেরটা থেকে আলাদা দিন";
    if (password !== b.password2) errors.password2 = "দুই ঘরের পাসওয়ার্ড মেলেনি";
  }
  if (Object.keys(errors).length) return renderAccount(c, errors);
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), me.id).run();
  const n = await destroyOtherSessions(c.env.DB, me.id, adminToken(c));
  flash(c, "ok", n ? `পাসওয়ার্ড বদলেছে। অন্য ${bn(n)}টা জায়গা থেকে লগআউট করা হয়েছে।` : "পাসওয়ার্ড বদলেছে।");
  return c.redirect("/admin/account", 303);
});

admin.post("/account/logout-others", async (c) => {
  const n = await destroyOtherSessions(c.env.DB, c.var.admin!.id, adminToken(c));
  flash(c, "ok", n ? `অন্য ${bn(n)}টা জায়গা থেকে লগআউট করা হয়েছে।` : "অন্য কোথাও লগইন করা ছিল না।");
  return c.redirect("/admin/account", 303);
});

/* ---------- ড্যাশবোর্ড ---------- */
admin.get("/", async (c) => {
  const db = c.env.DB;
  const s = c.var.settings;
  // ঢাকার দিন: UTC + ৬ ঘণ্টা
  const todayStart = "datetime(date('now', '+6 hours'), '-6 hours')";
  await spamHousekeeping(db);
  const [t, y, pend, m, ch, rec, top, prods] = await db.batch([
    db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN status NOT IN ('fake', 'cancelled') THEN total END), 0) v FROM orders WHERE spam = 0 AND created_at >= ${todayStart}`),
    db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN status NOT IN ('fake', 'cancelled') THEN total END), 0) v FROM orders WHERE spam = 0 AND created_at >= datetime(${todayStart}, '-1 day') AND created_at < ${todayStart}`),
    db.prepare("SELECT COUNT(*) n FROM orders WHERE status = 'new' AND spam = 0"),
    db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(status IN ('confirmed', 'shipped')), 0) ok, COALESCE(SUM(status IN ('fake', 'cancelled')), 0) bad,
        COALESCE(SUM(CASE WHEN status IN ('confirmed', 'shipped') THEN total END), 0) sales FROM orders WHERE spam = 0 AND created_at >= datetime('now', '-30 days')`),
    db.prepare(`SELECT date(created_at, '+6 hours') d, COUNT(*) a, COALESCE(SUM(status IN ('confirmed', 'shipped')), 0) ok FROM orders WHERE spam = 0 AND created_at >= datetime('now', '-14 days') GROUP BY d`),
    db.prepare("SELECT id, order_no, name, phone, total, status, created_at FROM orders WHERE spam = 0 ORDER BY id DESC LIMIT 8"),
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
  const domain = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM domains WHERE shop_id = ? AND status = 'active' AND zone_id IS NOT NULL LIMIT 1").bind(c.env.SHOP_ID).first().catch(() => null);
  const setup: SetupStep[] = [
    { key: "info", label: "দোকানের নাম আর যোগাযোগ নম্বর", desc: "কাস্টমার যাতে আপনাকে খুঁজে পান", done: !!s.site_name && !!s.contact_phone && s.contact_phone !== "01700000000", href: "/admin/settings" },
    { key: "logo", label: "লোগো দিন", desc: "দোকানের পরিচয়", done: !!s.logo, href: "/admin/settings/appearance" },
    { key: "product", label: "প্রথম পণ্য যোগ করুন", desc: "প্রতিটা পণ্যের নিজের ল্যান্ডিং পেজ তৈরি হয়", done: (pr.total ?? 0) > 0, href: "/admin/products/new" },
    { key: "delivery", label: "ডেলিভারি চার্জ ঠিক করুন", desc: "ঢাকার ভিতরে আর বাইরে", done: !!s.delivery_inside && !!s.delivery_outside, href: "/admin/settings/delivery" },
    { key: "pixel", label: "Facebook Pixel + Conversions API", desc: "অ্যাডের ফল মাপতে আর খরচ কমাতে", done: !!s.fb_pixel_id && !!s.fb_capi_token, href: "/admin/settings/tracking" },
    { key: "seo", label: "SEO টাইটেল আর ডেসক্রিপশন", desc: "Google আর শেয়ারে সুন্দর দেখাতে", done: !!s.seo_title && !!s.seo_description, href: "/admin/settings/seo" },
    { key: "courier", label: "কুরিয়ার যুক্ত করুন", desc: "এক ক্লিকে পার্সেল বুকিং", done: configuredCouriers(s).length > 0, href: "/admin/courier" },
    { key: "domain", label: "নিজের ডোমেইন (ঐচ্ছিক)", desc: domain || (await domainGate(c)).ready ? "yourshop.com" : "🔒 উপরের কাজ আর মোবাইল যাচাই শেষ হলে খুলবে", done: !!domain, href: "/admin/domain" },
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
    storeUrl: await storeOrigin(c),
    pushKey: (await vapidKeys(c.env.PLATFORM_DB)).publicKey,
    lowStock: (await inventoryRows(c.env.DB, "low")).concat(await inventoryRows(c.env.DB, "out")).filter((r) => r.is_active).slice(0, 6)
      .map((r) => ({ product_id: r.product_id, name: r.name + (r.label ? ` (${r.label})` : ""), stock: r.stock })),
  };
  return render(c, "ড্যাশবোর্ড", "dashboard", <ShopDashboardPage d={d} role={c.var.admin!.role} />);
});

/* ---------- অর্ডার ---------- */
const PER_PAGE = 50;

/** তারিখের সীমা — ঢাকার দিন ধরে (created_at UTC-তে থাকে) */
const ORDER_RANGES = { all: 0, today: 1, "7": 7, "30": 30 } as const;
type OrderRange = keyof typeof ORDER_RANGES;

/** অনেক নম্বরের রায়: এই দোকান + অন্য দোকান + কুরিয়ারের ক্যাশ (বাইরের কল নয়) */
async function riskMap(c: Ctx, phones: string[]): Promise<Record<string, Risk & { shared: number; courier: number | null }>> {
  if (!phones.length) return {};
  const [own, shared, courier] = await Promise.all([
    ownRecords(c.env.DB, phones),
    sharedRecords(c.env.PLATFORM_DB, c.var.settings, c.env.SHOP_ID, phones),
    cachedCourierRecords(c.env.DB, phones),
  ]);
  const out: Record<string, Risk & { shared: number; courier: number | null }> = {};
  for (const p of phones) {
    const sh = shared[p];
    out[p] = { ...riskOf(own[p], sh, courier[p]), shared: sh ? sh.delivered + sh.returned + sh.cancelled + sh.fake : 0, courier: courier[p]?.ratio ?? null };
  }
  return out;
}

/** সুপার অ্যাডমিনের কুরিয়ার চাবি (দোকানের নিজের চাবি না থাকলে) */
async function platformCourier(c: Ctx): Promise<PlatformCourierKeys | undefined> {
  return platformCourierKeys(await platformSettings(c.env.PLATFORM_DB));
}

/** পুরো ফ্রড রিপোর্টের তথ্য — lookup: ক্যাশে না থাকলে কুরিয়ারে খোঁজা */
async function fraudReportData(c: Ctx, phone: string, lookup: "never" | "missing" | "force", orderId?: number): Promise<ReportData> {
  const db = c.env.DB;
  const plat = await platformCourier(c);
  const ready = courierRecordReady(c.var.settings, plat);
  // অর্ডারের রিপোর্ট: অর্ডারে সেভ করা (একবার খোঁজা); অর্ডার ছাড়া (ফ্রড চেকার): নম্বরের ক্যাশ
  const order = orderId ? await db.prepare("SELECT id, phone, courier_report FROM orders WHERE id = ? AND phone = ?").bind(orderId, phone).first<{ id: number; phone: string; courier_report: string | null }>() : null;
  let courier: CourierSummary | null = order ? parseOrderReport(order.courier_report) : (await cachedCourierRecords(db, [phone]))[phone] ?? null;
  let error: string | undefined;
  if (ready && (lookup === "force" || (lookup === "missing" && !courier))) {
    if (!(await hitRateLimit(db, "courier-check", 60, 60))) error = "অনেকবার খোঁজা হয়েছে, এক মিনিট পরে চেষ্টা করুন";
    else {
      const r = order ? await orderCourierReport(db, c.var.settings, plat, order.id, phone, lookup === "force") : await courierRecord(db, c.var.settings, phone, plat);
      if ("error" in r) error = r.error; else courier = r;
    }
  }
  const [own, shared, orders] = await Promise.all([
    ownRecords(db, [phone]),
    sharedRecords(c.env.PLATFORM_DB, c.var.settings, c.env.SHOP_ID, [phone]),
    db.prepare("SELECT id, order_no, created_at, total, status, outcome, consignment_id FROM orders WHERE phone = ? ORDER BY id DESC LIMIT 30").bind(phone).all<ReportOrder>(),
  ]);
  return { phone, orderId: order?.id, courier, own: own[phone], shared: shared[phone], sharing: c.var.settings.fraud_share !== "0", orders: orders.results, ready, error };
}

/** অর্ডার তালিকার কার্ড — অর্ডারে সেভ না থাকলে একবার খুঁজে সেভ (তালিকা খুললে পুরনো অর্ডারের জন্য JS ডাকে) */
admin.post("/fraud-report/card", async (c) => {
  const b = await c.req.parseBody();
  const id = toInt(b.order_id, 0);
  const o = id ? await c.env.DB.prepare("SELECT id, phone FROM orders WHERE id = ?").bind(id).first<{ id: number; phone: string }>() : null;
  if (!o) return c.html("", 400);
  const plat = await platformCourier(c);
  const ready = courierRecordReady(c.var.settings, plat);
  let sum: CourierSummary | null = null;
  let error: string | undefined;
  if (!(await hitRateLimit(c.env.DB, "courier-card", 120, 60))) error = "busy";
  else {
    const r = await orderCourierReport(c.env.DB, c.var.settings, plat, o.id, o.phone);
    if ("error" in r) error = r.error; else sum = r;
  }
  return c.html(<CourierCard phone={o.phone} orderId={o.id} sum={sum} ready={ready} error={error} />);
});

/** পুরো রিপোর্ট (মোডালের ভিতরে) — GET: ক্যাশ থেকে (না থাকলে খোঁজে), POST: আবার খোঁজা */
admin.get("/fraud-report", async (c) => {
  const phone = normalizePhone(c.req.query("phone") || "");
  if (!phone) return c.html(<p class="fr-alert">সঠিক মোবাইল নম্বর নয়</p>, 400);
  return c.html(<FraudReport d={await fraudReportData(c, phone, "missing", toInt(c.req.query("order"), 0) || undefined)} />);
});
admin.post("/fraud-report", async (c) => {
  const phone = normalizePhone(c.req.query("phone") || "");
  if (!phone) return c.html(<p class="fr-alert">সঠিক মোবাইল নম্বর নয়</p>, 400);
  return c.html(<FraudReport d={await fraudReportData(c, phone, "force", toInt(c.req.query("order"), 0) || undefined)} />);
});

/** ফ্রড চেকার পেজ — যেকোনো নম্বর */
admin.get("/fraud-check", async (c) => {
  const input = (c.req.query("phone") || "").trim().slice(0, 30);
  if (!input) return render(c, "ফ্রড চেকার", "fraud-check", <><FraudCheckPage /><FraudDialog /></>);
  const phone = normalizePhone(input);
  if (!phone) return render(c, "ফ্রড চেকার", "fraud-check", <FraudCheckPage input={input} error="সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)" />);
  const d = await fraudReportData(c, phone, "missing");
  return render(c, "ফ্রড চেকার", "fraud-check", <><FraudCheckPage phone={phone} report={<FraudReport d={d} />} /><FraudDialog /></>);
});

admin.get("/orders", async (c) => {
  const db = c.env.DB;
  await spamHousekeeping(db);
  const spamTab = c.req.query("status") === "spam";
  const status = (STATUS_TABS as string[]).includes(c.req.query("status") || "") ? (c.req.query("status") as OrderStatus) : "new";
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const page = Math.max(1, toInt(c.req.query("page"), 1));
  const range: OrderRange = (c.req.query("range") || "") in ORDER_RANGES ? (c.req.query("range") as OrderRange) : "all";
  const days = ORDER_RANGES[range];
  const dateCond = days ? `date(o.created_at, '+6 hours') >= date('now', '+6 hours', '-${days - 1} days')` : "1";

  const { results: countRows } = await db.prepare(
    `SELECT CASE WHEN o.spam > 0 AND o.status = 'new' THEN 'spam' ELSE o.status END AS status, COUNT(*) n FROM orders o WHERE ${dateCond} GROUP BY 1`,
  ).all<{ status: string; n: number }>();
  const counts = Object.fromEntries(countRows.map((r) => [r.status, r.n]));

  // স্প্যাম তালিকার অর্ডার স্ট্যাটাসে "নতুন" থাকে, কিন্তু নতুন তালিকায় দেখায় না
  let where = spamTab ? "o.status = 'new' AND o.spam > 0" : "o.status = ? AND o.spam = 0";
  let binds: unknown[] = spamTab ? [] : [status];
  const payPending = c.req.query("pay") === "pending";
  if (payPending) { where = "o.pay_status = 'pending' AND o.status IN ('new', 'confirmed')"; binds = []; }
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
  const risk = await riskMap(c, phones);
  // অর্ডারে সেভ করা রিপোর্ট আগে; না থাকলে (পুরনো অর্ডার) নম্বরের ক্যাশ
  const phoneCache = await cachedCourierRecords(db, phones);
  const courierSums: Record<number, CourierSummary> = {};
  for (const o of orders) { const r = parseOrderReport(o.courier_report) ?? phoneCache[o.phone]; if (r) courierSums[o.id] = r; }
  const crReady = courierRecordReady(c.var.settings, await platformCourier(c));

  return render(c, "অর্ডার", "orders",
    <OrdersPage orders={orders} counts={counts} status={status} spamTab={spamTab && !q && !payPending} spamWeek={spamTab ? await spamWeek(db) : undefined} spamLevel={spamLevel(c.var.settings)} q={q} page={page} range={range} history={history} risk={risk} payPending={payPending} courier={courierSums} crReady={crReady}
      payCount={(await db.prepare("SELECT COUNT(*) n FROM orders WHERE pay_status = 'pending' AND status IN ('new', 'confirmed')").first<{ n: number }>())?.n ?? 0}
      hasMore={results.length > PER_PAGE} couriers={configuredCouriers(c.var.settings)} />);
});

/* ---------- নতুন অর্ডার নিজে লেখা (ফোন/ইনবক্স/দোকানে) ---------- */
async function manualOptions(db: D1Database): Promise<ManualOption[]> {
  const [p, v] = await db.batch([
    db.prepare("SELECT id, name, price, track_stock, stock FROM products WHERE is_active = 1 ORDER BY sort_order, id LIMIT 500"),
    db.prepare("SELECT v.id, v.product_id, v.label, v.price, v.stock FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.active = 1 AND p.is_active = 1 ORDER BY v.product_id, v.id"),
  ]);
  const prods = p!.results as { id: number; name: string; price: number; track_stock: number; stock: number | null }[];
  const vars = v!.results as { id: number; product_id: number; label: string; price: number | null; stock: number | null }[];
  const out: ManualOption[] = [];
  for (const x of prods) {
    const own = vars.filter((y) => y.product_id === x.id);
    const track = x.track_stock === 1;
    if (!own.length) out.push({ value: `${x.id}:0`, label: x.name, price: x.price, stock: track ? x.stock ?? 0 : null });
    for (const y of own) out.push({ value: `${x.id}:${y.id}`, label: `${x.name} (${y.label})`, price: y.price ?? x.price, stock: track ? y.stock ?? 0 : null });
  }
  return out;
}

function manualView(c: Ctx, options: ManualOption[], values: ManualValues, extra: { errors?: Record<string, string>; blocked?: boolean; pending?: string | null } = {}, status: 200 | 422 = 200) {
  const s = c.var.settings;
  return render(c, "নতুন অর্ডার", "orders",
    <ManualOrderPage options={options} values={values} delivery={{ inside: deliveryCharge(s, "inside"), outside: deliveryCharge(s, "outside"), freeMin: freeDeliveryMin(s) }} {...extra} />, status);
}

admin.get("/orders/new", async (c) => {
  const v = emptyManual();
  const ph = normalizePhone(c.req.query("phone") || "");
  if (ph) v.phone = ph;
  return manualView(c, await manualOptions(c.env.DB), v);
});

admin.post("/orders/new", async (c) => {
  const db = c.env.DB;
  const s = c.var.settings;
  const b = await c.req.parseBody({ all: true });
  const arr = (x: unknown) => (Array.isArray(x) ? x : x == null ? [] : [x]).map((y) => String(y));
  const itemsRaw = arr(b.item);
  const qtyRaw = arr(b.qty);
  const source = (String(b.source ?? "") in MANUAL_SOURCES ? String(b.source) : "other") as ManualSource;
  const values: ManualValues = {
    name: str(b.name, 100), phone: str(b.phone, 20), address: str(b.address, 300), area: String(b.area ?? ""), note: str(b.note, 300),
    source, delivery: str(b.delivery, 10), discount: str(b.discount, 10), confirm: b.confirm === "1",
    items: itemsRaw.slice(0, MANUAL_ROWS).map((item, i) => ({ item, qty: qtyRaw[i] ?? "1" })),
  };
  const options = await manualOptions(db);
  const errors: Record<string, string> = {};
  const v = validateOrderInput({ name: values.name, phone: values.phone, address: values.address, area: values.area, note: values.note });
  if (!v.ok) Object.assign(errors, v.errors);

  // পণ্যের লাইন: একই পণ্য দুই সারিতে থাকলে যোগ হয়
  const merged = new Map<string, number>();
  for (const r of values.items) {
    if (!r.item) continue;
    const q = Math.min(999, Math.max(1, toInt(r.qty, 1)));
    merged.set(r.item, (merged.get(r.item) ?? 0) + q);
  }
  const entries = [...merged].map(([k, qty]) => {
    const [pid, vid] = k.split(":").map((n) => toInt(n));
    return { productId: pid!, variantId: vid || null, qty: Math.min(999, qty) };
  }).filter((x) => x.productId > 0);
  const lines = await cartLines(db, entries);
  if (!entries.length) errors.items = "অন্তত একটা পণ্য বাছুন।";
  else if (lines.length < entries.length) errors.items = "বাছাই করা কোনো পণ্য আর চালু নেই বা স্টক শেষ — আবার বাছুন।";
  else {
    const short = lines.find((l) => l.stock_left != null && (l.qty ?? 1) > l.stock_left);
    if (short) errors.items = `${short.name}${short.variant_label ? ` (${short.variant_label})` : ""} — মাত্র ${bn(short.stock_left!)}টা আছে।`;
  }
  if (Object.keys(errors).length || !v.ok) return manualView(c, options, values, { errors }, 422);

  // ব্লক তালিকা আর খোলা অর্ডার — সতর্ক করে, তারপর দোকানদারের সিদ্ধান্ত
  if (b.force !== "1") {
    const blocked = !!(await db.prepare("SELECT 1 FROM blacklist_entries WHERE type = 'phone' AND value = ?").bind(v.phone).first());
    const open = await db.prepare("SELECT id FROM orders WHERE phone = ? AND status = 'new' ORDER BY id DESC LIMIT 1").bind(v.phone).first<{ id: number }>();
    if (blocked || open) return manualView(c, options, values, { blocked, pending: open ? `/admin/orders/${open.id}` : null }, 422);
  }

  const sub = lines.reduce((t, l) => t + l.price * (l.qty ?? 1), 0);
  const del = values.delivery.trim() !== "" ? Math.min(100000, Math.max(0, toInt(values.delivery, 0))) : deliveryCharge(s, v.area, sub);
  const discount = Math.min(sub + del, Math.max(0, toInt(values.discount, 0)));
  const order = await createOrder(db, {
    name: values.name, phone: v.phone, address: values.address, area: v.area, note: values.note,
    deliveryCharge: del, discount, couponCode: null,
    deviceId: null, ip: clientIp(c), userAgent: `নিজে লেখা অর্ডার: ${MANUAL_SOURCES[source]} (${c.var.admin?.email ?? "অ্যাডমিন"})`.slice(0, 500),
    fbp: null, fbc: null, sourceUrl: `manual:${source}`, prefix: orderPrefix(s),
  }, lines);
  await markConverted(db, v.phone, order.id);
  await liveOrder(c.env, order.id, "order_new", c.var.admin);

  if (values.confirm) {
    const r = await applyStatus(c, order.id, "confirmed");
    flash(c, r.ok && !r.purchaseFail ? "ok" : "error", `অর্ডার ${order.order_no} তৈরি হয়েছে। ${r.message}`);
  } else {
    flash(c, "ok", `অর্ডার ${order.order_no} তৈরি হয়েছে — "নতুন" তালিকায় আছে। কথা বলে নিশ্চিত হলে কনফার্ম করুন।`);
  }
  // কুরিয়ারে ক্রেতার রেকর্ড — একবার খুঁজে অর্ডারে সেভ (পেছনে)
  if (c.var.settings.demo_mode !== "1") {
    const crJob = (async () => {
      const plat = await platformCourier(c);
      if (courierRecordReady(c.var.settings, plat)) await orderCourierReport(c.env.DB, c.var.settings, plat, order.id, v.phone);
    })().catch(() => {});
    try { c.executionCtx.waitUntil(crJob); } catch { await crJob; }
  }
  return c.redirect(`/admin/orders/${order.id}`, 303);
});

/* ---------- অসম্পূর্ণ অর্ডার ---------- */
admin.get("/incomplete", async (c) => {
  const q = c.req.query("status") || "open";
  const status = (q in INCOMPLETE_TABS ? q : "open") as IncompleteTab;
  const [rows, counts] = await Promise.all([listIncomplete(c.env.DB, status), incompleteCounts(c.env.DB)]);
  const risk = status === "open" || status === "called" ? await riskMap(c, [...new Set(rows.map((r) => r.phone))]) : {};
  return render(c, "অসম্পূর্ণ অর্ডার", "incomplete",
    <IncompletePage rows={rows} status={status} counts={counts} shopName={c.var.settings.site_name || "আমাদের দোকান"} risk={risk} capture={c.var.settings.incomplete_capture !== "0"} lang={siteLang(c.var.settings)} />);
});

admin.post("/incomplete/:id{[0-9]+}/status", async (c) => {
  const to = String((await c.req.parseBody()).status);
  if (["open", "called", "dismissed"].includes(to)) {
    // অর্ডার হয়ে যাওয়া লাইন আর বদলায় না; একই নম্বরের আরেকটা খোলা লাইন থাকলে ফিরিয়ে আনা যায় না
    await c.env.DB.prepare(
      `UPDATE incomplete_orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND status != 'converted'
         AND (? = 'dismissed' OR NOT EXISTS (SELECT 1 FROM incomplete_orders x WHERE x.phone = incomplete_orders.phone AND x.id != incomplete_orders.id AND x.status IN ('open', 'called')))`,
    ).bind(to, toInt(c.req.param("id")), to).run().catch(() => {});
  }
  return c.redirect(c.req.header("referer")?.includes("/admin/incomplete") ? new URL(c.req.header("referer")!).pathname + new URL(c.req.header("referer")!).search : "/admin/incomplete", 303);
});

async function convertView(c: Ctx, row: IncompleteRow, extra: { errors?: Record<string, string>; values?: Record<string, string> } = {}, status: 200 | 422 = 200) {
  const s = c.var.settings;
  const max = maxQty(s);
  const lines = (await cartLines(c.env.DB, draftItems(row))).map((l) => ({ ...l, qty: Math.min(max, l.qty ?? 1) }));
  const sub = lines.reduce((t, l) => t + l.price * (l.qty ?? 1), 0);
  const blocked = !!(await c.env.DB.prepare("SELECT 1 FROM blacklist_entries WHERE type = 'phone' AND value = ?").bind(row.phone).first());
  return { lines, page: render(c, "অর্ডার বানান", "incomplete",
    <IncompleteConvertPage row={row} lines={lines} delivery={{ inside: deliveryCharge(s, "inside", sub), outside: deliveryCharge(s, "outside", sub) }} blocked={blocked} {...extra} />, status) };
}

admin.get("/incomplete/:id{[0-9]+}", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM incomplete_orders WHERE id = ?").bind(toInt(c.req.param("id"))).first<IncompleteRow>();
  if (!row) return c.redirect("/admin/incomplete", 303);
  if (row.status === "converted" && row.order_id) return c.redirect(`/admin/orders/${row.order_id}`, 303);
  return (await convertView(c, row)).page;
});

admin.post("/incomplete/:id{[0-9]+}/convert", async (c) => {
  const db = c.env.DB;
  const row = await db.prepare("SELECT * FROM incomplete_orders WHERE id = ?").bind(toInt(c.req.param("id"))).first<IncompleteRow>();
  if (!row) return c.redirect("/admin/incomplete", 303);
  if (row.status === "converted" && row.order_id) return c.redirect(`/admin/orders/${row.order_id}`, 303);
  const b = await c.req.parseBody();
  const values = { name: str(b.name, 100), address: str(b.address, 300), area: String(b.area ?? ""), note: str(b.note, 300) };
  const v = validateOrderInput({ ...values, phone: row.phone });
  const view = await convertView(c, row, v.ok ? {} : { errors: v.errors, values }, 422);
  if (!v.ok || !view.lines.length) return view.page;
  const sub = view.lines.reduce((t, l) => t + l.price * (l.qty ?? 1), 0);
  const order = await createOrder(db, {
    name: values.name, phone: v.phone, address: values.address, area: v.area, note: values.note,
    deliveryCharge: deliveryCharge(c.var.settings, v.area, sub),
    deviceId: row.device_id, ip: clientIp(c), userAgent: "অসম্পূর্ণ অর্ডার থেকে (অ্যাডমিন)",
    fbp: null, fbc: null, sourceUrl: row.source_url || "", prefix: orderPrefix(c.var.settings),
  }, view.lines);
  await markConverted(db, row.phone, order.id);
  later(c, liveOrder(c.env, order.id, "order_new", c.var.admin));
  // অন্য কারণে লাইনটা বন্ধ থাকলে (যেমন "বাদ") এটাকেও অর্ডারের সাথে জোড়া
  await db.prepare("UPDATE incomplete_orders SET status = 'converted', order_id = ?, updated_at = datetime('now') WHERE id = ?").bind(order.id, row.id).run();
  flash(c, "ok", `অর্ডার ${order.order_no} তৈরি হয়েছে — "নতুন" তালিকায় আছে।`);
  return c.redirect(`/admin/orders/${order.id}`, 303);
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

/** ডিজাইন কম্পোনেন্টের নমুনা (মেনুতে নেই) */
admin.get("/ui-kit", (c) => render(c, "ডিজাইন কম্পোনেন্ট", "ui-kit", <UiKitPage />));

/** স্টোরেজ পেজ (ডাটা ডাউনলোড বন্ধ) */
admin.get("/export", async (c) => {
  const st = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM products) products, (SELECT COUNT(*) FROM orders) orders,
            (SELECT COUNT(DISTINCT phone) FROM orders) customers, (SELECT COUNT(*) FROM images) images,
            (SELECT COALESCE(SUM(size), 0) FROM images) imageBytes, (SELECT COUNT(*) FROM pages) pages,
            (SELECT COUNT(*) FROM sms_logs) smsLogs`,
  ).first<StorageStats>();
  return render(c, "স্টোরেজ", "export", <BackupPage stats={st!} limit={(c.var.shopState.storage_mb ?? 0) * 1024 * 1024} />);
});

/* দোকানের প্যানেল থেকে CSV ডাউনলোড বন্ধ (১৬ নভেম্বর ২০২৬) — দরকার হলে সুপার অ্যাডমিন নামিয়ে দেন: /super/shops/:id/export/:kind.csv */

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
  const [own, shared, cached] = await Promise.all([
    ownRecords(db, [o.phone], o.id),
    sharedRecords(c.env.PLATFORM_DB, c.var.settings, c.env.SHOP_ID, [o.phone]),
    cachedCourierRecords(db, [o.phone]),
  ]);
  const record = { own: own[o.phone], shared: shared[o.phone], courier: parseOrderReport(o.courier_report) ?? cached[o.phone] ?? null, sharing: c.var.settings.fraud_share !== "0", canCheck: courierRecordReady(c.var.settings, await platformCourier(c)) };
  return render(c, o.order_no, "orders",
    <OrderDetailPage order={o} items={data.items} history={hist!.results as Order[]} blocked={{ phone: types.includes("phone"), device: types.includes("device") }} couriers={configuredCouriers(c.var.settings)} sms={sms}
      record={{ ...record, risk: riskOf(record.own, record.shared, record.courier) }} wa={waMessages(o, data.items, c.var.settings, await storeOrigin(c))} />);
});

/** স্ট্যাটাস বদল + তার পরের কাজ (বিলিং, Purchase, SMS) — একটা আর একসাথে অনেক অর্ডার দুটোতেই */
async function applyStatus(c: Ctx, id: number, to: OrderStatus): Promise<{ ok: boolean; message: string; purchaseFail?: string }> {
  const before = await c.env.DB.prepare("SELECT status, stock_applied FROM orders WHERE id = ?").bind(id).first<{ status: OrderStatus; stock_applied: number }>();
  const live = to === "confirmed" || to === "shipped"; // কনফার্ম বা শিপড = বিক্রি হয়েছে ধরা
  // স্টক: এখনো কাটা না হলে যথেষ্ট আছে কিনা
  if (live && before && !before.stock_applied) {
    const short = await checkOrderStock(c.env.DB, id);
    if (short) return { ok: false, message: short };
  }
  const res = await changeStatus(c.env.DB, id, to);
  if (!res.ok) return { ok: false, message: res.message };
  later(c, liveOrder(c.env, id, "status", c.var.admin));
  const wasBad = before?.status === "cancelled" || before?.status === "fake";
  // স্টক: বিক্রি হলে কাটা, ফেরালে (নতুন/বাতিল/ফেক) ফেরত — দুটোই একবারই হয়
  if (live) { await snapshotCost(c.env.DB, id); await applyOrderStock(c.env.DB, id); }
  else await restoreOrderStock(c.env.DB, id, "cancel");
  // বাতিল/ফেক থেকে ফেরালে সব দোকানের রেকর্ড থেকে দাগ মোছা
  if (wasBad && to !== "cancelled" && to !== "fake") await later(c, clearOutcome(c.env.PLATFORM_DB, c.env.SHOP_ID, res.order.order_no));
  let purchase: { ok: boolean; message: string } | null = null;
  if (live) {
    // বিলিং: ট্রায়ালে ফ্রি অর্ডার কমে, চালু দোকানে প্রতি কনফার্ম অর্ডারে চার্জ (অর্ডার নম্বর ধরে একবারই — ফিরিয়ে আবার কনফার্মে দুবার কাটে না)
    try {
      await chargeConfirmedOrder(c.env.PLATFORM_DB, c.env.SHOP_ID, res.order.order_no);
      clearShopCache(); // একই Worker-এ পরের রিকোয়েস্টে নতুন ব্যালেন্স (অন্য জায়গায় সর্বোচ্চ ৩০ সেকেন্ড দেরি)
      later(c, usageAlert(c));
    } catch (e) {
      console.error("billing error", e);
    }
    // শুধু সার্ভার থেকে (CAPI) Purchase — আগে গিয়ে থাকলে আবার যায় না
    purchase = await sendPurchase(c.env.DB, id, c.var.settings);
  }
  if (to === "confirmed") {
    if (before?.status === "new") smsLater(c, id, "confirmed"); // ক্রেতাকে একবারই
    return purchase!.ok
      ? { ok: true, message: "অর্ডার কনফার্ম হয়েছে, Facebook-এ Purchase গেছে।" }
      : { ok: true, message: `অর্ডার কনফার্ম হয়েছে, কিন্তু Purchase যায়নি: ${purchase!.message}`, purchaseFail: purchase!.message };
  }
  if (to === "cancelled" || to === "fake") {
    // সব দোকানের রেকর্ডে: কুরিয়ারে যাওয়ার পর বাতিল = ফেরত
    const outcome = to === "fake" ? "fake" : res.order.consignment_id ? "returned" : "cancelled";
    await later(c, recordOutcome(c.env.PLATFORM_DB, c.var.settings, c.env.SHOP_ID, res.order.order_no, res.order.phone, outcome));
    return { ok: true, message: "স্ট্যাটাস বদলেছে। নম্বর ও ডিভাইস ব্লক করা হয়েছে।" + (res.order.consignment_id ? " কুরিয়ারে বুক হয়ে থাকলে কুরিয়ারের প্যানেল থেকেও বাতিল করুন।" : "") };
  }
  if (to === "shipped" && (before?.status === "new" || before?.status === "confirmed")) smsLater(c, id, "shipped");
  return { ok: true, message: wasBad ? "স্ট্যাটাস বদলেছে। এই অর্ডারের জন্য নম্বর/ডিভাইসের ব্লক তুলে নেওয়া হয়েছে।" : "স্ট্যাটাস বদলেছে।" };
}

admin.post("/orders/:id{[0-9]+}/release", async (c) => {
  const id = toInt(c.req.param("id"));
  const ok = await releaseSpam(c.env.DB, id);
  flash(c, ok ? "ok" : "error", ok ? "অর্ডারটি নতুন তালিকায় পাঠানো হয়েছে।" : "অর্ডারটি স্প্যাম তালিকায় নেই।");
  return c.redirect(`/admin/orders/${id}`, 303);
});

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
  // স্প্যাম থেকে নতুন তালিকায় (স্ট্যাটাস আগেই "নতুন")
  if ((to as string) === "release") {
    const raw = Array.isArray(body.ids) ? body.ids : body.ids != null ? [body.ids] : [];
    const ids = [...new Set(raw.map((x) => toInt(String(x))).filter((n) => n > 0))].slice(0, 100);
    let done = 0;
    for (const id of ids) if (await releaseSpam(c.env.DB, id)) done++;
    flash(c, done ? "ok" : "error", done ? `${bn(done)}টা অর্ডার নতুন তালিকায় পাঠানো হয়েছে।` : "কোনো অর্ডার বাছাই করা হয়নি।");
    return c.redirect(backUrl, 303);
  }
  if (!["new", "confirmed", "cancelled", "fake", "shipped"].includes(to)) {
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
  const label = { new: "নতুন", confirmed: "কনফার্ম", cancelled: "বাতিল", fake: "ফেক", shipped: "শিপড" }[to as "confirmed"];
  flash(c, fails.length ? "error" : "ok",
    `${bn(done)}টা অর্ডার ${label} হয়েছে।` + (fails.length ? ` ${bn(fails.length)}টায় সমস্যা: ${[...new Set(fails)].slice(0, 2).join(" · ")}` : ""));
  return c.redirect(backUrl, 303);
});

/** ছাড় আর ডেলিভারি চার্জ বদলানো (ফোনে কথা বলে ছাড় দিলে) — মোট নতুন করে হিসাব */
admin.post("/orders/:id{[0-9]+}/price", async (c) => {
  const id = toInt(c.req.param("id"));
  const db = c.env.DB;
  const o = await db.prepare("SELECT id, status, consignment_id, subtotal, delivery_charge, discount, advance_amount, pay_status FROM orders WHERE id = ?").bind(id).first<Order>();
  if (!o) return c.redirect("/admin/orders", 303);
  if (!priceEditable(o)) {
    flash(c, "error", "কুরিয়ারে পাঠানো বা শেষ হয়ে যাওয়া অর্ডারের দাম বদলানো যায় না।");
    return c.redirect(`/admin/orders/${id}`, 303);
  }
  const b = await c.req.parseBody();
  const delivery = Math.min(100000, Math.max(0, toInt(String(b.delivery ?? o.delivery_charge), o.delivery_charge)));
  const discount = Math.min(o.subtotal + delivery, Math.max(0, toInt(String(b.discount ?? 0), 0)));
  const total = o.subtotal + delivery - discount;
  if (o.pay_status === "verified" && (o.advance_amount ?? 0) > total) {
    flash(c, "error", `অগ্রিম ${taka(o.advance_amount!)} পাওয়া গেছে — মোট এর চেয়ে কম করা যায় না।`);
    return c.redirect(`/admin/orders/${id}`, 303);
  }
  // ছাড় তুলে দিলে কুপনের নামও যায়
  await db.prepare("UPDATE orders SET delivery_charge = ?, discount = ?, total = ?, coupon_code = CASE WHEN ? > 0 THEN coupon_code ELSE NULL END WHERE id = ?")
    .bind(delivery, discount, total, discount, id).run();
  flash(c, "ok", `সেভ হয়েছে — ছাড় ${taka(discount)}, ডেলিভারি ${taka(delivery)}, নতুন মোট ${taka(total)}।`);
  return c.redirect(`/admin/orders/${id}`, 303);
});

admin.post("/orders/:id{[0-9]+}/purchase", async (c) => {
  const id = toInt(c.req.param("id"));
  const p = await sendPurchase(c.env.DB, id, c.var.settings);
  flash(c, p.ok ? "ok" : "error", p.ok ? "Purchase পাঠানো হয়েছে।" : `Purchase যায়নি: ${p.message}`);
  return c.redirect(`/admin/orders/${id}`, 303);
});

/* ---------- SMS (রেসপন্সের পরে পেছনে যায়) ---------- */
/** রেসপন্সের পরে চালানো (টেস্ট/লোকালে executionCtx না থাকলে সাথে সাথে) */
async function later(c: Ctx, job: Promise<unknown>) {
  try { c.executionCtx.waitUntil(job); } catch { await job; }
}

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
  const r = await sendParcel(courier, s, o, data.items, { cod: codAmount(o), note, ...opt }, saver(c));
  if (!r.ok) {
    await db.prepare("UPDATE orders SET courier = NULL, courier_status = NULL, courier_sent_at = NULL, courier_response = ? WHERE id = ?").bind(r.raw || r.message, id).run();
    return { ok: false, message: `${o.order_no}: ${r.message}` };
  }
  await db.prepare(
    `UPDATE orders SET consignment_id = ?, tracking_code = ?, courier_status = ?, courier_response = ?, courier_sent_at = datetime('now'), courier_checked_at = datetime('now') WHERE id = ?`,
  ).bind(r.consignmentId, r.trackingCode || r.consignmentId, r.status || "", r.raw.slice(0, 4000), id).run();
  const moved = await changeStatus(db, id, "shipped");
  if (moved.ok) smsLater(c, id, "shipped");
  later(c, liveOrder(c.env, id, "courier", c.var.admin));
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
      const out = outcomeFromCourier(r.status);
      if (out) await setOutcome(c, o, out);
      flash(c, "ok", `কুরিয়ার স্ট্যাটাস: ${r.status}${out ? ` — ${out === "delivered" ? "ডেলিভারি হয়েছে" : "ফেরত এসেছে"}` : ""}`);
    } else {
      flash(c, "error", r.message);
    }
  }
  return c.redirect(`/admin/orders/${id}`, 303);
});

/** ডেলিভারির ফল অর্ডারে আর সব দোকানের রেকর্ডে */
async function setOutcome(c: Ctx, o: Order, out: "delivered" | "returned") {
  if (o.outcome === out) return;
  await c.env.DB.prepare("UPDATE orders SET outcome = ?, outcome_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(out, o.id).run();
  // ফেরত এলে পণ্য স্টকে ফেরে; পরে আবার "ডেলিভারি হয়েছে" দিলে আবার কমে
  if (out === "returned") await restoreOrderStock(c.env.DB, o.id, "return");
  else if (o.outcome === "returned") await applyOrderStock(c.env.DB, o.id);
  await later(c, recordOutcome(c.env.PLATFORM_DB, c.var.settings, c.env.SHOP_ID, o.order_no, o.phone, out));
}

/** অগ্রিম পেমেন্ট: দোকানদার নিজের অ্যাপে মিলিয়ে "পেয়েছি" / "পাইনি" */
admin.post("/orders/:id{[0-9]+}/payment", async (c) => {
  const id = toInt(c.req.param("id"));
  const to = String((await c.req.parseBody()).status);
  if (to === "verified" || to === "rejected" || to === "pending") {
    const r = await c.env.DB.prepare("UPDATE orders SET pay_status = ?, pay_checked_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND pay_trx IS NOT NULL").bind(to, id).run();
    flash(c, r.meta.changes ? "ok" : "error", !r.meta.changes ? "এই অর্ডারে অগ্রিম পেমেন্ট নেই" : to === "verified" ? "অগ্রিম পেয়েছেন — কুরিয়ারে বাকি টাকাই তোলা হবে।" : to === "rejected" ? "অগ্রিম পাওয়া যায়নি বলে চিহ্ন দেওয়া হলো।" : "আবার যাচাই বাকি করা হলো।");
  }
  return c.redirect(`/admin/orders/${id}`, 303);
});

/** নিজে হাতে: "ডেলিভারি হয়েছে" / "ফেরত এসেছে" (কুরিয়ার API ছাড়া পাঠালে) */
admin.post("/orders/:id{[0-9]+}/outcome", async (c) => {
  const id = toInt(c.req.param("id"));
  const out = String((await c.req.parseBody()).outcome);
  const o = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<Order>();
  if (!o || (out !== "delivered" && out !== "returned") || !["confirmed", "shipped"].includes(o.status)) {
    flash(c, "error", "কনফার্ম বা শিপড অর্ডারেই ডেলিভারির ফল দেওয়া যায়");
  } else {
    await setOutcome(c, o, out);
    flash(c, "ok", out === "delivered" ? "ডেলিভারি হয়েছে — রেকর্ডে লেখা হলো।" : "ফেরত এসেছে — রেকর্ডে লেখা হলো।");
  }
  return c.redirect(`/admin/orders/${id}`, 303);
});

/** কনফার্মের আগে কুরিয়ারে ক্রেতার রেকর্ড খোঁজা */
admin.post("/orders/:id{[0-9]+}/courier-check", async (c) => {
  const id = toInt(c.req.param("id"));
  const o = await c.env.DB.prepare("SELECT phone FROM orders WHERE id = ?").bind(id).first<{ phone: string }>();
  if (!o) return c.redirect("/admin/orders", 303);
  if (!(await hitRateLimit(c.env.DB, "courier-check", 60, 60))) {
    flash(c, "error", "অনেকবার খোঁজা হয়েছে, এক মিনিট পরে চেষ্টা করুন");
  } else {
    const r = await orderCourierReport(c.env.DB, c.var.settings, await platformCourier(c), id, o.phone, true);
    flash(c, "error" in r ? "error" : "ok", "error" in r ? r.error : `কুরিয়ারের রেকর্ড পাওয়া গেছে (${r.source})`);
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
const COURIER_SECRET_KEYS = ["steadfast_secret_key", "pathao_client_secret", "pathao_password", "redx_token", "bdcourier_token"] as const;
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
  values.fraud_share = b.fraud_share ? "1" : "0";
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
  const urlErr = values.sms_custom_url ? customSmsUrlError(values.sms_custom_url, c.env.PLATFORM_DOMAIN) : null;
  if (urlErr) {
    flash(c, "error", urlErr);
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
  return (await db.prepare("SELECT id, name, sort_order, parent_id, title, image, description FROM categories ORDER BY sort_order, id").all<Category>()).results;
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
    await recordMedia(c.env.DB, key, { name: file.name });
    await cleanupIfUnused(c, [current]);
    result.matched.push(file.name);
  }
  if (result.matched.length) c.set("settings", { ...c.var.settings, ...(await loadSettings(c.env.DB)) });
  return bulkImagesView(c, result);
});

/** আগে ব্যবহার করা ব্র্যান্ড — ফর্মে বেছে নেওয়ার তালিকা */
async function knownBrands(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare("SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != '' ORDER BY brand LIMIT 100").all<{ brand: string }>();
  return results.map((r) => r.brand);
}

admin.get("/products/new", async (c) =>
  render(c, "নতুন পণ্য", "products", <ProductFormPage categories={await allCategories(c.env.DB)} brands={await knownBrands(c.env.DB)} />));

admin.get("/products/:id{[0-9]+}/edit", async (c) => {
  const p = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(toInt(c.req.param("id"))).first<Product>();
  if (!p) return c.redirect("/admin/products", 303);
  return render(c, "পণ্য এডিট", "products", <ProductFormPage product={p} categories={await allCategories(c.env.DB)} variants={await productVariants(c.env.DB, p.id)} brands={await knownBrands(c.env.DB)} />);
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
    // ক্রম ফর্মে আর নেই (মোঃ: দরকার নেই) — আগেরটা থাকে, নতুন পণ্যে ০
    sort_order: "sort_order" in body ? toInt(body.sort_order) : existing?.sort_order ?? 0,
    options_json: null as string | null,
    track_stock: body.track_stock ? 1 : 0,
    low_stock: Math.max(0, Math.min(100000, toInt(body.low_stock, 5))),
    cost_price: str(body.cost_price, 12) === "" ? null : Math.max(0, toInt(body.cost_price)),
    sku: str(body.sku, 60) || null,
    barcode: str(body.barcode, 60) || null,
    brand: str(body.brand, 80) || null,
    features: parseFeatures(typeof body.features === "string" ? body.features.slice(0, 2000) : "").join("\n") || null,
    stock_status: body.stock_status === "out" ? "out" : "in",
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
  if (v.sku && (await db.prepare("SELECT id FROM products WHERE sku = ? AND id != ?").bind(v.sku, id ?? 0).first())) errors.sku = "এই SKU আরেকটা পণ্যে আছে";

  const file = body.image;
  let imageKey = existing?.image ?? null;
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext) errors.image = "শুধু JPG, PNG বা WebP ছবি দিন";
    else if (file.size > MAX_IMAGE) errors.image = "ছবি ৩ MB-এর কম হতে হবে";
  }
  // গ্যালারি: প্রতিটা ঘরে আগের ছবি / সরানো / নতুন ফাইল / লাইব্রেরি থেকে বাছাই
  const oldGallery = parseGallery(existing?.gallery_json);
  for (let i = 0; i < GALLERY_MAX; i++) {
    const f = body[`g${i}_file`];
    if (f instanceof File && f.size > 0 && (!IMAGE_TYPES[f.type] || f.size > MAX_IMAGE)) errors.gallery = "গ্যালারির ছবি JPG, PNG বা WebP আর ৩ MB-এর কম হতে হবে";
  }

  if (Object.keys(errors).length) {
    return render(c, "পণ্য", "products",
      <ProductFormPage product={{ ...existing, ...v, image: existing?.image ?? null, gallery_json: existing?.gallery_json ?? null }} categories={await allCategories(db)} errors={errors} brands={await knownBrands(db)} />, 422);
  }

  const gallery: string[] = [];
  for (let i = 0; i < GALLERY_MAX; i++) {
    const cur = str(body[`g${i}_cur`], 200);
    let key: string | null = cur && oldGallery.includes(cur) ? cur : null; // শুধু আগে থেকে থাকা ছবিই "আগের" হিসেবে মানা
    if (body[`g${i}_remove`]) key = null;
    const f = body[`g${i}_file`];
    if (f instanceof File && f.size > 0) {
      key = `p/${crypto.randomUUID()}.${IMAGE_TYPES[f.type]}`;
      await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, key), await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
      await recordMedia(db, key, { name: f.name });
    } else {
      const pick = str(body[`g${i}_pick`], 200);
      if (pick && pick !== key && (await mediaExists(db, pick))) key = pick;
    }
    if (key && !gallery.includes(key)) gallery.push(key);
  }
  const galleryJson = gallery.length ? JSON.stringify(gallery) : null;

  if (file instanceof File && file.size > 0) {
    imageKey = `p/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
    await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, imageKey), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    await recordMedia(db, imageKey, { name: file.name });
  } else {
    // মিডিয়া লাইব্রেরি থেকে বাছাই করা ছবি
    const pick = str(body.image_pick, 200);
    if (pick && pick !== imageKey && (await mediaExists(db, pick))) imageKey = pick;
  }
  const oldImage = existing?.image && existing.image !== imageKey ? existing.image : null;
  const droppedGallery = oldGallery.filter((k) => !gallery.includes(k) && k !== imageKey);

  const cols = [v.category_id, v.name, v.slug, v.price, v.compare_price, imageKey, v.headline, v.short_desc, v.details_html, v.youtube_url, v.is_active, v.show_on_home, v.sort_order, v.options_json, v.meta_title, v.meta_description, v.track_stock, v.low_stock, v.cost_price,
    v.sku, v.barcode, v.brand, galleryJson, v.features, v.stock_status];
  let productId = id;
  if (id) {
    await db.prepare(
      `UPDATE products SET category_id=?, name=?, slug=?, price=?, compare_price=?, image=?, headline=?, short_desc=?, details_html=?,
         youtube_url=?, is_active=?, show_on_home=?, sort_order=?, options_json=?, meta_title=?, meta_description=?, track_stock=?, low_stock=?, cost_price=?,
         sku=?, barcode=?, brand=?, gallery_json=?, features=?, stock_status=?, updated_at=datetime('now') WHERE id=?`,
    ).bind(...cols, id).run();
    const moves = slugChangeStatements(db, id, existing!.slug, v.slug);
    if (moves.length) await db.batch(moves);
  } else {
    const r = await db.prepare(
      `INSERT INTO products (category_id, name, slug, price, compare_price, image, headline, short_desc, details_html, youtube_url, is_active, show_on_home, sort_order, options_json, meta_title, meta_description, track_stock, low_stock, cost_price,
         sku, barcode, brand, gallery_json, features, stock_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    ).bind(...cols).first<{ id: number }>();
    productId = r!.id;
    await db.prepare("DELETE FROM slug_redirects WHERE old_slug = ?").bind(v.slug).run();
  }
  await syncVariants(db, productId!, options);
  // স্টক: ভ্যারিয়েন্ট না থাকলে পণ্যের নিজের, থাকলে ভ্যারিয়েন্টের যোগফল
  if (options.length) await recomputeProductStock(db, [productId!]);
  else if (v.track_stock && str(body.stock, 10) !== "") await setStock(db, [{ productId: productId!, variantId: null, stock: toInt(body.stock) }], id ? "পণ্যের পেজ থেকে" : "নতুন পণ্য");
  await cleanupIfUnused(c, [oldImage, ...droppedGallery]);
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
      const costRaw = str(body[`cost_${vr.id}`], 10);
      return c.env.DB.prepare("UPDATE product_variants SET price = ?, active = ?, cost_price = ? WHERE id = ? AND product_id = ?")
        .bind(price, body[`active_${vr.id}`] ? 1 : 0, costRaw === "" ? null : Math.max(0, toInt(costRaw)), vr.id, id);
    }));
    await setStock(c.env.DB, variants.filter((vr) => str(body[`stock_${vr.id}`], 10) !== "").map((vr) => ({ productId: id, variantId: vr.id, stock: toInt(body[`stock_${vr.id}`]) })), "পণ্যের পেজ থেকে");
    await recomputeProductStock(c.env.DB, [id]);
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
/* ---------- ইনভেন্টরি ---------- */
admin.get("/inventory", async (c) => {
  const f = c.req.query("f") || "all";
  const filter = (["all", "low", "out"].includes(f) ? f : "all") as InvFilter;
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const [rows, sum, moves, untracked] = await Promise.all([
    inventoryRows(c.env.DB, filter, q), inventorySummary(c.env.DB), recentMoves(c.env.DB, 30),
    c.env.DB.prepare("SELECT id, name, image, is_active FROM products WHERE track_stock = 0 ORDER BY is_active DESC, sort_order, id LIMIT 300").all<{ id: number; name: string; image: string | null; is_active: number }>(),
  ]);
  return render(c, "ইনভেন্টরি", "inventory", <InventoryPage rows={rows} summary={sum} moves={moves} filter={filter} q={q} untracked={untracked.results} />);
});

/** একসাথে অনেকগুলোর স্টক বসানো: s_<productId>_<variantId|0> = নতুন সংখ্যা, অথবা a_… = যোগ/বিয়োগ */
admin.post("/inventory", async (c) => {
  const b = await c.req.parseBody();
  const items: { productId: number; variantId: number | null; stock: number }[] = [];
  const adds: { productId: number; variantId: number | null; add: number }[] = [];
  for (const [k, raw] of Object.entries(b)) {
    const m = /^([sa])_(\d+)_(\d+)$/.exec(k);
    if (!m || typeof raw !== "string" || raw.trim() === "") continue;
    const productId = toInt(m[2]);
    const variantId = toInt(m[3]) || null;
    if (m[1] === "s") items.push({ productId, variantId, stock: toInt(raw) });
    else if (toInt(raw)) adds.push({ productId, variantId, add: toInt(raw) });
  }
  // যোগ/বিয়োগ: এখনকার স্টক দেখে নতুন সংখ্যা
  for (const a of adds) {
    const row = a.variantId
      ? await c.env.DB.prepare("SELECT stock FROM product_variants WHERE id = ? AND product_id = ?").bind(a.variantId, a.productId).first<{ stock: number }>()
      : await c.env.DB.prepare("SELECT stock FROM products WHERE id = ?").bind(a.productId).first<{ stock: number }>();
    if (!row) continue;
    const i = items.findIndex((x) => x.productId === a.productId && x.variantId === a.variantId);
    const base = i >= 0 ? items[i]!.stock : row.stock;
    if (i >= 0) items[i]!.stock = base + a.add; else items.push({ productId: a.productId, variantId: a.variantId, stock: base + a.add });
  }
  const note = str(b.note, 100) || "ইনভেন্টরি থেকে";
  const n = await setStock(c.env.DB, items.slice(0, 500), note);
  flash(c, "ok", n ? `${bn(n)}টা স্টক বদলেছে।` : "কিছু বদলায়নি।");
  const back = c.req.header("referer");
  return c.redirect(back && back.includes("/admin/inventory") ? new URL(back).pathname + new URL(back).search : "/admin/inventory", 303);
});

/** স্টক গোনা চালু করা (অনেক পণ্য একসাথে) — সংখ্যা ০ থেকে শুরু, পরে বসাতে হয় */
admin.post("/inventory/track", async (c) => {
  const b = await c.req.parseBody({ all: true });
  const ids = (Array.isArray(b.ids) ? b.ids : [b.ids]).map((x) => toInt(x)).filter((x) => x > 0).slice(0, 500);
  if (ids.length) {
    await c.env.DB.prepare(`UPDATE products SET track_stock = 1, updated_at = datetime('now') WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
    await recomputeProductStock(c.env.DB, ids);
  }
  flash(c, "ok", ids.length ? `${bn(ids.length)}টা পণ্যে স্টক গোনা চালু হলো — এখন সংখ্যা বসান।` : "কোনো পণ্য বাছাই করা হয়নি।");
  return c.redirect("/admin/inventory", 303);
});

admin.get("/categories", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT category_id, COUNT(*) n FROM products GROUP BY category_id").all<{ category_id: number; n: number }>();
  const counts = Object.fromEntries(results.map((r) => [r.category_id, r.n]));
  const cats = await allCategories(c.env.DB);
  const rows = categoryTree(cats).map((k) => ({
    ...k, count: counts[k.id] ?? 0,
    total: withChildren(cats, k.id).reduce((n, id) => n + (counts[id] ?? 0), 0),
  }));
  return render(c, "ক্যাটাগরি", "categories", <CategoriesPage rows={rows} />);
});

/** উপরের ক্যাটাগরি হতে পারে: মূল ক্যাটাগরিগুলো (নিজে বাদে) — সাব-ক্যাটাগরি এক ধাপ পর্যন্ত */
const parentChoices = (cats: Category[], selfId?: number) => cats.filter((k) => !k.parent_id && k.id !== selfId);

admin.get("/categories/new", async (c) => {
  const cats = await allCategories(c.env.DB);
  const parent = toInt(c.req.query("parent")) || null;
  return render(c, "নতুন ক্যাটাগরি", "categories", <CategoryFormPage cat={{ parent_id: parentChoices(cats).some((k) => k.id === parent) ? parent : null }} parents={parentChoices(cats)} />);
});

admin.get("/categories/:id{[0-9]+}/edit", async (c) => {
  const cats = await allCategories(c.env.DB);
  const cat = cats.find((k) => k.id === toInt(c.req.param("id")));
  if (!cat) return c.redirect("/admin/categories", 303);
  return render(c, "ক্যাটাগরি এডিট", "categories", <CategoryFormPage cat={{ ...cat, hasChildren: cats.some((k) => k.parent_id === cat.id) }} parents={parentChoices(cats, cat.id)} />);
});

/** নতুন/এডিট — পুরো ফর্ম (full=1) হলে সব ঘর, নইলে শুধু যা এসেছে (পুরনো ছোট ফর্ম) */
async function saveCategory(c: Ctx, id: number | null) {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const cats = await allCategories(db);
  const existing = id ? cats.find((k) => k.id === id) : null;
  if (id && !existing) return c.redirect("/admin/categories", 303);
  const full = body.full === "1";
  const has = (k: string) => full || k in body;
  const hasChildren = !!id && cats.some((k) => k.parent_id === id);
  const v = {
    name: has("name") ? str(body.name, 100) : existing?.name ?? "",
    sort_order: has("sort_order") ? toInt(body.sort_order) : existing?.sort_order ?? 0,
    parent_id: has("parent_id") && !hasChildren ? toInt(body.parent_id) || null : existing?.parent_id ?? null,
    title: has("title") ? str(body.title, 150) || null : existing?.title ?? null,
    description: has("description") ? (typeof body.description === "string" ? body.description : "").slice(0, 50_000).trim() || null : existing?.description ?? null,
    image: existing?.image ?? null,
  };
  const errors: Record<string, string> = {};
  if (!v.name) errors.name = "নাম লিখুন";
  if (v.parent_id && !parentChoices(cats, id ?? undefined).some((k) => k.id === v.parent_id)) errors.parent_id = "এই ক্যাটাগরির নিচে রাখা যায় না";
  const f = body.image_file;
  if (f instanceof File && f.size > 0 && (!IMAGE_TYPES[f.type] || f.size > MAX_IMAGE)) errors.image = "ছবি JPG, PNG বা WebP আর ৩ MB-এর কম হতে হবে";
  if (Object.keys(errors).length) {
    if (!full) { flash(c, "error", Object.values(errors)[0]!); return c.redirect("/admin/categories", 303); }
    return render(c, "ক্যাটাগরি", "categories", <CategoryFormPage cat={{ ...existing, ...v, id: id ?? undefined, hasChildren }} parents={parentChoices(cats, id ?? undefined)} errors={errors} />, 422);
  }
  if (body.image_remove) v.image = null;
  if (f instanceof File && f.size > 0) {
    v.image = `p/${crypto.randomUUID()}.${IMAGE_TYPES[f.type]}`;
    await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, v.image), await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
    await recordMedia(db, v.image, { name: f.name });
  } else {
    const pick = str(body.image_pick, 200);
    if (pick && pick !== v.image && (await mediaExists(db, pick))) v.image = pick;
  }
  const cols = [v.name, v.sort_order, v.parent_id, v.title, v.image, v.description];
  if (id) await db.prepare("UPDATE categories SET name = ?, sort_order = ?, parent_id = ?, title = ?, image = ?, description = ? WHERE id = ?").bind(...cols, id).run();
  else await db.prepare("INSERT INTO categories (name, sort_order, parent_id, title, image, description) VALUES (?, ?, ?, ?, ?, ?)").bind(...cols).run();
  if (existing?.image && existing.image !== v.image) await cleanupIfUnused(c, [existing.image]);
  flash(c, "ok", id ? "ক্যাটাগরি সেভ হয়েছে।" : v.parent_id ? "সাব-ক্যাটাগরি যোগ হয়েছে।" : "ক্যাটাগরি যোগ হয়েছে।");
  return c.redirect("/admin/categories", 303);
}

admin.post("/categories", (c) => saveCategory(c, null));
admin.post("/categories/:id{[0-9]+}", (c) => saveCategory(c, toInt(c.req.param("id"))));

admin.post("/categories/:id{[0-9]+}/delete", async (c) => {
  const id = toInt(c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE products SET category_id = NULL WHERE category_id = ?").bind(id),
    c.env.DB.prepare("UPDATE categories SET parent_id = NULL WHERE parent_id = ?").bind(id), // সাব-ক্যাটাগরি মূল হয়ে যায়
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
  payment: { title: "অগ্রিম পেমেন্ট", view: (c) => <SettingsPaymentPage s={c.var.settings} /> },
  seo: { title: "SEO", view: async (c) => <SettingsSeoPage s={c.var.settings} url={await storeOrigin(c)} /> },
  tracking: { title: "পিক্সেল ও ট্র্যাকিং", view: (c) => <SettingsTrackingPage s={c.var.settings} /> },
};

/* থিম কাস্টমাইজ — শুধু দোকানে চালু থিমের সেটিংস (প্রতিটা থিমের সেটিংস আলাদা সেভ থাকে) */
/* পুরনো "থিম কাস্টমাইজ" পেজ → থিম লাইভ এডিটর (একই সেটিং দুই জায়গায় নয়) */
admin.get("/settings/customize", (c) => c.redirect("/admin/design", 302));

/** পাবলিশের আগের লাইভ ডিজাইন রেখে দেওয়া (শেষ ১০টা) — "আগের সংস্করণে ফেরা" */
export const MAX_THEME_VERSIONS = 10;
type ThemeVersion = { at: string; cfg: string };
function themeVersions(s: Record<string, string | undefined>, theme: ThemeKey): ThemeVersion[] {
  try {
    const v = JSON.parse(s[`theme_versions_${theme}`] || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.at === "string" && typeof x.cfg === "string").slice(0, MAX_THEME_VERSIONS) : [];
  } catch { return []; }
}
function withVersion(s: Record<string, string | undefined>, theme: ThemeKey): string {
  const live = s[`theme_cfg_${theme}`] || "{}";
  const list = themeVersions(s, theme);
  if (list[0]?.cfg === live) return JSON.stringify(list);
  return JSON.stringify([{ at: new Date().toISOString(), cfg: live }, ...list].slice(0, MAX_THEME_VERSIONS));
}

/** থিম সেটিংসের ফর্ম → যাচাই করা cfg (ছবি আপলোড/লাইব্রেরি থেকে বাছাইসহ) */
async function cfgFromBody(c: Ctx, b: Record<string, unknown>, theme: ThemeKey): Promise<{ cfg?: Cfg; error?: string }> {
  // একই নামের একাধিক মান শুধু পণ্যের তালিকায় থাকে; বাকিগুলোর প্রথমটা
  for (const [k, val] of Object.entries(b)) if (Array.isArray(val) && !k.endsWith("_products")) b[k] = val[0];
  // ছবি (মাঝের ব্যানার, পপআপ)
  for (const f of GROUPS.flatMap((g) => g.fields).filter((f) => f.type === "image")) {
    const file = b[`cfgimg_${f.key}`];
    if (file instanceof File && file.size > 0) {
      const ext = IMAGE_TYPES[file.type];
      if (!ext || file.size > 2 * 1024 * 1024) return { error: "ছবি PNG/JPG/WebP আর ২ MB-এর কম হতে হবে" };
      const key = `theme/${crypto.randomUUID()}.${ext}`;
      await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, key), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
      await recordMedia(c.env.DB, key, { name: file.name });
      b[f.key] = key;
    } else if (b[`remove_${f.key}`]) b[f.key] = "";
    else {
      const pick = str(b[`cfgpick_${f.key}`], 200);
      if (pick && (await mediaExists(c.env.DB, pick))) b[f.key] = pick;
    }
  }
  return { cfg: cfgFromForm(b, theme) };
}

admin.post("/settings/customize", async (c) => {
  const b = await c.req.parseBody({ all: true }) as Record<string, unknown>;
  const theme = themeOf(c.var.settings);
  const r = await cfgFromBody(c, b, theme);
  if (r.error) {
    flash(c, "error", r.error);
    return c.redirect("/admin/settings/customize", 303);
  }
  const value = b.reset ? "" : JSON.stringify(cfgDiff(r.cfg!, theme));
  await saveSettings(c.env.DB, { [`theme_cfg_${theme}`]: value, [`theme_draft_${theme}`]: "", [`theme_versions_${theme}`]: withVersion(c.var.settings, theme) });
  flash(c, "ok", b.reset ? `${THEMES[theme].name} থিম শুরুর সেটিংসে ফিরেছে।` : `${THEMES[theme].name} থিমের সেটিংস সেভ হয়েছে।`);
  return c.redirect("/admin/settings/customize", 303);
});

/* ---------- থিম লাইভ এডিটর: খসড়া → প্রিভিউ → পাবলিশ ---------- */
admin.get("/design", async (c) => {
  const theme = themeOf(c.var.settings);
  const { results: products } = await c.env.DB.prepare("SELECT id, name FROM products WHERE is_active = 1 ORDER BY sort_order, id DESC LIMIT 300").all<{ id: number; name: string }>();
  const { results: categories } = await c.env.DB.prepare("SELECT id, name FROM categories ORDER BY sort_order, id").all<{ id: number; name: string }>();
  // প্রিভিউতে পণ্যের পেজ দেখাতে — রিভিউ বেশি এমন পণ্য আগে, যাতে রিভিউ অংশটাও দেখা যায়
  const sample = await c.env.DB.prepare("SELECT slug FROM products WHERE is_active = 1 ORDER BY COALESCE(rating_count, 0) DESC, sort_order, id DESC LIMIT 1").first<{ slug: string }>();
  const draft = c.var.settings[`theme_draft_${theme}`] || "";
  const cfg = themeConfig(draft ? { ...c.var.settings, [`theme_cfg_${theme}`]: draft } : c.var.settings, theme);
  return c.html(<DesignEditorPage theme={theme} cfg={cfg} products={products} categories={categories} versions={themeVersions(c.var.settings, theme).map((v) => v.at)} hasDraft={!!draft} shopName={c.var.settings.site_name || ""} sampleSlug={sample?.slug} />);
});

admin.post("/design/draft", async (c) => {
  const theme = themeOf(c.var.settings);
  const r = await cfgFromBody(c, await c.req.parseBody({ all: true }) as Record<string, unknown>, theme);
  if (r.error) return c.json({ ok: false, message: r.error }, 400);
  const draft = JSON.stringify(cfgDiff(r.cfg!, theme));
  const live = JSON.stringify(cfgDiff(themeConfig(c.var.settings, theme), theme));
  // লাইভের সাথে মিলে গেলে খসড়া রাখার দরকার নেই
  await saveSettings(c.env.DB, { [`theme_draft_${theme}`]: draft === live ? "" : draft });
  return c.json({ ok: true, changed: draft !== live });
});

admin.post("/design/publish", async (c) => {
  const theme = themeOf(c.var.settings);
  const draft = c.var.settings[`theme_draft_${theme}`];
  if (draft) await saveSettings(c.env.DB, { [`theme_cfg_${theme}`]: draft, [`theme_draft_${theme}`]: "", [`theme_versions_${theme}`]: withVersion(c.var.settings, theme) });
  return c.json({ ok: true });
});

/** আগের একটা সংস্করণ খসড়ায় আনা — প্রিভিউতে দেখে তারপর পাবলিশ */
admin.post("/design/restore", async (c) => {
  const theme = themeOf(c.var.settings);
  const v = themeVersions(c.var.settings, theme)[toInt(String((await c.req.parseBody()).i ?? ""), -1)];
  if (!v) return c.json({ ok: false, message: "সংস্করণ পাওয়া যায়নি" }, 400);
  const live = c.var.settings[`theme_cfg_${theme}`] || "{}";
  await saveSettings(c.env.DB, { [`theme_draft_${theme}`]: v.cfg === live ? "" : v.cfg });
  return c.json({ ok: true });
});

admin.post("/design/discard", async (c) => {
  await saveSettings(c.env.DB, { [`theme_draft_${themeOf(c.var.settings)}`]: "" });
  return c.json({ ok: true });
});

admin.get("/settings", (c) => render(c, SET_PAGES.general!.title, "settings", SET_PAGES.general!.view(c)));
admin.get("/settings/:section{[a-z]+}", async (c) => {
  const pg = SET_PAGES[c.req.param("section")];
  if (!pg) return c.redirect("/admin/settings", 303);
  const sec = c.req.param("section");
  const nav = sec === "appearance" ? "theme" : sec === "tracking" || sec === "delivery" ? sec : "settings";
  return render(c, pg.title, nav, await pg.view(c));
});

/** ছবি আপলোড (লোগো, ফেভিকন, শেয়ার ইমেজ) — সফল হলে নতুন key, ভুল হলে error */
async function settingImage(c: Ctx, b: Record<string, unknown>, key: "logo" | "favicon" | "seo_image" | "banner_1" | "banner_2" | "banner_3", maxBytes: number, stale: string[]): Promise<{ value?: string; error?: string }> {
  const file = b[key];
  const current = c.var.settings[key];
  const pick = str(b[`${key}_pick`], 200);
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext || file.size > maxBytes) return { error: `ছবি PNG/JPG/WebP আর ${Math.round(maxBytes / 1024 / 1024)} MB-এর কম হতে হবে` };
    const name = `${key.replace("_", "")}/${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, name), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    await recordMedia(c.env.DB, name, { name: file.name });
    if (current) stale.push(current);
    return { value: name };
  }
  // মিডিয়া লাইব্রেরি থেকে বাছাই করা ছবি
  if (pick && pick !== current && (await mediaExists(c.env.DB, pick))) {
    if (current) stale.push(current);
    return { value: pick };
  }
  if (b[`remove_${key}`] && current) {
    stale.push(current);
    return { value: "" };
  }
  return {};
}

/** পুরনো ছবি — আর কোথাও ব্যবহার না হলে তবেই মোছা (লাইব্রেরি থেকে অন্য জায়গায় বসানো থাকতে পারে) */
async function cleanupIfUnused(c: Ctx, keys: (string | null | undefined)[]) {
  for (const k of new Set(keys.filter((x): x is string => !!x))) {
    if ((await mediaUsage(c.env.DB, k)).length === 0) await c.env.IMAGES.delete(imageStorageKey(c.env.SHOP_ID, k)).catch(() => {});
  }
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
  // ভাষা: দোকানের ওয়েবসাইট আর অ্যাডমিন প্যানেল আলাদা (ডিফল্ট বাংলা)
  for (const k of ["site_lang", "admin_lang"]) if (has(k)) v[k] = b[k] === "en" ? "en" : "bn";
  if (has("spam_level")) v.spam_level = ["off", "soft", "medium", "hard"].includes(String(b.spam_level)) ? String(b.spam_level) : "medium";
  // লাইভ নোটিফিকেশন (চেকবাক্স না পাঠালে = বন্ধ, তাই live_form দিয়ে বোঝা যায় অংশটা ফর্মে ছিল)
  if (has("live_form")) {
    for (const k of ["live_on", "live_pop_new", "live_pop_status", "live_refresh"]) v[k] = b[k] ? "1" : "0";
    v.live_tone = b.live_tone === "cash" || b.live_tone === "off" ? String(b.live_tone) : "ting";
  }
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
    v.incomplete_capture = b.incomplete_capture ? "1" : "0";
  }
  if (has("max_qty")) v.max_qty = String(Math.min(50, Math.max(1, toInt(b.max_qty, 5))));
  if (has("invoice_size")) v.invoice_size = b.invoice_size === "sticker" ? "sticker" : "a4";
  if (has("sticker_size")) v.sticker_size = b.sticker_size === "3x4" ? "3x4" : "3x3";
  if (has("checkout_email")) v.checkout_email = ["off", "optional", "required"].includes(String(b.checkout_email)) ? String(b.checkout_email) : "off";
  if (has("default_area")) v.default_area = ["inside", "outside", "none"].includes(String(b.default_area)) ? String(b.default_area) : "inside";
  if (has("order_prefix")) { const x = str(b.order_prefix, 6).toUpperCase(); v.order_prefix = /^[A-Z0-9-]{1,6}$/.test(x) ? x : "ORD-"; }
  if (section === "seo") v.seo_noindex = b.seo_noindex ? "1" : "0";
  if (section === "tracking") v.purchase_guard = b.purchase_guard ? "1" : "0";
  if (section === "payment") {
    for (const k of ["bkash", "nagad", "rocket"]) {
      const n = normalizePhone(str(b[`payment_${k}`], 20));
      v[`payment_${k}`] = n ?? "";
      v[`payment_${k}_type`] = ["personal", "agent", "merchant"].includes(String(b[`payment_${k}_type`])) ? String(b[`payment_${k}_type`]) : "personal";
    }
    v.advance_mode = ["off", "delivery", "fixed", "full"].includes(String(b.advance_mode)) ? String(b.advance_mode) : "off";
    v.advance_who = ["all", "outside", "risky"].includes(String(b.advance_who)) ? String(b.advance_who) : "all";
    v.advance_fixed = String(Math.max(0, Math.min(1_000_000, toInt(b.advance_fixed))));
    v.advance_note = str(b.advance_note, 200);
  }

  // গোপন টোকেন: ফাঁকা রাখলে আগেরটাই থাকে
  const token = str(b.fb_capi_token, 1000);
  if (token) v.fb_capi_token = token;
  else if (b.clear_token) v.fb_capi_token = "";

  // ছবি
  const stale: string[] = [];
  for (const [key, max] of [["logo", 1024 * 1024], ["favicon", 512 * 1024], ["seo_image", 2 * 1024 * 1024],
    ["banner_1", 2 * 1024 * 1024], ["banner_2", 2 * 1024 * 1024], ["banner_3", 2 * 1024 * 1024]] as const) {
    const r = await settingImage(c, b, key, max, stale);
    if (r.error) {
      flash(c, "error", r.error);
      return c.redirect(section === "general" && !has("_section") ? "/admin/settings" : SETTINGS_URL[section] ?? "/admin/settings", 303);
    }
    if (r.value !== undefined) v[key] = r.value;
  }

  await saveSettings(c.env.DB, v);
  await cleanupIfUnused(c, stale);
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

/* প্ল্যানের সীমার ৮০% আর ১০০%-এ ফোনে নোটিফিকেশন (একবারই — ঠিক সেই অর্ডারে) */
async function usageAlert(c: Ctx) {
  const shop = await billingShop(c.env.PLATFORM_DB, c.env.SHOP_ID);
  if (!shop || shop.status !== "active") return;
  const plan = planForShop(await platformSettings(c.env.PLATFORM_DB), shop.created_at, shop.plan);
  const n = shop.period_orders, warnAt = Math.ceil(plan.orders * 0.8);
  if (n !== warnAt && n !== plan.orders) return;
  const full = n === plan.orders;
  await pushToShop(c.env.DB, c.env.PLATFORM_DB, {
    title: full ? `প্ল্যানের ${bn(plan.orders)}টা অর্ডার শেষ` : `প্ল্যানের ৮০% অর্ডার হয়ে গেছে`,
    body: full ? `এই মাসে এখন থেকে প্রতি কনফার্ম অর্ডারে ${taka(plan.extra)} — বড় প্ল্যানে গেলে সস্তা হতে পারে।` : `${bn(n)}/${bn(plan.orders)}টা অর্ডার। সীমার পরে প্রতি অর্ডারে ${taka(plan.extra)}।`,
    url: "/admin/billing", tag: "plan-usage",
  });
}

/* ---------- বিলিং ---------- */
/** বিলিং পেজের ব্যবহার-হিসাব: মেয়াদ, এই মাসের অর্ডার (দিন ধরে), বিলের ইতিহাস */
async function loadUsage(pdb: D1Database, shop: BillingShop, fees: Record<string, string>): Promise<UsageView> {
  const trial = shop.status === "trial";
  const plans = plansForShop(fees as PlatformSettings, shop.created_at);
  const planKey = (trial ? TRIAL_PLAN : isPlan(shop.plan) ? shop.plan : "free") as PlanKey;
  const plan = plans[planKey];
  const dt = (utc: string) => new Date(utc.replace(" ", "T") + "Z");
  const sql = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  // এই মাসের হিসাবের শুরু: ট্রায়ালে দোকান খোলার দিন, নইলে usage_reset_at থেকে এক মাস আগে
  let periodStart: string | null = trial ? shop.created_at : null;
  if (!trial && shop.usage_reset_at) { const d = dt(shop.usage_reset_at); d.setUTCMonth(d.getUTCMonth() - 1); periodStart = sql(d); }
  const rows = periodStart
    ? (await pdb.prepare("SELECT ref, created_at FROM ledger WHERE shop_id = ? AND type IN ('plan_order', 'trial_order') AND created_at >= ? ORDER BY id LIMIT 5000")
      .bind(shop.id, periodStart).all<{ ref: string; created_at: string }>()).results
    : [];
  const used = trial ? rows.length : shop.period_orders;
  const limit = trial ? rows.length + Math.max(0, shop.trial_orders_left) : plan.orders;
  // দিন ধরে (ঢাকার দিন), বাড়তি চার্জ জমতে জমতে কোন দিনে কত
  const byDay = new Map<string, UsageDay>();
  let n = 0;
  for (const r of rows) {
    const day = new Date(dt(r.created_at).getTime() + 6 * 3600e3).toISOString().slice(0, 10);
    const before = trial ? 0 : overageCharge(plan, n);
    n++;
    const after = trial ? 0 : overageCharge(plan, n);
    const d = byDay.get(day) ?? { day, first: r.ref, last: r.ref, count: 0, fee: 0 };
    d.last = r.ref; d.count++; d.fee += after - before;
    byDay.set(day, d);
  }
  const days = [...byDay.values()].reverse().slice(0, 62);

  // বিলের ইতিহাস: প্যাকেজের বিল / বদল / সীমার বেশি — প্রতিটার পরের বিল পর্যন্ত কত অর্ডার
  const led = (await pdb.prepare(
    "SELECT type, amount, note, created_at FROM ledger WHERE shop_id = ? AND applied = 1 AND (type IN ('monthly', 'overage') OR (type = 'plan_change' AND amount < 0)) ORDER BY id DESC LIMIT 24",
  ).bind(shop.id).all<{ type: string; amount: number; note: string | null; created_at: string }>()).results;
  const starts = led.filter((l) => l.type !== "overage");
  const counts = starts.length
    ? await pdb.batch(starts.map((l, i) => {
      const end = i === 0 ? "9999-12-31" : starts[i - 1]!.created_at;
      return pdb.prepare("SELECT COUNT(*) n FROM ledger WHERE shop_id = ? AND type = 'plan_order' AND created_at >= ? AND created_at < ?").bind(shop.id, l.created_at, end);
    }))
    : [];
  const bills: BillRow[] = led.map((l) => {
    const i = starts.indexOf(l);
    return {
      kind: l.type as BillRow["kind"], start: l.created_at, end: i > 0 ? starts[i - 1]!.created_at : null, note: l.note ?? "", amount: l.amount,
      orders: i >= 0 ? ((counts[i]!.results[0] as { n: number }).n) : null, current: i === 0 && !trial,
    };
  });
  // ট্রায়াল (চলমান বা শেষ হওয়া) সবার নিচে
  const tr = await pdb.prepare("SELECT COUNT(*) n, MIN(created_at) a FROM ledger WHERE shop_id = ? AND type = 'trial_order'").bind(shop.id).first<{ n: number; a: string | null }>();
  if (trial || (tr && tr.n > 0)) {
    bills.push({ kind: "trial", start: shop.created_at, end: trial ? shop.trial_ends_at : starts.at(-1)?.created_at ?? null, note: "", amount: 0, orders: tr?.n ?? 0, current: trial });
  }

  const best = trial ? null : cheapestFor(plans, used);
  const saving = best && best.plan.key !== plan.key ? plan.price + overageCharge(plan, used) - best.cost : 0;
  return {
    trial, plan, cycleMonths: shop.cycle_months || 1,
    renewsAt: trial ? shop.trial_ends_at : plan.key === "free" ? shop.usage_reset_at : shop.next_bill_at,
    periodStart, periodEnd: trial ? shop.trial_ends_at : shop.usage_reset_at,
    used, limit, days, bills, saving: saving > 0 && best ? { name: best.plan.name, amount: saving } : null,
  };
}

async function renderBilling(c: Ctx, form?: { errors: Record<string, string>; values: Record<string, string> }) {
  const pdb = c.env.PLATFORM_DB;
  const shopId = c.env.SHOP_ID;
  const [fees, shop] = await Promise.all([platformSettings(pdb), billingShop(pdb, shopId)]);
  const [ledger, topups] = await pdb.batch([
    pdb.prepare("SELECT id, type, amount, balance_after, ref, note, created_at FROM ledger WHERE shop_id = ? AND applied = 1 AND type != 'plan_order' ORDER BY id DESC LIMIT 200").bind(shopId),
    pdb.prepare("SELECT id, amount, method, sender, trx_id, status, created_at FROM topups WHERE shop_id = ? ORDER BY id DESC LIMIT 20").bind(shopId),
  ]);
  const plan = shop ? <PlanPanel plans={plansForShop(fees, shop.created_at)} oldPrices={onOldPrices(fees, shop.created_at)} oldUntil={fees.old_prices_until} shop={shop} trial={c.var.shopState.status === "trial"} staffFee={toInt(fees.staff_fee, 49)} settings={fees} /> : null;
  const usage = shop ? <UsageOverview u={await loadUsage(pdb, shop, fees)} /> : null;
  return render(c, "বিলিং ও প্ল্যান", "billing",
    <BillingPage state={c.var.shopState} fees={fees} ledger={ledger!.results as LedgerRow[]} topups={topups!.results as TopupRow[]}
      usage={usage} plan={plan} errors={form?.errors} values={form?.values} />,
    form ? 422 : 200);
}

/* ---------- দোকান যাচাই (ইমেইল + মোবাইল) ---------- */
async function renderVerify(c: Ctx, otpSent = false) {
  const pdb = c.env.PLATFORM_DB;
  const [ps, shop] = await Promise.all([platformSettings(pdb), loadVerifyShop(c.env, c.env.SHOP_ID)]);
  // সাথে সাথে নতুন অবস্থা (Worker-এর cache ৩০ সেকেন্ড পুরনো হতে পারে)
  const state = { ...c.var.shopState, verify: { email: !!shop?.email_verified, phone: !!shop?.phone_verified } };
  return render(c, "দোকান যাচাই", "verify",
    <VerifyPage state={state} email={shop?.owner_email ?? ""} phone={shop?.owner_phone ?? ""} emailReady={!!c.env.EMAIL} smsReady={!!platformSms(ps)} phoneMode={phoneMode(ps)} support={ps.support_phone || undefined} otpSent={otpSent} />);
}
admin.get("/verify", (c) => renderVerify(c, c.req.query("sent") === "1"));
admin.post("/verify/email", async (c) => {
  const r = await sendEmailLink(c.env, c.env.SHOP_ID, new URL(c.req.url).origin);
  flash(c, r.ok ? "ok" : "error", r.message);
  return c.redirect("/admin/verify", 303);
});
admin.post("/verify/phone/send", async (c) => {
  const r = await sendPhoneOtp(c.env, c.env.SHOP_ID);
  flash(c, r.ok ? "ok" : "error", r.message);
  return c.redirect("/admin/verify?sent=1", 303);
});
admin.post("/verify/phone", async (c) => {
  const code = String((await c.req.parseBody()).code ?? "").replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
  const r = await confirmPhoneOtp(c.env, c.env.SHOP_ID, code);
  flash(c, r.ok ? "ok" : "error", r.message);
  if (r.ok) c.header("x-fshop-clear-cache", "1");
  return c.redirect(r.ok ? "/admin/verify" : "/admin/verify?sent=1", 303);
});

admin.get("/billing", (c) => renderBilling(c));

admin.post("/billing/plan", async (c) => {
  const b = await c.req.parseBody();
  const key = String(b.plan ?? "");
  const months = toInt(b.months, 1);
  if (!isPlan(key) || !isCycle(months)) {
    flash(c, "error", "প্ল্যান বাছুন।");
    return c.redirect("/admin/billing", 303);
  }
  const r = await changePlan(c.env.PLATFORM_DB, c.env.SHOP_ID, key, months, await platformSettings(c.env.PLATFORM_DB));
  clearShopCache();
  flash(c, r.ok ? "ok" : "error", r.message);
  return c.redirect("/admin/billing", 303);
});

admin.post("/billing/topup", async (c) => {
  const b = await c.req.parseBody();
  const fees = await platformSettings(c.env.PLATFORM_DB);
  const values = { method: str(b.method, 10), amount: str(b.amount, 10), sender: str(b.sender, 30), trx_id: str(b.trx_id, 30).toUpperCase() };
  const errors: Record<string, string> = {};
  const amount = toInt(values.amount, 0);
  const min = toInt(fees.min_topup, 100);
  if (amount < min || amount > 100000) errors.amount = `৳${min} থেকে ৳১,০০,০০০ এর মধ্যে দিন`;
  const bankOn = !!(fees.dbbl_account_no || "").trim();
  const method = values.method === "nagad" ? "nagad" : values.method === "dbbl" && bankOn ? "dbbl" : "bkash";
  // ব্যাংকে পাঠানোর অ্যাকাউন্ট নম্বর বা মোবাইল (DBBL Rocket/অ্যাপ) দুটোই চলে
  const sender = method === "dbbl" ? (normalizePhone(values.sender) || (/^[0-9][0-9 -]{5,24}$/.test(values.sender) ? values.sender.replace(/[ -]/g, "") : "")) : normalizePhone(values.sender);
  if (!sender) errors.sender = method === "dbbl" ? "যে অ্যাকাউন্ট বা মোবাইল থেকে পাঠিয়েছেন সেটা দিন" : "সঠিক নম্বর দিন";
  if (!(method === "dbbl" ? /^[A-Z0-9-]{4,30}$/ : /^[A-Z0-9]{6,30}$/).test(values.trx_id)) errors.trx_id = method === "dbbl" ? "সঠিক রেফারেন্স/Transaction নম্বর দিন" : "সঠিক Transaction ID দিন";
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
    <StaffPage users={results} me={c.var.admin!.id} fee={toInt(fees.staff_fee, 49)} trial={c.var.shopState.status === "trial"} errors={form?.errors} values={form?.values} />,
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

  // প্ল্যানের বাইরের স্টাফ হলে চলতি মাসের চার্জ (ট্রায়ালে নয়)
  const bshop = await billingShop(c.env.PLATFORM_DB, c.env.SHOP_ID);
  const fees = await platformSettings(c.env.PLATFORM_DB);
  const beyond = bshop ? extraStaff(planForShop(fees, bshop.created_at, bshop.plan), bshop.staff_count) > 0 : false;
  if (c.var.shopState.status !== "trial" && beyond) {
    const fee = toInt(fees.staff_fee, 49);
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
/** "দোকান দেখুন" আর অ্যাডমিনের সব "দেখুন" লিংক (নতুন ট্যাবে): ?to=/p/slug — নিজের ডোমেইন চালু থাকলে সেখানে */
admin.get("/view-shop", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.redirect(`${await storeOrigin(c)}${safeShopPath(c.req.query("to"))}`, 302);
});

/**
 * নিজের ডোমেইন যোগের আগে যা শেষ করতে হবে — Cloudflare-এ pending zone-এর সীমা আছে,
 * তাই শুধু সত্যিই চালু দোকানকে ডোমেইন যোগ করতে দেওয়া। শেষ ধাপ: সুপার অ্যাডমিন থেকে মোবাইল যাচাই।
 */
export type DomainStep = { key: string; label: string; desc: string; done: boolean; href?: string };
async function domainGate(c: Ctx): Promise<{ steps: DomainStep[]; ready: boolean }> {
  const s = c.var.settings;
  const [act, shop] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) n FROM products WHERE is_active = 1").first<{ n: number }>().catch(() => null),
    c.env.PLATFORM_DB.prepare("SELECT phone_verified FROM shops WHERE id = ?").bind(c.env.SHOP_ID).first<{ phone_verified: number | null }>().catch(() => null),
  ]);
  const steps: DomainStep[] = [
    { key: "info", label: "দোকানের নাম আর যোগাযোগ নম্বর", desc: "কাস্টমার যাতে আপনাকে চিনতে আর ফোন করতে পারেন", done: !!s.site_name && !!s.contact_phone && s.contact_phone !== "01700000000", href: "/admin/settings" },
    { key: "logo", label: "লোগো", desc: "দোকানের পরিচয়", done: !!s.logo, href: "/admin/settings/appearance" },
    { key: "pixel", label: "Facebook Pixel ID", desc: "শুরু থেকে অ্যাডের ডেটা জমাতে", done: !!s.fb_pixel_id, href: "/admin/settings/tracking" },
    { key: "product", label: "কমপক্ষে ১টা চালু পণ্য", desc: "পণ্য ছাড়া দোকান ফাঁকা দেখায়", done: (act?.n ?? 0) > 0, href: "/admin/products/new" },
    { key: "delivery", label: "ডেলিভারি চার্জ", desc: "ঢাকার ভিতরে আর বাইরে", done: !!s.delivery_inside && !!s.delivery_outside, href: "/admin/settings/delivery" },
    { key: "seo", label: "SEO টাইটেল আর ডেসক্রিপশন", desc: "Google আর ফেসবুক শেয়ারে সুন্দর দেখাতে", done: !!s.seo_title && !!s.seo_description, href: "/admin/settings/seo" },
    { key: "phone", label: "মোবাইল নম্বর যাচাই", desc: "SellxBD টিম আপনাকে ফোন করে যাচাই করবে — উপরের কাজ শেষ হলে সাপোর্টে জানান", done: shop?.phone_verified !== 0 },
  ];
  return { steps, ready: steps.every((x) => x.done) };
}

/** নিজের ডোমেইন পেজ — ডোমেইন কেনা (Porkbun) চালু থাকলে খোঁজার ফল আর কেনা ডোমেইনের তথ্যও */
async function renderDomain(c: Ctx, form?: { value: string; error: string }, search?: { q: string; offers: Offer[]; extra?: Offer[]; error?: string; notice?: string }) {
  const db = c.env.PLATFORM_DB;
  const [rows, gate, ps, reg, shop] = await Promise.all([
    shopDomains(db, c.env.SHOP_ID), domainGate(c), platformSettings(db), shopReg(db, c.env.SHOP_ID),
    db.prepare("SELECT balance FROM shops WHERE id = ?").bind(c.env.SHOP_ID).first<{ balance: number }>(),
  ]);
  const cfg = saleConfig(ps);
  const pb = porkbunFromEnv(c.env);
  const sale: DomainSaleView = {
    enabled: cfg.enabled && pb.configured, sandbox: pb.sandbox, balance: shop?.balance ?? 0, planOk: await domainPlanOk(c),
    q: search?.q, offers: search?.offers, extra: search?.extra, error: search?.error, notice: search?.notice, tlds: cfg.tlds,
    reg: reg ? { ...reg, renewBdt: reg.renew_cents ? bdtPrice(reg.renew_cents / 100, cfg) : null } : null,
  };
  return render(c, "ডোমেইন", "domains",
    <DomainPage domains={rows} freeUrl={freeShopUrl(c)} configured={cfFromEnv(c.env).configured} value={form?.value} error={form?.error} gate={gate} sale={sale} />,
    form ? 422 : 200);
}

/** নিজের ডোমেইন: ট্রায়াল বা যে প্ল্যানে ডোমেইন আছে */
async function domainPlanOk(c: Ctx): Promise<boolean> {
  if (c.var.shopState.status === "trial") return true;
  const bs = await billingShop(c.env.PLATFORM_DB, c.env.SHOP_ID);
  return !!bs && !!planForShop(await platformSettings(c.env.PLATFORM_DB), bs.created_at, bs.plan).domain;
}

admin.get("/domain", async (c) => {
  const q = str(c.req.query("q"), 80);
  if (!q) return renderDomain(c);
  const db = c.env.PLATFORM_DB;
  const cfg = saleConfig(await platformSettings(db));
  const pb = porkbunFromEnv(c.env);
  if (!cfg.enabled || !pb.configured) return renderDomain(c, undefined, { q, offers: [], error: pbError("NOT_CONFIGURED") });
  const cand = candidates(q, cfg);
  if (cand.error) return renderDomain(c, undefined, { q, offers: [], error: cand.error });
  // Porkbun-এর সীমা (মিনিটে ২০০টা নাম, পুরো অ্যাকাউন্টে) — এক দোকান মিনিটে ৬ বার খুঁজতে পারে
  if (!(await hitRateLimit(c.env.DB, "domain-search", 6, 60))) return renderDomain(c, undefined, { q, offers: [], error: pbError("RATE_LIMIT_EXCEEDED") });
  const extra = cfg.tlds.includes("com") ? variants(cand.base!).filter((n) => !cand.names.includes(n)) : [];
  const r = await pb.checkMany([...cand.names, ...extra].slice(0, 25));
  if (!r.ok) return renderDomain(c, undefined, { q, offers: [], error: pbError(r.code, r.message) });
  const pick = (names: string[]) => names.map((n) => r.results.find((x) => x.domain === n)).filter((x): x is PbCheck => !!x).map((x) => offerOf(x, cfg));
  const missing = r.unresolved.filter((n) => cand.names.includes(n));
  return renderDomain(c, undefined, { q, offers: pick(cand.names), extra: pick(extra), notice: missing.length ? `${missing.join(", ")} — এই মুহূর্তে উত্তর আসেনি, একটু পরে আবার খুঁজুন।` : undefined });
});

admin.post("/domain/buy", async (c) => {
  const body = await c.req.parseBody();
  const domain = str(body.domain, 260).toLowerCase();
  const gate = await domainGate(c);
  if (!gate.ready) return renderDomain(c, undefined, { q: domain, offers: [], error: "আগে নিচের সব কাজ শেষ করুন, তারপর ডোমেইন কেনা যাবে।" });
  if (!(await domainPlanOk(c))) return renderDomain(c, undefined, { q: domain, offers: [], error: "নিজের ডোমেইন ফ্রি প্ল্যানে নেই। বিলিং থেকে \"ছোট দোকান\" বা উপরের প্ল্যান নিন।" });
  const n = normalizeDomain(domain, c.env.PLATFORM_DOMAIN);
  if (!n.domain) return renderDomain(c, undefined, { q: domain, offers: [], error: n.error! });
  if (body.agree !== "1") return renderDomain(c, undefined, { q: domain, offers: [], error: "কেনার শর্তে টিক দিন।" });
  const r = await buyDomain(c.env.PLATFORM_DB, porkbunFromEnv(c.env), cfFromEnv(c.env), c.env.SHOP_ID, n.domain, toInt(body.bdt));
  if (!r.ok) return renderDomain(c, undefined, { q: n.domain, offers: r.refreshed ? [r.refreshed] : [], error: r.message });
  flash(c, "ok", r.message);
  return c.redirect("/admin/domain", 303);
});

admin.post("/domain/renew", async (c) => {
  const reg = await shopReg(c.env.PLATFORM_DB, c.env.SHOP_ID);
  if (!reg) return c.redirect("/admin/domain", 303);
  const r = await renewDomain(c.env.PLATFORM_DB, porkbunFromEnv(c.env), c.env.SHOP_ID, reg.domain);
  flash(c, r.ok ? "ok" : "error", r.message);
  return c.redirect("/admin/domain", 303);
});

admin.post("/domain/autorenew", async (c) => {
  const body = await c.req.parseBody();
  await c.env.PLATFORM_DB.prepare("UPDATE domain_regs SET auto_renew = ?, updated_at = datetime('now') WHERE shop_id = ? AND status IN ('active', 'expired')")
    .bind(body.on === "1" ? 1 : 0, c.env.SHOP_ID).run();
  flash(c, "ok", body.on === "1" ? "অটো-রিনিউ চালু — মেয়াদ শেষের আগে ব্যালেন্স থেকে নিজে রিনিউ হবে।" : "অটো-রিনিউ বন্ধ — মেয়াদ শেষের আগে নিজে রিনিউ করতে হবে।");
  return c.redirect("/admin/domain", 303);
});

/** কেনা ডোমেইন দোকান থেকে সরানো থাকলে (বা প্রথমবার বসাতে সমস্যা হলে) আবার যুক্ত করা */
admin.post("/domain/attach", async (c) => {
  const db = c.env.PLATFORM_DB;
  const reg = await shopReg(db, c.env.SHOP_ID);
  if (!reg || reg.status !== "active") return c.redirect("/admin/domain", 303);
  if (!(await shopDomains(db, c.env.SHOP_ID)).length) {
    const r = await addDomain(db, cfFromEnv(c.env), c.env.SHOP_ID, reg.domain);
    if (!r.ok) { flash(c, "error", r.message); return c.redirect("/admin/domain", 303); }
  }
  const ok = await pushNameservers(db, porkbunFromEnv(c.env), reg.domain);
  flash(c, ok ? "ok" : "error", ok ? `${reg.domain} দোকানে যুক্ত হয়েছে — কিছুক্ষণের মধ্যে চালু হবে।` : "নেমসার্ভার বসানো যায়নি — আমরা নিজে থেকে আবার চেষ্টা করব। দেরি হলে সাপোর্টে জানান।");
  return c.redirect("/admin/domain", 303);
});
// "/admin/domain" রোল-চেকে section "domain" — "domains"-এর মতোই মালিকের জন্য

admin.post("/domain", async (c) => {
  const body = await c.req.parseBody();
  const input = str(body.domain, 260);
  const gate = await domainGate(c);
  if (!gate.ready) return renderDomain(c, { value: input, error: "আগে নিচের সব কাজ শেষ করুন, তারপর ডোমেইন যোগ করা যাবে।" });
  if (body.owns !== "1") return renderDomain(c, { value: input, error: "ডোমেইন কেনা আছে আর প্যানেলে ঢুকতে পারেন — এই ঘরে টিক দিন।" });
  const n = normalizeDomain(input, c.env.PLATFORM_DOMAIN);
  if (!n.domain) return renderDomain(c, { value: input, error: n.error! });
  if (c.var.shopState.status !== "trial") {
    const bs = await billingShop(c.env.PLATFORM_DB, c.env.SHOP_ID);
    if (bs && !planForShop(await platformSettings(c.env.PLATFORM_DB), bs.created_at, bs.plan).domain) {
      return renderDomain(c, { value: input, error: "নিজের ডোমেইন ফ্রি প্ল্যানে নেই। বিলিং → \"ছোট দোকান\" বা উপরের প্ল্যান নিন (৳৩৯৯/মাস থেকে)।" });
    }
  }
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
  return (await c.env.DB.prepare("SELECT * FROM pages ORDER BY kind, sort_order, id DESC").all<PageRow>()).results;
}
function pageInput(b: Record<string, unknown>) {
  const v = {
    title: str(b.title, 80), slug: str(b.slug, 60).toLowerCase(), content: (typeof b.content === "string" ? b.content : "").slice(0, 20000),
    in_menu: b.in_menu ? 1 : 0, is_active: b.is_active ? 1 : 0, sort_order: toInt(b.sort_order, 0),
    kind: b.kind === "post" ? "post" : "page", excerpt: str(b.excerpt, 300) || null,
    image: /^(https:\/\/|\/)[^\s"'<>]{1,500}$/.test(str(b.image, 500)) ? str(b.image, 500) : null,
  };
  if (v.kind === "post") v.in_menu = 0;
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
  if (id) await c.env.DB.prepare("UPDATE pages SET title=?, slug=?, content=?, in_menu=?, is_active=?, sort_order=?, kind=?, excerpt=?, image=? WHERE id=?").bind(v.title, v.slug, v.content, v.in_menu, v.is_active, v.sort_order, v.kind, v.excerpt, v.image, id).run();
  else await c.env.DB.prepare("INSERT INTO pages (title, slug, content, in_menu, is_active, sort_order, kind, excerpt, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(v.title, v.slug, v.content, v.in_menu, v.is_active, v.sort_order, v.kind, v.excerpt, v.image).run();
  flash(c, "ok", v.kind === "post" ? "ব্লগ পোস্ট সেভ হয়েছে — /blog-এ দেখাবে।" : "পেজ সেভ হয়েছে।");
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
    "SELECT id, name, slug, price, image, is_active, updated_at, meta_title FROM products WHERE landing_json IS NOT NULL ORDER BY updated_at DESC, id DESC",
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
    // "AI দিয়ে লেখা বানান" বক্স বন্ধ (মালিকের সিদ্ধান্ত) — ai না দিলে এডিটরে দেখায় না
    <LandingBuilderPage product={p} landingJson={JSON.stringify(landing)} labels={SECTION_LABEL} custom={!!p.landing_json} products={await productChoices(c)} fonts={FONT_LABELS} />);
});

/* ---------- ল্যান্ডিং পেজের তথ্য: শিরোনাম, বিবরণ, লিংক ---------- */
type LandingInfoForm = { meta_title: string; meta_description: string; slug: string };

async function renderLandingInfo(c: Ctx, p: Product, form?: LandingInfoForm, errors: Record<string, string> = {}) {
  const v = form ?? { meta_title: p.meta_title ?? "", meta_description: p.meta_description ?? "", slug: p.slug };
  const { results } = await c.env.DB.prepare("SELECT old_slug FROM slug_redirects WHERE product_id = ? ORDER BY created_at DESC LIMIT 5").bind(p.id).all<{ old_slug: string }>();
  return render(c, "ল্যান্ডিং পেজের তথ্য", "landing",
    <LandingInfoPage product={p} v={v} errors={errors} origin={await storeOrigin(c)} oldSlugs={results.map((r) => r.old_slug).filter((x) => x !== p.slug)} />,
    Object.keys(errors).length ? 422 : 200);
}

admin.get("/products/:id{[0-9]+}/landing/info", async (c) => {
  const p = await productById(c, toInt(c.req.param("id")));
  if (!p) return c.redirect("/admin/landing", 303);
  return renderLandingInfo(c, p);
});

admin.post("/products/:id{[0-9]+}/landing/info", async (c) => {
  const db = c.env.DB;
  const p = await productById(c, toInt(c.req.param("id")));
  if (!p) return c.redirect("/admin/landing", 303);
  const b = await c.req.parseBody();
  const v: LandingInfoForm = {
    meta_title: str(b.meta_title, 100),
    meta_description: str(b.meta_description, 300),
    slug: slugify(str(b.slug, 100)),
  };
  const errors: Record<string, string> = {};
  if (!v.slug) errors.slug = "লিংকে ইংরেজি অক্ষর, সংখ্যা আর - দিন (যেমন period-panty)";
  else if (await db.prepare("SELECT id FROM products WHERE slug = ? AND id != ?").bind(v.slug, p.id).first()) errors.slug = "এই লিংক অন্য একটা পণ্যে ব্যবহার হচ্ছে — অন্য নাম দিন";
  if (Object.keys(errors).length) return renderLandingInfo(c, p, { ...v, slug: str(b.slug, 100) }, errors);
  await db.batch([
    db.prepare("UPDATE products SET meta_title = ?, meta_description = ?, slug = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(v.meta_title || null, v.meta_description || null, v.slug, p.id),
    ...slugChangeStatements(db, p.id, p.slug, v.slug),
  ]);
  flash(c, "ok", v.slug !== p.slug ? "সেভ হয়েছে। নতুন লিংক চালু — পুরনো লিংকে এলেও ভিজিটর নতুন পেজে চলে যাবে।" : "সেভ হয়েছে।");
  const back = c.req.query("from") === "builder" ? `/admin/products/${p.id}/landing` : "/admin/landing";
  return c.redirect(back, 303);
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
  const body = await c.req.parseBody();
  const landing = landingFromBody(body.landing_json);
  // বিল্ডারের নিজে থেকে সেভ (পেজ না বদলে)
  if (body.ajax === "1") {
    if (!landing) return c.json({ ok: false }, 400);
    await c.env.DB.prepare("UPDATE products SET landing_json = ?, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(landing), id).run();
    return c.json({ ok: true });
  }
  if (!landing) {
    flash(c, "error", "সেভ করা যায়নি, আবার চেষ্টা করুন");
  } else {
    await c.env.DB.prepare("UPDATE products SET landing_json = ?, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(landing), id).run();
    flash(c, "ok", "ল্যান্ডিং পেজ সেভ হয়েছে।");
  }
  return c.redirect(`/admin/products/${id}/landing`, 303);
});

/** AI দিয়ে ল্যান্ডিং পেজের লেখা — আগেরটা রেখে দেওয়া হয় (এক ক্লিকে ফেরা যায়) */
admin.post("/products/:id{[0-9]+}/landing/ai", async (c) => {
  const id = toInt(c.req.param("id"));
  const p = await productById(c, id);
  if (!p) return c.redirect("/admin/products", 303);
  const b = await c.req.parseBody();
  const about = str(b.about, 600);
  const tone = String(b.tone) in TONE_LABEL ? String(b.tone) : "friendly";
  if (about.length < 10) {
    flash(c, "error", "পণ্য সম্পর্কে অন্তত ১–২ লাইন লিখুন (কী দিয়ে বানানো, কার জন্য, কী সুবিধা)");
    return c.redirect(`/admin/products/${id}/landing`, 303);
  }
  const day = new Date().toISOString().slice(0, 10);
  if (!(await hitRateLimit(c.env.DB, `ai:${day}`, AI_SHOP_DAILY, 86400))) {
    flash(c, "error", `আজ AI দিয়ে ${bn(AI_SHOP_DAILY)} বার লেখা হয়ে গেছে — কাল আবার চেষ্টা করুন`);
    return c.redirect(`/admin/products/${id}/landing`, 303);
  }
  const copy = await generateCopy(c.env, c.var.settings, p, about, tone);
  if ("error" in copy) {
    flash(c, "error", copy.error);
    return c.redirect(`/admin/products/${id}/landing`, 303);
  }
  const current = parseLanding(p.landing_json) ?? defaultLanding(p);
  const next = applyCopy(current, copy);
  await saveSettings(c.env.DB, { [`ai_prev_landing_${id}`]: p.landing_json ?? "" , ai_last_about: about.slice(0, 600) });
  await c.env.DB.prepare("UPDATE products SET landing_json = ?, short_desc = COALESCE(NULLIF(short_desc, ''), ?), updated_at = datetime('now') WHERE id = ?")
    .bind(JSON.stringify(next), copy.subheadline || null, id).run();
  flash(c, "ok", "AI লেখা বসিয়েছে — দেখে দরকার মতো ঠিক করে নিন। পছন্দ না হলে \"আগের লেখায় ফিরুন\" চাপুন।");
  return c.redirect(`/admin/products/${id}/landing`, 303);
});

admin.post("/products/:id{[0-9]+}/landing/ai-undo", async (c) => {
  const id = toInt(c.req.param("id"));
  const key = `ai_prev_landing_${id}`;
  if (key in c.var.settings) {
    const prev = c.var.settings[key] || null;
    await c.env.DB.prepare("UPDATE products SET landing_json = ?, updated_at = datetime('now') WHERE id = ?").bind(prev, id).run();
    await c.env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
    flash(c, "ok", "আগের লেখায় ফেরানো হয়েছে।");
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
    <Layout title={`প্রিভিউ — ${p.name}`} settings={s} head={editor ? <style>{EDITOR_CSS}</style> : undefined}
      hideHeader={landing.style?.header === "hide"} hideFooter={landing.style?.footer === "hide"}>
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

/** ছবি আপলোড (বিল্ডার, মিডিয়া পিকার) — লাইব্রেরিতে নাম আর মাপসহ যায় */
admin.post("/upload-image", async (c) => {
  const b = await c.req.parseBody();
  const file = b.image;
  if (!(file instanceof File) || !file.size) return c.json({ message: "ছবি পাওয়া যায়নি" }, 400);
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return c.json({ message: "শুধু JPG, PNG বা WebP" }, 400);
  if (file.size > MAX_IMAGE) return c.json({ message: "ছবি ৩ MB-এর কম হতে হবে" }, 400);
  const key = newMediaKey(str(b.folder, 20) || "product", ext);
  await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, key), await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  await recordMedia(c.env.DB, key, { name: str(b.name, 120) || file.name, width: toInt(String(b.w ?? "")), height: toInt(String(b.h ?? "")) });
  return c.json({ key, url: `/img/${key}` });
});

/* ---------- মিডিয়া লাইব্রেরি ---------- */
const MEDIA_FOLDERS = [...Object.keys(FOLDER_LABEL), "unused"] as const;
const mediaFolderOf = (v: string | undefined) => ((MEDIA_FOLDERS as readonly string[]).includes(v || "") ? (v as MediaFolder | "unused") : "");

admin.get("/media", async (c) => {
  const folder = mediaFolderOf(c.req.query("folder"));
  const q = (c.req.query("q") || "").slice(0, 60);
  const page = Math.max(1, toInt(c.req.query("page"), 1));
  const r = await listMedia(c.env.DB, { folder, q, limit: 60, offset: (page - 1) * 60 });
  return render(c, "মিডিয়া", "media", <MediaPage {...r} folder={folder} q={q} page={page} limit={(c.var.shopState.storage_mb ?? 0) * 1024 * 1024} />);
});

/** পিকারের জন্য JSON */
admin.get("/media.json", async (c) => {
  const folder = mediaFolderOf(c.req.query("folder"));
  const r = await listMedia(c.env.DB, { folder, q: (c.req.query("q") || "").slice(0, 60), limit: 48, offset: Math.max(0, toInt(c.req.query("offset"), 0)) });
  return c.json({
    items: r.items.map((i) => ({ key: i.key, url: `/img/${i.key}`, name: i.name, w: i.width, h: i.height, size: i.size, folder: i.folder, used: i.used.length })),
    hasMore: r.hasMore,
  });
});

/** একসাথে অনেক ছবি আপলোড (মিডিয়া পেজ — জাভাস্ক্রিপ্ট ছাড়াও চলে) */
admin.post("/media/upload", async (c) => {
  const b = await c.req.parseBody({ all: true });
  const folder = str(b.folder, 20) || "product";
  const files = ([] as unknown[]).concat(b.files ?? []).filter((f): f is File => f instanceof File && f.size > 0).slice(0, 30);
  let ok = 0;
  const bad: string[] = [];
  for (const f of files) {
    const ext = IMAGE_TYPES[f.type];
    if (!ext || f.size > MAX_IMAGE) { bad.push(f.name); continue; }
    const key = newMediaKey(folder, ext);
    await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, key), await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
    await recordMedia(c.env.DB, key, { name: f.name });
    ok++;
  }
  flash(c, bad.length ? "error" : "ok", `${bn(ok)}টা ছবি যোগ হয়েছে।` + (bad.length ? ` হয়নি (JPG/PNG/WebP, ৩ MB-এর কম দিন): ${bad.slice(0, 3).join(", ")}` : ""));
  return c.redirect(`/admin/media${folder !== "product" ? `?folder=${folder}` : ""}`, 303);
});

admin.post("/media/update", async (c) => {
  const b = await c.req.parseBody();
  const key = str(b.key, 200);
  if (await mediaExists(c.env.DB, key)) {
    await c.env.DB.prepare("UPDATE images SET name = ?, alt = ? WHERE key = ?").bind(str(b.name, 120) || null, str(b.alt, 200) || null, key).run();
    flash(c, "ok", "ছবির তথ্য সেভ হয়েছে।");
  }
  return c.redirect(str(b.back, 300).startsWith("/admin/media") ? str(b.back, 300) : "/admin/media", 303);
});

admin.post("/media/delete", async (c) => {
  const b = await c.req.parseBody({ all: true });
  const keys = ([] as unknown[]).concat(b.keys ?? []).map((k) => str(k, 200)).slice(0, 100);
  let done = 0;
  const busy: string[] = [];
  for (const key of keys) {
    if (!(await mediaExists(c.env.DB, key))) continue;
    const used = await mediaUsage(c.env.DB, key);
    if (used.length) { busy.push(used[0]!); continue; }
    await c.env.IMAGES.delete(imageStorageKey(c.env.SHOP_ID, key));
    done++;
  }
  flash(c, busy.length ? "error" : "ok", `${bn(done)}টা ছবি মোছা হয়েছে।` + (busy.length ? ` ${bn(busy.length)}টা মোছা হয়নি — ব্যবহার হচ্ছে (${busy[0]})।` : ""));
  const back = str(b.back, 300);
  return c.redirect(back.startsWith("/admin/media") ? back : "/admin/media", 303);
});

/* ---------- রিপোর্ট (মালিক ও ম্যানেজার) ---------- */
/* ---------- অ্যাড ও ক্যাটালগ ---------- */
const activeProducts = async (c: Ctx) =>
  (await c.env.DB.prepare("SELECT id, name FROM products ORDER BY is_active DESC, sort_order, id LIMIT 500").all<{ id: number; name: string }>()).results;

admin.get("/ads", async (c) => {
  const r = resolveRange(c.req.query("range") || "30", c.req.query("from"), c.req.query("to"));
  const report = await adReport(c.env.DB, r, toInt(c.req.query("product")));
  return render(c, "অ্যাড ও ক্যাটালগ", "ads", <AdsPage r={report} s={c.var.settings} products={await activeProducts(c)} />);
});

admin.post("/ads/spend", async (c) => {
  const b = await c.req.parseBody();
  const day = str(b.day, 10);
  const raw = Number(str(b.amount, 15));
  const usd = b.currency === "usd";
  const amount = Math.round(usd ? raw * usdRate(c.var.settings) : raw);
  const pid = toInt(b.product_id) || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(raw) || raw <= 0 || amount > 100_000_000) {
    flash(c, "error", "সঠিক তারিখ আর খরচ লিখুন");
  } else {
    await c.env.DB.prepare("INSERT INTO ad_spend (day, amount, product_id, note, usd) VALUES (?, ?, ?, ?, ?)")
      .bind(day, amount, pid, str(b.note, 100) || null, usd ? Math.round(raw * 100) / 100 : null).run();
    flash(c, "ok", `খরচ যোগ হয়েছে: ${taka(amount)}`);
  }
  return c.redirect(c.req.header("referer")?.includes("/admin/ads") ? new URL(c.req.header("referer")!).pathname + new URL(c.req.header("referer")!).search : "/admin/ads", 303);
});

admin.post("/ads/spend/:id{[0-9]+}/delete", async (c) => {
  await c.env.DB.prepare("DELETE FROM ad_spend WHERE id = ?").bind(toInt(c.req.param("id"))).run();
  flash(c, "ok", "খরচ মুছে ফেলা হয়েছে।");
  return c.redirect(c.req.header("referer")?.includes("/admin/ads") ? new URL(c.req.header("referer")!).pathname + new URL(c.req.header("referer")!).search : "/admin/ads", 303);
});

admin.post("/ads/rate", async (c) => {
  const n = Number(str((await c.req.parseBody()).ad_usd_rate, 10));
  if (Number.isFinite(n) && n >= 50 && n <= 500) {
    await saveSettings(c.env.DB, { ad_usd_rate: String(Math.round(n * 2) / 2) });
    flash(c, "ok", "ডলারের রেট সেভ হয়েছে।");
  } else flash(c, "error", "রেট ৫০ থেকে ৫০০-এর মধ্যে দিন");
  return c.redirect("/admin/ads", 303);
});

admin.get("/ads/catalog", async (c) => {
  const origin = await storeOrigin(c);
  const { items, skipped } = await feedItems(c.env.DB, c.var.settings, origin);
  return render(c, "অ্যাড ও ক্যাটালগ", "ads",
    <CatalogPage s={c.var.settings} origin={origin} count={items.length} skipped={skipped} out={items.filter((i) => i.availability === "out of stock").length} />);
});

admin.post("/ads/catalog", async (c) => {
  const b = await c.req.parseBody();
  await saveSettings(c.env.DB, {
    feed_enabled: b.feed_enabled ? "1" : "0",
    feed_brand: str(b.feed_brand, 100),
    feed_link: b.feed_link === "product" ? "product" : "landing",
  });
  flash(c, "ok", "ফিডের সেটিংস সেভ হয়েছে।");
  return c.redirect("/admin/ads/catalog", 303);
});

/* ---------- ফোনে নোটিফিকেশন (Web Push) ---------- */
admin.post("/push/subscribe", async (c) => {
  const b = await c.req.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>().catch(() => ({} as never));
  const endpoint = String(b?.endpoint ?? "");
  const p256dh = String(b?.keys?.p256dh ?? "");
  const auth = String(b?.keys?.auth ?? "");
  if (!allowedEndpoint(endpoint) || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,30}$/.test(auth)) return c.json({ ok: false }, 400);
  await c.env.DB.prepare(
    `INSERT INTO push_subs (user_id, endpoint, p256dh, auth, ua) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).bind(c.var.admin!.id, endpoint, p256dh, auth, (c.req.header("user-agent") || "").slice(0, 200)).run();
  // বেশি পুরনো থাকলে ছাঁটা (দোকানে সর্বোচ্চ ২০টা ডিভাইস)
  await c.env.DB.prepare("DELETE FROM push_subs WHERE id NOT IN (SELECT id FROM push_subs ORDER BY id DESC LIMIT 20)").run();
  return c.json({ ok: true });
});

admin.post("/push/unsubscribe", async (c) => {
  const b = await c.req.json<{ endpoint?: string }>().catch(() => ({} as never));
  await c.env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(String(b?.endpoint ?? "")).run();
  return c.json({ ok: true });
});

admin.post("/push/test", async (c) => {
  if (!(await hitRateLimit(c.env.DB, "push-test", 5, 60))) return c.json({ ok: false, sent: 0 }, 429);
  const sent = await pushToShop(c.env.DB, c.env.PLATFORM_DB, { title: "টেস্ট নোটিফিকেশন ✓", body: `${c.var.settings.site_name || "দোকান"} — নতুন অর্ডার এলে এভাবে জানাবে`, url: "/admin/orders", tag: "test" });
  return c.json({ ok: sent > 0, sent });
});

/* ---------- রিভিউ ---------- */
admin.get("/reviews", async (c) => {
  const q = c.req.query("status") || "pending";
  const status = (q in REVIEW_TABS ? q : "pending") as ReviewStatus;
  const [rows, counts] = await Promise.all([adminReviews(c.env.DB, status), reviewCounts(c.env.DB)]);
  return render(c, "রিভিউ", "reviews", <ReviewsAdminPage rows={rows} status={status} counts={counts} enabled={c.var.settings.reviews_enabled !== "0"} link={`${await storeOrigin(c)}/review`} />);
});

admin.post("/reviews/settings", async (c) => {
  await saveSettings(c.env.DB, { reviews_enabled: (await c.req.parseBody()).reviews_enabled ? "1" : "0" });
  flash(c, "ok", "সেভ হয়েছে।");
  return c.redirect("/admin/reviews", 303);
});

admin.post("/reviews/:id{[0-9]+}", async (c) => {
  const id = toInt(c.req.param("id"));
  const b = await c.req.parseBody();
  const row = await c.env.DB.prepare("SELECT product_id, status, image FROM reviews WHERE id = ?").bind(id).first<{ product_id: number; status: string; image: string | null }>();
  if (!row) return c.redirect("/admin/reviews", 303);
  const to = String(b.status);
  if (to === "delete") {
    await c.env.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
    if (row.image) await c.env.IMAGES.delete(imageStorageKey(c.env.SHOP_ID, row.image)).catch(() => {});
    flash(c, "ok", "রিভিউ মুছে ফেলা হয়েছে।");
  } else if (to === "approved" || to === "hidden") {
    await c.env.DB.prepare("UPDATE reviews SET status = ?, reply = ? WHERE id = ?").bind(to, str(b.reply, 500) || null, id).run();
    flash(c, "ok", to === "approved" ? "রিভিউ দোকানে দেখাচ্ছে।" : "রিভিউ লুকানো হলো।");
  }
  await refreshRating(c.env.DB, row.product_id);
  return c.redirect(`/admin/reviews?status=${row.status}`, 303);
});

/* ---------- লাভের হিসাব ---------- */
admin.get("/profit", async (c) => {
  const r = resolveRange(c.req.query("range") || "30", c.req.query("from"), c.req.query("to"));
  return render(c, "লাভের হিসাব", "profit", <ProfitPage r={await profitReport(c.env.DB, c.var.settings, r)} />);
});

admin.post("/profit/settings", async (c) => {
  const b = await c.req.parseBody();
  const v = (k: string, max: number) => String(Math.max(0, Math.min(max, Number(str(b[k], 10)) || 0)));
  await saveSettings(c.env.DB, {
    profit_ship_inside: v("profit_ship_inside", 5000), profit_ship_outside: v("profit_ship_outside", 5000),
    profit_return_cost: v("profit_return_cost", 5000), profit_cod_pct: v("profit_cod_pct", 10),
  });
  flash(c, "ok", "খরচের হিসাব সেভ হয়েছে।");
  return c.redirect(c.req.header("referer")?.includes("/admin/profit") ? new URL(c.req.header("referer")!).pathname + new URL(c.req.header("referer")!).search : "/admin/profit", 303);
});

admin.get("/reports", async (c) => {
  const r = resolveRange(c.req.query("range"), c.req.query("from"), c.req.query("to"));
  return render(c, "রিপোর্ট", "reports", <ReportsPage r={await buildReport(c.env.DB, r)} />);
});

/* ---------- সাপোর্ট (টিকেট + লাইভ চ্যাট) ---------- */
registerSupport(admin, render, flash);
