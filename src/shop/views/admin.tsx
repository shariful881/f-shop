import type { Child } from "hono/jsx";
import type { Order, OrderItem, OrderStatus } from "../lib/orders";
import { AREA_LABEL, STATUS_LABEL } from "../lib/orders";
import type { Category, Product } from "../lib/products";
import type { Settings } from "../lib/settings";
import { TRANSITIONS } from "../lib/order-status";
import { dhakaTime, imageUrl, taka } from "../lib/format";
import { ASSET_VERSION } from "./layout";
import type { ShopState } from "../../platform/billing";
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

export const AdminLayout = (p: { title: string; settings: Settings; active?: string; flash?: Flash; email?: string; state?: ShopState; children?: Child }) => (
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
                ["products", "/admin/products", "পণ্য"],
                ["categories", "/admin/categories", "ক্যাটাগরি"],
                ["blacklist", "/admin/blacklist", "ব্ল্যাকলিস্ট"],
                ["settings", "/admin/settings", "সেটিংস"],
                ["billing", "/admin/billing", "বিলিং"],
              ].map(([k, href, label]) => (
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
}) => (
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
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>অর্ডার</th><th>কাস্টমার</th><th>মোট</th><th>স্ট্যাটাস</th><th>সময়</th></tr></thead>
          <tbody>
            {p.orders.map((o) => (
              <tr>
                <td><a href={`/admin/orders/${o.id}`}><strong>{o.order_no}</strong></a><br /><small class="muted">{o.item_count}টা পণ্য</small></td>
                <td>{o.name}<br /><a href={`tel:${o.phone}`}>{o.phone}</a></td>
                <td>{taka(o.total)}<br /><small class="muted">{AREA_LABEL[o.area]}</small></td>
                <td><StatusBadge s={o.status} /> <PurchaseBadge o={o} /></td>
                <td><small>{dhakaTime(o.created_at)}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <div class="pager">
      {p.page > 1 && <a class="btn btn-outline" href={`?status=${p.status}&q=${encodeURIComponent(p.q)}&page=${p.page - 1}`}>← আগের</a>}
      {p.hasMore && <a class="btn btn-outline" href={`?status=${p.status}&q=${encodeURIComponent(p.q)}&page=${p.page + 1}`}>পরের →</a>}
    </div>
  </>
);

/* ---------- অর্ডার ডিটেইল ---------- */
const ACTION_LABEL: Record<OrderStatus, string> = {
  new: "নতুন",
  confirmed: "✓ কনফার্ম করুন",
  shipped: "শিপড করুন",
  cancelled: "বাতিল করুন",
  fake: "ফেক",
};

export const OrderDetailPage = (p: { order: Order; items: OrderItem[]; history: Order[]; blocked: { phone: boolean; device: boolean } }) => {
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
              {p.items.map((i) => <tr><td>{i.product_name} × ১</td><td class="right">{taka(i.price)}</td></tr>)}
              <tr><td>ডেলিভারি চার্জ</td><td class="right">{taka(o.delivery_charge)}</td></tr>
              <tr class="total"><td>মোট</td><td class="right">{taka(o.total)}</td></tr>
            </tbody>
          </table>
        </section>

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

export const ProductFormPage = (p: { product?: Partial<Product>; categories: Category[]; errors?: Record<string, string> }) => {
  const v = p.product ?? {};
  const e = p.errors ?? {};
  const isEdit = !!v.id;
  return (
    <>
      <p><a href="/admin/products">← পণ্য তালিকা</a></p>
      <h1>{isEdit ? "পণ্য এডিট" : "নতুন পণ্য"}</h1>
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
        <div class="checks">
          <label><input type="checkbox" name="is_active" value="1" checked={v.is_active !== 0} /> চালু</label>
          <label><input type="checkbox" name="show_on_home" value="1" checked={v.show_on_home !== 0} /> হোম পেজে দেখাবে</label>
        </div>
        <button class="btn btn-primary btn-lg">সেভ করুন</button>
      </form>
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
    <form method="post" action="/admin/settings" class="admin-form">
      <h2>সাধারণ</h2>
      <div class="form-grid">
        <label class="field"><span>সাইটের নাম</span><input type="text" name="site_name" value={s.site_name} required /></label>
        <label class="field"><span>যোগাযোগ নম্বর</span><input type="text" name="contact_phone" value={s.contact_phone} required /></label>
        <label class="field"><span>ডেলিভারি চার্জ — ঢাকার ভিতরে (৳)</span><input type="number" min="0" name="delivery_inside" value={s.delivery_inside} required /></label>
        <label class="field"><span>ডেলিভারি চার্জ — ঢাকার বাইরে (৳)</span><input type="number" min="0" name="delivery_outside" value={s.delivery_outside} required /></label>
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
