/**
 * অসম্পূর্ণ অর্ডার — ফর্মে নম্বর লিখে অর্ডার না করে চলে যাওয়া ক্রেতা।
 * এক ক্লিকে কল / WhatsApp, তারপর অর্ডারে রূপান্তর।
 */
import { bn, dhakaTime, taka } from "../lib/format";
import { INCOMPLETE_TABS, whatsappLink, type IncompleteRow, type IncompleteTab } from "../lib/incomplete";
import type { Risk } from "../lib/fraud";
import type { Product } from "../lib/products";
import { AREA_LABEL } from "../lib/orders";
import { Icon } from "./icons";
import { t, type Lang } from "../i18n";
import { EmptyState, PageHead } from "./ui";
import { RiskBadge } from "./admin";

type RiskRow = Risk & { shared?: number; courier?: number | null };

// কাস্টমারের কাছে যায় — ওয়েবসাইটের ভাষায়
const waText = (r: IncompleteRow, shop: string, lang: Lang) => t(waTextBn(r, shop), lang);
const waTextBn = (r: IncompleteRow, shop: string) =>
  `আসসালামু আলাইকুম${r.name ? ` ${r.name}` : ""}, আপনি ${shop}-এ ${r.product_names || "পণ্য"} অর্ডার করতে চেয়েছিলেন। অর্ডারটা কি কনফার্ম করে দেব?`;

export const IncompletePage = (p: { rows: IncompleteRow[]; status: IncompleteTab; counts: Record<string, number>; shopName: string; risk: Record<string, RiskRow>; capture: boolean; lang?: Lang }) => (
  <>
    <PageHead
      title="অসম্পূর্ণ অর্ডার"
      desc="যারা অর্ডার ফর্মে মোবাইল নম্বর লিখেছে কিন্তু অর্ডার করেনি। ফোন বা WhatsApp করে অর্ডারটা নিয়ে নিন — অনেক বিক্রি এখান থেকেই ফেরে।"
    />
    {!p.capture && <div class="alert alert-error">অসম্পূর্ণ অর্ডার ধরা বন্ধ আছে। <a href="/admin/settings/checkout">অর্ডার ফর্মের সেটিংসে</a> চালু করুন।</div>}
    <div class="tabs">
      {(Object.keys(INCOMPLETE_TABS) as IncompleteTab[]).map((k) => (
        <a href={`/admin/incomplete?status=${k}`} class={p.status === k ? "tab active" : "tab"}>{INCOMPLETE_TABS[k]} <span class="tab-count">{bn(p.counts[k] ?? 0)}</span></a>
      ))}
    </div>
    {p.rows.length === 0 ? (
      <div class="sa-card"><EmptyState icon="hourglass" title="এই তালিকায় কেউ নেই"
        text={p.status === "open" ? "কেউ নম্বর লিখে অর্ডার না করে চলে গেলে এখানে দেখাবে। ক্রেতা নিজে পরে অর্ডার করলে নিজে থেকেই সরে যায়।" : "এখানে এখনো কিছু নেই।"} /></div>
    ) : (
      <div class="table-wrap">
        <table class="table incomplete-table">
          <thead><tr><th>ক্রেতা</th><th>পণ্য</th><th>কখন</th><th></th></tr></thead>
          <tbody>
            {p.rows.map((r) => (
              <tr>
                <td>
                  <strong>{r.name || "নাম লেখেনি"}</strong><br />
                  <a href={`tel:${r.phone}`}>{r.phone}</a> <RiskBadge r={p.risk[r.phone]} />
                  {r.address && <><br /><small class="muted">{r.address}{r.area === "inside" || r.area === "outside" ? ` · ${AREA_LABEL[r.area]}` : ""}</small></>}
                </td>
                <td>{r.product_names || "—"}<br /><small class="muted">{taka(r.subtotal)}{r.source === "cart" ? " · কার্ট থেকে" : ""}</small></td>
                <td><small>{dhakaTime(r.updated_at)}</small></td>
                <td><div class="row-actions">
                  {r.status === "converted" ? (
                    r.order_id ? <a href={`/admin/orders/${r.order_id}`} class="btn btn-outline btn-sm">{r.order_no || "অর্ডার"} দেখুন</a> : <span class="muted">অর্ডার হয়েছে</span>
                  ) : (
                    <>
                      <a href={`tel:${r.phone}`} class="btn btn-outline btn-sm"><Icon name="phone" size="sm" /> কল</a>
                      <a href={whatsappLink(r.phone, waText(r, p.shopName, p.lang ?? "bn"))} target="_blank" rel="noopener" class="btn btn-outline btn-sm"><Icon name="message-circle" size="sm" /> WhatsApp</a>
                      <a href={`/admin/incomplete/${r.id}`} class="btn btn-primary btn-sm"><Icon name="check" size="sm" /> অর্ডার বানান</a>
                      {r.status === "open" && (
                        <form method="post" action={`/admin/incomplete/${r.id}/status`} class="inline"><input type="hidden" name="status" value="called" /><button class="btn-link">কল করেছি</button></form>
                      )}
                      {r.status !== "dismissed" ? (
                        <form method="post" action={`/admin/incomplete/${r.id}/status`} class="inline"><input type="hidden" name="status" value="dismissed" /><button class="btn-link">বাদ দিন</button></form>
                      ) : (
                        <form method="post" action={`/admin/incomplete/${r.id}/status`} class="inline"><input type="hidden" name="status" value="open" /><button class="btn-link">ফিরিয়ে আনুন</button></form>
                      )}
                    </>
                  )}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <p class="muted small">তালিকা {bn(30)} দিন পর নিজে থেকে মুছে যায়। ক্রেতা ফর্মে যা লিখেছে শুধু সেটুকুই রাখা হয়।</p>
  </>
);

/** অর্ডার বানানোর ফর্ম — ক্রেতার লেখা তথ্য আগে থেকে বসানো, দরকার হলে ঠিক করে নিন */
export const IncompleteConvertPage = (p: { row: IncompleteRow; lines: Product[]; delivery: { inside: number; outside: number }; blocked: boolean; errors?: Record<string, string>; values?: Record<string, string> }) => {
  const v = p.values ?? { name: p.row.name ?? "", address: p.row.address ?? "", area: p.row.area || "inside", note: "" };
  const sub = p.lines.reduce((s, l) => s + l.price * (l.qty ?? 1), 0);
  return (
    <>
      <p><a href="/admin/incomplete">← অসম্পূর্ণ অর্ডার</a></p>
      <PageHead title="অর্ডার বানান" desc={`${p.row.phone} — ক্রেতার সাথে কথা বলে তথ্য ঠিক করে নিন। অর্ডারটা "নতুন" তালিকায় যাবে।`} />
      {p.blocked && <div class="alert alert-error">এই নম্বর আপনার ফেক অর্ডার ব্লক তালিকায় আছে — নিশ্চিত হয়ে তারপর বানান।</div>}
      {p.lines.length === 0 ? (
        <div class="sa-card"><EmptyState icon="package" title="পণ্যগুলো আর চালু নেই" text="ক্রেতা যে পণ্য বেছেছিল সেটা মুছে ফেলা বা বন্ধ করা হয়েছে।" /></div>
      ) : (
        <form method="post" action={`/admin/incomplete/${p.row.id}/convert`} class="admin-form sa-card">
          <table class="table compact">
            <tbody>
              {p.lines.map((l) => <tr><td>{l.name}{l.variant_label ? <strong> ({l.variant_label})</strong> : ""} × {bn(l.qty ?? 1)}</td><td class="right">{taka(l.price * (l.qty ?? 1))}</td></tr>)}
              <tr class="total"><td>পণ্যের দাম</td><td class="right">{taka(sub)}</td></tr>
            </tbody>
          </table>
          <div class="form-grid">
            <label class="field"><span>নাম</span><input name="name" value={v.name} required maxlength={100} />{p.errors?.name && <small class="error">{p.errors.name}</small>}</label>
            <label class="field"><span>মোবাইল</span><input value={p.row.phone} disabled /></label>
          </div>
          <label class="field"><span>ঠিকানা</span><textarea name="address" rows={2} required maxlength={300}>{v.address}</textarea>{p.errors?.address && <small class="error">{p.errors.address}</small>}</label>
          <div class="field"><span>ডেলিভারি এলাকা</span>
            <label class="inline-check"><input type="radio" name="area" value="inside" checked={v.area !== "outside"} /> {AREA_LABEL.inside} ({taka(p.delivery.inside)})</label>
            <label class="inline-check"><input type="radio" name="area" value="outside" checked={v.area === "outside"} /> {AREA_LABEL.outside} ({taka(p.delivery.outside)})</label>
          </div>
          <label class="field"><span>নোট (ঐচ্ছিক)</span><input name="note" value={v.note ?? ""} maxlength={300} /></label>
          <button class="btn btn-primary"><Icon name="check" size="sm" /> অর্ডার বানান</button>
        </form>
      )}
    </>
  );
};
