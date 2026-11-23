/**
 * বিলিং পেজের উপরের অংশ: প্যাকেজের মেয়াদ, কত অর্ডার ব্যবহার হলো আর সীমা কত,
 * সীমার বেশি অর্ডার, এই মাসের দিন-ভিত্তিক হিসাব আর বিলের ইতিহাস।
 * ডাটা: routes/admin.tsx renderBilling → loadUsage (platform ledger-এর plan_order/trial_order সারি — প্রতি কনফার্ম অর্ডারে একটা)
 */
import { overageCharge, type Plan } from "../../platform/plans";
import { bn, taka } from "../lib/format";
import { Icon, type IconName } from "./icons";

export type UsageDay = { day: string; first: string; last: string; count: number; fee: number };
export type BillRow = { kind: "trial" | "monthly" | "plan_change" | "overage"; start: string; end: string | null; note: string; amount: number; orders: number | null; current: boolean };
export type UsageView = {
  trial: boolean;
  plan: Plan;
  cycleMonths: number;
  /** মেয়াদ শেষ (ট্রায়াল শেষ বা পরের বিল) — UTC */
  renewsAt: string | null;
  /** এই মাসের হিসাব শুরু/শেষ (সীমা মাসে মাসে নতুন) — UTC */
  periodStart: string | null;
  periodEnd: string | null;
  used: number;
  limit: number;
  days: UsageDay[];
  bills: BillRow[];
  saving?: { name: string; amount: number } | null;
};

const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const toDate = (utc: string) => new Date(utc.replace(" ", "T") + (utc.endsWith("Z") ? "" : "Z"));
/** UTC → ঢাকার তারিখ, যেমন "১৪ ডিসেম্বর ২০২৬" */
export function dhakaDay(utc: string | null): string {
  if (!utc) return "—";
  const d = new Date(toDate(utc).getTime() + 6 * 3600e3);
  if (isNaN(d.getTime())) return utc;
  return `${bn(d.getUTCDate())} ${MONTHS_BN[d.getUTCMonth()]} ${bn(d.getUTCFullYear())}`;
}
/** "YYYY-MM-DD" (ঢাকার দিন) → "১৪ নভেম্বর" */
const shortDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${bn(d!)} ${MONTHS_BN[m! - 1]}${y !== new Date().getUTCFullYear() ? ` ${bn(y!)}` : ""}`;
};
function daysLeft(utc: string | null): number | null {
  if (!utc) return null;
  return Math.max(0, Math.ceil((toDate(utc).getTime() - Date.now()) / 86400e3));
}

const Stat = (p: { tone: string; icon: IconName; label: string; value: string; sub: string }) => (
  <div class={`us-stat us-${p.tone}`}>
    <div class="us-stat-head"><span>{p.label}</span><i><Icon name={p.icon} size="sm" /></i></div>
    <b>{p.value}</b>
    <small>{p.sub}</small>
  </div>
);

export const UsageOverview = (p: { u: UsageView }) => {
  const u = p.u;
  const left = daysLeft(u.renewsAt);
  const over = Math.max(0, u.used - u.limit);
  const fee = u.trial ? 0 : overageCharge(u.plan, u.used);
  const pct = Math.min(100, Math.round((u.used / Math.max(1, u.limit)) * 100));
  const free = u.plan.key === "free";
  return (
    <>
      <div class="us-stats">
        <Stat tone="blue" icon="hourglass" label={u.trial ? "ফ্রি ট্রায়াল শেষ" : free ? "মাসের হিসাব নতুন হবে" : "মেয়াদ শেষ / নবায়ন"}
          value={dhakaDay(u.trial ? u.renewsAt : free ? u.periodEnd : u.renewsAt)}
          sub={left == null ? "" : left === 0 ? "আজ" : `আর ${bn(left)} দিন বাকি`} />
        <Stat tone="green" icon="shopping-cart" label={u.trial ? "ট্রায়ালের অর্ডার" : "এই মাসের অর্ডার"}
          value={bn(u.used)} sub={`${bn(u.limit)}টার মধ্যে · বাকি ${bn(Math.max(0, u.limit - u.used))}টা`} />
        <Stat tone={over ? "amber" : "mint"} icon="zap" label="সীমার বেশি অর্ডার" value={bn(over)}
          sub={u.trial ? "ট্রায়ালে বাড়তি চার্জ নেই" : over ? `বাড়তি ${taka(fee)} (মাস শেষে কাটবে)` : `সীমা পার হলে প্রতিটায় ${taka(u.plan.extra)}`} />
        <Stat tone="purple" icon="package" label={u.trial ? "ট্রায়ালে চলছে" : "প্যাকেজ"} value={u.plan.name}
          sub={u.trial ? "সব ফিচার ফ্রি" : u.plan.price ? `${taka(u.plan.price)}/মাস${u.cycleMonths > 1 ? ` · ${bn(u.cycleMonths)} মাসের প্যাক` : ""}` : "৳০ — ফ্রি"} />
      </div>

      <section class="panel us-cycle">
        <div class="us-title"><i><Icon name="chart-column" size="sm" /></i><h2>{u.trial ? "ট্রায়ালের ব্যবহার" : "এই মাসের ব্যবহার"}</h2>
          {u.periodStart && <small class="muted">{dhakaDay(u.periodStart)} → {dhakaDay(u.trial ? u.renewsAt : u.periodEnd)}</small>}
        </div>
        <p class="us-usedline"><b>{bn(u.used)}</b>টা অর্ডার ব্যবহার হয়েছে, সীমা <b>{bn(u.limit)}</b>টা</p>
        <div class={`media-meter us-meter${pct >= 100 ? " over" : pct >= 80 ? " warn" : ""}`}><i style={`width:${pct}%`}></i></div>
        <p class="muted us-hint">
          {pct >= 100 ? (u.trial ? "ট্রায়ালের অর্ডার শেষ — এখন বাছাই করা প্যাকেজ চালু হবে।" : `সীমা পার হয়েছে — প্রতিটা বাড়তি অর্ডারে ${taka(u.plan.extra)}।`)
            : pct >= 80 ? "সীমার কাছাকাছি — বেশি অর্ডার হলে বড় প্যাকেজ নিলে সস্তা পড়তে পারে।"
            : "শুধু কনফার্ম অর্ডার গোনা হয় — ফেক বা বাতিল অর্ডার গোনা হয় না।"}
        </p>
        {p.u.saving && <p class="plan-tip"><Icon name="trending-up" size="sm" /> এই মাসে যত অর্ডার, তাতে "{p.u.saving.name}" প্যাকেজে {taka(p.u.saving.amount)} বাঁচত।</p>}
        {u.days.length === 0 ? <p class="muted">এই সময়ে এখনো কোনো কনফার্ম অর্ডার নেই।</p> : (
          <div class="table-wrap"><table class="table compact us-days">
            <thead><tr><th>তারিখ</th><th>অর্ডার নম্বর</th><th class="right">অর্ডার</th><th class="right">বাড়তি চার্জ</th></tr></thead>
            <tbody>
              {u.days.map((d) => (
                <tr><td>{shortDay(d.day)}</td><td><code>#{d.first}</code>{d.count > 1 && <> → <code>#{d.last}</code></>}</td><td class="right">{bn(d.count)}</td><td class={`right${d.fee ? " danger" : ""}`}>{d.fee ? taka(d.fee) : "৳০"}</td></tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {u.bills.length > 0 && (
        <section class="panel">
          <div class="us-title"><i class="us-purple"><Icon name="file-text" size="sm" /></i><h2>বিলের ইতিহাস</h2><span class="pill">{bn(u.bills.length)}</span></div>
          <div class="table-wrap"><table class="table compact us-bills">
            <thead><tr><th>সময়কাল</th><th>বিবরণ</th><th class="right">টাকা</th><th class="right">অর্ডার</th><th>অবস্থা</th></tr></thead>
            <tbody>
              {u.bills.map((b) => (
                <tr>
                  <td>{dhakaDay(b.start)}{b.end && <> → {dhakaDay(b.end)}</>}</td>
                  <td>{b.kind === "trial" ? "ফ্রি ট্রায়াল" : b.kind === "overage" ? "সীমার বেশি অর্ডার" : b.kind === "plan_change" ? "প্যাকেজ বদল" : "প্যাকেজের বিল"}{b.note && <small class="muted"> — {b.note}</small>}</td>
                  <td class="right">{b.amount === 0 ? "৳০" : taka(Math.abs(b.amount))}{b.amount > 0 && <small class="muted"> ফেরত</small>}</td>
                  <td class="right">{b.orders == null ? "—" : bn(b.orders)}</td>
                  <td>{b.current ? <span class="pill pill-ok">চলমান</span> : <span class="pill">শেষ</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </>
  );
};
