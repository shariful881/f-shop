/**
 * দোকানের অ্যাডমিন — প্রফেশনাল লেআউট (সাইডবার), ড্যাশবোর্ড আর সেটিংস কেন্দ্র।
 */
import type { Child } from "hono/jsx";
import { canAccess, ROLE_LABEL, type Role } from "../lib/auth";
import { bn, dhakaTime, imageUrl, taka } from "../lib/format";
import { STATUS_LABEL, type OrderStatus } from "../lib/orders";
import { THEMES, type Settings, type ThemeKey } from "../lib/settings";
import { GROUPS, HOME_SECTIONS, type Cfg, type Field } from "../lib/theme-config";
import { ASSET_VERSION } from "./layout";

/* ---------- সাইডবার লেআউট ---------- */
const NAV: { key: string; href: string; icon: string; label: string; group?: string }[] = [
  { key: "dashboard", href: "/admin", icon: "▦", label: "ড্যাশবোর্ড" },
  { key: "orders", href: "/admin/orders", icon: "🧾", label: "অর্ডার", group: "বিক্রি" },
  { key: "coupons", href: "/admin/coupons", icon: "🏷️", label: "কুপন" },
  { key: "blacklist", href: "/admin/blacklist", icon: "🛡️", label: "ফেক/ব্লক তালিকা" },
  { key: "reports", href: "/admin/reports", icon: "📊", label: "রিপোর্ট" },
  { key: "products", href: "/admin/products", icon: "📦", label: "পণ্য", group: "ক্যাটালগ" },
  { key: "landing", href: "/admin/landing", icon: "🧩", label: "ল্যান্ডিং পেজ" },
  { key: "categories", href: "/admin/categories", icon: "🗂️", label: "ক্যাটাগরি" },
  { key: "settings", href: "/admin/settings", icon: "⚙", label: "দোকানের সেটিংস", group: "সেটআপ" },
  { key: "courier", href: "/admin/courier", icon: "🚚", label: "কুরিয়ার" },
  { key: "sms", href: "/admin/sms", icon: "💬", label: "SMS" },
  { key: "domains", href: "/admin/domain", icon: "🌐", label: "ডোমেইন" },
  { key: "staff", href: "/admin/staff", icon: "👥", label: "স্টাফ", group: "অ্যাকাউন্ট" },
  { key: "billing", href: "/admin/billing", icon: "💳", label: "বিলিং ও রিচার্জ" },
];

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
        <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
        <link rel="stylesheet" href={`/css/admin.css?v=${ASSET_VERSION}`} />
        <link rel="stylesheet" href={`/css/super.css?v=${ASSET_VERSION}`} />
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
            {NAV.filter((n) => n.key === "dashboard" || canAccess(p.role, n.key)).map((n, i, arr) => (
              <>
                {n.group && (i === 0 || arr[i - 1]!.group !== n.group) && <div class="sa-nav-group">{n.group}</div>}
                <a href={n.href} class={p.active === n.key ? "active" : ""}>
                  <span class="sa-ico">{n.icon}</span>{n.label}
                  {n.key === "orders" && (p.newOrders ?? 0) > 0 && <span class="sa-badge">{bn(p.newOrders!)}</span>}
                </a>
              </>
            ))}
          </nav>
          <div class="sa-me">
            <div class="sa-me-link">
              <span class="sa-avatar">{p.email.slice(0, 1).toUpperCase()}</span>
              <span><b>{p.email}</b><small>{ROLE_LABEL[p.role]}</small></span>
            </div>
            <form method="post" action="/admin/logout"><button class="sa-logout" title="লগআউট" aria-label="লগআউট">⏻</button></form>
          </div>
        </aside>
        <label for="sa-nav-toggle" class="sa-scrim" aria-hidden="true"></label>
        <div class="sa-main">
          {p.top}
          <header class="sa-top">
            <label for="sa-nav-toggle" class="sa-burger" aria-label="মেনু">☰</label>
            <h1>{p.title}</h1>
            <div class="sa-top-actions">
              <a href="/" target="_blank" rel="noopener" class="sa-btn sa-btn-ghost sa-btn-sm">🏪 দোকান দেখুন ↗</a>
            </div>
          </header>
          <main class="sa-content admin-main">{p.children}</main>
        </div>
        <script src={`/js/admin.js?v=${ASSET_VERSION}`} defer></script>
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
            <h2>🚀 দোকান সেটআপ — {bn(done)}/{bn(d.setup.length)} শেষ</h2>
            <span class="sa-muted">সব ধাপ শেষ করলে দোকান পুরোপুরি তৈরি</span>
          </div>
          <div class="setup-bar"><span style={`width:${(done / d.setup.length) * 100}%`}></span></div>
          <ul class="setup-list">
            {d.setup.map((x) => (
              <li class={x.done ? "done" : ""}>
                <span class="setup-tick">{x.done ? "✓" : ""}</span>
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
            {canAccess(role, "products") && <a href="/admin/products/new" class="sa-btn sa-btn-ghost">➕ নতুন পণ্য</a>}
            {canAccess(role, "coupons") && <a href="/admin/coupons" class="sa-btn sa-btn-ghost">🏷️ কুপন</a>}
            {canAccess(role, "settings") && <a href="/admin/settings/tracking" class="sa-btn sa-btn-ghost">📈 পিক্সেল</a>}
            <a href="/" target="_blank" rel="noopener" class="sa-btn sa-btn-ghost">🏪 দোকান</a>
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
      </div>
    </>
  );
};

/* ---------- সেটিংস কেন্দ্র ---------- */
export const SETTINGS_TABS: { key: string; href: string; label: string; icon: string }[] = [
  { key: "general", href: "/admin/settings", label: "দোকানের তথ্য", icon: "🏪" },
  { key: "appearance", href: "/admin/settings/appearance", label: "থিম ও লোগো", icon: "🎨" },
  { key: "customize", href: "/admin/settings/customize", label: "থিম কাস্টমাইজ", icon: "🛠️" },
  { key: "delivery", href: "/admin/settings/delivery", label: "ডেলিভারি", icon: "🚚" },
  { key: "checkout", href: "/admin/settings/checkout", label: "অর্ডার ফর্ম", icon: "🧾" },
  { key: "seo", href: "/admin/settings/seo", label: "SEO", icon: "🔍" },
  { key: "tracking", href: "/admin/settings/tracking", label: "পিক্সেল ও ট্র্যাকিং", icon: "📈" },
  { key: "courier", href: "/admin/courier", label: "কুরিয়ার", icon: "📦" },
  { key: "sms", href: "/admin/sms", label: "SMS", icon: "💬" },
  { key: "domain", href: "/admin/domain", label: "ডোমেইন", icon: "🌐" },
];

const Tabs = ({ active }: { active: string }) => (
  <nav class="set-tabs">{SETTINGS_TABS.map((t) => <a href={t.href} class={active === t.key ? "active" : ""}><span>{t.icon}</span>{t.label}</a>)}</nav>
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

const ImageField = ({ name, label, current, hint, accept = "image/png,image/jpeg,image/webp" }: { name: string; label: string; current?: string; hint: string; accept?: string }) => (
  <F label={label} hint={hint}>
    <div class="img-field">
      {current ? <img src={imageUrl(current)} alt="" /> : <span class="img-empty">ছবি নেই</span>}
      <div>
        <input type="file" name={name} accept={accept} />
        {current && <label class="small-check"><input type="checkbox" name={`remove_${name}`} value="1" /> সরিয়ে দিন</label>}
      </div>
    </div>
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
      <Section title="লোগো আর রং">
        <ImageField name="logo" label="লোগো" current={s.logo} hint="PNG/JPG/WebP, ১ MB পর্যন্ত। ফাঁকা রাখলে আগেরটা থাকবে।" />
        <ImageField name="favicon" label="ফেভিকন (ব্রাউজারের ট্যাবের ছোট আইকন)" current={s.favicon} hint="বর্গাকার PNG, যেমন ৬৪×৬৪। না দিলে লোগো ব্যবহার হবে।" accept="image/png,image/webp" />
        <F label="মূল রং (হেডার, দাম)"><input type="color" name="brand_color" value={s.brand_color || "#0f766e"} /></F>
        <F label="বাটনের রং"><input type="color" name="accent_color" value={s.accent_color || "#ea580c"} /></F>
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

export const SettingsCheckoutPage = ({ s }: { s: Settings }) => (
  <>
    <Tabs active="checkout" />
    <SettingsForm section="checkout" action="/admin/settings/checkout">
      <Section title="অর্ডার ফর্ম" desc="ল্যান্ডিং পেজ আর চেকআউটের অর্ডার ফর্ম">
        <F label="ফর্মের উপরের শিরোনাম" hint="যেমন: অর্ডার করতে নিচের ফর্মটি পূরণ করুন"><input type="text" name="order_form_title" value={s.order_form_title ?? ""} maxlength={100} /></F>
        <F label="সর্বনিম্ন অর্ডার (৳)" hint="এর কম দামের অর্ডার নেওয়া হবে না। ০ = সীমা নেই"><input type="number" min="0" name="min_order" value={s.min_order || "0"} /></F>
        <label class="set-check"><input type="checkbox" name="show_note" value="1" checked={s.show_note !== "0"} /> ফর্মে "নোট" ঘর দেখাবে</label>
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
      <Section title="Facebook Pixel + Conversions API" desc={<>ব্রাউজার আর সার্ভার — দুই দিক থেকে ইভেন্ট যায় (PageView, ViewContent, AddToCart, InitiateCheckout, Lead)। <b>Purchase যায় শুধু আপনি অর্ডার কনফার্ম করলে</b>, তাই ফেক অর্ডারে অ্যাড অপটিমাইজেশন নষ্ট হয় না।</>}>
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
        <F label="Google Tag Manager — Container ID" hint="যেমন GTM-XXXXXXX"><input type="text" name="gtm_id" value={s.gtm_id ?? ""} maxlength={20} placeholder="GTM-XXXXXXX" /></F>
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
  return <span class={`cz-pv cz-pv-${kind} cz-pv-${kind}-${k}`}><i class="a" /><i class="b" /><i class="c" /><i class="d" /></span>;
};

const CfgField = ({ f, cfg, products }: { f: Field; cfg: Cfg; products: { id: number; name: string }[] }) => {
  const v = cfg[f.key] ?? "";
  switch (f.type) {
    case "choice":
      return (
        <div class="set-field wide">
          <span>{f.label}</span>
          <div class={`cz-choices cz-choices-${f.preview}`}>
            {Object.entries(f.options).map(([k, l]) => (
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
          <div class="img-field">
            {v ? <img src={imageUrl(v)} alt="" /> : <span class="img-empty">ছবি নেই</span>}
            <div>
              <input type="file" name={`cfgimg_${f.key}`} accept="image/png,image/jpeg,image/webp" />
              <input type="hidden" name={f.key} value={v} />
              {v && <label class="small-check"><input type="checkbox" name={`remove_${f.key}`} value="1" /> সরিয়ে দিন</label>}
            </div>
          </div>
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
      const order = (cfg.home_order || "").split(",").filter((k) => k in HOME_SECTIONS);
      return (
        <div class="set-field wide">
          <span>{f.label}</span>
          <input type="hidden" name="home_order" value={order.join(",")} data-cz-order-input />
          <ol class="cz-order" data-cz-order>
            {order.map((k) => (
              <li data-key={k}>
                <label class="small-check"><input type="checkbox" name={`sec_${k}`} value="1" checked={cfg[`sec_${k}`] === "1"} /> {HOME_SECTIONS[k]}</label>
                <span><button type="button" class="sa-btn sa-btn-sm sa-btn-ghost" data-cz-up aria-label="উপরে">↑</button><button type="button" class="sa-btn sa-btn-sm sa-btn-ghost" data-cz-down aria-label="নিচে">↓</button></span>
              </li>
            ))}
          </ol>
          {f.hint && <small>{f.hint}</small>}
        </div>
      );
    }
  }
};

export const ThemeCustomizePage = ({ theme, cfg, products }: { s: Settings; theme: ThemeKey; cfg: Cfg; products: { id: number; name: string }[] }) => {
  return (
    <>
      <Tabs active="customize" />
      <p class="sa-muted cz-note">
        এখন দোকানে চালু আছে <b>{THEMES[theme].name}</b> থিম — নিচের সেটিংস শুধু এই থিমের।
        অন্য থিম চালু করলে সেই থিমের নিজের সেটিংস এখানে দেখাবে (<a href="/admin/settings/appearance">থিম বদলান</a>)।
        {" "}<a href="/" target="_blank">দোকান দেখুন ↗</a>
      </p>
      <form method="post" action="/admin/settings/customize" class="set-form" enctype="multipart/form-data">
        {GROUPS.map((g) => (
          <details class="sa-card set-section cz-group" open={g.key === "style"} id={`cz-${g.key}`}>
            <summary class="set-section-head"><h2>{g.title}</h2><p class="sa-muted">{g.desc}</p></summary>
            <div class="set-fields">{g.fields.map((f) => <CfgField f={f} cfg={cfg} products={products} />)}</div>
          </details>
        ))}
        <div class="set-save">
          <button type="submit" name="reset" value="1" class="sa-btn sa-btn-ghost" data-confirm={`${THEMES[theme].name} থিমের সব সেটিংস শুরুর মতো করে দেবেন?`}>শুরুর সেটিংসে ফিরুন</button>
          <button class="sa-btn">সেভ করুন</button>
        </div>
      </form>
    </>
  );
};
