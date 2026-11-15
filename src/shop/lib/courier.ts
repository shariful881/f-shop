/**
 * কুরিয়ার: Steadfast, Pathao, RedX — প্রতিটা দোকান নিজের মার্চেন্ট অ্যাকাউন্টের API তথ্য দিয়ে।
 * পার্সেল দোকানদারের নিজের অ্যাকাউন্টে বুক হয়।
 */
import type { Settings } from "./settings";
import type { Order, OrderItem } from "./orders";
import type { CourierSummary } from "./fraud";

export type CourierKey = "steadfast" | "pathao" | "redx";
export const COURIER_NAME: Record<CourierKey, string> = { steadfast: "Steadfast", pathao: "Pathao", redx: "RedX" };

export type SendOptions = { cod: number; note: string; pathaoCity?: number; pathaoZone?: number; pathaoArea?: number; redxAreaId?: number; redxAreaName?: string; weightKg?: number };
export type SendResult = { ok: boolean; consignmentId?: string; trackingCode?: string; status?: string; message: string; raw: string };
export type StatusResult = { ok: boolean; status?: string; message: string; raw: string };

export function configuredCouriers(s: Settings): CourierKey[] {
  const out: CourierKey[] = [];
  if (s.steadfast_api_key && s.steadfast_secret_key) out.push("steadfast");
  if (s.pathao_client_id && s.pathao_client_secret && s.pathao_username && s.pathao_password && s.pathao_store_id) out.push("pathao");
  if (s.redx_token) out.push("redx");
  return out;
}

async function call(url: string, init: RequestInit): Promise<{ status: number; json: any; text: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    const text = (await res.text()).slice(0, 4000);
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: `নেটওয়ার্ক সমস্যা: ${(e as Error).message}` };
  }
}

const errMsg = (r: { status: number; json: any; text: string }) =>
  r.json?.message || r.json?.errors && JSON.stringify(r.json.errors) || r.json?.error || r.text || `HTTP ${r.status}`;

/* ---------------- Steadfast ---------------- */
const SF = "https://portal.packzy.com/api/v1";
const sfHeaders = (s: Settings) => ({ "Api-Key": s.steadfast_api_key!, "Secret-Key": s.steadfast_secret_key!, "Content-Type": "application/json" });

async function steadfastSend(s: Settings, o: Order, opt: SendOptions): Promise<SendResult> {
  const r = await call(`${SF}/create_order`, {
    method: "POST",
    headers: sfHeaders(s),
    body: JSON.stringify({
      invoice: o.order_no,
      recipient_name: o.name,
      recipient_phone: o.phone,
      recipient_address: o.address.slice(0, 250),
      cod_amount: opt.cod,
      note: opt.note.slice(0, 200),
    }),
  });
  const c = r.json?.consignment;
  if (r.status === 200 && c?.consignment_id) {
    return { ok: true, consignmentId: String(c.consignment_id), trackingCode: String(c.tracking_code ?? ""), status: String(c.status ?? "in_review"), message: "Steadfast-এ পার্সেল বুক হয়েছে", raw: r.text };
  }
  return { ok: false, message: `Steadfast: ${errMsg(r)}`, raw: r.text };
}

async function steadfastStatus(s: Settings, o: Order): Promise<StatusResult> {
  const r = await call(`${SF}/status_by_cid/${encodeURIComponent(o.consignment_id!)}`, { headers: sfHeaders(s) });
  if (r.status === 200 && r.json?.delivery_status) return { ok: true, status: String(r.json.delivery_status), message: "আপডেট হয়েছে", raw: r.text };
  return { ok: false, message: `Steadfast: ${errMsg(r)}`, raw: r.text };
}

/* ---------------- Pathao ---------------- */
const pathaoBase = (s: Settings) => (s.pathao_sandbox === "1" ? "https://courier-api-sandbox.pathao.com" : "https://api-hermes.pathao.com");

/** টোকেন (৫ দিন পর্যন্ত চলে) — সেভ রেখে আবার ব্যবহার */
export async function pathaoToken(s: Settings, save: (k: Record<string, string>) => Promise<void>): Promise<{ token?: string; error?: string }> {
  if (s.pathao_token && Number(s.pathao_token_expires || 0) > Date.now() + 60_000) return { token: s.pathao_token };
  const r = await call(`${pathaoBase(s)}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: s.pathao_client_id, client_secret: s.pathao_client_secret, grant_type: "password", username: s.pathao_username, password: s.pathao_password }),
  });
  const token = r.json?.access_token;
  if (!token) return { error: `Pathao লগইন হয়নি: ${errMsg(r)}` };
  const expires = String(Date.now() + Number(r.json.expires_in ?? 3600) * 1000);
  await save({ pathao_token: token, pathao_token_expires: expires });
  s.pathao_token = token;
  s.pathao_token_expires = expires;
  return { token };
}

const pathaoHeaders = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json", Accept: "application/json" });

export async function pathaoList(s: Settings, save: (k: Record<string, string>) => Promise<void>, what: "cities" | "zones" | "areas", id?: number) {
  const t = await pathaoToken(s, save);
  if (!t.token) return { error: t.error, items: [] as { id: number; name: string }[] };
  const path = what === "cities" ? "/aladdin/api/v1/city-list" : what === "zones" ? `/aladdin/api/v1/cities/${id}/zone-list` : `/aladdin/api/v1/zones/${id}/area-list`;
  const r = await call(`${pathaoBase(s)}${path}`, { headers: pathaoHeaders(t.token) });
  const list = (r.json?.data?.data ?? []) as Record<string, unknown>[];
  const idKey = what === "cities" ? "city_id" : what === "zones" ? "zone_id" : "area_id";
  const nameKey = what === "cities" ? "city_name" : what === "zones" ? "zone_name" : "area_name";
  return { items: list.map((x) => ({ id: Number(x[idKey]), name: String(x[nameKey]) })), error: r.status === 200 ? undefined : errMsg(r) };
}

async function pathaoSend(s: Settings, o: Order, items: OrderItem[], opt: SendOptions, save: (k: Record<string, string>) => Promise<void>): Promise<SendResult> {
  const t = await pathaoToken(s, save);
  if (!t.token) return { ok: false, message: t.error!, raw: "" };
  const body: Record<string, unknown> = {
    store_id: Number(s.pathao_store_id),
    merchant_order_id: o.order_no,
    recipient_name: o.name,
    recipient_phone: o.phone,
    recipient_address: o.address.slice(0, 220),
    delivery_type: 48,
    item_type: 2,
    item_quantity: items.length || 1,
    item_weight: opt.weightKg ?? 0.5,
    amount_to_collect: opt.cod,
    item_description: items.map((i) => i.product_name + (i.variant_label ? ` (${i.variant_label})` : "")).join(", ").slice(0, 250),
    special_instruction: opt.note.slice(0, 250),
  };
  if (opt.pathaoCity) body.recipient_city = opt.pathaoCity;
  if (opt.pathaoZone) body.recipient_zone = opt.pathaoZone;
  if (opt.pathaoArea) body.recipient_area = opt.pathaoArea;
  const r = await call(`${pathaoBase(s)}/aladdin/api/v1/orders`, { method: "POST", headers: pathaoHeaders(t.token), body: JSON.stringify(body) });
  const d = r.json?.data;
  if (r.status === 200 && d?.consignment_id) {
    return { ok: true, consignmentId: String(d.consignment_id), trackingCode: String(d.consignment_id), status: String(d.order_status ?? "Pending"), message: "Pathao-তে পার্সেল বুক হয়েছে", raw: r.text };
  }
  return { ok: false, message: `Pathao: ${errMsg(r)}`, raw: r.text };
}

async function pathaoStatus(s: Settings, o: Order, save: (k: Record<string, string>) => Promise<void>): Promise<StatusResult> {
  const t = await pathaoToken(s, save);
  if (!t.token) return { ok: false, message: t.error!, raw: "" };
  const r = await call(`${pathaoBase(s)}/aladdin/api/v1/orders/${encodeURIComponent(o.consignment_id!)}/info`, { headers: pathaoHeaders(t.token) });
  const st = r.json?.data?.order_status;
  if (r.status === 200 && st) return { ok: true, status: String(st), message: "আপডেট হয়েছে", raw: r.text };
  return { ok: false, message: `Pathao: ${errMsg(r)}`, raw: r.text };
}

/* ---------------- RedX ---------------- */
const redxBase = (s: Settings) => (s.redx_sandbox === "1" ? "https://sandbox.redx.com.bd/v1.0.0-beta" : "https://openapi.redx.com.bd/v1.0.0-beta");
const redxHeaders = (s: Settings) => ({ "API-ACCESS-TOKEN": `Bearer ${s.redx_token}`, "Content-Type": "application/json" });

export async function redxAreas(s: Settings) {
  const r = await call(`${redxBase(s)}/areas`, { headers: redxHeaders(s) });
  const list = (r.json?.areas ?? []) as { id: number; name: string; division_name?: string }[];
  return { items: list.map((a) => ({ id: Number(a.id), name: a.division_name ? `${a.name} (${a.division_name})` : String(a.name) })), error: r.status === 200 ? undefined : errMsg(r) };
}

async function redxSend(s: Settings, o: Order, items: OrderItem[], opt: SendOptions): Promise<SendResult> {
  if (!opt.redxAreaId) return { ok: false, message: "RedX: ডেলিভারি এলাকা বাছাই করুন", raw: "" };
  const body: Record<string, unknown> = {
    customer_name: o.name,
    customer_phone: o.phone,
    delivery_area: opt.redxAreaName || "",
    delivery_area_id: opt.redxAreaId,
    customer_address: o.address.slice(0, 250),
    merchant_invoice_id: o.order_no,
    cash_collection_amount: String(opt.cod),
    parcel_weight: Math.round((opt.weightKg ?? 0.5) * 1000),
    instruction: opt.note.slice(0, 200),
    value: o.total,
    parcel_details_json: items.map((i) => ({ name: (i.qty || 1) > 1 ? `${i.product_name} x${i.qty}` : i.product_name, category: "general", value: i.price * (i.qty || 1) })),
  };
  if (s.redx_pickup_store_id) body.pickup_store_id = Number(s.redx_pickup_store_id);
  const r = await call(`${redxBase(s)}/parcel`, { method: "POST", headers: redxHeaders(s), body: JSON.stringify(body) });
  if ((r.status === 200 || r.status === 201) && r.json?.tracking_id) {
    return { ok: true, consignmentId: String(r.json.tracking_id), trackingCode: String(r.json.tracking_id), status: "pickup-pending", message: "RedX-এ পার্সেল বুক হয়েছে", raw: r.text };
  }
  return { ok: false, message: `RedX: ${errMsg(r)}`, raw: r.text };
}

async function redxStatus(s: Settings, o: Order): Promise<StatusResult> {
  const r = await call(`${redxBase(s)}/parcel/info/${encodeURIComponent(o.consignment_id!)}`, { headers: redxHeaders(s) });
  const st = r.json?.parcel?.status;
  if (r.status === 200 && st) return { ok: true, status: String(st), message: "আপডেট হয়েছে", raw: r.text };
  return { ok: false, message: `RedX: ${errMsg(r)}`, raw: r.text };
}

/* ---------------- এক জায়গা থেকে ---------------- */
export async function sendParcel(courier: CourierKey, s: Settings, o: Order, items: OrderItem[], opt: SendOptions, save: (k: Record<string, string>) => Promise<void>) {
  if (courier === "steadfast") return steadfastSend(s, o, opt);
  if (courier === "pathao") return pathaoSend(s, o, items, opt, save);
  return redxSend(s, o, items, opt);
}

export async function parcelStatus(s: Settings, o: Order, save: (k: Record<string, string>) => Promise<void>): Promise<StatusResult> {
  if (o.courier === "steadfast") return steadfastStatus(s, o);
  if (o.courier === "pathao") return pathaoStatus(s, o, save);
  if (o.courier === "redx") return redxStatus(s, o);
  return { ok: false, message: "কুরিয়ারে পাঠানো হয়নি", raw: "" };
}

/* ---------------- ক্রেতার ডেলিভারি রেকর্ড (কনফার্মের আগে দেখা) ---------------- */

/** BD Courier (bdcourier.com) — ফ্রি রেজিস্ট্রেশনের API কী দিয়ে সব কুরিয়ারের মিলিত হিসাব */
async function bdcourierRecord(token: string, phone: string): Promise<CourierSummary | { error: string }> {
  const r = await call("https://api.bdcourier.com/courier-check", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ phone }),
  });
  const sum = r.json?.data?.summary ?? r.json?.courierData?.summary;
  if (r.status === 200 && sum && typeof sum === "object") {
    const total = Number(sum.total_parcel) || 0;
    const success = Number(sum.success_parcel) || 0;
    const cancelled = Number(sum.cancelled_parcel) || 0;
    const reports = Array.isArray(r.json?.data?.reports) ? r.json.data.reports.length : 0;
    return { total, success, cancelled, ratio: total ? Math.round((success / total) * 100) : null, reports, source: "BD Courier" };
  }
  return { error: `BD Courier: ${errMsg(r)}` };
}

/** Steadfast-এর নিজের API (দোকানের Steadfast চাবি দিয়ে) — শুধু শতাংশ দেয়, সংখ্যা নয় */
async function steadfastRecord(s: Settings, phone: string): Promise<CourierSummary | { error: string }> {
  const r = await call(`${SF}/fraud_check/score/${encodeURIComponent(phone)}`, { headers: sfHeaders(s) });
  if (r.status === 200 && r.json && ("delivery_ratio" in r.json || "volume_band" in r.json)) {
    const band = String(r.json.volume_band ?? "none");
    // সংখ্যা দেয় না, তাই আনুমানিক পরিমাণ (none/low/medium/high) থেকে ছোট একটা সংখ্যা
    const approx: Record<string, number> = { none: 0, low: 3, medium: 10, high: 30, very_high: 100 };
    const total = approx[band] ?? 0;
    const ratio = r.json.delivery_ratio == null ? null : Number(r.json.delivery_ratio);
    const success = ratio == null ? 0 : Math.round((total * ratio) / 100);
    return { total, success, cancelled: total - success, ratio, reports: Number(r.json.total_reports) || 0, source: `Steadfast (${band})` };
  }
  return { error: `Steadfast: ${errMsg(r)}` };
}

export const courierRecordReady = (s: Settings) => !!s.bdcourier_token || !!(s.steadfast_api_key && s.steadfast_secret_key);

/** খোঁজা রেকর্ড ক্যাশে আছে কিনা (১২ ঘণ্টা) — অনেক নম্বর একবারে, বাইরের কল ছাড়া */
export async function cachedCourierRecords(db: D1Database, phones: string[]): Promise<Record<string, CourierSummary>> {
  const out: Record<string, CourierSummary> = {};
  if (!phones.length) return out;
  const { results } = await db
    .prepare(`SELECT phone, data, checked_at FROM courier_checks WHERE phone IN (${phones.map(() => "?").join(",")}) AND checked_at > datetime('now', '-12 hours')`)
    .bind(...phones)
    .all<{ phone: string; data: string; checked_at: string }>();
  for (const r of results) {
    try { out[r.phone] = { ...JSON.parse(r.data), checked_at: r.checked_at }; } catch {}
  }
  return out;
}

/** কুরিয়ারে খোঁজা: আগে BD Courier (সব কুরিয়ার), না থাকলে Steadfast; ফল ক্যাশে রাখা */
export async function courierRecord(db: D1Database, s: Settings, phone: string): Promise<CourierSummary | { error: string }> {
  const errors: string[] = [];
  let found: CourierSummary | null = null;
  if (s.bdcourier_token) {
    const r = await bdcourierRecord(s.bdcourier_token, phone);
    if ("error" in r) errors.push(r.error); else found = r;
  }
  if (!found && s.steadfast_api_key && s.steadfast_secret_key) {
    const r = await steadfastRecord(s, phone);
    if ("error" in r) errors.push(r.error); else found = r;
  }
  if (!found) return { error: errors.join(" · ") || "কুরিয়ার রেকর্ড দেখার চাবি দেওয়া নেই" };
  await db
    .prepare("INSERT INTO courier_checks (phone, data, checked_at) VALUES (?, ?, datetime('now')) ON CONFLICT(phone) DO UPDATE SET data = excluded.data, checked_at = excluded.checked_at")
    .bind(phone, JSON.stringify(found))
    .run();
  return found;
}
