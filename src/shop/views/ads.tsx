/**
 * অ্যাড ও ক্যাটালগ — অ্যাডের আসল খরচ (বাতিল/ফেরত বাদ দিয়ে) আর ক্যাটালগ ফিড।
 */
import { bn, taka } from "../lib/format";
import { per, roas, usdRate, type AdReport, type Funnel } from "../lib/ads";
import type { Settings } from "../lib/settings";
import { dhakaDate } from "../lib/reports";
import { Icon } from "./icons";
import { EmptyState, PageHead } from "./ui";

const Tabs = ({ active }: { active: "spend" | "catalog" }) => (
  <div class="tabs">
    <a href="/admin/ads" class={active === "spend" ? "tab active" : "tab"}>অ্যাডের আসল খরচ</a>
    <a href="/admin/ads/catalog" class={active === "catalog" ? "tab active" : "tab"}>ক্যাটালগ ফিড</a>
  </div>
);

const cost = (n: number | null) => (n == null ? "—" : taka(n));
const d2 = (d: string) => bn(d.slice(8, 10) + "/" + d.slice(5, 7));

const Kpis = ({ f }: { f: Funnel }) => {
  const r = roas(f.sales, f.spend);
  return (
    <div class="sa-kpis ads-kpis">
      <div class="sa-kpi"><div class="sa-kpi-label">অ্যাডে খরচ</div><div class="sa-kpi-value">{taka(f.spend)}</div><div class="sa-kpi-sub">{bn(f.orders)}টা অর্ডার এসেছে</div></div>
      <div class="sa-kpi"><div class="sa-kpi-label">প্রতি অর্ডারে খরচ</div><div class="sa-kpi-value">{cost(per(f.spend, f.orders))}</div><div class="sa-kpi-sub">Facebook যা দেখায় তার কাছাকাছি</div></div>
      <div class="sa-kpi"><div class="sa-kpi-label">প্রতি কনফার্মে খরচ</div><div class="sa-kpi-value">{cost(per(f.spend, f.confirmed))}</div><div class="sa-kpi-sub">বাতিল আর ফেক বাদ দিয়ে</div></div>
      <div class="sa-kpi ads-real"><div class="sa-kpi-label">আসল খরচ (প্রতি ডেলিভারিতে)</div><div class="sa-kpi-value">{cost(per(f.spend, f.delivered))}</div>
        <div class="sa-kpi-sub">{f.delivered ? `${bn(f.delivered)}টা ডেলিভারি` : "অর্ডারে \"ডেলিভারি হয়েছে\" চিহ্ন দিলে দেখাবে"}</div></div>
      <div class="sa-kpi"><div class="sa-kpi-label">খরচের কত গুণ বিক্রি</div><div class="sa-kpi-value">{r == null ? "—" : `${bn(r)}×`}</div><div class="sa-kpi-sub">বিক্রি {taka(f.sales)} (কনফার্ম, ফেরত বাদ)</div></div>
    </div>
  );
};

/** অর্ডার কোথায় হারাল: অর্ডার → কনফার্ম → ডেলিভারি */
const FunnelBar = ({ f }: { f: Funnel }) => {
  if (!f.orders) return null;
  const pct = (n: number) => Math.round((n / f.orders) * 100);
  return (
    <section class="sa-card ads-funnel">
      <h2>অর্ডার থেকে ডেলিভারি পর্যন্ত</h2>
      <div class="ads-steps">
        <div><b>{bn(f.orders)}</b><span>অর্ডার এসেছে</span></div>
        <div><b>{bn(f.confirmed)}</b><span>কনফার্ম ({bn(pct(f.confirmed))}%)</span></div>
        <div><b>{bn(f.delivered)}</b><span>ডেলিভারি ({bn(pct(f.delivered))}%)</span></div>
      </div>
      <p class="muted small">বাদ গেছে — বাতিল {bn(f.cancelled)}, ফেক {bn(f.fake)}, ফেরত {bn(f.returned)}। প্রতিটা বাদ যাওয়া অর্ডারের অ্যাড খরচও বাকিগুলোর ঘাড়ে পড়ে — তাই আসল খরচ বেশি।</p>
    </section>
  );
};

export const AdsPage = (p: { r: AdReport; s: Settings; products: { id: number; name: string }[] }) => {
  const r = p.r;
  const q = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ range: r.range.key, ...(r.range.key === "custom" ? { from: r.range.from, to: r.range.to } : {}), ...(r.productId ? { product: String(r.productId) } : {}), ...extra });
    return `/admin/ads?${u}`;
  };
  const rate = usdRate(p.s);
  return (
    <>
      <PageHead title="অ্যাড ও ক্যাটালগ" desc="Facebook-এ যে খরচ দেখায় সেটা সব অর্ডার ধরে। এখানে বাতিল, ফেক আর ফেরত বাদ দিয়ে আসল খরচ দেখুন — কোন অ্যাড লাভ দিচ্ছে সেটা বুঝতে।" />
      <Tabs active="spend" />

      <div class="orders-tools">
        <nav class="range-pills" aria-label="তারিখ">
          {[["today", "আজ"], ["7", "৭ দিন"], ["30", "৩০ দিন"]].map(([k, l]) => <a href={q({ range: k! })} class={r.range.key === k ? "active" : ""}>{l}</a>)}
        </nav>
        <form method="get" action="/admin/ads" class="row-form ads-filter">
          <input type="hidden" name="range" value="custom" />
          <input type="date" name="from" value={r.range.from} aria-label="শুরু" />
          <input type="date" name="to" value={r.range.to} aria-label="শেষ" />
          <select name="product" aria-label="পণ্য">
            <option value="">সব পণ্য</option>
            {p.products.map((x) => <option value={String(x.id)} selected={x.id === r.productId}>{x.name}</option>)}
          </select>
          <button class="btn btn-outline">দেখুন</button>
        </form>
      </div>
      <p class="muted small">{r.range.label}: {bn(r.range.from.split("-").reverse().join("/"))} — {bn(r.range.to.split("-").reverse().join("/"))}{r.productId ? ` · শুধু ${p.products.find((x) => x.id === r.productId)?.name ?? "এই পণ্য"} থাকা অর্ডার আর এর অ্যাড খরচ` : ""}</p>

      <Kpis f={r.total} />
      <FunnelBar f={r.total} />

      <section class="sa-card ads-add">
        <h2>অ্যাডের খরচ লিখুন</h2>
        <p class="muted small">Facebook Ads Manager থেকে দিনের খরচ দেখে লিখুন। ডলারে দিলে {bn(rate)} টাকা রেটে টাকায় বদলে রাখা হবে (রেট নিচে বদলানো যায়)।</p>
        <form method="post" action="/admin/ads/spend" class="form-grid ads-form">
          <label class="field"><span>তারিখ</span><input type="date" name="day" value={dhakaDate()} required /></label>
          <label class="field"><span>খরচ</span><input type="number" name="amount" min="0" step="0.01" required placeholder="যেমন 1500" /></label>
          <label class="field"><span>মুদ্রা</span><select name="currency"><option value="bdt">টাকা (৳)</option><option value="usd">ডলার ($)</option></select></label>
          <label class="field"><span>কোন পণ্যের অ্যাড (ঐচ্ছিক)</span>
            <select name="product_id"><option value="">পুরো দোকান / একাধিক পণ্য</option>{p.products.map((x) => <option value={String(x.id)} selected={x.id === r.productId}>{x.name}</option>)}</select>
          </label>
          <label class="field"><span>নোট (ঐচ্ছিক)</span><input type="text" name="note" maxlength={100} placeholder="যেমন: ঈদ অফার ক্যাম্পেইন" /></label>
          <div class="field"><span>&nbsp;</span><button class="btn btn-primary"><Icon name="plus" size="sm" /> যোগ করুন</button></div>
        </form>
        <form method="post" action="/admin/ads/rate" class="row-form ads-rate">
          <label>ডলারের রেট: <input type="number" name="ad_usd_rate" min="50" max="500" step="0.5" value={String(rate)} class="w-sm" /> টাকা</label>
          <button class="btn btn-outline btn-sm">রেট সেভ</button>
        </form>
      </section>

      {r.total.spend === 0 && r.total.orders === 0 ? (
        <div class="sa-card"><EmptyState icon="trending-up" title="এই সময়ে কোনো খরচ বা অর্ডার নেই" text="উপরে অ্যাডের খরচ লিখুন — তারপর প্রতিদিনের আসল খরচ এখানে দেখাবে।" /></div>
      ) : (
        <section class="sa-card">
          <h2>দিনভিত্তিক</h2>
          <div class="table-wrap">
            <table class="table compact ads-table">
              <thead><tr><th>দিন</th><th>খরচ</th><th>অর্ডার</th><th>কনফার্ম</th><th>ডেলিভারি</th><th>প্রতি কনফার্মে</th><th>আসল খরচ</th></tr></thead>
              <tbody>
                {r.days.filter((d) => d.spend || d.orders).map((d) => (
                  <tr>
                    <td>{d2(d.date)}</td><td>{d.spend ? taka(d.spend) : "—"}</td><td>{bn(d.orders)}</td><td>{bn(d.confirmed)}</td><td>{bn(d.delivered)}</td>
                    <td>{cost(per(d.spend, d.confirmed))}</td><td><strong>{cost(per(d.spend, d.delivered))}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!r.productId && r.products.length > 0 && (
        <section class="sa-card">
          <h2>পণ্য ধরে (যেগুলোর খরচ আলাদা লেখা)</h2>
          <div class="table-wrap">
            <table class="table compact ads-table">
              <thead><tr><th>পণ্য</th><th>খরচ</th><th>অর্ডার</th><th>কনফার্ম</th><th>প্রতি কনফার্মে</th><th>আসল খরচ</th><th>খরচের কত গুণ বিক্রি</th></tr></thead>
              <tbody>
                {r.products.map((x) => {
                  const ro = roas(x.sales, x.spend);
                  return (
                    <tr>
                      <td><a href={q({ product: String(x.product_id) })}>{x.name}</a></td><td>{taka(x.spend)}</td><td>{bn(x.orders)}</td><td>{bn(x.confirmed)}</td>
                      <td>{cost(per(x.spend, x.confirmed))}</td><td><strong>{cost(per(x.spend, x.delivered))}</strong></td>
                      <td class={ro != null && ro < 2 ? "inv-minus" : ""}>{ro == null ? "—" : `${bn(ro)}×`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="muted small">একটা অর্ডারে কয়েকটা পণ্য থাকলে প্রতিটা পণ্যের হিসাবেই অর্ডারটা ধরা হয়।</p>
        </section>
      )}

      {r.spends.length > 0 && (
        <details class="sa-card ads-list">
          <summary><strong>লেখা খরচগুলো ({bn(r.spends.length)})</strong></summary>
          <div class="table-wrap">
            <table class="table compact">
              <tbody>
                {r.spends.map((x) => (
                  <tr>
                    <td>{d2(x.day)}</td>
                    <td>{taka(x.amount)}{x.usd != null && <small class="muted"> (${bn(x.usd)})</small>}</td>
                    <td>{x.product_name ?? <span class="muted">পুরো দোকান</span>}{x.note && <><br /><small class="muted">{x.note}</small></>}</td>
                    <td class="right"><form method="post" action={`/admin/ads/spend/${x.id}/delete`} class="inline" data-confirm="এই খরচটা মুছবেন?"><button class="btn-link">মুছুন</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
};

export const CatalogPage = (p: { s: Settings; origin: string; count: number; skipped: number; out: number }) => {
  const xml = `${p.origin}/feed.xml`;
  const csv = `${p.origin}/feed.csv`;
  const on = p.s.feed_enabled !== "0";
  return (
    <>
      <PageHead title="অ্যাড ও ক্যাটালগ" desc="পণ্যের ক্যাটালগ ফিড দিয়ে Facebook/Instagram-এ ক্যাটালগ অ্যাড (যে পণ্য দেখেছে তাকেই আবার দেখানো) আর Google Shopping চালানো যায়। দাম আর স্টক বদলালে ফিডও নিজে থেকে বদলায়।" />
      <Tabs active="catalog" />

      <section class="sa-card">
        <h2>আপনার ফিডের লিংক {on ? <span class="pill pill-ok">চালু</span> : <span class="pill pill-bad">বন্ধ</span>}</h2>
        <p class="muted small">{bn(p.count)}টা পণ্য ফিডে আছে{p.out ? `, তার ${bn(p.out)}টা "স্টক নেই"` : ""}।{p.skipped > 0 && <> <strong>{bn(p.skipped)}টা পণ্যের ছবি নেই</strong> — ছবি ছাড়া Facebook/Google নেয় না, তাই বাদ দেওয়া হয়েছে।</>}</p>
        <label class="field"><span>Facebook আর Google — দুটোতেই চলে (XML)</span>
          <div class="store-link"><input type="text" id="feed-xml" value={xml} readonly /><button type="button" class="btn btn-sm" data-copy="#feed-xml">কপি</button></div>
        </label>
        <label class="field"><span>শুধু Facebook (CSV)</span>
          <div class="store-link"><input type="text" id="feed-csv" value={csv} readonly /><button type="button" class="btn btn-sm" data-copy="#feed-csv">কপি</button></div>
        </label>
        <p class="small"><a href="/feed.xml" target="_blank" rel="noopener">ফিড খুলে দেখুন →</a></p>
      </section>

      <div class="panels">
        <section class="sa-card">
          <h2>Facebook-এ যোগ করুন</h2>
          <ol class="steps-list">
            <li>business.facebook.com → <b>Commerce Manager</b> → ক্যাটালগ তৈরি করুন (ধরন: E-commerce)।</li>
            <li>Catalog → <b>Data sources</b> → Add items → <b>Data feed</b> → "Use a URL"।</li>
            <li>উপরের XML লিংক বসান, আপডেট "প্রতিদিন" (Daily) দিন, মুদ্রা BDT।</li>
            <li>Catalog → Events-এ আপনার Pixel যুক্ত করুন — পণ্যের আইডি নিজে থেকে মিলে যাবে।</li>
            <li>Ads Manager-এ "Sales" ক্যাম্পেইনে "Catalog" চালু করে অ্যাড বানান।</li>
          </ol>
        </section>
        <section class="sa-card">
          <h2>Google-এ যোগ করুন</h2>
          <ol class="steps-list">
            <li>merchants.google.com → আপনার দোকানের ওয়েবসাইট যাচাই করুন।</li>
            <li>Products → <b>Add products</b> → "Add products from a file" → "Enter a link to your file"।</li>
            <li>উপরের XML লিংক বসান, প্রতিদিন আনার সময় ঠিক করুন।</li>
            <li>ফ্রি তালিকা (Free listings) নিজে থেকে চালু হয়; চাইলে Google Ads-এ Shopping ক্যাম্পেইন।</li>
          </ol>
        </section>
      </div>

      <section class="sa-card">
        <h2>ফিডের সেটিংস</h2>
        <form method="post" action="/admin/ads/catalog" class="admin-form">
          <label class="set-check"><input type="checkbox" name="feed_enabled" value="1" checked={on} /> ফিড চালু রাখুন</label>
          <div class="form-grid">
            <label class="field"><span>ব্র্যান্ডের নাম</span><input type="text" name="feed_brand" value={p.s.feed_brand ?? ""} maxlength={100} placeholder={p.s.site_name || "দোকানের নাম"} /><small>ফাঁকা রাখলে দোকানের নাম।</small></label>
            <label class="field"><span>অ্যাডে চাপলে কোন পেজে যাবে</span>
              <select name="feed_link">
                <option value="landing" selected={p.s.feed_link !== "product"}>ল্যান্ডিং পেজ (সরাসরি অর্ডার ফর্ম)</option>
                <option value="product" selected={p.s.feed_link === "product"}>পণ্যের বিস্তারিত পেজ</option>
              </select>
            </label>
          </div>
          <button class="btn btn-primary">সেভ করুন</button>
        </form>
      </section>
    </>
  );
};
