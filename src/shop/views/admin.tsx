import { COURIER_NAME, type CourierKey } from "../lib/courier";
import { SMS_PLACEHOLDERS, SMS_PLACEHOLDERS_EN, SMS_PROVIDERS } from "../lib/sms";
import { getLang } from "../i18n";
import type { Child } from "hono/jsx";
import type { Order, OrderItem, OrderStatus } from "../lib/orders";
import { AREA_LABEL, orderExtras, STATUS_LABEL } from "../lib/orders";
import { parseOptions, type Category, type Product, type Variant } from "../lib/products";
import { THEMES, type Settings } from "../lib/settings";
import { TRANSITIONS } from "../lib/order-status";
import { dhakaTime, imageUrl, taka } from "../lib/format";
import { ASSET_VERSION } from "./layout";
import { SECTION_GROUPS } from "../lib/landing";
import { Icon } from "./icons";
import { EmptyState, PageHead } from "./ui";
import { MediaField } from "./media-field";
import { topupMethod, type ShopState } from "../../platform/billing";
import type { Report } from "../lib/reports";
import { canAccess, ROLE_LABEL, type Role } from "../lib/auth";
import type { CourierSummary, Own, Risk, Shared } from "../lib/fraud";
import { CourierCard, FraudDialog } from "./fraud-report";
import { codAmount, PAY_NAME, PAY_STATUS, type PayKey } from "../lib/payment";
import { waLink, type WaMsg } from "../lib/whatsapp";
import { bn } from "../lib/format";
import { ShopShell } from "./admin-pro";

export type Flash = { type: "ok" | "error"; text: string } | null;

/* ---------- লেআউট ---------- */
/** ট্রায়াল / কম ব্যালেন্স / অর্ডার বন্ধ — ড্যাশবোর্ডের উপরে */
export const StateBanner = ({ state }: { state?: ShopState }) => {
  if (!state) return null;
  switch (state.reason) {
    case "trial":
      return <div class="banner banner-info"><Icon name="gift" size="sm" /> ফ্রি ট্রায়াল চলছে ("বাড়ন্ত" প্ল্যানের সব সুবিধা): {dhakaTime(state.trial_ends_at).split(",")[0]} পর্যন্ত। <a href="/admin/billing">বিস্তারিত</a></div>;
    case "low_balance":
      return <div class="banner banner-warn"><Icon name="triangle-alert" size="sm" /> ব্যালেন্স {taka(state.balance)}। {dhakaTime(state.grace_ends_at)} এর মধ্যে রিচার্জ না করলে দোকানে নতুন অর্ডার নেওয়া বন্ধ হবে। <a href="/admin/billing">রিচার্জ করুন</a></div>;
    case "blocked_balance":
      return <div class="banner banner-bad"><Icon name="triangle-alert" size="sm" /> ব্যালেন্স {taka(state.balance)} — দোকানে নতুন অর্ডার নেওয়া বন্ধ আছে। রিচার্জ করলে সাথে সাথে চালু হবে। <a href="/admin/billing">রিচার্জ করুন</a></div>;
    case "unverified": {
      const v = state.verify ?? { email: true, phone: true };
      const left = [!v.email && "ইমেইল", !v.phone && "মোবাইল"].filter(Boolean).join(" আর ");
      return <div class="banner banner-warn"><Icon name="shield-check" size="sm" /> {left} যাচাই বাকি{!v.phone ? " (মোবাইল: SellxBD টিম ফোন করে যাচাই করবে)" : ""} — যাচাই না হওয়া পর্যন্ত দোকানে অর্ডার নেওয়া বন্ধ আর Google-এ দেখাবে না। পণ্য, পেজ সব সাজাতে পারবেন। <a href="/admin/verify">এখনই যাচাই করুন</a></div>;
    }
    case "suspended":
      return <div class="banner banner-bad"><Icon name="triangle-alert" size="sm" /> দোকানটি সাময়িকভাবে স্থগিত করা হয়েছে। বিস্তারিত জানতে যোগাযোগ করুন।</div>;
    default: {
      const u = state.usage;
      if (!u || !u.limit || u.used < Math.ceil(u.limit * 0.8)) return null;
      return u.used >= u.limit
        ? <div class="banner banner-warn"><Icon name="triangle-alert" size="sm" /> এই মাসে "{u.plan}" প্ল্যানের {bn(u.limit)}টা অর্ডার শেষ ({bn(u.used)}টা হয়েছে) — এখন প্রতি কনফার্ম অর্ডারে {taka(u.extra)}। বড় প্ল্যানে গেলে সস্তা হতে পারে। <a href="/admin/billing">প্ল্যান দেখুন</a></div>
        : <div class="banner banner-info"><Icon name="info" size="sm" /> এই মাসে প্ল্যানের {bn(u.used)}/{bn(u.limit)}টা অর্ডার হয়েছে। সীমার পরে প্রতি অর্ডারে {taka(u.extra)}। <a href="/admin/billing">প্ল্যান দেখুন</a></div>;
    }
  }
};

export const AdminLayout = (p: { title: string; settings: Settings; active?: string; flash?: Flash; email?: string; role?: Role; state?: ShopState; announcements?: { id: number; title: string; body: string | null; level: string }[]; support?: boolean; newOrders?: number; children?: Child }) => {
  if (p.email) {
    return (
      <ShopShell title={p.title} settings={p.settings} active={p.active} email={p.email} role={p.role ?? "owner"} newOrders={p.newOrders}
        top={<>
          {p.support && (
            <div class="banner banner-support">
              <Icon name="key-round" size="sm" /> <strong>সাপোর্ট মোড</strong> — সুপার অ্যাডমিন হিসেবে {p.settings.site_name || "এই দোকানের"} প্যানেল দেখছেন। সব কাজ মালিকের মতোই হবে।
              <form method="post" action="/admin/logout" class="inline"><button class="btn-link">বের হয়ে সুপার অ্যাডমিনে ফিরুন →</button></form>
            </div>
          )}
          <StateBanner state={p.state} />
          {(p.announcements ?? []).map((a) => (
            <div class={`banner banner-ann banner-ann-${a.level}`}><Icon name="megaphone" size="sm" /><strong>{a.title}</strong>{a.body ? <> — {a.body}</> : null}</div>
          ))}
        </>}>
        {p.flash && <div class={`alert ${p.flash.type === "ok" ? "alert-ok" : "alert-error"}`}>{p.flash.text}</div>}
        {p.children}
      </ShopShell>
    );
  }
  return (
    <html lang="bn">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{p.title} — অ্যাডমিন</title>
        <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
        <link rel="stylesheet" href={`/css/admin.css?v=${ASSET_VERSION}`} />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" />
        <link rel="stylesheet" href={`/css/ui.css?v=${ASSET_VERSION}`} />
      </head>
      <body class="admin admin-login">
        <main class="wrap admin-main">
          {p.flash && (p.flash.type === "ok"
            ? <div class="toast toast-ok" role="status" data-toast>{p.flash.text}</div>
            : <div class="alert alert-error" role="alert">{p.flash.text}</div>)}
          {p.children}
        </main>
      </body>
    </html>
  );
};

/* ---------- লগইন ---------- */
export const LoginPage = ({ error, email }: { error?: string; email?: string }) => (
  <div class="login-box">
    <div class="login-brand"><span class="mark">S</span>SellxBD</div>
    <h1>অ্যাডমিন লগইন</h1>
    <p class="muted small" style="text-align:center;margin:0">আপনার দোকানের প্যানেলে ঢুকুন</p>
    {error && <div class="alert alert-error">{error}</div>}
    <form method="post" action="/admin/login" class="order-form">
      <label class="field"><span>ইমেইল</span><input type="email" name="email" value={email ?? ""} required autocomplete="username" /></label>
      <label class="field"><span>পাসওয়ার্ড</span><input type="password" name="password" required autocomplete="current-password" /></label>
      <button class="btn btn-primary btn-block">লগইন</button>
    </form>
    <p class="small" style="text-align:center;margin:12px 0 0"><a href="/admin/forgot">পাসওয়ার্ড ভুলে গেছেন?</a></p>
  </div>
);

/* ---------- অর্ডার তালিকা ---------- */
export const STATUS_TABS: OrderStatus[] = ["new", "confirmed", "shipped", "cancelled", "fake"];

export const StatusBadge = ({ s }: { s: OrderStatus }) => <span class={`status status-${s}`}>{STATUS_LABEL[s]}</span>;

export const PurchaseBadge = ({ o }: { o: Order }) => {
  if (o.purchase_sent_at) return <span class="pill pill-ok" title={dhakaTime(o.purchase_sent_at)}>Purchase গেছে</span>;
  if (o.status === "confirmed" || o.status === "shipped") return <span class="pill pill-bad">Purchase যায়নি</span>;
  return null;
};

const RANGE_LABEL = { all: "সব সময়", today: "আজ", "7": "৭ দিন", "30": "৩০ দিন" } as const;

/** কাস্টমারের আগের ডেলিভারি/বাতিল থেকে ছোট চিহ্ন */
const HistoryBadge = ({ h }: { h?: { good: number; bad: number } }) => {
  if (!h || h.good + h.bad === 0) return <span class="badge">নতুন কাস্টমার</span>;
  const tone = h.bad === 0 ? "ok" : h.good >= h.bad * 2 ? "warn" : "bad";
  return <span class={`badge badge-${tone}`} title="আগের অর্ডার: ডেলিভারি / বাতিল-ফেক">✓{bn(h.good)} · ✕{bn(h.bad)}</span>;
};

/** তিন জায়গা মিলিয়ে ক্রেতার রায় (তালিকায় ছোট চিহ্ন) */
const RISK_TONE = { new: "", good: "ok", warn: "warn", bad: "bad" } as const;
export const RiskBadge = ({ r }: { r?: Risk & { shared?: number; courier?: number | null } }) => {
  if (!r || r.level === "new") return null;
  const parts = [r.shared ? `অন্য দোকানে ${bn(r.shared)}টা` : "", r.courier != null ? `কুরিয়ারে ${bn(r.courier)}%` : ""].filter(Boolean).join(" · ");
  return <span class={`badge badge-${RISK_TONE[r.level]}`} title={`ডেলিভারি সফল ${bn(r.ratio ?? 0)}% (${bn(r.records)}টা রেকর্ড)${parts ? " — " + parts : ""}`}>{r.label} {r.ratio != null && `${bn(r.ratio)}%`}</span>;
};

export const OrdersPage = (p: {
  orders: (Order & { item_count: number })[];
  counts: Record<string, number>;
  status: OrderStatus;
  q: string;
  page: number;
  hasMore: boolean;
  range?: keyof typeof RANGE_LABEL;
  history?: Record<string, { good: number; bad: number }>;
  risk?: Record<string, Risk & { shared?: number; courier?: number | null }>;
  /** কুরিয়ার রিপোর্টের ক্যাশ আর খোঁজা যায় কি না */
  courier?: Record<number, CourierSummary>;
  crReady?: boolean;
  couriers?: CourierKey[];
  payPending?: boolean;
  payCount?: number;
}) => {
  const range = p.range ?? "all";
  const courierBulk = !p.q && !p.payPending && p.status === "confirmed" && (p.couriers ?? []).some((k) => k !== "redx") && p.orders.length > 0;
  const bulk = p.orders.length > 0;
  const qs = (extra: Record<string, string | number>) => {
    const u = new URLSearchParams({ status: p.status, range, ...(p.q ? { q: p.q } : {}) });
    for (const [k, v] of Object.entries(extra)) u.set(k, String(v));
    return `/admin/orders?${u}`;
  };
  const back = qs({ page: p.page });
  // কোন স্ট্যাটাস থেকে কোথায় একসাথে নেওয়া যায়
  // যেকোনো ট্যাব থেকে অন্য যেকোনো স্ট্যাটাসে (ভুল হলে ফেরানো যায়)
  const BULK_ALL: { to: OrderStatus; label: string; cls: string; ask?: string }[] = [
    { to: "new", label: "নতুনে ফেরান", cls: "btn-outline", ask: "বাছাই করা অর্ডার আবার নতুন তালিকায় নেবেন? স্টক ফেরত যাবে।" },
    { to: "confirmed", label: "কনফার্ম", cls: "btn-primary", ask: "বাছাই করা অর্ডার কনফার্ম করবেন? (একবারে সর্বোচ্চ ১০টা)" },
    { to: "shipped", label: "শিপড", cls: "btn-outline", ask: "বাছাই করা অর্ডার শিপড করবেন?" },
    { to: "cancelled", label: "বাতিল", cls: "btn-outline", ask: "বাছাই করা অর্ডার বাতিল করবেন? নম্বর ও ডিভাইস ব্লক হবে।" },
    { to: "fake", label: "ফেক", cls: "btn-danger", ask: "বাছাই করা অর্ডার ফেক করবেন? নম্বর ও ডিভাইস ব্লক হবে।" },
  ];
  const bulkTo = p.q || p.payPending ? [] : BULK_ALL.filter((b) => b.to !== p.status);
  return (
  <>
    {(p.payCount ?? 0) > 0 && (
      <a href={p.payPending ? "/admin/orders" : "/admin/orders?pay=pending"} class={`pay-alert ${p.payPending ? "on" : ""}`}>
        <Icon name="wallet" size="sm" /> অগ্রিম পেমেন্ট যাচাই বাকি: <b>{bn(p.payCount!)}টা</b> {p.payPending ? "· সব অর্ডার দেখুন" : "· দেখুন →"}
      </a>
    )}
    <div class="orders-top">
    <div class="tabs">
      {STATUS_TABS.map((s) => (
        <a href={`/admin/orders?status=${s}&range=${range}`} class={!p.q && !p.payPending && p.status === s ? "tab active" : "tab"}>
          {STATUS_LABEL[s]} <span class="tab-count">{bn(p.counts[s] ?? 0)}</span>
        </a>
      ))}
    </div>
    <a href="/admin/orders/new" class="btn btn-primary orders-new"><Icon name="plus" size="sm" /> নতুন অর্ডার</a>
    </div>
    <div class="orders-tools">
      <form method="get" action="/admin/orders" class="search">
        <input type="hidden" name="range" value={range} />
        <input type="search" name="q" value={p.q} placeholder="নম্বর / নাম / অর্ডার নং দিয়ে খুঁজুন" />
        <button class="btn btn-outline"><Icon name="search" size="sm" /> খুঁজুন</button>
        {p.q && <a href={`/admin/orders?range=${range}`} class="btn-link">মুছুন</a>}
      </form>
      <nav class="range-pills" aria-label="তারিখ">
        {(["all", "today", "7", "30"] as const).map((r) => (
          <a href={`/admin/orders?status=${p.status}&range=${r}${p.q ? `&q=${encodeURIComponent(p.q)}` : ""}`} class={r === range ? "active" : ""}>{RANGE_LABEL[r]}</a>
        ))}
      </nav>
    </div>
    {p.q && <p class="muted">"{p.q}" — সব স্ট্যাটাসে খোঁজা হয়েছে</p>}
    {p.orders.length === 0 ? (
      <div class="sa-card"><EmptyState icon="receipt" title="এই তালিকায় কোনো অর্ডার নেই" text={range === "all" ? "নতুন অর্ডার এলে এখানে দেখাবে। দোকান বা ল্যান্ডিং পেজের লিংক ফেসবুকে শেয়ার করুন।" : `${RANGE_LABEL[range]}-এ এই তালিকায় কিছু নেই — উপরে "সব সময়" বেছে দেখুন।`} /></div>
    ) : (
      <form method="post" action="/admin/orders/bulk-courier" id="bulk-form">
      <input type="hidden" name="back" value={back} />
      {bulk && (
        <div class="bulk-bar">
          <label class="inline-check"><input type="checkbox" data-check-all /> সব বাছুন</label>
          {bulkTo.map((b) => (
            <button class={`btn btn-sm ${b.cls}`} formaction="/admin/orders/bulk-status" name="to" value={b.to} data-confirm={b.ask}>{b.label}</button>
          ))}
          {courierBulk && (
            <>
              <select name="courier">
                {(p.couriers ?? []).filter((k) => k !== "redx").map((k) => <option value={k}>{COURIER_NAME[k]}</option>)}
              </select>
              <button class="btn btn-sm btn-primary" data-confirm="বাছাই করা অর্ডারগুলো কুরিয়ারে পাঠাবেন?"><Icon name="truck" size="sm" /> কুরিয়ারে পাঠান</button>
            </>
          )}
          <span class="bulk-gap"></span>
          <button class="btn btn-sm btn-outline" formaction="/admin/orders/invoices" formmethod="get" formtarget="_blank"><Icon name="printer" size="sm" /> ইনভয়েস</button>
          <button class="btn btn-sm btn-outline" formaction="/admin/orders/invoices?size=sticker" formmethod="get" formtarget="_blank" name="size" value="sticker"><Icon name="tag" size="sm" /> স্টিকার</button>
        </div>
      )}
      <div class="table-wrap">
        <table class="table">
          <thead><tr>{bulk && <th></th>}<th>অর্ডার</th><th>কাস্টমার</th><th>মোট</th><th>স্ট্যাটাস</th><th>সময়</th></tr></thead>
          <tbody>
            {p.orders.map((o) => (
              <tr>
                {bulk && <td><input type="checkbox" name="ids" value={String(o.id)} aria-label={o.order_no} /></td>}
                <td><a href={`/admin/orders/${o.id}`}><strong>{o.order_no}</strong></a><br /><small class="muted">{bn(o.item_count)}টা পণ্য</small></td>
                <td>{o.name}<br /><a href={`tel:${o.phone}`}>{o.phone}</a> <a href={waLink(o.phone, "")} target="_blank" rel="noopener" class="wa-mini" title="WhatsApp" aria-label="WhatsApp"><Icon name="message-circle" size="sm" /></a><br /><a href={`/admin/orders?q=${o.phone}`} class="hist-link"><HistoryBadge h={p.history?.[o.phone]} /></a> <RiskBadge r={p.risk?.[o.phone]} />
                  {(p.crReady || p.courier?.[o.id]) && <CourierCard phone={o.phone} orderId={o.id} sum={p.courier?.[o.id]} ready={!!p.crReady} />}</td>
                <td>{taka(o.total)}<br /><small class="muted">{AREA_LABEL[o.area]}</small></td>
                <td><StatusBadge s={o.status} /> <PurchaseBadge o={o} />
                  {o.consignment_id && <><br /><small class="muted">{COURIER_NAME[o.courier as CourierKey] ?? o.courier}: {o.tracking_code || o.consignment_id}{o.courier_status ? ` · ${o.courier_status}` : ""}</small></>}
                  {o.outcome && <><br /><span class={`pill ${o.outcome === "delivered" ? "pill-ok" : "pill-bad"}`}>{o.outcome === "delivered" ? "ডেলিভারি হয়েছে" : "ফেরত এসেছে"}</span></>}
                  {o.pay_trx && <><br /><span class={`pill ${o.pay_status === "verified" ? "pill-ok" : o.pay_status === "rejected" ? "pill-bad" : "pill-warn"}`}>অগ্রিম {taka(o.advance_amount ?? 0)} · {PAY_STATUS[o.pay_status ?? "pending"]}</span></>}
                </td>
                <td><small>{dhakaTime(o.created_at)}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </form>
    )}
    <div class="pager">
      {p.page > 1 && <a class="btn btn-outline" href={qs({ page: p.page - 1 })}>← আগের</a>}
      {p.hasMore && <a class="btn btn-outline" href={qs({ page: p.page + 1 })}>পরের →</a>}
    </div>
    <FraudDialog />
  </>
  );
};

/* ---------- অর্ডার ডিটেইল ---------- */
const ACTION_LABEL: Record<OrderStatus, string> = {
  new: "↩ নতুনে ফেরান",
  confirmed: "✓ কনফার্ম করুন",
  shipped: "শিপড করুন",
  cancelled: "বাতিল করুন",
  fake: "ফেক",
};

const TRACK_URL: Record<string, (t: string) => string> = {
  steadfast: (t) => `https://steadfast.com.bd/t/${encodeURIComponent(t)}`,
  pathao: (t) => `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(t)}`,
  redx: (t) => `https://redx.com.bd/track-parcel/?trackingId=${encodeURIComponent(t)}`,
};

const CourierPanel = ({ o, couriers }: { o: Order; couriers: CourierKey[] }) => (
  <section class="panel">
    <h2>কুরিয়ার</h2>
    {o.consignment_id ? (
      <>
        <dl class="kv">
          <dt>কুরিয়ার</dt><dd>{COURIER_NAME[o.courier as CourierKey] ?? o.courier}</dd>
          <dt>ট্র্যাকিং</dt><dd><a href={TRACK_URL[o.courier ?? ""]?.(o.tracking_code || o.consignment_id) ?? "#"} target="_blank" rel="noopener"><code>{o.tracking_code || o.consignment_id}</code></a></dd>
          <dt>স্ট্যাটাস</dt><dd><span class="pill">{o.courier_status || "—"}</span> <small class="muted">{dhakaTime(o.courier_checked_at)}</small></dd>
          <dt>পাঠানো</dt><dd>{dhakaTime(o.courier_sent_at)}</dd>
        </dl>
        <form method="post" action={`/admin/orders/${o.id}/courier/status`}><button class="btn btn-outline">স্ট্যাটাস আপডেট</button></form>
      </>
    ) : o.status !== "confirmed" ? (
      <p class="muted">কনফার্ম হওয়া অর্ডার কুরিয়ারে পাঠানো যায়।</p>
    ) : couriers.length === 0 ? (
      <p class="muted">কুরিয়ার চালু নেই। <a href="/admin/courier">কুরিয়ার সেটিংসে</a> Steadfast/Pathao/RedX-এর API তথ্য দিন।</p>
    ) : (
      <form method="post" action={`/admin/orders/${o.id}/courier`} class="admin-form courier-form" data-courier-form>
        <div class="form-grid">
          <label class="field"><span>কুরিয়ার</span>
            <select name="courier" data-courier-select>
              {couriers.map((k) => <option value={k}>{COURIER_NAME[k]}</option>)}
            </select>
          </label>
          <label class="field"><span>ক্যাশ কালেকশন (৳)</span><input type="number" name="cod" min="0" value={String(codAmount(o))} />{o.pay_status === "verified" && (o.advance_amount ?? 0) > 0 && <small>অগ্রিম {taka(o.advance_amount!)} বাদে</small>}</label>
          <label class="field"><span>ওজন (কেজি)</span><input type="number" name="weight" min="0.1" max="30" step="0.1" value="0.5" /></label>
        </div>
        <div class="form-grid" data-for="pathao" hidden>
          <label class="field"><span>শহর</span><select name="pathao_city" data-loc="pathao:cities" data-next="pathao_zone"><option value="">ঠিকানা দেখে নিজে বুঝবে</option></select></label>
          <label class="field"><span>জোন</span><select name="pathao_zone" data-loc="pathao:zones" data-next="pathao_area"><option value="">—</option></select></label>
          <label class="field"><span>এলাকা</span><select name="pathao_area" data-loc="pathao:areas"><option value="">—</option></select></label>
        </div>
        <div class="form-grid" data-for="redx" hidden>
          <label class="field"><span>ডেলিভারি এলাকা</span><select name="redx_area_id" data-loc="redx:areas"><option value="">বাছাই করুন</option></select></label>
          <input type="hidden" name="redx_area_name" />
        </div>
        <button class="btn btn-primary" data-confirm="এই অর্ডার কুরিয়ারে বুক করবেন? বুক হলে অর্ডার শিপড হয়ে যাবে।">কুরিয়ারে পাঠান</button>
      </form>
    )}
    {o.courier_response && !o.consignment_id && <details><summary>শেষ চেষ্টার রেসপন্স</summary><pre class="pre">{o.courier_response}</pre></details>}
  </section>
);

/** অগ্রিম পেমেন্ট: TrxID মিলিয়ে "পেয়েছি" / "পাইনি" */
const PaymentPanel = ({ o }: { o: Order }) => (
  <section class={`panel pay-panel pay-${o.pay_status ?? "pending"}`}>
    <h2>অগ্রিম পেমেন্ট <span class={`pill ${o.pay_status === "verified" ? "pill-ok" : o.pay_status === "rejected" ? "pill-bad" : "pill-warn"}`}>{PAY_STATUS[o.pay_status ?? "pending"]}</span></h2>
    <dl class="kv">
      <dt>পরিমাণ</dt><dd><strong>{taka(o.advance_amount ?? 0)}</strong> <small class="muted">· বাকি {taka(Math.max(0, o.total - (o.advance_amount ?? 0)))}</small></dd>
      <dt>মাধ্যম</dt><dd>{PAY_NAME[o.pay_method as PayKey] ?? o.pay_method}</dd>
      <dt>TrxID</dt><dd><code class="trx">{o.pay_trx}</code></dd>
      {o.pay_sender && <><dt>পাঠানো নম্বর</dt><dd>{o.pay_sender}</dd></>}
      {o.pay_checked_at && <><dt>মিলানো</dt><dd>{dhakaTime(o.pay_checked_at)}</dd></>}
    </dl>
    <p class="muted small">আপনার {PAY_NAME[o.pay_method as PayKey] ?? ""} অ্যাপের লেনদেনে এই TrxID আর টাকা মিলিয়ে দেখুন।</p>
    <div class="actions">
      {o.pay_status !== "verified" && <form method="post" action={`/admin/orders/${o.id}/payment`} class="inline"><input type="hidden" name="status" value="verified" /><button class="btn btn-primary btn-sm"><Icon name="check" size="sm" /> পেয়েছি</button></form>}
      {o.pay_status !== "rejected" && <form method="post" action={`/admin/orders/${o.id}/payment`} class="inline" data-confirm="এই TrxID-এর টাকা পাননি? অর্ডারে &quot;পাওয়া যায়নি&quot; চিহ্ন দেওয়া হবে।"><input type="hidden" name="status" value="rejected" /><button class="btn btn-outline btn-sm"><Icon name="x" size="sm" /> পাইনি</button></form>}
    </div>
  </section>
);

export type BuyerRecord = { own?: Own; shared?: Shared; courier: CourierSummary | null; sharing: boolean; canCheck: boolean; risk: Risk };

const RISK_TEXT = {
  new: "এই নম্বরে আগের কোনো রেকর্ড পাওয়া যায়নি — নতুন ক্রেতা। দরকার হলে ফোন করে নিশ্চিত হয়ে নিন।",
  good: "আগের রেকর্ড ভালো — বেশিরভাগ পার্সেল নিয়েছে।",
  warn: "কিছু ফেরত/ফেক আছে — কনফার্মের আগে ফোন করে নিশ্চিত হয়ে নিন।",
  bad: "অনেক পার্সেল ফেরত বা ফেক — অগ্রিম ডেলিভারি চার্জ নিয়ে পাঠানো নিরাপদ।",
} as const;

/** ক্রেতার রেকর্ড: এই দোকান, SellxBD-এর অন্য দোকান, কুরিয়ার */
const BuyerRecordPanel = ({ o, r }: { o: Order; r: BuyerRecord }) => {
  const own = r.own;
  const sh = r.shared;
  return (
    <section class="panel buyer-record">
      <h2>ক্রেতার রেকর্ড <span class={`badge ${r.risk.level === "new" ? "" : `badge-${RISK_TONE[r.risk.level]}`}`}>{r.risk.label}{r.risk.ratio != null ? ` · ${bn(r.risk.ratio)}%` : ""}</span></h2>
      <p class="muted small">{RISK_TEXT[r.risk.level]}</p>
      <table class="table compact rec-table">
        <thead><tr><th></th><th>ডেলিভারি</th><th>ফেরত</th><th>বাতিল</th><th>ফেক</th></tr></thead>
        <tbody>
          <tr><td>এই দোকানে</td><td>{bn(own?.delivered ?? 0)}</td><td>{bn(own?.returned ?? 0)}</td><td>{bn(own?.cancelled ?? 0)}</td><td>{bn(own?.fake ?? 0)}</td></tr>
          {r.sharing
            ? <tr><td>SellxBD-এর অন্য দোকানে{sh?.shops ? <small class="muted"> ({bn(sh.shops)}টা দোকান)</small> : ""}</td><td>{bn(sh?.delivered ?? 0)}</td><td>{bn(sh?.returned ?? 0)}</td><td>{bn(sh?.cancelled ?? 0)}</td><td>{bn(sh?.fake ?? 0)}</td></tr>
            : <tr><td colspan={5} class="muted small">অন্য দোকানের রেকর্ড বন্ধ — <a href="/admin/courier">কুরিয়ার সেটিংসে</a> চালু করুন</td></tr>}
          {r.courier && (
            <tr><td>কুরিয়ারে <small class="muted">({r.courier.source})</small></td>
              <td colspan={4}>{r.courier.ratio == null ? "কোনো পার্সেল নেই" : <>সফল <strong>{bn(r.courier.ratio)}%</strong>{r.courier.source === "BD Courier" ? ` — মোট ${bn(r.courier.total)}টা, ফেরত ${bn(r.courier.cancelled)}টা` : ""}</>}
                {(r.courier.reports ?? 0) > 0 && <> · <span class="pill pill-bad">{bn(r.courier.reports!)}টা ফ্রড রিপোর্ট</span></>}
                {r.courier.checked_at && <><br /><small class="muted">খোঁজা হয়েছে {dhakaTime(r.courier.checked_at)}</small></>}
              </td></tr>
          )}
        </tbody>
      </table>
      {(own?.open ?? 0) > 0 && <p class="small">এই নম্বরের আরও {bn(own!.open)}টা অর্ডার চলছে।</p>}
      <p><button type="button" class="btn btn-primary btn-sm" data-cr-open={o.phone} data-cr-order={o.id}><Icon name="shield-alert" size="sm" /> পুরো ফ্রড রিপোর্ট</button></p>
      <FraudDialog />
      {r.canCheck
        ? <form method="post" action={`/admin/orders/${o.id}/courier-check`}><button class="btn btn-outline btn-sm"><Icon name="search" size="sm" /> {r.courier ? "কুরিয়ারে আবার খুঁজুন" : "কুরিয়ারে রেকর্ড খুঁজুন"}</button></form>
        : <p class="muted small">কুরিয়ারে রেকর্ড দেখতে <a href="/admin/courier">কুরিয়ার সেটিংসে</a> Steadfast-এর চাবি বা BD Courier-এর ফ্রি API কী দিন।</p>}
    </section>
  );
};

/** দাম/ছাড় বদলানো যায়: নতুন বা কনফার্ম, আর কুরিয়ারে যায়নি */
export const priceEditable = (o: Pick<Order, "status" | "consignment_id">) => (o.status === "new" || o.status === "confirmed") && !o.consignment_id;

export const OrderDetailPage = (p: { order: Order; items: OrderItem[]; history: Order[]; blocked: { phone: boolean; device: boolean }; couriers?: CourierKey[]; sms?: SmsLogRow[]; record?: BuyerRecord; wa?: WaMsg[] }) => {
  const o = p.order;
  return (
    <>
      <p><a href={`/admin/orders?status=${o.status}`}>← অর্ডার তালিকা</a></p>
      <div class="detail-head">
        <h1>{o.order_no} <StatusBadge s={o.status} /></h1>
        <span class="muted">{dhakaTime(o.created_at)}</span>
      </div>

      <div class="actions">
        {TRANSITIONS[o.status].map((to) => (
          <form method="post" action={`/admin/orders/${o.id}/status`} class="inline"
            data-confirm={to === "cancelled" || to === "fake" ? `এই অর্ডারের নম্বর ও ডিভাইস ব্লক হবে${o.consignment_id ? "। কুরিয়ারে বুক হয়ে থাকলে কুরিয়ারের প্যানেল থেকেও বাতিল করতে হবে" : ""}, নিশ্চিত?`
              : o.status === "cancelled" || o.status === "fake" ? "স্ট্যাটাস বদলাবেন? এই অর্ডারের জন্য নম্বর/ডিভাইসের ব্লক তুলে নেওয়া হবে।"
              : to === "new" ? "অর্ডারটা আবার নতুন তালিকায় নেবেন? স্টক ফেরত যাবে।"
              : to === "confirmed" && o.pay_trx && o.pay_status !== "verified" ? "অগ্রিম পেমেন্ট এখনো মেলানো হয়নি। তবুও কনফার্ম করবেন?" : undefined}>
            <input type="hidden" name="status" value={to} />
            <button class={`btn ${to === "confirmed" ? "btn-primary" : to === "cancelled" || to === "fake" ? "btn-danger" : "btn-outline"}`}>{ACTION_LABEL[to]}</button>
          </form>
        ))}
        {TRANSITIONS[o.status].length === 0 && <span class="muted">এই অর্ডারের স্ট্যাটাস আর বদলানো যাবে না।</span>}
        <a href={`/admin/orders/${o.id}/invoice`} target="_blank" class="btn btn-outline"><Icon name="printer" size="sm" /> ইনভয়েস</a>
        <a href={`/admin/orders/${o.id}/invoice?size=sticker`} target="_blank" class="btn btn-outline"><Icon name="tag" size="sm" /> স্টিকার</a>
      </div>

      <div class="panels">
        <section class="panel">
          <h2>কাস্টমার</h2>
          <dl class="kv">
            <dt>নাম</dt><dd>{o.name}</dd>
            <dt>মোবাইল</dt><dd><a href={`tel:${o.phone}`}>{o.phone}</a> {p.blocked.phone && <span class="pill pill-bad">ব্লক</span>}</dd>
            {(p.wa ?? []).length > 0 && <><dt>WhatsApp</dt><dd class="wa-btns">{p.wa!.map((m, i) => <a href={waLink(o.phone, m.text)} target="_blank" rel="noopener" class={`btn btn-sm ${i === 0 ? "btn-wa" : "btn-outline"}`}><Icon name="message-circle" size="sm" /> {m.label}</a>)}</dd></>}
            <dt>ঠিকানা</dt><dd>{o.address}</dd>
            <dt>এলাকা</dt><dd>{AREA_LABEL[o.area]}</dd>
            {o.email && <><dt>ইমেইল</dt><dd><a href={`mailto:${o.email}`}>{o.email}</a></dd></>}
            {orderExtras(o).map(([k, val]) => <><dt>{k}</dt><dd>{val}</dd></>)}
            {o.note && <><dt>নোট</dt><dd>{o.note}</dd></>}
          </dl>
        </section>

        <section class="panel">
          <h2>পণ্য</h2>
          <table class="table compact">
            <tbody>
              {p.items.map((i) => <tr><td>{i.product_name}{i.variant_label ? <strong> ({i.variant_label})</strong> : ""} × {bn(i.qty || 1)}{(i.qty || 1) > 1 ? <small class="muted"> (প্রতিটা {taka(i.price)})</small> : ""}</td><td class="right">{taka(i.price * (i.qty || 1))}</td></tr>)}
              <tr><td>ডেলিভারি চার্জ</td><td class="right">{taka(o.delivery_charge)}</td></tr>
              {o.discount > 0 && <tr><td>{o.coupon_code ? `কুপন ছাড় (${o.coupon_code})` : "ছাড়"}</td><td class="right">-{taka(o.discount)}</td></tr>}
              <tr class="total"><td>মোট</td><td class="right">{taka(o.total)}</td></tr>
            </tbody>
          </table>
          {priceEditable(o) ? (
            <details class="price-edit">
              <summary><Icon name="pencil" size="sm" /> ছাড় বা ডেলিভারি চার্জ বদলান</summary>
              <form method="post" action={`/admin/orders/${o.id}/price`} class="admin-form price-edit-form">
                <div class="form-grid">
                  <label class="field"><span>ছাড় (৳)</span><input type="number" name="discount" min={0} max={o.subtotal + o.delivery_charge} value={String(o.discount)} inputmode="numeric" /></label>
                  <label class="field"><span>ডেলিভারি চার্জ (৳)</span><input type="number" name="delivery" min={0} max={100000} value={String(o.delivery_charge)} inputmode="numeric" /></label>
                </div>
                <p class="muted small">ছাড়ের ঘরে মোট ছাড় লিখুন (যেমন ৮০)। ছাড় তুলে দিতে ০ লিখুন। মোট টাকা নিজে থেকে বদলাবে — কুরিয়ারের COD, ইনভয়েস আর হিসাবে নতুন টাকাই যাবে।</p>
                <button class="btn btn-primary btn-sm"><Icon name="check" size="sm" /> সেভ করুন</button>
              </form>
            </details>
          ) : (o.status === "new" || o.status === "confirmed") && o.consignment_id ? (
            <p class="muted small">কুরিয়ারে পাঠানো হয়ে গেছে — এখন দাম বদলালে কুরিয়ারের COD মিলবে না, তাই বদলানো বন্ধ।</p>
          ) : null}
        </section>

        {o.pay_trx && <PaymentPanel o={o} />}

        {p.record && <BuyerRecordPanel o={o} r={p.record} />}

        {(o.status === "confirmed" || o.consignment_id) && <CourierPanel o={o} couriers={p.couriers ?? []} />}

        {(o.status === "confirmed" || o.status === "shipped") && (
          <section class="panel">
            <h2>ডেলিভারির ফল</h2>
            {o.outcome
              ? <p><span class={`pill ${o.outcome === "delivered" ? "pill-ok" : "pill-bad"}`}>{o.outcome === "delivered" ? "ডেলিভারি হয়েছে" : "ফেরত এসেছে"}</span> <small class="muted">{dhakaTime(o.outcome_at)}</small></p>
              : <p class="muted small">কুরিয়ারের স্ট্যাটাস আপডেট করলে নিজে থেকে বসে। নিজে পাঠালে এখানে চাপুন — ক্রেতার রেকর্ডে যোগ হবে।</p>}
            <div class="actions">
              {o.outcome !== "delivered" && <form method="post" action={`/admin/orders/${o.id}/outcome`} class="inline"><input type="hidden" name="outcome" value="delivered" /><button class="btn btn-outline btn-sm"><Icon name="check" size="sm" /> ডেলিভারি হয়েছে</button></form>}
              {o.outcome !== "returned" && <form method="post" action={`/admin/orders/${o.id}/outcome`} class="inline" data-confirm="পার্সেল ফেরত এসেছে? ক্রেতার রেকর্ডে ফেরত লেখা হবে।"><input type="hidden" name="outcome" value="returned" /><button class="btn btn-outline btn-sm"><Icon name="undo-2" size="sm" /> ফেরত এসেছে</button></form>}
            </div>
          </section>
        )}

        {(p.sms ?? []).length > 0 && (
          <section class="panel">
            <h2>SMS</h2>
            <SmsLogTable logs={p.sms!} compact />
          </section>
        )}

        <section class="panel">
          <h2>Facebook Purchase</h2>
          {o.purchase_sent_at ? (
            <p><span class="pill pill-ok">গেছে</span> {dhakaTime(o.purchase_sent_at)}</p>
          ) : o.status === "confirmed" || o.status === "shipped" ? (
            <>
              <p><span class="pill pill-bad">যায়নি</span></p>
              <form method="post" action={`/admin/orders/${o.id}/purchase`}><button class="btn btn-primary">Purchase আবার পাঠান</button></form>
            </>
          ) : o.status === "new" ? (
            <p class="muted">কনফার্ম করলে সার্ভার থেকে Purchase যাবে।</p>
          ) : (
            <p class="muted">বাতিল/ফেক অর্ডারের Purchase কখনো যায় না।</p>
          )}
          {o.purchase_response && <details><summary>Facebook-এর রেসপন্স</summary><pre class="pre">{o.purchase_response}</pre></details>}
        </section>

        <section class="panel">
          <h2>ট্র্যাকিং তথ্য</h2>
          <dl class="kv small">
            <dt>IP</dt><dd>{o.ip || "—"}</dd>
            <dt>ডিভাইস</dt><dd><code>{o.device_id || "—"}</code> {p.blocked.device && <span class="pill pill-bad">ব্লক</span>}</dd>
            <dt>fbp</dt><dd><code>{o.fbp || "—"}</code></dd>
            <dt>fbc</dt><dd><code>{o.fbc || "—"}</code></dd>
            <dt>পেজ URL</dt><dd class="break">{o.source_url || "—"}</dd>
            <dt>ব্রাউজার</dt><dd class="break">{o.user_agent || "—"}</dd>
            <dt>কনফার্ম</dt><dd>{dhakaTime(o.confirmed_at)}</dd>
          </dl>
        </section>
      </div>

      <section class="panel">
        <h2>এই নম্বর/ডিভাইসের আগের অর্ডার ({p.history.length})</h2>
        {p.history.length === 0 ? <p class="muted">আগে কোনো অর্ডার নেই</p> : (
          <table class="table compact">
            <tbody>
              {p.history.map((h) => (
                <tr>
                  <td><a href={`/admin/orders/${h.id}`}>{h.order_no}</a></td>
                  <td>{h.phone === o.phone ? "একই নম্বর" : "একই ডিভাইস"}</td>
                  <td>{taka(h.total)}</td>
                  <td><StatusBadge s={h.status} /></td>
                  <td><small>{dhakaTime(h.created_at)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
};

/* ---------- পণ্য ---------- */
export const ProductsPage = ({ products, categories }: { products: Product[]; categories: Category[] }) => (
  <>
    <div class="detail-head"><h1>পণ্য</h1><div class="inline-actions"><a href="/admin/products/images" class="btn"><Icon name="image" size="sm" /> একসাথে ছবি</a> <a href="/admin/products/new" class="btn btn-primary">+ নতুন পণ্য</a></div></div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th></th><th>নাম</th><th>দাম</th><th>স্টক</th><th>ক্যাটাগরি</th><th>অবস্থা</th><th></th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr class={p.is_active ? "" : "dim"}>
              <td><img src={imageUrl(p.image)} width="48" height="48" class="thumb" alt="" /></td>
              <td><strong>{p.name}</strong><br /><a href={`/p/${p.slug}`} target="_blank"><small>/p/{p.slug}</small></a></td>
              <td>{taka(p.price)}{p.compare_price ? <><br /><del class="muted">{taka(p.compare_price)}</del></> : null}</td>
              <td>{p.track_stock === 1
                ? (p.stock ?? 0) <= 0 ? <span class="pill pill-bad">শেষ</span> : <span class={(p.stock ?? 0) <= (p.low_stock ?? 5) ? "pill pill-warn" : ""}>{bn(p.stock ?? 0)}টা</span>
                : <small class="muted">গোনা হয় না</small>}</td>
              <td>{categories.find((c) => c.id === p.category_id)?.name ?? "—"}</td>
              <td>
                {p.is_active ? <span class="pill pill-ok">চালু</span> : <span class="pill pill-bad">বন্ধ</span>}
                {p.show_on_home ? <span class="pill">হোমে</span> : null}
              </td>
              <td class="nowrap">
                <a href={`/admin/products/${p.id}/edit`} class="btn btn-outline btn-sm">এডিট</a>
                <a href={`/admin/products/${p.id}/landing`} class="btn btn-outline btn-sm">ল্যান্ডিং পেজ</a>
                <form method="post" action={`/admin/products/${p.id}/toggle`} class="inline">
                  <button class="btn-link">{p.is_active ? "বন্ধ করুন" : "চালু করুন"}</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p class="muted">পণ্য মোছা যায় না (পুরনো অর্ডারের জন্য), শুধু বন্ধ করা যায়।</p>
  </>
);

export const ProductFormPage = (p: { product?: Partial<Product>; categories: Category[]; errors?: Record<string, string>; variants?: Variant[] }) => {
  const v = p.product ?? {};
  const opts = parseOptions(v.options_json);
  const e = p.errors ?? {};
  const isEdit = !!v.id;
  return (
    <>
      <p><a href="/admin/products" class="btn-link"><Icon name="arrow-left" size="sm" /> পণ্য তালিকা</a></p>
      <div class="detail-head">
        <h1>{isEdit ? v.name || "পণ্য এডিট" : "নতুন পণ্য"}</h1>
        {isEdit && (
          <div class="inline-actions">
            <a href={`/p/${v.slug}`} target="_blank" rel="noopener" class="btn btn-sm"><Icon name="eye" size="sm" /> দেখুন</a>
            <a href={`/admin/products/${v.id}/landing`} class="btn btn-outline btn-sm"><Icon name="layout-template" size="sm" /> ল্যান্ডিং পেজ বিল্ডার</a>
          </div>
        )}
      </div>
      <form method="post" action={isEdit ? `/admin/products/${v.id}` : "/admin/products"} enctype="multipart/form-data" class="pf-grid">
        <div class="pf-main">
          <section class="sa-card pf-card">
            <h2>মূল তথ্য</h2>
            <label class="field"><span>পণ্যের নাম *</span><input type="text" name="name" value={v.name ?? ""} required placeholder="যেমন: কাঠের ওয়াল শেলফ" />{e.name && <small class="error">{e.name}</small>}</label>
            <label class="field"><span>ল্যান্ডিং পেজের শিরোনাম</span><input type="text" name="headline" value={v.headline ?? ""} placeholder="ফাঁকা রাখলে পণ্যের নাম" /></label>
            <label class="field"><span>ছোট বর্ণনা</span><textarea name="short_desc" rows={3}>{v.short_desc ?? ""}</textarea><small>কার্ড আর শেয়ারে দেখায় — ১–২ লাইন।</small></label>
          </section>
          <section class="sa-card pf-card">
            <h2>বিস্তারিত</h2>
            <label class="field"><span>বিস্তারিত কনটেন্ট (HTML)</span><textarea name="details_html" rows={10} class="mono">{v.details_html ?? ""}</textarea></label>
            <label class="field"><span>YouTube ভিডিও লিংক (ঐচ্ছিক)</span><input type="url" name="youtube_url" value={v.youtube_url ?? ""} placeholder="https://youtu.be/..." />{e.youtube_url && <small class="error">{e.youtube_url}</small>}</label>
          </section>
          <section class="sa-card pf-card">
            <h2>সাইজ/রং (ঐচ্ছিক)</h2>
            <p class="muted small">যেমন অপশন: <code>সাইজ</code>, মান: <code>S, M, L, XL</code>। দুটো পর্যন্ত অপশন দেওয়া যায়। সেভ করলে সব কম্বিনেশন নিচে আসবে, সেখানে আলাদা দাম বা "স্টকে নেই" দেওয়া যাবে।</p>
            <div class="form-grid">
              {[0, 1].map((i) => (
                <>
                  <label class="field"><span>অপশন {i + 1}-এর নাম</span><input type="text" name={`opt${i}_name`} value={opts[i]?.name ?? ""} placeholder={i === 0 ? "সাইজ" : "রং"} maxlength={30} /></label>
                  <label class="field"><span>মান (কমা দিয়ে)</span><input type="text" name={`opt${i}_values`} value={opts[i]?.values.join(", ") ?? ""} placeholder={i === 0 ? "S, M, L, XL" : "লাল, কালো"} /></label>
                </>
              ))}
            </div>
          </section>
          <section class="sa-card pf-card seo-box" data-seo-box>
            <h2>সার্চ ইঞ্জিন (SEO) <small class="muted">ঐচ্ছিক</small></h2>
            <p class="muted small">ফাঁকা রাখলে পণ্যের নাম আর ছোট বর্ণনা ব্যবহার হবে। Google-এ আর Facebook-এ শেয়ার করলে এগুলো দেখায়।</p>
            <label class="field"><span>মেটা টাইটেল <small data-count-for="meta_title"></small></span><input type="text" name="meta_title" value={v.meta_title ?? ""} maxlength={100} data-count="60" placeholder={v.name ?? ""} /></label>
            <label class="field"><span>মেটা ডেসক্রিপশন <small data-count-for="meta_description"></small></span><textarea name="meta_description" rows={2} maxlength={300} data-count="155">{v.meta_description ?? ""}</textarea></label>
            <label class="field"><span>লিংক (slug)</span><input type="text" name="slug" value={v.slug ?? ""} placeholder="ফাঁকা রাখলে নিজে বানাবে" pattern="[a-z0-9-]*" /><small>শুধু ইংরেজি ছোট হাতের অক্ষর, সংখ্যা আর - (লিংক হবে /p/slug)</small>{e.slug && <small class="error">{e.slug}</small>}</label>
            <div class="serp" data-serp data-url={`/p/${v.slug || "slug"}`}>
              <div class="serp-url"></div><div class="serp-title"></div><div class="serp-desc"></div>
            </div>
          </section>
        </div>
        <aside class="pf-side">
          <section class="sa-card pf-card">
            <h2>অবস্থা</h2>
            <label class="set-check"><input type="checkbox" name="is_active" value="1" checked={v.is_active !== 0} /> চালু (দোকানে দেখা যাবে)</label>
            <label class="set-check"><input type="checkbox" name="show_on_home" value="1" checked={v.show_on_home !== 0} /> হোম পেজে দেখাবে</label>
          </section>
          <section class="sa-card pf-card">
            <h2>ছবি</h2>
            <MediaField fileName="image" pickName="image_pick" current={v.image} folder="product" ratio="1:1" />
            <small class="hint">লাইব্রেরি থেকে বাছুন বা নতুন আপলোড করুন — বর্গাকার (১:১) হলে সবচেয়ে ভালো।</small>
            {e.image && <small class="error">{e.image}</small>}
          </section>
          <section class="sa-card pf-card">
            <h2>দাম</h2>
            <label class="field"><span>বিক্রির দাম (৳) *</span><input type="number" name="price" min="0" value={v.price != null ? String(v.price) : ""} required />{e.price && <small class="error">{e.price}</small>}</label>
            <label class="field"><span>কাটা দাম (৳)</span><input type="number" name="compare_price" min="0" value={v.compare_price != null ? String(v.compare_price) : ""} /><small>দিলে দামের পাশে কেটে দেখাবে — ছাড় বোঝাতে।</small></label>
            <label class="field"><span>ক্রয়মূল্য (৳)</span><input type="number" name="cost_price" min="0" value={v.cost_price != null ? String(v.cost_price) : ""} /><small>শুধু আপনি দেখবেন — লাভের হিসাবের জন্য।</small></label>
          </section>
          <section class="sa-card pf-card">
            <h2>স্টক</h2>
            <label class="set-check"><input type="checkbox" name="track_stock" value="1" checked={v.track_stock === 1} data-toggle-target="[data-stock-box]" /> স্টক গুনবে</label>
            <div class="pf-stock-box" data-stock-box hidden={v.track_stock !== 1}>
              {opts.length > 0
                ? <p class="muted small">সাইজ/রং আছে — প্রতিটার স্টক নিচে "ভ্যারিয়েন্ট" অংশে দিন। মোট: <strong>{bn(v.stock ?? 0)}</strong>টা।</p>
                : <label class="field"><span>কতটা আছে</span><input type="number" name="stock" min="0" value={String(v.stock ?? 0)} /></label>}
              <label class="field"><span>কম হলে সতর্ক করবে</span><input type="number" name="low_stock" min="0" value={String(v.low_stock ?? 5)} /><small>এর সমান বা কম হলে ড্যাশবোর্ডে আর ইনভেন্টরিতে "কম আছে" দেখাবে।</small></label>
            </div>
            <small class="hint">স্টক গুনলে অর্ডার কনফার্মে কমে, বাতিলে ফেরে; শেষ হলে দোকানে "স্টক নেই" দেখায়।</small>
          </section>
          <section class="sa-card pf-card">
            <h2>সাজানো</h2>
            <label class="field"><span>ক্যাটাগরি</span>
              <select name="category_id">
                <option value="">— নেই —</option>
                {p.categories.map((c) => <option value={String(c.id)} selected={v.category_id === c.id}>{c.name}</option>)}
              </select>
            </label>
            <label class="field"><span>ক্রম</span><input type="number" name="sort_order" value={String(v.sort_order ?? 0)} /><small>ছোট সংখ্যা আগে দেখাবে।</small></label>
          </section>
        </aside>
        <div class="set-save pf-save"><a href="/admin/products" class="btn">বাতিল</a><button class="btn btn-primary">সেভ করুন</button></div>
      </form>
      {isEdit && p.variants && p.variants.length > 0 && (
        <form method="post" action={`/admin/products/${v.id}/variants`} class="admin-form" style="margin-top:14px">
          <h2>ভ্যারিয়েন্ট ({p.variants.length})</h2>
          <p class="muted">দাম বা ক্রয়মূল্য ফাঁকা রাখলে পণ্যেরটা ({taka(v.price ?? 0)}) লাগবে। "চালু" টিক তুলে দিলে ওই সাইজ/রং বাছাই করা যাবে না।{v.track_stock === 1 ? "" : " স্টক গুনতে উপরে \"স্টক গুনবে\" টিক দিন।"}</p>
          <div class="table-wrap">
          <table class="table compact">
            <thead><tr><th>ভ্যারিয়েন্ট</th><th>দাম (৳)</th><th>ক্রয়মূল্য (৳)</th>{v.track_stock === 1 && <th>স্টক</th>}<th>চালু</th></tr></thead>
            <tbody>
              {p.variants.map((vr) => (
                <tr>
                  <td>{vr.label}{v.track_stock === 1 && (vr.stock ?? 0) <= 0 && <> <span class="pill pill-bad">শেষ</span></>}</td>
                  <td><input type="number" min="0" name={`price_${vr.id}`} value={vr.price != null ? String(vr.price) : ""} class="w-sm input-sm" /></td>
                  <td><input type="number" min="0" name={`cost_${vr.id}`} value={vr.cost_price != null ? String(vr.cost_price) : ""} class="w-sm input-sm" /></td>
                  {v.track_stock === 1 && <td><input type="number" min="0" name={`stock_${vr.id}`} value={String(vr.stock ?? 0)} class="w-sm input-sm" /></td>}
                  <td><input type="checkbox" name={`active_${vr.id}`} value="1" checked={!!vr.active} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <button class="btn btn-primary">ভ্যারিয়েন্ট সেভ করুন</button>
        </form>
      )}
    </>
  );
};

/* ---------- ক্যাটাগরি ---------- */
export const CategoriesPage = ({ categories, counts }: { categories: Category[]; counts: Record<number, number> }) => (
  <>
    <h1>ক্যাটাগরি</h1>
    <form method="post" action="/admin/categories" class="row-form">
      <input type="text" name="name" placeholder="নতুন ক্যাটাগরির নাম" required />
      <input type="number" name="sort_order" placeholder="ক্রম" value="0" class="w-sm" />
      <button class="btn btn-primary">যোগ করুন</button>
    </form>
    <p class="muted">হোম পেজে ক্রম অনুযায়ী (ছোট সংখ্যা আগে) সেকশন দেখাবে।</p>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>নাম</th><th>ক্রম</th><th>পণ্য</th><th></th></tr></thead>
        <tbody>
          {categories.map((c) => (
            <tr>
              <td colspan={2}>
                <form method="post" action={`/admin/categories/${c.id}`} class="row-form" id={`cat-${c.id}`}>
                  <input type="text" name="name" value={c.name} required />
                  <input type="number" name="sort_order" value={String(c.sort_order)} class="w-sm" />
                  <button class="btn btn-outline btn-sm">সেভ</button>
                </form>
              </td>
              <td>{counts[c.id] ?? 0}</td>
              <td>
                <form method="post" action={`/admin/categories/${c.id}/delete`} class="inline"
                  data-confirm="ক্যাটাগরিটি মুছবেন? এর পণ্যগুলো ক্যাটাগরি ছাড়া থাকবে (মুছবে না)।">
                  <button class="btn-link danger">মুছুন</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

/* ---------- ব্ল্যাকলিস্ট ---------- */
export type BlacklistRow = { id: number; type: "phone" | "device"; value: string; reason: string; order_id: number | null; order_no: string | null; created_at: string };
const REASON_LABEL: Record<string, string> = { fake: "ফেক", cancelled: "বাতিল", manual: "নিজে ব্লক" };

export const BlacklistPage = ({ rows, q }: { rows: BlacklistRow[]; q: string }) => (
  <>
    <h1>ব্ল্যাকলিস্ট</h1>
    <form method="post" action="/admin/blacklist" class="row-form">
      <input type="tel" name="phone" placeholder="নম্বর ব্লক করুন (01XXXXXXXXX)" required />
      <button class="btn btn-danger">ব্লক করুন</button>
    </form>
    <form method="get" action="/admin/blacklist" class="search">
      <input type="search" name="q" value={q} placeholder="নম্বর বা ডিভাইস আইডি খুঁজুন" />
      <button class="btn btn-outline">খুঁজুন</button>
    </form>
    {rows.length === 0 ? <p class="empty">তালিকা খালি</p> : (
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>ধরন</th><th>মান</th><th>কারণ</th><th>কোন অর্ডার থেকে</th><th>সময়</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>{r.type === "phone" ? "নম্বর" : "ডিভাইস"}</td>
                <td><code>{r.value}</code></td>
                <td>{REASON_LABEL[r.reason] ?? r.reason}</td>
                <td>{r.order_id ? <a href={`/admin/orders/${r.order_id}`}>{r.order_no ?? `#${r.order_id}`}</a> : "—"}</td>
                <td><small>{dhakaTime(r.created_at)}</small></td>
                <td>
                  <form method="post" action={`/admin/blacklist/${r.id}/delete`} class="inline" data-confirm="আনব্লক করবেন?">
                    <button class="btn-link">আনব্লক</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
);

/* ---------- সেটিংস ---------- */
/* ---------- বিলিং ---------- */
export type LedgerRow = { id: number; type: string; amount: number; balance_after: number | null; ref: string; note: string | null; created_at: string };
export type TopupRow = { id: number; amount: number; method: string; sender: string; trx_id: string; status: string; created_at: string };
const LEDGER_LABEL: Record<string, string> = { topup: "রিচার্জ", order_fee: "অর্ডার চার্জ", monthly: "প্ল্যানের বিল", trial_order: "ট্রায়াল অর্ডার", adjust: "সমন্বয়", overage: "সীমার বেশি অর্ডার", plan_change: "প্ল্যান বদল", plan_order: "অর্ডার" };
const TOPUP_STATUS: Record<string, string> = { pending: "অপেক্ষায়", approved: "যোগ হয়েছে", rejected: "বাতিল" };

/** রিচার্জের নম্বর/অ্যাকাউন্ট — এক চাপে কপি */
const PayRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div class="pay-row">
    <span class="pay-row-label">{label}</span>
    <span class={`pay-row-value${strong ? " strong" : ""}`}>{value}</span>
    <button type="button" class="pay-copy" data-copy-text={value} aria-label={`${label} কপি করুন`}><Icon name="copy" size="sm" /> <span>কপি</span></button>
  </div>
);

export const BillingPage = (p: { state: ShopState; fees: Record<string, string>; ledger: LedgerRow[]; topups: TopupRow[]; plan: Child; errors?: Record<string, string>; values?: Record<string, string> }) => {
  const e = p.errors ?? {};
  const v = p.values ?? {};
  const bank = !!(p.fees.dbbl_account_no || "").trim();
  return (
    <>
      <h1>বিলিং ও প্ল্যান</h1>
      {p.plan}
      <div class="panels">
        <section class="panel">
          <h2>ব্যালেন্স</h2>
          <div class={`balance-big ${p.state.balance < 0 ? "neg" : ""}`}>{taka(p.state.balance)}</div>
          {p.state.status === "trial" && (
            <p>ফ্রি ট্রায়াল: <strong>{dhakaTime(p.state.trial_ends_at)}</strong> পর্যন্ত। এর মধ্যে কোনো চার্জ নেই। ট্রায়াল শেষে উপরে বাছাই করা প্ল্যান চালু হবে — ব্যালেন্স না থাকলে ফ্রি প্ল্যানে চলবে।</p>
          )}
          <ul class="muted small-list">
            <li>প্ল্যানের টাকা বিলের দিন ব্যালেন্স থেকে কাটে</li>
            <li>ফেক/বাতিল অর্ডার গোনা হয় না</li>
            <li>ব্যালেন্স মাইনাস হলে {bn(p.fees.grace_days || "3")} দিন পর নতুন অর্ডার নেওয়া বন্ধ হয়</li>
          </ul>
        </section>
        <section class="panel">
          <h2>রিচার্জ করুন</h2>
          <ol class="small-list">
            <li>নিচের যেকোনো একটায় টাকা পাঠান (bKash/Nagad-এ <strong>Send Money</strong>{bank ? ", ব্যাংকে ট্রান্সফার" : ""}) — নম্বরের পাশের <strong>কপি</strong> চাপলেই কপি হবে</li>
            <li>নিচে টাকার পরিমাণ, যে নম্বর/অ্যাকাউন্ট থেকে পাঠিয়েছেন আর Transaction ID দিন</li>
            <li>যাচাই করে আমরা ব্যালেন্সে যোগ করে দেব</li>
          </ol>
          <div class="pay-acc">
            {p.fees.bkash_number && <PayRow label="bKash (Send Money)" value={p.fees.bkash_number} strong />}
            {p.fees.nagad_number && <PayRow label="Nagad (Send Money)" value={p.fees.nagad_number} strong />}
            {bank && (
              <div class="pay-acc-bank">
                <p class="pay-acc-head">DBBL ব্যাংক</p>
                <PayRow label="ব্যাংকের নাম" value="Dutch-Bangla Bank Limited (DBBL)" />
                {p.fees.dbbl_account_name && <PayRow label="অ্যাকাউন্টের নাম" value={p.fees.dbbl_account_name} />}
                <PayRow label="অ্যাকাউন্ট নম্বর" value={p.fees.dbbl_account_no!} strong />
                {p.fees.dbbl_branch && <PayRow label="শাখা" value={p.fees.dbbl_branch} />}
              </div>
            )}
          </div>
          <form method="post" action="/admin/billing/topup" class="order-form">
            <div class="form-grid">
              <label class="field"><span>মাধ্যম</span>
                <select name="method"><option value="bkash" selected={!v.method || v.method === "bkash"}>bKash</option><option value="nagad" selected={v.method === "nagad"}>Nagad</option>{bank && <option value="dbbl" selected={v.method === "dbbl"}>DBBL ব্যাংক</option>}</select>
              </label>
              <label class="field"><span>টাকা (সর্বনিম্ন {taka(Number(p.fees.min_topup || 100))})</span><input type="number" name="amount" min={p.fees.min_topup || "100"} value={v.amount ?? ""} required />{e.amount && <small class="error">{e.amount}</small>}</label>
              <label class="field"><span>যে নম্বর বা অ্যাকাউন্ট থেকে পাঠিয়েছেন</span><input type="tel" name="sender" value={v.sender ?? ""} required />{e.sender && <small class="error">{e.sender}</small>}</label>
              <label class="field"><span>Transaction ID (ব্যাংকে রেফারেন্স নম্বর)</span><input type="text" name="trx_id" value={v.trx_id ?? ""} required maxlength={30} />{e.trx_id && <small class="error">{e.trx_id}</small>}</label>
            </div>
            <button class="btn btn-primary">রিচার্জের অনুরোধ পাঠান</button>
          </form>
        </section>
      </div>
      {p.topups.length > 0 && (
        <section class="panel">
          <h2>রিচার্জের অনুরোধ</h2>
          <table class="table compact"><tbody>
            {p.topups.map((t) => <tr><td>{dhakaTime(t.created_at)}</td><td>{topupMethod(t.method)} · {t.trx_id}</td><td>{taka(t.amount)}</td><td><span class={`pill ${t.status === "approved" ? "pill-ok" : t.status === "rejected" ? "pill-bad" : ""}`}>{TOPUP_STATUS[t.status]}</span></td></tr>)}
          </tbody></table>
        </section>
      )}
      <section class="panel">
        <h2>লেনদেনের হিসাব</h2>
        {p.ledger.length === 0 ? <p class="muted">এখনো কোনো লেনদেন নেই</p> : (
          <div class="table-wrap"><table class="table compact">
            <thead><tr><th>সময়</th><th>বিবরণ</th><th class="right">টাকা</th><th class="right">ব্যালেন্স</th></tr></thead>
            <tbody>
              {p.ledger.map((l) => (
                <tr><td><small>{dhakaTime(l.created_at)}</small></td><td>{LEDGER_LABEL[l.type] ?? l.type}{l.note ? ` — ${l.note}` : ""}</td>
                  <td class={`right ${l.amount < 0 ? "danger" : ""}`}>{l.amount === 0 ? "—" : (l.amount > 0 ? "+" : "") + taka(l.amount)}</td>
                  <td class="right">{l.balance_after != null ? taka(l.balance_after) : ""}</td></tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
};

/* ---------- স্টাফ ---------- */
export type StaffRow = { id: number; name: string; email: string; role: Role; active: number; created_at: string };

export const StaffPage = (p: { users: StaffRow[]; me: number; fee: number; trial: boolean; errors?: Record<string, string>; values?: Record<string, string> }) => {
  const e = p.errors ?? {};
  const v = p.values ?? {};
  return (
    <>
      <h1>স্টাফ</h1>
      <p class="muted">
        প্রতিটা প্ল্যানে কয়েকজন স্টাফ ধরা আছে (ছোট দোকান ১ জন, বাড়ন্ত ৪ জন, বড় ব্র্যান্ড ১৪ জন)। এর বেশি হলে প্রতিজনের জন্য মাসে {taka(p.fee)}{p.trial ? " — ট্রায়ালের সময় ফ্রি।" : " — বাড়তি স্টাফ যোগ করলে চলতি মাসেরটা সাথে সাথে কাটে।"}
      </p>
      <div class="panel">
        <h2>রোল কে কী দেখতে পারবে</h2>
        <ul class="small-list">
          <li><strong>{ROLE_LABEL.owner}</strong>: সব কিছু — বিলিং, সেটিংস, স্টাফ, ডোমেইন</li>
          <li><strong>{ROLE_LABEL.manager}</strong>: অর্ডার, পণ্য, ক্যাটাগরি, ব্ল্যাকলিস্ট</li>
          <li><strong>{ROLE_LABEL.orders}</strong>: শুধু অর্ডার (দেখা আর স্ট্যাটাস বদল)</li>
        </ul>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>নাম</th><th>রোল</th><th>অবস্থা</th><th></th></tr></thead>
          <tbody>
            {p.users.map((u) => (
              <tr class={u.active ? "" : "dim"}>
                <td><strong>{u.name}</strong><br /><small>{u.email}</small></td>
                <td>
                  {u.role === "owner" ? ROLE_LABEL.owner : (
                    <form method="post" action={`/admin/staff/${u.id}/role`} class="row-form inline-form">
                      <select name="role">
                        <option value="manager" selected={u.role === "manager"}>{ROLE_LABEL.manager}</option>
                        <option value="orders" selected={u.role === "orders"}>{ROLE_LABEL.orders}</option>
                      </select>
                      <button class="btn btn-outline btn-sm">বদলান</button>
                    </form>
                  )}
                </td>
                <td>{u.active ? <span class="pill pill-ok">চালু</span> : <span class="pill pill-bad">বন্ধ</span>}</td>
                <td class="nowrap">
                  {u.role !== "owner" && u.id !== p.me && (
                    <>
                      <form method="post" action={`/admin/staff/${u.id}/password`} class="row-form inline-form">
                        <input type="password" name="password" placeholder="নতুন পাসওয়ার্ড" minlength={8} required class="w-md" />
                        <button class="btn-link">পাসওয়ার্ড বদলান</button>
                      </form>
                      <form method="post" action={`/admin/staff/${u.id}/delete`} class="inline" data-confirm="এই স্টাফকে মুছে ফেলবেন? সে আর লগইন করতে পারবে না।">
                        <button class="btn-link danger">মুছুন</button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form method="post" action="/admin/staff" class="admin-form" style="margin-top:14px">
        <h2>নতুন স্টাফ যোগ করুন</h2>
        <div class="form-grid">
          <label class="field"><span>নাম</span><input type="text" name="name" value={v.name ?? ""} required maxlength={60} />{e.name && <small class="error">{e.name}</small>}</label>
          <label class="field"><span>ইমেইল (লগইনের জন্য)</span><input type="email" name="email" value={v.email ?? ""} required />{e.email && <small class="error">{e.email}</small>}</label>
          <label class="field"><span>পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)</span><input type="password" name="password" required minlength={8} autocomplete="new-password" />{e.password && <small class="error">{e.password}</small>}</label>
          <label class="field"><span>রোল</span>
            <select name="role">
              <option value="orders" selected={v.role !== "manager"}>{ROLE_LABEL.orders}</option>
              <option value="manager" selected={v.role === "manager"}>{ROLE_LABEL.manager}</option>
            </select>
          </label>
        </div>
        <button class="btn btn-primary" data-confirm-fee>যোগ করুন</button>
      </form>
    </>
  );
};

/* ---------- ডোমেইন ---------- */
export type DomainView = { hostname: string; status: string; nameservers: string | null; root: string | null; checked_at: string | null; error: string | null };

export const DomainPage = (p: { domains: DomainView[]; freeUrl: string; configured: boolean; value?: string; error?: string }) => {
  const root = p.domains[0]?.root;
  const ns: string[] = p.domains[0]?.nameservers ? JSON.parse(p.domains[0].nameservers) : [];
  const active = p.domains.length > 0 && p.domains.every((d) => d.status === "active");
  return (
    <>
      <h1>ডোমেইন</h1>
      {root && p.error && <div class="alert alert-error">{p.error}</div>}
      <section class="panel">
        <h2>ফ্রি ঠিকানা</h2>
        <p><a href={p.freeUrl} target="_blank">{p.freeUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}</a> — সবসময় চালু থাকবে</p>
      </section>

      {!root ? (
        <section class="panel">
          <h2>নিজের ডোমেইন যোগ করুন</h2>
          {!p.configured && <div class="alert alert-error">নিজের ডোমেইন ফিচার এখনো চালু করা হয়নি। সাপোর্টে যোগাযোগ করুন।</div>}
          <p class="muted">যেমন <code>dokan.com</code> — www ছাড়া মূল ডোমেইন দিন। www সহ দুটোতেই আপনার দোকান চলবে।</p>
          <form method="post" action="/admin/domain" class="row-form">
            <input type="text" name="domain" value={p.value ?? ""} placeholder="dokan.com" required />
            <button class="btn btn-primary">যোগ করুন</button>
          </form>
          {p.error && <div class="alert alert-error">{p.error}</div>}
          <p class="muted">যোগ করার পর আমরা দুটো নেমসার্ভার দেব। সেগুলো আপনার ডোমেইন কোম্পানির প্যানেলে বসালেই দোকান আপনার ডোমেইনে চালু হবে।</p>
        </section>
      ) : (
        <section class="panel">
          <h2>{root} {active ? <span class="pill pill-ok">চালু</span> : <span class="pill">অপেক্ষায়</span>}</h2>
          {active ? (
            <p>আপনার দোকান চালু আছে: <a href={`https://${root}`} target="_blank">https://{root}</a> এবং <a href={`https://www.${root}`} target="_blank">www.{root}</a></p>
          ) : (
            <>
              <p><strong>ধাপ ১:</strong> আপনার ডোমেইন কোম্পানির প্যানেলে (যেখান থেকে ডোমেইন কিনেছেন) লগইন করুন।</p>
              <p><strong>ধাপ ২:</strong> Nameserver অংশে আগের সব নেমসার্ভার মুছে এই দুটো বসান:</p>
              <div class="ns-box">{ns.map((n) => <code class="ns">{n}</code>)}</div>
              <p><strong>ধাপ ৩:</strong> সেভ করে নিচের বাটনে চাপুন। নেমসার্ভার ছড়াতে কয়েক মিনিট থেকে ২৪ ঘণ্টা লাগতে পারে — আমরা প্রতি ৩০ মিনিটে নিজে থেকেও যাচাই করি।</p>
              <p class="muted"><Icon name="triangle-alert" size="sm" /> এই ডোমেইনে ইমেইল বা অন্য কিছু চালালে আগে <a href="/admin/dns">DNS রেকর্ড</a> পেজে রেকর্ডগুলো ঠিক আছে কি না দেখে নিন।</p>
              <form method="post" action="/admin/domain/check" class="inline"><button class="btn btn-primary">এখনই যাচাই করুন</button></form>
              {p.domains[0]?.checked_at && <p class="muted">শেষ যাচাই: {dhakaTime(p.domains[0].checked_at)}</p>}
              {p.domains[0]?.error && <div class="alert alert-error">{p.domains[0].error}</div>}
            </>
          )}
          <p><a href="/admin/dns" class="btn btn-outline">DNS রেকর্ড (ইমেইল ইত্যাদি)</a></p>
          <form method="post" action="/admin/domain/remove" class="inline" data-confirm={`${root} সরিয়ে ফেলবেন? দোকান শুধু ফ্রি ঠিকানায় চলবে, আর এই ডোমেইনের DNS রেকর্ড মুছে যাবে।`}>
            <button class="btn-link danger">ডোমেইন সরান</button>
          </form>
          <p class="muted">ডোমেইন সরালে আপনার ডোমেইন কোম্পানির প্যানেলে আগের নেমসার্ভার ফেরত বসাবেন।</p>
        </section>
      )}
    </>
  );
};

/* ---------- DNS রেকর্ড ---------- */
export type DnsView = { id: string; type: string; name: string; content: string; priority?: number; protected: boolean };

export const DnsPage = (p: { root: string; records: DnsView[]; scanned: DnsView[]; error?: string; values?: Record<string, string> }) => {
  const v = p.values ?? {};
  return (
    <>
      <p><a href="/admin/domain">← ডোমেইন</a></p>
      <h1>DNS রেকর্ড — {p.root}</h1>
      <p class="muted">ইমেইল (MX), যাচাইয়ের TXT বা অন্য সাবডোমেইনের রেকর্ড এখানে রাখুন। মূল ডোমেইন আর www আপনার দোকানের জন্য সংরক্ষিত।</p>
      {p.scanned.length > 0 && (
        <section class="panel">
          <h2>আপনার আগের DNS-এ পাওয়া রেকর্ড ({p.scanned.length})</h2>
          <p class="muted">নেমসার্ভার বদলানোর আগে এগুলো গ্রহণ করুন, যাতে ইমেইল ইত্যাদি বন্ধ না হয়। মূল/www-এর রেকর্ড বাদ যাবে।</p>
          <table class="table compact"><tbody>
            {p.scanned.map((r) => <tr class={r.protected ? "dim" : ""}><td>{r.type}</td><td>{r.name}</td><td class="break">{r.priority != null ? `${r.priority} ` : ""}{r.content}</td><td>{r.protected ? "বাদ যাবে" : ""}</td></tr>)}
          </tbody></table>
          <form method="post" action="/admin/dns/accept-scan"><button class="btn btn-primary">সব গ্রহণ করুন</button></form>
        </section>
      )}
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>ধরন</th><th>নাম</th><th>মান</th><th></th></tr></thead>
          <tbody>
            {p.records.length === 0 && <tr><td colspan={4} class="muted">কোনো রেকর্ড নেই</td></tr>}
            {p.records.map((r) => (
              <tr>
                <td><code>{r.type}</code></td>
                <td>{r.name}</td>
                <td class="break">{r.priority != null ? `${r.priority} ` : ""}{r.content}</td>
                <td>{r.protected ? <span class="pill">দোকানের জন্য</span> : (
                  <form method="post" action={`/admin/dns/${r.id}/delete`} class="inline" data-confirm="রেকর্ডটি মুছবেন?"><button class="btn-link danger">মুছুন</button></form>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form method="post" action="/admin/dns" class="admin-form" style="margin-top:14px">
        <h2>নতুন রেকর্ড</h2>
        {p.error && <div class="alert alert-error">{p.error}</div>}
        <div class="form-grid">
          <label class="field"><span>ধরন</span>
            <select name="type">{["MX", "TXT", "CNAME", "A", "AAAA"].map((t) => <option value={t} selected={v.type === t}>{t}</option>)}</select>
          </label>
          <label class="field"><span>নাম (মূল ডোমেইনের জন্য @)</span><input type="text" name="name" value={v.name ?? ""} placeholder="@ অথবা mail" required /></label>
          <label class="field"><span>মান</span><input type="text" name="content" value={v.content ?? ""} placeholder="যেমন mx.zoho.com অথবা v=spf1 ..." required /></label>
          <label class="field"><span>Priority (শুধু MX)</span><input type="number" name="priority" value={v.priority ?? "10"} min="0" max="65535" /></label>
        </div>
        <button class="btn btn-primary">যোগ করুন</button>
      </form>
    </>
  );
};

/* ---------- কুপন ---------- */
export type CouponRow = {
  id: number; code: string; type: "fixed" | "percent" | "free_delivery"; value: number; max_discount: number | null; min_order: number;
  starts_at: string | null; expires_at: string | null; usage_limit: number | null; used_count: number; once_per_phone: number; active: number;
};

const couponLabel = (c: CouponRow) =>
  c.type === "fixed" ? `${taka(c.value)} ছাড়` : c.type === "percent" ? `${bn(c.value)}% ছাড়${c.max_discount ? ` (সর্বোচ্চ ${taka(c.max_discount)})` : ""}` : "ফ্রি ডেলিভারি";

export const CouponsPage = (p: { coupons: CouponRow[]; errors?: Record<string, string>; values?: Record<string, string> }) => {
  const e = p.errors ?? {};
  const v = p.values ?? {};
  return (
    <>
      <h1>কুপন</h1>
      {p.coupons.length === 0 ? <p class="muted">এখনো কোনো কুপন নেই</p> : (
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>কোড</th><th>ছাড়</th><th>শর্ত</th><th>ব্যবহার</th><th>অবস্থা</th><th></th></tr></thead>
            <tbody>
              {p.coupons.map((c) => (
                <tr class={c.active ? "" : "dim"}>
                  <td><code class="coupon-code">{c.code}</code></td>
                  <td>{couponLabel(c)}</td>
                  <td><small>
                    {c.min_order > 0 && <>কমপক্ষে {taka(c.min_order)}<br /></>}
                    {c.expires_at && <>মেয়াদ: {dhakaTime(c.expires_at)}<br /></>}
                    {c.once_per_phone ? "এক নম্বরে একবার" : "এক নম্বরে বারবার"}
                  </small></td>
                  <td>{bn(c.used_count)}{c.usage_limit != null ? ` / ${bn(c.usage_limit)}` : ""}</td>
                  <td>{c.active ? <span class="pill pill-ok">চালু</span> : <span class="pill pill-bad">বন্ধ</span>}</td>
                  <td class="nowrap">
                    <form method="post" action={`/admin/coupons/${c.id}/toggle`} class="inline"><button class="btn-link">{c.active ? "বন্ধ করুন" : "চালু করুন"}</button></form>
                    {c.used_count === 0 && <form method="post" action={`/admin/coupons/${c.id}/delete`} class="inline" data-confirm="কুপনটি মুছবেন?"><button class="btn-link danger">মুছুন</button></form>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form method="post" action="/admin/coupons" class="admin-form" style="margin-top:14px">
        <h2>নতুন কুপন</h2>
        <div class="form-grid">
          <label class="field"><span>কোড</span><input type="text" name="code" value={v.code ?? ""} placeholder="EID100" required maxlength={30} style="text-transform:uppercase" />{e.code && <small class="error">{e.code}</small>}</label>
          <label class="field"><span>ধরন</span>
            <select name="type">
              <option value="fixed" selected={v.type === "fixed" || !v.type}>টাকায় ছাড়</option>
              <option value="percent" selected={v.type === "percent"}>শতাংশে ছাড় (%)</option>
              <option value="free_delivery" selected={v.type === "free_delivery"}>ফ্রি ডেলিভারি</option>
            </select>
          </label>
          <label class="field"><span>ছাড়ের পরিমাণ (৳ বা %)</span><input type="number" name="value" min="0" value={v.value ?? ""} />{e.value && <small class="error">{e.value}</small>}</label>
          <label class="field"><span>সর্বোচ্চ ছাড় (৳, শুধু % এর জন্য, ঐচ্ছিক)</span><input type="number" name="max_discount" min="0" value={v.max_discount ?? ""} /></label>
          <label class="field"><span>সর্বনিম্ন পণ্যের দাম (৳)</span><input type="number" name="min_order" min="0" value={v.min_order ?? "0"} /></label>
          <label class="field"><span>মোট কতবার ব্যবহার করা যাবে (ফাঁকা = সীমাহীন)</span><input type="number" name="usage_limit" min="1" value={v.usage_limit ?? ""} /></label>
          <label class="field"><span>শুরু (ঐচ্ছিক)</span><input type="datetime-local" name="starts_at" value={v.starts_at ?? ""} /></label>
          <label class="field"><span>মেয়াদ শেষ (ঐচ্ছিক)</span><input type="datetime-local" name="expires_at" value={v.expires_at ?? ""} /></label>
        </div>
        <label class="small-check"><input type="checkbox" name="once_per_phone" value="1" checked={v.once_per_phone !== "0"} /> এক মোবাইল নম্বরে একবারই ব্যবহার করা যাবে</label>
        <button class="btn btn-primary">কুপন বানান</button>
        <p class="muted">সময় বাংলাদেশ সময় অনুযায়ী।</p>
      </form>
    </>
  );
};

/* ---------- ল্যান্ডিং পেজ বিল্ডার ---------- */
export type LandingRow = { id: number; name: string; slug: string; price: number; image: string | null; is_active: number; updated_at: string | null };

/** ল্যান্ডিং পেজের তালিকা */
export const LandingListPage = ({ rows }: { rows: LandingRow[] }) => (
  <>
    <PageHead title="ল্যান্ডিং পেজ"
      desc="রেডিমেড টেমপ্লেট বেছে নিন, তারপর কোন পণ্যের পেজ হবে সেটা ঠিক করুন। দাম, ছবি আর ভ্যারিয়েন্ট সবসময় পণ্য থেকেই আসে।"
      actions={<a href="/admin/landing/new" class="btn btn-primary"><Icon name="plus" size="sm" /> নতুন ল্যান্ডিং পেজ</a>} />
    {rows.length === 0 ? (
      <div class="sa-card"><EmptyState icon="layout-template" title="এখনো কোনো ল্যান্ডিং পেজ নেই"
        text="একটা টেমপ্লেট বেছে নিন — কয়েক মিনিটে বিজ্ঞাপনের জন্য পেজ তৈরি।"
        action={<a href="/admin/landing/new" class="btn btn-primary">টেমপ্লেট বেছে নিন</a>} /></div>
    ) : (
      <table class="table">
        <thead><tr><th>পণ্য</th><th>দাম</th><th></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr>
            <td><div class="lp-row-prod">{r.image && <img src={imageUrl(r.image)} alt="" width="40" height="40" />}<span><strong>{r.name}</strong>{!r.is_active && <span class="pill">বন্ধ</span>}<br /><small class="muted">/p/{r.slug}</small></span></div></td>
            <td>{taka(r.price)}</td>
            <td class="right nowrap">
              <a href={`/admin/products/${r.id}/landing`} class="btn btn-outline btn-sm">এডিট</a>{" "}
              <a href={`/p/${r.slug}`} target="_blank" class="btn-link">দেখুন ↗</a>
            </td>
          </tr>
        ))}</tbody>
      </table>
    )}
  </>
);

type TplCard = { ref: string; name: string; category?: string; description?: string | null; blocks: { type: string; bg: string; fg: string; btn: string }[]; deleteUrl?: string };

const TplThumb = ({ blocks }: { blocks: TplCard["blocks"] }) => (
  <div class="tpl-thumb" aria-hidden="true">
    {blocks.map((b) => (
      <div class={`tpl-b tpl-b-${b.type}`} style={`background:${b.bg};color:${b.fg}`}>
        {b.type === "hero" ? <><i class="tpl-line w70" /><i class="tpl-line w40" /><i class="tpl-btn" style={`background:${b.btn}`} /></>
          : b.type === "gallery" ? <i class="tpl-img" />
          : b.type === "order_form" ? <><i class="tpl-input" /><i class="tpl-input" /><i class="tpl-btn" style={`background:${b.btn}`} /></>
          : <><i class="tpl-line w60" /><i class="tpl-line w80" /></>}
      </div>
    ))}
  </div>
);

/** টেমপ্লেট গ্যালারি: টেমপ্লেট + পণ্য বাছাই */
export const TemplateGalleryPage = (p: { tab: "sellx" | "mine"; cards: TplCard[]; products: { id: number; name: string; has: boolean }[]; productId: number; mineCount: number }) => {
  const cats = [...new Set(p.cards.map((c) => c.category).filter(Boolean))] as string[];
  return (
    <>
      <p><a href="/admin/landing">← ল্যান্ডিং পেজ</a></p>
      <h1>টেমপ্লেট বেছে নিন</h1>
      <div class="tabs">
        <a href={`/admin/landing/new?tab=sellx${p.productId ? `&product=${p.productId}` : ""}`} class={p.tab === "sellx" ? "tab active" : "tab"}>SellxBD টেমপ্লেট</a>
        <a href={`/admin/landing/new?tab=mine${p.productId ? `&product=${p.productId}` : ""}`} class={p.tab === "mine" ? "tab active" : "tab"}>আমার টেমপ্লেট <span class="tab-count">{bn(p.mineCount)}</span></a>
      </div>
      {p.products.length === 0 ? (
        <div class="alert alert-error">আগে একটা পণ্য যোগ করুন, তারপর ল্যান্ডিং পেজ বানান। <a href="/admin/products/new">পণ্য যোগ করুন</a></div>
      ) : p.cards.length === 0 ? (
        <div class="empty-box"><p>{p.tab === "mine" ? "এখনো কোনো টেমপ্লেট সেভ করেননি। এডিটরে \"টেমপ্লেট হিসেবে রাখুন\" চাপলে এখানে আসবে।" : "এখনো কোনো টেমপ্লেট নেই।"}</p></div>
      ) : (
        <>
          {cats.length > 1 && (
            <div class="tpl-filter" id="tpl-filter">
              <button type="button" class="chip active" data-cat="">সব</button>
              {cats.map((c) => <button type="button" class="chip" data-cat={c}>{c}</button>)}
            </div>
          )}
          <div class="tpl-grid">
            {p.cards.map((t) => (
              <div class="tpl-card" data-cat={t.category ?? ""}>
                <TplThumb blocks={t.blocks} />
                <div class="tpl-info">
                  <strong>{t.name}</strong>
                  {t.category && <span class="pill">{t.category}</span>}
                  {t.description && <p class="muted small">{t.description}</p>}
                </div>
                <form method="post" action="/admin/landing/new" class="tpl-use">
                  <input type="hidden" name="template" value={t.ref} />
                  <label class="field"><span>কোন পণ্যের পেজ?</span>
                    <select name="product_id" required>
                      <option value="">— পণ্য বাছাই করুন —</option>
                      {p.products.map((x) => <option value={String(x.id)} selected={x.id === p.productId}>{x.name}{x.has ? " (আগের পেজ বদলে যাবে)" : ""}</option>)}
                    </select>
                  </label>
                  <button class="btn btn-primary btn-block">এই টেমপ্লেট নিন</button>
                </form>
                {t.deleteUrl && (
                  <form method="post" action={t.deleteUrl} data-confirm={`"${t.name}" টেমপ্লেটটি মুছবেন? (যেসব পেজ বানানো হয়ে গেছে সেগুলো থাকবে)`}>
                    <button class="btn-link danger small">মুছুন</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <script src={`/js/builder.js?v=${ASSET_VERSION}`} defer></script>
    </>
  );
};

/** লাইভ এডিটর */
export const LandingBuilderPage = (p: { product: Product; landingJson: string; labels: Record<string, string>; custom: boolean; products: { id: number; name: string; has: boolean }[]; fonts: Record<string, string>; ai?: { canUndo: boolean; about: string } }) => (
  <>
    <div class="lb-top">
      <a href="/admin/landing" class="btn-link">← ল্যান্ডিং পেজ</a>
      <h1>ল্যান্ডিং পেজ এডিটর</h1>
      <form method="post" action={`/admin/products/${p.product.id}/landing/move`} class="lb-product" id="move-form"
        data-msg="এই ডিজাইনটা বাছাই করা পণ্যে সরে যাবে (এখনকার পরিবর্তনসহ)। ওই পণ্যে আগের কোনো পেজ থাকলে সেটা বদলে যাবে। চালিয়ে যাবেন?">
        <input type="hidden" name="landing_json" />
        <label>পণ্য:
          <select name="to" id="lb-product">
            {p.products.map((x) => <option value={String(x.id)} selected={x.id === p.product.id}>{x.name}{x.has && x.id !== p.product.id ? " (পেজ আছে)" : ""}</option>)}
          </select>
        </label>
        <button class="btn btn-outline btn-sm" id="lb-move" hidden>বদলান</button>
      </form>
    </div>
    {p.ai && (
      <details class="sa-card ai-box" open={!p.custom}>
        <summary><Icon name="sparkles" size="sm" /> <b>AI দিয়ে লেখা বানান</b> <small class="muted">— পণ্য সম্পর্কে ২–৩ লাইন দিন, শিরোনাম, সুবিধা, তুলনা, প্রশ্নোত্তর বাংলায় তৈরি হয়ে যাবে</small></summary>
        <form method="post" action={`/admin/products/${p.product.id}/landing/ai`} class="ai-form" data-ai-form>
          <label class="field"><span>পণ্য সম্পর্কে আপনার কথা</span>
            <textarea name="about" rows={3} maxlength={600} required minlength={10} placeholder="যেমন: সেগুন কাঠের হাতে বানানো ওয়াল শেলফ, ৩টা তাক, বই আর গাছ রাখার জন্য। পালিশ করা, পানিতে নষ্ট হয় না।">{p.ai.about}</textarea>
          </label>
          <div class="ai-row">
            <label class="field"><span>লেখার ধরন</span><select name="tone"><option value="friendly">সহজ ও আন্তরিক</option><option value="premium">প্রিমিয়াম</option><option value="urgent">অফার/জরুরি</option></select></label>
            <button class="btn btn-primary" data-ai-submit><Icon name="sparkles" size="sm" /> লেখা বানান</button>
          </div>
          <p class="muted small">ছবি, ভিডিও, অর্ডার ফর্ম আর ডিজাইন যেমন আছে থাকবে — শুধু লেখার অংশ বদলাবে। AI ভুল করতে পারে, পাবলিশের আগে পড়ে নিন। দিনে ১০ বার পর্যন্ত।</p>
        </form>
        {p.ai.canUndo && <form method="post" action={`/admin/products/${p.product.id}/landing/ai-undo`} data-confirm="AI-এর আগের লেখায় ফিরবেন? এর পরের পরিবর্তনগুলো মুছে যাবে।"><button class="btn-link">↶ আগের লেখায় ফিরুন</button></form>}
      </details>
    )}
    <p class="muted small lb-hint">প্রিভিউতে যেকোনো সেকশনে ক্লিক করুন — পাশে সেটার এডিট খুলে যাবে। দাম, ছবি আর ভ্যারিয়েন্ট বদলাতে <a href={`/admin/products/${p.product.id}/edit`}>পণ্য এডিট</a> করুন।</p>
    <div id="builder" class="lb" data-landing={p.landingJson} data-labels={JSON.stringify(p.labels)} data-fonts={JSON.stringify(p.fonts)}
      data-preview={`/admin/products/${p.product.id}/landing/preview`} data-template={`/admin/products/${p.product.id}/landing/save-template`}>
      <aside class="lb-panel" id="lb-panel">
        <div class="lb-panel-head"><strong>এডিট</strong><button type="button" class="btn-link" id="lb-close"><Icon name="x" size="sm" /> বন্ধ</button></div>
        <div id="page-style"></div>
        <div id="sections"></div>
        <div class="b-add">
          <select id="new-type">
            {SECTION_GROUPS.map((g) => (
              <optgroup label={g.label}>{g.items.map((it) => <option value={it.value}>{it.label}</option>)}</optgroup>
            ))}
          </select>
          <button type="button" class="btn btn-outline" id="add-section">+ সেকশন</button>
        </div>
      </aside>
      <div class="lb-preview">
        <div class="lb-devices">
          <button type="button" class="chip active" data-device="mobile">মোবাইল</button>
          <button type="button" class="chip" data-device="desktop">ডেস্কটপ</button>
          <span class="lb-undo">
            <button type="button" class="chip" id="lb-undo" title="আগের অবস্থায় (Ctrl+Z)" disabled>↶ আগের</button>
            <button type="button" class="chip" id="lb-redo" title="আবার (Ctrl+Y)" disabled>↷ পরের</button>
          </span>
          <span class="muted small" id="lb-status"></span>
        </div>
        <div class="lb-frame-wrap mobile" id="lb-frame-wrap"><iframe id="lb-frame" title="প্রিভিউ"></iframe></div>
      </div>
    </div>
    <form method="post" id="builder-form" action={`/admin/products/${p.product.id}/landing`} class="b-toolbar lb-bar">
      <input type="hidden" name="landing_json" id="landing-json" />
      <button class="btn btn-primary">সেভ করুন</button>
      <button type="button" class="btn btn-outline lb-only-mobile" id="lb-open"><Icon name="pencil" size="sm" /> এডিট</button>
      <button type="button" class="btn btn-outline" id="save-template">টেমপ্লেট হিসেবে রাখুন</button>
      <a href={`/p/${p.product.slug}`} target="_blank" class="btn-link">লাইভ পেজ ↗</a>
      <button type="button" class="btn-link" id="copy-json" title="সুপার অ্যাডমিনে নতুন টেমপ্লেট বানাতে">JSON কপি</button>
    </form>
    {p.custom && (
      <form method="post" action={`/admin/products/${p.product.id}/landing/reset`} data-confirm="বিল্ডারের সাজানো সব বাদ দিয়ে সাধারণ ল্যান্ডিং পেজে ফিরবেন?">
        <button class="btn-link danger">সাধারণ ল্যান্ডিং পেজে ফিরুন</button>
      </form>
    )}
    <script src={`/js/builder.js?v=${ASSET_VERSION}`} defer></script>
  </>
);

/* ---------- রিপোর্ট ---------- */
const BarChart = ({ days }: { days: Report["days"] }) => {
  const W = 640, H = 180, pad = 24;
  const max = Math.max(1, ...days.map((d) => d.orders));
  const bw = (W - pad * 2) / Math.max(1, days.length);
  const every = Math.ceil(days.length / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} class="chart" role="img" aria-label="দিনভিত্তিক অর্ডার">
      <line x1={pad} y1={H} x2={W - pad} y2={H} stroke="#e5e7eb" />
      {days.map((d, i) => {
        const h = Math.round((d.orders / max) * (H - 20));
        const x = pad + i * bw;
        return (
          <g>
            <rect x={x + bw * 0.15} y={H - h} width={Math.max(2, bw * 0.7)} height={h} rx="3" class="bar"><title>{`${d.date}: ${d.orders}টা অর্ডার, ৳${d.sales}`}</title></rect>
            {d.orders > 0 && bw > 18 && <text x={x + bw / 2} y={H - h - 4} text-anchor="middle" class="bar-val">{bn(d.orders)}</text>}
            {i % every === 0 && <text x={x + bw / 2} y={H + 18} text-anchor="middle" class="bar-label">{bn(d.date.slice(8, 10))}/{bn(d.date.slice(5, 7))}</text>}
          </g>
        );
      })}
    </svg>
  );
};

export const ReportsPage = ({ r }: { r: Report }) => (
  <>
    <h1>রিপোর্ট</h1>
    <div class="tabs">
      {[["today", "আজ"], ["7", "৭ দিন"], ["30", "৩০ দিন"]].map(([k, l]) => (
        <a href={`/admin/reports?range=${k}`} class={r.range.key === k ? "tab active" : "tab"}>{l}</a>
      ))}
    </div>
    <form method="get" action="/admin/reports" class="row-form">
      <input type="hidden" name="range" value="custom" />
      <input type="date" name="from" value={r.range.from} />
      <input type="date" name="to" value={r.range.to} />
      <button class="btn btn-outline">দেখুন</button>
    </form>
    <p class="muted">{r.range.label}: {bn(r.range.from.split("-").reverse().join("/"))} — {bn(r.range.to.split("-").reverse().join("/"))}</p>

    <div class="stat-grid">
      <div class="stat"><small>মোট অর্ডার</small><strong>{bn(r.total)}</strong></div>
      <div class="stat good"><small>বিক্রি (কনফার্ম + শিপড)</small><strong>{taka(r.sales)}</strong></div>
      <div class="stat"><small>কনফার্মের অপেক্ষায়</small><strong>{bn(r.byStatus.new ?? 0)}</strong><em>{taka(r.pendingValue)}</em></div>
      <div class="stat"><small>কনফার্মের হার</small><strong>{bn(r.confirmRate)}%</strong></div>
      <div class={`stat ${r.fakeRate >= 20 ? "bad" : ""}`}><small>ফেক অর্ডারের হার</small><strong>{bn(r.fakeRate)}%</strong><em>{bn(r.byStatus.fake ?? 0)}টা ফেক</em></div>
      <div class="stat"><small>গড় অর্ডার</small><strong>{taka(r.avgOrder)}</strong></div>
    </div>

    <section class="panel">
      <h2>দিনভিত্তিক অর্ডার</h2>
      <BarChart days={r.days} />
    </section>

    <div class="panels">
      <section class="panel">
        <h2>স্ট্যাটাস</h2>
        <table class="table compact"><tbody>
          {(["new", "confirmed", "shipped", "cancelled", "fake"] as OrderStatus[]).map((s) => (
            <tr><td><StatusBadge s={s} /></td><td class="right">{bn(r.byStatus[s] ?? 0)}</td></tr>
          ))}
          <tr><td>ঢাকার ভিতরে / বাইরে (বিক্রি)</td><td class="right">{bn(r.areas.inside)} / {bn(r.areas.outside)}</td></tr>
        </tbody></table>
      </section>
      <section class="panel">
        <h2>সবচেয়ে বেশি বিক্রি</h2>
        {r.topProducts.length === 0 ? <p class="muted">এই সময়ে কোনো বিক্রি নেই</p> : (
          <table class="table compact"><tbody>
            {r.topProducts.map((p, i) => <tr><td>{bn(i + 1)}. {p.name}</td><td class="right">{bn(p.count)}টা</td><td class="right">{taka(p.revenue)}</td></tr>)}
          </tbody></table>
        )}
      </section>
      <section class="panel">
        <h2>কুপন</h2>
        {r.coupons.length === 0 ? <p class="muted">এই সময়ে কোনো কুপন ব্যবহার হয়নি</p> : (
          <table class="table compact"><tbody>
            {r.coupons.map((c) => <tr><td><code>{c.code}</code></td><td class="right">{bn(c.uses)} বার</td><td class="right">-{taka(c.discount)}</td></tr>)}
          </tbody></table>
        )}
      </section>
    </div>
  </>
);

/* ---------- কুরিয়ার সেটিংস ---------- */
const Secret = ({ name, label, set }: { name: string; label: string; set: boolean }) => (
  <label class="field"><span>{label}</span>
    <input type="password" name={name} autocomplete="off" placeholder={set ? "সেভ করা আছে — বদলাতে নতুনটা দিন" : ""} />
    {set && <small><label class="inline-check"><input type="checkbox" name={`clear_${name}`} value="1" /> মুছে ফেলুন</label></small>}
  </label>
);

export const CourierPage = ({ s, active }: { s: Settings; active: CourierKey[] }) => (
  <>
    <h1>কুরিয়ার</h1>
    <p class="muted">আপনার নিজের কুরিয়ার মার্চেন্ট অ্যাকাউন্টের API তথ্য দিন। পার্সেল আপনার অ্যাকাউন্টেই বুক হবে, টাকাও আপনার অ্যাকাউন্টে আসবে।
      চালু: {active.length ? active.map((k) => COURIER_NAME[k]).join(", ") : "কোনোটা নয়"}</p>
    <form method="post" action="/admin/courier" class="admin-form">
      <h2>Steadfast {active.includes("steadfast") && <span class="pill pill-ok">চালু</span>}</h2>
      <p class="muted small">Steadfast প্যানেল → API সেকশন থেকে Api Key আর Secret Key নিন।</p>
      <div class="form-grid">
        <label class="field"><span>Api Key</span><input type="text" name="steadfast_api_key" value={s.steadfast_api_key ?? ""} autocomplete="off" /></label>
        <Secret name="steadfast_secret_key" label="Secret Key" set={!!s.steadfast_secret_key} />
      </div>

      <h2>Pathao {active.includes("pathao") && <span class="pill pill-ok">চালু</span>}</h2>
      <p class="muted small">Pathao মার্চেন্ট প্যানেল → Developer API থেকে Client ID/Secret নিন। ইউজারনেম/পাসওয়ার্ড হলো মার্চেন্ট লগইনের ইমেইল আর পাসওয়ার্ড। Store ID পাবেন প্যানেলের স্টোর তালিকায়।</p>
      <div class="form-grid">
        <label class="field"><span>Client ID</span><input type="text" name="pathao_client_id" value={s.pathao_client_id ?? ""} autocomplete="off" /></label>
        <Secret name="pathao_client_secret" label="Client Secret" set={!!s.pathao_client_secret} />
        <label class="field"><span>ইউজারনেম (ইমেইল)</span><input type="text" name="pathao_username" value={s.pathao_username ?? ""} autocomplete="off" /></label>
        <Secret name="pathao_password" label="পাসওয়ার্ড" set={!!s.pathao_password} />
        <label class="field"><span>Store ID</span><input type="text" inputmode="numeric" name="pathao_store_id" value={s.pathao_store_id ?? ""} /></label>
        <label class="field inline-check"><input type="checkbox" name="pathao_sandbox" value="1" checked={s.pathao_sandbox === "1"} /> টেস্ট (sandbox) মোড</label>
      </div>

      <h2>RedX {active.includes("redx") && <span class="pill pill-ok">চালু</span>}</h2>
      <p class="muted small">RedX মার্চেন্ট প্যানেল → Developer API থেকে Access Token নিন। পিকআপ স্টোর আইডি না দিলে ডিফল্ট স্টোর ব্যবহার হবে।</p>
      <div class="form-grid">
        <Secret name="redx_token" label="API Access Token" set={!!s.redx_token} />
        <label class="field"><span>পিকআপ স্টোর আইডি (ঐচ্ছিক)</span><input type="text" inputmode="numeric" name="redx_pickup_store_id" value={s.redx_pickup_store_id ?? ""} /></label>
        <label class="field inline-check"><input type="checkbox" name="redx_sandbox" value="1" checked={s.redx_sandbox === "1"} /> টেস্ট (sandbox) মোড</label>
      </div>
      <h2>ক্রেতার ডেলিভারি রেকর্ড</h2>
      <p class="muted small">কনফার্মের আগে অর্ডারের পেজে "কুরিয়ারে রেকর্ড খুঁজুন" চাপলে নম্বরটা আগে কতগুলো পার্সেল নিয়েছে/ফেরত দিয়েছে দেখাবে।
        Steadfast-এর চাবি থাকলে সেটা দিয়েই খোঁজে। সব কুরিয়ার (Pathao, RedX, Paperfly…) মিলিয়ে দেখতে <a href="https://bdcourier.com/" target="_blank" rel="noopener">bdcourier.com</a>-এ ফ্রি রেজিস্ট্রেশন করে API কী দিন।</p>
      <div class="form-grid">
        <Secret name="bdcourier_token" label="BD Courier API কী (ঐচ্ছিক)" set={!!s.bdcourier_token} />
      </div>
      <label class="set-check"><input type="checkbox" name="fraud_share" value="1" checked={s.fraud_share !== "0"} /> SellxBD-এর সব দোকানের মিলিত রেকর্ড দেখাবে</label>
      <p class="muted small">আপনার দোকানের ফেক/ফেরত/ডেলিভারির সংখ্যাও অন্যরা দেখবে। নম্বর গোপন কোডে থাকে, দোকানের নাম কেউ দেখে না। বন্ধ করলে আপনিও অন্যদেরটা দেখবেন না।</p>
      <button class="btn btn-primary">সেভ করুন</button>
    </form>
  </>
);

/* ---------- SMS ---------- */
export type SmsLogRow = { id: number; order_id: number | null; order_no?: string | null; event: string; phone: string; message: string; status: string; response: string | null; created_at: string };
const SMS_EVENT: Record<string, string> = { confirmed: "কনফার্ম", shipped: "শিপড", test: "টেস্ট" };
const SMS_STATUS: Record<string, [string, string]> = { sent: ["গেছে", "pill-ok"], failed: ["যায়নি", "pill-bad"], sending: ["পাঠানো হচ্ছে", ""] };

export const SmsLogTable = ({ logs, compact }: { logs: SmsLogRow[]; compact?: boolean }) => (
  <div class="table-wrap">
    <table class="table compact">
      <tbody>
        {logs.map((l) => {
          const [label, cls] = SMS_STATUS[l.status] ?? [l.status, ""];
          return (
            <tr>
              <td><small>{dhakaTime(l.created_at)}</small><br /><small class="muted">{SMS_EVENT[l.event] ?? l.event}</small></td>
              {!compact && <td>{l.order_id ? <a href={`/admin/orders/${l.order_id}`}>{l.order_no ?? `#${l.order_id}`}</a> : "—"}<br /><small>{l.phone}</small></td>}
              <td class="break"><small>{l.message}</small></td>
              <td>
                <span class={`pill ${cls}`}>{label}</span>
                {l.status === "failed" && l.response && <details><summary>কারণ</summary><pre class="pre">{l.response}</pre></details>}
                {l.status === "failed" && <form method="post" action={`/admin/orders/sms/${l.id}/resend`}><button class="btn-link">আবার পাঠান</button></form>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const SmsPage = ({ s, logs, sent30, failed30 }: { s: Settings; logs: SmsLogRow[]; sent30: number; failed30: number }) => {
  const provider = (s.sms_provider || "bulksmsbd") as keyof typeof SMS_PROVIDERS;
  return (
    <>
      <h1>SMS</h1>
      <p class="muted">আপনার নিজের SMS গেটওয়ের অ্যাকাউন্ট দিয়ে কাস্টমারকে SMS যাবে — খরচ গেটওয়েতেই। গত ৩০ দিনে: {sent30}টা গেছে, {failed30}টা যায়নি।</p>
      <form method="post" action="/admin/sms" class="admin-form" data-sms-form>
        <label class="field inline-check"><input type="checkbox" name="sms_enabled" value="1" checked={s.sms_enabled === "1"} /> <strong>SMS চালু</strong></label>
        <h2>গেটওয়ে</h2>
        <div class="form-grid">
          <label class="field"><span>গেটওয়ে</span>
            <select name="sms_provider" data-sms-provider>
              {Object.entries(SMS_PROVIDERS).map(([k, v]) => <option value={k} selected={provider === k}>{v.name}</option>)}
            </select>
          </label>
        </div>
        {Object.entries(SMS_PROVIDERS).map(([k, v]) => <p class="muted small" data-sms-for={k} hidden={provider !== k}>{v.help}</p>)}
        <div class="form-grid" data-sms-for="bulksmsbd smsnetbd" hidden={provider === "custom"}>
          <label class="field"><span>API Key</span>
            <input type="password" name="sms_api_key" autocomplete="off" placeholder={s.sms_api_key ? "সেভ করা আছে — বদলাতে নতুনটা দিন" : ""} />
            {s.sms_api_key && <small><label class="inline-check"><input type="checkbox" name="clear_sms_api_key" value="1" /> মুছে ফেলুন</label></small>}
          </label>
          <label class="field"><span>Sender ID</span><input type="text" name="sms_sender_id" value={s.sms_sender_id ?? ""} /></label>
        </div>
        <div data-sms-for="custom" hidden={provider !== "custom"}>
          <label class="field"><span>API URL ({"{number}"} = নম্বর 8801..., {"{message}"} = মেসেজ)</span>
            <input type="text" name="sms_custom_url" value={s.sms_custom_url ?? ""} placeholder="https://gateway.com/api/send?key=XXXX&to={number}&text={message}" />
          </label>
          <div class="form-grid">
            <label class="field"><span>পদ্ধতি</span>
              <select name="sms_custom_method">
                <option value="GET" selected={s.sms_custom_method !== "POST"}>GET</option>
                <option value="POST" selected={s.sms_custom_method === "POST"}>POST</option>
              </select>
            </label>
            <label class="field"><span>সফল হলে রেসপন্সে যে লেখা থাকে (ঐচ্ছিক)</span><input type="text" name="sms_custom_success" value={s.sms_custom_success ?? ""} placeholder="success" /></label>
          </div>
          <label class="field"><span>POST বডি (ঐচ্ছিক; JSON হলে {"{"} দিয়ে শুরু)</span>
            <textarea name="sms_custom_body" rows={3} placeholder={'{"to":"{number}","message":"{message}"}'}>{s.sms_custom_body ?? ""}</textarea>
          </label>
        </div>

        <h2>কখন SMS যাবে</h2>
        <p class="muted small">টেমপ্লেটে লিখতে পারেন: {(getLang() === "en" ? SMS_PLACEHOLDERS_EN : SMS_PLACEHOLDERS).join(" ")}। বাংলা SMS-এ ৭০ অক্ষরে এক SMS ধরা হয়, তাই ছোট রাখলে খরচ কম।</p>
        <label class="field inline-check"><input type="checkbox" name="sms_on_confirm" value="1" checked={s.sms_on_confirm === "1"} /> অর্ডার কনফার্ম হলে</label>
        <label class="field"><textarea name="sms_tpl_confirmed" rows={3} maxlength={600}>{s.sms_tpl_confirmed ?? ""}</textarea></label>
        <label class="field inline-check"><input type="checkbox" name="sms_on_shipped" value="1" checked={s.sms_on_shipped === "1"} /> কুরিয়ারে পাঠানো/শিপড হলে (ট্র্যাকিংসহ)</label>
        <label class="field"><textarea name="sms_tpl_shipped" rows={3} maxlength={600}>{s.sms_tpl_shipped ?? ""}</textarea></label>
        <button class="btn btn-primary">সেভ করুন</button>
      </form>

      <section class="panel">
        <h2>টেস্ট SMS</h2>
        <form method="post" action="/admin/sms/test" class="search">
          <input type="tel" name="phone" placeholder="01XXXXXXXXX" required />
          <button class="btn btn-outline">টেস্ট SMS পাঠান</button>
        </form>
        <p class="muted small">আগে সেভ করুন, তারপর টেস্ট করুন।</p>
      </section>

      <section class="panel">
        <h2>SMS লগ (শেষ ১০০টা)</h2>
        {logs.length ? <SmsLogTable logs={logs} /> : <p class="muted">এখনো কোনো SMS যায়নি</p>}
      </section>
    </>
  );
};

/** একসাথে অনেক ছবি — ফাইলের নাম দিয়ে পণ্যের সাথে মেলানো */
export const BulkImagesPage = (p: { missing: { name: string; slug: string }[]; total: number; result?: { matched: string[]; unmatched: string[]; errors: string[] } }) => (
  <section>
    <div class="detail-head"><h1>একসাথে ছবি আপলোড</h1><a href="/admin/products" class="btn">← পণ্য</a></div>
    {p.result && (
      <div class="card">
        <p><b>{bn(p.result.matched.length)}টা ছবি বসেছে।</b></p>
        {p.result.unmatched.length > 0 && <p>মেলেনি (নাম ঠিক করে আবার দিন): {p.result.unmatched.join(", ")}</p>}
        {p.result.errors.length > 0 && <p class="error">{p.result.errors.join(" · ")}</p>}
      </div>
    )}
    <form method="post" enctype="multipart/form-data" class="card">
      <p>ফাইলের নাম হবে পণ্যের <b>slug</b>-এর মতো, যেমন <code>sutokotha-01.jpg</code>। ব্যানারের জন্য নামের শেষে <code>-banner-1</code>, <code>-banner-2</code>, <code>-banner-3</code>, লোগোর জন্য <code>-logo</code>।</p>
      <p>JPG, PNG বা WebP; প্রতিটা ৩ MB-এর কম; একবারে ৩০টা পর্যন্ত। আগের ছবি থাকলে নতুনটা বসবে।</p>
      <input type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple required />
      <p><button class="btn btn-primary">আপলোড করুন</button></p>
    </form>
    <div class="card">
      <h3>ছবি নেই এমন পণ্য ({bn(p.missing.length)} / {bn(p.total)})</h3>
      {p.missing.length ? <ul>{p.missing.slice(0, 200).map((m) => <li><code>{m.slug}</code> — {m.name}</li>)}</ul> : <p>সব পণ্যের ছবি আছে ✓</p>}
    </div>
  </section>
);
