/**
 * ইনভেন্টরি — কোন পণ্য কতটা আছে, কোনটা শেষ/কম, একসাথে স্টক বসানো, আর স্টকের প্রতিটা বদলের হিসাব।
 */
import { bn, dhakaTime, imageUrl, taka } from "../lib/format";
import type { InventoryRow, InvFilter, StockMove } from "../lib/stock";
import { Icon } from "./icons";
import { Badge, EmptyState, PageHead } from "./ui";

type Summary = { items: number; out_count: number; low_count: number; units: number; value: number; no_cost: number; untracked: number };

const REASON: Record<string, string> = { order: "অর্ডার কনফার্ম", cancel: "বাতিল — ফেরত", return: "পার্সেল ফেরত", manual: "হাতে বদল" };

const StockBadge = ({ r }: { r: InventoryRow }) =>
  r.stock <= 0 ? <Badge tone="bad">শেষ</Badge> : r.stock <= r.low_stock ? <Badge tone="warn">কম</Badge> : <Badge tone="ok">আছে</Badge>;

export const InventoryPage = (p: { rows: InventoryRow[]; summary: Summary; moves: StockMove[]; filter: InvFilter; q: string; untracked: { id: number; name: string; image: string | null; is_active: number }[] }) => {
  const s = p.summary;
  const tab = (f: InvFilter, label: string, n?: number) => (
    <a href={`/admin/inventory?f=${f}${p.q ? `&q=${encodeURIComponent(p.q)}` : ""}`} class={p.filter === f ? "tab active" : "tab"}>{label}{n != null && <span class="tab-count">{bn(n)}</span>}</a>
  );
  return (
    <>
      <PageHead title="ইনভেন্টরি" desc="কোন পণ্য কতটা আছে। অর্ডার কনফার্ম করলে স্টক কমে, বাতিল বা পার্সেল ফেরত এলে ফেরে। স্টক শেষ হলে দোকানে &quot;স্টক নেই&quot; দেখায়, অর্ডার নেয় না।" />

      <div class="sa-kpis">
        <div class="sa-kpi"><div class="sa-kpi-label">স্টক গোনা পণ্য/ভ্যারিয়েন্ট</div><div class="sa-kpi-value">{bn(s.items)}</div><div class="sa-kpi-sub">মোট {bn(s.units)}টা মাল</div></div>
        <a class="sa-kpi" href="/admin/inventory?f=out"><div class="sa-kpi-label">শেষ</div><div class="sa-kpi-value">{bn(s.out_count ?? 0)}</div>{(s.out_count ?? 0) > 0 && <div class="sa-kpi-sub sa-bad">দোকানে "স্টক নেই" দেখাচ্ছে</div>}</a>
        <a class="sa-kpi" href="/admin/inventory?f=low"><div class="sa-kpi-label">কম আছে</div><div class="sa-kpi-value">{bn(s.low_count ?? 0)}</div>{(s.low_count ?? 0) > 0 && <div class="sa-kpi-sub sa-warn">শিগগির মাল আনুন</div>}</a>
        <div class="sa-kpi"><div class="sa-kpi-label">মালের দাম (ক্রয়মূল্যে)</div><div class="sa-kpi-value">{taka(s.value)}</div>{s.no_cost > 0 && <div class="sa-kpi-sub">{bn(s.no_cost)}টার ক্রয়মূল্য দেওয়া নেই</div>}</div>
      </div>

      {s.items === 0 ? (
        <div class="sa-card"><EmptyState icon="package" title="এখনো কোনো পণ্যে স্টক গোনা চালু নেই"
          text="নিচে পণ্য বেছে &quot;স্টক গোনা চালু করুন&quot; চাপুন, তারপর প্রতিটার সংখ্যা বসান। চাইলে পণ্যের পেজ থেকেও চালু করা যায়।" /></div>
      ) : (
        <>
          <div class="orders-tools">
            <div class="tabs">{tab("all", "সব", s.items)}{tab("low", "কম আছে", s.low_count ?? 0)}{tab("out", "শেষ", s.out_count ?? 0)}</div>
            <form method="get" action="/admin/inventory" class="search">
              <input type="hidden" name="f" value={p.filter} />
              <input type="search" name="q" value={p.q} placeholder="পণ্যের নাম দিয়ে খুঁজুন" />
              <button class="btn btn-outline"><Icon name="search" size="sm" /> খুঁজুন</button>
            </form>
          </div>
          {p.rows.length === 0 ? (
            <div class="sa-card"><EmptyState icon="package" title="এই তালিকায় কিছু নেই" /></div>
          ) : (
            <form method="post" action="/admin/inventory" class="inv-form">
              <div class="table-wrap">
                <table class="table inv-table">
                  <thead><tr><th>পণ্য</th><th>অবস্থা</th><th>৩০ দিনে বিক্রি</th><th>স্টক</th><th>যোগ/বিয়োগ</th></tr></thead>
                  <tbody>
                    {p.rows.map((r) => {
                      const key = `${r.product_id}_${r.variant_id ?? 0}`;
                      return (
                        <tr class={r.is_active ? "" : "dim"}>
                          <td>
                            <div class="inv-name">
                              <img src={imageUrl(r.image)} width="40" height="40" class="thumb" alt="" loading="lazy" />
                              <div><a href={`/admin/products/${r.product_id}/edit`}><strong>{r.name}</strong></a>{r.label && <><br /><small>{r.label}</small></>}
                                <br /><small class="muted">{taka(r.price)}{r.cost_price != null ? ` · ক্রয় ${taka(r.cost_price)}` : ""}</small></div>
                            </div>
                          </td>
                          <td><StockBadge r={r} /></td>
                          <td>{bn(Math.max(0, r.sold_30))}</td>
                          <td><input type="number" name={`s_${key}`} value={String(r.stock)} min="0" class="w-sm input-sm" aria-label={`${r.name} ${r.label ?? ""} স্টক`} /></td>
                          <td><input type="number" name={`a_${key}`} placeholder="+১০" class="w-sm input-sm" aria-label="যোগ বা বিয়োগ" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div class="inv-save sa-card">
                <label class="field"><span>নোট (ঐচ্ছিক)</span><input type="text" name="note" maxlength={100} placeholder="যেমন: নতুন মাল এসেছে" /></label>
                <button class="btn btn-primary"><Icon name="check" size="sm" /> স্টক সেভ করুন</button>
              </div>
              <p class="muted small">"স্টক" ঘরে নতুন সংখ্যা লিখুন, অথবা "যোগ/বিয়োগ" ঘরে +১০ বা -২ লিখুন (নতুন মাল এলে বা নষ্ট হলে)।</p>
            </form>
          )}
        </>
      )}

      {p.untracked.length > 0 && (
        <details class="sa-card inv-untracked" open={s.items === 0}>
          <summary><strong>স্টক গোনা হয় না এমন পণ্য ({bn(s.untracked)})</strong> <small class="muted">— এগুলো কখনো "স্টক নেই" হয় না</small></summary>
          <form method="post" action="/admin/inventory/track">
            <div class="inv-pick">
              {p.untracked.map((u) => (
                <label class={`inline-check ${u.is_active ? "" : "dim"}`}><input type="checkbox" name="ids" value={String(u.id)} /> {u.name}</label>
              ))}
            </div>
            <button class="btn btn-outline btn-sm"><Icon name="package" size="sm" /> স্টক গোনা চালু করুন</button>
          </form>
        </details>
      )}

      {p.moves.length > 0 && (
        <section class="sa-card inv-moves">
          <h2>স্টকের শেষ বদলগুলো</h2>
          <div class="table-wrap">
            <table class="table compact">
              <thead><tr><th>সময়</th><th>পণ্য</th><th>বদল</th><th>পরে</th><th>কারণ</th></tr></thead>
              <tbody>
                {p.moves.map((m) => (
                  <tr>
                    <td><small>{dhakaTime(m.created_at)}</small></td>
                    <td>{m.name}{m.label ? <small class="muted"> ({m.label})</small> : ""}</td>
                    <td class={m.change < 0 ? "inv-minus" : "inv-plus"}>{m.change > 0 ? "+" : ""}{bn(m.change)}</td>
                    <td>{bn(m.stock_after)}</td>
                    <td><small>{REASON[m.reason] ?? m.reason}{m.order_id ? <> · <a href={`/admin/orders/${m.order_id}`}>{m.order_no ?? `#${m.order_id}`}</a></> : ""}{m.note ? ` · ${m.note}` : ""}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
};
