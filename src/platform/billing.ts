/**
 * বিলিং — মূল (প্ল্যাটফর্ম) ডাটাবেসে। প্ল্যানের বিবরণ: plans.ts
 * নিয়ম (১৫ নভেম্বর ২০২৬ থেকে):
 * - ট্রায়াল: trial_days দিন "বাড়ন্ত" প্ল্যান ফ্রি (অথবা trial_orders টা কনফার্ম অর্ডার)। কোনো চার্জ নেই
 * - বিলের দিন (next_bill_at) প্ল্যানের দাম আগে কাটে (১/৬/১২ মাস)। ব্যালেন্স না থাকলে দোকান ফ্রি প্ল্যানে নামে — বন্ধ হয় না
 * - প্রতিটা কনফার্ম অর্ডার গোনা হয় (ফেক/বাতিল নয়); মাস শেষে (usage_reset_at) সীমার বেশি অর্ডারের চার্জ একবারে কাটে
 * - প্ল্যানের বাইরের স্টাফ: প্রতিজন মাসে staff_fee
 * - ব্যালেন্স মাইনাস হলে grace_days দিন সতর্কবার্তা, তারপর নতুন অর্ডার বন্ধ
 */
import { cyclePrice, extraStaff, isPlan, overageCharge, planForShop, TRIAL_PLAN, type PlanKey } from "./plans";

export type PlatformSettings = Record<string, string>;

export type BillingShop = {
  id: string;
  status: string;
  balance: number;
  trial_ends_at: string | null;
  trial_orders_left: number;
  next_bill_at: string | null;
  low_balance_since: string | null;
  staff_count: number;
  plan: string;
  plan_next: string | null;
  cycle_next: number | null;
  cycle_months: number;
  period_orders: number;
  usage_reset_at: string | null;
  created_at: string;
};

let settingsCache: { at: number; value: PlatformSettings } | null = null;

export async function platformSettings(db: D1Database, fresh = false): Promise<PlatformSettings> {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < 30_000) return settingsCache.value;
  const { results } = await db.prepare("SELECT key, value FROM platform_settings").all<{ key: string; value: string }>();
  const value = Object.fromEntries(results.map((r) => [r.key, r.value ?? ""]));
  settingsCache = { at: Date.now(), value };
  return value;
}
export function clearSettingsCache() {
  settingsCache = null;
}

export const num = (s: PlatformSettings, key: string, def: number) => {
  const n = parseInt(s[key] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

const SHOP_COLS = "id, status, balance, trial_ends_at, trial_orders_left, next_bill_at, low_balance_since, staff_count, plan, plan_next, cycle_next, cycle_months, period_orders, usage_reset_at, created_at";

export async function billingShop(db: D1Database, shopId: string) {
  return db.prepare(`SELECT ${SHOP_COLS} FROM shops WHERE id = ?`).bind(shopId).first<BillingShop>();
}

/**
 * ব্যালেন্সে জমা/চার্জ — একটা transaction-এ, আর একই (ধরন, ref) দ্বিতীয়বার হলে কিছুই হয় না।
 * ফেরত দেয়: সত্যিই প্রয়োগ হয়েছে কি না।
 */
export async function applyLedger(db: D1Database, shopId: string, type: string, amount: number, ref: string, note?: string): Promise<boolean> {
  const res = await db.batch([
    db.prepare("INSERT OR IGNORE INTO ledger (shop_id, type, amount, ref, note, applied) VALUES (?, ?, ?, ?, ?, 0)").bind(shopId, type, amount, ref, note ?? null),
    db.prepare(
      `UPDATE shops SET balance = balance + ? WHERE id = ?
         AND EXISTS (SELECT 1 FROM ledger WHERE shop_id = ? AND type = ? AND ref = ? AND applied = 0)`,
    ).bind(amount, shopId, shopId, type, ref),
    db.prepare(
      `UPDATE ledger SET applied = 1, balance_after = (SELECT balance FROM shops WHERE id = ?)
       WHERE shop_id = ? AND type = ? AND ref = ? AND applied = 0`,
    ).bind(shopId, shopId, type, ref),
    db.prepare(
      `UPDATE shops SET low_balance_since = CASE WHEN balance < 0 THEN COALESCE(low_balance_since, datetime('now')) ELSE NULL END WHERE id = ?`,
    ).bind(shopId),
  ]);
  return (res[2]!.meta.changes ?? 0) > 0;
}

/**
 * বিলের দিন: প্ল্যানের দাম (১/৬/১২ মাস) + প্ল্যানের বাইরের স্টাফ। ব্যালেন্সে না কুলালে ফ্রি প্ল্যানে নামে (দোকান চলে)।
 * ফেরত দেয়: কত মাস পরে পরের বিল।
 */
async function renewPlan(db: D1Database, shop: BillingShop, s: PlatformSettings, periodRef: string): Promise<number> {
  const scheduled = isPlan(shop.plan_next);
  let key: PlanKey = scheduled ? (shop.plan_next as PlanKey) : isPlan(shop.plan) ? shop.plan : "free";
  let months = key === "free" ? 1 : (scheduled && shop.cycle_next) || shop.cycle_months || 1;
  let plan = planForShop(s, shop.created_at, key);
  const staffFee = num(s, "staff_fee", 49);
  let price = cyclePrice(plan.price, months);
  let staff = extraStaff(plan, shop.staff_count) * staffFee * months;
  if (key !== "free" && shop.balance < price + staff) {
    key = "free"; months = 1; plan = planForShop(s, shop.created_at, "free");
    price = 0; staff = extraStaff(plan, shop.staff_count) * staffFee;
  }
  await db.prepare("UPDATE shops SET plan = ?, plan_next = NULL, cycle_next = NULL, cycle_months = ? WHERE id = ?").bind(key, months, shop.id).run();
  const total = price + staff;
  if (total > 0) {
    const parts = [price ? `${plan.name} ${months > 1 ? `${months} মাস` : "মাসিক"} ৳${price}` : "", staff ? `${extraStaff(plan, shop.staff_count)} জন বাড়তি স্টাফ ৳${staff}` : ""].filter(Boolean);
    await applyLedger(db, shop.id, "monthly", -total, periodRef, parts.join(" + "));
  }
  return months;
}

/** ট্রায়াল শেষ → চালু; বেছে নেওয়া প্ল্যানের প্রথম বিল (ব্যালেন্স না থাকলে ফ্রি) */
export async function endTrial(db: D1Database, shopId: string, s: PlatformSettings): Promise<boolean> {
  const upd = await db.prepare(
    `UPDATE shops SET status = 'active', activated_at = datetime('now'), status_changed_at = datetime('now'),
       period_orders = 0, usage_reset_at = datetime('now', '+1 month') WHERE id = ? AND status = 'trial'`,
  ).bind(shopId).run();
  if (!upd.meta.changes) return false;
  const shop = await billingShop(db, shopId);
  if (shop) {
    const months = await renewPlan(db, shop, s, `trial-end:${shopId}`);
    await db.prepare("UPDATE shops SET next_bill_at = datetime('now', ?) WHERE id = ?").bind(`+${months} months`, shopId).run();
  }
  return true;
}

export function trialExpired(shop: BillingShop): boolean {
  if (shop.status !== "trial") return false;
  if (shop.trial_orders_left <= 0) return true;
  if (!shop.trial_ends_at) return false;
  return new Date(shop.trial_ends_at.replace(" ", "T") + "Z").getTime() <= Date.now();
}

/**
 * অর্ডার কনফার্ম হলে (দোকানের অ্যাডমিন থেকে) — ট্রায়ালে ফ্রি অর্ডার কমে, চালু দোকানে order_fee কাটে।
 */
export async function chargeConfirmedOrder(db: D1Database, shopId: string, orderNo: string): Promise<{ charged: number; trial: boolean }> {
  const s = await platformSettings(db);
  let shop = await billingShop(db, shopId);
  if (!shop) return { charged: 0, trial: false };

  if (shop.status === "trial" && trialExpired(shop)) {
    await endTrial(db, shopId, s);
    shop = (await billingShop(db, shopId))!;
  }

  if (shop.status === "trial") {
    const res = await db.batch([
      db.prepare("INSERT OR IGNORE INTO ledger (shop_id, type, amount, ref, note, applied) VALUES (?, 'trial_order', 0, ?, 'ট্রায়ালের ফ্রি অর্ডার', 0)").bind(shopId, orderNo),
      db.prepare(
        `UPDATE shops SET trial_orders_left = MAX(0, trial_orders_left - 1) WHERE id = ?
           AND EXISTS (SELECT 1 FROM ledger WHERE shop_id = ? AND type = 'trial_order' AND ref = ? AND applied = 0)`,
      ).bind(shopId, shopId, orderNo),
      db.prepare("UPDATE ledger SET applied = 1, balance_after = (SELECT balance FROM shops WHERE id = ?) WHERE shop_id = ? AND type = 'trial_order' AND ref = ? AND applied = 0")
        .bind(shopId, shopId, orderNo),
    ]);
    const counted = (res[2]!.meta.changes ?? 0) > 0;
    if (counted) await countOrder(db, shopId);
    const after = (await billingShop(db, shopId))!;
    if (after.trial_orders_left <= 0) await endTrial(db, shopId, s);
    return { charged: 0, trial: counted };
  }

  if (shop.status === "closed") return { charged: 0, trial: false };
  // প্ল্যানের মধ্যে: এখন কিছু কাটে না, শুধু গোনা (একই অর্ডার একবারই) — সীমার বেশি হলে মাস শেষে চার্জ
  const applied = await applyLedger(db, shopId, "plan_order", 0, orderNo, `অর্ডার ${orderNo}`);
  if (applied) {
    await db.prepare("UPDATE shops SET period_orders = period_orders + 1 WHERE id = ?").bind(shopId).run();
    await countOrder(db, shopId);
  }
  return { charged: 0, trial: false };
}

/** সুপার অ্যাডমিনের পরিসংখ্যানের জন্য দোকানের কনফার্ম অর্ডারের কাউন্টার */
async function countOrder(db: D1Database, shopId: string) {
  await db.prepare("UPDATE shops SET confirmed_orders = confirmed_orders + 1, last_order_at = datetime('now') WHERE id = ?").bind(shopId).run();
}

/** রিচার্জ অনুমোদন */
export async function approveTopup(db: D1Database, topupId: number): Promise<{ ok: boolean; message: string }> {
  const t = await db.prepare("SELECT * FROM topups WHERE id = ?").bind(topupId).first<{ id: number; shop_id: string; amount: number; method: string; trx_id: string; status: string }>();
  if (!t) return { ok: false, message: "রিচার্জ পাওয়া যায়নি" };
  if (t.status !== "pending") return { ok: false, message: "এটা আগেই সিদ্ধান্ত হয়েছে" };
  const upd = await db.prepare("UPDATE topups SET status = 'approved', decided_at = datetime('now') WHERE id = ? AND status = 'pending'").bind(topupId).run();
  if (!upd.meta.changes) return { ok: false, message: "এটা আগেই সিদ্ধান্ত হয়েছে" };
  await applyLedger(db, t.shop_id, "topup", t.amount, `topup:${t.id}`, `${t.method === "bkash" ? "bKash" : "Nagad"} ${t.trx_id}`);
  await db.prepare("UPDATE shops SET first_topup_at = COALESCE(first_topup_at, datetime('now')) WHERE id = ?").bind(t.shop_id).run();
  return { ok: true, message: `৳${t.amount} ব্যালেন্সে যোগ হয়েছে` };
}

/**
 * প্রতিদিনের কাজ (cron): ট্রায়াল শেষ হওয়া দোকান চালু করা, মাসিক চার্জ কাটা।
 * একই দিনে বারবার চালালেও দুবার চার্জ কাটে না।
 */
export async function runDailyBilling(db: D1Database): Promise<{ trialsEnded: number; monthsCharged: number }> {
  const s = await platformSettings(db, true);
  let trialsEnded = 0;
  let monthsCharged = 0;

  const { results: trials } = await db.prepare(
    `SELECT ${SHOP_COLS} FROM shops WHERE status = 'trial' AND (trial_orders_left <= 0 OR trial_ends_at <= datetime('now'))`,
  ).all<BillingShop>();
  for (const t of trials) if (await endTrial(db, t.id, s)) trialsEnded++;

  const { results: due } = await db.prepare(
    `SELECT ${SHOP_COLS} FROM shops WHERE status = 'active' AND next_bill_at IS NOT NULL AND next_bill_at <= datetime('now')`,
  ).all<BillingShop>();
  for (const shop of due) {
    // যত বিল বাকি, এক এক করে (সাধারণত একটাই)
    let next = shop.next_bill_at!;
    let guard = 0;
    while (next <= sqlNow() && guard++ < 24) {
      const cur = (await billingShop(db, shop.id))!;
      const months = await renewPlan(db, cur, s, `month:${next.slice(0, 10)}`);
      monthsCharged++;
      const row = await db.prepare("SELECT datetime(?, ?) AS n").bind(next, `+${months} months`).first<{ n: string }>();
      next = row!.n;
    }
    await db.prepare("UPDATE shops SET next_bill_at = ? WHERE id = ?").bind(next, shop.id).run();
  }

  // মাস শেষ: সীমার বেশি অর্ডারের চার্জ, তারপর গোনা শূন্য থেকে
  const { results: usage } = await db.prepare(
    `SELECT ${SHOP_COLS} FROM shops WHERE status IN ('active', 'suspended') AND usage_reset_at IS NOT NULL AND usage_reset_at <= datetime('now')`,
  ).all<BillingShop>();
  for (const shop of usage) {
    // মাসটা যেদিন শুরু হয়েছিল সেদিনের দাম (আগের দামের সময়ে শুরু হওয়া মাস আগের দামেই)
    const periodStart = new Date(shop.usage_reset_at!.replace(" ", "T") + "Z");
    periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
    const plan = planForShop(s, shop.created_at, shop.plan, periodStart.getTime());
    const fee = overageCharge(plan, shop.period_orders);
    if (fee > 0) {
      await applyLedger(db, shop.id, "overage", -fee, `over:${shop.usage_reset_at!.slice(0, 10)}`,
        `${plan.name}: ${shop.period_orders} অর্ডার, সীমা ${plan.orders} — বাড়তি ${shop.period_orders - plan.orders}টা`);
    }
    await db.prepare("UPDATE shops SET period_orders = 0, usage_reset_at = datetime(usage_reset_at, '+1 month') WHERE id = ?").bind(shop.id).run();
  }
  return { trialsEnded, monthsCharged };
}

function sqlNow(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/* ---------------- দোকান এখন অর্ডার নিতে পারবে কি না ---------------- */

export type ShopState = {
  status: string;
  accepting: boolean;
  reason: "ok" | "trial" | "low_balance" | "blocked_balance" | "suspended";
  balance: number;
  trial_ends_at: string | null;
  trial_orders_left: number;
  grace_ends_at: string | null;
  /** এই মাসে প্ল্যানের কতটা অর্ডার হলো (চালু দোকানে) */
  usage?: { used: number; limit: number; extra: number; plan: string };
  /** ছবির জায়গার সীমা, MB (ট্রায়ালে ট্রায়ালের প্ল্যানের) */
  storage_mb?: number;
};

export function computeState(shop: BillingShop, s: PlatformSettings): ShopState {
  const base = {
    status: shop.status,
    balance: shop.balance,
    trial_ends_at: shop.trial_ends_at,
    trial_orders_left: shop.trial_orders_left,
    grace_ends_at: null as string | null,
    usage: undefined as ShopState["usage"],
    storage_mb: planForShop(s, shop.created_at, shop.status === "trial" ? TRIAL_PLAN : shop.plan).storage,
  };
  if (shop.status === "active") {
    const p = planForShop(s, shop.created_at, shop.plan);
    base.usage = { used: shop.period_orders ?? 0, limit: p.orders, extra: p.extra, plan: p.name };
  }
  if (shop.status === "suspended") return { ...base, accepting: false, reason: "suspended" };
  if (shop.status === "trial") return { ...base, accepting: true, reason: "trial" };
  if (shop.balance < 0 && shop.low_balance_since) {
    const since = new Date(shop.low_balance_since.replace(" ", "T") + "Z").getTime();
    const graceEnd = since + num(s, "grace_days", 3) * 86_400_000;
    const grace_ends_at = new Date(graceEnd).toISOString().replace("T", " ").slice(0, 19);
    if (Date.now() >= graceEnd) return { ...base, grace_ends_at, accepting: false, reason: "blocked_balance" };
    return { ...base, grace_ends_at, accepting: true, reason: "low_balance" };
  }
  return { ...base, accepting: true, reason: "ok" };
}

/* ---------------- দোকানদার নিজে প্ল্যান বদলায় ---------------- */

export type PlanChange = { ok: boolean; message: string; charged?: number; credited?: number };

/** নিচে নামা কি না: মাসিক দাম কম, অথবা একই দামে ছোট মেয়াদ — এগুলো পরের বিলের দিন থেকে */
export function isDowngrade(curPrice: number, curMonths: number, nextPrice: number, nextMonths: number): boolean {
  if (nextPrice !== curPrice) return nextPrice < curPrice;
  return nextMonths < curMonths;
}

/** এখনকার মেয়াদের না-ব্যবহৃত অংশের টাকা (মেয়াদের আসল দিন ধরে) */
export function unusedCredit(paid: number, months: number, nextBillAt: string | null, now = Date.now()): number {
  if (!paid || !nextBillAt) return 0;
  const end = new Date(nextBillAt.replace(" ", "T") + "Z");
  if (isNaN(end.getTime()) || end.getTime() <= now) return 0;
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - Math.max(1, months));
  const span = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(paid * Math.min(1, (end.getTime() - now) / span)));
}

/**
 * প্ল্যান বদল (Stripe-এর মতো সাধারণ নিয়ম):
 * - উপরে ওঠা (মাসিক দাম বেশি, বা একই দামে লম্বা মেয়াদ): এখনই চালু। আগের মেয়াদের না-ব্যবহৃত টাকা বাদ যায়;
 *   সেটা নতুন দামের চেয়ে বেশি হলে বাকিটা ব্যালেন্সে জমা হয় — কোনো টাকা হারায় না।
 * - নিচে নামা (দাম কম, বা একই দামে ছোট মেয়াদ): পরের বিলের দিন থেকে; ততদিন টাকা দেওয়া প্ল্যান চলে।
 * - ট্রায়ালে: শুধু বেছে রাখা হয় — ট্রায়াল শেষে সেটাই চালু হবে।
 */
export async function changePlan(db: D1Database, shopId: string, key: PlanKey, months: number, s: PlatformSettings): Promise<PlanChange> {
  const shop = await billingShop(db, shopId);
  if (!shop) return { ok: false, message: "দোকান পাওয়া যায়নি" };
  if (key === "free") months = 1;
  const next = planForShop(s, shop.created_at, key);
  if (shop.status === "trial") {
    await db.prepare("UPDATE shops SET plan = ?, cycle_months = ?, plan_next = NULL, cycle_next = NULL WHERE id = ?").bind(key, months, shopId).run();
    return { ok: true, message: `ট্রায়াল শেষে "${next.name}" প্ল্যান চালু হবে।` };
  }
  const cur = planForShop(s, shop.created_at, shop.plan);
  const curMonths = cur.key === "free" ? 1 : shop.cycle_months || 1;
  if (cur.key === key && curMonths === months) {
    await db.prepare("UPDATE shops SET plan_next = NULL, cycle_next = NULL WHERE id = ?").bind(shopId).run();
    return { ok: true, message: `"${cur.name}" প্ল্যানই চালু থাকছে${shop.plan_next ? " — আগে বেছে রাখা বদল বাতিল হয়েছে" : ""}।` };
  }
  if (isDowngrade(cur.price, curMonths, next.price, months)) {
    await db.prepare("UPDATE shops SET plan_next = ?, cycle_next = ? WHERE id = ?").bind(key, months, shopId).run();
    const when = shop.next_bill_at ? ` (${shop.next_bill_at.slice(0, 10)})` : "";
    return { ok: true, message: `পরের বিলের দিন${when} থেকে "${next.name}" ${months > 1 ? `${months} মাসের প্যাক` : "মাসিক"} চালু হবে। ততদিন টাকা দেওয়া "${cur.name}" চলবে।` };
  }
  const newTotal = cyclePrice(next.price, months);
  const credit = cur.key === "free" ? 0 : unusedCredit(cyclePrice(cur.price, curMonths), curMonths, shop.next_bill_at);
  const charge = Math.max(0, newTotal - credit);
  const refund = Math.max(0, credit - newTotal);
  if (shop.balance < charge) {
    return { ok: false, message: `এই প্ল্যানে যেতে ৳${charge} লাগবে${credit ? ` (আগের প্ল্যানের বাকি ৳${credit} বাদ দিয়ে)` : ""}, ব্যালেন্সে আছে ৳${shop.balance}। আগে রিচার্জ করুন।` };
  }
  const stamp = new Date().toISOString().slice(0, 19);
  const label = `${next.name} ${months > 1 ? `${months} মাস` : "মাসিক"}`;
  if (charge > 0) await applyLedger(db, shopId, "plan_change", -charge, `plan:${key}:${months}:${stamp}`, `${label} ৳${newTotal}${credit ? ` − আগের প্ল্যানের না-ব্যবহৃত ৳${credit}` : ""}`);
  if (refund > 0) await applyLedger(db, shopId, "plan_change", refund, `plan-credit:${key}:${months}:${stamp}`, `আগের প্ল্যানের না-ব্যবহৃত ৳${credit} − ${label} ৳${newTotal} — বাকিটা ব্যালেন্সে`);
  await db.prepare("UPDATE shops SET plan = ?, plan_next = NULL, cycle_next = NULL, cycle_months = ?, next_bill_at = datetime('now', ?) WHERE id = ?")
    .bind(key, months, `+${months} months`, shopId).run();
  const tail = charge ? ` — ৳${charge} কেটেছে` : refund ? ` — আগের প্ল্যানের বাকি ৳${refund} ব্যালেন্সে ফেরত গেছে` : "";
  return { ok: true, message: `"${next.name}" প্ল্যান চালু হয়েছে${tail}।`, charged: charge, credited: refund };
}
