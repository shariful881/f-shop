/**
 * SMS — দোকানদার নিজের SMS গেটওয়ের API দেন।
 * তৈরি করা: BulkSMSBD, SMS.net.bd (Alpha SMS); না মিললে নিজের URL টেমপ্লেট ({number}, {message})।
 */
import { siteLang, t } from "../i18n";
import type { Settings } from "./settings";
import type { Order } from "./orders";
import { COURIER_NAME, type CourierKey } from "./courier";

export const SMS_PROVIDERS = {
  bulksmsbd: { name: "BulkSMSBD", help: "bulksmsbd.net প্যানেল থেকে API Key আর অনুমোদিত Sender ID দিন" },
  smsnetbd: { name: "SMS.net.bd (Alpha SMS)", help: "sms.net.bd প্যানেল থেকে API Key দিন; Sender ID থাকলে দিন (না থাকলে ফাঁকা)" },
  custom: { name: "অন্য গেটওয়ে (নিজের URL)", help: "গেটওয়ের API URL দিন; নম্বর আর মেসেজের জায়গায় {number} আর {message} লিখুন" },
} as const;
export type SmsProvider = keyof typeof SMS_PROVIDERS;
export type SmsEvent = "confirmed" | "shipped";

export const SMS_PLACEHOLDERS = ["{নাম}", "{অর্ডার}", "{টাকা}", "{দোকান}", "{কুরিয়ার}", "{ট্র্যাকিং}"];
/** ইংরেজি প্যানেলে দেখানো টোকেন — দুই রকমই কাজ করে */
export const SMS_PLACEHOLDERS_EN = ["{name}", "{order}", "{total}", "{shop}", "{courier}", "{tracking}"];

export function smsReady(s: Settings): boolean {
  if (s.sms_enabled !== "1") return false;
  const p = (s.sms_provider || "bulksmsbd") as SmsProvider;
  if (p === "custom") {
    const url = s.sms_custom_url || "";
    return /^https?:\/\//i.test(url) && (url.includes("{number}") || (s.sms_custom_body || "").includes("{number}"));
  }
  return !!s.sms_api_key;
}

/** টেমপ্লেটে তথ্য বসানো */
export function renderTemplate(tpl: string, s: Settings, o: Pick<Order, "name" | "order_no" | "total" | "courier" | "tracking_code" | "consignment_id">): string {
  const vals = [o.name, o.order_no, String(o.total), s.site_name || "", COURIER_NAME[o.courier as CourierKey] ?? o.courier ?? t("কুরিয়ার", siteLang(s)), o.tracking_code || o.consignment_id || ""];
  const map: Record<string, string> = {};
  SMS_PLACEHOLDERS.forEach((k, i) => { map[k] = vals[i]!; });
  SMS_PLACEHOLDERS_EN.forEach((k, i) => { map[k] = vals[i]!; });
  return tpl.replace(/\{[^{}]{1,20}\}/g, (m) => map[m] ?? m).trim().slice(0, 600);
}

/** 01XXXXXXXXX → 8801XXXXXXXXX (গেটওয়েগুলো এভাবে চায়) */
export const to880 = (phone: string) => (phone.startsWith("0") ? "88" + phone : phone);

type Sent = { ok: boolean; response: string };

/**
 * নিজের গেটওয়ের URL যাচাই (security/step-6): শুধু http/https, URL-এ ইউজার/পাসওয়ার্ড নয়,
 * localhost / ভেতরের নেটওয়ার্কের IP / আমাদের নিজের ডোমেইন নয় — যাতে SMS ফিচার দিয়ে অন্য জায়গায় রিকোয়েস্ট পাঠানো
 * (proxy হিসেবে অপব্যবহার) না যায়। অনেক বাংলাদেশি গেটওয়ে শুধু http বা IP ঠিকানা দেয়, তাই সেগুলো চলে।
 * ঠিক থাকলে null, নইলে বাংলায় কারণ।
 */
export function customSmsUrlError(raw: string, platformDomain?: string): string | null {
  let u: URL;
  try { u = new URL(raw.replaceAll("{number}", "8801700000000").replaceAll("{phone}", "01700000000").replaceAll("{message}", "x")); }
  catch { return "গেটওয়ের URL ঠিক নয়"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "গেটওয়ের URL http:// বা https:// দিয়ে শুরু হতে হবে";
  if (u.username || u.password) return "URL-এ ইউজার/পাসওয়ার্ড দেবেন না — API key প্যারামিটারে দিন";
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || host.includes(":")) return "IPv6 ঠিকানা চলবে না — গেটওয়ের ডোমেইন দিন";
  if (host === "localhost" || /\.(localhost|local|internal|lan|home|test|invalid)$/.test(host) || !host.includes(".")) return "এই ঠিকানায় SMS পাঠানো যাবে না";
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    const priv = a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    if (priv) return "ভেতরের নেটওয়ার্কের ঠিকানায় SMS পাঠানো যাবে না";
  }
  const base = (platformDomain || "").toLowerCase();
  if (base && (host === base || host.endsWith(`.${base}`))) return "আমাদের নিজের ঠিকানা গেটওয়ে হতে পারে না";
  return null;
}

async function call(url: string, init: RequestInit): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    return { status: res.status, text: (await res.text()).slice(0, 1000) };
  } catch (e) {
    return { status: 0, text: `নেটওয়ার্ক সমস্যা: ${(e as Error).message}` };
  }
}

export async function sendSms(s: Settings, phone: string, message: string): Promise<Sent> {
  const p = (s.sms_provider || "bulksmsbd") as SmsProvider;
  const number = to880(phone);
  if (p === "bulksmsbd") {
    const q = new URLSearchParams({ api_key: s.sms_api_key || "", type: "text", number, senderid: s.sms_sender_id || "", message });
    const r = await call(`https://bulksmsbd.net/api/smsapi?${q}`, { method: "GET" });
    let code = 0;
    try { code = Number(JSON.parse(r.text).response_code); } catch {}
    return { ok: r.status === 200 && code === 202, response: r.text || `HTTP ${r.status}` };
  }
  if (p === "smsnetbd") {
    const body = new URLSearchParams({ api_key: s.sms_api_key || "", msg: message, to: number });
    if (s.sms_sender_id) body.set("sender_id", s.sms_sender_id);
    const r = await call("https://api.sms.net.bd/sendsms", { method: "POST", body });
    let err = -1;
    try { err = Number(JSON.parse(r.text).error); } catch {}
    return { ok: r.status === 200 && err === 0, response: r.text || `HTTP ${r.status}` };
  }
  // নিজের URL
  const fill = (t: string, enc: (x: string) => string) =>
    t.replaceAll("{number}", enc(number)).replaceAll("{phone}", enc(phone)).replaceAll("{message}", enc(message));
  const bad = customSmsUrlError(s.sms_custom_url || "");
  if (bad) return { ok: false, response: bad };
  const url = fill(s.sms_custom_url || "", encodeURIComponent);
  const method = s.sms_custom_method === "POST" ? "POST" : "GET";
  const init: RequestInit = { method, redirect: "manual" }; // অন্য ঠিকানায় ঘুরিয়ে দিলে যাবে না
  if (method === "POST" && s.sms_custom_body) {
    const tpl = s.sms_custom_body;
    const isJson = tpl.trim().startsWith("{");
    init.body = fill(tpl, isJson ? (x) => JSON.stringify(x).slice(1, -1) : encodeURIComponent);
    init.headers = { "Content-Type": isJson ? "application/json" : "application/x-www-form-urlencoded" };
  }
  const r = await call(url, init);
  const okWord = (s.sms_custom_success || "").trim();
  const ok = r.status >= 200 && r.status < 300 && (!okWord || r.text.includes(okWord));
  // উত্তরের শুধু শুরুটা রাখা — পুরো পেজ দেখানো proxy-র মতো কাজে লাগানো যায়
  return { ok, response: (r.text || `HTTP ${r.status}`).slice(0, 300) };
}

/**
 * অর্ডারের ঘটনায় SMS (কনফার্ম/শিপড)। একই অর্ডারের একই ঘটনায় একবারই যায়।
 */
export async function notifyOrder(db: D1Database, s: Settings, orderId: number, event: SmsEvent): Promise<{ sent: boolean; message: string }> {
  if (!smsReady(s)) return { sent: false, message: "SMS চালু নেই" };
  if (event === "confirmed" && s.sms_on_confirm !== "1") return { sent: false, message: "কনফার্মে SMS বন্ধ" };
  if (event === "shipped" && s.sms_on_shipped !== "1") return { sent: false, message: "শিপডে SMS বন্ধ" };
  const o = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first<Order>();
  if (!o) return { sent: false, message: "অর্ডার নেই" };
  const tpl = event === "confirmed" ? s.sms_tpl_confirmed : s.sms_tpl_shipped;
  const text = renderTemplate(tpl || "", s, o);
  if (!text) return { sent: false, message: "টেমপ্লেট ফাঁকা" };
  const claim = await db.prepare("INSERT OR IGNORE INTO sms_logs (order_id, event, phone, message) VALUES (?, ?, ?, ?)").bind(orderId, event, o.phone, text).run();
  if (!claim.meta.changes) return { sent: false, message: "আগেই পাঠানো হয়েছে" };
  return deliver(db, s, orderId, event, o.phone, text);
}

async function deliver(db: D1Database, s: Settings, orderId: number | null, event: string, phone: string, text: string) {
  const r = await sendSms(s, phone, text);
  if (orderId !== null) {
    await db.prepare("UPDATE sms_logs SET status = ?, response = ? WHERE order_id = ? AND event = ?").bind(r.ok ? "sent" : "failed", r.response, orderId, event).run();
  }
  return { sent: r.ok, message: r.ok ? "SMS গেছে" : `SMS যায়নি: ${r.response.slice(0, 200)}` };
}

/** ব্যর্থ SMS আবার পাঠানো */
export async function resendSms(db: D1Database, s: Settings, logId: number) {
  if (!smsReady(s)) return { sent: false, message: "SMS চালু নেই" };
  const log = await db.prepare("SELECT * FROM sms_logs WHERE id = ?").bind(logId).first<{ order_id: number | null; event: string; phone: string; message: string; status: string }>();
  if (!log || log.status !== "failed") return { sent: false, message: "শুধু ব্যর্থ SMS আবার পাঠানো যায়" };
  const claim = await db.prepare("UPDATE sms_logs SET status = 'sending' WHERE id = ? AND status = 'failed'").bind(logId).run();
  if (!claim.meta.changes) return { sent: false, message: "এখন পাঠানো হচ্ছে" };
  const r = await sendSms(s, log.phone, log.message);
  await db.prepare("UPDATE sms_logs SET status = ?, response = ? WHERE id = ?").bind(r.ok ? "sent" : "failed", r.response, logId).run();
  return { sent: r.ok, message: r.ok ? "SMS গেছে" : `SMS যায়নি: ${r.response.slice(0, 200)}` };
}

/** সেটিংস পেজ থেকে টেস্ট SMS */
export async function testSms(db: D1Database, s: Settings, phone: string) {
  const text = `${s.site_name || "SellxBD"}${t(": টেস্ট SMS — গেটওয়ে ঠিকঠাক কাজ করছে।", siteLang(s))}`;
  const r = await sendSms(s, phone, text);
  await db.prepare("INSERT INTO sms_logs (order_id, event, phone, message, status, response) VALUES (NULL, 'test', ?, ?, ?, ?)").bind(phone, text, r.ok ? "sent" : "failed", r.response).run();
  return r;
}
