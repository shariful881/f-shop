import type { Ctx } from "../env";
import type { Settings } from "./settings";
import type { Order, OrderItem } from "./orders";
import { sha256Hex } from "./auth";
import { clientIp, publicUrl } from "./http";
import { phoneE164Digits } from "./phone";

/**
 * Facebook Conversions API (সার্ভার থেকে ইভেন্ট পাঠানো)।
 * ব্রাউজারের Pixel আর সার্ভার একই event_id পাঠায়, তাই Facebook একটাকে বাদ দিয়ে একবারই গোনে।
 */

export type CustomData = Record<string, unknown>;

export type UserInfo = {
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  deviceId: string | null;
  phone?: string | null; // 01XXXXXXXXX
};

export async function buildUserData(u: UserInfo) {
  const data: Record<string, unknown> = {
    country: [await sha256Hex("bd")],
  };
  if (u.ip) data.client_ip_address = u.ip;
  if (u.userAgent) data.client_user_agent = u.userAgent;
  if (u.fbp) data.fbp = u.fbp;
  if (u.fbc) data.fbc = u.fbc;
  if (u.deviceId) data.external_id = [await sha256Hex(u.deviceId)];
  if (u.phone) data.ph = [await sha256Hex(phoneE164Digits(u.phone))];
  return data;
}

export function isConfigured(s: Settings): boolean {
  return !!(s.fb_pixel_id && s.fb_capi_token);
}

export type SendResult = { ok: boolean; status: number; body: string };

export async function sendEvents(s: Settings, events: Record<string, unknown>[]): Promise<SendResult> {
  const version = /^v\d+\.\d+$/.test(s.fb_graph_version || "") ? s.fb_graph_version : "v26.0";
  const payload: Record<string, unknown> = { data: events, access_token: s.fb_capi_token };
  if (s.fb_test_event_code) payload.test_event_code = s.fb_test_event_code;
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(s.fb_pixel_id!)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.text()).slice(0, 2000);
    let received = false;
    try { received = (JSON.parse(body).events_received ?? 0) > 0; } catch {}
    return { ok: res.ok && received, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: `নেটওয়ার্ক সমস্যা: ${(e as Error).message}` };
  }
}

export function newEventId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * ব্রাউজার ইভেন্টের সাথে মিলিয়ে সার্ভার ইভেন্ট — রেসপন্স পাঠানোর পরে যায় (waitUntil),
 * তাই কাস্টমারের পেজ এক মিলিসেকেন্ডও দেরি হয় না।
 */
export function trackServer(c: Ctx, eventName: string, eventId: string, customData?: CustomData, sourceUrl?: string) {
  const s = c.var.settings;
  if (!isConfigured(s)) return;
  const url = sourceUrl ?? (c.req.method === "GET" ? publicUrl(c) : c.req.header("referer") || publicUrl(c));
  const job = (async () => {
    const event: Record<string, unknown> = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: url,
      user_data: await buildUserData({
        ip: clientIp(c),
        userAgent: c.req.header("user-agent") || null,
        fbp: c.var.fbp ?? null,
        fbc: c.var.fbc ?? null,
        deviceId: c.var.deviceId ?? null,
      }),
    };
    if (customData) event.custom_data = customData;
    const r = await sendEvents(s, [event]);
    if (!r.ok) console.warn(`CAPI ${eventName} ব্যর্থ:`, r.status, r.body);
  })().catch((e) => console.warn("CAPI error", e));
  try {
    c.executionCtx.waitUntil(job);
  } catch {
    /* executionCtx না থাকলে (খুব বিরল) ইভেন্ট নিজের মতো চলবে */
  }
}

/* ---------------- Purchase ---------------- */

/**
 * Purchase গার্ড (ডিফল্ট চালু): অর্ডার এলে Purchase যায় না, দোকানদার কনফার্ম করলে তবেই যায় —
 * ফেক অর্ডারকে Facebook বিক্রি ধরে না। বন্ধ করলে সাধারণ সাইটের মতো অর্ডার আসার সাথে সাথে যায়।
 */
export const purchaseGuardOn = (s: Settings) => s.purchase_guard !== "0";

export type PurchaseResult = { ok: boolean; message: string };

/**
 * Purchase — শুধু অ্যাডমিন Confirm চাপলে (বা "আবার পাঠান"), শুধু সার্ভার থেকে।
 * - অর্ডারের সময় সেভ করা fbp, fbc, IP, user agent, ডিভাইস আর hashed ফোন যায়
 * - event_id = purchase_{অর্ডার নম্বর}
 * - একই অর্ডারের Purchase দুবার যায় না; ফেক/বাতিল/নতুন অর্ডারের কখনো যায় না
 */
export async function sendPurchase(db: D1Database, orderId: number, s: Settings, opts: { atOrder?: boolean } = {}): Promise<PurchaseResult> {
  const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<Order>();
  if (!order) return { ok: false, message: "অর্ডার পাওয়া যায়নি" };
  if (order.purchase_sent_at) return { ok: true, message: "Purchase আগেই পাঠানো হয়েছে" };
  // গার্ড বন্ধ থাকলে অর্ডার আসার মুহূর্তে (status = new) পাঠানো যায়; নইলে শুধু কনফার্ম/শিপড
  const atOrder = !!opts.atOrder && !purchaseGuardOn(s) && order.status === "new";
  if (!atOrder && order.status !== "confirmed" && order.status !== "shipped") {
    return { ok: false, message: "শুধু কনফার্ম বা শিপড অর্ডারের Purchase পাঠানো যায়" };
  }

  if (!isConfigured(s)) {
    await db.prepare("UPDATE orders SET purchase_response = ? WHERE id = ? AND purchase_sent_at IS NULL")
      .bind("Pixel ID বা CAPI Access Token সেট করা নেই (অ্যাডমিন → সেটিংস)", orderId).run();
    return { ok: false, message: "Pixel ID বা CAPI Access Token সেট করা নেই" };
  }

  // একসাথে দুবার না যায় — আগে "দাবি" করে নেওয়া (৩০ সেকেন্ডের জন্য)
  const claim = await db
    .prepare(
      `UPDATE orders SET purchase_sending_until = datetime('now', '+30 seconds')
       WHERE id = ? AND purchase_sent_at IS NULL AND status IN (${atOrder ? "'new', " : ""}'confirmed', 'shipped')
         AND (purchase_sending_until IS NULL OR purchase_sending_until < datetime('now'))`,
    )
    .bind(orderId)
    .run();
  if (!claim.meta.changes) return { ok: false, message: "Purchase এখন পাঠানো হচ্ছে বা আগেই গেছে" };

  const { results: items } = await db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").bind(orderId).all<OrderItem>();

  const event = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: `purchase_${order.order_no}`,
    action_source: "website",
    event_source_url: order.source_url || undefined,
    user_data: await buildUserData({
      ip: order.ip,
      userAgent: order.user_agent,
      fbp: order.fbp,
      fbc: order.fbc,
      deviceId: order.device_id,
      phone: order.phone,
    }),
    custom_data: {
      currency: "BDT",
      value: order.total,
      content_type: "product",
      content_ids: items.map((i) => String(i.product_id ?? i.id)),
      contents: items.map((i) => ({ id: String(i.product_id ?? i.id), quantity: i.qty || 1, item_price: i.price })),
      num_items: items.reduce((n, i) => n + (i.qty || 1), 0),
      order_id: order.order_no,
    },
  };

  const r = await sendEvents(s, [event]);
  if (r.ok) {
    await db.prepare(
      "UPDATE orders SET purchase_sent_at = datetime('now'), purchase_response = ?, purchase_sending_until = NULL WHERE id = ?",
    ).bind(r.body, orderId).run();
    return { ok: true, message: "Purchase পাঠানো হয়েছে" };
  }
  await db.prepare("UPDATE orders SET purchase_response = ?, purchase_sending_until = NULL WHERE id = ?")
    .bind(`HTTP ${r.status}: ${r.body}`, orderId).run();
  return { ok: false, message: `Facebook গ্রহণ করেনি (HTTP ${r.status})` };
}
