import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { PCtx, PEnv } from "./lib";
import {
  createSuperSession, destroySuperSession, platformRateLimit, shopUrl, slugTaken, superFromCookie, SUPER_COOKIE, validateSlug,
} from "./lib";
import { HomePage, PLATFORM_NAME, PLayout, SignupPage, SuperLoginPage, SuperSetupPage } from "./views";
import { num, platformSettings } from "./billing";
import { AboutPage, ContactPage, PlatformNotFoundPage, HelpArticlePage, HelpIndexPage, PricingPage, PrivacyPage, PublicNav, RefundPage, SiteFooter, TermsPage, type Fees } from "./pages";
import { helpBySlug } from "./help";
import { superApp } from "./super";
import { sameOriginPost, securityHeaders } from "../shop/middleware/base";
import { logError } from "./errors";
import { plans, TRIAL_PLAN } from "./plans";
import { errorPageHtml } from "../shop/lib/error-page";
import { clientIp, isHttps, str, toInt } from "../shop/lib/http";
import { normalizePhone } from "../shop/lib/phone";
import { hashPassword, verifyPassword } from "../shop/lib/auth";
import { clearShopCache } from "./resolve";
import { nicheByKey } from "../shop/lib/niches";

/** প্ল্যাটফর্মের অ্যাপ: ourdomain.com — হোম, সাইনআপ, সুপার অ্যাডমিন */
export const platformApp = new Hono<PEnv>();

platformApp.use("*", securityHeaders, sameOriginPost);
platformApp.onError(async (err, c) => {
  console.error(err);
  await logError(c.env.PLATFORM_DB, { method: c.req.method, path: new URL(c.req.url).pathname, err });
  return c.html(errorPageHtml("platform"), 500);
});

const html = (c: PCtx, node: unknown, status: 200 | 404 | 422 | 429 = 200) => {
  c.header("Cache-Control", "no-store");
  return c.html("<!DOCTYPE html>" + String(node), status);
};

platformApp.get("/health", async (c) => {
  const row = await c.env.PLATFORM_DB.prepare("SELECT COUNT(*) AS n FROM shops").first<{ n: number }>();
  return c.json({ ok: true, shops: row?.n ?? 0 });
});

const publicNav = <PublicNav />;

/** দাম আর সাপোর্ট নম্বর (সুপার অ্যাডমিনের সেটিংস থেকে) */
async function loadFees(c: PCtx): Promise<Fees> {
  const s = await platformSettings(c.env.PLATFORM_DB);
  const support = /^01[3-9]\d{8}$/.test(s.support_phone || "") ? s.support_phone! : "";
  return { plans: plans(s), staff: num(s, "staff_fee", 49), trialDays: num(s, "trial_days", 14), trialOrders: num(s, "trial_orders", 1500), support };
}

/** পাবলিক পেজ: মেনু + পেজ + ফুটার */
const publicPage = async (c: PCtx, title: string, body: (f: Fees) => Child, status: 200 | 404 = 200) => {
  const f = await loadFees(c);
  return html(c, <PLayout title={`${title} — ${PLATFORM_NAME}`} nav={publicNav}>{body(f)}<SiteFooter support={f.support} /></PLayout>, status);
};

platformApp.get("/pricing", (c) => publicPage(c, "দাম ও হিসাব", (f) => <PricingPage f={f} />));
platformApp.get("/about", (c) => publicPage(c, "আমাদের সম্পর্কে", (f) => <AboutPage f={f} />));
platformApp.get("/contact", (c) => publicPage(c, "যোগাযোগ", (f) => <ContactPage f={f} />));
platformApp.get("/terms", (c) => publicPage(c, "শর্তাবলি", (f) => <TermsPage f={f} />));
platformApp.get("/privacy", (c) => publicPage(c, "প্রাইভেসি নীতি", () => <PrivacyPage />));
platformApp.get("/refund", (c) => publicPage(c, "রিফান্ড নীতি", () => <RefundPage />));
platformApp.notFound((c) => publicPage(c as PCtx, "পাওয়া যায়নি", () => <PlatformNotFoundPage />, 404));
platformApp.get("/help", (c) => publicPage(c, "হেল্প সেন্টার", () => <HelpIndexPage q={(c.req.query("q") || "").slice(0, 60)} />));
platformApp.get("/help/:slug{[a-z0-9-]+}", (c) => {
  const a = helpBySlug(c.req.param("slug"));
  if (!a) return c.redirect("/help", 302);
  return publicPage(c, a.title, () => <HelpArticlePage a={a} />);
});

async function demoLinks(c: PCtx) {
  const { results } = await c.env.PLATFORM_DB.prepare("SELECT slug, demo_niche FROM shops WHERE demo_niche IS NOT NULL AND status = 'active'").all<{ slug: string; demo_niche: string }>();
  return results.flatMap((r) => {
    const n = nicheByKey(r.demo_niche);
    return n ? [{ key: n.key, niche: n.niche, name: n.name, url: shopUrl(c.env, r.slug) }] : [];
  });
}

platformApp.get("/", async (c) => {
  const fees = await loadFees(c);
  return html(c, <PLayout title={`${PLATFORM_NAME} — ফেসবুক সেলারদের নিজের অনলাইন দোকান`} nav={publicNav}><HomePage devMode={c.env.DEV_MODE === "1"} fees={fees} demos={await demoLinks(c)} /></PLayout>);
});

/* ---------- সাইনআপ ---------- */
platformApp.get("/signup", (c) => {
  const niche = nicheByKey(c.req.query("niche"))?.key ?? "";
  return html(c, <PLayout title="দোকান খুলুন" nav={publicNav}><SignupPage domain={c.env.PLATFORM_DOMAIN} values={niche ? { niche } : undefined} /></PLayout>);
});

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
    niche: nicheByKey(str(b.niche, 30))?.key ?? "",
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
      `INSERT INTO shops (id, slug, name, owner_name, owner_phone, owner_email, status, trial_ends_at, trial_orders_left, niche, plan, usage_reset_at)
       VALUES (?, ?, ?, ?, ?, ?, 'trial', datetime('now', '+' || ? || ' days'), ?, ?, ?, datetime('now', '+1 month'))`,
    ).bind(id, values.slug, values.shop_name, values.owner_name, phone, values.email, num(ps, "trial_days", 14), num(ps, "trial_orders", 1500), values.niche || null, TRIAL_PLAN).run();
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
    niche: values.niche || undefined,
  });
  // নিশের নমুনা পণ্যে ডেমো দোকানের ছবি কপি (ডেমো না থাকলে বা ভুল হলে ছবি ছাড়াই চলবে)
  if (values.niche && values.seed_demo === "1") {
    try {
      const demo = await c.env.PLATFORM_DB.prepare("SELECT id FROM shops WHERE demo_niche = ?").bind(values.niche).first<{ id: string }>();
      if (demo) {
        const images = await c.env.SHOP.getByName(demo.id).exportNicheImages();
        if (images.length) await c.env.SHOP.getByName(id).importNicheImages(id, images);
      }
    } catch (err) { console.error("niche images", err); }
  }
  clearShopCache();
  return c.redirect(shopUrl(c.env, values.slug!, `/admin/auto-login?t=${token}`), 303);
});

/* ---------- সুপার অ্যাডমিন ---------- */
platformApp.get("/super/login", (c) => html(c, <PLayout title="সুপার অ্যাডমিন" admin><SuperLoginPage /></PLayout>));

platformApp.post("/super/login", async (c) => {
  const b = await c.req.parseBody();
  const email = str(b.email, 120).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const fail = (msg: string) => html(c, <PLayout title="সুপার অ্যাডমিন" admin><SuperLoginPage error={msg} email={email} /></PLayout>, 422);
  if (!(await platformRateLimit(c.env, `superlogin:${clientIp(c)}`, 10, 900))) return fail("অনেকবার চেষ্টা হয়েছে, ১৫ মিনিট পরে চেষ্টা করুন");
  const admin = await c.env.PLATFORM_DB.prepare("SELECT id, password_hash FROM super_admins WHERE email = ? AND active = 1").bind(email).first<{ id: number; password_hash: string }>();
  if (!admin || !(await verifyPassword(password, admin.password_hash))) return fail("ইমেইল বা পাসওয়ার্ড ভুল");
  await c.env.PLATFORM_DB.batch([
    c.env.PLATFORM_DB.prepare("UPDATE super_admins SET last_login_at = datetime('now') WHERE id = ?").bind(admin.id),
    c.env.PLATFORM_DB.prepare("INSERT INTO audit_log (admin_id, admin_email, action, ip) VALUES (?, ?, 'login', ?)").bind(admin.id, email, clientIp(c)),
  ]);
  setCookie(c, SUPER_COOKIE, await createSuperSession(c.env, admin.id), { path: "/", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 * 60 * 24 * 7 });
  return c.redirect("/super", 303);
});

platformApp.post("/super/logout", async (c) => {
  await destroySuperSession(c.env, getCookie(c, SUPER_COOKIE));
  deleteCookie(c, SUPER_COOKIE, { path: "/" });
  return c.redirect("/super/login", 303);
});

/**
 * প্রথম সুপার অ্যাডমিন: কেউ না থাকলে, আর platform_settings-এ রাখা এককালীন setup কোড মিললে।
 * কাজ শেষে কোড মুছে যায়।
 */
async function setupAllowed(c: PCtx, code: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{24,}$/.test(code)) return false;
  const db = c.env.PLATFORM_DB;
  const [admins, row] = await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM super_admins").first<{ n: number }>(),
    db.prepare("SELECT value FROM platform_settings WHERE key = 'super_setup_code'").first<{ value: string }>(),
  ]);
  return (admins?.n ?? 0) === 0 && !!row?.value && row.value === code;
}

platformApp.get("/super/setup", async (c) => {
  const code = c.req.query("code") || "";
  if (!(await setupAllowed(c, code))) return c.redirect("/super/login", 303);
  return html(c, <PLayout title="সুপার অ্যাডমিন তৈরি" admin><SuperSetupPage code={code} /></PLayout>);
});

platformApp.post("/super/setup", async (c) => {
  const b = await c.req.parseBody();
  const code = str(b.code, 100);
  if (!(await platformRateLimit(c.env, `supersetup:${clientIp(c)}`, 10, 900)) || !(await setupAllowed(c, code))) return c.redirect("/super/login", 303);
  const email = str(b.email, 120).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const fail = (msg: string) => html(c, <PLayout title="সুপার অ্যাডমিন তৈরি" admin><SuperSetupPage code={code} error={msg} email={email} /></PLayout>, 422);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("সঠিক ইমেইল দিন");
  if (password.length < 10) return fail("পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের দিন");
  if (password !== b.password2) return fail("দুটো পাসওয়ার্ড মেলেনি");
  const db = c.env.PLATFORM_DB;
  await db.batch([
    db.prepare("INSERT INTO super_admins (email, password_hash) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM super_admins)").bind(email, await hashPassword(password)),
    db.prepare("DELETE FROM platform_settings WHERE key = 'super_setup_code'"),
  ]);
  return c.redirect("/super/login", 303);
});

/* লগইনের পরের সব সুপার অ্যাডমিন পেজ */
platformApp.route("/super", superApp);

export const unknownHostPage = () =>
  new Response(
    `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>দোকান পাওয়া যায়নি</title><link rel="stylesheet" href="/css/app.css?v=26"></head>
<body><main class="wrap narrow empty"><h1>এই ঠিকানায় কোনো দোকান নেই</h1><p class="muted">ঠিকানাটি আবার দেখুন।</p></main></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
