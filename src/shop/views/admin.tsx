import { COURIER_NAME, type CourierKey } from "../lib/courier";
import type { Child } from "hono/jsx";
import type { Order, OrderItem, OrderStatus } from "../lib/orders";
import { AREA_LABEL, STATUS_LABEL } from "../lib/orders";
import { parseOptions, type Category, type Product, type Variant } from "../lib/products";
import { THEMES, type Settings } from "../lib/settings";
import { TRANSITIONS } from "../lib/order-status";
import { dhakaTime, imageUrl, taka } from "../lib/format";
import { ASSET_VERSION } from "./layout";
import type { ShopState } from "../../platform/billing";
import type { Report } from "../lib/reports";
import { canAccess, ROLE_LABEL, type Role } from "../lib/auth";
import { bn } from "../lib/format";

export type Flash = { type: "ok" | "error"; text: string } | null;

/* ---------- লেআউট ---------- */
/** ট্রায়াল / কম ব্যালেন্স / অর্ডার বন্ধ — ড্যাশবোর্ডের উপরে */
export const StateBanner = ({ state }: { state?: ShopState }) => {
  if (!state) return null;
  switch (state.reason) {
    case "trial":
      return <div class="banner banner-info">🎁 ফ্রি ট্রায়াল চলছে: {dhakaTime(state.trial_ends_at).split(",")[0]} পর্যন্ত অথবা আরও {bn(state.trial_orders_left)}টা কনফার্ম অর্ডার। <a href="/admin/billing">বিস্তারিত</a></div>;
    case "low_balance":
      return <div class="banner banner-warn">⚠️ ব্যালেন্স {taka(state.balance)}। {dhakaTime(state.grace_ends_at)} এর মধ্যে রিচার্জ না করলে দোকানে নতুন অর্ডার নেওয়া বন্ধ হবে। <a href="/admin/billing">রিচার্জ করুন</a></div>;
    case "blocked_balance":
      return <div class="banner banner-bad">⛔ ব্যালেন্স {taka(state.balance)} — দোকানে নতুন অর্ডার নেওয়া বন্ধ আছে। রিচার্জ করলে সাথে সাথে চালু হবে। <a href="/admin/billing">রিচার্জ করুন</a></div>;
    case "suspended":
      return <div class="banner banner-bad">⛔ দোকানটি সাময়িকভাবে স্থগিত করা হয়েছে। বিস্তারিত জানতে যোগাযোগ করুন।</div>;
    default:
      return null;
  }
};

export const AdminLayout = (p: { title: string; settings: Settings; active?: string; flash?: Flash; email?: string; role?: Role; state?: ShopState; children?: Child }) => (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{p.title} — অ্যাডমিন</title>
      <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/admin.css?v=${ASSET_VERSION}`} />
    </head>
    <body class="admin">
      {p.email && (
        <header class="admin-header">
          <div class="wrap admin-header-inner">
            <a href="/admin/orders" class="logo">{p.settings.site_name || "F-Shop"} অ্যাডমিন</a>
            <nav class="admin-nav">
              {[
                ["orders", "/admin/orders", "অর্ডার"],
                ["reports", "/admin/reports", "রিপোর্ট"],
                ["products", "/admin/products", "পণ্য"],
                ["categories", "/admin/categories", "ক্যাটাগরি"],
                ["blacklist", "/admin/blacklist", "ব্ল্যাকলিস্ট"],
                ["coupons", "/admin/coupons", "কুপন"],
                ["settings", "/admin/settings", "সেটিংস"],
                ["courier", "/admin/courier", "কুরিয়ার"],
                ["billing", "/admin/billing", "বিলিং"],
                ["staff", "/admin/staff", "স্টাফ"],
                ["domains", "/admin/domain", "ডোমেইন"],
              ].filter(([k]) => canAccess(p.role ?? "owner", k!)).map(([k, href, label]) => (
                <a href={href} class={p.active === k ? "active" : ""}>{label}</a>
              ))}
              <a href="/" target="_blank">সাইট ↗</a>
              <form method="post" action="/admin/logout" class="inline"><button class="btn-link">লগআউট</button></form>
            </nav>
          </div>
        </header>
      )}
      {p.email && <StateBanner state={p.state} />}
      <main class="wrap admin-main">
        {p.flash && <div class={`alert ${p.flash.type === "ok" ? "alert-ok" : "alert-error"}`}>{p.flash.text}</div>}
        {p.children}
      </main>
      <script src={`/js/admin.js?v=${ASSET_VERSION}`} defer></script>
    </body>
  </html>
);

/* ---------- লগইন ---------- */
export const LoginPage = ({ error, email }: { error?: string; email?: string }) => (
  <div class="login-box">
    <h1>অ্যাডমিন লগইন</h1>
    {error && <div class="alert alert-error">{error}</div>}
    <form method="post" action="/admin/login" class="order-form">
      <label class="field"><span>ইমেইল</span><input type="email" name="email" value={email ?? ""} required autocomplete="username" /></label>
      <label class="field"><span>পাসওয়ার্ড</span><input type="password" name="password" required autocomplete="current-password" /></label>
      <button class="btn btn-primary btn-block">লগইন</button>
    </form>
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

export const OrdersPage = (p: {
  orders: (Order & { item_count: number })[];
  counts: Record<string, number>;
  status: OrderStatus;
  q: string;
  page: number;
  hasMore: boolean;
  couriers?: CourierKey[];
}) => {
  const bulk = !p.q && p.status === "confirmed" && (p.couriers ?? []).some((k) => k !== "redx") && p.orders.length > 0;
  return (
  <>
    <div class="tabs">
      {STATUS_TABS.map((s) => (
        <a href={`/admin/orders?status=${s}`} class={!p.q && p.status === s ? "tab active" : "tab"}>
          {STATUS_LABEL[s]} <span class="tab-count">{p.counts[s] ?? 0}</span>
        </a>
      ))}
    </div>
    <form method="get" action="/admin/orders" class="search">
      <input type="search" name="q" value={p.q} placeholder="নম্বর / নাম / অর্ডার নং দিয়ে খুঁজুন" />
      <button class="btn btn-outline">খুঁজুন</button>
      {p.q && <a href="/admin/orders" class="btn-link">মুছুন</a>}
    </form>
    {p.q && <p class="muted">"{p.q}" — সব স্ট্যাটাসে খোঁজা হয়েছে</p>}
    {p.orders.length === 0 ? (
      <p class="empty">কোনো অর্ডার নেই</p>
    ) : (
      <form method="post" action="/admin/orders/bulk-courier" id="bulk-form">
      {bulk && (
        <div class="bulk-bar">
          <label class="inline-check"><input type="checkbox" data-check-all /> সব বাছুন</label>
          <select name="courier">
            {(p.couriers ?? []).filter((k) => k !== "redx").map((k) => <option value={k}>{COURIER_NAME[k]}</option>)}
          </select>
          <button class="btn btn-primary" data-confirm="বাছাই করা অর্ডারগুলো কুরিয়ারে পাঠাবেন?">বাছাই করা অর্ডার কুরিয়ারে পাঠান</button>
        </div>
      )}
      <div class="table-wrap">
        <table class="table">
          <thead><tr>{bulk && <th></th>}<th>অর্ডার</th><th>কাস্টমার</th><th>মোট</th><th>স্ট্যাটাস</th><th>সময়</th></tr></thead>
          <tbody>
            {p.orders.map((o) => (
              <tr>
                {bulk && <td><input type="checkbox" name="ids" value={String(o.id)} aria-label={o.order_no} /></td>}
                <td><a href={`/admin/orders/${o.id}`}><strong>{o.order_no}</strong></a><br /><small class="muted">{o.item_count}টা পণ্য</small></td>
                <td>{o.name}<br /><a href={`tel:${o.phone}`}>{o.phone}</a></td>
                <td>{taka(o.total)}<br /><small class="muted">{AREA_LABEL[o.area]}</small></td>
                <td><StatusBadge s={o.status} /> <PurchaseBadge o={o} />
                  {o.consignment_id && <><br /><small class="muted">{COURIER_NAME[o.courier as CourierKey] ?? o.courier}: {o.tracking_code || o.consignment_id}{o.courier_status ? ` · ${o.courier_status}` : ""}</small></>}
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
      {p.page > 1 && <a class="btn btn-outline" href={`?status=${p.status}&q=${encodeURIComponent(p.q)}&page=${p.page - 1}`}>← আগের</a>}
      {p.hasMore && <a class="btn btn-outline" href={`?status=${p.status}&q=${encodeURIComponent(p.q)}&page=${p.page + 1}`}>পরের →</a>}
    </div>
  </>
  );
};

/* ---------- অর্ডার ডিটেইল ---------- */
const ACTION_LABEL: Record<OrderStatus, string> = {
  new: "নতুন",
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
          <label class="field"><span>ক্যাশ কালেকশন (৳)</span><input type="number" name="cod" min="0" value={String(o.total)} /></label>
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

export const OrderDetailPage = (p: { order: Order; items: OrderItem[]; history: Order[]; blocked: { phone: boolean; device: boolean }; couriers?: CourierKey[] }) => {
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
            data-confirm={to === "cancelled" || to === "fake" ? "এই অর্ডারের নম্বর ও ডিভাইস স্থায়ীভাবে ব্লক হবে, নিশ্চিত?" : undefined}>
            <input type="hidden" name="status" value={to} />
            <button class={`btn ${to === "confirmed" ? "btn-primary" : to === "cancelled" || to === "fake" ? "btn-danger" : "btn-outline"}`}>{ACTION_LABEL[to]}</button>
          </form>
        ))}
        {TRANSITIONS[o.status].length === 0 && <span class="muted">এই অর্ডারের স্ট্যাটাস আর বদলানো যাবে না।</span>}
      </div>

      <div class="panels">
        <section class="panel">
          <h2>কাস্টমার</h2>
          <dl class="kv">
            <dt>নাম</dt><dd>{o.name}</dd>
            <dt>মোবাইল</dt><dd><a href={`tel:${o.phone}`}>{o.phone}</a> {p.blocked.phone && <span class="pill pill-bad">ব্লক</span>}</dd>
            <dt>ঠিকানা</dt><dd>{o.address}</dd>
            <dt>এলাকা</dt><dd>{AREA_LABEL[o.area]}</dd>
            {o.note && <><dt>নোট</dt><dd>{o.note}</dd></>}
          </dl>
        </section>

        <section class="panel">
          <h2>পণ্য</h2>
          <table class="table compact">
            <tbody>
              {p.items.map((i) => <tr><td>{i.product_name}{i.variant_label ? <strong> ({i.variant_label})</strong> : ""} × ১</td><td class="right">{taka(i.price)}</td></tr>)}
              <tr><td>ডেলিভারি চার্জ</td><td class="right">{taka(o.delivery_charge)}</td></tr>
              {o.discount > 0 && <tr><td>কুপন ছাড় ({o.coupon_code})</td><td class="right">-{taka(o.discount)}</td></tr>}
              <tr class="total"><td>মোট</td><td class="right">{taka(o.total)}</td></tr>
            </tbody>
          </table>
        </section>

        {(o.status === "confirmed" || o.consignment_id) && <CourierPanel o={o} couriers={p.couriers ?? []} />}

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
    <div class="detail-head"><h1>পণ্য</h1><a href="/admin/products/new" class="btn btn-primary">+ নতুন পণ্য</a></div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th></th><th>নাম</th><th>দাম</th><th>ক্যাটাগরি</th><th>অবস্থা</th><th></th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr class={p.is_active ? "" : "dim"}>
              <td><img src={imageUrl(p.image)} width="48" height="48" class="thumb" alt="" /></td>
              <td><strong>{p.name}</strong><br /><a href={`/p/${p.slug}`} target="_blank"><small>/p/{p.slug}</small></a></td>
              <td>{taka(p.price)}{p.compare_price ? <><br /><del class="muted">{taka(p.compare_price)}</del></> : null}</td>
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
      <p><a href="/admin/products">← পণ্য তালিকা</a></p>
      <h1>{isEdit ? "পণ্য এডিট" : "নতুন পণ্য"} {isEdit && <a href={`/admin/products/${v.id}/landing`} class="btn btn-outline btn-sm">ল্যান্ডিং পেজ বিল্ডার →</a>}</h1>
      <form method="post" action={isEdit ? `/admin/products/${v.id}` : "/admin/products"} enctype="multipart/form-data" class="admin-form">
        <div class="form-grid">
          <label class="field"><span>নাম *</span><input type="text" name="name" value={v.name ?? ""} required />{e.name && <small class="error">{e.name}</small>}</label>
          <label class="field"><span>slug (লিংক: /p/slug)</span><input type="text" name="slug" value={v.slug ?? ""} placeholder="ফাঁকা রাখলে নিজে বানাবে" pattern="[a-z0-9-]*" />{e.slug && <small class="error">{e.slug}</small>}</label>
          <label class="field"><span>ক্যাটাগরি</span>
            <select name="category_id">
              <option value="">— নেই —</option>
              {p.categories.map((c) => <option value={String(c.id)} selected={v.category_id === c.id}>{c.name}</option>)}
            </select>
          </label>
          <label class="field"><span>দাম (৳) *</span><input type="number" name="price" min="0" value={v.price != null ? String(v.price) : ""} required />{e.price && <small class="error">{e.price}</small>}</label>
          <label class="field"><span>কাটা দাম (৳)</span><input type="number" name="compare_price" min="0" value={v.compare_price != null ? String(v.compare_price) : ""} /></label>
          <label class="field"><span>ক্রম (ছোট সংখ্যা আগে)</span><input type="number" name="sort_order" value={String(v.sort_order ?? 0)} /></label>
        </div>
        <label class="field"><span>ছবি {v.image && "(নতুন দিলে পুরনোটা বদলাবে)"}</span>
          {v.image && <img src={imageUrl(v.image)} width="120" class="thumb" alt="" />}
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" />
          {e.image && <small class="error">{e.image}</small>}
        </label>
        <label class="field"><span>ল্যান্ডিং পেজের শিরোনাম</span><input type="text" name="headline" value={v.headline ?? ""} placeholder="ফাঁকা রাখলে পণ্যের নাম" /></label>
        <label class="field"><span>ছোট বর্ণনা</span><textarea name="short_desc" rows={2}>{v.short_desc ?? ""}</textarea></label>
        <label class="field"><span>বিস্তারিত কনটেন্ট (HTML)</span><textarea name="details_html" rows={10} class="mono">{v.details_html ?? ""}</textarea></label>
        <label class="field"><span>YouTube লিংক (ঐচ্ছিক)</span><input type="url" name="youtube_url" value={v.youtube_url ?? ""} placeholder="https://youtu.be/..." />{e.youtube_url && <small class="error">{e.youtube_url}</small>}</label>
        <h2>সাইজ/রং (ঐচ্ছিক)</h2>
        <p class="muted">যেমন অপশন: <code>সাইজ</code>, মান: <code>S, M, L, XL</code>। দুটো পর্যন্ত অপশন দেওয়া যায়। সেভ করলে সব কম্বিনেশন নিচে আসবে, সেখানে আলাদা দাম বা "স্টকে নেই" দেওয়া যাবে।</p>
        <div class="form-grid">
          {[0, 1].map((i) => (
            <>
              <label class="field"><span>অপশন {i + 1}-এর নাম</span><input type="text" name={`opt${i}_name`} value={opts[i]?.name ?? ""} placeholder={i === 0 ? "সাইজ" : "রং"} maxlength={30} /></label>
              <label class="field"><span>মান (কমা দিয়ে)</span><input type="text" name={`opt${i}_values`} value={opts[i]?.values.join(", ") ?? ""} placeholder={i === 0 ? "S, M, L, XL" : "লাল, কালো"} /></label>
            </>
          ))}
        </div>
        <div class="checks">
          <label><input type="checkbox" name="is_active" value="1" checked={v.is_active !== 0} /> চালু</label>
          <label><input type="checkbox" name="show_on_home" value="1" checked={v.show_on_home !== 0} /> হোম পেজে দেখাবে</label>
        </div>
        <button class="btn btn-primary btn-lg">সেভ করুন</button>
      </form>
      {isEdit && p.variants && p.variants.length > 0 && (
        <form method="post" action={`/admin/products/${v.id}/variants`} class="admin-form" style="margin-top:14px">
          <h2>ভ্যারিয়েন্ট ({p.variants.length})</h2>
          <p class="muted">দাম ফাঁকা রাখলে পণ্যের দাম ({taka(v.price ?? 0)}) লাগবে।</p>
          <table class="table compact">
            <thead><tr><th>ভ্যারিয়েন্ট</th><th>দাম (৳)</th><th>স্টকে আছে</th></tr></thead>
            <tbody>
              {p.variants.map((vr) => (
                <tr>
                  <td>{vr.label}</td>
                  <td><input type="number" min="0" name={`price_${vr.id}`} value={vr.price != null ? String(vr.price) : ""} class="w-sm input-sm" /></td>
                  <td><input type="checkbox" name={`active_${vr.id}`} value="1" checked={!!vr.active} /></td>
                </tr>
              ))}
            </tbody>
          </table>
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
export const SettingsPage = ({ s }: { s: Settings }) => (
  <>
    <h1>সেটিংস</h1>
    <form method="post" action="/admin/settings" class="admin-form" enctype="multipart/form-data">
      <h2>সাধারণ</h2>
      <div class="form-grid">
        <label class="field"><span>সাইটের নাম</span><input type="text" name="site_name" value={s.site_name} required /></label>
        <label class="field"><span>যোগাযোগ নম্বর</span><input type="text" name="contact_phone" value={s.contact_phone} required /></label>
        <label class="field"><span>ডেলিভারি চার্জ — ঢাকার ভিতরে (৳)</span><input type="number" min="0" name="delivery_inside" value={s.delivery_inside} required /></label>
        <label class="field"><span>ডেলিভারি চার্জ — ঢাকার বাইরে (৳)</span><input type="number" min="0" name="delivery_outside" value={s.delivery_outside} required /></label>
      </div>
      <h2>থিম</h2>
      <div class="theme-picks">
        {(Object.entries(THEMES) as [string, { name: string; desc: string }][]).map(([k, t]) => (
          <label class={`theme-pick tp-${k}`}>
            <input type="radio" name="theme" value={k} checked={(s.theme || "classic") === k} />
            <span class="tp-preview"><i></i><b></b><b></b></span>
            <strong>{t.name}</strong>
            <small>{t.desc}</small>
          </label>
        ))}
      </div>
      <h2>লোগো আর রং</h2>
      <div class="form-grid">
        <label class="field"><span>লোগো (PNG/JPG/WebP, ১ MB পর্যন্ত — ফাঁকা রাখলে আগেরটা থাকবে)</span>
          {s.logo && <img src={imageUrl(s.logo)} height="40" class="logo-preview" alt="" />}
          <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" />
          {s.logo && <label class="small-check"><input type="checkbox" name="remove_logo" value="1" /> লোগো সরান</label>}
        </label>
        <div class="field color-fields">
          <label><span>মূল রং (হেডার, দাম)</span><input type="color" name="brand_color" value={s.brand_color || "#0f766e"} /></label>
          <label><span>বাটনের রং</span><input type="color" name="accent_color" value={s.accent_color || "#ea580c"} /></label>
        </div>
      </div>
      <h2>Facebook (Pixel + Conversions API)</h2>
      <div class="form-grid">
        <label class="field"><span>Pixel ID</span><input type="text" name="fb_pixel_id" value={s.fb_pixel_id} inputmode="numeric" pattern="[0-9]*" /></label>
        <label class="field"><span>Graph API ভার্সন</span><input type="text" name="fb_graph_version" value={s.fb_graph_version} placeholder="v26.0" pattern="v[0-9]+\.[0-9]+" /></label>
        <label class="field">
          <span>CAPI Access Token {s.fb_capi_token ? "(সেট করা আছে — ফাঁকা রাখলে আগেরটাই থাকবে)" : "(সেট করা নেই)"}</span>
          <input type="password" name="fb_capi_token" value="" autocomplete="new-password" placeholder={s.fb_capi_token ? "••••••••••••" : ""} />
          {s.fb_capi_token && <label class="small-check"><input type="checkbox" name="clear_token" value="1" /> টোকেন মুছে ফেলুন</label>}
        </label>
        <label class="field"><span>Test Event Code (টেস্ট শেষে ফাঁকা করুন)</span><input type="text" name="fb_test_event_code" value={s.fb_test_event_code} placeholder="TEST12345" /></label>
      </div>
      <button class="btn btn-primary btn-lg">সেভ করুন</button>
    </form>
  </>
);


/* ---------- বিলিং ---------- */
export type LedgerRow = { id: number; type: string; amount: number; balance_after: number | null; ref: string; note: string | null; created_at: string };
export type TopupRow = { id: number; amount: number; method: string; sender: string; trx_id: string; status: string; created_at: string };
const LEDGER_LABEL: Record<string, string> = { topup: "রিচার্জ", order_fee: "অর্ডার চার্জ", monthly: "মাসিক চার্জ", trial_order: "ট্রায়াল অর্ডার", adjust: "সমন্বয়" };
const TOPUP_STATUS: Record<string, string> = { pending: "অপেক্ষায়", approved: "যোগ হয়েছে", rejected: "বাতিল" };

export const BillingPage = (p: { state: ShopState; fees: Record<string, string>; ledger: LedgerRow[]; topups: TopupRow[]; nextBill: string | null; staffCount: number; errors?: Record<string, string>; values?: Record<string, string> }) => {
  const e = p.errors ?? {};
  const v = p.values ?? {};
  const monthly = Number(p.fees.monthly_fee || 99) + p.staffCount * Number(p.fees.staff_fee || 99);
  return (
    <>
      <h1>বিলিং</h1>
      <div class="panels">
        <section class="panel">
          <h2>ব্যালেন্স</h2>
          <div class={`balance-big ${p.state.balance < 0 ? "neg" : ""}`}>{taka(p.state.balance)}</div>
          {p.state.status === "trial" ? (
            <p>ফ্রি ট্রায়াল: <strong>{dhakaTime(p.state.trial_ends_at)}</strong> পর্যন্ত অথবা আরও <strong>{bn(p.state.trial_orders_left)}</strong>টা কনফার্ম অর্ডার। এর মধ্যে কোনো চার্জ নেই।</p>
          ) : (
            <p>পরের মাসিক চার্জ: <strong>{taka(monthly)}</strong> — {dhakaTime(p.nextBill)}</p>
          )}
          <ul class="muted small-list">
            <li>প্রতি কনফার্ম অর্ডার: {taka(Number(p.fees.order_fee || 2))} (ফেক/বাতিল অর্ডারে চার্জ নেই)</li>
            <li>মাসিক সার্ভিস চার্জ: {taka(Number(p.fees.monthly_fee || 99))}</li>
            <li>প্রতিজন স্টাফ: {taka(Number(p.fees.staff_fee || 99))}/মাস {p.staffCount > 0 && `(এখন ${bn(p.staffCount)} জন)`}</li>
            <li>ব্যালেন্স মাইনাস হলে {bn(p.fees.grace_days || "3")} দিন পর নতুন অর্ডার নেওয়া বন্ধ হয়</li>
          </ul>
        </section>
        <section class="panel">
          <h2>রিচার্জ করুন</h2>
          <ol class="small-list">
            <li>bKash <strong>{p.fees.bkash_number}</strong> অথবা Nagad <strong>{p.fees.nagad_number}</strong> নম্বরে <strong>Send Money</strong> করুন</li>
            <li>নিচে টাকার পরিমাণ, আপনার নম্বর আর Transaction ID দিন</li>
            <li>যাচাই করে আমরা ব্যালেন্সে যোগ করে দেব</li>
          </ol>
          <form method="post" action="/admin/billing/topup" class="order-form">
            <div class="form-grid">
              <label class="field"><span>মাধ্যম</span>
                <select name="method"><option value="bkash" selected={v.method !== "nagad"}>bKash</option><option value="nagad" selected={v.method === "nagad"}>Nagad</option></select>
              </label>
              <label class="field"><span>টাকা (সর্বনিম্ন {taka(Number(p.fees.min_topup || 100))})</span><input type="number" name="amount" min={p.fees.min_topup || "100"} value={v.amount ?? ""} required />{e.amount && <small class="error">{e.amount}</small>}</label>
              <label class="field"><span>যে নম্বর থেকে পাঠিয়েছেন</span><input type="tel" name="sender" value={v.sender ?? ""} required />{e.sender && <small class="error">{e.sender}</small>}</label>
              <label class="field"><span>Transaction ID</span><input type="text" name="trx_id" value={v.trx_id ?? ""} required maxlength={30} />{e.trx_id && <small class="error">{e.trx_id}</small>}</label>
            </div>
            <button class="btn btn-primary">রিচার্জের অনুরোধ পাঠান</button>
          </form>
        </section>
      </div>
      {p.topups.length > 0 && (
        <section class="panel">
          <h2>রিচার্জের অনুরোধ</h2>
          <table class="table compact"><tbody>
            {p.topups.map((t) => <tr><td>{dhakaTime(t.created_at)}</td><td>{t.method === "bkash" ? "bKash" : "Nagad"} · {t.trx_id}</td><td>{taka(t.amount)}</td><td><span class={`pill ${t.status === "approved" ? "pill-ok" : t.status === "rejected" ? "pill-bad" : ""}`}>{TOPUP_STATUS[t.status]}</span></td></tr>)}
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
        প্রতিজন স্টাফের জন্য মাসে {taka(p.fee)}। {p.trial ? "ট্রায়ালের সময় স্টাফ ফ্রি, ট্রায়াল শেষে মাসিক বিলে যোগ হবে।" : `নতুন স্টাফ যোগ করলে সাথে সাথে চলতি মাসের ${taka(p.fee)} কাটবে, তারপর প্রতি মাসের বিলে যোগ হবে।`}
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
        <button class="btn btn-primary" data-confirm-fee>যোগ করুন{p.trial ? "" : ` (${taka(p.fee)}/মাস)`}</button>
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
              <p class="muted">⚠️ এই ডোমেইনে ইমেইল বা অন্য কিছু চালালে আগে <a href="/admin/dns">DNS রেকর্ড</a> পেজে রেকর্ডগুলো ঠিক আছে কি না দেখে নিন।</p>
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
export const LandingBuilderPage = (p: { product: Product; landingJson: string; labels: Record<string, string>; custom: boolean }) => (
  <>
    <p><a href={`/admin/products/${p.product.id}/edit`}>← পণ্য এডিট</a></p>
    <h1>ল্যান্ডিং পেজ: {p.product.name}</h1>
    <p class="muted">
      সেকশন সাজান, ↑↓ দিয়ে ক্রম বদলান, দরকার না হলে বন্ধ রাখুন। "প্রিভিউ" নতুন ট্যাবে দেখাবে (সেভ হবে না)।
      {" "}<a href={`/p/${p.product.slug}`} target="_blank">লাইভ পেজ ↗</a>
    </p>
    <div id="builder" data-landing={p.landingJson} data-labels={JSON.stringify(p.labels)}>
      <div id="sections"></div>
      <div class="b-add">
        <select id="new-type">
          {Object.entries(p.labels).filter(([k]) => k !== "order_form").map(([k, l]) => <option value={k}>{l}</option>)}
        </select>
        <button type="button" class="btn btn-outline" id="add-section">+ সেকশন যোগ করুন</button>
      </div>
      <form method="post" id="builder-form" action={`/admin/products/${p.product.id}/landing`}
        data-save={`/admin/products/${p.product.id}/landing`} data-preview={`/admin/products/${p.product.id}/landing/preview`} class="b-toolbar">
        <input type="hidden" name="landing_json" id="landing-json" />
        <button class="btn btn-primary">সেভ করুন</button>
        <button type="button" class="btn btn-outline" id="preview-btn">প্রিভিউ</button>
      </form>
      {p.custom && (
        <form method="post" action={`/admin/products/${p.product.id}/landing/reset`} data-confirm="বিল্ডারের সাজানো সব বাদ দিয়ে সাধারণ ল্যান্ডিং পেজে ফিরবেন?">
          <button class="btn-link danger">সাধারণ ল্যান্ডিং পেজে ফিরুন</button>
        </form>
      )}
    </div>
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
      <button class="btn btn-primary">সেভ করুন</button>
    </form>
  </>
);
