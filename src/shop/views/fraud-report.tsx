/**
 * ক্রেতার কুরিয়ার রিপোর্ট / ফ্রড রিপোর্ট:
 * - CourierCard: অর্ডার তালিকায় ছোট বার ("৩০টার মধ্যে ২৭টা ডেলিভারি")
 * - FraudReport: পুরো রিপোর্ট — সফলতা, কুরিয়ার অনুযায়ী ভাগ, ফ্রড রিপোর্ট, এই দোকানের অর্ডার, SellxBD-এর অন্য দোকান
 * - FraudCheckPage: যেকোনো নম্বর লিখে খোঁজা
 */
import type { Child } from "hono/jsx";
import type { CourierSummary, Own, Shared } from "../lib/fraud";
import { bn, dhakaTime, taka } from "../lib/format";
import { Icon } from "./icons";

const STATUS_LABEL: Record<string, string> = { new: "নতুন", confirmed: "কনফার্ম", shipped: "পাঠানো", cancelled: "বাতিল", fake: "ফেক" };

/** সফলতার হার থেকে লেবেল আর রং */
export function grade(ratio: number | null, total: number): { label: string; tone: "new" | "ok" | "good" | "warn" | "bad" } {
  if (ratio == null || total === 0) return { label: "নতুন ক্রেতা", tone: "new" };
  if (ratio >= 90) return { label: "চমৎকার ক্রেতা", tone: "ok" };
  if (ratio >= 75) return { label: "ভালো ক্রেতা", tone: "good" };
  if (ratio >= 50) return { label: "সাবধান", tone: "warn" };
  return { label: "ঝুঁকিপূর্ণ", tone: "bad" };
}

/** ডেলিভারি/ফেরতের বার */
const Bar = ({ ok, bad }: { ok: number; bad: number }) => {
  const t = ok + bad;
  const okPct = t ? Math.round((ok / t) * 100) : 0;
  return (
    <span class="cr-bar" role="img" aria-label={t ? `${okPct}% ডেলিভারি` : "রেকর্ড নেই"}>
      {t > 0 && <><i class="cr-ok" style={`width:${okPct}%`} /><i class="cr-bad" style={`width:${100 - okPct}%`} /></>}
    </span>
  );
};

const SHORT: Record<string, string> = { "নতুন ক্রেতা": "নতুন", "চমৎকার ক্রেতা": "চমৎকার", "ভালো ক্রেতা": "ভালো", "সাবধান": "সাবধান", "ঝুঁকিপূর্ণ": "ঝুঁকি" };

/** অর্ডার তালিকার ছোট কার্ড — বাঁয়ে বড় শতাংশ, ডানে বার আর হিসাব; চাপলে পুরো রিপোর্ট খোলে */
export const CourierCard = ({ phone, orderId, sum, ready, error }: { phone: string; orderId?: number; sum?: CourierSummary | null; ready: boolean; error?: string }) => {
  if (!sum) {
    if (!ready) return null;
    return (
      <button type="button" class="cr-card cr-wait" data-cr-open={phone} data-cr-order={orderId} data-cr-auto={error || !orderId ? undefined : String(orderId)} title="পুরো রিপোর্ট দেখুন">
        <span class="cr-pct"><Icon name="truck" size="sm" /></span>
        <span class="cr-body">
          <span class="cr-head">কুরিয়ার রিপোর্ট</span>
          <Bar ok={0} bad={0} />
          <span class="cr-text">{error ? "খোঁজা যায়নি — চেপে আবার দেখুন" : "খুঁজছি…"}</span>
        </span>
      </button>
    );
  }
  const empty = sum.total === 0 || sum.ratio == null;
  const text = empty
    ? "কুরিয়ারে কোনো পার্সেল নেই"
    : sum.approx
      ? "Steadfast-এর হিসাব"
      : `${bn(sum.total)}টার মধ্যে ${bn(sum.success)}টা ডেলিভারি`;
  const g = grade(sum.ratio, sum.total);
  return (
    <button type="button" class={`cr-card cr-t-${g.tone}`} data-cr-open={phone} data-cr-order={orderId} title="পুরো রিপোর্ট দেখুন">
      <span class="cr-pct">{empty ? <Icon name="truck" size="sm" /> : <>{bn(sum.ratio!)}<small>%</small></>}</span>
      <span class="cr-body">
        <span class="cr-head"><span class="cr-grade">{SHORT[g.label] ?? g.label}</span>কুরিয়ার রিপোর্ট{(sum.reports ?? 0) > 0 && <span class="cr-flag" title={`${bn(sum.reports!)}টা ফ্রড রিপোর্ট`}>⚠ {bn(sum.reports!)} ফ্রড</span>}</span>
        {sum.approx && !empty ? <Bar ok={sum.ratio!} bad={100 - sum.ratio!} /> : <Bar ok={sum.success} bad={sum.cancelled} />}
        <span class="cr-text">{text}</span>
      </span>
      <span class="cr-go" aria-hidden="true">›</span>
    </button>
  );
};

export type ReportOrder = { id: number; order_no: string; created_at: string; total: number; status: string; outcome: string | null; consignment_id: string | null };
export type ReportData = { phone: string; orderId?: number; courier: CourierSummary | null; own?: Own; shared?: Shared; sharing: boolean; orders: ReportOrder[]; ready: boolean; error?: string };

/** পুরো রিপোর্ট (মোডাল আর চেকার পেজ দুজায়গায়) */
export const FraudReport = ({ d, refresh = true }: { d: ReportData; refresh?: boolean }) => {
  const c = d.courier;
  const own = d.own;
  const sh = d.shared;
  // উপরের বড় সংখ্যা: কুরিয়ার + এই দোকান + অন্য দোকান মিলিয়ে
  const ok = (c?.approx ? 0 : c?.success ?? 0) + (own?.delivered ?? 0) + (sh?.delivered ?? 0);
  const bad = (c?.approx ? 0 : c?.cancelled ?? 0) + (own?.returned ?? 0) + (own?.fake ?? 0) + (sh?.returned ?? 0) + (sh?.fake ?? 0);
  const total = ok + bad;
  const ratio = total ? Math.round((ok / total) * 100) : c?.approx ? c.ratio : null;
  const g = grade(ratio, total || (c?.approx && c.total ? c.total : 0));
  return (
    <div class="fr" data-fr-phone={d.phone}>
      <div class="fr-cards">
        <div class={`fr-main fr-${g.tone}`}>
          <small>সফলতার হার · {g.label}</small>
          <b>{ratio == null ? "—" : `${bn(ratio)}%`}</b>
          <Bar ok={ok || (c?.approx ? c.success : 0)} bad={bad || (c?.approx ? c.cancelled : 0)} />
        </div>
        <div class="fr-num"><small>মোট</small><b>{bn(total)}</b></div>
        <div class="fr-num"><small>ডেলিভারি</small><b class="fr-okc">{bn(ok)}</b></div>
        <div class="fr-num"><small>ফেরত / ফেক</small><b class="fr-badc">{bn(bad)}</b></div>
      </div>

      <h3 class="fr-h">কুরিয়ার অনুযায়ী</h3>
      {c ? (
        <>
          {(c.reports ?? 0) > 0 && <p class="fr-alert"><Icon name="triangle-alert" size="sm" /> অন্য ব্যবসায়ীরা এই নম্বরে <b>{bn(c.reports!)}টা ফ্রড রিপোর্ট</b> করেছেন।</p>}
          {c.couriers?.length ? (
            <div class="table-wrap"><table class="table compact fr-table">
              <thead><tr><th>কুরিয়ার</th><th class="num">মোট</th><th class="num">ডেলিভারি</th><th class="num">ফেরত</th><th class="num">সফলতা</th></tr></thead>
              <tbody>
                {c.couriers.map((r) => (
                  <tr class={r.total ? "" : "fr-zero"}>
                    <td><span class="fr-courier">{r.logo ? <img src={r.logo} alt="" width="22" height="22" loading="lazy" referrerpolicy="no-referrer" /> : <span class="fr-logo-x">{r.name.slice(0, 1)}</span>}{r.name}</span></td>
                    <td class="num">{c.approx ? "—" : bn(r.total)}</td>
                    <td class="num fr-okc">{c.approx ? "—" : bn(r.success)}</td>
                    <td class="num fr-badc">{c.approx ? "—" : bn(r.cancelled)}</td>
                    <td class="num">{r.ratio == null ? "—" : <span class={`fr-pill ${r.ratio >= 80 ? "ok" : r.ratio >= 50 ? "warn" : "bad"}`}>{bn(r.ratio)}%</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p class="muted small">কুরিয়ারে মোট {bn(c.total)}টা পার্সেল, সফল {bn(c.ratio ?? 0)}%।</p>}
          <p class="muted small">{d.orderId ? "এই অর্ডারের জন্য একবার খোঁজা, অর্ডারে সেভ করা · " : ""}সূত্র: {c.source}{c.approx ? " — Steadfast শুধু শতাংশ দেয়, সঠিক সংখ্যা নয়" : ""}{c.checked_at ? ` · খোঁজা হয়েছে ${dhakaTime(c.checked_at)}` : ""}</p>
        </>
      ) : d.error ? <p class="fr-alert">{d.error}</p>
        : d.ready ? <p class="muted small">এখনো কুরিয়ারে খোঁজা হয়নি।</p>
        : <p class="muted small">কুরিয়ারের রিপোর্ট দেখতে <a href="/admin/courier">কুরিয়ার সেটিংসে</a> Steadfast-এর চাবি বা BD Courier-এর API কী দিন।</p>}
      {d.ready && refresh && <button type="button" class="btn btn-outline btn-sm" data-cr-refresh={d.phone} data-cr-order={d.orderId}><Icon name="rotate-ccw" size="sm" /> {c ? "কুরিয়ারে আবার খুঁজুন" : "কুরিয়ারে খুঁজুন"}</button>}

      <h3 class="fr-h">SellxBD-এর অন্য দোকানে</h3>
      {d.sharing
        ? (sh && sh.delivered + sh.returned + sh.cancelled + sh.fake > 0
          ? <p class="small">{bn(sh.shops)}টা দোকানে — ডেলিভারি <b class="fr-okc">{bn(sh.delivered)}</b>, ফেরত <b class="fr-badc">{bn(sh.returned)}</b>, বাতিল {bn(sh.cancelled)}, ফেক <b class="fr-badc">{bn(sh.fake)}</b> <small class="muted">(দোকানের নাম দেখানো হয় না)</small></p>
          : <p class="muted small">অন্য কোনো দোকানে রেকর্ড নেই।</p>)
        : <p class="muted small">অন্য দোকানের রেকর্ড দেখা বন্ধ — <a href="/admin/courier">কুরিয়ার সেটিংসে</a> চালু করুন।</p>}

      <h3 class="fr-h">এই দোকানে ক্রেতার অর্ডার</h3>
      {d.orders.length ? (
        <div class="table-wrap"><table class="table compact fr-table">
          <thead><tr><th>অর্ডার</th><th>তারিখ</th><th class="num">টাকা</th><th>অবস্থা</th></tr></thead>
          <tbody>{d.orders.map((o) => (
            <tr>
              <td><a href={`/admin/orders/${o.id}`}>{o.order_no}</a></td>
              <td><small>{dhakaTime(o.created_at)}</small></td>
              <td class="num">{taka(o.total)}</td>
              <td>{o.outcome === "delivered" ? <span class="fr-pill ok">ডেলিভারি হয়েছে</span> : o.outcome === "returned" ? <span class="fr-pill bad">ফেরত এসেছে</span> : <span class={`fr-pill ${o.status === "fake" || o.status === "cancelled" ? "bad" : ""}`}>{STATUS_LABEL[o.status] ?? o.status}</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p class="muted small">এই দোকানে এই নম্বরের কোনো অর্ডার নেই।</p>}
    </div>
  );
};

/** মোডাল — অর্ডার তালিকায় একবার রাখা, ভিতরের লেখা JS দিয়ে আসে */
export const FraudDialog = () => (
  <dialog id="fr-dlg" class="fr-dlg" aria-labelledby="fr-dlg-title">
    <div class="fr-dlg-head">
      <div><strong id="fr-dlg-title">ফ্রড রিপোর্ট</strong><br /><small class="muted">ক্রেতা <code data-fr-title-phone></code></small></div>
      <button type="button" class="fr-x" data-fr-close aria-label="বন্ধ"><Icon name="x" /></button>
    </div>
    <div class="fr-dlg-body" data-fr-body><p class="muted center">লোড হচ্ছে…</p></div>
  </dialog>
);

export const FraudCheckPage = ({ phone, input, error, report }: { phone?: string; input?: string; error?: string; report?: Child }) => (
  <>
    <h1>ফ্রড চেকার</h1>
    <p class="muted">অর্ডার নেওয়ার আগেই যেকোনো মোবাইল নম্বরের কুরিয়ার রেকর্ড দেখুন — কত পার্সেল নিয়েছে, কত ফেরত দিয়েছে, কেউ ফ্রড রিপোর্ট করেছে কি না।</p>
    <form method="get" action="/admin/fraud-check" class="fr-search">
      <input type="tel" name="phone" value={input ?? phone ?? ""} placeholder="01XXXXXXXXX" inputmode="tel" autocomplete="off" required aria-label="মোবাইল নম্বর" />
      <button class="btn btn-primary"><Icon name="search" size="sm" /> রিপোর্ট দেখুন</button>
    </form>
    {error && <p class="alert alert-error">{error}</p>}
    {report && <section class="panel"><h2>ক্রেতা <code>{phone}</code></h2>{report}</section>}
  </>
);
