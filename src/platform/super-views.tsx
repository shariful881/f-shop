/**
 * সুপার অ্যাডমিন প্যানেল — পুরো প্ল্যাটফর্ম চালানোর কন্ট্রোল সেন্টার।
 * সাইডবার লেআউট, ড্যাশবোর্ড (KPI + চার্ট), দোকান, দোকানের ৩৬০° ভিউ, ফাইন্যান্স, রিচার্জ, ঘোষণা, অডিট লগ, টিম, সেটিংস।
 */
import { RISK_LABEL } from "./verify";
import { WARN_AT, type Usage } from "./usage";
import { plans } from "./plans";
import type { Child } from "hono/jsx";
import { ASSET_VERSION } from "../shop/views/layout";
import { Icon, type IconName } from "../shop/views/icons";
import { bn, dhakaTime, taka } from "../shop/lib/format";
import type { SuperAdmin, SuperRole } from "./lib";
import { PLATFORM_NAME } from "./views";

export type SFlash = { type: "ok" | "error"; text: string } | null;

/* ---------- অনুমতি ---------- */
export const SUPER_ROLE_LABEL: Record<SuperRole, string> = { owner: "মালিক", admin: "অ্যাডমিন", support: "সাপোর্ট", finance: "ফাইন্যান্স" };
export const SUPER_ROLE_DESC: Record<SuperRole, string> = {
  owner: "সব কিছু, টিম আর প্ল্যাটফর্ম সেটিংসসহ",
  admin: "দোকান, রিচার্জ, ঘোষণা, অডিট — টিম আর সেটিংস ছাড়া",
  support: "দোকান দেখা, নোট, দোকানে সাপোর্ট লগইন — টাকার কাজ নয়",
  finance: "রিচার্জ, ব্যালেন্স সমন্বয়, ফাইন্যান্স রিপোর্ট",
};
const ALL: SuperRole[] = ["owner", "admin", "support", "finance"];
export const PERMS: Record<string, SuperRole[]> = {
  dashboard: ALL,
  shops: ALL,
  "shops.export": ["owner"], // সব মালিকের নাম/ফোন/ইমেইল — শুধু owner
  "shop.note": ALL,
  "shop.status": ["owner", "admin"],
  "shop.trial": ["owner", "admin"],
  "shop.edit": ["owner", "admin"],
  "shop.adjust": ["owner", "admin", "finance"],
  "shop.impersonate": ["owner", "admin", "support"],
  support: ["owner", "admin", "support"],
  "support.settings": ["owner", "admin"],
  topups: ["owner", "admin", "finance"],
  finance: ["owner", "admin", "finance"],
  announcements: ["owner", "admin"],
  templates: ["owner", "admin"],
  demos: ["owner", "admin"],
  blog: ["owner", "admin"],
  audit: ["owner", "admin"],
  errors: ["owner", "admin"],
  team: ["owner"],
  settings: ["owner"],
  account: ALL,
};
const mbStr = (b: number) => `${bn(Number((b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)))} MB`;
const pctStr = (p: number) => `${bn(Math.round(p * 100))}%`;
export const can = (role: SuperRole | undefined, perm: string) => !!role && (PERMS[perm] ?? ["owner"]).includes(role);

export const SHOP_STATUS_LABEL: Record<string, string> = { trial: "ট্রায়াল", active: "চালু", suspended: "স্থগিত", closed: "বন্ধ" };
export const StatusPill = ({ s }: { s: string }) => <span class={`sa-pill sa-st-${s}`}>{SHOP_STATUS_LABEL[s] ?? s}</span>;

const pct = (n: number) => `${bn((Math.round(n * 10) / 10).toString())}%`;
const n0 = (n: number) => bn(Math.round(n).toLocaleString("en-IN"));
/** কত আগে — "৩ দিন আগে" */
export function ago(utc: string | null | undefined): string {
  if (!utc) return "কখনো না";
  const t = new Date(utc.replace(" ", "T") + "Z").getTime();
  if (isNaN(t)) return "—";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return "এইমাত্র";
  if (m < 60) return `${bn(m)} মিনিট আগে`;
  const h = Math.round(m / 60);
  if (h < 24) return `${bn(h)} ঘণ্টা আগে`;
  const d = Math.round(h / 24);
  if (d < 31) return `${bn(d)} দিন আগে`;
  return `${bn(Math.round(d / 30))} মাস আগে`;
}

/* ---------- লেআউট ---------- */
const NAV: { key: string; href: string; icon: IconName; label: string; group?: string }[] = [
  { key: "dashboard", href: "/super", icon: "layout-dashboard", label: "ড্যাশবোর্ড" },
  { key: "shops", href: "/super/shops", icon: "store", label: "দোকান" },
  { key: "support", href: "/super/support", icon: "life-buoy", label: "সাপোর্ট" },
  { key: "topups", href: "/super/topups", icon: "credit-card", label: "রিচার্জ" },
  { key: "finance", href: "/super/finance", icon: "chart-line", label: "আয় ও হিসাব" },
  { key: "announcements", href: "/super/announcements", icon: "megaphone", label: "ঘোষণা", group: "যোগাযোগ" },
  { key: "templates", href: "/super/templates", icon: "layout-template", label: "ল্যান্ডিং টেমপ্লেট" },
  { key: "demos", href: "/super/demos", icon: "package", label: "ডেমো দোকান" },
  { key: "blog", href: "/super/blog", icon: "file-text", label: "ব্লগ" },
  { key: "audit", href: "/super/audit", icon: "file-text", label: "অডিট লগ", group: "নিরাপত্তা" },
  { key: "errors", href: "/super/errors", icon: "triangle-alert", label: "এরর লগ" },
  { key: "team", href: "/super/team", icon: "users", label: "টিম" },
  { key: "settings", href: "/super/settings", icon: "settings", label: "প্ল্যাটফর্ম সেটিংস" },
];

export const SuperShell = (p: {
  title: string;
  active: string;
  admin: SuperAdmin;
  flash?: SFlash;
  pendingTopups?: number;
  openSupport?: number;
  actions?: Child;
  children?: Child;
}) => (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{p.title} — {PLATFORM_NAME} কন্ট্রোল</title>
      <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/super.css?v=${ASSET_VERSION}`} />
      {can(p.admin.role, "support") && <link rel="stylesheet" href={`/css/support.css?v=${ASSET_VERSION}`} />}
    </head>
    <body class="sa">
      <input type="checkbox" id="sa-nav-toggle" class="sa-nav-toggle" aria-label="মেনু" />
      <aside class="sa-side">
        <a href="/super" class="sa-brand"><span class="sa-logo">S</span><span>{PLATFORM_NAME}<small>কন্ট্রোল সেন্টার</small></span></a>
        <nav class="sa-nav">
          {NAV.filter((n) => can(p.admin.role, n.key)).map((n, i, arr) => (
            <>
              {n.group && (i === 0 || arr[i - 1]!.group !== n.group) && <div class="sa-nav-group">{n.group}</div>}
              <a href={n.href} class={p.active === n.key ? "active" : ""}>
                <span class="sa-ico"><Icon name={n.icon} /></span>{n.label}
                {n.key === "topups" && (p.pendingTopups ?? 0) > 0 && <span class="sa-badge">{bn(p.pendingTopups!)}</span>}
                {n.key === "support" && <span class="sa-badge" data-sx-nav-badge hidden={!p.openSupport}>{p.openSupport ? bn(p.openSupport) : ""}</span>}
              </a>
            </>
          ))}
        </nav>
        <div class="sa-me">
          <a href="/super/account" class="sa-me-link">
            <span class="sa-avatar">{(p.admin.name || p.admin.email).slice(0, 1).toUpperCase()}</span>
            <span><b>{p.admin.name || p.admin.email}</b><small>{SUPER_ROLE_LABEL[p.admin.role]}</small></span>
          </a>
          <form method="post" action="/super/logout"><button class="sa-logout" title="লগআউট" aria-label="লগআউট">⏻</button></form>
        </div>
      </aside>
      <label for="sa-nav-toggle" class="sa-scrim" aria-hidden="true"></label>
      <div class="sa-main">
        <header class="sa-top">
          <label for="sa-nav-toggle" class="sa-burger" aria-label="মেনু"><Icon name="menu" /></label>
          <h1>{p.title}</h1>
          <form method="get" action="/super/shops" class="sa-search">
            <input type="search" name="q" placeholder="দোকান, মোবাইল, ইমেইল, ডোমেইন খুঁজুন…" />
          </form>
          <div class="sa-top-actions">{p.actions}</div>
        </header>
        <main class="sa-content">
          {p.flash && <div class={`sa-alert ${p.flash.type === "ok" ? "sa-alert-ok" : "sa-alert-err"}`}>{p.flash.text}</div>}
          {p.children}
        </main>
      </div>
      <script src={`/js/admin.js?v=${ASSET_VERSION}`} defer></script>
      {can(p.admin.role, "support") && <script src={`/js/support.js?v=${ASSET_VERSION}`} defer data-sx-agent="1"></script>}
    </body>
  </html>
);

/* ---------- ছোট উপাদান ---------- */
export const Kpi = (p: { label: string; value: string; sub?: Child; tone?: "up" | "down" | "warn" | ""; href?: string }) => {
  const inner = (
    <>
      <div class="sa-kpi-label">{p.label}</div>
      <div class="sa-kpi-value">{p.value}</div>
      {p.sub && <div class={`sa-kpi-sub ${p.tone ? `sa-${p.tone}` : ""}`}>{p.sub}</div>}
    </>
  );
  return p.href ? <a class="sa-kpi" href={p.href}>{inner}</a> : <div class="sa-kpi">{inner}</div>;
};

export const Card = (p: { title?: Child; action?: Child; class?: string; children?: Child }) => (
  <section class={`sa-card ${p.class ?? ""}`}>
    {(p.title || p.action) && <div class="sa-card-head"><h2>{p.title}</h2>{p.action}</div>}
    {p.children}
  </section>
);

/** SVG বার চার্ট — প্রতিদিনের হিসাব (হোভারে মান) */
export const BarChart = (p: { data: { label: string; value: number }[]; color?: string; money?: boolean; height?: number }) => {
  const W = 640, H = p.height ?? 180, padL = 40, padB = 22, padT = 10;
  const max = Math.max(1, ...p.data.map((d) => d.value));
  const nice = (() => { const e = Math.pow(10, Math.floor(Math.log10(max))); const f = max / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; })();
  const bw = (W - padL) / Math.max(1, p.data.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const fmt = (v: number) => (p.money ? taka(v) : n0(v));
  const step = Math.ceil(p.data.length / 8);
  return (
    <svg class="sa-chart" viewBox={`0 0 ${W} ${H}`} role="img">
      {[0, 0.5, 1].map((t) => (
        <g>
          <line x1={padL} x2={W} y1={y(nice * t)} y2={y(nice * t)} class="sa-grid" />
          <text x={padL - 6} y={y(nice * t) + 4} class="sa-axis" text-anchor="end">{p.money ? bn(Math.round(nice * t).toString()) : n0(nice * t)}</text>
        </g>
      ))}
      {p.data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 2 : 0, H - padB - y(d.value));
        return (
          <g>
            <rect x={padL + i * bw + bw * 0.15} y={H - padB - h} width={bw * 0.7} height={h} rx="3" fill={p.color ?? "#0f766e"}>
              <title>{d.label}: {fmt(d.value)}</title>
            </rect>
            {i % step === 0 && <text x={padL + i * bw + bw / 2} y={H - 6} class="sa-axis" text-anchor="middle">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
};

/** অনুভূমিক অনুপাত বার (স্ট্যাটাস ভাগ) */
export const SplitBar = ({ parts }: { parts: { label: string; value: number; cls: string }[] }) => {
  const total = Math.max(1, parts.reduce((a, b) => a + b.value, 0));
  return (
    <>
      <div class="sa-split">{parts.map((x) => x.value > 0 && <span class={x.cls} style={`width:${(x.value / total) * 100}%`} title={`${x.label}: ${x.value}`}></span>)}</div>
      <ul class="sa-legend">{parts.map((x) => <li><i class={x.cls}></i>{x.label} <b>{n0(x.value)}</b> <small>{pct((x.value / total) * 100)}</small></li>)}</ul>
    </>
  );
};

const Empty = ({ text }: { text: string }) => <p class="sa-empty">{text}</p>;

/* ---------- ড্যাশবোর্ড ---------- */
export type DashData = {
  counts: Record<string, number>;
  total: number;
  new: { today: number; d7: number; d30: number; prev30: number };
  revenue: { month: number; lastMonth: number; d30: number; cash30: number };
  mrr: number;
  arpu: number;
  paying: number;
  conversion: number;
  pastTrial: number;
  churn30: number;
  churnRate: number;
  orders: { today: number; d30: number; prev30: number };
  activeShops7: number;
  dues: { amount: number; shops: number };
  pending: { topups: number; topupAmount: number; domains: number; failedDomains: number };
  charts: { signups: { label: string; value: number }[]; orders: { label: string; value: number }[]; revenue: { label: string; value: number }[] };
  topShops: { id: string; name: string; slug: string; n: number }[];
  trialsEnding: { id: string; name: string; trial_ends_at: string; trial_orders_left: number; owner_phone: string | null }[];
  atRisk: { id: string; name: string; last_order_at: string | null; balance: number }[];
  recentShops: { id: string; name: string; slug: string; status: string; created_at: string }[];
  recentAudit: AuditRow[];
  cron: { daily: string | null; domains: string | null };
  usage: Usage;
  suspicious: number;
  phonePending: number;
  r2: import("./r2").R2Status;
};

const delta = (cur: number, prev: number) => {
  if (!prev) return cur ? { text: "নতুন", tone: "up" as const } : { text: "আগের মতো", tone: "" as const };
  const d = ((cur - prev) / prev) * 100;
  return { text: `${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))} আগের ৩০ দিনের তুলনায়`, tone: d >= 0 ? ("up" as const) : ("down" as const) };
};

export const DashboardPage = ({ d, role }: { d: DashData; role: SuperRole }) => {
  const sNew = delta(d.new.d30, d.new.prev30);
  const sOrd = delta(d.orders.d30, d.orders.prev30);
  const sRev = delta(d.revenue.month, d.revenue.lastMonth);
  return (
    <>
      {(d.pending.topups > 0 || d.pending.failedDomains > 0 || d.dues.shops > 0 || d.suspicious > 0 || d.phonePending > 0) && (
        <div class="sa-todo">
          <b>আজকের কাজ:</b>
          {d.pending.topups > 0 && can(role, "topups") && <a href="/super/topups"><Icon name="credit-card" size="sm" /> {bn(d.pending.topups)}টা রিচার্জ অনুমোদনের অপেক্ষায় ({taka(d.pending.topupAmount)})</a>}
          {d.dues.shops > 0 && <a href="/super/shops?filter=dues"><Icon name="triangle-alert" size="sm" /> {bn(d.dues.shops)}টা দোকানের ব্যালেন্স মাইনাস</a>}
          {d.phonePending > 0 && <a href="/super/shops?filter=phone_pending"><Icon name="phone" size="sm" /> {bn(d.phonePending)}টা নতুন দোকানে ফোন করে যাচাই বাকি</a>}
          {d.suspicious > 0 && <a href="/super/shops?filter=suspicious"><Icon name="shield-check" size="sm" /> {bn(d.suspicious)}টা সন্দেহজনক নতুন দোকান দেখুন</a>}
          {d.pending.failedDomains > 0 && <a href="/super/shops?filter=domain_failed"><Icon name="globe" size="sm" /> {bn(d.pending.failedDomains)}টা ডোমেইনে সমস্যা</a>}
        </div>
      )}

      <div class="sa-kpis">
        <Kpi label="আনুমানিক MRR" value={taka(d.mrr)} sub={`ARPU ${taka(d.arpu)} · ${bn(d.paying)}টা পেইড দোকান`} href={can(role, "finance") ? "/super/finance" : undefined} />
        <Kpi label="এই মাসের আয়" value={taka(d.revenue.month)} sub={sRev.text.replace("আগের ৩০ দিনের", "গত মাসের")} tone={sRev.tone} />
        <Kpi label="মোট দোকান" value={n0(d.total)} sub={`আজ +${bn(d.new.today)} · ৭ দিনে +${bn(d.new.d7)}`} tone="up" href="/super/shops" />
        <Kpi label="সক্রিয় দোকান (৭ দিন)" value={n0(d.activeShops7)} sub={`${pct(d.total ? (d.activeShops7 / d.total) * 100 : 0)} দোকানে গত ৭ দিনে অর্ডার`} />
      </div>
      <div class="sa-kpis">
        <Kpi label="কনফার্ম অর্ডার (৩০ দিন)" value={n0(d.orders.d30)} sub={sOrd.text} tone={sOrd.tone} />
        <Kpi label="নতুন সাইনআপ (৩০ দিন)" value={n0(d.new.d30)} sub={sNew.text} tone={sNew.tone} />
        <Kpi label="ট্রায়াল → পেইড" value={pct(d.conversion)} sub={`ট্রায়াল শেষ হওয়া ${bn(d.pastTrial)}টার মধ্যে রিচার্জ করেছে`} />
        <Kpi label="চার্ন (৩০ দিন)" value={pct(d.churnRate)} sub={`${bn(d.churn30)}টা দোকান বন্ধ/স্থগিত`} tone={d.churnRate > 5 ? "down" : ""} />
      </div>

      <div class="sa-grid-2">
        <Card title="আয় — শেষ ৩০ দিন" action={<span class="sa-muted">মোট {taka(d.revenue.d30)} · রিচার্জে এসেছে {taka(d.revenue.cash30)}</span>}>
          <BarChart data={d.charts.revenue} money color="#ea580c" />
        </Card>
        <Card title="কনফার্ম অর্ডার — সব দোকান মিলিয়ে" action={<span class="sa-muted">আজ {n0(d.orders.today)}টা</span>}>
          <BarChart data={d.charts.orders} color="#0f766e" />
        </Card>
      </div>

      <div class="sa-grid-3">
        <Card title="নতুন দোকান — শেষ ৩০ দিন">
          <BarChart data={d.charts.signups} color="#6366f1" height={150} />
        </Card>
        <Card title="দোকানের অবস্থা">
          <SplitBar parts={[
            { label: "চালু", value: d.counts.active ?? 0, cls: "sa-c-active" },
            { label: "ট্রায়াল", value: d.counts.trial ?? 0, cls: "sa-c-trial" },
            { label: "স্থগিত", value: d.counts.suspended ?? 0, cls: "sa-c-suspended" },
            { label: "বন্ধ", value: d.counts.closed ?? 0, cls: "sa-c-closed" },
          ]} />
          <div class="sa-mini-stats">
            <div><small>বকেয়া</small><b class="sa-down">{taka(d.dues.amount)}</b></div>
            <div><small>ডোমেইন অপেক্ষায়</small><b>{bn(d.pending.domains)}</b></div>
          </div>
        </Card>
        <Card title="সিস্টেম">
          <ul class="sa-sys">
            <li><span class={d.cron.daily && Date.now() - new Date(d.cron.daily.replace(" ", "T") + "Z").getTime() < 26 * 3600e3 ? "sa-dot-ok" : "sa-dot-warn"}></span>দৈনিক বিলিং <small>{ago(d.cron.daily)}</small></li>
            <li><span class={d.cron.domains && Date.now() - new Date(d.cron.domains.replace(" ", "T") + "Z").getTime() < 2 * 3600e3 ? "sa-dot-ok" : "sa-dot-warn"}></span>ডোমেইন যাচাই <small>{ago(d.cron.domains)}</small></li>
            <li><span class={d.usage.d1Pct >= WARN_AT ? "sa-dot-warn" : "sa-dot-ok"}></span>মূল ডাটাবেস <small>{mbStr(d.usage.d1Bytes)} / ৫০০ MB ({pctStr(d.usage.d1Pct)})</small></li>
            <li><span class={d.usage.doPct >= WARN_AT ? "sa-dot-warn" : "sa-dot-ok"}></span>দোকানগুলোর জায়গা <small>{mbStr(d.usage.doBytes)} / ৫ GB ({pctStr(d.usage.doPct)}) · মাপা হয়েছে {bn(d.usage.checked)}/{bn(d.usage.total)}টা</small></li>
            {d.usage.biggest && <li><span class="sa-dot-ok"></span>সবচেয়ে বড় দোকান <small><a href={`/super/shops/${d.usage.biggest.id}`}>{d.usage.biggest.name}</a> — {mbStr(d.usage.biggest.bytes)}</small></li>}
          </ul>
          {d.usage.warn && <p class="sa-alert sa-alert-err">ফ্রি প্ল্যানের জায়গার ৮০% পার হয়েছে। অব্যবহৃত ছবি মোছা বা Workers Paid ($৫/মাস) নেওয়ার সময় হয়েছে।</p>}
          <p class="sa-muted"><small>দৈনিক অনুরোধের হিসাব Cloudflare ড্যাশবোর্ড → Workers → f-shop-এ দেখা যায় (ফ্রিতে দিনে ১ লাখ)।</small></p>
          <R2Box r={d.r2} owner={role === "owner"} />
        </Card>
      </div>

      <div class="sa-grid-3">
        <Card title="সেরা দোকান (৩০ দিনের অর্ডার)">
          {d.topShops.length === 0 ? <Empty text="এখনো অর্ডার নেই" /> : (
            <ol class="sa-rank">{d.topShops.map((s) => <li><a href={`/super/shops/${s.id}`}>{s.name}</a><b>{n0(s.n)}</b></li>)}</ol>
          )}
        </Card>
        <Card title="ট্রায়াল শেষ হচ্ছে (৩ দিনে)" action={<a href="/super/shops?filter=trial_ending" class="sa-link">সব</a>}>
          {d.trialsEnding.length === 0 ? <Empty text="কেউ নেই" /> : (
            <ul class="sa-list">{d.trialsEnding.map((s) => (
              <li><a href={`/super/shops/${s.id}`}>{s.name}</a><small>{dhakaTime(s.trial_ends_at)} · বাকি {bn(s.trial_orders_left)} অর্ডার{s.owner_phone ? ` · ${s.owner_phone}` : ""}</small></li>
            ))}</ul>
          )}
        </Card>
        <Card title="ঝুঁকিতে (১৪ দিন অর্ডার নেই)" action={<a href="/super/shops?filter=at_risk" class="sa-link">সব</a>}>
          {d.atRisk.length === 0 ? <Empty text="কেউ নেই" /> : (
            <ul class="sa-list">{d.atRisk.map((s) => (
              <li><a href={`/super/shops/${s.id}`}>{s.name}</a><small>শেষ অর্ডার {ago(s.last_order_at)} · ব্যালেন্স {taka(s.balance)}</small></li>
            ))}</ul>
          )}
        </Card>
      </div>

      <div class="sa-grid-2">
        <Card title="নতুন দোকান" action={<a href="/super/shops" class="sa-link">সব দোকান</a>}>
          <table class="sa-table">
            <tbody>{d.recentShops.map((s) => (
              <tr><td><a href={`/super/shops/${s.id}`}><b>{s.name}</b></a><br /><small class="sa-muted">{s.slug}</small></td><td><StatusPill s={s.status} /></td><td class="sa-r"><small>{ago(s.created_at)}</small></td></tr>
            ))}</tbody>
          </table>
        </Card>
        {can(role, "audit") && (
          <Card title="টিমের সাম্প্রতিক কাজ" action={<a href="/super/audit" class="sa-link">অডিট লগ</a>}>
            {d.recentAudit.length === 0 ? <Empty text="এখনো কিছু নেই" /> : <AuditList rows={d.recentAudit} compact />}
          </Card>
        )}
      </div>
    </>
  );
};

/* ---------- দোকানের তালিকা ---------- */
export type ShopRow = {
  id: string; slug: string; name: string; owner_name: string | null; owner_phone: string | null; owner_email: string | null;
  status: string; trial_ends_at: string | null; trial_orders_left: number; created_at: string; domains: string | null;
  balance: number; confirmed_orders: number; last_order_at: string | null; last_login_at: string | null; staff_count: number;
  plan?: string; period_orders?: number; plan_next?: string | null; deleted_at?: string | null; delete_warned?: string | null;
  email_verified?: number; phone_verified?: number; signup_ip?: string | null; risk?: string | null; risk_cleared?: number;
  next_bill_at: string | null; low_balance_since: string | null; activated_at: string | null; first_topup_at: string | null; status_changed_at: string | null;
};

export const SHOP_FILTERS: Record<string, string> = {
  "": "সব",
  trial: "ট্রায়াল",
  active: "চালু",
  suspended: "স্থগিত",
  closed: "বন্ধ",
  idle: "মোছার পথে",
  deleted: "মুছে ফেলা",
  dues: "ব্যালেন্স মাইনাস",
  at_risk: "ঝুঁকিতে",
  trial_ending: "ট্রায়াল শেষ হচ্ছে",
  paying: "পেইড",
  custom_domain: "নিজের ডোমেইন",
  domain_failed: "ডোমেইনে সমস্যা",
  suspicious: "সন্দেহজনক",
  phone_pending: "ফোনে যাচাই বাকি",
};
export const SHOP_SORTS: Record<string, string> = { new: "নতুন আগে", old: "পুরনো আগে", orders: "বেশি অর্ডার", balance_low: "কম ব্যালেন্স", balance_high: "বেশি ব্যালেন্স", last_order: "সাম্প্রতিক অর্ডার", name: "নাম" };

export const ShopsPage = (p: { rows: ShopRow[]; counts: Record<string, number>; q: string; filter: string; sort: string; page: number; total: number; per: number; shopLink: (slug: string) => string; canEnter?: boolean; canExport?: boolean }) => {
  const qs = (o: Record<string, string | number>) => {
    const u = new URLSearchParams({ q: p.q, filter: p.filter, sort: p.sort, page: String(p.page), ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) });
    for (const [k, v] of [...u]) if (!v || (k === "page" && v === "1") || (k === "sort" && v === "new")) u.delete(k);
    const s = u.toString();
    return `/super/shops${s ? `?${s}` : ""}`;
  };
  const pages = Math.max(1, Math.ceil(p.total / p.per));
  return (
    <>
      <div class="sa-chips">
        {Object.entries(SHOP_FILTERS).map(([k, label]) => (
          <a href={qs({ filter: k, page: 1 })} class={p.filter === k ? "active" : ""}>{label}{p.counts[k] !== undefined && <span>{n0(p.counts[k]!)}</span>}</a>
        ))}
      </div>
      <form method="get" action="/super/shops" class="sa-toolbar">
        <input type="search" name="q" value={p.q} placeholder="নাম, ঠিকানা, মোবাইল, ইমেইল বা ডোমেইন" />
        {p.filter && <input type="hidden" name="filter" value={p.filter} />}
        <select name="sort">{Object.entries(SHOP_SORTS).map(([k, l]) => <option value={k} selected={p.sort === k}>{l}</option>)}</select>
        <button class="sa-btn">খুঁজুন</button>
        {p.canExport && <a class="sa-btn sa-btn-ghost" href={`/super/shops.csv?${new URLSearchParams({ q: p.q, filter: p.filter, sort: p.sort })}`}>⬇ CSV</a>}
      </form>
      <Card>
        <p class="sa-muted sa-count">{n0(p.total)}টা দোকান{p.q ? ` — "${p.q}"` : ""}</p>
        {p.rows.length === 0 ? <Empty text="কোনো দোকান পাওয়া যায়নি" /> : (
          <div class="sa-table-wrap">
            <table class="sa-table">
              <thead><tr><th>দোকান</th><th>মালিক</th><th>অবস্থা</th><th class="sa-r">ব্যালেন্স</th><th class="sa-r">অর্ডার</th><th>শেষ অর্ডার</th><th>শেষ লগইন</th><th>তৈরি</th>{p.canEnter && <th></th>}</tr></thead>
              <tbody>
                {p.rows.map((s) => (
                  <tr>
                    <td><a href={`/super/shops/${s.id}`}><b>{s.name}</b></a><br />
                      <a href={p.shopLink(s.slug)} target="_blank" rel="noopener" class="sa-muted">{s.slug} ↗</a>
                      {s.domains && <><br /><small class="sa-tag"><Icon name="globe" size="sm" /> {s.domains}</small></>}</td>
                    <td>{s.owner_name || "—"}<br /><small class="sa-muted">{s.owner_phone}</small></td>
                    <td><StatusPill s={s.status} />{s.status === "trial" && <><br /><small class="sa-muted">শেষ {dhakaTime(s.trial_ends_at).slice(0, 10)}</small></>}</td>
                    <td class={`sa-r ${s.balance < 0 ? "sa-down" : ""}`}>{taka(s.balance)}</td>
                    <td class="sa-r">{n0(s.confirmed_orders)}</td>
                    <td><small>{ago(s.last_order_at)}</small></td>
                    <td><small>{ago(s.last_login_at)}</small></td>
                    <td><small>{dhakaTime(s.created_at).slice(0, 10)}</small></td>
                    {p.canEnter && (
                      <td class="sa-r">
                        <form method="post" action={`/super/shops/${s.id}/impersonate`} target="_blank" class="sa-inline">
                          <button class="sa-btn sa-btn-sm sa-btn-accent" title="পাসওয়ার্ড ছাড়া এই দোকানের অ্যাডমিন প্যানেলে ঢুকুন"><Icon name="key-round" size="sm" /> ঢুকুন</button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div class="sa-pager">
            {p.page > 1 && <a href={qs({ page: p.page - 1 })} class="sa-btn sa-btn-ghost">← আগের</a>}
            <span class="sa-muted">পেজ {bn(p.page)} / {bn(pages)}</span>
            {p.page < pages && <a href={qs({ page: p.page + 1 })} class="sa-btn sa-btn-ghost">পরের →</a>}
          </div>
        )}
      </Card>
    </>
  );
};

/* ---------- দোকানের ৩৬০° ভিউ ---------- */
export type LedgerRow = { id: number; type: string; amount: number; balance_after: number | null; note: string | null; ref?: string; created_at: string; shop_id?: string; shop_name?: string };
export type TopupRow = { id: number; shop_id: string; shop_name?: string; slug?: string; amount: number; method: string; sender: string; trx_id: string; status: string; created_at: string; decided_at?: string | null };
export type AuditRow = { id: number; admin_email: string | null; action: string; target_type: string | null; target_id: string | null; detail: string | null; ip?: string | null; created_at: string; shop_name?: string | null };
export type NoteRow = { id: number; admin_email: string | null; note: string; created_at: string };

export const LEDGER_LABEL: Record<string, string> = { topup: "রিচার্জ", order_fee: "অর্ডার চার্জ (পুরনো দাম)", monthly: "প্ল্যানের বিল", trial_order: "ট্রায়াল অর্ডার", adjust: "সমন্বয়", overage: "সীমার বেশি অর্ডার", plan_change: "প্ল্যান বদল", plan_order: "অর্ডার" };

const PLAN_NAME: Record<string, string> = { free: "ফ্রি", small: "ছোট দোকান", grow: "বাড়ন্ত", big: "বড় ব্র্যান্ড" };

export const ShopDetailPage = (p: {
  s: ShopRow;
  role: SuperRole;
  shopLink: string;
  domains: { hostname: string; status: string; error: string | null; checked_at: string | null }[];
  orders30: { label: string; value: number }[];
  orders30Total: number;
  revenue: { lifetime: number; topups: number };
  ledger: LedgerRow[];
  topups: TopupRow[];
  notes: NoteRow[];
  audit: AuditRow[];
  live?: ShopLive | null;
}) => {
  const s = p.s;
  const r = p.role;
  return (
    <>
      <div class="sa-shop-head">
        <div>
          <div class="sa-crumb"><a href="/super/shops">দোকান</a> / {s.slug}</div>
          <h2>{s.name} <StatusPill s={s.status} /></h2>
          <p class="sa-muted">{s.owner_name} · {s.owner_phone} · {s.owner_email} · তৈরি {dhakaTime(s.created_at)}</p>
          {s.deleted_at && <p class="sa-alert sa-alert-err">দোকানের সব ডাটা {dhakaTime(s.deleted_at)}-এ মুছে ফেলা হয়েছে ({s.delete_warned === "super" ? "সুপার অ্যাডমিন" : "৩০ দিন অচল বা বন্ধ"})। শুধু দোকানদারের তথ্য, প্ল্যান আর লেনদেন আছে।</p>}
        </div>
        <div class="sa-head-actions">
          <a href={p.shopLink} target="_blank" rel="noopener" class="sa-btn sa-btn-ghost">দোকান দেখুন ↗</a>
          {can(r, "shop.impersonate") && (
            <form method="post" action={`/super/shops/${s.id}/impersonate`} target="_blank" class="sa-inline">
              <button class="sa-btn sa-btn-accent"><Icon name="key-round" size="sm" /> দোকানের প্যানেলে ঢুকুন</button>
            </form>
          )}
        </div>
      </div>

      <div class="sa-kpis">
        <Kpi label="ব্যালেন্স" value={taka(s.balance)} sub={s.low_balance_since ? `মাইনাস ${ago(s.low_balance_since)} থেকে` : s.next_bill_at ? `পরের বিল ${dhakaTime(s.next_bill_at).slice(0, 10)}` : ""} tone={s.balance < 0 ? "down" : ""} />
        <Kpi label="প্ল্যান" value={PLAN_NAME[s.plan ?? "free"] ?? "—"} sub={`এই মাসে ${n0(s.period_orders ?? 0)}টা অর্ডার${s.plan_next ? ` · পরে: ${PLAN_NAME[s.plan_next] ?? ""}` : ""}`} />
        <Kpi label="মোট কনফার্ম অর্ডার" value={n0(s.confirmed_orders)} sub={`৩০ দিনে ${n0(p.orders30Total)}টা · শেষ ${ago(s.last_order_at)}`} />
        <Kpi label="আমাদের আয় (মোট)" value={taka(p.revenue.lifetime)} sub={`মোট রিচার্জ ${taka(p.revenue.topups)}`} />
        <Kpi label="শেষ লগইন" value={ago(s.last_login_at)} sub={`${bn(s.staff_count)} জন বাড়তি স্টাফ`} />
      </div>

      <VerifyRiskBox s={s} canEdit={can(r, "shop.status")} />

      {p.live && <LiveStats l={p.live} />}

      <div class="sa-grid-2-1">
        <div>
          <Card title="প্রতিদিনের কনফার্ম অর্ডার — শেষ ৩০ দিন"><BarChart data={p.orders30} height={150} /></Card>

          <Card title="লেনদেন" action={<span class="sa-muted">শেষ ২৫টা</span>}>
            {p.ledger.length === 0 ? <Empty text="এখনো কোনো লেনদেন নেই" /> : (
              <div class="sa-table-wrap"><table class="sa-table">
                <thead><tr><th>সময়</th><th>ধরন</th><th>বিবরণ</th><th class="sa-r">টাকা</th><th class="sa-r">ব্যালেন্স</th></tr></thead>
                <tbody>{p.ledger.map((l) => (
                  <tr><td><small>{dhakaTime(l.created_at)}</small></td><td><span class={`sa-pill sa-lg-${l.type}`}>{LEDGER_LABEL[l.type] ?? l.type}</span></td><td><small>{l.note}</small></td>
                    <td class={`sa-r ${l.amount < 0 ? "sa-down" : l.amount > 0 ? "sa-up" : ""}`}>{l.amount > 0 ? "+" : ""}{taka(l.amount)}</td><td class="sa-r">{l.balance_after === null ? "—" : taka(l.balance_after)}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>

          <Card title="রিচার্জ">
            {p.topups.length === 0 ? <Empty text="কোনো রিচার্জ নেই" /> : <TopupTable rows={p.topups} role={r} showShop={false} />}
          </Card>
        </div>

        <div>
          {can(r, "shop.export") && (
            <Card title="ব্যাকআপ">
              <p class="sa-muted">দোকানের সব ডাটা (পণ্য, অর্ডার, সেটিংস, পেজ) একটা JSON ফাইলে। পাসওয়ার্ড আর ছবির ফাইল থাকে না। ডাউনলোড অডিট লগে লেখা হয়।</p>
              <a class="sa-btn sa-btn-ghost" href={`/super/shops/${s.id}/export.json`}>পুরো ব্যাকআপ (JSON)</a>
              <p class="sa-muted">দোকানদার Excel কপি চাইলে (দোকানের প্যানেলে ডাউনলোড বন্ধ):</p>
              <a class="sa-btn sa-btn-ghost" href={`/super/shops/${s.id}/export/orders.csv`}>অর্ডার CSV</a>{" "}
              <a class="sa-btn sa-btn-ghost" href={`/super/shops/${s.id}/export/products.csv`}>পণ্য CSV</a>{" "}
              <a class="sa-btn sa-btn-ghost" href={`/super/shops/${s.id}/export/customers.csv`}>কাস্টমার CSV</a>
              {can(r, "shop.restore") && (
                <form method="post" action={`/super/shops/${s.id}/restore`} enctype="multipart/form-data" class="sa-form" data-confirm="এই দোকানের এখনকার পণ্য, অর্ডার, সেটিংস মুছে ব্যাকআপেরটা বসবে। নিশ্চিত?">
                  <label>ব্যাকআপ থেকে ফেরান <small class="sa-muted">(ইউজার আর ছবি যেমন আছে থাকবে)</small></label>
                  <input type="file" name="file" accept="application/json,.json" required />
                  <input type="text" name="confirm" placeholder={`নিশ্চিত করতে লিখুন: ${s.slug}`} required autocomplete="off" />
                  <button class="sa-btn sa-btn-danger">ফেরান</button>
                </form>
              )}
            </Card>
          )}
          {(can(r, "shop.status") || can(r, "shop.trial")) && (
            <Card title="নিয়ন্ত্রণ">
              {can(r, "shop.status") && (
                <form method="post" action={`/super/shops/${s.id}/status`} class="sa-form" data-confirm="দোকানের অবস্থা বদলাবেন? স্থগিত/বন্ধ করলে দোকানে অর্ডার নেওয়া বন্ধ হবে।">
                  <label>অবস্থা</label>
                  <div class="sa-row">
                    <select name="status">{Object.entries(SHOP_STATUS_LABEL).map(([k, l]) => <option value={k} selected={s.status === k}>{l}</option>)}</select>
                    <button class="sa-btn">বদলান</button>
                  </div>
                  <input type="text" name="reason" placeholder="কারণ (অডিট লগে থাকবে)" maxlength={200} />
                </form>
              )}
              {can(r, "shop.trial") && (
                <form method="post" action={`/super/shops/${s.id}/extend-trial`} class="sa-form">
                  <label>ট্রায়াল বাড়ান {s.status === "trial" && <small class="sa-muted">(এখন শেষ {dhakaTime(s.trial_ends_at).slice(0, 10)}, বাকি {bn(s.trial_orders_left)} অর্ডার)</small>}</label>
                  <div class="sa-row"><input type="number" name="days" value="7" min="1" max="90" /><span class="sa-muted">দিন</span><button class="sa-btn sa-btn-ghost">বাড়ান</button></div>
                </form>
              )}
            </Card>
          )}

          {can(r, "shop.adjust") && (
            <Card title="ব্যালেন্স সমন্বয়">
              <form method="post" action={`/super/shops/${s.id}/adjust`} class="sa-form" data-confirm="ব্যালেন্স বদলাবে আর লেনদেনে লেখা থাকবে। নিশ্চিত?">
                <div class="sa-row"><input type="number" name="amount" placeholder="+৫০ বা -২০" required /><span class="sa-muted">৳</span></div>
                <input type="text" name="note" placeholder="কারণ, যেমন: বোনাস / ভুল চার্জ ফেরত" required maxlength={200} />
                <button class="sa-btn">সমন্বয় করুন</button>
              </form>
            </Card>
          )}

          {can(r, "shop.edit") && (
            <Card title="মালিকের তথ্য">
              <form method="post" action={`/super/shops/${s.id}/edit`} class="sa-form">
                <label>দোকানের নাম</label><input type="text" name="name" value={s.name} required maxlength={100} />
                <label>মালিকের নাম</label><input type="text" name="owner_name" value={s.owner_name ?? ""} maxlength={100} />
                <label>মোবাইল</label><input type="tel" name="owner_phone" value={s.owner_phone ?? ""} maxlength={20} />
                <label>ইমেইল</label><input type="email" name="owner_email" value={s.owner_email ?? ""} maxlength={120} />
                <button class="sa-btn sa-btn-ghost">সেভ করুন</button>
              </form>
            </Card>
          )}

          <Card title="ডোমেইন">
            <ul class="sa-list">
              <li><a href={p.shopLink} target="_blank" rel="noopener">{p.shopLink.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a><small>ফ্রি subdomain</small></li>
              {p.domains.map((d) => (
                <li><code>{d.hostname}</code> <span class={`sa-pill sa-dm-${d.status}`}>{d.status === "active" ? "চালু" : d.status === "pending" ? "অপেক্ষায়" : "সমস্যা"}</span>
                  <small>{d.error ? `ত্রুটি: ${d.error}` : `যাচাই ${ago(d.checked_at)}`}</small></li>
              ))}
            </ul>
          </Card>

          <Card title="টিমের নোট">
            <form method="post" action={`/super/shops/${s.id}/notes`} class="sa-form">
              <textarea name="note" rows={2} placeholder="যেমন: ফোনে কথা হয়েছে, পরের সপ্তাহে রিচার্জ করবে" required maxlength={1000}></textarea>
              <button class="sa-btn sa-btn-ghost">নোট যোগ করুন</button>
            </form>
            <ul class="sa-notes">{p.notes.map((n) => <li><p>{n.note}</p><small>{n.admin_email} · {dhakaTime(n.created_at)}</small></li>)}</ul>
          </Card>

          <Card title="তথ্য">
            <dl class="sa-kv">
              <dt>দোকানের আইডি</dt><dd><code>{s.id}</code></dd>
              <dt>চালু হয়েছে</dt><dd>{dhakaTime(s.activated_at)}</dd>
              <dt>প্রথম রিচার্জ</dt><dd>{dhakaTime(s.first_topup_at)}</dd>
              <dt>অবস্থা বদল</dt><dd>{dhakaTime(s.status_changed_at)}</dd>
            </dl>
          </Card>

          {p.audit.length > 0 && <Card title="এই দোকানে টিমের কাজ"><AuditList rows={p.audit} compact /></Card>}
        </div>
      </div>
    </>
  );
};

/* ---------- দোকানের ভিতরের হিসাব (দোকানের নিজের ডাটাবেস থেকে) ---------- */
export type ShopLive = {
  products: { total: number; active: number };
  orders: Record<string, number>;
  recent: { order_no: string; name: string; total: number; status: string; created_at: string }[];
  users: number;
};
const ORDER_ST: Record<string, string> = { new: "নতুন", confirmed: "কনফার্ম", shipped: "শিপড", cancelled: "বাতিল", fake: "ফেক" };

const LiveStats = ({ l }: { l: ShopLive }) => (
  <Card title="দোকানের ভিতরে এখন" action={<span class="sa-muted">দোকানের নিজের ডাটাবেস থেকে</span>}>
    <div class="sa-live">
      <div><small>পণ্য</small><b>{n0(l.products.total)}</b><span>{n0(l.products.active)}টা চালু</span></div>
      <div><small>মোট অর্ডার</small><b>{n0(l.orders.total ?? 0)}</b><span>২৪ ঘণ্টায় {n0(l.orders.last24h ?? 0)}টা</span></div>
      <div><small>নতুন (অপেক্ষায়)</small><b class={(l.orders.new_orders ?? 0) > 0 ? "sa-warn" : ""}>{n0(l.orders.new_orders ?? 0)}</b><span>কনফার্ম {n0(l.orders.confirmed ?? 0)} · শিপড {n0(l.orders.shipped ?? 0)}</span></div>
      <div><small>বাতিল/ফেক</small><b>{n0(l.orders.cancelled ?? 0)}</b><span>{l.orders.total ? pct(((l.orders.cancelled ?? 0) / l.orders.total) * 100) : "—"}</span></div>
      <div><small>বিক্রি (কনফার্ম+শিপড)</small><b>{taka(l.orders.sales ?? 0)}</b><span>{n0(l.users)} জন অ্যাডমিন/স্টাফ</span></div>
    </div>
    {l.recent.length > 0 && (
      <div class="sa-table-wrap"><table class="sa-table">
        <thead><tr><th>সাম্প্রতিক অর্ডার</th><th>কাস্টমার</th><th class="sa-r">টাকা</th><th>অবস্থা</th><th>সময়</th></tr></thead>
        <tbody>{l.recent.map((o) => (
          <tr><td><b>{o.order_no}</b></td><td>{o.name}</td><td class="sa-r">{taka(o.total)}</td><td><span class={`sa-pill sa-os-${o.status}`}>{ORDER_ST[o.status] ?? o.status}</span></td><td><small>{ago(o.created_at)}</small></td></tr>
        ))}</tbody>
      </table></div>
    )}
  </Card>
);

/* ---------- রিচার্জ ---------- */
export const TopupTable = ({ rows, role, showShop = true }: { rows: TopupRow[]; role: SuperRole; showShop?: boolean }) => (
  <div class="sa-table-wrap"><table class="sa-table">
    <thead><tr>{showShop && <th>দোকান</th>}<th>সময়</th><th>মাধ্যম</th><th>Transaction ID</th><th>পাঠানো নম্বর</th><th class="sa-r">টাকা</th><th>অবস্থা</th></tr></thead>
    <tbody>{rows.map((t) => (
      <tr>
        {showShop && <td><a href={`/super/shops/${t.shop_id}`}>{t.shop_name}</a><br /><small class="sa-muted">{t.slug}</small></td>}
        <td><small>{dhakaTime(t.created_at)}</small></td>
        <td><span class={`sa-pill sa-pm-${t.method}`}>{t.method === "bkash" ? "bKash" : "Nagad"}</span></td>
        <td><code class="sa-code">{t.trx_id}</code></td>
        <td>{t.sender}</td>
        <td class="sa-r"><b>{taka(t.amount)}</b></td>
        <td>
          {t.status === "pending" && can(role, "topups") ? (
            <div class="sa-row">
              <form method="post" action={`/super/topups/${t.id}/approve`} class="sa-inline" data-confirm={`bKash/Nagad অ্যাপে ${t.trx_id} মিলিয়েছেন? ${taka(t.amount)} ব্যালেন্সে যোগ হবে।`}><button class="sa-btn sa-btn-sm">✓ অনুমোদন</button></form>
              <form method="post" action={`/super/topups/${t.id}/reject`} class="sa-inline" data-confirm="এই অনুরোধ বাতিল করবেন?"><button class="sa-btn sa-btn-sm sa-btn-danger">✕</button></form>
            </div>
          ) : <span class={`sa-pill sa-tp-${t.status}`}>{t.status === "approved" ? "অনুমোদিত" : t.status === "rejected" ? "বাতিল" : "অপেক্ষায়"}</span>}
        </td>
      </tr>
    ))}</tbody>
  </table></div>
);

export const TopupsPage = (p: { pending: TopupRow[]; recent: TopupRow[]; role: SuperRole; status: string; stats: { pendingAmount: number; today: number; d30: number } }) => (
  <>
    <div class="sa-kpis">
      <Kpi label="অপেক্ষায়" value={bn(p.pending.length)} sub={taka(p.stats.pendingAmount)} tone={p.pending.length ? "warn" : ""} />
      <Kpi label="আজ অনুমোদিত" value={taka(p.stats.today)} />
      <Kpi label="৩০ দিনে অনুমোদিত" value={taka(p.stats.d30)} />
    </div>
    <Card title="অনুমোদনের অপেক্ষায়" action={<span class="sa-muted">bKash/Nagad অ্যাপে Transaction ID আর টাকা মিলিয়ে তারপর অনুমোদন দিন</span>}>
      {p.pending.length === 0 ? <Empty text="অপেক্ষায় কোনো অনুরোধ নেই ✓" /> : <TopupTable rows={p.pending} role={p.role} />}
    </Card>
    <Card title="আগের অনুরোধ" action={
      <div class="sa-chips sa-chips-sm">{[["", "সব"], ["approved", "অনুমোদিত"], ["rejected", "বাতিল"]].map(([k, l]) => <a href={`/super/topups${k ? `?status=${k}` : ""}`} class={p.status === k ? "active" : ""}>{l}</a>)}</div>
    }>
      {p.recent.length === 0 ? <Empty text="কিছু নেই" /> : <TopupTable rows={p.recent} role={p.role} />}
    </Card>
  </>
);

/* ---------- আয় ও হিসাব ---------- */
export type FinanceData = {
  months: { label: string; orderFees: number; monthly: number; topups: number }[];
  totals: { revenue: number; topups: number; dues: number; credit: number };
  byType30: { type: string; amount: number; n: number }[];
  ledger: LedgerRow[];
  type: string;
};

export const FinancePage = ({ f }: { f: FinanceData }) => (
  <>
    <div class="sa-kpis">
      <Kpi label="মোট আয় (সব সময়)" value={taka(f.totals.revenue)} sub="অর্ডার চার্জ + মাসিক চার্জ" />
      <Kpi label="মোট রিচার্জ এসেছে" value={taka(f.totals.topups)} sub="অনুমোদিত bKash/Nagad" />
      <Kpi label="দোকানের কাছে জমা" value={taka(f.totals.credit)} sub="অগ্রিম ব্যালেন্স (দায়)" />
      <Kpi label="বকেয়া" value={taka(f.totals.dues)} sub="মাইনাস ব্যালেন্সের যোগফল" tone={f.totals.dues < 0 ? "down" : ""} />
    </div>
    <div class="sa-grid-2">
      <Card title="মাসিক আয় — শেষ ১২ মাস">
        <BarChart data={f.months.map((m) => ({ label: m.label, value: m.orderFees + m.monthly }))} money color="#ea580c" />
      </Card>
      <Card title="মাসিক রিচার্জ — শেষ ১২ মাস">
        <BarChart data={f.months.map((m) => ({ label: m.label, value: m.topups }))} money color="#0f766e" />
      </Card>
    </div>
    <Card title="মাস অনুযায়ী">
      <div class="sa-table-wrap"><table class="sa-table">
        <thead><tr><th>মাস</th><th class="sa-r">অর্ডার চার্জ</th><th class="sa-r">মাসিক চার্জ</th><th class="sa-r">মোট আয়</th><th class="sa-r">রিচার্জ</th></tr></thead>
        <tbody>{[...f.months].reverse().map((m) => (
          <tr><td>{m.label}</td><td class="sa-r">{taka(m.orderFees)}</td><td class="sa-r">{taka(m.monthly)}</td><td class="sa-r"><b>{taka(m.orderFees + m.monthly)}</b></td><td class="sa-r">{taka(m.topups)}</td></tr>
        ))}</tbody>
      </table></div>
    </Card>
    <Card title="সব লেনদেন" action={
      <div class="sa-chips sa-chips-sm">{[["", "সব"], ...Object.entries(LEDGER_LABEL)].map(([k, l]) => <a href={`/super/finance${k ? `?type=${k}` : ""}`} class={f.type === k ? "active" : ""}>{l}</a>)}</div>
    }>
      {f.ledger.length === 0 ? <Empty text="কিছু নেই" /> : (
        <div class="sa-table-wrap"><table class="sa-table">
          <thead><tr><th>সময়</th><th>দোকান</th><th>ধরন</th><th>বিবরণ</th><th class="sa-r">টাকা</th></tr></thead>
          <tbody>{f.ledger.map((l) => (
            <tr><td><small>{dhakaTime(l.created_at)}</small></td><td><a href={`/super/shops/${l.shop_id}`}>{l.shop_name}</a></td>
              <td><span class={`sa-pill sa-lg-${l.type}`}>{LEDGER_LABEL[l.type] ?? l.type}</span></td><td><small>{l.note}</small></td>
              <td class={`sa-r ${l.amount < 0 ? "sa-down" : "sa-up"}`}>{l.amount > 0 ? "+" : ""}{taka(l.amount)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  </>
);

/* ---------- ঘোষণা ---------- */
export type AnnRow = { id: number; title: string; body: string | null; level: string; active: number; ends_at: string | null; created_by: string | null; created_at: string };
const LEVEL_LABEL: Record<string, string> = { info: "তথ্য", success: "সুখবর", warn: "সতর্কতা" };

export const AnnouncementsPage = ({ rows }: { rows: AnnRow[] }) => (
  <div class="sa-grid-1-2">
    <Card title="নতুন ঘোষণা">
      <p class="sa-muted">সব দোকানের অ্যাডমিন প্যানেলের উপরে দেখাবে — নতুন ফিচার, দাম বদল, সার্ভিস বন্ধের খবর।</p>
      <form method="post" action="/super/announcements" class="sa-form">
        <label>শিরোনাম</label><input type="text" name="title" required maxlength={120} placeholder="যেমন: নতুন ফিচার — Pathao কুরিয়ার" />
        <label>বিস্তারিত (ঐচ্ছিক)</label><textarea name="body" rows={3} maxlength={500}></textarea>
        <label>ধরন</label>
        <select name="level">{Object.entries(LEVEL_LABEL).map(([k, l]) => <option value={k}>{l}</option>)}</select>
        <label>কত দিন দেখাবে</label>
        <div class="sa-row"><input type="number" name="days" value="7" min="1" max="365" /><span class="sa-muted">দিন</span></div>
        <button class="sa-btn">প্রকাশ করুন</button>
      </form>
    </Card>
    <Card title="সব ঘোষণা">
      {rows.length === 0 ? <Empty text="এখনো কোনো ঘোষণা নেই" /> : (
        <ul class="sa-anns">{rows.map((a) => {
          const live = a.active && (!a.ends_at || new Date(a.ends_at.replace(" ", "T") + "Z").getTime() > Date.now());
          return (
            <li class={`sa-ann sa-ann-${a.level}`}>
              <div><b>{a.title}</b> {live ? <span class="sa-pill sa-st-active">চলছে</span> : <span class="sa-pill sa-st-closed">বন্ধ</span>}
                {a.body && <p>{a.body}</p>}
                <small class="sa-muted">{LEVEL_LABEL[a.level]} · {a.created_by} · {dhakaTime(a.created_at)}{a.ends_at ? ` · শেষ ${dhakaTime(a.ends_at)}` : ""}</small></div>
              <form method="post" action={`/super/announcements/${a.id}/toggle`}><button class="sa-btn sa-btn-sm sa-btn-ghost">{a.active ? "বন্ধ করুন" : "আবার চালু"}</button></form>
            </li>
          );
        })}</ul>
      )}
    </Card>
  </div>
);

/* ---------- অডিট লগ ---------- */
export const ACTION_LABEL: Record<string, string> = {
  login: "লগইন", "shop.status": "দোকানের অবস্থা বদল", "shop.export": "দোকানের ব্যাকআপ", "shop.restore": "ব্যাকআপ থেকে ফেরানো", "shop.trial": "ট্রায়াল বাড়ানো", "shop.adjust": "ব্যালেন্স সমন্বয়", "shop.edit": "দোকানের তথ্য বদল",
  "shop.impersonate": "দোকানে সাপোর্ট লগইন", "shop.note": "নোট", "topup.approve": "রিচার্জ অনুমোদন", "topup.reject": "রিচার্জ বাতিল",
  "settings.update": "প্ল্যাটফর্ম সেটিংস", "announcement.create": "ঘোষণা প্রকাশ", "announcement.toggle": "ঘোষণা চালু/বন্ধ", "blog.save": "ব্লগ পোস্ট সেভ", "blog.delete": "ব্লগ পোস্ট মুছা",
  "team.add": "টিমে যোগ", "team.update": "টিম সদস্য বদল", "team.password": "পাসওয়ার্ড বদল", "export.shops": "দোকানের তালিকা ডাউনলোড",
};

export const AuditList = ({ rows, compact }: { rows: AuditRow[]; compact?: boolean }) => (
  <ul class={`sa-audit ${compact ? "sa-audit-compact" : ""}`}>
    {rows.map((a) => (
      <li>
        <span class="sa-audit-dot"></span>
        <div>
          <b>{ACTION_LABEL[a.action] ?? a.action}</b>
          {a.target_type === "shop" && a.target_id && <> — <a href={`/super/shops/${a.target_id}`}>{a.shop_name ?? "দোকান"}</a></>}
          {a.detail && <span class="sa-muted"> · {a.detail}</span>}
          <small>{a.admin_email} · {dhakaTime(a.created_at)}{!compact && a.ip ? ` · ${a.ip}` : ""}</small>
        </div>
      </li>
    ))}
  </ul>
);

export const AuditPage = (p: { rows: AuditRow[]; action: string; admin: string; admins: string[]; page: number; more: boolean }) => (
  <Card>
    <form method="get" action="/super/audit" class="sa-toolbar">
      <select name="action"><option value="">সব কাজ</option>{Object.entries(ACTION_LABEL).map(([k, l]) => <option value={k} selected={p.action === k}>{l}</option>)}</select>
      <select name="admin"><option value="">সব সদস্য</option>{p.admins.map((e) => <option value={e} selected={p.admin === e}>{e}</option>)}</select>
      <button class="sa-btn">দেখুন</button>
    </form>
    {p.rows.length === 0 ? <Empty text="কিছু পাওয়া যায়নি" /> : <AuditList rows={p.rows} />}
    <div class="sa-pager">
      {p.page > 1 && <a class="sa-btn sa-btn-ghost" href={`/super/audit?${new URLSearchParams({ action: p.action, admin: p.admin, page: String(p.page - 1) })}`}>← আগের</a>}
      {p.more && <a class="sa-btn sa-btn-ghost" href={`/super/audit?${new URLSearchParams({ action: p.action, admin: p.admin, page: String(p.page + 1) })}`}>পরের →</a>}
    </div>
  </Card>
);

/* ---------- এরর লগ ---------- */
export type ErrorRow = { id: number; shop_id: string | null; shop_name: string | null; method: string | null; path: string | null; message: string; stack: string | null; count: number; first_at: string; last_at: string; resolved: number };

export const ErrorsPage = (p: { rows: ErrorRow[]; showResolved: boolean; open: number; role: SuperRole }) => (
  <Card title={`সার্ভারের এরর — ${bn(p.open)}টা খোলা`} action={
    <a class="sa-btn sa-btn-ghost sa-btn-sm" href={p.showResolved ? "/super/errors" : "/super/errors?all=1"}>{p.showResolved ? "শুধু খোলা" : "সমাধান হওয়াগুলোও"}</a>
  }>
    <p class="sa-muted">কোনো দোকানে বা প্ল্যাটফর্মে সার্ভারের ভুল হলে এখানে আসে। একই ভুল বারবার হলে একটাই লাইন, পাশে কতবার হয়েছে। ঠিক করার পরে "সমাধান" চাপুন — আবার হলে নিজে থেকে খুলে যাবে।</p>
    {p.rows.length === 0 ? <Empty text="কোনো এরর নেই" /> : (
      <div class="sa-table-wrap"><table class="sa-table">
        <thead><tr><th>এরর</th><th>কোথায়</th><th>কতবার</th><th>শেষ</th><th></th></tr></thead>
        <tbody>{p.rows.map((e) => (
          <tr class={e.resolved ? "sa-dim" : ""}>
            <td><b>{e.message}</b>{e.stack && <details><summary class="sa-muted">বিস্তারিত</summary><pre class="sa-pre">{e.stack}</pre></details>}</td>
            <td><small>{e.method} {e.path}</small>{e.shop_id && <><br /><a href={`/super/shops/${e.shop_id}`}><small>{e.shop_name || e.shop_id}</small></a></>}</td>
            <td>{bn(e.count)}</td>
            <td><small>{ago(e.last_at)}</small></td>
            <td class="sa-r">{!e.resolved && (
              <form method="post" action={`/super/errors/${e.id}/resolve`} class="sa-inline"><button class="sa-btn sa-btn-sm sa-btn-ghost">সমাধান</button></form>
            )}</td>
          </tr>
        ))}</tbody>
      </table></div>
    )}
  </Card>
);

/* ---------- টিম ---------- */
export type TeamRow = { id: number; email: string; name: string | null; role: SuperRole; active: number; last_login_at: string | null; created_at: string };

export const TeamPage = ({ rows, me, errors, values }: { rows: TeamRow[]; me: number; errors?: Record<string, string>; values?: Record<string, string> }) => (
  <div class="sa-grid-2-1">
    <Card title="টিমের সদস্য">
      <div class="sa-table-wrap"><table class="sa-table">
        <thead><tr><th>সদস্য</th><th>রোল</th><th>শেষ লগইন</th><th></th></tr></thead>
        <tbody>{rows.map((u) => (
          <tr class={u.active ? "" : "sa-dim"}>
            <td><b>{u.name || "—"}</b>{u.id === me && <span class="sa-pill">আপনি</span>}<br /><small class="sa-muted">{u.email}</small></td>
            <td>
              {u.id === me ? SUPER_ROLE_LABEL[u.role] : (
                <form method="post" action={`/super/team/${u.id}`} class="sa-row">
                  <select name="role">{(Object.keys(SUPER_ROLE_LABEL) as SuperRole[]).map((k) => <option value={k} selected={u.role === k}>{SUPER_ROLE_LABEL[k]}</option>)}</select>
                  <input type="hidden" name="active" value={String(u.active)} />
                  <button class="sa-btn sa-btn-sm sa-btn-ghost">সেভ</button>
                </form>
              )}
            </td>
            <td><small>{ago(u.last_login_at)}</small></td>
            <td class="sa-r">{u.id !== me && (
              <form method="post" action={`/super/team/${u.id}`} class="sa-inline" data-confirm={u.active ? "এই সদস্যের প্রবেশ বন্ধ হবে। নিশ্চিত?" : undefined}>
                <input type="hidden" name="role" value={u.role} /><input type="hidden" name="active" value={u.active ? "0" : "1"} />
                <button class={`sa-btn sa-btn-sm ${u.active ? "sa-btn-danger" : "sa-btn-ghost"}`}>{u.active ? "বন্ধ করুন" : "চালু করুন"}</button>
              </form>
            )}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <h3 class="sa-h3">রোল কী কী পারে</h3>
      <ul class="sa-roles">{(Object.keys(SUPER_ROLE_LABEL) as SuperRole[]).map((k) => <li><b>{SUPER_ROLE_LABEL[k]}</b> — {SUPER_ROLE_DESC[k]}</li>)}</ul>
    </Card>
    <Card title="নতুন সদস্য">
      <form method="post" action="/super/team" class="sa-form">
        <label>নাম</label><input type="text" name="name" value={values?.name ?? ""} required maxlength={80} />
        <label>ইমেইল</label><input type="email" name="email" value={values?.email ?? ""} required maxlength={120} />
        {errors?.email && <small class="sa-err">{errors.email}</small>}
        <label>রোল</label>
        <select name="role">{(Object.keys(SUPER_ROLE_LABEL) as SuperRole[]).map((k) => <option value={k} selected={(values?.role ?? "support") === k}>{SUPER_ROLE_LABEL[k]}</option>)}</select>
        <label>পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)</label><input type="password" name="password" required minlength={10} autocomplete="new-password" />
        {errors?.password && <small class="sa-err">{errors.password}</small>}
        <button class="sa-btn">যোগ করুন</button>
      </form>
    </Card>
  </div>
);

/* ---------- নিজের অ্যাকাউন্ট ---------- */
export const AccountPage = ({ admin, error }: { admin: SuperAdmin; error?: string }) => (
  <div class="sa-narrow">
    <Card title="আমার অ্যাকাউন্ট">
      <dl class="sa-kv"><dt>ইমেইল</dt><dd>{admin.email}</dd><dt>রোল</dt><dd>{SUPER_ROLE_LABEL[admin.role]}</dd></dl>
      <form method="post" action="/super/account" class="sa-form">
        <label>নাম</label><input type="text" name="name" value={admin.name ?? ""} maxlength={80} />
        <label>বর্তমান পাসওয়ার্ড</label><input type="password" name="current" autocomplete="current-password" />
        <label>নতুন পাসওয়ার্ড (বদলাতে চাইলে, কমপক্ষে ১০ অক্ষর)</label><input type="password" name="password" minlength={10} autocomplete="new-password" />
        {error && <small class="sa-err">{error}</small>}
        <button class="sa-btn">সেভ করুন</button>
      </form>
      <form method="post" action="/super/account/logout-all" class="sa-form" data-confirm="সব ডিভাইস থেকে লগআউট হবে। চালিয়ে যাবেন?">
        <button class="sa-btn sa-btn-ghost">সব ডিভাইস থেকে লগআউট</button>
      </form>
    </Card>
  </div>
);

/* ---------- প্ল্যাটফর্ম সেটিংস ---------- */
export const SettingsPage = ({ s }: { s: Record<string, string> }) => (
  <form method="post" action="/super/settings" class="sa-grid-2">
    <Card title="প্ল্যানের দাম ও সীমা">
      <div class="sa-form">
        {(["free", "small", "grow", "big"] as const).map((k) => {
          const pl = plans(s)[k];
          return (
            <fieldset class="sa-plan-set">
              <legend>{pl.name}</legend>
              <div class="sa-row">
                <label>মাসিক ৳<input type="number" min="0" name={`plan_${k}_price`} value={String(pl.price)} required /></label>
                <label>অর্ডার/মাস<input type="number" min="0" name={`plan_${k}_orders`} value={String(pl.orders)} required /></label>
                <label>বাড়তি প্রতি অর্ডার ৳<input type="number" min="0" step="0.05" name={`plan_${k}_extra`} value={String(pl.extra)} required /></label>
                <label>স্টাফ (মালিক ছাড়া)<input type="number" min="0" name={`plan_${k}_staff`} value={String(pl.staff)} required /></label>
                <label>ছবির জায়গা (MB)<input type="number" min="10" name={`plan_${k}_storage`} value={String(pl.storage)} required /></label>
              </div>
            </fieldset>
          );
        })}
        <label>প্ল্যানের বাইরে প্রতি স্টাফ, মাসিক (৳)</label><input type="number" min="0" name="staff_fee" value={s.staff_fee} required />
        <label>সর্বনিম্ন রিচার্জ (৳)</label><input type="number" min="0" name="min_topup" value={s.min_topup} required />
        <small class="sa-muted">দাম বদলালে নতুন বিল থেকে কার্যকর; প্রাইসিং পেজ নিজে থেকে বদলায়।</small>
      </div>
    </Card>
    <Card title="ট্রায়াল আর বকেয়া">
      <div class="sa-form">
        <label>ট্রায়াল (দিন)</label><input type="number" min="0" name="trial_days" value={s.trial_days} required />
        <label>ট্রায়ালে সর্বোচ্চ অর্ডার ("বাড়ন্ত" প্ল্যানের সুবিধা)</label><input type="number" min="0" name="trial_orders" value={s.trial_orders} required />
        <label>ব্যালেন্স মাইনাসের পর কত দিন অর্ডার চালু থাকবে</label><input type="number" min="0" name="grace_days" value={s.grace_days} required />
      </div>
    </Card>
    <Card title="পেমেন্ট আর সাপোর্ট">
      <div class="sa-form">
        <label>bKash নম্বর</label><input type="text" name="bkash_number" value={s.bkash_number} />
        <label>Nagad নম্বর</label><input type="text" name="nagad_number" value={s.nagad_number} />
        <label>সাপোর্ট নম্বর (হোমপেজে দেখাবে)</label><input type="text" name="support_phone" value={s.support_phone} />
      </div>
    </Card>
    <Card title="সেভ">
      <p class="sa-muted">নতুন দাম শুধু এরপরের চার্জে লাগবে। আগের লেনদেন বদলাবে না। সব বদল অডিট লগে থাকবে।</p>
      <button class="sa-btn sa-btn-block">সেটিংস সেভ করুন</button>
    </Card>
  </form>
);

/** সাইনআপের পাহারা — Turnstile, ইমেইল/ফোন যাচাই, প্ল্যাটফর্মের SMS */
/** Google Search Console, Bing আর GA4 — মূল সাইটের SEO মাপার জন্য */
export const GoogleSettings = ({ s }: { s: Record<string, string> }) => (
  <form method="post" action="/super/settings/seo" style="margin-top:16px">
    <Card title="Google ও Bing (সার্চে আসা আর ভিজিট মাপা)">
      <div class="sa-form">
        <p class="sa-muted"><small>Search Console-এ "URL prefix" দিয়ে https://sellxbd.com যোগ করে "HTML tag" বাছলে যে মেটা ট্যাগ দেয়, পুরোটা বা শুধু content-এর কোড এখানে বসান — সেভ করে Search Console-এ Verify চাপুন। (Domain property হলে Cloudflare DNS-এ TXT রেকর্ডই যথেষ্ট, এখানে লাগবে না।)</small></p>
        <label>Google Search Console যাচাই কোড</label><input type="text" name="gsc_verification" value={s.gsc_verification || ""} maxlength={300} autocomplete="off" placeholder='<meta name="google-site-verification" content="…">' />
        <label>Bing Webmaster যাচাই কোড (msvalidate.01)</label><input type="text" name="bing_verification" value={s.bing_verification || ""} maxlength={300} autocomplete="off" />
        <label>Google Analytics 4 — Measurement ID</label><input type="text" name="ga4_id" value={s.ga4_id || ""} maxlength={20} autocomplete="off" placeholder="G-XXXXXXXXXX" />
        <small class="sa-muted">শুধু মূল সাইটের পাবলিক পেজে বসে (হোম, দাম, ব্লগ, সাইনআপ…) — দোকান, অ্যাডমিন আর সুপার অ্যাডমিনে নয়।</small>
        <button class="sa-btn">সেভ করুন</button>
      </div>
    </Card>
  </form>
);

export const SecuritySettings = ({ s, emailBinding }: { s: Record<string, string>; emailBinding: boolean }) => {
  const set = (k: string) => !!(s[k] || "").trim();
  return (
    <form method="post" action="/super/settings/security" class="sa-grid-2" style="margin-top:16px">
      <Card title="সাইনআপে বট আটকানো (Cloudflare Turnstile)">
        <div class="sa-form">
          <p class="sa-muted"><small>Cloudflare ড্যাশবোর্ড → Turnstile → Add widget (ডোমেইন sellxbd.com) থেকে দুটো কী। দুটো দিলেই সাইনআপে চালু।</small></p>
          <label>Site key</label><input type="text" name="turnstile_site_key" value={s.turnstile_site_key || ""} autocomplete="off" />
          <label>Secret key {set("turnstile_secret") && <small class="sa-muted">(দেওয়া আছে — বদলাতে নতুনটা লিখুন)</small>}</label>
          <input type="password" name="turnstile_secret" value="" placeholder={set("turnstile_secret") ? "••••••••" : ""} autocomplete="new-password" />
        </div>
      </Card>
      <Card title="নতুন দোকানের যাচাই">
        <div class="sa-form">
          <label class="sa-check"><input type="checkbox" name="verify_email" value="1" checked={s.verify_email === "1"} /> ইমেইল যাচাই (লিংক)</label>
          <small class="sa-muted">{emailBinding ? "ইমেইল পাঠানোর ব্যবস্থা যুক্ত আছে।" : "ইমেইল পাঠানোর ব্যবস্থা (Cloudflare Email Sending) এখনো যুক্ত হয়নি — চালু রাখলেও লাগবে না।"}</small>
          <label>যে ঠিকানা থেকে ইমেইল যাবে</label><input type="email" name="verify_email_from" value={s.verify_email_from || ""} placeholder="no-reply@sellxbd.com" />
          <label>মোবাইল যাচাই</label>
          <select name="verify_phone">
            <option value="0" selected={!["call", "sms", "1"].includes(s.verify_phone || "")}>বন্ধ</option>
            <option value="call" selected={s.verify_phone === "call"}>টিম ফোন করে যাচাই করবে (হাতে)</option>
            <option value="sms" selected={s.verify_phone === "sms" || s.verify_phone === "1"}>SMS-এ OTP (নিচে SMS লাগবে)</option>
          </select>
          <small class="sa-muted">যাচাই বাকি দোকান চলে কিন্তু অর্ডার নেয় না আর Google-এ যায় না। "ফোন করে" বাছলে ড্যাশবোর্ডের "আজকের কাজ"-এ কাদের ফোন করতে হবে দেখাবে; দোকানের পাতায় "ফোনে কথা হয়েছে" চাপলে চালু।</small>
        </div>
      </Card>
      <Card title="প্ল্যাটফর্মের SMS (OTP-র জন্য)">
        <div class="sa-form">
          <label>গেটওয়ে</label>
          <select name="sms_provider">
            <option value="bulksmsbd" selected={(s.sms_provider || "bulksmsbd") === "bulksmsbd"}>BulkSMSBD</option>
            <option value="smsnetbd" selected={s.sms_provider === "smsnetbd"}>SMS.net.bd (Alpha SMS)</option>
          </select>
          <label>API Key {set("sms_api_key") && <small class="sa-muted">(দেওয়া আছে — বদলাতে নতুনটা লিখুন)</small>}</label>
          <input type="password" name="sms_api_key" value="" placeholder={set("sms_api_key") ? "••••••••" : ""} autocomplete="new-password" />
          <label>Sender ID</label><input type="text" name="sms_sender_id" value={s.sms_sender_id || ""} />
          <small class="sa-muted">প্রতি OTP-তে একটা SMS (প্রায় ৳০.৩০–০.৫০)। একটা দোকানে দিনে সর্বোচ্চ ৫টা।</small>
        </div>
      </Card>
      <Card title="সেভ">
        <p class="sa-muted">কী আর API Key অডিট লগে লেখা হয় না, শুধু "বদলেছে" লেখা থাকে।</p>
        <button class="sa-btn sa-btn-block">নিরাপত্তা সেটিংস সেভ করুন</button>
      </Card>
    </form>
  );
};

/* ---------- ল্যান্ডিং টেমপ্লেট (সব দোকানে ফ্রি) ---------- */
export type TplRow = { id: number; name: string; category: string; description: string | null; json: string; active: number; sort_order: number; updated_at: string };

export const TemplateForm = ({ t, categories, error }: { t?: Partial<TplRow>; categories: string[]; error?: string }) => (
  <form method="post" action={t?.id ? `/super/templates/${t.id}` : "/super/templates"} class="sa-form">
    {error && <div class="sa-alert sa-alert-err">{error}</div>}
    <label>নাম</label><input type="text" name="name" required maxlength={80} value={t?.name ?? ""} placeholder="যেমন: ঈদ অফার" />
    <label>ক্যাটাগরি</label>
    <select name="category">{categories.map((c) => <option value={c} selected={c === (t?.category ?? "সাধারণ")}>{c}</option>)}</select>
    <label>ছোট বিবরণ</label><input type="text" name="description" maxlength={160} value={t?.description ?? ""} placeholder="কোন ধরনের পণ্যের জন্য" />
    <label>ক্রম (ছোট সংখ্যা আগে দেখাবে)</label><input type="number" name="sort_order" value={String(t?.sort_order ?? 0)} />
    <label>ডিজাইন JSON</label>
    <textarea name="json" rows={12} required placeholder='{"sections":[...]}' style="font-family:monospace;font-size:.8rem">{t?.json ?? ""}</textarea>
    <p class="sa-muted small">যেকোনো দোকানের ল্যান্ডিং এডিটরে ডিজাইন সাজিয়ে "JSON কপি" চাপুন, তারপর এখানে পেস্ট করুন। ছবি টেমপ্লেটে রাখবেন না — দোকানদারের পণ্যের ছবি নিজে থেকেই বসবে।</p>
    <button class="sa-btn">{t?.id ? "সেভ করুন" : "টেমপ্লেট যোগ করুন"}</button>
  </form>
);

export const TemplatesPage = ({ rows, categories }: { rows: TplRow[]; categories: string[] }) => (
  <div class="sa-grid-1-2">
    <Card title="নতুন টেমপ্লেট"><TemplateForm categories={categories} /></Card>
    <Card title={`সব টেমপ্লেট (${bn(rows.length)})`}>
      <p class="sa-muted">সব দোকানদার বিনা খরচে ব্যবহার করতে পারবে। বন্ধ করলে গ্যালারিতে আর দেখাবে না, তবে যেসব পেজ আগে বানানো হয়েছে সেগুলো থাকবে।</p>
      {rows.length === 0 ? <Empty text="এখনো কোনো টেমপ্লেট নেই" /> : (
        <div class="sa-table-wrap"><table class="sa-table">
          <thead><tr><th>#</th><th>নাম</th><th>ক্যাটাগরি</th><th>অবস্থা</th><th></th></tr></thead>
          <tbody>{rows.map((t) => (
            <tr>
              <td>{bn(t.sort_order)}</td>
              <td><b>{t.name}</b>{t.description && <><br /><small class="sa-muted">{t.description}</small></>}</td>
              <td>{t.category}</td>
              <td>{t.active ? <span class="sa-pill sa-st-active">চালু</span> : <span class="sa-pill sa-st-closed">বন্ধ</span>}</td>
              <td class="sa-row">
                <a href={`/super/templates/${t.id}`} class="sa-btn sa-btn-sm sa-btn-ghost">এডিট</a>
                <form method="post" action={`/super/templates/${t.id}/toggle`}><button class="sa-btn sa-btn-sm sa-btn-ghost">{t.active ? "বন্ধ" : "চালু"}</button></form>
                <form method="post" action={`/super/templates/${t.id}/delete`} data-confirm={`"${t.name}" টেমপ্লেট পুরোপুরি মুছবেন?`}><button class="sa-btn sa-btn-sm sa-btn-ghost">মুছুন</button></form>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  </div>
);

export type DemoRow = { key: string; niche: string; name: string; theme: string; productCount: number; shop: { id: string; slug: string } | null; link: string | null };

export const DemosPage = ({ rows, support }: { rows: DemoRow[]; support: string }) => (
  <Card title={`ডেমো দোকান (${bn(rows.filter((r) => r.shop).length)} / ${bn(rows.length)})`}>
    <p class="sa-muted">প্রতিটা নিশের একটা ডেমো দোকান — সাপোর্ট নম্বর {support || "(সেটিংসে বসান)"}, উপরে ডেমো বার, অর্ডার বন্ধ, বিল হয় না। "তৈরি / আপডেট" আবার চাপলে নতুন পণ্য বা পেজ যোগ হয়, আগের ছবি থাকে।
      ডেমোর ছবি সাইটের নিজের ফাইল থেকে আসে (repo-র <code>public/demo-img</code>) — সাইনআপে নিশ বাছলে নতুন দোকানে কপি হয় না, সব দোকান এক জায়গার ছবি দেখায়, দোকানের জায়গায় গোনা হয় না।</p>
    <form method="post" action="/super/demos-share-images" class="sa-form" style="margin:8px 0 14px"><button class="sa-btn sa-btn-sm sa-btn-ghost">আগের দোকানে কপি হওয়া ডেমো ছবি এক জায়গায় আনুন (জায়গা খালি)</button></form>
    <div class="sa-table-wrap"><table class="sa-table">
      <thead><tr><th>নিশ</th><th>দোকান</th><th>পণ্য</th><th></th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr>
          <td><b>{r.niche}</b><br /><small class="sa-muted">{r.key} · থিম {r.theme}</small></td>
          <td>{r.shop && r.link ? <a href={r.link} target="_blank">{r.name} ↗</a> : <>{r.name} <span class="sa-muted">— এখনো তৈরি হয়নি</span></>}</td>
          <td>{bn(r.productCount)}</td>
          <td class="sa-row">
            <form method="post" action={`/super/demos/${r.key}`}><button class="sa-btn sa-btn-sm">{r.shop ? "আপডেট" : "তৈরি করুন"}</button></form>
            {r.shop && <form method="post" action={`/super/shops/${r.shop.id}/impersonate`}><button class="sa-btn sa-btn-sm sa-btn-ghost">দোকানে ঢুকুন</button></form>}
          </td>
        </tr>
      ))}</tbody>
    </table></div>
  </Card>
);

/* ---------- ব্লগ (ধাপ ৮) ---------- */
export type BlogRow = { id: number; slug: string; title: string; excerpt: string; body_html: string; status: string; published_at: string | null; updated_at: string; seo_title?: string; meta_description?: string; cover_image?: string; author_name?: string };
export const BlogListPage = ({ rows }: { rows: BlogRow[] }) => (
  <Card title="ব্লগ পোস্ট" action={<a class="sa-btn sa-btn-sm" href="/super/blog/new">+ নতুন পোস্ট</a>}>
    <p class="sa-muted">sellxbd.com/blog-এ দেখায় — দোকান মালিকদের কাজের টিপস, যাতে Google থেকে নতুন মালিক আসে।</p>
    {rows.length === 0 ? <Empty text="এখনো কোনো পোস্ট নেই" /> : (
      <div class="sa-table-wrap"><table class="sa-table">
        <thead><tr><th>শিরোনাম</th><th>অবস্থা</th><th>আপডেট</th><th></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr>
            <td><b>{r.title}</b><br /><small class="sa-muted">/blog/{r.slug}</small></td>
            <td>{r.status === "published" ? <span class="sa-pill sa-st-active">প্রকাশিত</span> : <span class="sa-pill sa-st-closed">খসড়া</span>}</td>
            <td><small>{dhakaTime(r.updated_at)}</small></td>
            <td class="sa-row">
              <a class="sa-btn sa-btn-sm sa-btn-ghost" href={`/super/blog/${r.id}`}>এডিট</a>
              {r.status === "published" && <a class="sa-btn sa-btn-sm sa-btn-ghost" href={`/blog/${r.slug}`} target="_blank" rel="noopener">দেখুন</a>}
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    )}
  </Card>
);

export const BlogEditPage = ({ post, error }: { post?: Partial<BlogRow>; error?: string }) => (
  <Card title={post?.id ? "পোস্ট এডিট" : "নতুন পোস্ট"}>
    {error && <div class="sa-alert sa-alert-err">{error}</div>}
    <form method="post" action={post?.id ? `/super/blog/${post.id}` : "/super/blog/new"} class="sa-form" enctype="multipart/form-data">
      <label>শিরোনাম</label><input type="text" name="title" required maxlength={150} value={post?.title ?? ""} />
      <label>লিংক (slug — ইংরেজি ছোট হাতের অক্ষর, সংখ্যা আর -)</label><input type="text" name="slug" required maxlength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={post?.slug ?? ""} placeholder="jemon-fake-order-komanor-upay" />
      <label>সারাংশ (Google-এ দেখাবে, ১৬০ অক্ষরের মধ্যে ভালো)</label><textarea name="excerpt" rows={2} maxlength={300}>{post?.excerpt ?? ""}</textarea>
      <fieldset class="sa-fieldset">
        <legend>Google আর শেয়ারের জন্য (SEO)</legend>
        <label>Google-এর শিরোনাম <small class="sa-muted">(খালি রাখলে উপরের শিরোনাম; ৬০ অক্ষরের মধ্যে, মূল কিওয়ার্ড শুরুতে)</small></label>
        <input type="text" name="seo_title" maxlength={70} value={post?.seo_title ?? ""} />
        <label>Google-এর বিবরণ <small class="sa-muted">(খালি রাখলে সারাংশ; ১২০–১৬০ অক্ষর)</small></label>
        <textarea name="meta_description" rows={2} maxlength={170}>{post?.meta_description ?? ""}</textarea>
        <label>কভার ছবি <small class="sa-muted">(ফেসবুকে শেয়ার আর Google-এ দেখাবে — ১২০০×৬৩০, JPG/PNG/WebP, ২MB পর্যন্ত)</small></label>
        {post?.cover_image && <img src={post.cover_image} alt="" width={240} height={126} style="border-radius:8px;object-fit:cover" />}
        <input type="file" name="cover_file" accept="image/jpeg,image/png,image/webp" />
        <input type="url" name="cover_image" maxlength={400} value={post?.cover_image ?? ""} placeholder="অথবা ছবির https লিংক" />
        <label>লেখকের নাম <small class="sa-muted">(খালি রাখলে "SellxBD টিম")</small></label>
        <input type="text" name="author_name" maxlength={60} value={post?.author_name ?? ""} />
      </fieldset>
      <label>লেখা (HTML — &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;a&gt;, &lt;img&gt; চলবে)</label><textarea name="body_html" rows={18} maxlength={60000} class="sa-mono">{post?.body_html ?? ""}</textarea>
      <label>অবস্থা</label>
      <select name="status"><option value="draft" selected={post?.status !== "published"}>খসড়া</option><option value="published" selected={post?.status === "published"}>প্রকাশিত</option></select>
      <div class="sa-row"><button class="sa-btn">সেভ করুন</button><a class="sa-btn sa-btn-ghost" href="/super/blog">ফিরে যান</a></div>
    </form>
    {post?.id && <form method="post" action={`/super/blog/${post.id}/delete`} class="sa-form" style="margin-top:16px"><label><input type="checkbox" name="confirm" value="1" required /> মুছে ফেলা নিশ্চিত — ফেরত আনা যাবে না</label><button class="sa-btn sa-btn-sm sa-btn-danger">পোস্ট মুছুন</button></form>}
  </Card>
);

/** দোকানের ছবি R2-তে — অবস্থা আর বোতাম */
const R2Box = ({ r, owner }: { r: import("./r2").R2Status; owner: boolean }) => (
  <div class="sa-r2">
    <h4>ছবি R2-তে (img ডোমেইন)</h4>
    <ul class="sa-sys">
      <li><span class={r.configured ? "sa-dot-ok" : "sa-dot-warn"}></span>R2 bucket <small>{r.configured ? `চালু · ${r.publicUrl}` : "চালু হয়নি — Cloudflare-এ R2 চালু করে টোকেনে R2 অনুমতি দিন, পরের ডিপ্লয়ে নিজে যুক্ত হবে"}</small></li>
      {r.configured && <li><span class={r.publicOk ? "sa-dot-ok" : "sa-dot-warn"}></span>পাবলিক ঠিকানা <small>{r.publicOk ? "কাজ করছে" : "যাচাই হয়নি / কাজ করছে না"}</small></li>}
      {r.configured && <li><span class={r.onR2 >= r.total ? "sa-dot-ok" : "sa-dot-warn"}></span>দোকানের ছবি R2 থেকে <small>{bn(r.onR2)}/{bn(r.total)}টা দোকান{r.purged ? ` · পুরনো কপি মোছা ${bn(r.purged)}টার` : ""}</small></li>}
    </ul>
    {owner && r.configured && !r.publicOk && r.checkToken && (
      <form method="post" action="/super/r2/confirm" data-r2-check>
        <input type="hidden" name="token" value={r.checkToken} />
        <img src={`${r.publicUrl.replace(/\/+$/, "")}/_check/${r.checkToken}.png`} alt="" width={1} height={1}
          data-r2-img />
        <small class="sa-muted" data-r2-msg>ব্রাউজার দিয়ে ছবির ঠিকানা যাচাই হচ্ছে…</small>
      </form>
    )}
    {owner && r.configured && (
      <div class="sa-r2-btns">
        <form method="post" action="/super/r2/check"><button class="sa-btn sa-btn-sm">ঠিকানা যাচাই</button></form>
        {r.publicOk && r.onR2 < r.total && <form method="post" action="/super/r2/sync"><button class="sa-btn sa-btn-sm">এখনই কপি চালান</button></form>}
        {r.publicOk && (
          <form method="post" action="/super/r2/purge" data-confirm={r.autoPurge ? "পুরনো কপি মোছা বন্ধ করবেন?" : "R2-তে কপি হওয়া ছবির পুরনো কপি দোকানের ডাটাবেস থেকে মুছবে (জায়গা খালি হবে)। ছবি R2 থেকেই দেখাবে। চালু করবেন?"}>
            <input type="hidden" name="on" value={r.autoPurge ? "0" : "1"} />
            <button class={`sa-btn sa-btn-sm${r.autoPurge ? "" : " sa-btn-ghost"}`}>{r.autoPurge ? "পুরনো কপি মোছা: চালু (বন্ধ করুন)" : "পুরনো কপি মুছে জায়গা খালি করুন"}</button>
          </form>
        )}
      </div>
    )}
  </div>
);

/** দোকানের যাচাই আর সন্দেহের কারণ — সুপার অ্যাডমিনের দোকান পাতায় */
const VerifyRiskBox = ({ s, canEdit }: { s: ShopRow; canEdit: boolean }) => {
  const flags = (s.risk || "").split(",").filter(Boolean);
  const unverified = s.email_verified === 0 || s.phone_verified === 0;
  if (!flags.length && !unverified) return null;
  return (
    <div class={`sa-card sa-verify ${flags.length && !s.risk_cleared ? "sa-verify-risk" : ""}`}>
      <div class="sa-verify-row">
        <span>ইমেইল {s.email_verified === 0 ? <span class="sa-pill sa-st-suspended">যাচাই বাকি</span> : <span class="sa-pill sa-st-active">যাচাই হয়েছে</span>}</span>
        <span>মোবাইল {s.phone_verified === 0 ? <span class="sa-pill sa-st-suspended">যাচাই বাকি</span> : <span class="sa-pill sa-st-active">যাচাই হয়েছে</span>}</span>
        {s.signup_ip && <span class="sa-muted">সাইনআপের IP: {s.signup_ip}</span>}
      </div>
      {flags.length > 0 && (
        <p>সন্দেহের কারণ: {flags.map((f) => <span class="sa-pill sa-st-closed">{RISK_LABEL[f] ?? f}</span>)}{s.risk_cleared ? <small class="sa-muted"> — আপনি দেখে ঠিক আছে বলেছেন</small> : null}</p>
      )}
      {unverified && <p class="sa-muted"><small>যাচাই বাকি থাকলে দোকান অর্ডার নেয় না আর Google-এ যায় না। {s.phone_verified === 0 && <><a href={`tel:${s.owner_phone}`}>{s.owner_phone}</a> নম্বরে ফোন করে দোকানদারের নাম, দোকান আর কী বিক্রি করবেন জেনে নিন — ঠিক থাকলে নিচের বাটন।</>}</small></p>}
      {canEdit && (
        <div class="sa-r2-btns">
          {s.phone_verified === 0 && (
            <form method="post" action={`/super/shops/${s.id}/verify`} data-confirm={`${s.owner_phone} নম্বরে ফোন করে দোকানদারের সাথে কথা হয়েছে আর সব ঠিক আছে?`}>
              <input type="hidden" name="what" value="phone" />
              <button class="sa-btn sa-btn-sm"><Icon name="phone" size="sm" /> ফোনে কথা হয়েছে — মোবাইল যাচাই</button>
            </form>
          )}
          {s.email_verified === 0 && (
            <form method="post" action={`/super/shops/${s.id}/verify`} data-confirm="ইমেইল যাচাই করা ধরবেন?">
              <input type="hidden" name="what" value="email" />
              <button class="sa-btn sa-btn-sm sa-btn-ghost">ইমেইল যাচাই করা ধরুন</button>
            </form>
          )}
          {flags.length > 0 && !s.risk_cleared && (
            <form method="post" action={`/super/shops/${s.id}/risk-clear`}>
              <button class="sa-btn sa-btn-sm sa-btn-ghost">দেখেছি, ঠিক আছে</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
