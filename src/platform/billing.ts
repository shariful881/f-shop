/**
 * বিলিং — মূল (প্ল্যাটফর্ম) ডাটাবেসে।
 * নিয়ম:
 * - ট্রায়াল: trial_days দিন অথবা trial_orders টা কনফার্ম অর্ডার, যেটা আগে শেষ হয়। কোনো চার্জ নেই
 * - ট্রায়াল শেষে দোকান 'active' হয়, সাথে সাথে প্রথম মাসের চার্জ (মাসিক + স্টাফ)
 * - প্রতিটা কনফার্ম অর্ডারে order_fee (ফেক/বাতিলে কিছু নয়), একই অর্ডারে একবারই
 * - প্রতি মাসে monthly_fee + staff_count × staff_fee
 * - ব্যালেন্স মাইনাস হলে grace_days দিন সতর্কবার্তা, তারপর নতুন অর্ডার বন্ধ
 */

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

const SHOP_COLS = "id, status, balance, trial_ends_at, trial_orders_left, next_bill_at, low_balance_since, staff_count";

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

/** মাসিক চার্জ (মাসিক ফি + স্টাফ) */
async function chargeMonth(db: D1Database, shop: BillingShop, s: PlatformSettings, periodRef: string) {
  const monthly = num(s, "monthly_fee", 99);
  const staff = shop.staff_count * num(s, "staff_fee", 99);
  const note = staff ? `মাসিক ৳${monthly} + ${shop.staff_count} জন স্টাফ ৳${staff}` : `মাসিক ৳${monthly}`;
  return applyLedger(db, shop.id, "monthly", -(monthly + staff), periodRef, note);
}

/** ট্রায়াল শেষ → চালু, আর প্রথম মাসের চার্জ */
export async function endTrial(db: D1Database, shopId: string, s: PlatformSettings): Promise<boolean> {
  const upd = await db.prepare(
    "UPDATE shops SET status = 'active', next_bill_at = datetime('now', '+1 month') WHERE id = ? AND status = 'trial'",
  ).bind(shopId).run();
  if (!upd.meta.changes) return false;
  const shop = await billingShop(db, shopId);
  if (shop) await chargeMonth(db, shop, s, `trial-end:${shopId}`);
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
    const after = (await billingShop(db, shopId))!;
    if (after.trial_orders_left <= 0) await endTrial(db, shopId, s);
    return { charged: 0, trial: (res[2]!.meta.changes ?? 0) > 0 };
  }

  if (shop.status === "closed") return { charged: 0, trial: false };
  const fee = num(s, "order_fee", 2);
  const applied = await applyLedger(db, shopId, "order_fee", -fee, orderNo, `অর্ডার ${orderNo}`);
  return { charged: applied ? fee : 0, trial: false };
}

/** রিচার্জ অনুমোদন */
export async function approveTopup(db: D1Database, topupId: number): Promise<{ ok: boolean; message: string }> {
  const t = await db.prepare("SELECT * FROM topups WHERE id = ?").bind(topupId).first<{ id: number; shop_id: string; amount: number; method: string; trx_id: string; status: string }>();
  if (!t) return { ok: false, message: "রিচার্জ পাওয়া যায়নি" };
  if (t.status !== "pending") return { ok: false, message: "এটা আগেই সিদ্ধান্ত হয়েছে" };
  const upd = await db.prepare("UPDATE topups SET status = 'approved', decided_at = datetime('now') WHERE id = ? AND status = 'pending'").bind(topupId).run();
  if (!upd.meta.changes) return { ok: false, message: "এটা আগেই সিদ্ধান্ত হয়েছে" };
  await applyLedger(db, t.shop_id, "topup", t.amount, `topup:${t.id}`, `${t.method === "bkash" ? "bKash" : "Nagad"} ${t.trx_id}`);
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
    `SELECT ${SHOP_COLS} FROM shops WHERE status IN ('active', 'suspended') AND next_bill_at IS NOT NULL AND next_bill_at <= datetime('now')`,
  ).all<BillingShop>();
  for (const shop of due) {
    // যত মাস বাকি, এক এক করে (সাধারণত একটাই)
    let next = shop.next_bill_at!;
    let guard = 0;
    while (next <= sqlNow() && guard++ < 24) {
      if (await chargeMonth(db, shop, s, `month:${next.slice(0, 10)}`)) monthsCharged++;
      const row = await db.prepare("SELECT datetime(?, '+1 month') AS n").bind(next).first<{ n: string }>();
      next = row!.n;
    }
    await db.prepare("UPDATE shops SET next_bill_at = ? WHERE id = ?").bind(next, shop.id).run();
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
};

export function computeState(shop: BillingShop, s: PlatformSettings): ShopState {
  const base = {
    status: shop.status,
    balance: shop.balance,
    trial_ends_at: shop.trial_ends_at,
    trial_orders_left: shop.trial_orders_left,
    grace_ends_at: null as string | null,
  };
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
