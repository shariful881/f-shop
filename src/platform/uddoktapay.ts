/**
 * UddoktaPay — দোকানদারের অনলাইন রিচার্জ (bKash, Nagad, Rocket, Upay…)।
 * টাকা আসে SellxBD-র UddoktaPay অ্যাকাউন্টে; পেমেন্ট "COMPLETED" যাচাই হলে নিজে থেকে ব্যালেন্সে যোগ হয়।
 * নিরাপত্তা: ফেরত আসা লিংক বা webhook-এর কথা বিশ্বাস করা হয় না — সবসময় গেটওয়ের verify API দিয়ে যাচাই,
 * আর আমাদের রেকর্ডের টাকা/দোকান মিলিয়ে, একবারই যোগ (ledger ref ইউনিক)।
 * API: https://uddoktapay.readme.io/reference/create-charge-api-guideline
 */
import { applyLedger, platformSettings } from "./billing";

export type UddoktaConfig = { base: string; key: string };

/** সুপার অ্যাডমিনে চালু আর URL+key দেওয়া থাকলে কনফিগ, নইলে null */
export function uddoktaConfig(s: Record<string, string>): UddoktaConfig | null {
  if (s.uddokta_on !== "1") return null;
  const key = (s.uddokta_key || "").trim();
  let base = (s.uddokta_url || "").trim().replace(/\/+$/, "").replace(/\/api(\/checkout-v2)?$/, "");
  if (!key || !/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/i.test(base)) return null;
  return { base, key };
}

async function call<T>(cfg: UddoktaConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${cfg.base}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "RT-UDDOKTAPAY-API-KEY": cfg.key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  try { return JSON.parse(text) as T; } catch { throw new Error(`UddoktaPay: অপ্রত্যাশিত উত্তর (${res.status})`); }
}

/** পেমেন্ট পেজের লিংক বানানো — ফেরত দেয় payment_url */
export async function createCharge(cfg: UddoktaConfig, p: { fullName: string; email: string; amount: number; metadata: Record<string, string>; redirectUrl: string; cancelUrl: string; webhookUrl: string }): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    const d = await call<{ status?: boolean; message?: string; payment_url?: string }>(cfg, "checkout-v2", {
      full_name: p.fullName, email: p.email, amount: String(p.amount), metadata: p.metadata,
      redirect_url: p.redirectUrl, cancel_url: p.cancelUrl, webhook_url: p.webhookUrl, return_type: "GET",
    });
    if (d.status && d.payment_url && /^https:\/\//.test(d.payment_url)) return { ok: true, url: d.payment_url };
    return { ok: false, message: d.message || "পেমেন্ট পেজ খোলা যায়নি" };
  } catch (e) {
    return { ok: false, message: (e as Error).message || "পেমেন্ট গেটওয়েতে যোগাযোগ হয়নি" };
  }
}

export type Verified = { status: string; amount: number; invoice_id: string; metadata: Record<string, unknown>; payment_method?: string; sender_number?: string; transaction_id?: string; fee?: string };

export async function verifyPayment(cfg: UddoktaConfig, invoiceId: string): Promise<Verified | null> {
  try {
    const d = await call<Record<string, unknown>>(cfg, "verify-payment", { invoice_id: invoiceId });
    if (!d || typeof d.status !== "string") return null;
    const meta = typeof d.metadata === "string" ? safeJson(d.metadata) : (d.metadata as Record<string, unknown>) ?? {};
    return {
      status: String(d.status).toUpperCase(), amount: parseFloat(String(d.amount ?? "0")) || 0, invoice_id: String(d.invoice_id ?? invoiceId),
      metadata: meta ?? {}, payment_method: str(d.payment_method), sender_number: str(d.sender_number), transaction_id: str(d.transaction_id), fee: str(d.fee),
    };
  } catch {
    return null;
  }
}

const str = (v: unknown) => (v == null ? undefined : String(v).slice(0, 60));
function safeJson(s: string): Record<string, unknown> | null { try { return JSON.parse(s); } catch { return null; } }

const METHOD_LABEL: Record<string, string> = { bkash: "bKash", nagad: "Nagad", rocket: "Rocket", upay: "Upay", bank: "ব্যাংক" };
export const methodLabel = (m?: string | null) => (m ? METHOD_LABEL[m.toLowerCase()] ?? m : "অনলাইন");

/**
 * invoice_id যাচাই করে ব্যালেন্সে যোগ। webhook আর ফেরত-লিংক দুটোই এটা ডাকে — একবারই যোগ হয়।
 * expectShop দিলে অন্য দোকানের পেমেন্ট এখানে গোনা হয় না।
 */
export async function settlePayment(db: D1Database, invoiceId: string, expectShop?: string): Promise<{ ok: boolean; status: "completed" | "pending" | "failed" | "error"; amount?: number; message: string }> {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(invoiceId)) return { ok: false, status: "error", message: "ভুল পেমেন্ট নম্বর" };
  const cfg = uddoktaConfig(await platformSettings(db, true));
  if (!cfg) return { ok: false, status: "error", message: "অনলাইন পেমেন্ট এখন বন্ধ" };
  const v = await verifyPayment(cfg, invoiceId);
  if (!v) return { ok: false, status: "error", message: "পেমেন্ট যাচাই করা যায়নি — একটু পরে আবার দেখুন" };
  const payId = parseInt(String(v.metadata.pay_id ?? ""), 10);
  const p = payId ? await db.prepare("SELECT id, shop_id, amount, status, invoice_id FROM online_payments WHERE id = ?").bind(payId).first<{ id: number; shop_id: string; amount: number; status: string; invoice_id: string | null }>() : null;
  if (!p || String(v.metadata.shop_id ?? "") !== p.shop_id || (expectShop && p.shop_id !== expectShop)) return { ok: false, status: "error", message: "এই পেমেন্ট আমাদের রেকর্ডে নেই" };
  if (p.invoice_id && p.invoice_id !== invoiceId) return { ok: false, status: "error", message: "এই পেমেন্ট আমাদের রেকর্ডে নেই" };
  if (p.status === "completed") return { ok: true, status: "completed", amount: p.amount, message: `৳${p.amount} আগেই ব্যালেন্সে যোগ হয়েছে` };

  if (v.status === "COMPLETED") {
    if (v.amount + 0.001 < p.amount) {
      await db.prepare("UPDATE online_payments SET status = 'failed', invoice_id = ? WHERE id = ? AND status != 'completed'").bind(invoiceId, p.id).run();
      return { ok: false, status: "failed", message: "পেমেন্টের টাকা কম — সাপোর্টে যোগাযোগ করুন" };
    }
    const upd = await db.prepare(
      "UPDATE online_payments SET status = 'completed', invoice_id = ?, method = ?, sender = ?, trx_id = ?, fee = ?, completed_at = datetime('now') WHERE id = ? AND status != 'completed'",
    ).bind(invoiceId, v.payment_method ?? null, v.sender_number ?? null, v.transaction_id ?? null, v.fee ?? null, p.id).run();
    if (upd.meta.changes) {
      await applyLedger(db, p.shop_id, "topup", p.amount, `uddokta:${invoiceId}`, `${methodLabel(v.payment_method)} (অনলাইন) ${v.transaction_id ?? ""}`.trim());
      await db.prepare("UPDATE shops SET first_topup_at = COALESCE(first_topup_at, datetime('now')) WHERE id = ?").bind(p.shop_id).run();
    }
    return { ok: true, status: "completed", amount: p.amount, message: `৳${p.amount} ব্যালেন্সে যোগ হয়েছে ✓` };
  }
  if (v.status === "PENDING") {
    await db.prepare("UPDATE online_payments SET status = 'pending', invoice_id = ? WHERE id = ? AND status = 'created'").bind(invoiceId, p.id).run();
    return { ok: false, status: "pending", message: "পেমেন্ট যাচাই হচ্ছে — নিশ্চিত হলেই ব্যালেন্সে যোগ হবে" };
  }
  await db.prepare("UPDATE online_payments SET status = 'failed', invoice_id = ? WHERE id = ? AND status != 'completed'").bind(invoiceId, p.id).run();
  return { ok: false, status: "failed", message: "পেমেন্ট সম্পন্ন হয়নি" };
}
