/**
 * দোকানের অ্যাডমিন — প্রফেশনাল লেআউট (সাইডবার), ড্যাশবোর্ড আর সেটিংস কেন্দ্র।
 */
import { LANGS } from "../i18n";
import type { Child } from "hono/jsx";
import { canAccess, ROLE_LABEL, type Role } from "../lib/auth";
import { bn, dhakaTime, imageUrl, taka } from "../lib/format";
import { STATUS_LABEL, type OrderStatus } from "../lib/orders";
import { THEMES, type Settings, type ThemeKey } from "../lib/settings";
import { CAT_BLOCK, GROUPS, HOME_SECTIONS, type Cfg, type Field } from "../lib/theme-config";
import { ASSET_VERSION } from "./layout";
import { ChatWidget } from "./support";
import { Icon, type IconName } from "./icons";
import { MediaField } from "./media-field";
import { PAY_NAME, PAY_TYPE, payMethods } from "../lib/payment";

/* ---------- সাইডবার লেআউট ---------- */
const NAV: { key: string; href: string; icon: IconName; label: string; group?: string; perm?: string }[] = [
  { key: "dashboard", href: "/admin", icon: "layout-dashboard", label: "ড্যাশবোর্ড" },
  { key: "orders", href: "/admin/orders", icon: "receipt", label: "অর্ডার", group: "বিক্রি" },
  { key: "incomplete", href: "/admin/incomplete", icon: "hourglass", label: "অসম্পূর্ণ অর্ডার" },
  { key: "customers", href: "/admin/customers", icon: "users", label: "কাস্টমার" },
  { key: "reports", href: "/admin/reports", icon: "chart-column", label: "রিপোর্ট" },
  { key: "profit", href: "/admin/profit", icon: "wallet", label: "লাভের হিসাব" },
  { key: "products", href: "/admin/products", icon: "package", label: "পণ্য", group: "পণ্য" },
  { key: "inventory", href: "/admin/inventory", icon: "boxes", label: "ইনভেন্টরি" },
  { key: "categories", href: "/admin/categories", icon: "folder", label: "ক্যাটাগরি" },
  { key: "reviews", href: "/admin/reviews", icon: "star", label: "রিভিউ" },
  { key: "theme", href: "/admin/design", icon: "palette", label: "থিম এডিটর", group: "অনলাইন স্টোর", perm: "settings" },
  { key: "landing", href: "/admin/landing", icon: "layout-template", label: "ল্যান্ডিং পেজ" },
  { key: "pages", href: "/admin/pages", icon: "file-text", label: "পেজ ও ব্লগ" },
  { key: "media", href: "/admin/media", icon: "image", label: "মিডিয়া" },
  { key: "coupons", href: "/admin/coupons", icon: "ticket", label: "কুপন", group: "মার্কেটিং" },
  { key: "ads", href: "/admin/ads", icon: "megaphone", label: "অ্যাড ও ক্যাটালগ" },
  { key: "tracking", href: "/admin/settings/tracking", icon: "trending-up", label: "পিক্সেল ও ট্র্যাকিং", perm: "settings" },
  { key: "sms", href: "/admin/sms", icon: "message-square", label: "SMS" },
  { key: "courier", href: "/admin/courier", icon: "truck", label: "কুরিয়ার", group: "ডেলিভারি" },
  { key: "delivery", href: "/admin/settings/delivery", icon: "package", label: "ডেলিভারি চার্জ", perm: "settings" },
  { key: "payment", href: "/admin/settings/payment", icon: "wallet", label: "অগ্রিম পেমেন্ট", perm: "settings" },
  { key: "fraud-check", href: "/admin/fraud-check", icon: "search", label: "ফ্রড চেকার" },
  { key: "blacklist", href: "/admin/blacklist", icon: "shield-alert", label: "ফেক অর্ডার ব্লক" },
  { key: "settings", href: "/admin/settings", icon: "settings", label: "দোকানের সেটিংস", group: "সেটিংস" },
  { key: "domains", href: "/admin/domain", icon: "globe", label: "ডোমেইন" },
  { key: "staff", href: "/admin/staff", icon: "users", label: "স্টাফ" },
  { key: "billing", href: "/admin/billing", icon: "credit-card", label: "বিলিং ও রিচার্জ" },
  { key: "export", href: "/admin/export", icon: "download", label: "স্টোরেজ" },
  { key: "support", href: "/admin/support", icon: "life-buoy", label: "সাপোর্ট", group: "সাহায্য" },
];

/** প্যানেলের প্রতিটা পেজের পাশে "কীভাবে?" — sellxbd.com/help-এর গাইড */
const HELP_BASE = "https://sellxbd.com/help";
const HELP_FOR: Record<string, string> = {
  dashboard: "setup-checklist", orders: "orders", incomplete: "incomplete-orders", customers: "customers", reports: "reports", profit: "profit", reviews: "reviews", products: "add-product",
  inventory: "inventory", categories: "add-product", theme: "theme-editor", landing: "landing-page", pages: "pages", media: "media-library",
  coupons: "coupons", ads: "catalog-ads", tracking: "pixel", sms: "sms", courier: "courier", delivery: "delivery-charge", payment: "advance-payment", blacklist: "fake-orders",
  settings: "setup-checklist", domains: "domain", staff: "staff", billing: "billing", export: "backup", support: "support",
};

export const ShopShell = (p: {
  title: string;
  settings: Settings;
  active?: string;
  email: string;
  role: Role;
  newOrders?: number;
  top?: Child;
  children?: Child;
}) => {
  const s = p.settings;
  return (
    <html lang="bn">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{p.title} — {s.site_name || "দোকান"} অ্যাডমিন</title>
        <link rel="manifest" href="/admin-manifest.webmanifest" />
        <meta name="theme-color" content="#0f766e" />
        <link rel="apple-touch-icon" href="/icons/app-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={s.site_name || "দোকান"} />
        <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
        <link rel="stylesheet" href={`/css/admin.css?v=${ASSET_VERSION}`} />
        <link rel="stylesheet" href={`/css/super.css?v=${ASSET_VERSION}`} />
        <link rel="stylesheet" href={`/css/support.css?v=${ASSET_VERSION}`} />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" />
        <link rel="stylesheet" href={`/css/ui.css?v=${ASSET_VERSION}`} />
        {s.favicon ? <link rel="icon" href={imageUrl(s.favicon)} /> : s.logo ? <link rel="icon" href={imageUrl(s.logo)} /> : null}
      </head>
      <body class="sa admin shop-admin">
        <input type="checkbox" id="sa-nav-toggle" class="sa-nav-toggle" aria-label="মেনু" />
        <aside class="sa-side">
          <a href="/admin" class="sa-brand">
            {s.logo ? <img src={imageUrl(s.logo)} alt="" class="sa-shop-logo" /> : <span class="sa-logo">{(s.site_name || "দ").slice(0, 1)}</span>}
            <span>{s.site_name || "আমার দোকান"}<small>অ্যাডমিন প্যানেল</small></span>
          </a>
          <nav class="sa-nav">
            {NAV.filter((n) => n.key === "dashboard" || canAccess(p.role, n.perm ?? n.key)).map((n, i, arr) => (
              <>
                {n.group && (i === 0 || arr[i - 1]!.group !== n.group) && <div class="sa-nav-group">{n.group}</div>}
                <a href={n.href} class={p.active === n.key ? "active" : ""}>
                  <Icon name={n.icon} />{n.label}
                  {n.key === "orders" && (p.newOrders ?? 0) > 0 && <span class="sa-badge">{bn(p.newOrders!)}</span>}
                  {n.key === "support" && <span class="sa-badge" data-sx-nav-badge hidden></span>}
                </a>
              </>
            ))}
          </nav>
          <div class="sa-me">
            <a href="/admin/account" class="sa-me-link" title="আমার অ্যাকাউন্ট — পাসওয়ার্ড বদল, সব ডিভাইস থেকে লগআউট">
              <span class="sa-avatar">{p.email.slice(0, 1).toUpperCase()}</span>
              <span><b>{p.email}</b><small>{ROLE_LABEL[p.role]} · অ্যাকাউন্ট</small></span>
            </a>
            <form method="post" action="/admin/logout"><button class="sa-logout" title="লগআউট" aria-label="লগআউট"><Icon name="log-out" /></button></form>
          </div>
        </aside>
        <label for="sa-nav-toggle" class="sa-scrim" aria-hidden="true"></label>
        <div class="sa-main">
          {p.top}
          <header class="sa-top">
            <label for="sa-nav-toggle" class="sa-burger" aria-label="মেনু"><Icon name="menu" size="lg" /></label>
            <h1>{p.title}</h1>
            <div class="sa-top-actions">
              {p.active && HELP_FOR[p.active] && (
                <a href={`${HELP_BASE}/${HELP_FOR[p.active!]}`} target="_blank" rel="noopener" class="sa-btn sa-btn-ghost sa-btn-sm" title="এই পেজ কীভাবে ব্যবহার করবেন">
                  <Icon name="life-buoy" size="sm" /> <span class="sa-hide-sm">কীভাবে?</span>
                </a>
              )}
              <a href="/" target="_blank" rel="noopener" class="sa-btn sa-btn-ghost sa-btn-sm"><Icon name="store" size="sm" /> দোকান দেখুন <Icon name="external-link" size="sm" /></a>
            </div>
          </header>
          <main class="sa-content admin-main">{p.children}</main>
        </div>
        <nav class="sa-tabbar" aria-label="দ্রুত মেনু">
          <a href="/admin" class={p.active === "dashboard" ? "on" : ""}><Icon name="layout-dashboard" /><span>হোম</span></a>
          <a href="/admin/orders" class={p.active === "orders" ? "on" : ""}><Icon name="receipt" /><span>অর্ডার</span>{(p.newOrders ?? 0) > 0 && <b class="sa-tab-badge">{bn(p.newOrders!)}</b>}</a>
          {canAccess(p.role, "products")
            ? <a href="/admin/products" class={p.active === "products" ? "on" : ""}><Icon name="package" /><span>পণ্য</span></a>
            : <a href="/admin/customers" class={p.active === "customers" ? "on" : ""}><Icon name="users" /><span>কাস্টমার</span></a>}
          <label for="sa-nav-toggle"><Icon name="menu" /><span>আরও</span></label>
        </nav>
        <ChatWidget shopName={s.site_name || ""} />
        <script src={`/js/admin.js?v=${ASSET_VERSION}`} defer></script>
        <script src={`/js/media.js?v=${ASSET_VERSION}`} defer></script>
        <script src={`/js/support.js?v=${ASSET_VERSION}`} defer></script>
      </body>
    </html>
  );
};

/* ---------- ড্যাশবোর্ড ---------- */
export type SetupStep = { key: string; label: string; desc: string; done: boolean; href: string };
export type ShopDash = {
  today: { orders: number; value: number };
  yesterday: { orders: number; value: number };
  pending: number;
  d30: { orders: number; confirmed: number; fake: number; sales: number; aov: number };
  chart: { label: string; all: number; confirmed: number }[];
  recent: { id: number; order_no: string; name: string; phone: string; total: number; status: OrderStatus; created_at: string }[];
  top: { product_name: string; n: number; amount: number }[];
  products: { total: number; active: number };
  setup: SetupStep[];
  storeUrl: string;
  lowStock?: { product_id: number; name: string; stock: number }[];
  pushKey?: string;
};

const pct = (n: number) => `${bn((Math.round(n * 10) / 10).toString())}%`;
const n0 = (n: number) => bn(Math.round(n).toLocaleString("en-IN"));

const Kpi = (p: { label: string; value: string; sub?: Child; tone?: string; href?: string }) => {
  const inner = (
    <>
      <div class="sa-kpi-label">{p.label}</div>
      <div class="sa-kpi-value">{p.value}</div>
      {p.sub && <div class={`sa-kpi-sub ${p.tone ? `sa-${p.tone}` : ""}`}>{p.sub}</div>}
    </>
  );
  return p.href ? <a class="sa-kpi" href={p.href}>{inner}</a> : <div class="sa-kpi">{inner}</div>;
};

/** দুই রঙের বার চার্ট (মোট অর্ডার আর কনফার্ম) */
const OrdersChart = ({ data }: { data: ShopDash["chart"] }) => {
  const W = 640, H = 190, padL = 30, padB = 22, padT = 10;
  const max = Math.max(1, ...data.map((d) => d.all));
  const top = max <= 5 ? 5 : Math.ceil(max / 5) * 5;
  const bw = (W - padL) / Math.max(1, data.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  return (
    <svg class="sa-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="প্রতিদিনের অর্ডার">
      {[0, 0.5, 1].map((t) => (
        <g><line x1={padL} x2={W} y1={y(top * t)} y2={y(top * t)} class="sa-grid" /><text x={padL - 6} y={y(top * t) + 4} class="sa-axis" text-anchor="end">{bn(Math.round(top * t))}</text></g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * bw;
        const hAll = H - padB - y(d.all);
        const hC = H - padB - y(d.confirmed);
        return (
          <g>
            <rect x={x + bw * 0.15} y={H - padB - hAll} width={bw * 0.7} height={Math.max(0, hAll)} rx="3" fill="#cbd5e1"><title>{d.label}: {bn(d.all)}টা অর্ডার, {bn(d.confirmed)}টা কনফার্ম</title></rect>
            <rect x={x + bw * 0.15} y={H - padB - hC} width={bw * 0.7} height={Math.max(0, hC)} rx="3" fill="var(--brand, #0f766e)"><title>{d.label}: {bn(d.confirmed)}টা কনফার্ম</title></rect>
            {i % 2 === 0 && <text x={x + bw / 2} y={H - 6} class="sa-axis" text-anchor="middle">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
};

const ORDER_PILL: Record<string, string> = { new: "sa-os-new", confirmed: "sa-os-confirmed", shipped: "sa-os-shipped", cancelled: "sa-os-cancelled", fake: "sa-os-fake" };

export const ShopDashboardPage = ({ d, role }: { d: ShopDash; role: Role }) => {
  const done = d.setup.filter((x) => x.done).length;
  const vsY = d.yesterday.orders ? ((d.today.orders - d.yesterday.orders) / d.yesterday.orders) * 100 : 0;
  const confirmRate = d.d30.orders ? (d.d30.confirmed / d.d30.orders) * 100 : 0;
  const fakeRate = d.d30.orders ? (d.d30.fake / d.d30.orders) * 100 : 0;
  return (
    <>
      {d.setup.length > 0 && done < d.setup.length && canAccess(role, "settings") && (
        <section class="sa-card setup-card">
          <div class="sa-card-head">
            <h2><Icon name="rocket" /> দোকান সেটআপ — {bn(done)}/{bn(d.setup.length)} শেষ</h2>
            <span class="sa-muted">সব ধাপ শেষ করলে দোকান পুরোপুরি তৈরি</span>
          </div>
          <div class="setup-bar"><span style={`width:${(done / d.setup.length) * 100}%`}></span></div>
          <ul class="setup-list">
            {d.setup.map((x) => (
              <li class={x.done ? "done" : ""}>
                <span class="setup-tick">{x.done ? <Icon name="check" size="sm" /> : ""}</span>
                <div><b>{x.label}</b><small>{x.desc}</small></div>
                {!x.done && <a href={x.href} class="sa-btn sa-btn-sm sa-btn-ghost">এখনই করুন →</a>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div class="sa-kpis">
        <Kpi label="আজকের অর্ডার" value={n0(d.today.orders)} sub={d.yesterday.orders ? `গতকাল ${n0(d.yesterday.orders)}টা (${vsY >= 0 ? "▲" : "▼"} ${pct(Math.abs(vsY))})` : `গতকাল ${n0(d.yesterday.orders)}টা`} tone={vsY >= 0 ? "up" : "down"} href="/admin/orders?status=new" />
        <Kpi label="কনফার্মের অপেক্ষায়" value={n0(d.pending)} sub={d.pending ? "কল করে কনফার্ম করুন →" : "সব অর্ডার দেখা হয়েছে ✓"} tone={d.pending ? "warn" : "up"} href="/admin/orders?status=new" />
        <Kpi label="বিক্রি (৩০ দিন)" value={taka(d.d30.sales)} sub={`গড় অর্ডার ${taka(d.d30.aov)}`} href={canAccess(role, "reports") ? "/admin/reports" : undefined} />
        <Kpi label="কনফার্ম রেট (৩০ দিন)" value={pct(confirmRate)} sub={`ফেক/বাতিল ${pct(fakeRate)}`} tone={fakeRate > 25 ? "down" : ""} />
      </div>

      <div class="sa-grid-2-1">
        <section class="sa-card">
          <div class="sa-card-head"><h2>শেষ ১৪ দিনের অর্ডার</h2><span class="sa-muted"><i class="lg lg-all"></i>মোট <i class="lg lg-ok"></i>কনফার্ম/শিপড</span></div>
          <OrdersChart data={d.chart} />
        </section>
        <section class="sa-card">
          <div class="sa-card-head"><h2>আপনার দোকানের লিংক</h2></div>
          <div class="store-link">
            <input type="text" value={d.storeUrl} readonly data-copy-src />
            <button type="button" class="sa-btn sa-btn-sm" data-copy>কপি</button>
          </div>
          <p class="sa-muted">ফেসবুক পোস্ট, অ্যাড আর বায়োতে এই লিংক দিন। প্রতিটা পণ্যের আলাদা ল্যান্ডিং পেজ লিংক পণ্যের পাতায় পাবেন।</p>
          <div class="quick-actions">
            {canAccess(role, "products") && <a href="/admin/products/new" class="sa-btn sa-btn-ghost"><Icon name="plus" size="sm" /> নতুন পণ্য</a>}
            {canAccess(role, "coupons") && <a href="/admin/coupons" class="sa-btn sa-btn-ghost"><Icon name="ticket" size="sm" /> কুপন</a>}
            {canAccess(role, "settings") && <a href="/admin/settings/tracking" class="sa-btn sa-btn-ghost"><Icon name="trending-up" size="sm" /> পিক্সেল</a>}
            <a href="/" target="_blank" rel="noopener" class="sa-btn sa-btn-ghost"><Icon name="store" size="sm" /> দোকান</a>
          </div>
          <div class="mini-stats">
            <div><small>পণ্য ({n0(d.products.active)}টা চালু)</small><b>{n0(d.products.total)}টা</b></div>
            <div><small>৩০ দিনে অর্ডার</small><b>{n0(d.d30.orders)}</b></div>
          </div>
        </section>
      </div>

      <div class="sa-grid-2-1">
        <section class="sa-card">
          <div class="sa-card-head"><h2>সাম্প্রতিক অর্ডার</h2><a href="/admin/orders" class="sa-link">সব অর্ডার →</a></div>
          {d.recent.length === 0 ? <p class="sa-empty">এখনো কোনো অর্ডার আসেনি। দোকানের লিংক শেয়ার করুন!</p> : (
            <div class="sa-table-wrap"><table class="sa-table">
              <thead><tr><th>অর্ডার</th><th>কাস্টমার</th><th class="sa-r">মোট</th><th>অবস্থা</th><th>সময়</th></tr></thead>
              <tbody>{d.recent.map((o) => (
                <tr>
                  <td><a href={`/admin/orders/${o.id}`}><b>{o.order_no}</b></a></td>
                  <td>{o.name}<br /><small class="sa-muted">{o.phone}</small></td>
                  <td class="sa-r">{taka(o.total)}</td>
                  <td><span class={`sa-pill ${ORDER_PILL[o.status] ?? ""}`}>{STATUS_LABEL[o.status]}</span></td>
                  <td><small>{dhakaTime(o.created_at)}</small></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
        <section class="sa-card">
          <div class="sa-card-head"><h2>সেরা পণ্য (৩০ দিন)</h2></div>
          {d.top.length === 0 ? <p class="sa-empty">এখনো বিক্রি নেই</p> : (
            <ol class="sa-rank">{d.top.map((t) => <li><span>{t.product_name}</span><b>{n0(t.n)}টা</b></li>)}</ol>
          )}
        </section>
        {d.pushKey && (
          <section class="sa-card push-card" data-push data-key={d.pushKey}>
            <div class="sa-card-head"><h2><Icon name="bell" size="sm" /> নতুন অর্ডারে ফোনে নোটিফিকেশন</h2></div>
            <p class="sa-muted small" data-push-text>অর্ডার এলেই এই ফোনে/কম্পিউটারে নোটিফিকেশন আসবে — প্যানেল বন্ধ থাকলেও।</p>
            <div class="quick-actions">
              <button type="button" class="sa-btn sa-btn-sm" data-push-on hidden><Icon name="bell" size="sm" /> চালু করুন</button>
              <button type="button" class="sa-btn sa-btn-ghost sa-btn-sm" data-push-test hidden>টেস্ট পাঠান</button>
              <button type="button" class="sa-btn sa-btn-ghost sa-btn-sm" data-push-off hidden>এই ডিভাইসে বন্ধ</button>
            </div>
            <p class="sa-muted small" data-push-ios hidden>iPhone-এ: Safari-তে Share → "Add to Home Screen" দিয়ে প্যানেল হোম স্ক্রিনে বসান, তারপর সেখান থেকে খুলে চালু করুন।</p>
          </section>
        )}
        {(d.lowStock ?? []).length > 0 && canAccess(role, "inventory") && (
          <section class="sa-card low-stock-card">
            <div class="sa-card-head"><h2>স্টক কম বা শেষ</h2><a href="/admin/inventory?f=low" class="sa-link">ইনভেন্টরি →</a></div>
            <ol class="sa-rank">{d.lowStock!.map((t) => <li><span>{t.name}</span><b class={t.stock <= 0 ? "inv-minus" : ""}>{t.stock <= 0 ? "শেষ" : `${n0(t.stock)}টা`}</b></li>)}</ol>
          </section>
        )}
      </div>
    </>
  );
};

/* ---------- সেটিংস কেন্দ্র ---------- */
export const SETTINGS_TABS: { key: string; href: string; label: string; icon: IconName; set: "shop" | "theme" }[] = [
  { key: "general", href: "/admin/settings", label: "দোকানের তথ্য", icon: "store", set: "shop" },
  { key: "checkout", href: "/admin/settings/checkout", label: "অর্ডার ফর্ম", icon: "receipt", set: "shop" },
  { key: "delivery", href: "/admin/settings/delivery", label: "ডেলিভারি চার্জ", icon: "truck", set: "shop" },
  { key: "payment", href: "/admin/settings/payment", label: "অগ্রিম পেমেন্ট", icon: "credit-card", set: "shop" },
  { key: "seo", href: "/admin/settings/seo", label: "SEO", icon: "search", set: "shop" },
  { key: "tracking", href: "/admin/settings/tracking", label: "পিক্সেল ও ট্র্যাকিং", icon: "trending-up", set: "shop" },
  { key: "customize", href: "/admin/design", label: "থিম এডিটর", icon: "sliders-horizontal", set: "theme" },
  { key: "appearance", href: "/admin/settings/appearance", label: "থিম বদল, লোগো ও ব্যানার", icon: "palette", set: "theme" },
];

const Tabs = ({ active }: { active: string }) => (
  <nav class="set-tabs">{SETTINGS_TABS.filter((t) => t.set === (SETTINGS_TABS.find((x) => x.key === active)?.set ?? "shop")).map((t) => <a href={t.href} class={active === t.key ? "active" : ""}><Icon name={t.icon} size="sm" />{t.label}</a>)}</nav>
);

const Section = (p: { title: string; desc?: Child; children?: Child }) => (
  <section class="sa-card set-section">
    <div class="set-section-head"><h2>{p.title}</h2>{p.desc && <p class="sa-muted">{p.desc}</p>}</div>
    <div class="set-fields">{p.children}</div>
  </section>
);

const F = (p: { label: string; hint?: Child; children?: Child; wide?: boolean }) => (
  <label class={`set-field ${p.wide ? "wide" : ""}`}>
    <span>{p.label}</span>
    {p.children}
    {p.hint && <small>{p.hint}</small>}
  </label>
);

const SettingsForm = (p: { section: string; action: string; children?: Child; multipart?: boolean }) => (
  <form method="post" action={p.action} class="set-form" enctype={p.multipart ? "multipart/form-data" : undefined}>
    <input type="hidden" name="_section" value={p.section} />
    {p.children}
    <div class="set-save"><button class="sa-btn">সেভ করুন</button></div>
  </form>
);

const IMG_FOLDER: Record<string, { folder: "banner" | "logo"; ratio: string }> = {
  logo: { folder: "logo", ratio: "free" }, favicon: { folder: "logo", ratio: "1:1" }, seo_image: { folder: "banner", ratio: "1.91:1" },
  banner_1: { folder: "banner", ratio: "8:3" }, banner_2: { folder: "banner", ratio: "8:3" }, banner_3: { folder: "banner", ratio: "8:3" },
};
const ImageField = ({ name, label, current, hint, accept = "image/png,image/jpeg,image/webp" }: { name: string; label: string; current?: string; hint: string; accept?: string }) => (
  <F label={label} hint={hint}>
    <MediaField fileName={name} pickName={`${name}_pick`} removeName={`remove_${name}`} current={current}
      folder={IMG_FOLDER[name]?.folder ?? "banner"} ratio={IMG_FOLDER[name]?.ratio} accept={accept} />
  </F>
);

export const SettingsGeneralPage = ({ s }: { s: Settings }) => (
  <>
    <Tabs active="general" />
    <SettingsForm section="general" action="/admin/settings">
      <Section title="দোকানের তথ্য" desc="কাস্টমার এগুলো দোকানের নিচে (ফুটারে) আর ধন্যবাদ পেজে দেখবেন।">
        <F label="দোকানের নাম *"><input type="text" name="site_name" value={s.site_name} required maxlength={100} /></F>
        <F label="যোগাযোগ নম্বর *" hint="অর্ডার নিয়ে প্রশ্নে কাস্টমার এই নম্বরে কল করবেন"><input type="tel" name="contact_phone" value={s.contact_phone} required maxlength={30} /></F>
        <F label="WhatsApp নম্বর"><input type="tel" name="whatsapp" value={s.whatsapp ?? ""} maxlength={20} placeholder="01XXXXXXXXX" /></F>
        <F label="ইমেইল"><input type="email" name="store_email" value={s.store_email ?? ""} maxlength={120} /></F>
        <F label="Facebook পেজের লিংক"><input type="url" name="facebook_page" value={s.facebook_page ?? ""} maxlength={200} placeholder="https://facebook.com/yourpage" /></F>
        <F label="ঠিকানা" wide><textarea name="store_address" rows={2} maxlength={300}>{s.store_address ?? ""}</textarea></F>
      </Section>
      <Section title="ভাষা / Language" desc="বাটন, মেনু, মেসেজ কোন ভাষায় দেখাবে। পণ্যের নাম, বিবরণ আর আপনার নিজের লেখা যেভাবে লিখবেন সেভাবেই থাকবে।">
        <F label="দোকানের ওয়েবসাইট" hint="কাস্টমার যা দেখেন — কাস্টমারের SMS আর ইনভয়েসও এই ভাষায়">
          <select name="site_lang">{(["bn", "en"] as const).map((l) => <option value={l} selected={(s.site_lang || "bn") === l} translate="no">{LANGS[l]}</option>)}</select>
        </F>
        <F label="অ্যাডমিন প্যানেল" hint="আপনি আর আপনার স্টাফরা যা দেখেন">
          <select name="admin_lang">{(["bn", "en"] as const).map((l) => <option value={l} selected={(s.admin_lang || "bn") === l} translate="no">{LANGS[l]}</option>)}</select>
        </F>
      </Section>
    </SettingsForm>
  </>
);

export const SettingsAppearancePage = ({ s }: { s: Settings }) => (
  <>
    <Tabs active="appearance" />
    <SettingsForm section="appearance" action="/admin/settings/appearance" multipart>
      <Section title="থিম" desc="দোকান আর ল্যান্ডিং পেজের সামগ্রিক চেহারা">
        <div class="theme-picks wide">
          {(Object.entries(THEMES) as [string, { name: string; desc: string }][]).map(([k, t]) => (
            <label class={`theme-pick tp-${k}`}>
              <input type="radio" name="theme" value={k} checked={(s.theme || "classic") === k} />
              <span class="tp-preview"><i></i><b></b><b></b></span>
              <strong>{t.name}</strong>
              <small>{t.desc}</small>
            </label>
          ))}
        </div>
      </Section>
      <Section title="লোগো">
        <ImageField name="logo" label="লোগো" current={s.logo} hint="PNG/JPG/WebP, ১ MB পর্যন্ত। ফাঁকা রাখলে আগেরটা থাকবে।" />
        <ImageField name="favicon" label="ফেভিকন (ব্রাউজারের ট্যাবের ছোট আইকন)" current={s.favicon} hint="বর্গাকার PNG, যেমন ৬৪×৬৪। না দিলে লোগো ব্যবহার হবে।" accept="image/png,image/webp" />
        <p class="muted small" style="grid-column:1/-1">দোকানের রং এখন <a href="/admin/design">থিম এডিটরে</a> — তৈরি রঙের জোড়া থেকে এক ক্লিকে বা নিজের মতো, প্রিভিউ দেখে।</p>
      </Section>
      <Section title="হোমপেজের ব্যানার" desc="সব থিমে হোমপেজের উপরে বড় ছবি। ব্যানার না দিলে সরাসরি পণ্য দেখাবে। ঘোষণা বার আর বাকি সব “থিম কাস্টমাইজ” ট্যাবে।">
        {([1, 2, 3] as const).map((n) => (
          <>
            <ImageField name={`banner_${n}`} label={`ব্যানার ${n}`} current={s[`banner_${n}`]} hint="চওড়া ছবি, যেমন ১২০০×৪৫০ (৮:৩)। JPG/WebP, ২ MB পর্যন্ত।" />
            <F label={`ব্যানার ${n}-এ ক্লিক করলে যাবে`} hint="ঐচ্ছিক — যেমন /p/product-slug বা /c/2">
              <input type="text" name={`banner_${n}_link`} value={s[`banner_${n}_link`] ?? ""} maxlength={200} placeholder="/p/..." />
            </F>
          </>
        ))}
      </Section>
    </SettingsForm>
  </>
);

export const SettingsDeliveryPage = ({ s }: { s: Settings }) => (
  <>
    <Tabs active="delivery" />
    <SettingsForm section="delivery" action="/admin/settings/delivery">
      <Section title="ডেলিভারি চার্জ" desc="অর্ডার ফর্মে কাস্টমার এলাকা বাছলে এই চার্জ যোগ হয়।">
        <F label="ঢাকার ভিতরে (৳) *"><input type="number" min="0" name="delivery_inside" value={s.delivery_inside} required /></F>
        <F label="ঢাকার বাইরে (৳) *"><input type="number" min="0" name="delivery_outside" value={s.delivery_outside} required /></F>
        <F label="ঢাকার ভিতরে কত দিনে পৌঁছায়" hint="ফর্মে দেখাবে, যেমন: ১–২ দিন"><input type="text" name="delivery_time_inside" value={s.delivery_time_inside ?? ""} maxlength={60} placeholder="১–২ দিন" /></F>
        <F label="ঢাকার বাইরে কত দিনে পৌঁছায়"><input type="text" name="delivery_time_outside" value={s.delivery_time_outside ?? ""} maxlength={60} placeholder="৩–৫ দিন" /></F>
      </Section>
      <Section title="ফ্রি ডেলিভারি" desc="নির্দিষ্ট টাকার বেশি অর্ডারে ডেলিভারি চার্জ লাগবে না — বড় অর্ডারে কাস্টমারকে উৎসাহ দেয়।">
        <F label="কত টাকার অর্ডারে ফ্রি (৳)" hint="০ দিলে বন্ধ থাকবে"><input type="number" min="0" name="free_delivery_min" value={s.free_delivery_min || "0"} /></F>
      </Section>
    </SettingsForm>
  </>
);

export const SettingsPaymentPage = ({ s }: { s: Settings }) => {
  const methods = payMethods(s);
  return (
  <>
    <Tabs active="payment" />
    <SettingsForm section="payment" action="/admin/settings/payment">
      <Section title="আপনার পেমেন্ট নম্বর" desc="ক্রেতা এই নম্বরে টাকা পাঠাবে — টাকা সরাসরি আপনার কাছে আসে। যেটা ব্যবহার করেন না সেটা ফাঁকা রাখুন।">
        {(["bkash", "nagad", "rocket"] as const).map((k) => (
          <>
            <F label={`${PAY_NAME[k]} নম্বর`}><input type="tel" name={`payment_${k}`} value={s[`payment_${k}`] ?? ""} inputmode="tel" placeholder="01XXXXXXXXX" maxlength={12} /></F>
            <F label={`${PAY_NAME[k]} অ্যাকাউন্টের ধরন`}>
              <select name={`payment_${k}_type`}>{Object.entries(PAY_TYPE).map(([t, l]) => <option value={t} selected={(s[`payment_${k}_type`] || "personal") === t}>{l}</option>)}</select>
            </F>
          </>
        ))}
      </Section>
      <Section title="কখন অগ্রিম চাইবেন" desc="ফেক অর্ডার আর ফেরত কমাতে ক্যাশ অন ডেলিভারির আগে কিছু টাকা অগ্রিম নিন। ক্রেতা টাকা পাঠিয়ে Transaction ID দেবে, আপনি নিজের অ্যাপে মিলিয়ে অর্ডারে &quot;পেয়েছি&quot; চাপবেন।">
        <F label="কত টাকা অগ্রিম">
          <select name="advance_mode">{Object.entries({ off: "অগ্রিম নেবেন না (শুধু ক্যাশ অন ডেলিভারি)", delivery: "শুধু ডেলিভারি চার্জ", fixed: "নির্দিষ্ট টাকা", full: "পুরো টাকা" }).map(([k, l]) => <option value={k} selected={(s.advance_mode || "off") === k}>{l}</option>)}</select>
        </F>
        <F label="নির্দিষ্ট টাকা হলে কত (৳)"><input type="number" name="advance_fixed" min="0" value={s.advance_fixed || "0"} /></F>
        <F label="কার কাছে চাইবেন">
          <select name="advance_who">{Object.entries({ all: "সব অর্ডারে", outside: "শুধু ঢাকার বাইরের অর্ডারে", risky: "শুধু ঝুঁকির ক্রেতার কাছে (আগে ফেক/ফেরত আছে)" }).map(([k, l]) => <option value={k} selected={(s.advance_who || "all") === k}>{l}</option>)}</select>
        </F>
        <F label="ক্রেতার জন্য নির্দেশনা (ঐচ্ছিক)" hint="যেমন: Send Money-র রেফারেন্সে আপনার মোবাইল নম্বর লিখুন" wide><input type="text" name="advance_note" value={s.advance_note ?? ""} maxlength={200} /></F>
        {(s.advance_mode || "off") !== "off" && methods.length === 0 && <p class="sa-bad">উপরে অন্তত একটা পেমেন্ট নম্বর দিন — নইলে অগ্রিম চাওয়া হবে না।</p>}
      </Section>
    </SettingsForm>
  </>
  );
};

export const SettingsCheckoutPage = ({ s }: { s: Settings }) => (
  <>
    <Tabs active="checkout" />
    <SettingsForm section="checkout" action="/admin/settings/checkout">
      <Section title="অর্ডার ফর্ম" desc="ল্যান্ডিং পেজ আর চেকআউটের অর্ডার ফর্ম">
        <F label="ফর্মের উপরের শিরোনাম" hint="যেমন: অর্ডার করতে নিচের ফর্মটি পূরণ করুন"><input type="text" name="order_form_title" value={s.order_form_title ?? ""} maxlength={100} /></F>
        <F label="সর্বনিম্ন অর্ডার (৳)" hint="এর কম দামের অর্ডার নেওয়া হবে না। ০ = সীমা নেই"><input type="number" min="0" name="min_order" value={s.min_order || "0"} /></F>
        <label class="set-check"><input type="checkbox" name="show_note" value="1" checked={s.show_note !== "0"} /> ফর্মে "নোট" ঘর দেখাবে</label>
        <label class="set-check"><input type="checkbox" name="sticky_submit" value="1" checked={s.sticky_submit !== "0"} /> মোবাইলে "অর্ডার কনফার্ম করুন" বাটন নিচে আটকে থাকবে</label>
        <label class="set-check"><input type="checkbox" name="incomplete_capture" value="1" checked={s.incomplete_capture !== "0"} /> অসম্পূর্ণ অর্ডার ধরবে — কেউ সঠিক নম্বর লিখে অর্ডার না করলে "অসম্পূর্ণ অর্ডার" তালিকায় দেখাবে</label>
        <F label="ইমেইল ঘর">
          <select name="checkout_email">{Object.entries({ off: "দেখাবে না", optional: "দেখাবে (ঐচ্ছিক)", required: "দেখাবে (অবশ্যই দিতে হবে)" }).map(([k, l]) => <option value={k} selected={(s.checkout_email || "off") === k}>{l}</option>)}</select>
        </F>
        <F label="এক পণ্য একবারে সর্বোচ্চ কয়টা" hint="কাস্টমার কার্ট/চেকআউটে + চেপে এর বেশি নিতে পারবে না। ফেক অর্ডার কমাতে ছোট রাখুন। ১ দিলে আগের মতো প্রতিটা পণ্য একটা করে।">
          <input type="number" name="max_qty" min="1" max="50" value={s.max_qty || "5"} />
        </F>
        <F label="ডেলিভারি এলাকা আগে থেকে বাছা থাকবে">
          <select name="default_area">{Object.entries({ inside: "ঢাকার ভিতরে", outside: "ঢাকার বাইরে", none: "কোনোটা না (কাস্টমার নিজে বাছবে)" }).map(([k, l]) => <option value={k} selected={(s.default_area || "inside") === k}>{l}</option>)}</select>
        </F>
        <F label="অর্ডার নম্বরের শুরুর অক্ষর" hint="ইংরেজি বড় অক্ষর/সংখ্যা/হাইফেন, ৬টা পর্যন্ত। যেমন KB- দিলে অর্ডার নম্বর হবে KB-100025। আগের অর্ডারের নম্বর বদলাবে না।">
          <input type="text" name="order_prefix" value={s.order_prefix || "FS-"} maxlength={6} pattern="[A-Za-z0-9-]{1,6}" />
        </F>
      </Section>
      <Section title="ইনভয়েস আর স্টিকার" desc="অর্ডারের পেজ বা তালিকা থেকে প্রিন্ট করা যায়। স্টিকার কুরিয়ারের প্যাকেটে লাগানোর জন্য — থার্মাল লেবেল প্রিন্টারের রোলের মাপ অনুযায়ী বাছুন।">
        <F label="প্রিন্টের সাধারণ মাপ">
          <select name="invoice_size">{Object.entries({ a4: "A4 ইনভয়েস", sticker: "স্টিকার" }).map(([k, l]) => <option value={k} selected={(s.invoice_size || "a4") === k}>{l}</option>)}</select>
        </F>
        <F label="স্টিকারের মাপ" hint="প্রিন্টের সময় স্কেল ১০০% (Actual size) রাখুন।">
          <select name="sticker_size">{Object.entries({ "3x3": "৩×৩ ইঞ্চি (৭৫×৭৫ মিমি)", "3x4": "৩×৪ ইঞ্চি (৭৫×১০০ মিমি)" }).map(([k, l]) => <option value={k} selected={(s.sticker_size === "3x4" ? "3x4" : "3x3") === k}>{l}</option>)}</select>
        </F>
        <F label="ইনভয়েসের নিচের লেখা" hint="যেমন: পণ্য হাতে পেয়ে দেখে নিন। ৭ দিনের মধ্যে বদলানো যাবে।" wide>
          <textarea name="invoice_note" rows={2} maxlength={300}>{s.invoice_note ?? ""}</textarea>
        </F>
        <label class="set-check"><input type="checkbox" name="invoice_barcode" value="1" checked={s.invoice_barcode !== "0"} /> অর্ডার নম্বরের বারকোড</label>
        <label class="set-check"><input type="checkbox" name="invoice_image" value="1" checked={s.invoice_image !== "0"} /> ইনভয়েসে পণ্যের ছবি</label>
      </Section>
      <Section title="নিজের বাড়তি ঘর" desc="অর্ডার ফর্মে আরও তথ্য চাইতে পারেন, যেমন: বিকল্প মোবাইল নম্বর, শাড়ির রং, উপহারের বার্তা। লেবেল ফাঁকা রাখলে ঘরটা দেখাবে না।">
        {[1, 2, 3].map((n) => (
          <>
            <F label={`ঘর ${n}-এর লেবেল`}><input type="text" name={`cf${n}_label`} value={s[`cf${n}_label`] ?? ""} maxlength={60} placeholder={["বিকল্প মোবাইল নম্বর", "পছন্দের রং/সাইজ", "উপহারের বার্তা"][n - 1]} /></F>
            <label class="set-check"><input type="checkbox" name={`cf${n}_req`} value="1" checked={s[`cf${n}_req`] === "1"} /> ঘর {n} অবশ্যই পূরণ করতে হবে</label>
          </>
        ))}
      </Section>
      <Section title="ধন্যবাদ পেজ" desc="অর্ডার দেওয়ার পর কাস্টমার যে লেখা দেখবেন">
        <F label="ধন্যবাদ বার্তা" hint="এগুলো লিখলে নিজে থেকে বসবে: {name} নাম, {order_no} অর্ডার নম্বর, {total} মোট টাকা, {phone} মোবাইল, {shop} দোকানের নাম। ফাঁকা রাখলে: আমাদের প্রতিনিধি শীঘ্রই কল করে অর্ডারটি কনফার্ম করবেন।" wide>
          <textarea name="thanks_message" rows={3} maxlength={500}>{s.thanks_message ?? ""}</textarea>
        </F>
      </Section>
      <Section title="ফেক অর্ডার সুরক্ষা" desc="সবসময় চালু থাকে — বন্ধ করার দরকার নেই">
        <ul class="set-list">
          <li>✓ শুধু সঠিক বাংলাদেশি মোবাইল নম্বর (01XXXXXXXXX)</li>
          <li>✓ একই নম্বর বা মোবাইল থেকে আগের অর্ডার কনফার্ম না হলে নতুন অর্ডার নয়</li>
          <li>✓ ফেক/বাতিল করলে নম্বর আর ডিভাইস স্থায়ীভাবে ব্লক — <a href="/admin/blacklist">ব্লক তালিকা</a></li>
          <li>✓ এক মিনিটে বারবার অর্ডারের চেষ্টা আটকানো</li>
        </ul>
      </Section>
    </SettingsForm>
  </>
);

export const SettingsSeoPage = ({ s, url }: { s: Settings; url: string }) => (
  <>
    <Tabs active="seo" />
    <SettingsForm section="seo" action="/admin/settings/seo" multipart>
      <Section title="হোম পেজের SEO" desc="Google-এর সার্চ রেজাল্টে আর ফেসবুক/WhatsApp-এ লিংক শেয়ার করলে এগুলো দেখায়। পণ্যের আলাদা SEO পণ্যের এডিট পেজে।">
        <div class="seo-box wide" data-seo-box>
          <F label="সাইট টাইটেল" hint={<>৫০–৬০ অক্ষর ভালো <span data-count-for="seo_title"></span></>}>
            <input type="text" name="seo_title" value={s.seo_title ?? ""} maxlength={100} data-count="60" placeholder={s.site_name ?? ""} />
          </F>
          <F label="মেটা ডেসক্রিপশন" hint={<>১২০–১৫৫ অক্ষর ভালো <span data-count-for="seo_description"></span></>}>
            <textarea name="seo_description" rows={3} maxlength={300} data-count="155" placeholder="যেমন: হাতে বানানো কাঠের পণ্য — সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।">{s.seo_description ?? ""}</textarea>
          </F>
          <div class="serp" data-serp data-url={url} data-fallback-title={s.site_name ?? ""}>
            <small class="sa-muted">Google-এ যেমন দেখাবে:</small>
            <div class="serp-url"></div><div class="serp-title"></div><div class="serp-desc"></div>
          </div>
        </div>
        <ImageField name="seo_image" label="শেয়ার ইমেজ (Facebook/WhatsApp)" current={s.seo_image} hint="১২০০×৬৩০ পিক্সেল ভালো। পণ্যের পেজে পণ্যের ছবি দেখাবে।" />
      </Section>
      <Section title="সার্চ ইঞ্জিন">
        <ul class="set-list">
          <li>✓ <a href="/sitemap.xml" target="_blank" rel="noopener">sitemap.xml</a> আর <a href="/robots.txt" target="_blank" rel="noopener">robots.txt</a> নিজে থেকে তৈরি হয় — Google Search Console-এ sitemap জমা দিন</li>
          <li>✓ প্রতিটা পণ্যের নিজের লিংক, টাইটেল আর শেয়ার ইমেজ</li>
        </ul>
        <label class="set-check"><input type="checkbox" name="seo_noindex" value="1" checked={s.seo_noindex === "1"} /> দোকান Google-এ লুকান (শুধু অ্যাডের লিংক দিয়ে চালালে বা টেস্টের সময়)</label>
      </Section>
    </SettingsForm>
  </>
);

export const SettingsTrackingPage = ({ s }: { s: Settings }) => (
  <>
    <Tabs active="tracking" />
    <SettingsForm section="tracking" action="/admin/settings/tracking">
      <Section title="Purchase গার্ড — ফেক অর্ডারে Facebook ভুল শিখবে না" desc={<>সাধারণ ওয়েবসাইটে অর্ডার আসার সাথে সাথেই Facebook-এ <b>Purchase</b> চলে যায় — ফেক অর্ডারও। তখন Facebook ভাবে ফেক অর্ডার দেওয়া লোকেরাই আপনার ক্রেতা, আর তাদের মতো লোককেই বেশি অ্যাড দেখায়।</>}>
        <div class={`pg-box wide ${s.purchase_guard !== "0" ? "on" : "off"}`}>
          <label class="pg-switch">
            <input type="checkbox" name="purchase_guard" value="1" checked={s.purchase_guard !== "0"} />
            <span class="pg-track"><span class="pg-knob"></span></span>
            <b>Purchase গার্ড {s.purchase_guard !== "0" ? "চালু" : "বন্ধ"}</b>
          </label>
          <div class="pg-modes">
            <div class="pg-mode pg-mode-on">
              <b>✓ চালু (পরামর্শ)</b>
              <span>অর্ডার এলে Purchase <u>যায় না</u>, অর্ডার "নতুন"-এ থাকে। আপনি ফোন করে <b>কনফার্ম</b> করলে তবেই Facebook-এ Purchase যায়। ফেক/বাতিল অর্ডারের Purchase কখনো যায় না — Facebook শুধু আসল ক্রেতা চিনতে শেখে।</span>
            </div>
            <div class="pg-mode pg-mode-off">
              <b>বন্ধ</b>
              <span>সাধারণ সাইটের মতো অর্ডার আসার সাথে সাথে Purchase যায় (ব্রাউজার + সার্ভার, একই event_id)। ফেক অর্ডারও বিক্রি হিসেবে গোনা হবে। শুধু যদি আপনি ফোনে কনফার্ম না করেন বা অগ্রিম টাকা নিয়ে অর্ডার নেন, তখন বন্ধ রাখতে পারেন।</span>
            </div>
          </div>
          <small class="pg-note">Lead, InitiateCheckout, AddToCart আগের মতোই সাথে সাথে যায় — শুধু Purchase-এর সময় বদলায়। Purchase যেতে Pixel ID আর Conversions API টোকেন দুটোই লাগবে।</small>
        </div>
      </Section>
      <Section title="Facebook Pixel + Conversions API" desc={<>ব্রাউজার আর সার্ভার — দুই দিক থেকে ইভেন্ট যায় (PageView, ViewContent, AddToCart, InitiateCheckout, Lead, Purchase)। Purchase কখন যাবে তা উপরের <b>Purchase গার্ড</b> ঠিক করে।</>}>
        <F label="Pixel ID" hint="Events Manager → Data sources → আপনার Pixel → ID"><input type="text" name="fb_pixel_id" value={s.fb_pixel_id} inputmode="numeric" pattern="[0-9]*" maxlength={30} /></F>
        <F label={`CAPI Access Token ${s.fb_capi_token ? "(সেট করা আছে)" : "(সেট করা নেই)"}`} hint="Events Manager → Settings → Conversions API → Generate access token। ফাঁকা রাখলে আগেরটাই থাকবে।">
          <input type="password" name="fb_capi_token" value="" autocomplete="new-password" placeholder={s.fb_capi_token ? "••••••••••••" : ""} />
          {s.fb_capi_token && <label class="small-check"><input type="checkbox" name="clear_token" value="1" /> টোকেন মুছে ফেলুন</label>}
        </F>
        <F label="Test Event Code" hint="Events Manager → Test events থেকে। টেস্ট শেষে ফাঁকা করুন।"><input type="text" name="fb_test_event_code" value={s.fb_test_event_code} maxlength={50} placeholder="TEST12345" /></F>
        <F label="Graph API ভার্সন"><input type="text" name="fb_graph_version" value={s.fb_graph_version} placeholder="v26.0" pattern="v[0-9]+\.[0-9]+" /></F>
        <div class={`track-status wide ${s.fb_pixel_id && s.fb_capi_token ? "ok" : "warn"}`}>
          {s.fb_pixel_id && s.fb_capi_token ? "✓ Pixel আর Conversions API দুটোই চালু" : s.fb_pixel_id ? "⚠ শুধু Pixel চালু — Conversions API টোকেন দিলে অ্যাডের ফল আরও নির্ভুল হবে" : "Pixel চালু নেই"}
        </div>
      </Section>
      <Section title="Google" desc="শুধু আইডি দিন — বাকিটা নিজে থেকে বসে যাবে">
        <F label="Google Analytics 4 — Measurement ID" hint="যেমন G-XXXXXXXXXX"><input type="text" name="ga4_id" value={s.ga4_id ?? ""} maxlength={20} placeholder="G-XXXXXXXXXX" /></F>
        <F label="Google Tag Manager — Container ID" hint="যেমন GTM-XXXXXXX। নিরাপত্তার জন্য দোকান যাচাই (ইমেইল আর মোবাইল) শেষ হলে তবেই দোকানে চালু হয়।"><input type="text" name="gtm_id" value={s.gtm_id ?? ""} maxlength={20} placeholder="GTM-XXXXXXX" /></F>
      </Section>
      <Section title="TikTok">
        <F label="TikTok Pixel ID" hint="TikTok Ads Manager → Events → Web Events"><input type="text" name="tiktok_pixel_id" value={s.tiktok_pixel_id ?? ""} maxlength={30} /></F>
      </Section>
    </SettingsForm>
  </>
);

export const ROLE_TEXT = ROLE_LABEL;


/* ---------- থিম কাস্টমাইজ (প্রতিটা থিমের আলাদা সেটিংস) ---------- */
/* ছবি দেখে বাছাইয়ের ছোট নকশা */
const ChoicePreview = ({ kind, k }: { kind: string; k: string }) => {
  if (kind === "cart") {
    const d = { cart: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6M9.5 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17.5 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z", bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2", basket: "M3 10h18l-2 10H5zM8 10l4-6 4 6M9 14v3M15 14v3" }[k as "cart"];
    return <span class="cz-pv cz-pv-cart"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={d} /></svg></span>;
  }
  if (kind === "cols" && k === "auto") return <span class="cz-pv cz-pv-auto">↺</span>;
  if (kind === "cols") return <span class="cz-pv cz-pv-cols" style={`grid-template-columns:repeat(${parseInt(k, 10) || 1},1fr)`}>{Array.from({ length: (parseInt(k, 10) || 1) * 2 }, () => <i />)}</span>;
  if (kind === "ratio") return <span class="cz-pv cz-pv-ratio"><i style={`aspect-ratio:${k}`} /></span>;
  if (kind === "m1") return <span class={`cz-pv cz-pv-m1 cz-pv-m1-${k}`}><i class="a" /><i class="b" /></span>;
  return <span class={`cz-pv cz-pv-${kind} cz-pv-${kind}-${k}`}><i class="a" /><i class="b" /><i class="c" /><i class="d" /></span>;
};

export const CfgField = ({ f, cfg, products, categories }: { f: Field; cfg: Cfg; products: { id: number; name: string }[]; categories?: { id: number; name: string }[] }) => {
  const v = cfg[f.key] ?? "";
  switch (f.type) {
    case "choice":
      return (
        <div class="set-field wide">
          <span>{f.label}</span>
          <div class={`cz-choices cz-choices-${f.preview}`}>
            {Object.entries({ ...f.options, ...Object.fromEntries(Object.entries(f.legacy ?? {}).filter(([k]) => k === v)) }).map(([k, l]) => (
              <label class="cz-choice">
                <input type="radio" name={f.key} value={k} checked={k === v} />
                <ChoicePreview kind={f.preview} k={k} />
                <small>{l}</small>
              </label>
            ))}
          </div>
          {f.hint && <small>{f.hint}</small>}
        </div>
      );
    case "products": {
      const chosen = new Set(v.split(",").filter(Boolean));
      return (
        <div class="set-field wide">
          <span>{f.label} <em class="sa-muted">({chosen.size}টা বাছাই)</em></span>
          {products.length === 0 ? <small>আগে পণ্য যোগ করুন</small> : (
            <div class="cz-products">
              {products.map((p) => <label class="small-check"><input type="checkbox" name={f.key} value={String(p.id)} checked={chosen.has(String(p.id))} /> {p.name}</label>)}
            </div>
          )}
          <input type="hidden" name={`${f.key}__present`} value="1" />
          {f.hint && <small>{f.hint}</small>}
        </div>
      );
    }
    case "image":
      return (
        <F label={f.label} hint={f.hint}>
          <MediaField fileName={`cfgimg_${f.key}`} pickName={`cfgpick_${f.key}`} removeName={`remove_${f.key}`} current={v} folder="theme" ratio="free" />
          <input type="hidden" name={f.key} value={v} />
        </F>
      );
    case "color":
      return (
        <F label={f.label} hint={f.hint}>
          <span class="cz-color">
            <input type="color" name={f.key} value={v || "#ffffff"} data-cz-color />
            <label class="small-check"><input type="checkbox" name={`${f.key}_on`} value="1" checked={!!v} /> নিজের রং</label>
          </span>
        </F>
      );
    case "select":
      return <F label={f.label} hint={f.hint}><select name={f.key}>{Object.entries(f.options).map(([k, l]) => <option value={k} selected={k === v}>{l}</option>)}</select></F>;
    case "toggle":
      return <label class="set-field cz-toggle"><span><input type="checkbox" name={f.key} value="1" checked={v === "1"} /> {f.label}</span>{f.hint && <small>{f.hint}</small>}</label>;
    case "text":
      return <F label={f.label} hint={f.hint} wide={f.wide}><input type="text" name={f.key} value={v} maxlength={f.max} placeholder={f.placeholder} /></F>;
    case "textarea":
      return <F label={f.label} hint={f.hint} wide><textarea name={f.key} rows={3} maxlength={f.max}>{v}</textarea></F>;
    case "url":
      return <F label={f.label} hint={f.hint}><input type="url" name={f.key} value={v} maxlength={200} placeholder={f.placeholder} /></F>;
    case "order": {
      const order = (cfg.home_order || "").split(",").filter((k) => k in HOME_SECTIONS || CAT_BLOCK.test(k));
      const catName = (k: string) => categories?.find((c) => `cat_${c.id}` === k)?.name;
      const item = (k: string) => {
        const isCat = CAT_BLOCK.test(k);
        if (isCat && !catName(k)) return null; // মুছে যাওয়া ক্যাটাগরি
        return (
          <li data-key={k} class={isCat ? "hs-cat" : ""}>
            <span class="hs-handle" aria-hidden="true" title="টেনে সরান">⋮⋮</span>
            <span class="hs-name">{isCat ? <>ক্যাটাগরি: <b>{catName(k)}</b></> : HOME_SECTIONS[k]}</span>
            {isCat
              ? <button type="button" class="hs-x" data-hs-remove aria-label="সরিয়ে দিন" title="সরিয়ে দিন">✕</button>
              : <label class="hs-switch" title="দেখাবে / লুকাবে"><input type="checkbox" name={`sec_${k}`} value="1" checked={cfg[`sec_${k}`] === "1"} /><i></i></label>}
            <span class="hs-move"><button type="button" data-cz-up aria-label="উপরে">↑</button><button type="button" data-cz-down aria-label="নিচে">↓</button></span>
          </li>
        );
      };
      return (
        <div class="set-field wide hs">
          <span>{f.label}</span>
          <input type="hidden" name="home_order" value={order.join(",")} data-cz-order-input />
          <ol class="hs-list" data-cz-order>{order.map(item)}</ol>
          {categories && categories.length > 0 && (
            <div class="hs-add">
              <select data-hs-cat aria-label="ক্যাটাগরি বাছুন">
                <option value="">+ এক ক্যাটাগরির পণ্যের সেকশন যোগ করুন…</option>
                {categories.map((c) => <option value={`cat_${c.id}`} disabled={order.includes(`cat_${c.id}`)} data-name={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}
          <small>⋮⋮ ধরে টেনে ক্রম বদলান (ফোনে ↑↓)। সুইচ বন্ধ করলে সেকশন লুকাবে। {f.hint}</small>
        </div>
      );
    }
  }
};

/* ---------- নিজের পেজ (আমাদের সম্পর্কে, রিটার্ন নীতি...) ---------- */
export type PageRow = { id: number; title: string; slug: string; content: string; in_menu: number; is_active: number; sort_order: number; kind: string; excerpt: string | null; image: string | null };

export const PagesPage = ({ rows, edit, error }: { rows: PageRow[]; edit?: Partial<PageRow>; error?: string }) => (
  <div class="sa-grid-1-2">
    <section class="sa-card">
      <h2>{edit?.id ? "পেজ এডিট" : "নতুন পেজ"}</h2>
      {error && <div class="sa-alert sa-alert-err">{error}</div>}
      <form method="post" action={edit?.id ? `/admin/pages/${edit.id}` : "/admin/pages"} class="sa-form">
        <label>ধরন</label>
        <select name="kind"><option value="page" selected={edit?.kind !== "post"}>সাধারণ পেজ (আমাদের সম্পর্কে, নীতি...)</option><option value="post" selected={edit?.kind === "post"}>ব্লগ পোস্ট (/blog-এ দেখাবে)</option></select>
        <label>শিরোনাম</label><input type="text" name="title" required maxlength={80} value={edit?.title ?? ""} placeholder="যেমন: আমাদের সম্পর্কে" />
        <label>লিংকের নাম (ইংরেজিতে)</label><input type="text" name="slug" required maxlength={60} pattern="[a-z0-9-]+" value={edit?.slug ?? ""} placeholder="যেমন: about-us" />
        <small class="sa-muted">পেজের ঠিকানা হবে /page/{edit?.slug || "about-us"}। শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা আর হাইফেন।</small>
        <label>লেখা (HTML চলবে: &lt;b&gt;, &lt;h3&gt;, &lt;ul&gt;&lt;li&gt;, &lt;a&gt;)</label>
        <textarea name="content" rows={10} maxlength={20000}>{edit?.content ?? ""}</textarea>
        <label>সারাংশ (ব্লগ পোস্টে — Google আর Facebook শেয়ারে দেখাবে)</label><textarea name="excerpt" rows={2} maxlength={300}>{edit?.excerpt ?? ""}</textarea>
        <label>কভার ছবির লিংক (ব্লগ পোস্টে, ঐচ্ছিক)</label><input type="text" name="image" maxlength={500} value={edit?.image ?? ""} placeholder="https://... বা /img/..." />
        <small class="sa-muted">ছবি "মিডিয়া" থেকে আপলোড করে লিংক কপি করে বসান। ব্লগ পোস্ট মেনুতে আলাদা দেখায় না — হেডারে "ব্লগ" লিংক নিজে থেকেই আসে।</small>
        <label class="small-check"><input type="checkbox" name="in_menu" value="1" checked={edit ? edit.in_menu !== 0 : true} /> মেনু আর ফুটারে দেখাবে</label>
        <label class="small-check"><input type="checkbox" name="is_active" value="1" checked={edit ? edit.is_active !== 0 : true} /> চালু</label>
        <label>ক্রম (ছোট সংখ্যা আগে)</label><input type="number" name="sort_order" value={String(edit?.sort_order ?? 0)} />
        <button class="sa-btn">{edit?.id ? "সেভ করুন" : "পেজ যোগ করুন"}</button>
        {edit?.id && <a href="/admin/pages" class="sa-btn sa-btn-ghost">বাতিল</a>}
      </form>
    </section>
    <section class="sa-card">
      <h2>সব পেজ</h2>
      <p class="sa-muted">যেমন: আমাদের সম্পর্কে, রিটার্ন ও রিফান্ড নীতি, ডেলিভারির নিয়ম, প্রাইভেসি পলিসি। আর ব্লগ পোস্ট — পণ্যের ব্যবহার, যত্নের টিপস — যাতে Google থেকে কাস্টমার আসে। মেনুতে দেখাতে "থিম কাস্টমাইজ → হেডার"-এ "নিজের পেজের মেনু" চালু রাখুন।</p>
      {rows.length === 0 ? <p class="sa-empty">এখনো কোনো পেজ নেই</p> : (
        <table class="sa-table">
          <thead><tr><th>পেজ</th><th>অবস্থা</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr>
              <td><b>{r.title}</b>{r.kind === "post" && <span class="sa-pill"> ব্লগ</span>}<br /><small class="sa-muted">/{r.kind === "post" ? "blog" : "page"}/{r.slug}</small></td>
              <td>{r.is_active ? <span class="sa-pill sa-st-active">চালু</span> : <span class="sa-pill sa-st-closed">বন্ধ</span>}{r.in_menu ? " · মেনুতে" : ""}</td>
              <td class="sa-row">
                <a href={`/admin/pages/${r.id}`} class="sa-btn sa-btn-sm sa-btn-ghost">এডিট</a>
                <a href={`/${r.kind === "post" ? "blog" : "page"}/${r.slug}`} target="_blank" class="sa-btn sa-btn-sm sa-btn-ghost">দেখুন ↗</a>
                <form method="post" action={`/admin/pages/${r.id}/delete`} data-confirm={`"${r.title}" পেজটি মুছবেন?`}><button class="sa-btn sa-btn-sm sa-btn-ghost">মুছুন</button></form>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  </div>
);
