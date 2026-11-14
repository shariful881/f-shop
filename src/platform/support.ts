/**
 * সাপোর্ট সিস্টেমের ডাটা আর নিয়ম — দোকান আর সুপার অ্যাডমিন দুই পাশ থেকেই ব্যবহার হয়।
 * টিকেট আর লাইভ চ্যাট একই জিনিস (channel: ticket | chat)।
 */
import type { HubEvent, SupportHub } from "../support-hub";
import { bn } from "../shop/lib/format";

export const CATEGORIES: Record<string, string> = {
  orders: "অর্ডার", billing: "পেমেন্ট ও রিচার্জ", domain: "ডোমেইন", courier: "কুরিয়ার", pixel: "পিক্সেল ও অ্যাড",
  design: "ডিজাইন ও থিম", products: "পণ্য", account: "অ্যাকাউন্ট ও লগইন", other: "অন্যান্য",
};
export const PRIORITY: Record<string, string> = { normal: "সাধারণ", high: "জরুরি", urgent: "খুব জরুরি" };
export const STATUS: Record<string, string> = { open: "উত্তরের অপেক্ষায়", pending: "আপনার উত্তরের অপেক্ষায়", resolved: "সমাধান হয়েছে", closed: "বন্ধ" };
/** টিমের দিক থেকে অবস্থার নাম */
export const STATUS_TEAM: Record<string, string> = { open: "খোলা", pending: "দোকানের উত্তরের অপেক্ষায়", resolved: "সমাধান", closed: "বন্ধ" };

export type Ticket = {
  id: number; shop_id: string; channel: "ticket" | "chat"; subject: string; category: string; priority: string;
  status: "open" | "pending" | "resolved" | "closed"; assigned_to: number | null; opened_by: string | null;
  last_message_at: string; last_preview: string | null; last_sender: string | null; team_unread: number; shop_unread: number;
  first_response_at: string | null; resolved_at: string | null; rating: number | null; rating_comment: string | null; created_at: string;
};
export type Message = { id: number; ticket_id: number; sender: "shop" | "team" | "system"; author: string | null; body: string; attachment: string | null; internal: number; created_at: string };

type Env = { PLATFORM_DB: D1Database; SUPPORT: DurableObjectNamespace<SupportHub> };

const preview = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 140);

export const hub = (env: Env) => env.SUPPORT.getByName("hub");

/** রিয়েল-টাইম খবর — ব্যর্থ হলেও মূল কাজ থামে না (পেজ পোলিং দিয়েও আপডেট হয়) */
export async function emit(env: Env, evt: HubEvent) {
  try { await hub(env).broadcast(evt); } catch (e) { console.error("support hub", e); }
}

export async function agentsOnline(env: Env): Promise<number> {
  try { return await hub(env).agentsOnline(); } catch { return 0; }
}

/* ---------- অফিস সময় ---------- */
export function withinHours(s: Record<string, string>, now = new Date()): boolean {
  const start = s.support_hours_start || "00:00";
  const end = s.support_hours_end || "00:00";
  if (start === end) return true; // ২৪ ঘণ্টা
  const dhaka = new Date(now.getTime() + 6 * 3600e3);
  const m = dhaka.getUTCHours() * 60 + dhaka.getUTCMinutes();
  const toM = (x: string) => { const [h, mm] = x.split(":").map(Number); return (h || 0) * 60 + (mm || 0); };
  const a = toM(start), b = toM(end);
  return a < b ? m >= a && m < b : m >= a || m < b;
}
export function hoursText(s: Record<string, string>): string {
  const f = (x: string) => {
    const [h, m] = (x || "0:0").split(":").map(Number);
    const hh = ((h || 0) % 12) || 12;
    const part = (h || 0) < 12 ? "সকাল" : (h || 0) < 17 ? "দুপুর" : (h || 0) < 19 ? "বিকাল" : "রাত";
    return `${part} ${bn(hh)}${m ? `:${bn(String(m).padStart(2, "0"))}` : ""}টা`;
  };
  if ((s.support_hours_start || "00:00") === (s.support_hours_end || "00:00")) return "২৪ ঘণ্টা";
  return `${f(s.support_hours_start || "00:00")} থেকে ${f(s.support_hours_end || "00:00")}`;
}

/* ---------- Telegram নোটিফিকেশন ---------- */
export async function telegram(s: Record<string, string>, text: string) {
  const token = s.telegram_bot_token, chat = s.telegram_chat_id;
  if (!token || !chat || !/^\d+:[\w-]{20,}$/.test(token)) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3800), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) { console.error("telegram", e); }
}

/* ---------- টিকেট ---------- */
export async function createTicket(db: D1Database, t: {
  shopId: string; channel: "ticket" | "chat"; subject: string; category: string; priority: string; openedBy: string; body: string; attachment?: string | null;
}): Promise<number> {
  const row = await db.prepare(
    `INSERT INTO support_tickets (shop_id, channel, subject, category, priority, opened_by, last_preview, last_sender, team_unread)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'shop', 1) RETURNING id`,
  ).bind(t.shopId, t.channel, t.subject.slice(0, 150), t.category in CATEGORIES ? t.category : "other", t.priority in PRIORITY ? t.priority : "normal", t.openedBy, preview(t.body)).first<{ id: number }>();
  await db.prepare("INSERT INTO support_messages (ticket_id, sender, author, body, attachment) VALUES (?, 'shop', ?, ?, ?)")
    .bind(row!.id, t.openedBy, t.body.slice(0, 5000), t.attachment ?? null).run();
  return row!.id;
}

/** দোকান থেকে নতুন মেসেজ: টিকেট আবার "খোলা" হয়, টিমের না-পড়া বাড়ে */
export async function shopMessage(db: D1Database, ticketId: number, author: string, body: string, attachment?: string | null): Promise<Message> {
  const msg = await db.prepare("INSERT INTO support_messages (ticket_id, sender, author, body, attachment) VALUES (?, 'shop', ?, ?, ?) RETURNING *")
    .bind(ticketId, author, body.slice(0, 5000), attachment ?? null).first<Message>();
  await db.prepare(
    `UPDATE support_tickets SET status = 'open', last_message_at = datetime('now'), last_preview = ?, last_sender = 'shop',
       team_unread = team_unread + 1, resolved_at = NULL WHERE id = ?`,
  ).bind(preview(body || "📎 ছবি"), ticketId).run();
  return msg!;
}

/** টিমের উত্তর (বা ভিতরের নোট): উত্তর হলে "দোকানের অপেক্ষায়", প্রথম উত্তরের সময় সেভ */
export async function teamMessage(db: D1Database, ticketId: number, author: string, body: string, internal: boolean, nextStatus?: string): Promise<Message> {
  const msg = await db.prepare("INSERT INTO support_messages (ticket_id, sender, author, body, internal) VALUES (?, 'team', ?, ?, ?) RETURNING *")
    .bind(ticketId, author, body.slice(0, 5000), internal ? 1 : 0).first<Message>();
  if (!internal) {
    const status = nextStatus && nextStatus in STATUS ? nextStatus : "pending";
    await db.prepare(
      `UPDATE support_tickets SET status = ?, last_message_at = datetime('now'), last_preview = ?, last_sender = 'team',
         shop_unread = shop_unread + 1, team_unread = 0, first_response_at = COALESCE(first_response_at, datetime('now')),
         resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN datetime('now') ELSE NULL END WHERE id = ?`,
    ).bind(status, preview(body), status, ticketId).run();
  }
  return msg!;
}

export async function systemMessage(db: D1Database, ticketId: number, body: string) {
  return db.prepare("INSERT INTO support_messages (ticket_id, sender, author, body) VALUES (?, 'system', 'SellxBD', ?) RETURNING *").bind(ticketId, body).first<Message>();
}

export async function setStatus(db: D1Database, ticketId: number, status: string) {
  if (!(status in STATUS)) return;
  await db.prepare(
    "UPDATE support_tickets SET status = ?, resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN datetime('now') ELSE NULL END WHERE id = ?",
  ).bind(status, status, ticketId).run();
}

export async function messages(db: D1Database, ticketId: number, opts: { afterId?: number; includeInternal: boolean }) {
  const { results } = await db.prepare(
    `SELECT * FROM support_messages WHERE ticket_id = ? AND id > ? ${opts.includeInternal ? "" : "AND internal = 0"} ORDER BY id LIMIT 500`,
  ).bind(ticketId, opts.afterId ?? 0).all<Message>();
  return results;
}

/** দোকানের চালু চ্যাট (না থাকলে null) */
export async function openChat(db: D1Database, shopId: string) {
  return db.prepare("SELECT * FROM support_tickets WHERE shop_id = ? AND channel = 'chat' AND status IN ('open', 'pending') ORDER BY id DESC LIMIT 1")
    .bind(shopId).first<Ticket>();
}

/** মেসেজটা রিয়েল-টাইমে পাঠানোর মতো রূপ */
export const publicMsg = (m: Message) => ({ id: m.id, sender: m.sender, author: m.author, body: m.body, attachment: m.attachment, internal: m.internal, created_at: m.created_at });
