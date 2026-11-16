/**
 * সুপার অ্যাডমিনের সব পেজ (লগইনের পরে)। লগইন/সেটআপ/লগআউট app.tsx-এ।
 * প্রতিটা কাজ রোল দিয়ে আটকানো, আর গুরুত্বপূর্ণ কাজ অডিট লগে লেখা হয়।
 */
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { clientIp, isHttps, str, toInt } from "../shop/lib/http";
import { hashPassword, verifyPassword } from "../shop/lib/auth";
import { normalizePhone } from "../shop/lib/phone";
import { bn } from "../shop/lib/format";
import { normalizeLanding } from "../shop/lib/landing";
import { TEMPLATE_CATEGORIES } from "../shop/lib/landing-templates";
import { NICHES, nicheByKey } from "../shop/lib/niches";
import type { NicheImage } from "../shop/shop-do";

/** ডেমো দোকানের আঁকা ছবি (demo/draw.py) — public repo থেকে */
import { applyLedger, approveTopup, clearSettingsCache, num, platformSettings } from "./billing";
import { clearShopCache } from "./resolve";
import { registerSuperSupport } from "./support-routes";
import { platformUsage } from "./usage";
import { PHONE_PENDING_SQL, SUSPICIOUS_SQL } from "./verify";
import { confirmBrowserCheck, purgeShopsLocal, r2Status, setAutoPurge, syncShopsToR2, verifyR2Public } from "./r2";
import { slugOk } from "./blog";
import { sanitizeHtml } from "../shop/lib/sanitize";
import { PLAN_KEYS, plans } from "./plans";
import { clearSession, SUPER_COOKIES } from "../shop/lib/session-cookie";
import { shopUrl, superFromCookie, type PCtx, type PEnv, type SuperRole } from "./lib";
import {
  AccountPage, AnnouncementsPage, BlogListPage, BlogEditPage, type BlogRow, ErrorsPage, type ErrorRow, DemosPage, type DemoRow, TemplateForm, TemplatesPage, type TplRow, AuditPage, can, DashboardPage, FinancePage, SecuritySettings, SettingsPage, ShopDetailPage, ShopsPage, SuperShell, TeamPage, TopupsPage,
  SHOP_FILTERS, SHOP_SORTS, SUPER_ROLE_LABEL,
  type AnnRow, type AuditRow, type DashData, type FinanceData, type LedgerRow, type NoteRow, type SFlash, type ShopRow, type TeamRow, type TopupRow,
} from "./super-views";

export const superApp = new Hono<PEnv>();

/* ---------- লগইন আর অনুমতি ---------- */
superApp.use("*", async (c, next) => {
  const admin = await superFromCookie(c);
  if (!admin) return c.redirect("/super/login", 303);
  c.set("superAdmin", admin);
  c.header("X-Robots-Tag", "noindex");
  c.header("Cache-Control", "no-store");
  await next();
});

const me = (c: PCtx) => c.var.superAdmin!;

function forbidden(c: PCtx) {
  return c.html(
    "<!DOCTYPE html>" + String(<SuperShell title="অনুমতি নেই" active="" admin={me(c)}><div class="sa-card"><p class="sa-empty">এই কাজের অনুমতি আপনার রোলে ({SUPER_ROLE_LABEL[me(c).role]}) নেই।</p></div></SuperShell>),
    403,
  );
}
const allowed = (c: PCtx, perm: string) => can(me(c).role, perm);

function takeFlash(c: PCtx): SFlash {
  const raw = getCookie(c, "sflash");
  if (!raw) return null;
  deleteCookie(c, "sflash", { path: "/super" });
  try { return JSON.parse(decodeURIComponent(raw)); } catch { return null; }
}
function flash(c: PCtx, type: "ok" | "error", text: string) {
  setCookie(c, "sflash", encodeURIComponent(JSON.stringify({ type, text })), { path: "/super", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 60 });
}

async function page(c: PCtx, title: string, active: string, body: unknown, status: 200 | 404 | 422 = 200, actions?: unknown) {
  const pending = await c.env.PLATFORM_DB.prepare(
    "SELECT (SELECT COUNT(*) FROM topups WHERE status = 'pending') n, (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') s",
  ).first<{ n: number; s: number }>();
  return c.html(
    "<!DOCTYPE html>" +
      String(<SuperShell title={title} active={active} admin={me(c)} flash={takeFlash(c)} pendingTopups={pending?.n ?? 0} openSupport={pending?.s ?? 0} actions={actions as any}>{body as any}</SuperShell>),
    status,
  );
}

/** অডিট লগে লেখা */
export async function audit(c: PCtx, action: string, targetType: string | null, targetId: string | null, detail?: string) {
  const a = c.var.superAdmin;
  await c.env.PLATFORM_DB.prepare(
    "INSERT INTO audit_log (admin_id, admin_email, action, target_type, target_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(a?.id ?? null, a?.email ?? null, action, targetType, targetId, detail?.slice(0, 500) ?? null, clientIp(c)).run();
}

/* ---------- তারিখ (ঢাকার দিন) ---------- */
const DHAKA = "'+6 hours'";
function lastDays(n: number): string[] {
  const out: string[] = [];
  const now = Date.now() + 6 * 3600e3;
  for (let i = n - 1; i >= 0; i--) out.push(new Date(now - i * 86400e3).toISOString().slice(0, 10));
  return out;
}
const dayLabel = (d: string) => bn(`${d.slice(8, 10)}/${d.slice(5, 7)}`);
const MONTHS = ["জানু", "ফেব্রু", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টে", "অক্টো", "নভে", "ডিসে"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${bn(ym.slice(2, 4))}`;
function series(days: string[], rows: { d: string; v: number }[]) {
  const m = new Map(rows.map((r) => [r.d, Number(r.v) || 0]));
  return days.map((d) => ({ label: dayLabel(d), value: m.get(d) ?? 0 }));
}

/* ---------- ড্যাশবোর্ড ---------- */
superApp.get("/", async (c) => {
  const db = c.env.PLATFORM_DB;
  const s = await platformSettings(db);
  const days = lastDays(30);
  const since = "datetime('now', '-30 days')";
  const q = (sql: string) => db.prepare(sql);
  const res = await db.batch([
    q("SELECT status, COUNT(*) n FROM shops GROUP BY status"),
    q(`SELECT
         SUM(created_at >= datetime(date('now', ${DHAKA}), '-6 hours')) today,
         SUM(created_at >= datetime('now', '-7 days')) d7,
         SUM(created_at >= ${since}) d30,
         SUM(created_at >= datetime('now', '-60 days') AND created_at < ${since}) prev30,
         SUM(first_topup_at IS NOT NULL) paying,
         SUM(status != 'trial') past_trial,
         SUM(first_topup_at IS NOT NULL AND status != 'trial') converted,
         SUM(status IN ('closed', 'suspended') AND status_changed_at >= ${since}) churn30,
         SUM(last_order_at >= datetime('now', '-7 days')) active7,
         SUM(CASE WHEN balance < 0 THEN balance ELSE 0 END) dues,
         SUM(balance < 0) dues_shops,
         SUM(CASE WHEN status = 'active' AND demo_niche IS NULL THEN (CASE plan WHEN 'small' THEN ? WHEN 'grow' THEN ? WHEN 'big' THEN ? ELSE 0 END) ELSE 0 END) mrr_sub,
         SUM(status = 'active') active_n
       FROM shops`).bind(plans(s).small.price, plans(s).grow.price, plans(s).big.price),
    q(`SELECT
         -SUM(CASE WHEN type IN ('order_fee', 'monthly', 'overage', 'plan_change') AND created_at >= datetime(strftime('%Y-%m-01', 'now', ${DHAKA}), '-6 hours') THEN amount ELSE 0 END) month,
         -SUM(CASE WHEN type IN ('order_fee', 'monthly', 'overage', 'plan_change') AND created_at >= datetime(strftime('%Y-%m-01', 'now', ${DHAKA}, '-1 month'), '-6 hours')
                    AND created_at < datetime(strftime('%Y-%m-01', 'now', ${DHAKA}), '-6 hours') THEN amount ELSE 0 END) last_month,
         -SUM(CASE WHEN type IN ('order_fee', 'monthly', 'overage', 'plan_change') AND created_at >= ${since} THEN amount ELSE 0 END) d30,
         -SUM(CASE WHEN type IN ('order_fee', 'overage') AND created_at >= ${since} THEN amount ELSE 0 END) fees30,
         SUM(CASE WHEN type = 'topup' AND created_at >= ${since} THEN amount ELSE 0 END) cash30,
         SUM(CASE WHEN type IN ('order_fee', 'trial_order', 'plan_order') AND created_at >= datetime(date('now', ${DHAKA}), '-6 hours') THEN 1 ELSE 0 END) orders_today,
         SUM(CASE WHEN type IN ('order_fee', 'trial_order', 'plan_order') AND created_at >= ${since} THEN 1 ELSE 0 END) orders30,
         SUM(CASE WHEN type IN ('order_fee', 'trial_order', 'plan_order') AND created_at >= datetime('now', '-60 days') AND created_at < ${since} THEN 1 ELSE 0 END) orders_prev30
       FROM ledger WHERE applied = 1 AND created_at >= datetime('now', '-62 days')`),
    q(`SELECT date(created_at, ${DHAKA}) d, COUNT(*) v FROM shops WHERE created_at >= ${since} GROUP BY d`),
    q(`SELECT date(created_at, ${DHAKA}) d, COUNT(*) v FROM ledger WHERE applied = 1 AND type IN ('order_fee', 'trial_order', 'plan_order') AND created_at >= ${since} GROUP BY d`),
    q(`SELECT date(created_at, ${DHAKA}) d, -SUM(amount) v FROM ledger WHERE applied = 1 AND type IN ('order_fee', 'monthly', 'overage', 'plan_change') AND created_at >= ${since} GROUP BY d`),
    q(`SELECT s.id, s.name, s.slug, COUNT(*) n FROM ledger l JOIN shops s ON s.id = l.shop_id
       WHERE l.applied = 1 AND l.type IN ('order_fee', 'trial_order', 'plan_order') AND l.created_at >= ${since} GROUP BY l.shop_id ORDER BY n DESC LIMIT 8`),
    q(`SELECT id, name, trial_ends_at, trial_orders_left, owner_phone FROM shops WHERE status = 'trial' AND trial_ends_at <= datetime('now', '+3 days') ORDER BY trial_ends_at LIMIT 6`),
    q(`SELECT id, name, last_order_at, balance FROM shops WHERE status = 'active' AND (last_order_at IS NULL OR last_order_at < datetime('now', '-14 days'))
       ORDER BY confirmed_orders DESC LIMIT 6`),
    q("SELECT id, name, slug, status, created_at FROM shops ORDER BY created_at DESC LIMIT 6"),
    q(`SELECT a.*, s.name shop_name FROM audit_log a LEFT JOIN shops s ON a.target_type = 'shop' AND s.id = a.target_id ORDER BY a.id DESC LIMIT 6`),
    q("SELECT COUNT(*) n, COALESCE(SUM(amount), 0) amount FROM topups WHERE status = 'pending'"),
    q("SELECT SUM(status = 'pending') pending, SUM(status = 'failed') failed FROM domains"),
    q("SELECT key, value FROM platform_settings WHERE key IN ('cron_daily_at', 'cron_domains_at')"),
  ]);
  const rows = <T,>(i: number) => res[i]!.results as T[];
  const counts = Object.fromEntries(rows<{ status: string; n: number }>(0).map((r) => [r.status, r.n]));
  const a = rows<Record<string, number>>(1)[0] ?? {};
  const l = rows<Record<string, number>>(2)[0] ?? {};
  const tp = rows<{ n: number; amount: number }>(11)[0];
  const dm = rows<{ pending: number; failed: number }>(12)[0];
  const cron = Object.fromEntries(rows<{ key: string; value: string }>(13).map((r) => [r.key, r.value]));
  const total = Object.values(counts).reduce((x, y) => x + y, 0);
  const mrr = (a.mrr_sub ?? 0) + (l.fees30 ?? 0);
  const d: DashData = {
    counts, total,
    new: { today: a.today ?? 0, d7: a.d7 ?? 0, d30: a.d30 ?? 0, prev30: a.prev30 ?? 0 },
    revenue: { month: l.month ?? 0, lastMonth: l.last_month ?? 0, d30: l.d30 ?? 0, cash30: l.cash30 ?? 0 },
    mrr,
    arpu: a.active_n ? mrr / a.active_n : 0,
    paying: a.paying ?? 0,
    pastTrial: a.past_trial ?? 0,
    conversion: a.past_trial ? ((a.converted ?? 0) / a.past_trial) * 100 : 0,
    churn30: a.churn30 ?? 0,
    churnRate: (a.active_n ?? 0) + (a.churn30 ?? 0) ? ((a.churn30 ?? 0) / ((a.active_n ?? 0) + (a.churn30 ?? 0))) * 100 : 0,
    orders: { today: l.orders_today ?? 0, d30: l.orders30 ?? 0, prev30: l.orders_prev30 ?? 0 },
    activeShops7: a.active7 ?? 0,
    dues: { amount: a.dues ?? 0, shops: a.dues_shops ?? 0 },
    pending: { topups: tp?.n ?? 0, topupAmount: tp?.amount ?? 0, domains: dm?.pending ?? 0, failedDomains: dm?.failed ?? 0 },
    charts: {
      signups: series(days, rows(3)),
      orders: series(days, rows(4)),
      revenue: series(days, rows(5)),
    },
    topShops: rows(6),
    trialsEnding: rows(7),
    atRisk: rows(8),
    recentShops: rows(9),
    recentAudit: rows<AuditRow>(10),
    cron: { daily: cron.cron_daily_at ?? null, domains: cron.cron_domains_at ?? null },
    usage: await platformUsage(c.env.PLATFORM_DB),
    r2: await r2Status(c.env),
    suspicious: (await c.env.PLATFORM_DB.prepare(`SELECT COUNT(*) n FROM shops s WHERE ${SUSPICIOUS_SQL}`).first<{ n: number }>())?.n ?? 0,
    phonePending: (await c.env.PLATFORM_DB.prepare(`SELECT COUNT(*) n FROM shops s WHERE ${PHONE_PENDING_SQL}`).first<{ n: number }>())?.n ?? 0,
  };
  return page(c, "ড্যাশবোর্ড", "dashboard", <DashboardPage d={d} role={me(c).role} />);
});

/* ---------- দোকান ---------- */
const SHOP_SELECT = `SELECT s.*, (SELECT group_concat(hostname, ', ') FROM domains d WHERE d.shop_id = s.id) AS domains FROM shops s`;
const FILTER_SQL: Record<string, string> = {
  trial: "s.status = 'trial'",
  active: "s.status = 'active'",
  suspended: "s.status = 'suspended'",
  closed: "s.status = 'closed' AND s.deleted_at IS NULL",
  idle: "s.status = 'active' AND s.plan = 'free' AND s.demo_niche IS NULL AND s.deleted_at IS NULL AND MAX(COALESCE(s.last_login_at, ''), COALESCE(s.last_order_at, ''), s.created_at) <= datetime('now', '-23 days')",
  deleted: "s.deleted_at IS NOT NULL",
  dues: "s.balance < 0",
  at_risk: "s.status = 'active' AND (s.last_order_at IS NULL OR s.last_order_at < datetime('now', '-14 days'))",
  trial_ending: "s.status = 'trial' AND s.trial_ends_at <= datetime('now', '+3 days')",
  paying: "s.first_topup_at IS NOT NULL",
  custom_domain: "EXISTS (SELECT 1 FROM domains d WHERE d.shop_id = s.id)",
  domain_failed: "EXISTS (SELECT 1 FROM domains d WHERE d.shop_id = s.id AND d.status = 'failed')",
  suspicious: SUSPICIOUS_SQL,
  phone_pending: PHONE_PENDING_SQL,
};
const SORT_SQL: Record<string, string> = {
  new: "s.created_at DESC", old: "s.created_at ASC", orders: "s.confirmed_orders DESC", balance_low: "s.balance ASC",
  balance_high: "s.balance DESC", last_order: "s.last_order_at IS NULL, s.last_order_at DESC", name: "s.name COLLATE NOCASE",
};
const PER_PAGE = 50;

function shopQuery(c: PCtx) {
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const filter = (c.req.query("filter") || c.req.query("status") || "") in SHOP_FILTERS ? (c.req.query("filter") || c.req.query("status") || "") : "";
  const sort = (c.req.query("sort") || "new") in SHOP_SORTS ? c.req.query("sort") || "new" : "new";
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (filter) conds.push(FILTER_SQL[filter]!);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const phone = normalizePhone(q);
    conds.push(`(s.name LIKE ? OR s.slug LIKE ? OR s.owner_phone LIKE ? OR s.owner_email LIKE ? OR s.owner_name LIKE ? OR s.id = ?
      OR s.id IN (SELECT shop_id FROM domains WHERE hostname LIKE ?)${phone ? " OR s.owner_phone = ?" : ""})`);
    binds.push(like, like, like, like, like, q, like, ...(phone ? [phone] : []));
  }
  return { q, filter, sort, where: conds.length ? conds.join(" AND ") : "1=1", binds };
}

superApp.get("/shops", async (c) => {
  const db = c.env.PLATFORM_DB;
  const { q, filter, sort, where, binds } = shopQuery(c);
  const pg = Math.max(1, toInt(c.req.query("page"), 1));
  const countCols = Object.entries(FILTER_SQL).map(([k, v]) => `SUM(${v}) AS "${k}"`).join(", ");
  const [list, total, cnt] = await db.batch([
    db.prepare(`${SHOP_SELECT} WHERE ${where} ORDER BY ${SORT_SQL[sort]} LIMIT ? OFFSET ?`).bind(...binds, PER_PAGE, (pg - 1) * PER_PAGE),
    db.prepare(`SELECT COUNT(*) n FROM shops s WHERE ${where}`).bind(...binds),
    db.prepare(`SELECT COUNT(*) AS "", ${countCols} FROM shops s`),
  ]);
  const counts = Object.fromEntries(Object.entries((cnt!.results[0] ?? {}) as Record<string, number>).map(([k, v]) => [k, Number(v) || 0]));
  return page(c, "দোকান", "shops",
    <ShopsPage rows={list!.results as ShopRow[]} counts={counts} q={q} filter={filter} sort={sort} page={pg} per={PER_PAGE}
      total={(total!.results[0] as { n: number }).n} shopLink={(slug) => shopUrl(c.env, slug)} canEnter={allowed(c, "shop.impersonate")} canExport={allowed(c, "shops.export")} />);
});

/** CSV — Excel-এ খোলার জন্য (সূত্র-ইনজেকশন থেকে নিরাপদ) */
superApp.get("/shops.csv", async (c) => {
  if (!allowed(c, "shops.export")) return forbidden(c);
  const { where, binds, sort } = shopQuery(c);
  const { results } = await c.env.PLATFORM_DB.prepare(`${SHOP_SELECT} WHERE ${where} ORDER BY ${SORT_SQL[sort]} LIMIT 20000`).bind(...binds).all<ShopRow>();
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const cols: (keyof ShopRow)[] = ["id", "slug", "name", "owner_name", "owner_phone", "owner_email", "status", "balance", "confirmed_orders", "last_order_at", "last_login_at", "trial_ends_at", "first_topup_at", "domains", "created_at"];
  const csv = "﻿" + [cols.join(","), ...results.map((r) => cols.map((k) => cell(r[k])).join(","))].join("\r\n");
  await audit(c, "export.shops", null, null, `${results.length}টা দোকান`);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="shops-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});

async function loadShop(c: PCtx, id: string) {
  return c.env.PLATFORM_DB.prepare(`${SHOP_SELECT} WHERE s.id = ?`).bind(id).first<ShopRow>();
}

superApp.get("/shops/:id", async (c) => {
  const db = c.env.PLATFORM_DB;
  const s = await loadShop(c, c.req.param("id"));
  if (!s) return page(c, "পাওয়া যায়নি", "shops", <div class="sa-card"><p class="sa-empty">দোকান পাওয়া যায়নি</p></div>, 404);
  const days = lastDays(30);
  const [dom, ord, rev, led, tps, notes, aud] = await db.batch([
    db.prepare("SELECT hostname, status, error, checked_at FROM domains WHERE shop_id = ? ORDER BY hostname").bind(s.id),
    db.prepare(`SELECT date(created_at, ${DHAKA}) d, COUNT(*) v FROM ledger WHERE shop_id = ? AND applied = 1 AND type IN ('order_fee', 'trial_order', 'plan_order') AND created_at >= datetime('now', '-30 days') GROUP BY d`).bind(s.id),
    db.prepare(`SELECT -SUM(CASE WHEN type IN ('order_fee', 'monthly', 'overage', 'plan_change') THEN amount ELSE 0 END) lifetime, SUM(CASE WHEN type = 'topup' THEN amount ELSE 0 END) topups FROM ledger WHERE shop_id = ? AND applied = 1`).bind(s.id),
    db.prepare("SELECT id, type, amount, balance_after, note, created_at FROM ledger WHERE shop_id = ? AND applied = 1 ORDER BY id DESC LIMIT 25").bind(s.id),
    db.prepare("SELECT * FROM topups WHERE shop_id = ? ORDER BY id DESC LIMIT 20").bind(s.id),
    db.prepare("SELECT id, admin_email, note, created_at FROM shop_notes WHERE shop_id = ? ORDER BY id DESC LIMIT 30").bind(s.id),
    db.prepare("SELECT * FROM audit_log WHERE target_type = 'shop' AND target_id = ? ORDER BY id DESC LIMIT 15").bind(s.id),
  ]);
  const orders30 = series(days, ord!.results as { d: string; v: number }[]);
  // দোকানের নিজের ডাটাবেস থেকে পণ্য/অর্ডারের হিসাব (ব্যর্থ হলে পেজ তবুও খোলে)
  const live = await c.env.SHOP.getByName(s.id).quickStats(s.id).catch(() => null);
  const r = (rev!.results[0] ?? {}) as { lifetime: number | null; topups: number | null };
  return page(c, s.name, "shops",
    <ShopDetailPage s={s} role={me(c).role} shopLink={shopUrl(c.env, s.slug)} domains={dom!.results as any}
      orders30={orders30} orders30Total={orders30.reduce((x, y) => x + y.value, 0)}
      revenue={{ lifetime: r.lifetime ?? 0, topups: r.topups ?? 0 }}
      ledger={led!.results as LedgerRow[]} topups={tps!.results as TopupRow[]} notes={notes!.results as NoteRow[]} audit={aud!.results as AuditRow[]} live={live as any} />);
});

/** পুরো দোকানের ব্যাকআপ (JSON) — শুধু মালিক, অডিটে লেখা হয় */
superApp.get("/shops/:id/export.json", async (c) => {
  if (!allowed(c, "shop.export")) return forbidden(c);
  const s = await loadShop(c, c.req.param("id"));
  if (!s) return c.notFound();
  if (s.deleted_at) return c.text("এই দোকানের ডাটা মুছে ফেলা হয়েছে।", 410);
  const data = await c.env.SHOP.getByName(s.id).exportData(s.id);
  await audit(c, "shop.export", "shop", s.id, "পুরো ব্যাকআপ ডাউনলোড");
  return new Response(JSON.stringify(data), { headers: {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="${s.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
    "cache-control": "no-store",
  } });
});

/** দোকানের অর্ডার/পণ্য/কাস্টমার CSV — দোকানদার চাইলে সুপার অ্যাডমিন নামিয়ে দেন (শুধু owner, অডিটে লেখা) */
const CSV_KINDS = { orders: "অর্ডার", products: "পণ্য", customers: "কাস্টমার" } as const;
superApp.get("/shops/:id/export/:kind{[a-z]+\\.csv}", async (c) => {
  if (!allowed(c, "shop.export")) return forbidden(c);
  const kind = c.req.param("kind").replace(".csv", "") as keyof typeof CSV_KINDS;
  if (!Object.hasOwn(CSV_KINDS, kind)) return c.notFound();
  const s = await loadShop(c, c.req.param("id"));
  if (!s) return c.notFound();
  if (s.deleted_at) return c.text("এই দোকানের ডাটা মুছে ফেলা হয়েছে।", 410);
  const csv = await c.env.SHOP.getByName(s.id).exportCsv(s.id, kind);
  await audit(c, "shop.export", "shop", s.id, `${CSV_KINDS[kind]} CSV ডাউনলোড`);
  return new Response(csv, { headers: {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${s.slug}-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
    "cache-control": "no-store",
  } });
});

/** ব্যাকআপ (JSON) থেকে দোকানের ডাটা ফিরিয়ে আনা — শুধু মালিক; দোকানের slug লিখে নিশ্চিত করতে হয় */
superApp.post("/shops/:id/restore", async (c) => {
  if (!allowed(c, "shop.restore")) return forbidden(c);
  const s = await loadShop(c, c.req.param("id"));
  if (!s) return c.notFound();
  if (s.deleted_at) { flash(c, "error", "এই দোকানের ডাটা মুছে ফেলা হয়েছে — ফেরানো যায় না।"); return c.redirect(`/super/shops/${s.id}`, 303); }
  const b = await c.req.parseBody();
  const file = b.file;
  if (str(b.confirm, 80) !== s.slug) {
    flash(c, "error", "নিশ্চিত করতে দোকানের slug ঠিকঠাক লিখুন।");
    return c.redirect(`/super/shops/${s.id}`, 303);
  }
  if (!(file instanceof File) || file.size === 0 || file.size > 25 * 1024 * 1024) {
    flash(c, "error", "ব্যাকআপের JSON ফাইল বাছুন (সর্বোচ্চ ২৫MB)।");
    return c.redirect(`/super/shops/${s.id}`, 303);
  }
  let data: { shop_id?: string; tables?: Record<string, unknown> };
  try { data = JSON.parse(await file.text()); } catch { data = {}; }
  if (data?.shop_id !== s.id || typeof data.tables !== "object" || !data.tables) {
    flash(c, "error", "এই ফাইলটা এই দোকানের ব্যাকআপ নয়।");
    return c.redirect(`/super/shops/${s.id}`, 303);
  }
  try {
    const counts = await c.env.SHOP.getByName(s.id).importData(s.id, data);
    await audit(c, "shop.restore", "shop", s.id, `ব্যাকআপ থেকে ফেরানো: ${counts.products ?? 0} পণ্য, ${counts.orders ?? 0} অর্ডার`);
    flash(c, "ok", `ব্যাকআপ থেকে ফেরানো হয়েছে — ${bn(counts.products ?? 0)}টা পণ্য, ${bn(counts.orders ?? 0)}টা অর্ডার।`);
  } catch (e) {
    flash(c, "error", `ফেরানো যায়নি: ${e instanceof Error ? e.message.slice(0, 120) : "অজানা সমস্যা"}`);
  }
  return c.redirect(`/super/shops/${s.id}`, 303);
});

/* ---------- ছবি R2-তে ---------- */
superApp.post("/r2/check", async (c) => {
  if (!allowed(c, "r2")) return forbidden(c);
  const r = await verifyR2Public(c.env);
  flash(c, r.ok ? "ok" : "error", r.message);
  return c.redirect("/super", 303);
});
superApp.post("/r2/confirm", async (c) => {
  if (!allowed(c, "r2")) return forbidden(c);
  const ok = await confirmBrowserCheck(c.env, String((await c.req.parseBody()).token ?? ""));
  if (ok) {
    await audit(c, "r2.public_ok", null, null, "ব্রাউজারে যাচাই");
    const r = await syncShopsToR2(c.env, 5, 2);
    flash(c, "ok", `ছবির ঠিকানা কাজ করছে ✓ — কপি শুরু: ${bn(r.copied)}টা ছবি, ${bn(r.done)}টা দোকান এখন R2 থেকে। বাকিগুলো প্রতি ৩০ মিনিটে।`);
  } else flash(c, "error", "যাচাই মেলেনি — আবার \"ঠিকানা যাচাই\" চাপুন।");
  return c.redirect("/super", 303);
});
superApp.post("/r2/sync", async (c) => {
  if (!allowed(c, "r2")) return forbidden(c);
  const r = await syncShopsToR2(c.env, 5, 2);
  flash(c, "ok", `${bn(r.copied)}টা ছবি কপি হয়েছে, ${bn(r.done)}টা দোকান এখন R2 থেকে ছবি দেখাচ্ছে। বাকিগুলো প্রতি ৩০ মিনিটে নিজে চলবে।`);
  return c.redirect("/super", 303);
});
superApp.post("/r2/purge", async (c) => {
  if (!allowed(c, "r2")) return forbidden(c);
  const on = (await c.req.parseBody()).on === "1";
  await setAutoPurge(c.env, on);
  await audit(c, "r2.purge", null, null, on ? "চালু" : "বন্ধ");
  if (on) {
    const r = await purgeShopsLocal(c.env, 5, 2);
    flash(c, "ok", `চালু হয়েছে — এখন ${bn(r.purged)}টা পুরনো কপি মোছা হলো, বাকিগুলো প্রতি ৩০ মিনিটে।`);
  } else flash(c, "ok", "পুরনো কপি মোছা বন্ধ।");
  return c.redirect("/super", 303);
});

/* ---------- যাচাই আর সন্দেহ ---------- */
superApp.post("/shops/:id/verify", async (c) => {
  if (!allowed(c, "shop.status")) return forbidden(c);
  const id = c.req.param("id");
  const what = String((await c.req.parseBody()).what ?? "both");
  const set = what === "phone" ? "phone_verified = 1" : what === "email" ? "email_verified = 1" : "email_verified = 1, phone_verified = 1";
  await c.env.PLATFORM_DB.prepare(`UPDATE shops SET ${set} WHERE id = ?`).bind(id).run();
  clearShopCache();
  await audit(c, "shop.verify", "shop", id, what === "phone" ? "ফোনে কথা বলে মোবাইল যাচাই" : what === "email" ? "ইমেইল যাচাই করা ধরা" : "যাচাই করা ধরা");
  const after = await c.env.PLATFORM_DB.prepare("SELECT email_verified, phone_verified FROM shops WHERE id = ?").bind(id).first<{ email_verified: number; phone_verified: number }>();
  flash(c, "ok", after?.email_verified && after.phone_verified ? "যাচাই শেষ — দোকান এখন অর্ডার নিতে পারবে।" : "সেভ হয়েছে — বাকি যাচাই শেষ হলে অর্ডার চালু হবে।");
  return c.redirect(`/super/shops/${id}`, 303);
});
superApp.post("/shops/:id/risk-clear", async (c) => {
  if (!allowed(c, "shop.status")) return forbidden(c);
  const id = c.req.param("id");
  await c.env.PLATFORM_DB.prepare("UPDATE shops SET risk_cleared = 1 WHERE id = ?").bind(id).run();
  await audit(c, "shop.risk_clear", "shop", id);
  flash(c, "ok", "সন্দেহজনক তালিকা থেকে বাদ দেওয়া হলো।");
  return c.redirect(`/super/shops/${id}`, 303);
});

superApp.post("/shops/:id/status", async (c) => {
  if (!allowed(c, "shop.status")) return forbidden(c);
  const id = c.req.param("id");
  const b = await c.req.parseBody();
  const status = str(b.status, 20);
  if (!["trial", "active", "suspended", "closed"].includes(status)) return c.redirect(`/super/shops/${id}`, 303);
  const before = await c.env.PLATFORM_DB.prepare("SELECT status FROM shops WHERE id = ?").bind(id).first<{ status: string }>();
  if (!before) return c.redirect("/super/shops", 303);
  if (before.status !== status) {
    await c.env.PLATFORM_DB.prepare("UPDATE shops SET status = ?, status_changed_at = datetime('now') WHERE id = ?").bind(status, id).run();
    // স্থগিত থাকার সময় বিল কাটে না; আবার চালু হলে বিলের দিন পেরিয়ে গিয়ে থাকলে আজ থেকে নতুন বিল (মাঝের মাসগুলোর নয়)
    if (before.status === "suspended" && status === "active") {
      await c.env.PLATFORM_DB.prepare("UPDATE shops SET next_bill_at = datetime('now') WHERE id = ? AND next_bill_at IS NOT NULL AND next_bill_at < datetime('now')").bind(id).run();
    }
    clearShopCache();
    await audit(c, "shop.status", "shop", id, `${before.status} → ${status}${str(b.reason, 200) ? ` (${str(b.reason, 200)})` : ""}`);
  }
  flash(c, "ok", "দোকানের অবস্থা বদলেছে।");
  return c.redirect(`/super/shops/${id}`, 303);
});

superApp.post("/shops/:id/extend-trial", async (c) => {
  if (!allowed(c, "shop.trial")) return forbidden(c);
  const id = c.req.param("id");
  const days = Math.min(90, Math.max(1, toInt((await c.req.parseBody()).days, 7)));
  await c.env.PLATFORM_DB.prepare(
    `UPDATE shops SET trial_ends_at = datetime(MAX(COALESCE(trial_ends_at, datetime('now')), datetime('now')), '+' || ? || ' days'),
       status = CASE WHEN status = 'suspended' THEN 'trial' ELSE status END WHERE id = ?`,
  ).bind(days, id).run();
  clearShopCache();
  await audit(c, "shop.trial", "shop", id, `+${days} দিন`);
  flash(c, "ok", `ট্রায়াল ${days} দিন বাড়ানো হয়েছে।`);
  return c.redirect(`/super/shops/${id}`, 303);
});

superApp.post("/shops/:id/adjust", async (c) => {
  if (!allowed(c, "shop.adjust")) return forbidden(c);
  const id = c.req.param("id");
  const b = await c.req.parseBody();
  const amount = toInt(b.amount, 0);
  const note = str(b.note, 200);
  if (amount && note && Math.abs(amount) <= 1_000_000) {
    await applyLedger(c.env.PLATFORM_DB, id, "adjust", amount, `adjust:${crypto.randomUUID()}`, `সমন্বয়: ${note}`);
    clearShopCache();
    await audit(c, "shop.adjust", "shop", id, `${amount > 0 ? "+" : ""}${amount} ৳ — ${note}`);
    flash(c, "ok", "ব্যালেন্স সমন্বয় হয়েছে।");
  } else {
    flash(c, "error", "টাকার পরিমাণ আর কারণ দুটোই দিন।");
  }
  return c.redirect(`/super/shops/${id}`, 303);
});

superApp.post("/shops/:id/edit", async (c) => {
  if (!allowed(c, "shop.edit")) return forbidden(c);
  const id = c.req.param("id");
  const b = await c.req.parseBody();
  const name = str(b.name, 100);
  const phone = str(b.owner_phone, 20) ? normalizePhone(str(b.owner_phone, 20)) : "";
  if (!name || (str(b.owner_phone, 20) && !phone)) {
    flash(c, "error", "নাম দিন, আর মোবাইল নম্বর সঠিক কিনা দেখুন।");
    return c.redirect(`/super/shops/${id}`, 303);
  }
  await c.env.PLATFORM_DB.prepare("UPDATE shops SET name = ?, owner_name = ?, owner_phone = ?, owner_email = ? WHERE id = ?")
    .bind(name, str(b.owner_name, 100) || null, phone || null, str(b.owner_email, 120).toLowerCase() || null, id).run();
  clearShopCache();
  await audit(c, "shop.edit", "shop", id, name);
  flash(c, "ok", "তথ্য সেভ হয়েছে।");
  return c.redirect(`/super/shops/${id}`, 303);
});

superApp.post("/shops/:id/notes", async (c) => {
  const id = c.req.param("id");
  const note = str((await c.req.parseBody()).note, 1000);
  if (note) {
    await c.env.PLATFORM_DB.prepare("INSERT INTO shop_notes (shop_id, admin_email, note) VALUES (?, ?, ?)").bind(id, me(c).email, note).run();
    await audit(c, "shop.note", "shop", id);
  }
  return c.redirect(`/super/shops/${id}`, 303);
});

/** সাপোর্ট লগইন: দোকানের মালিক হিসেবে ৫ মিনিটের এককালীন লিংক, অডিট লগে লেখা থাকে */
superApp.post("/shops/:id/impersonate", async (c) => {
  if (!allowed(c, "shop.impersonate")) return forbidden(c);
  const s = await loadShop(c, c.req.param("id"));
  if (!s) return c.redirect("/super/shops", 303);
  if (s.deleted_at) { flash(c, "error", "এই দোকানের ডাটা মুছে ফেলা হয়েছে।"); return c.redirect(`/super/shops/${s.id}`, 303); }
  const token = await c.env.SHOP.getByName(s.id).ownerLoginToken(s.id);
  if (!token) {
    flash(c, "error", "দোকানে কোনো চালু মালিক অ্যাকাউন্ট নেই।");
    return c.redirect(`/super/shops/${s.id}`, 303);
  }
  await audit(c, "shop.impersonate", "shop", s.id, str((await c.req.parseBody()).reason, 200) || "সুপার অ্যাডমিন থেকে প্যানেলে প্রবেশ");
  return c.redirect(shopUrl(c.env, s.slug, `/admin/auto-login?t=${token}&support=1`), 303);
});

/* ---------- রিচার্জ ---------- */
const TOPUP_SELECT = "SELECT t.*, s.name AS shop_name, s.slug FROM topups t JOIN shops s ON s.id = t.shop_id";

superApp.get("/topups", async (c) => {
  if (!allowed(c, "topups")) return forbidden(c);
  const db = c.env.PLATFORM_DB;
  const status = ["approved", "rejected"].includes(c.req.query("status") || "") ? c.req.query("status")! : "";
  const [p, r, st] = await db.batch([
    db.prepare(`${TOPUP_SELECT} WHERE t.status = 'pending' ORDER BY t.id`),
    db.prepare(`${TOPUP_SELECT} WHERE t.status ${status ? "= ?" : "!= 'pending'"} ORDER BY t.id DESC LIMIT 100`).bind(...(status ? [status] : [])),
    db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) pending_amount,
        COALESCE(SUM(CASE WHEN status = 'approved' AND decided_at >= datetime(date('now', ${DHAKA}), '-6 hours') THEN amount END), 0) today,
        COALESCE(SUM(CASE WHEN status = 'approved' AND decided_at >= datetime('now', '-30 days') THEN amount END), 0) d30
      FROM topups`),
  ]);
  const x = st!.results[0] as { pending_amount: number; today: number; d30: number };
  return page(c, "রিচার্জ", "topups",
    <TopupsPage pending={p!.results as TopupRow[]} recent={r!.results as TopupRow[]} role={me(c).role} status={status} stats={{ pendingAmount: x.pending_amount, today: x.today, d30: x.d30 }} />);
});

superApp.post("/topups/:id/approve", async (c) => {
  if (!allowed(c, "topups")) return forbidden(c);
  const id = toInt(c.req.param("id"));
  const t = await c.env.PLATFORM_DB.prepare("SELECT shop_id, amount, trx_id FROM topups WHERE id = ?").bind(id).first<{ shop_id: string; amount: number; trx_id: string }>();
  const res = await approveTopup(c.env.PLATFORM_DB, id);
  if (res.ok && t) await audit(c, "topup.approve", "shop", t.shop_id, `৳${t.amount} · ${t.trx_id}`);
  clearShopCache();
  flash(c, res.ok ? "ok" : "error", res.message);
  return c.redirect("/super/topups", 303);
});

superApp.post("/topups/:id/reject", async (c) => {
  if (!allowed(c, "topups")) return forbidden(c);
  const id = toInt(c.req.param("id"));
  const t = await c.env.PLATFORM_DB.prepare("SELECT shop_id, amount, trx_id FROM topups WHERE id = ?").bind(id).first<{ shop_id: string; amount: number; trx_id: string }>();
  const upd = await c.env.PLATFORM_DB.prepare("UPDATE topups SET status = 'rejected', decided_at = datetime('now') WHERE id = ? AND status = 'pending'").bind(id).run();
  if (upd.meta.changes && t) await audit(c, "topup.reject", "shop", t.shop_id, `৳${t.amount} · ${t.trx_id}`);
  flash(c, "ok", "অনুরোধ বাতিল হয়েছে।");
  return c.redirect("/super/topups", 303);
});

/* ---------- আয় ও হিসাব ---------- */
superApp.get("/finance", async (c) => {
  if (!allowed(c, "finance")) return forbidden(c);
  const db = c.env.PLATFORM_DB;
  const type = (c.req.query("type") || "") in { topup: 1, order_fee: 1, monthly: 1, trial_order: 1, adjust: 1 } ? c.req.query("type")! : "";
  const [m, t, lg] = await db.batch([
    db.prepare(`SELECT strftime('%Y-%m', created_at, ${DHAKA}) ym,
        -SUM(CASE WHEN type = 'order_fee' THEN amount ELSE 0 END) fees,
        -SUM(CASE WHEN type = 'monthly' THEN amount ELSE 0 END) monthly,
        SUM(CASE WHEN type = 'topup' THEN amount ELSE 0 END) topups
      FROM ledger WHERE applied = 1 AND created_at >= datetime('now', '-13 months') GROUP BY ym`),
    db.prepare(`SELECT
        (SELECT -COALESCE(SUM(amount), 0) FROM ledger WHERE applied = 1 AND type IN ('order_fee', 'monthly', 'overage', 'plan_change')) revenue,
        (SELECT COALESCE(SUM(amount), 0) FROM ledger WHERE applied = 1 AND type = 'topup') topups,
        (SELECT COALESCE(SUM(balance), 0) FROM shops WHERE balance < 0) dues,
        (SELECT COALESCE(SUM(balance), 0) FROM shops WHERE balance > 0) credit`),
    db.prepare(`SELECT l.*, s.name shop_name FROM ledger l JOIN shops s ON s.id = l.shop_id WHERE l.applied = 1 ${type ? "AND l.type = ?" : "AND l.type != 'trial_order'"} ORDER BY l.id DESC LIMIT 100`)
      .bind(...(type ? [type] : [])),
  ]);
  const byMonth = new Map((m!.results as { ym: string; fees: number; monthly: number; topups: number }[]).map((r) => [r.ym, r]));
  const months: FinanceData["months"] = [];
  const now = new Date(Date.now() + 6 * 3600e3);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const ym = d.toISOString().slice(0, 7);
    const r = byMonth.get(ym);
    months.push({ label: monthLabel(ym), orderFees: r?.fees ?? 0, monthly: r?.monthly ?? 0, topups: r?.topups ?? 0 });
  }
  const tt = t!.results[0] as { revenue: number; topups: number; dues: number; credit: number };
  return page(c, "আয় ও হিসাব", "finance",
    <FinancePage f={{ months, totals: tt, byType30: [], ledger: lg!.results as LedgerRow[], type }} />);
});

/* ---------- ঘোষণা ---------- */
superApp.get("/announcements", async (c) => {
  if (!allowed(c, "announcements")) return forbidden(c);
  const { results } = await c.env.PLATFORM_DB.prepare("SELECT * FROM announcements ORDER BY id DESC LIMIT 50").all<AnnRow>();
  return page(c, "ঘোষণা", "announcements", <AnnouncementsPage rows={results} />);
});

superApp.post("/announcements", async (c) => {
  if (!allowed(c, "announcements")) return forbidden(c);
  const b = await c.req.parseBody();
  const title = str(b.title, 120);
  const level = ["info", "success", "warn"].includes(String(b.level)) ? String(b.level) : "info";
  const days = Math.min(365, Math.max(1, toInt(b.days, 7)));
  if (!title) {
    flash(c, "error", "শিরোনাম দিন");
    return c.redirect("/super/announcements", 303);
  }
  const row = await c.env.PLATFORM_DB.prepare(
    "INSERT INTO announcements (title, body, level, ends_at, created_by) VALUES (?, ?, ?, datetime('now', '+' || ? || ' days'), ?) RETURNING id",
  ).bind(title, str(b.body, 500) || null, level, days, me(c).email).first<{ id: number }>();
  await audit(c, "announcement.create", "announcement", String(row?.id ?? ""), title);
  flash(c, "ok", "ঘোষণা প্রকাশ হয়েছে — ১ মিনিটের মধ্যে সব দোকানে দেখাবে।");
  return c.redirect("/super/announcements", 303);
});

superApp.post("/announcements/:id/toggle", async (c) => {
  if (!allowed(c, "announcements")) return forbidden(c);
  const id = toInt(c.req.param("id"));
  await c.env.PLATFORM_DB.prepare("UPDATE announcements SET active = 1 - active WHERE id = ?").bind(id).run();
  await audit(c, "announcement.toggle", "announcement", String(id));
  return c.redirect("/super/announcements", 303);
});

/* ---------- ব্লগ (ধাপ ৮) ---------- */
function blogInput(b: Record<string, unknown>) {
  return {
    title: str(b.title, 150),
    slug: str(b.slug, 80).toLowerCase(),
    excerpt: str(b.excerpt, 300),
    body_html: sanitizeHtml(String(b.body_html ?? "").slice(0, 60000)),
    status: b.status === "published" ? "published" : "draft",
  };
}
async function saveBlog(c: PCtx, id: number | null) {
  const v = blogInput(await c.req.parseBody());
  const db = c.env.PLATFORM_DB;
  const fail = (error: string) => page(c, id ? "পোস্ট এডিট" : "নতুন পোস্ট", "blog", <BlogEditPage post={{ ...v, id: id ?? undefined }} error={error} />);
  if (!v.title) return fail("শিরোনাম দিন।");
  if (!slugOk(v.slug)) return fail("লিংকে শুধু ইংরেজি ছোট হাতের অক্ষর, সংখ্যা আর মাঝে - দিন।");
  if (v.body_html.replace(/<[^>]*>/g, "").trim().length < 20) return fail("লেখা আরেকটু বড় করুন।");
  const dup = await db.prepare("SELECT id FROM blog_posts WHERE slug = ? AND id != ?").bind(v.slug, id ?? 0).first();
  if (dup) return fail("এই লিংকে আরেকটা পোস্ট আছে — অন্য slug দিন।");
  let newId = id;
  if (id) {
    await db.prepare(
      "UPDATE blog_posts SET title=?, slug=?, excerpt=?, body_html=?, status=?, published_at = CASE WHEN ?='published' THEN COALESCE(published_at, datetime('now')) ELSE published_at END, updated_at=datetime('now') WHERE id=?",
    ).bind(v.title, v.slug, v.excerpt, v.body_html, v.status, v.status, id).run();
  } else {
    const r = await db.prepare(
      "INSERT INTO blog_posts (slug, title, excerpt, body_html, status, published_at) VALUES (?, ?, ?, ?, ?, CASE WHEN ?='published' THEN datetime('now') END) RETURNING id",
    ).bind(v.slug, v.title, v.excerpt, v.body_html, v.status, v.status).first<{ id: number }>();
    newId = r?.id ?? null;
  }
  await audit(c, "blog.save", "blog", String(newId ?? ""), v.title);
  flash(c, "ok", v.status === "published" ? "পোস্ট প্রকাশিত — /blog-এ দেখাচ্ছে।" : "খসড়া সেভ হয়েছে।");
  return c.redirect(`/super/blog/${newId}`, 303);
}
superApp.get("/blog", async (c) => {
  if (!allowed(c, "blog")) return forbidden(c);
  const { results } = await c.env.PLATFORM_DB.prepare("SELECT * FROM blog_posts ORDER BY id DESC LIMIT 200").all<BlogRow>();
  return page(c, "ব্লগ", "blog", <BlogListPage rows={results} />);
});
superApp.get("/blog/new", (c) => {
  if (!allowed(c, "blog")) return forbidden(c);
  return page(c, "নতুন পোস্ট", "blog", <BlogEditPage />);
});
superApp.post("/blog/new", (c) => (allowed(c, "blog") ? saveBlog(c, null) : forbidden(c)));
superApp.get("/blog/:id{[0-9]+}", async (c) => {
  if (!allowed(c, "blog")) return forbidden(c);
  const post = await c.env.PLATFORM_DB.prepare("SELECT * FROM blog_posts WHERE id = ?").bind(toInt(c.req.param("id"))).first<BlogRow>();
  if (!post) return c.redirect("/super/blog", 303);
  return page(c, "পোস্ট এডিট", "blog", <BlogEditPage post={post} />);
});
superApp.post("/blog/:id{[0-9]+}", (c) => (allowed(c, "blog") ? saveBlog(c, toInt(c.req.param("id"))) : forbidden(c)));
superApp.post("/blog/:id{[0-9]+}/delete", async (c) => {
  if (!allowed(c, "blog")) return forbidden(c);
  const id = toInt(c.req.param("id"));
  const b = await c.req.parseBody();
  if (b.confirm !== "1") return c.redirect(`/super/blog/${id}`, 303);
  await c.env.PLATFORM_DB.prepare("DELETE FROM blog_posts WHERE id = ?").bind(id).run();
  await audit(c, "blog.delete", "blog", String(id));
  flash(c, "ok", "পোস্ট মুছে ফেলা হয়েছে।");
  return c.redirect("/super/blog", 303);
});

/* ---------- ল্যান্ডিং টেমপ্লেট ---------- */
function tplInput(b: Record<string, unknown>) {
  const name = str(b.name, 80);
  const category = TEMPLATE_CATEGORIES.includes(String(b.category)) ? String(b.category) : "অন্যান্য";
  let json: string | null = null;
  try {
    const l = normalizeLanding(JSON.parse(String(b.json ?? "")));
    if (l.sections.length > 1) json = JSON.stringify(l);
  } catch { /* ভুল JSON */ }
  const values = { name, category, description: str(b.description, 160) || null, sort_order: toInt(b.sort_order, 0), json: json ?? String(b.json ?? "").slice(0, 100_000) };
  const error = !name ? "টেমপ্লেটের নাম দিন" : !json ? "JSON ঠিক নেই — এডিটরের \"JSON কপি\" থেকে পেস্ট করুন (অর্ডার ফর্ম ছাড়া অন্তত একটা সেকশন লাগবে)" : "";
  return { values, error };
}

/* ---------- ডেমো দোকান ---------- */
superApp.get("/demos", async (c) => {
  if (!allowed(c, "demos")) return forbidden(c);
  const { results } = await c.env.PLATFORM_DB.prepare("SELECT id, slug, demo_niche FROM shops WHERE demo_niche IS NOT NULL").all<{ id: string; slug: string; demo_niche: string }>();
  const ps = await platformSettings(c.env.PLATFORM_DB, true);
  const rows: DemoRow[] = NICHES.map((n) => {
    const sh = results.find((r) => r.demo_niche === n.key);
    return { key: n.key, niche: n.niche, name: n.name, theme: n.theme, productCount: n.products.length, shop: sh ? { id: sh.id, slug: sh.slug } : null, link: sh ? shopUrl(c.env, sh.slug) : null };
  });
  return page(c, "ডেমো দোকান", "demos", <DemosPage rows={rows} support={ps.support_phone || ""} />);
});

/** আগে কপি হওয়া ডেমো ছবি সব দোকানে এক জায়গার ছবিতে বদলানো, কপি মোছা (একবারে ৪০টা দোকান) */
superApp.post("/demos-share-images", async (c) => {
  if (!allowed(c, "demos")) return forbidden(c);
  const db = c.env.PLATFORM_DB;
  // কোথা পর্যন্ত হয়েছে মনে রাখা — পরের চাপে পরের দোকানগুলো (আগে প্রতিবার একই ৪০টা হতো)
  const cur = (await db.prepare("SELECT value FROM platform_settings WHERE key = 'demo_share_cursor'").first<{ value: string }>())?.value || "";
  const [afterAt = "", afterId = ""] = cur.split("|");
  const { results } = await db.prepare(
    "SELECT id, created_at FROM shops WHERE (niche IS NOT NULL OR demo_niche IS NOT NULL) AND deleted_at IS NULL AND (created_at > ?1 OR (created_at = ?1 AND id > ?2)) ORDER BY created_at, id LIMIT 20",
  ).bind(afterAt, afterId).all<{ id: string; created_at: string }>();
  let freed = 0, n = 0;
  // একসাথে ৫টা করে — এক এক করে করলে অনেক সময় লাগত
  for (let i = 0; i < results.length; i += 5) {
    const part = await Promise.allSettled(results.slice(i, i + 5).map((r) => c.env.SHOP.getByName(r.id).adoptSharedDemoImages(r.id)));
    for (const [j, p] of part.entries()) {
      if (p.status === "fulfilled") { freed += p.value; n++; } else console.error("share images", results[i + j].id, p.reason);
    }
  }
  const last = results[results.length - 1];
  const left = last
    ? ((await db.prepare("SELECT COUNT(*) n FROM shops WHERE (niche IS NOT NULL OR demo_niche IS NOT NULL) AND deleted_at IS NULL AND (created_at > ?1 OR (created_at = ?1 AND id > ?2))").bind(last.created_at, last.id).first<{ n: number }>())?.n ?? 0)
    : 0;
  const next = last && left > 0 ? `${last.created_at}|${last.id}` : "";
  await db.prepare("INSERT INTO platform_settings (key, value) VALUES ('demo_share_cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(next).run();
  await audit(c, "demo.share_images", null, null, `${n}টা দোকান, ${Math.round(freed / 1024)} KB খালি, বাকি ${left}`);
  const mbFreed = bn(Math.round(freed / 1024 / 102.4) / 10);
  flash(c, "ok", left > 0
    ? `${bn(n)}টা দোকান হলো — ${mbFreed} MB খালি। আরও ${bn(left)}টা বাকি, বোতামটা আবার চাপুন।`
    : `${bn(n)}টা দোকান হলো — ${mbFreed} MB খালি। সব দোকান শেষ।`);
  return c.redirect("/super/demos", 303);
});

superApp.post("/demos/:key", async (c) => {
  if (!allowed(c, "demos")) return forbidden(c);
  const n = nicheByKey(c.req.param("key"));
  if (!n) return c.redirect("/super/demos", 303);
  const db = c.env.PLATFORM_DB;
  const ps = await platformSettings(db, true);
  const phone = normalizePhone(ps.support_phone || "") || "";
  let shop = await db.prepare("SELECT id, slug FROM shops WHERE demo_niche = ?").bind(n.key).first<{ id: string; slug: string }>();
  if (!shop) {
    let slug = n.key;
    if (await db.prepare("SELECT 1 FROM shops WHERE slug = ?").bind(slug).first()) slug = `${n.key}-demo`;
    if (await db.prepare("SELECT 1 FROM shops WHERE slug = ?").bind(slug).first()) {
      flash(c, "error", `"${n.key}" ঠিকানা আগেই নেওয়া — ডেমো তৈরি হয়নি।`);
      return c.redirect("/super/demos", 303);
    }
    shop = { id: crypto.randomUUID(), slug };
    await db.prepare(
      `INSERT INTO shops (id, slug, name, owner_name, owner_phone, owner_email, status, demo_niche, niche, activated_at)
       VALUES (?, ?, ?, 'SellxBD ডেমো', ?, ?, 'active', ?, ?, datetime('now'))`,
    ).bind(shop.id, slug, n.name, phone, `demo+${n.key}@${c.env.PLATFORM_DOMAIN}`, n.key, n.key).run();
  }
  const pw = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const r = await c.env.SHOP.getByName(shop.id).setupDemoShop({
    shopId: shop.id, niche: n.key, phone, ownerEmail: `demo+${n.key}@${c.env.PLATFORM_DOMAIN}`, passwordHash: await hashPassword(pw),
    signupUrl: `https://${c.env.PLATFORM_DOMAIN}/signup?niche=${n.key}`,
  });
  // ডেমোর ছবি সাইটের নিজের ফাইল থেকে (public/demo-img) — কপি নয়; আগে কপি হয়ে থাকলে সেটাও বদলে কপি মুছে ফেলা
  const stub = c.env.SHOP.getByName(shop.id);
  await stub.adoptSharedDemoImages(shop.id);
  const set = await stub.useSharedNicheImages(shop.id, n.key);
  const images = { length: set }; // বার্তার জন্য: কতগুলো ছবি বসল
  clearShopCache();
  await audit(c, "demo.setup", "shop", shop.id, `${n.key}: ${r.products} পণ্য, ${images.length} নতুন ছবি`);
  flash(c, "ok", `${n.name} ডেমো দোকান তৈরি/আপডেট হয়েছে — ${bn(r.products)}টা পণ্য, ${bn(images.length)}টা নতুন ছবি বসেছে।`);
  return c.redirect("/super/demos", 303);
});

superApp.get("/templates", async (c) => {
  if (!allowed(c, "templates")) return forbidden(c);
  const { results } = await c.env.PLATFORM_DB.prepare("SELECT * FROM landing_templates ORDER BY sort_order, id").all<TplRow>();
  return page(c, "ল্যান্ডিং টেমপ্লেট", "templates", <TemplatesPage rows={results} categories={TEMPLATE_CATEGORIES} />);
});

superApp.post("/templates", async (c) => {
  if (!allowed(c, "templates")) return forbidden(c);
  const { values: v, error } = tplInput(await c.req.parseBody());
  if (error) return page(c, "নতুন টেমপ্লেট", "templates", <div class="sa-card"><TemplateForm t={v} categories={TEMPLATE_CATEGORIES} error={error} /></div>, 422);
  const row = await c.env.PLATFORM_DB.prepare("INSERT INTO landing_templates (name, category, description, json, sort_order) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(v.name, v.category, v.description, v.json, v.sort_order).first<{ id: number }>();
  await audit(c, "template.create", "template", String(row?.id ?? ""), v.name);
  flash(c, "ok", "টেমপ্লেট যোগ হয়েছে — এখন সব দোকানের গ্যালারিতে দেখাবে।");
  return c.redirect("/super/templates", 303);
});

superApp.get("/templates/:id{[0-9]+}", async (c) => {
  if (!allowed(c, "templates")) return forbidden(c);
  const t = await c.env.PLATFORM_DB.prepare("SELECT * FROM landing_templates WHERE id = ?").bind(toInt(c.req.param("id"))).first<TplRow>();
  if (!t) return c.redirect("/super/templates", 303);
  return page(c, `টেমপ্লেট: ${t.name}`, "templates",
    <div class="sa-card"><p><a href="/super/templates">← সব টেমপ্লেট</a></p><TemplateForm t={{ ...t, json: JSON.stringify(JSON.parse(t.json), null, 2) }} categories={TEMPLATE_CATEGORIES} /></div>);
});

superApp.post("/templates/:id{[0-9]+}", async (c) => {
  if (!allowed(c, "templates")) return forbidden(c);
  const id = toInt(c.req.param("id"));
  const { values: v, error } = tplInput(await c.req.parseBody());
  if (error) return page(c, "টেমপ্লেট এডিট", "templates", <div class="sa-card"><TemplateForm t={{ ...v, id }} categories={TEMPLATE_CATEGORIES} error={error} /></div>, 422);
  await c.env.PLATFORM_DB.prepare("UPDATE landing_templates SET name=?, category=?, description=?, json=?, sort_order=?, updated_at=datetime('now') WHERE id=?")
    .bind(v.name, v.category, v.description, v.json, v.sort_order, id).run();
  await audit(c, "template.update", "template", String(id), v.name);
  flash(c, "ok", "টেমপ্লেট সেভ হয়েছে।");
  return c.redirect("/super/templates", 303);
});

superApp.post("/templates/:id{[0-9]+}/toggle", async (c) => {
  if (!allowed(c, "templates")) return forbidden(c);
  const id = toInt(c.req.param("id"));
  await c.env.PLATFORM_DB.prepare("UPDATE landing_templates SET active = 1 - active, updated_at=datetime('now') WHERE id = ?").bind(id).run();
  await audit(c, "template.toggle", "template", String(id));
  return c.redirect("/super/templates", 303);
});

superApp.post("/templates/:id{[0-9]+}/delete", async (c) => {
  if (!allowed(c, "templates")) return forbidden(c);
  const id = toInt(c.req.param("id"));
  await c.env.PLATFORM_DB.prepare("DELETE FROM landing_templates WHERE id = ?").bind(id).run();
  await audit(c, "template.delete", "template", String(id));
  flash(c, "ok", "টেমপ্লেট মুছে ফেলা হয়েছে।");
  return c.redirect("/super/templates", 303);
});

/* ---------- অডিট লগ ---------- */
superApp.get("/audit", async (c) => {
  if (!allowed(c, "audit")) return forbidden(c);
  const db = c.env.PLATFORM_DB;
  const action = str(c.req.query("action"), 40);
  const adminEmail = str(c.req.query("admin"), 120);
  const pg = Math.max(1, toInt(c.req.query("page"), 1));
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (action) { conds.push("a.action = ?"); binds.push(action); }
  if (adminEmail) { conds.push("a.admin_email = ?"); binds.push(adminEmail); }
  const [rows, admins] = await db.batch([
    db.prepare(`SELECT a.*, s.name shop_name FROM audit_log a LEFT JOIN shops s ON a.target_type = 'shop' AND s.id = a.target_id
      ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""} ORDER BY a.id DESC LIMIT ? OFFSET ?`).bind(...binds, 101, (pg - 1) * 100),
    db.prepare("SELECT email FROM super_admins ORDER BY email"),
  ]);
  const list = rows!.results as AuditRow[];
  return page(c, "অডিট লগ", "audit",
    <AuditPage rows={list.slice(0, 100)} more={list.length > 100} page={pg} action={action} admin={adminEmail} admins={(admins!.results as { email: string }[]).map((x) => x.email)} />);
});

/* ---------- এরর লগ ---------- */
superApp.get("/errors", async (c) => {
  if (!allowed(c, "errors")) return forbidden(c);
  const db = c.env.PLATFORM_DB;
  const all = c.req.query("all") === "1";
  const [rows, open] = await db.batch([
    db.prepare(`SELECT e.*, s.name shop_name FROM error_log e LEFT JOIN shops s ON s.id = e.shop_id ${all ? "" : "WHERE e.resolved = 0"} ORDER BY e.last_at DESC LIMIT 200`),
    db.prepare("SELECT COUNT(*) n FROM error_log WHERE resolved = 0"),
  ]);
  return page(c, "এরর লগ", "errors",
    <ErrorsPage rows={rows!.results as ErrorRow[]} showResolved={all} open={(open!.results[0] as { n: number }).n} role={me(c).role} />);
});

superApp.post("/errors/:id{[0-9]+}/resolve", async (c) => {
  if (!allowed(c, "errors")) return forbidden(c);
  await c.env.PLATFORM_DB.prepare("UPDATE error_log SET resolved = 1 WHERE id = ?").bind(toInt(c.req.param("id"))).run();
  flash(c, "ok", "সমাধান হিসেবে চিহ্নিত।");
  return c.redirect("/super/errors", 303);
});

/* ---------- টিম ---------- */
async function renderTeam(c: PCtx, form?: { errors: Record<string, string>; values: Record<string, string> }) {
  const { results } = await c.env.PLATFORM_DB.prepare("SELECT id, email, name, role, active, last_login_at, created_at FROM super_admins ORDER BY active DESC, id").all<TeamRow>();
  return page(c, "টিম", "team", <TeamPage rows={results} me={me(c).id} errors={form?.errors} values={form?.values} />, form ? 422 : 200);
}
const ROLES: SuperRole[] = ["owner", "admin", "support", "finance"];

superApp.get("/team", (c) => (allowed(c, "team") ? renderTeam(c) : forbidden(c)));

superApp.post("/team", async (c) => {
  if (!allowed(c, "team")) return forbidden(c);
  const b = await c.req.parseBody();
  const values = { name: str(b.name, 80), email: str(b.email, 120).toLowerCase(), role: ROLES.includes(b.role as SuperRole) ? String(b.role) : "support" };
  const password = typeof b.password === "string" ? b.password : "";
  const errors: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "সঠিক ইমেইল দিন";
  else if (await c.env.PLATFORM_DB.prepare("SELECT 1 FROM super_admins WHERE email = ?").bind(values.email).first()) errors.email = "এই ইমেইল আগেই আছে";
  if (password.length < 10) errors.password = "কমপক্ষে ১০ অক্ষর";
  if (Object.keys(errors).length) return renderTeam(c, { errors, values });
  await c.env.PLATFORM_DB.prepare("INSERT INTO super_admins (email, name, role, password_hash) VALUES (?, ?, ?, ?)")
    .bind(values.email, values.name || null, values.role, await hashPassword(password)).run();
  await audit(c, "team.add", "admin", values.email, SUPER_ROLE_LABEL[values.role as SuperRole]);
  flash(c, "ok", `${values.email} টিমে যোগ হয়েছে।`);
  return c.redirect("/super/team", 303);
});

superApp.post("/team/:id", async (c) => {
  if (!allowed(c, "team")) return forbidden(c);
  const id = toInt(c.req.param("id"));
  if (id === me(c).id) return c.redirect("/super/team", 303); // নিজেকে বন্ধ/নামানো যায় না
  const b = await c.req.parseBody();
  const role = ROLES.includes(b.role as SuperRole) ? String(b.role) : "support";
  const active = b.active === "0" ? 0 : 1;
  const db = c.env.PLATFORM_DB;
  const target = await db.prepare("SELECT email FROM super_admins WHERE id = ?").bind(id).first<{ email: string }>();
  if (!target) return c.redirect("/super/team", 303);
  await db.batch([
    db.prepare("UPDATE super_admins SET role = ?, active = ? WHERE id = ?").bind(role, active, id),
    ...(active ? [] : [db.prepare("DELETE FROM super_sessions WHERE admin_id = ?").bind(id)]),
  ]);
  await audit(c, "team.update", "admin", target.email, `${SUPER_ROLE_LABEL[role as SuperRole]}${active ? "" : " · বন্ধ"}`);
  flash(c, "ok", "সেভ হয়েছে।");
  return c.redirect("/super/team", 303);
});

/* ---------- নিজের অ্যাকাউন্ট ---------- */
superApp.get("/account", (c) => page(c, "আমার অ্যাকাউন্ট", "account", <AccountPage admin={me(c)} />));

superApp.post("/account", async (c) => {
  const b = await c.req.parseBody();
  const db = c.env.PLATFORM_DB;
  const name = str(b.name, 80);
  const password = typeof b.password === "string" ? b.password : "";
  if (password) {
    const row = await db.prepare("SELECT password_hash FROM super_admins WHERE id = ?").bind(me(c).id).first<{ password_hash: string }>();
    const current = typeof b.current === "string" ? b.current : "";
    if (!row || !(await verifyPassword(current, row.password_hash))) return page(c, "আমার অ্যাকাউন্ট", "account", <AccountPage admin={me(c)} error="বর্তমান পাসওয়ার্ড ভুল" />, 422);
    if (password.length < 10) return page(c, "আমার অ্যাকাউন্ট", "account", <AccountPage admin={me(c)} error="নতুন পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের দিন" />, 422);
    await db.prepare("UPDATE super_admins SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), me(c).id).run();
    await audit(c, "team.password", "admin", me(c).email);
  }
  await db.prepare("UPDATE super_admins SET name = ? WHERE id = ?").bind(name || null, me(c).id).run();
  flash(c, "ok", password ? "পাসওয়ার্ড বদলেছে।" : "সেভ হয়েছে।");
  return c.redirect("/super/account", 303);
});

superApp.post("/account/logout-all", async (c) => {
  await c.env.PLATFORM_DB.prepare("DELETE FROM super_sessions WHERE admin_id = ?").bind(me(c).id).run();
  clearSession(c, SUPER_COOKIES);
  return c.redirect("/super/login", 303);
});

/* ---------- প্ল্যাটফর্ম সেটিংস ---------- */
const NUM_KEYS = ["staff_fee", "min_topup", "trial_days", "trial_orders", "grace_days",
  ...PLAN_KEYS.flatMap((k) => [`plan_${k}_price`, `plan_${k}_orders`, `plan_${k}_staff`, `plan_${k}_storage`])];
const DEC_KEYS = PLAN_KEYS.map((k) => `plan_${k}_extra`);
const TEXT_KEYS = ["bkash_number", "nagad_number", "support_phone"];

superApp.get("/settings", async (c) => {
  if (!allowed(c, "settings")) return forbidden(c);
  const ps = await platformSettings(c.env.PLATFORM_DB, true);
  return page(c, "প্ল্যাটফর্ম সেটিংস", "settings", <><SettingsPage s={ps} /><SecuritySettings s={ps} emailBinding={!!c.env.EMAIL} /></>);
});

superApp.post("/settings/security", async (c) => {
  if (!allowed(c, "settings")) return forbidden(c);
  const b = await c.req.parseBody();
  const db = c.env.PLATFORM_DB;
  const vals: [string, string][] = [
    ["turnstile_site_key", str(b.turnstile_site_key, 120)],
    ["verify_email", b.verify_email === "1" ? "1" : "0"],
    ["verify_email_from", str(b.verify_email_from, 120)],
    ["verify_phone", ["call", "sms"].includes(String(b.verify_phone)) ? String(b.verify_phone) : "0"],
    ["sms_provider", ["bulksmsbd", "smsnetbd"].includes(str(b.sms_provider, 20)) ? str(b.sms_provider, 20) : "bulksmsbd"],
    ["sms_sender_id", str(b.sms_sender_id, 30)],
  ];
  // গোপন কী: খালি রাখলে আগেরটাই থাকে
  for (const k of ["turnstile_secret", "sms_api_key"]) { const v = str(b[k], 200); if (v) vals.push([k, v]); }
  const before = await platformSettings(db, true);
  await db.batch(vals.map(([k, v]) => db.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v)));
  clearSettingsCache();
  const secret = new Set(["turnstile_secret", "sms_api_key"]);
  const changed = vals.filter(([k, v]) => (before[k] ?? "") !== v).map(([k, v]) => (secret.has(k) ? `${k}: বদলেছে` : `${k}: ${before[k] ?? ""} → ${v}`));
  if (changed.length) await audit(c, "settings.security", "settings", null, changed.join(", "));
  flash(c, "ok", "নিরাপত্তা সেটিংস সেভ হয়েছে।");
  return c.redirect("/super/settings", 303);
});

superApp.post("/settings", async (c) => {
  if (!allowed(c, "settings")) return forbidden(c);
  const b = await c.req.parseBody();
  const before = await platformSettings(c.env.PLATFORM_DB, true);
  const values = [
    ...NUM_KEYS.map((k) => [k, String(Math.max(0, toInt(b[k], 0)))]),
    ...DEC_KEYS.map((k) => { const n = parseFloat(String(b[k] ?? "")); return [k, String(Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0)]; }),
    ...TEXT_KEYS.map((k) => [k, str(b[k], 30)]),
  ] as [string, string][];
  await c.env.PLATFORM_DB.batch(values.map(([k, v]) =>
    c.env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v)));
  clearSettingsCache();
  const changed = values.filter(([k, v]) => (before[k] ?? "") !== v).map(([k, v]) => `${k}: ${before[k] ?? ""} → ${v}`);
  if (changed.length) await audit(c, "settings.update", "settings", null, changed.join(", "));
  flash(c, "ok", "সেটিংস সেভ হয়েছে।");
  return c.redirect("/super/settings", 303);
});

/* ---------- সাপোর্ট (টিকেট + লাইভ চ্যাট) ---------- */
registerSuperSupport(superApp, { page, flash, allowed, forbidden, audit });
