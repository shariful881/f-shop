import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { PCtx, PEnv } from "./lib";
import {
  createSuperSession, destroySuperSession, platformRateLimit, shopUrl, slugTaken, superFromCookie, SUPER_COOKIE, validateSlug,
} from "./lib";
import {
  HomePage, PLATFORM_NAME, PLayout, SignupPage, SuperBillingPanel, SuperLoginPage, SuperSettingsPage, SuperShopPage, SuperShopsPage, SuperTopupsPage,
  type PFlash, type ShopListRow, type SuperLedgerRow, type SuperTopupRow,
} from "./views";
import { applyLedger, approveTopup, clearSettingsCache, num, platformSettings } from "./billing";
import { sameOriginPost, securityHeaders } from "../shop/middleware/base";
import { clientIp, isHttps, str, toInt } from "../shop/lib/http";
import { normalizePhone } from "../shop/lib/phone";
import { hashPassword, verifyPassword } from "../shop/lib/auth";
import { clearShopCache } from "./resolve";

/** প্ল্যাটফর্মের অ্যাপ: ourdomain.com — হোম, সাইনআপ, সুপার অ্যাডমিন */
export const platformApp = new Hono<PEnv>();

platformApp.use("*", securityHeaders, sameOriginPost);

const html = (c: PCtx, node: unknown, status: 200 | 404 | 422 | 429 = 200) => {
  c.header("Cache-Control", "no-store");
  return c.html("<!DOCTYPE html>" + String(node), status);
};

platformApp.get("/health", async (c) => {
  const row = await c.env.PLATFORM_DB.prepare("SELECT COUNT(*) AS n FROM shops").first<{ n: number }>();
  return c.json({ ok: true, shops: row?.n ?? 0 });
});

const publicNav = (
  <>
    <a href="/signup">দোকান খুলুন</a>
  </>
);

platformApp.get("/", (c) =>
  html(c, <PLayout title={`${PLATFORM_NAME} — নিজের অনলাইন দোকান`} nav={publicNav}><HomePage devMode={c.env.DEV_MODE === "1"} /></PLayout>));

/* ---------- সাইনআপ ---------- */
platformApp.get("/signup", (c) =>
  html(c, <PLayout title="দোকান খুলুন" nav={publicNav}><SignupPage domain={c.env.PLATFORM_DOMAIN} /></PLayout>));

/** লাইভ চেক: ঠিকানাটি খালি আছে কি না */
platformApp.get("/signup/check", async (c) => {
  const slug = (c.req.query("slug") || "").trim().toLowerCase();
  const err = validateSlug(slug);
  if (err) return c.json({ ok: false, message: err });
  if (await slugTaken(c.env, slug)) return c.json({ ok: false, message: "এই ঠিকানা আগেই নেওয়া হয়েছে" });
  return c.json({ ok: true, message: `${slug}.${c.env.PLATFORM_DOMAIN} খালি আছে ✓` });
});

platformApp.post("/signup", async (c) => {
  const b = await c.req.parseBody();
  const values: Record<string, string> = {
    shop_name: str(b.shop_name, 60),
    slug: str(b.slug, 30).toLowerCase(),
    owner_name: str(b.owner_name, 60),
    phone: str(b.phone, 30),
    email: str(b.email, 120).toLowerCase(),
    seed_demo: b.seed_demo ? "1" : "0",
  };
  const password = typeof b.password === "string" ? b.password : "";
  const fail = (errors: Record<string, string>, alert?: string, status: 422 | 429 = 422) =>
    html(c, <PLayout title="দোকান খুলুন" nav={publicNav}><SignupPage domain={c.env.PLATFORM_DOMAIN} values={values} errors={errors} alert={alert} /></PLayout>, status);

  if (!(await platformRateLimit(c.env, `signup:${clientIp(c)}`, 5, 3600))) {
    return fail({}, "এক ঘণ্টায় অনেকবার চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।", 429);
  }

  const errors: Record<string, string> = {};
  if (values.shop_name!.length < 2) errors.shop_name = "দোকানের নাম লিখুন";
  const slugErr = validateSlug(values.slug!);
  if (slugErr) errors.slug = slugErr;
  else if (await slugTaken(c.env, values.slug!)) errors.slug = "এই ঠিকানা আগেই নেওয়া হয়েছে";
  if (values.owner_name!.length < 2) errors.owner_name = "আপনার নাম লিখুন";
  const phone = normalizePhone(values.phone);
  if (!phone) errors.phone = "সঠিক মোবাইল নম্বর লিখুন";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email!)) errors.email = "সঠিক ইমেইল লিখুন";
  if (password.length < 8) errors.password = "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে";
  if (Object.keys(errors).length) return fail(errors);

  const id = crypto.randomUUID();
  const ps = await platformSettings(c.env.PLATFORM_DB);
  try {
    await c.env.PLATFORM_DB.prepare(
      `INSERT INTO shops (id, slug, name, owner_name, owner_phone, owner_email, status, trial_ends_at, trial_orders_left)
       VALUES (?, ?, ?, ?, ?, ?, 'trial', datetime('now', '+' || ? || ' days'), ?)`,
    ).bind(id, values.slug, values.shop_name, values.owner_name, phone, values.email, num(ps, "trial_days", 14), num(ps, "trial_orders", 50)).run();
  } catch {
    return fail({ slug: "এই ঠিকানা আগেই নেওয়া হয়েছে" });
  }

  // দোকানের নিজস্ব ডাটাবেস সাজানো + মালিকের লগইন
  const token = await c.env.SHOP.getByName(id).setupShop({
    shopId: id,
    shopName: values.shop_name!,
    ownerName: values.owner_name!,
    ownerEmail: values.email!,
    ownerPhone: phone!,
    passwordHash: await hashPassword(password),
    seedDemo: values.seed_demo === "1",
  });
  clearShopCache();
  return c.redirect(shopUrl(c.env, values.slug!, `/admin/auto-login?t=${token}`), 303);
});

/* ---------- সুপার অ্যাডমিন ---------- */
function takeFlash(c: PCtx): PFlash {
  const raw = getCookie(c, "sflash");
  if (!raw) return null;
  deleteCookie(c, "sflash", { path: "/super" });
  try { return JSON.parse(decodeURIComponent(raw)); } catch { return null; }
}
function flash(c: PCtx, type: "ok" | "error", text: string) {
  setCookie(c, "sflash", encodeURIComponent(JSON.stringify({ type, text })), { path: "/super", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 });
}

const superNav = (
  <>
    <a href="/super">দোকান</a>
    <a href="/super/topups">রিচার্জ</a>
    <a href="/super/settings">সেটিংস</a>
    <form method="post" action="/super/logout" class="inline"><button class="btn-link">লগআউট</button></form>
  </>
);

export const superPage = (c: PCtx, title: string, body: unknown, status: 200 | 404 | 422 = 200) =>
  html(c, <PLayout title={title} admin nav={superNav} flash={takeFlash(c)}>{body as any}</PLayout>, status);

platformApp.get("/super/login", (c) => html(c, <PLayout title="সুপার অ্যাডমিন" admin><SuperLoginPage /></PLayout>));

platformApp.post("/super/login", async (c) => {
  const b = await c.req.parseBody();
  const email = str(b.email, 120).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const fail = (msg: string) => html(c, <PLayout title="সুপার অ্যাডমিন" admin><SuperLoginPage error={msg} email={email} /></PLayout>, 422);
  if (!(await platformRateLimit(c.env, `superlogin:${clientIp(c)}`, 10, 900))) return fail("অনেকবার চেষ্টা হয়েছে, ১৫ মিনিট পরে চেষ্টা করুন");
  const admin = await c.env.PLATFORM_DB.prepare("SELECT id, password_hash FROM super_admins WHERE email = ?").bind(email).first<{ id: number; password_hash: string }>();
  if (!admin || !(await verifyPassword(password, admin.password_hash))) return fail("ইমেইল বা পাসওয়ার্ড ভুল");
  setCookie(c, SUPER_COOKIE, await createSuperSession(c.env, admin.id), { path: "/", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 * 60 * 24 * 7 });
  return c.redirect("/super", 303);
});

platformApp.post("/super/logout", async (c) => {
  await destroySuperSession(c.env, getCookie(c, SUPER_COOKIE));
  deleteCookie(c, SUPER_COOKIE, { path: "/" });
  return c.redirect("/super/login", 303);
});

platformApp.use("/super/*", async (c, next) => {
  if (c.req.path === "/super/login") return next();
  const admin = await superFromCookie(c);
  if (!admin) return c.redirect("/super/login", 303);
  c.set("superAdmin", admin);
  c.header("X-Robots-Tag", "noindex");
  await next();
});
platformApp.use("/super", async (c, next) => {
  const admin = await superFromCookie(c);
  if (!admin) return c.redirect("/super/login", 303);
  c.set("superAdmin", admin);
  await next();
});

const SHOP_SELECT = `SELECT s.*, (SELECT group_concat(hostname, ', ') FROM domains d WHERE d.shop_id = s.id) AS domains FROM shops s`;

platformApp.get("/super", async (c) => {
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const status = ["trial", "active", "suspended", "closed"].includes(c.req.query("status") || "") ? c.req.query("status")! : "";
  const { results: cr } = await c.env.PLATFORM_DB.prepare("SELECT status, COUNT(*) n FROM shops GROUP BY status").all<{ status: string; n: number }>();
  const counts = Object.fromEntries(cr.map((r) => [r.status, r.n]));
  let where = "1=1";
  const binds: unknown[] = [];
  if (status) { where += " AND s.status = ?"; binds.push(status); }
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const phone = normalizePhone(q);
    where += ` AND (s.name LIKE ? OR s.slug LIKE ? OR s.owner_phone LIKE ? OR s.owner_email LIKE ? OR s.id IN (SELECT shop_id FROM domains WHERE hostname LIKE ?)${phone ? " OR s.owner_phone = ?" : ""})`;
    binds.push(like, like, like, like, like, ...(phone ? [phone] : []));
  }
  const { results } = await c.env.PLATFORM_DB.prepare(`${SHOP_SELECT} WHERE ${where} ORDER BY s.created_at DESC LIMIT 200`).bind(...binds).all<ShopListRow>();
  return superPage(c, "দোকান", <SuperShopsPage shops={results} counts={counts} q={q} status={status} shopLink={(slug) => shopUrl(c.env, slug)} />);
});

export async function loadShop(c: PCtx, id: string) {
  return c.env.PLATFORM_DB.prepare(`${SHOP_SELECT} WHERE s.id = ?`).bind(id).first<ShopListRow>();
}

platformApp.get("/super/shops/:id", async (c) => {
  const shop = await loadShop(c, c.req.param("id"));
  if (!shop) return superPage(c, "পাওয়া যায়নি", <p class="empty">দোকান পাওয়া যায়নি</p>, 404);
  const { results: domains } = await c.env.PLATFORM_DB.prepare("SELECT hostname, status FROM domains WHERE shop_id = ? ORDER BY hostname").bind(shop.id).all<{ hostname: string; status: string }>();
  const billing = await c.env.PLATFORM_DB.prepare("SELECT id, balance, next_bill_at, staff_count, low_balance_since FROM shops WHERE id = ?").bind(shop.id)
    .first<{ id: string; balance: number; next_bill_at: string | null; staff_count: number; low_balance_since: string | null }>();
  const { results: ledger } = await c.env.PLATFORM_DB.prepare(
    "SELECT id, type, amount, balance_after, note, created_at FROM ledger WHERE shop_id = ? AND applied = 1 ORDER BY id DESC LIMIT 50",
  ).bind(shop.id).all<SuperLedgerRow>();
  return superPage(c, shop.name,
    <SuperShopPage shop={shop} domains={domains} shopLink={shopUrl(c.env, shop.slug)} extra={<SuperBillingPanel shop={billing!} ledger={ledger} />} />);
});

platformApp.post("/super/shops/:id/status", async (c) => {
  const id = c.req.param("id");
  const status = str((await c.req.parseBody()).status, 20);
  if (!["trial", "active", "suspended", "closed"].includes(status)) return c.redirect(`/super/shops/${id}`, 303);
  await c.env.PLATFORM_DB.prepare("UPDATE shops SET status = ? WHERE id = ?").bind(status, id).run();
  clearShopCache();
  flash(c, "ok", "দোকানের স্ট্যাটাস বদলেছে।");
  return c.redirect(`/super/shops/${id}`, 303);
});

platformApp.post("/super/shops/:id/extend-trial", async (c) => {
  const id = c.req.param("id");
  const days = Math.min(90, Math.max(1, toInt((await c.req.parseBody()).days, 7)));
  await c.env.PLATFORM_DB.prepare(
    `UPDATE shops SET trial_ends_at = datetime(MAX(COALESCE(trial_ends_at, datetime('now')), datetime('now')), '+' || ? || ' days'),
       status = CASE WHEN status = 'suspended' THEN 'trial' ELSE status END WHERE id = ?`,
  ).bind(days, id).run();
  clearShopCache();
  flash(c, "ok", `ট্রায়াল ${days} দিন বাড়ানো হয়েছে।`);
  return c.redirect(`/super/shops/${id}`, 303);
});

platformApp.post("/super/shops/:id/adjust", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.parseBody();
  const amount = toInt(b.amount, 0);
  const note = str(b.note, 200);
  if (amount && note) {
    await applyLedger(c.env.PLATFORM_DB, id, "adjust", amount, `adjust:${crypto.randomUUID()}`, `সমন্বয়: ${note}`);
    clearShopCache();
    flash(c, "ok", "ব্যালেন্স সমন্বয় হয়েছে।");
  }
  return c.redirect(`/super/shops/${id}`, 303);
});

/* রিচার্জ */
const TOPUP_SELECT = "SELECT t.*, s.name AS shop_name, s.slug FROM topups t JOIN shops s ON s.id = t.shop_id";

platformApp.get("/super/topups", async (c) => {
  const [p, r] = await c.env.PLATFORM_DB.batch([
    c.env.PLATFORM_DB.prepare(`${TOPUP_SELECT} WHERE t.status = 'pending' ORDER BY t.id`),
    c.env.PLATFORM_DB.prepare(`${TOPUP_SELECT} WHERE t.status != 'pending' ORDER BY t.id DESC LIMIT 50`),
  ]);
  return superPage(c, "রিচার্জ", <SuperTopupsPage pending={p!.results as SuperTopupRow[]} recent={r!.results as SuperTopupRow[]} />);
});

platformApp.post("/super/topups/:id/approve", async (c) => {
  const res = await approveTopup(c.env.PLATFORM_DB, toInt(c.req.param("id")));
  clearShopCache();
  flash(c, res.ok ? "ok" : "error", res.message);
  return c.redirect("/super/topups", 303);
});

platformApp.post("/super/topups/:id/reject", async (c) => {
  await c.env.PLATFORM_DB.prepare("UPDATE topups SET status = 'rejected', decided_at = datetime('now') WHERE id = ? AND status = 'pending'").bind(toInt(c.req.param("id"))).run();
  flash(c, "ok", "অনুরোধ বাতিল হয়েছে।");
  return c.redirect("/super/topups", 303);
});

/* প্ল্যাটফর্ম সেটিংস */
const NUM_KEYS = ["order_fee", "monthly_fee", "staff_fee", "min_topup", "trial_days", "trial_orders", "grace_days"];
const TEXT_KEYS = ["bkash_number", "nagad_number", "support_phone"];

platformApp.get("/super/settings", async (c) =>
  superPage(c, "সেটিংস", <SuperSettingsPage s={await platformSettings(c.env.PLATFORM_DB, true)} />));

platformApp.post("/super/settings", async (c) => {
  const b = await c.req.parseBody();
  const stmts = [
    ...NUM_KEYS.map((k) => [k, String(Math.max(0, toInt(b[k], 0)))]),
    ...TEXT_KEYS.map((k) => [k, str(b[k], 30)]),
  ].map(([k, v]) =>
    c.env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v),
  );
  await c.env.PLATFORM_DB.batch(stmts);
  clearSettingsCache();
  flash(c, "ok", "সেটিংস সেভ হয়েছে।");
  return c.redirect("/super/settings", 303);
});

export const unknownHostPage = () =>
  new Response(
    `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>দোকান পাওয়া যায়নি</title><link rel="stylesheet" href="/css/app.css"></head>
<body><main class="wrap narrow empty"><h1>এই ঠিকানায় কোনো দোকান নেই</h1><p class="muted">ঠিকানাটি আবার দেখুন।</p></main></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
