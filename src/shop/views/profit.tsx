/**
 * লাভের হিসাব — বিক্রি থেকে কোথায় কত গেল, আর হাতে কত থাকল।
 */
import { bn, taka } from "../lib/format";
import type { ProfitReport } from "../lib/profit";
import { EmptyState, PageHead } from "./ui";

const pct = (a: number, b: number) => (b > 0 ? `${bn(Math.round((a / b) * 100))}%` : "—");

export const ProfitPage = ({ r }: { r: ProfitReport }) => {
  const q = (k: string) => `/admin/profit?range=${k}`;
  const rows: [string, number, string?][] = [
    ["ক্রয়মূল্য (পণ্যের দাম)", r.cogs, r.noCost ? `${bn(r.noCost)}টা পণ্যের ক্রয়মূল্য দেওয়া নেই — ০ ধরা হয়েছে` : undefined],
    ["কুরিয়ার খরচ", r.shipping, `${bn(r.sold + r.returned)}টা পার্সেল (ফেরতসহ)`],
    ["ফেরতের খরচ", r.returnLoss, `${bn(r.returned)}টা ফেরত`],
    ["COD চার্জ", r.cod, `বিক্রির ${bn(r.costs.codPct)}%`],
    ["অ্যাড খরচ", r.ads, "অ্যাড ও ক্যাটালগে লেখা"],
  ];
  return (
    <>
      <PageHead title="লাভের হিসাব" desc="বিক্রি থেকে ক্রয়মূল্য, কুরিয়ার, ফেরত, COD চার্জ আর অ্যাড খরচ বাদ দিয়ে আসলে কত লাভ হলো।" />
      <div class="orders-tools">
        <nav class="range-pills" aria-label="তারিখ">
          {[["today", "আজ"], ["7", "৭ দিন"], ["30", "৩০ দিন"]].map(([k, l]) => <a href={q(k!)} class={r.range.key === k ? "active" : ""}>{l}</a>)}
        </nav>
        <form method="get" action="/admin/profit" class="row-form">
          <input type="hidden" name="range" value="custom" />
          <input type="date" name="from" value={r.range.from} aria-label="শুরু" />
          <input type="date" name="to" value={r.range.to} aria-label="শেষ" />
          <button class="btn btn-outline">দেখুন</button>
        </form>
      </div>
      <p class="muted small">{r.range.label}: {bn(r.range.from.split("-").reverse().join("/"))} — {bn(r.range.to.split("-").reverse().join("/"))} · অর্ডারের দিন ধরে, কনফার্ম/শিপড অর্ডার (ফেরত বাদ)</p>

      <div class="sa-kpis">
        <div class="sa-kpi"><div class="sa-kpi-label">বিক্রি</div><div class="sa-kpi-value">{taka(r.revenue)}</div><div class="sa-kpi-sub">{bn(r.sold)}টা অর্ডার</div></div>
        <div class="sa-kpi"><div class="sa-kpi-label">মোট খরচ</div><div class="sa-kpi-value">{taka(r.revenue - r.net)}</div><div class="sa-kpi-sub">বিক্রির {pct(r.revenue - r.net, r.revenue)}</div></div>
        <div class={`sa-kpi profit-net ${r.net < 0 ? "loss" : ""}`}><div class="sa-kpi-label">নিট লাভ</div><div class="sa-kpi-value">{r.net < 0 ? "-" : ""}{taka(Math.abs(r.net))}</div><div class="sa-kpi-sub">বিক্রির {pct(r.net, r.revenue)}</div></div>
        <div class="sa-kpi"><div class="sa-kpi-label">প্রতি অর্ডারে লাভ</div><div class="sa-kpi-value">{r.sold ? taka(Math.round(r.net / r.sold)) : "—"}</div><div class="sa-kpi-sub">ফেরত {bn(r.returned)}টা</div></div>
      </div>

      {r.revenue === 0 && r.ads === 0 ? (
        <div class="sa-card"><EmptyState icon="chart-column" title="এই সময়ে কোনো বিক্রি নেই" text="অর্ডার কনফার্ম হলে এখানে লাভের হিসাব দেখাবে।" /></div>
      ) : (
        <div class="panels">
          <section class="sa-card profit-flow">
            <h2>টাকা কোথায় গেল</h2>
            <table class="table compact">
              <tbody>
                <tr><td><b>বিক্রি</b><br /><small class="muted">পণ্য {taka(r.productSales)} + ডেলিভারি চার্জ {taka(r.deliveryIn)}</small></td><td class="right"><b>{taka(r.revenue)}</b></td></tr>
                {rows.map(([l, v, hint]) => <tr><td>− {l}{hint && <><br /><small class="muted">{hint}</small></>}</td><td class="right inv-minus">{v ? `-${taka(v)}` : "৳০"}</td></tr>)}
                <tr class="total"><td>নিট লাভ</td><td class={`right ${r.net < 0 ? "inv-minus" : "inv-plus"}`}>{r.net < 0 ? "-" : ""}{taka(Math.abs(r.net))}</td></tr>
              </tbody>
            </table>
          </section>
          <section class="sa-card">
            <h2>আপনার খরচের হিসাব</h2>
            <p class="muted small">কুরিয়ার আপনার কাছ থেকে যা কাটে সেটা দিন — তাহলে লাভ ঠিক আসবে।</p>
            <form method="post" action="/admin/profit/settings" class="admin-form">
              <div class="form-grid">
                <label class="field"><span>ঢাকার ভিতরে প্রতি পার্সেল (৳)</span><input type="number" name="profit_ship_inside" min="0" value={String(r.costs.shipInside)} /></label>
                <label class="field"><span>ঢাকার বাইরে প্রতি পার্সেল (৳)</span><input type="number" name="profit_ship_outside" min="0" value={String(r.costs.shipOutside)} /></label>
                <label class="field"><span>ফেরত এলে বাড়তি খরচ (৳)</span><input type="number" name="profit_return_cost" min="0" value={String(r.costs.returnCost)} /></label>
                <label class="field"><span>COD চার্জ (%)</span><input type="number" name="profit_cod_pct" min="0" max="10" step="0.1" value={String(r.costs.codPct)} /></label>
              </div>
              <button class="btn btn-primary btn-sm">সেভ করুন</button>
            </form>
          </section>
        </div>
      )}

      {r.products.length > 0 && (
        <section class="sa-card">
          <h2>পণ্য ধরে লাভ</h2>
          <div class="table-wrap">
            <table class="table compact">
              <thead><tr><th>পণ্য</th><th>বিক্রি</th><th>বিক্রির টাকা</th><th>ক্রয়মূল্য</th><th>মোটা লাভ</th><th>অ্যাড খরচ</th><th>অ্যাডের পরে</th></tr></thead>
              <tbody>
                {r.products.map((p) => {
                  const gross = p.sales - p.cogs;
                  const after = gross - p.ads;
                  return (
                    <tr>
                      <td>{p.name}{p.noCost > 0 && <><br /><small class="muted">ক্রয়মূল্য দেওয়া নেই</small></>}</td>
                      <td>{bn(p.units)}টা</td><td>{taka(p.sales)}</td><td>{taka(p.cogs)}</td>
                      <td>{taka(gross)} <small class="muted">({pct(gross, p.sales)})</small></td>
                      <td>{p.ads ? taka(p.ads) : "—"}</td>
                      <td class={after < 0 ? "inv-minus" : ""}><b>{after < 0 ? "-" : ""}{taka(Math.abs(after))}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="muted small">মোটা লাভ = বিক্রির টাকা − ক্রয়মূল্য। কুরিয়ার আর COD খরচ পুরো দোকানের হিসাবে ধরা, পণ্যে ভাগ করা হয়নি। ক্রয়মূল্য দিতে: পণ্যের পেজ বা ইনভেন্টরি।</p>
        </section>
      )}
    </>
  );
};
