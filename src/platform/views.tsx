import type { Child } from "hono/jsx";
import { ASSET_VERSION } from "../shop/views/layout";
import { bn, dhakaTime, taka } from "../shop/lib/format";

export const PLATFORM_NAME = "SellxBD";

export type PFlash = { type: "ok" | "error"; text: string } | null;

export const PLayout = (p: { title: string; children?: Child; nav?: Child; flash?: PFlash; admin?: boolean }) => (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{p.title}</title>
      <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/admin.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/platform.css?v=${ASSET_VERSION}`} />
    </head>
    <body class={p.admin ? "admin" : "platform"}>
      <header class={p.admin ? "admin-header" : "p-header"}>
        <div class="wrap admin-header-inner">
          <a href={p.admin ? "/super" : "/"} class="logo">{PLATFORM_NAME}{p.admin ? " সুপার অ্যাডমিন" : ""}</a>
          <nav class="admin-nav">{p.nav}</nav>
        </div>
      </header>
      <main class={p.admin ? "wrap admin-main" : ""}>
        {p.flash && <div class="wrap"><div class={`alert ${p.flash.type === "ok" ? "alert-ok" : "alert-error"}`}>{p.flash.text}</div></div>}
        {p.children}
      </main>
      <script src={`/js/admin.js?v=${ASSET_VERSION}`} defer></script>
    </body>
  </html>
);

/* ---------- হোম (মার্কেটিং) ---------- */
export const HomePage = ({ devMode }: { devMode: boolean }) => (
  <>
    <section class="hero">
      <div class="wrap narrow center">
        <h1>ফেসবুকে বিক্রির জন্য নিজের অনলাইন দোকান, ২ মিনিটে</h1>
        <p class="lead">প্রতিটা পণ্যের আলাদা ল্যান্ডিং পেজ, ক্যাশ অন ডেলিভারি, ফেক অর্ডার আটকানো আর Facebook Pixel + Conversions API — সব তৈরি।</p>
        <a href="/signup" class="btn btn-primary btn-lg">১৪ দিন ফ্রি — দোকান খুলুন</a>
        {devMode && <p><a href="/?shop=demoshop" class="btn btn-outline">ডেমো দোকান দেখুন</a></p>}
      </div>
    </section>
    <section class="wrap features">
      {[
        ["🗄️", "আপনার আলাদা ডাটাবেস", "প্রতিটা দোকানের পণ্য, অর্ডার আর কাস্টমারের তথ্য সম্পূর্ণ আলাদা ডাটাবেসে থাকে। এক দোকানের তথ্য অন্য দোকানে কখনো মেশে না।"],
        ["🛡️", "ফেক অর্ডার আটকানো", "একই নম্বর বা ডিভাইস থেকে বারবার অর্ডার বন্ধ, ফেক কাস্টমার স্থায়ী ব্লক, ভুল নম্বর নেয় না।"],
        ["📈", "Pixel + Conversions API", "ব্রাউজার আর সার্ভার দুই দিক থেকে ইভেন্ট। Purchase যায় শুধু আপনি অর্ডার কনফার্ম করলে — অ্যাড অপটিমাইজেশন সঠিক থাকে।"],
        ["🌐", "নিজের ডোমেইন", "নিজের ডোমেইনে দোকান চালান, অথবা ফ্রি subdomain নিন। https সবখানে।"],
        ["⚡", "খুব দ্রুত লোড", "Cloudflare-এর সার্ভারে চলে, মোবাইলেও চোখের পলকে খোলে।"],
        ["👥", "স্টাফ লগইন", "কর্মীদের আলাদা লগইন, কে কী দেখবে তা আপনি ঠিক করবেন।"],
      ].map(([icon, title, text]) => (
        <div class="feature"><div class="f-icon">{icon}</div><h3>{title}</h3><p>{text}</p></div>
      ))}
    </section>
    <section class="wrap narrow pricing">
      <h2 class="center">সহজ দাম</h2>
      <div class="price-card">
        <div class="price-big">৳৯৯<span>/মাস</span></div>
        <ul>
          <li>+ প্রতিটা <strong>কনফার্ম</strong> অর্ডারে মাত্র ৳২ (ফেক বা বাতিল অর্ডারে কোনো চার্জ নেই)</li>
          <li>প্রতিজন অতিরিক্ত স্টাফ: ৳৯৯/মাস</li>
          <li>১৪ দিন অথবা প্রথম ৫০টা অর্ডার সম্পূর্ণ ফ্রি</li>
          <li>bKash / Nagad দিয়ে রিচার্জ</li>
        </ul>
        <a href="/signup" class="btn btn-primary btn-block btn-lg">ফ্রি ট্রায়াল শুরু করুন</a>
      </div>
    </section>
  </>
);

/* ---------- সাইনআপ ---------- */
export const SignupPage = (p: { values?: Record<string, string>; errors?: Record<string, string>; alert?: string; domain: string }) => {
  const v = p.values ?? {};
  const e = p.errors ?? {};
  return (
    <div class="wrap narrow">
      <div class="login-box wide">
        <h1>দোকান খুলুন</h1>
        <p class="muted">১৪ দিন অথবা প্রথম ৫০টা অর্ডার ফ্রি। কোনো কার্ড লাগবে না।</p>
        {p.alert && <div class="alert alert-error">{p.alert}</div>}
        <form method="post" action="/signup" class="order-form" data-signup>
          <label class="field"><span>দোকানের নাম *</span><input type="text" name="shop_name" value={v.shop_name ?? ""} required maxlength={60} />{e.shop_name && <small class="error">{e.shop_name}</small>}</label>
          <label class="field"><span>দোকানের ঠিকানা *</span>
            <div class="slug-input"><input type="text" name="slug" value={v.slug ?? ""} required maxlength={30} pattern="[a-z0-9-]+" placeholder="myshop" autocomplete="off" data-slug /><span>.{p.domain}</span></div>
            <small class="muted" data-slug-msg>ছোট ইংরেজি অক্ষর, সংখ্যা আর - । পরে নিজের ডোমেইন যোগ করতে পারবেন।</small>
            {e.slug && <small class="error">{e.slug}</small>}
          </label>
          <label class="field"><span>আপনার নাম *</span><input type="text" name="owner_name" value={v.owner_name ?? ""} required maxlength={60} />{e.owner_name && <small class="error">{e.owner_name}</small>}</label>
          <label class="field"><span>মোবাইল নম্বর *</span><input type="tel" name="phone" value={v.phone ?? ""} required placeholder="01XXXXXXXXX" />{e.phone && <small class="error">{e.phone}</small>}</label>
          <label class="field"><span>ইমেইল (লগইনের জন্য) *</span><input type="email" name="email" value={v.email ?? ""} required autocomplete="username" />{e.email && <small class="error">{e.email}</small>}</label>
          <label class="field"><span>পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর) *</span><input type="password" name="password" required minlength={8} autocomplete="new-password" />{e.password && <small class="error">{e.password}</small>}</label>
          <label class="small-check"><input type="checkbox" name="seed_demo" value="1" checked={v.seed_demo !== "0"} /> নমুনা পণ্য দিয়ে শুরু করুন (পরে বন্ধ করা যাবে)</label>
          <button class="btn btn-primary btn-block btn-lg" data-submit>দোকান তৈরি করুন</button>
        </form>
      </div>
      <script src={`/js/signup.js?v=${ASSET_VERSION}`} defer></script>
    </div>
  );
};

export const SuperLoginPage = ({ error, email }: { error?: string; email?: string }) => (
  <div class="login-box">
    <h1>সুপার অ্যাডমিন লগইন</h1>
    {error && <div class="alert alert-error">{error}</div>}
    <form method="post" action="/super/login" class="order-form">
      <label class="field"><span>ইমেইল</span><input type="email" name="email" value={email ?? ""} required /></label>
      <label class="field"><span>পাসওয়ার্ড</span><input type="password" name="password" required /></label>
      <button class="btn btn-primary btn-block">লগইন</button>
    </form>
  </div>
);

/** প্রথম সুপার অ্যাডমিন বানানো (এককালীন সেটআপ কোড দিয়ে) */
export const SuperSetupPage = ({ code, error, email }: { code: string; error?: string; email?: string }) => (
  <div class="login-box">
    <h1>সুপার অ্যাডমিন তৈরি</h1>
    <p class="muted">এই পেজ একবারই কাজ করে। নিজের ইমেইল আর শক্ত পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর) দিন।</p>
    {error && <div class="alert alert-error">{error}</div>}
    <form method="post" action="/super/setup" class="order-form">
      <input type="hidden" name="code" value={code} />
      <label class="field"><span>ইমেইল</span><input type="email" name="email" value={email ?? ""} required autocomplete="username" /></label>
      <label class="field"><span>পাসওয়ার্ড</span><input type="password" name="password" required minlength={10} autocomplete="new-password" /></label>
      <label class="field"><span>আবার পাসওয়ার্ড</span><input type="password" name="password2" required minlength={10} autocomplete="new-password" /></label>
      <button class="btn btn-primary btn-block">তৈরি করুন</button>
    </form>
  </div>
);

/* ---------- সুপার অ্যাডমিন: দোকানের তালিকা ---------- */
export type ShopListRow = {
  id: string; slug: string; name: string; owner_name: string | null; owner_phone: string | null; owner_email: string | null;
  status: string; trial_ends_at: string | null; trial_orders_left: number; created_at: string; domains: string | null;
};

export const SHOP_STATUS_LABEL: Record<string, string> = { trial: "ট্রায়াল", active: "চালু", suspended: "স্থগিত", closed: "বন্ধ" };

export const SuperShopsPage = (p: { shops: ShopListRow[]; counts: Record<string, number>; q: string; status: string; shopLink: (slug: string) => string }) => (
  <>
    <h1>দোকান</h1>
    <div class="tabs">
      <a href="/super" class={!p.status && !p.q ? "tab active" : "tab"}>সব <span class="tab-count">{Object.values(p.counts).reduce((a, b) => a + b, 0)}</span></a>
      {["trial", "active", "suspended", "closed"].map((s) => (
        <a href={`/super?status=${s}`} class={p.status === s ? "tab active" : "tab"}>{SHOP_STATUS_LABEL[s]} <span class="tab-count">{p.counts[s] ?? 0}</span></a>
      ))}
    </div>
    <form method="get" action="/super" class="search">
      <input type="search" name="q" value={p.q} placeholder="দোকান / ঠিকানা / মোবাইল / ইমেইল / ডোমেইন" />
      <button class="btn btn-outline">খুঁজুন</button>
    </form>
    {p.shops.length === 0 ? <p class="empty">কোনো দোকান নেই</p> : (
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>দোকান</th><th>মালিক</th><th>স্ট্যাটাস</th><th>তৈরি</th></tr></thead>
          <tbody>
            {p.shops.map((s) => (
              <tr>
                <td><a href={`/super/shops/${s.id}`}><strong>{s.name}</strong></a><br />
                  <a href={p.shopLink(s.slug)} target="_blank"><small>{s.slug}</small></a>
                  {s.domains && <><br /><small class="muted">{s.domains}</small></>}</td>
                <td>{s.owner_name}<br /><small>{s.owner_phone} · {s.owner_email}</small></td>
                <td><span class={`status shop-${s.status}`}>{SHOP_STATUS_LABEL[s.status]}</span>
                  {s.status === "trial" && <><br /><small class="muted">শেষ: {dhakaTime(s.trial_ends_at)} · বাকি {bn(s.trial_orders_left)} অর্ডার</small></>}</td>
                <td><small>{dhakaTime(s.created_at)}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
);

export const SuperShopPage = (p: { shop: ShopListRow; domains: { hostname: string; status: string }[]; shopLink: string; extra?: Child }) => {
  const s = p.shop;
  return (
    <>
      <p><a href="/super">← দোকানের তালিকা</a></p>
      <div class="detail-head">
        <h1>{s.name} <span class={`status shop-${s.status}`}>{SHOP_STATUS_LABEL[s.status]}</span></h1>
        <a href={p.shopLink} target="_blank" class="btn btn-outline">দোকান দেখুন ↗</a>
      </div>
      <div class="panels">
        <section class="panel">
          <h2>তথ্য</h2>
          <dl class="kv">
            <dt>ঠিকানা</dt><dd>{s.slug}</dd>
            <dt>মালিক</dt><dd>{s.owner_name}</dd>
            <dt>মোবাইল</dt><dd>{s.owner_phone}</dd>
            <dt>ইমেইল</dt><dd>{s.owner_email}</dd>
            <dt>তৈরি</dt><dd>{dhakaTime(s.created_at)}</dd>
            <dt>ট্রায়াল</dt><dd>{dhakaTime(s.trial_ends_at)} পর্যন্ত, বাকি {bn(s.trial_orders_left)}টা অর্ডার</dd>
            <dt>ডাটাবেস</dt><dd><code>{s.id}</code></dd>
          </dl>
        </section>
        <section class="panel">
          <h2>ডোমেইন</h2>
          {p.domains.length === 0 ? <p class="muted">নিজের ডোমেইন নেই</p> : (
            <ul>{p.domains.map((d) => <li><code>{d.hostname}</code> — {d.status}</li>)}</ul>
          )}
        </section>
        <section class="panel">
          <h2>স্ট্যাটাস বদল</h2>
          <div class="actions">
            {[["active", "চালু করুন", "btn-primary"], ["suspended", "স্থগিত করুন", "btn-danger"], ["closed", "বন্ধ করুন", "btn-danger"], ["trial", "ট্রায়ালে ফেরান", "btn-outline"]]
              .filter(([k]) => k !== s.status)
              .map(([k, label, cls]) => (
                <form method="post" action={`/super/shops/${s.id}/status`} class="inline" data-confirm={k === "closed" ? "দোকানটি বন্ধ হবে, কাস্টমার আর সাইট দেখতে পাবে না। নিশ্চিত?" : undefined}>
                  <input type="hidden" name="status" value={k} /><button class={`btn ${cls}`}>{label}</button>
                </form>
              ))}
          </div>
          <form method="post" action={`/super/shops/${s.id}/extend-trial`} class="row-form">
            <input type="number" name="days" value="7" min="1" max="90" class="w-sm" />
            <button class="btn btn-outline btn-sm">দিন ট্রায়াল বাড়ান</button>
          </form>
        </section>
        {p.extra}
      </div>
    </>
  );
};

export { taka };

/* ---------- সুপার অ্যাডমিন: বিলিং ---------- */
export type SuperTopupRow = { id: number; shop_id: string; shop_name: string; slug: string; amount: number; method: string; sender: string; trx_id: string; status: string; created_at: string };

export const SuperTopupsPage = ({ pending, recent }: { pending: SuperTopupRow[]; recent: SuperTopupRow[] }) => (
  <>
    <h1>রিচার্জের অনুরোধ</h1>
    <p class="muted">bKash/Nagad অ্যাপে Transaction ID মিলিয়ে দেখে তারপর অনুমোদন দিন।</p>
    {pending.length === 0 ? <p class="empty">অপেক্ষায় কোনো অনুরোধ নেই</p> : (
      <div class="table-wrap"><table class="table">
        <thead><tr><th>দোকান</th><th>মাধ্যম</th><th>Transaction ID</th><th>পাঠানো নম্বর</th><th>টাকা</th><th></th></tr></thead>
        <tbody>
          {pending.map((t) => (
            <tr>
              <td><a href={`/super/shops/${t.shop_id}`}>{t.shop_name}</a><br /><small>{dhakaTime(t.created_at)}</small></td>
              <td>{t.method === "bkash" ? "bKash" : "Nagad"}</td>
              <td><code>{t.trx_id}</code></td>
              <td>{t.sender}</td>
              <td><strong>{taka(t.amount)}</strong></td>
              <td class="nowrap">
                <form method="post" action={`/super/topups/${t.id}/approve`} class="inline" data-confirm={`${taka(t.amount)} ${t.shop_name}-এর ব্যালেন্সে যোগ হবে। নিশ্চিত?`}><button class="btn btn-primary btn-sm">অনুমোদন</button></form>
                <form method="post" action={`/super/topups/${t.id}/reject`} class="inline" data-confirm="অনুরোধটি বাতিল করবেন?"><button class="btn-link danger">বাতিল</button></form>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    )}
    <h2 style="margin-top:20px">সাম্প্রতিক</h2>
    <div class="table-wrap"><table class="table compact"><tbody>
      {recent.map((t) => <tr><td>{t.shop_name}</td><td>{t.method === "bkash" ? "bKash" : "Nagad"} · <code>{t.trx_id}</code></td><td>{taka(t.amount)}</td><td>{t.status === "approved" ? "✓ যোগ হয়েছে" : "✕ বাতিল"}</td><td><small>{dhakaTime(t.created_at)}</small></td></tr>)}
    </tbody></table></div>
  </>
);

export const SuperSettingsPage = ({ s }: { s: Record<string, string> }) => (
  <>
    <h1>প্ল্যাটফর্ম সেটিংস</h1>
    <form method="post" action="/super/settings" class="admin-form">
      <h2>দাম</h2>
      <div class="form-grid">
        {[["order_fee", "প্রতি কনফার্ম অর্ডার (৳)"], ["monthly_fee", "মাসিক চার্জ (৳)"], ["staff_fee", "প্রতি স্টাফ মাসিক (৳)"], ["min_topup", "সর্বনিম্ন রিচার্জ (৳)"],
          ["trial_days", "ট্রায়াল (দিন)"], ["trial_orders", "ট্রায়ালে ফ্রি অর্ডার"], ["grace_days", "ব্যালেন্স মাইনাসের পর কত দিন অর্ডার চালু থাকবে"]].map(([k, label]) => (
          <label class="field"><span>{label}</span><input type="number" min="0" name={k} value={s[k] ?? ""} required /></label>
        ))}
      </div>
      <h2>পেমেন্ট নম্বর</h2>
      <div class="form-grid">
        <label class="field"><span>bKash নম্বর</span><input type="text" name="bkash_number" value={s.bkash_number ?? ""} /></label>
        <label class="field"><span>Nagad নম্বর</span><input type="text" name="nagad_number" value={s.nagad_number ?? ""} /></label>
        <label class="field"><span>সাপোর্ট নম্বর</span><input type="text" name="support_phone" value={s.support_phone ?? ""} /></label>
      </div>
      <p class="muted">ট্রায়ালের দিন/অর্ডার বদলালে শুধু নতুন দোকানে প্রযোজ্য হবে।</p>
      <button class="btn btn-primary btn-lg">সেভ করুন</button>
    </form>
  </>
);

export type SuperLedgerRow = { id: number; type: string; amount: number; balance_after: number | null; note: string | null; created_at: string };

export const SuperBillingPanel = ({ shop, ledger }: { shop: { id: string; balance: number; next_bill_at: string | null; staff_count: number; low_balance_since: string | null }; ledger: SuperLedgerRow[] }) => (
  <section class="panel">
    <h2>বিলিং</h2>
    <dl class="kv">
      <dt>ব্যালেন্স</dt><dd><strong class={shop.balance < 0 ? "danger" : ""}>{taka(shop.balance)}</strong></dd>
      <dt>পরের বিল</dt><dd>{dhakaTime(shop.next_bill_at)}</dd>
      <dt>স্টাফ</dt><dd>{bn(shop.staff_count)} জন</dd>
      {shop.low_balance_since && <><dt>মাইনাস</dt><dd>{dhakaTime(shop.low_balance_since)} থেকে</dd></>}
    </dl>
    <form method="post" action={`/super/shops/${shop.id}/adjust`} class="row-form" data-confirm="ব্যালেন্স সমন্বয় করবেন?">
      <input type="number" name="amount" placeholder="+৫০ / -২০" required class="w-sm" />
      <input type="text" name="note" placeholder="কারণ" required />
      <button class="btn btn-outline btn-sm">সমন্বয়</button>
    </form>
    <table class="table compact"><tbody>
      {ledger.map((l) => <tr><td><small>{dhakaTime(l.created_at)}</small></td><td>{l.note ?? l.type}</td><td class="right">{l.amount === 0 ? "—" : (l.amount > 0 ? "+" : "") + taka(l.amount)}</td><td class="right">{l.balance_after != null ? taka(l.balance_after) : ""}</td></tr>)}
    </tbody></table>
  </section>
);
