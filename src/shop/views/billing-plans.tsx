/**
 * বিলিং পেজের উপরের অংশ: এখনকার প্ল্যান, এই মাসে কত অর্ডার হলো, প্ল্যান বদলানো।
 */
import type { BillingShop } from "../../platform/billing";
import { storageLabel, cheapestFor, CYCLES, cyclePrice, overageCharge, PLAN_KEYS, type Plan, type PlanKey } from "../../platform/plans";
import { bn, dhakaTime, taka } from "../lib/format";
import { Icon } from "./icons";

const CYCLE_LABEL: Record<number, string> = { 1: "মাসিক", 6: "৬ মাস (১০% ছাড়)", 12: "১ বছর (১৫% ছাড়)" };
const extraLabel = (p: Plan) => (p.key === "free" ? `${taka(p.extra)}/অর্ডার` : `${bn(p.extra)} টাকা/অর্ডার`);

export const PlanPanel = (p: { plans: Record<PlanKey, Plan>; oldPrices?: boolean; oldUntil?: string; shop: BillingShop; trial: boolean; staffFee: number; settings: Record<string, string> }) => {
  const cur = p.plans[(PLAN_KEYS as string[]).includes(p.shop.plan) ? (p.shop.plan as PlanKey) : "free"];
  const used = p.shop.period_orders;
  const pct = Math.min(100, Math.round((used / Math.max(1, cur.orders)) * 100));
  const over = overageCharge(cur, used);
  const best = cheapestFor(p.plans, used);
  const saving = cur.price + over - best.cost;
  const nextPlan = p.shop.plan_next && (PLAN_KEYS as string[]).includes(p.shop.plan_next) ? p.plans[p.shop.plan_next as PlanKey] : null;
  return (
    <section class="panel plan-panel">
      <div class="plan-head">
        <div>
          <small class="muted">{p.trial ? "ট্রায়ালের পরে চালু হবে" : "এখনকার প্ল্যান"}</small>
          <h2>{cur.name} <span class="muted">— {cur.price ? `${taka(cur.price)}/মাস` : "ফ্রি"}</span></h2>
          {!p.trial && p.shop.next_bill_at && <p class="muted">পরের বিল: {dhakaTime(p.shop.next_bill_at)}{p.shop.cycle_months > 1 ? ` · ${bn(p.shop.cycle_months)} মাসের প্যাক` : ""}</p>}
          {p.oldPrices && <p class="plan-note"><Icon name="info" size="sm" /> আপনার দোকান {p.oldUntil ? dhakaTime(p.oldUntil).split(",")[0] : "৩০ দিন"} পর্যন্ত আগের দামে চলছে। তারপর নতুন দাম: প্যাকেজে প্রতি অর্ডার ৳২–৩, সীমার পরে ৳৩–৫।</p>}
          {nextPlan && <p class="plan-note"><Icon name="info" size="sm" /> পরের বিলের দিন থেকে "{nextPlan.name}" {(p.shop.cycle_next ?? 1) > 1 ? `${bn(p.shop.cycle_next!)} মাসের প্যাক` : "মাসিক"} চালু হবে। মত বদলালে এখনকার প্ল্যান আবার বাছুন।</p>}
        </div>
      </div>
      {!p.trial && (
        <div class="plan-usage">
          <div class="plan-usage-row"><span>এই মাসে কনফার্ম অর্ডার</span><b>{bn(used)} / {bn(cur.orders)}</b></div>
          <div class={`media-meter${pct >= 90 ? " warn" : ""}`}><i style={`width:${pct}%`}></i></div>
          {over > 0 && <p class="muted">সীমার বেশি {bn(used - cur.orders)}টা অর্ডার — মাস শেষে বাড়তি {taka(over)} কাটবে।</p>}
          {saving > 0 && best.plan.key !== cur.key && <p class="plan-tip"><Icon name="trending-up" size="sm" /> এই মাসে যত অর্ডার, তাতে "{best.plan.name}" প্ল্যানে {taka(saving)} বাঁচত।</p>}
        </div>
      )}
      <form method="post" action="/admin/billing/plan" class="plan-form" data-confirm="প্ল্যান বদলাবেন? বড় প্ল্যান বা লম্বা মেয়াদে গেলে এখনই চালু হবে — আগের প্ল্যানের না-ব্যবহৃত টাকা বাদ যাবে, বেশি থাকলে ব্যালেন্সে ফেরত যাবে। ছোট প্ল্যান বা ছোট মেয়াদ চালু হবে পরের বিলের দিন।">
        <div class="plan-cards">
          {PLAN_KEYS.map((k) => {
            const pl = p.plans[k];
            return (
              <label class={`plan-card${k === cur.key ? " current" : ""}${k === "grow" ? " popular" : ""}`}>
                <input type="radio" name="plan" value={k} checked={k === cur.key} />
                {k === "grow" && <span class="plan-pop">জনপ্রিয়</span>}
                <b>{pl.name}</b>
                <span class="plan-price">{pl.price ? taka(pl.price) : "৳০"}<small>/মাস</small></span>
                <span>মাসে {bn(pl.orders)}টা অর্ডার</span>
                <small class="muted">এর বেশি হলে {extraLabel(pl)}</small>
                <small class="muted">{pl.staff ? `মালিক + ${bn(pl.staff)} জন স্টাফ` : "শুধু মালিক"} · {pl.domain ? "নিজের ডোমেইন" : "ফ্রি সাবডোমেইন"} · ছবি {storageLabel(pl.storage)}</small>
              </label>
            );
          })}
        </div>
        <div class="plan-cycle">
          <span>কত দিনের জন্য:</span>
          {CYCLES.map((m) => <label><input type="radio" name="months" value={String(m)} checked={m === (p.shop.cycle_months || 1)} /> {CYCLE_LABEL[m]}</label>)}
        </div>
        <p class="muted small">
          বাৎসরিকে {taka(cyclePrice(p.plans.grow.price, 12))} দিলে "বাড়ন্ত" পুরো বছর চলে। প্ল্যানের বাইরে প্রতি স্টাফ {taka(p.staffFee)}/মাস।
          ফেক বা বাতিল অর্ডার গোনা হয় না। রিচার্জ না থাকলে বিলের দিন দোকান ফ্রি প্ল্যানে নামে — বন্ধ হয় না।
        </p>
        <button class="btn btn-primary">প্ল্যান সেভ করুন</button>
      </form>
    </section>
  );
};
