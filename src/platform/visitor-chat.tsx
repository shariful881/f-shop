/**
 * sellxbd.com-এর ভিজিটর লাইভ চ্যাট — সাইটে আসা যে কেউ (দোকান না খুলেও) SellxBD টিমকে মেসেজ দিতে পারে।
 * ভিজিটর: পাবলিক পেজের কোণে বাটন (public/js/chat.js) → /chat/* (JSON, কুকি `sx_vc`, পোলিং)
 * টিম: /super/visitors (তালিকা, কথোপকথন, উত্তর) — নতুন মেসেজ SupportHub দিয়ে সাথে সাথে (support.js-এ টোস্ট)
 * পাবলিক পেজ ৫ মিনিট cache হয়, তাই পেজের HTML-এ ভিজিটরের কিছু থাকে না — সব JS দিয়ে আসে।
 */
import type { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { sha256Hex } from "../shop/lib/auth";
import { dhakaTime } from "../shop/lib/format";
import { clientIp, isHttps, str, toInt } from "../shop/lib/http";
import { normalizePhone } from "../shop/lib/phone";
import { Bubble } from "../shop/views/support";
import { platformSettings } from "./billing";
import { platformRateLimit, type PCtx, type PEnv } from "./lib";
import { agentsOnline, emit, hoursText, telegram, withinHours, type Message } from "./support";
import { DeskShell, deskCounts, ProfileLink, tierOf } from "./support-desk";

export type VisitorChat = {
  id: number; token_hash: string; name: string; phone: string | null; page: string | null; status: "open" | "closed";
  assigned_to: number | null; last_message_at: string; last_preview: string | null; last_sender: string | null;
  team_unread: number; visitor_unread: number; first_response_at: string | null; notified_at: string | null; created_at: string;
};
type VMsg = { id: number; chat_id: number; sender: "visitor" | "team" | "system"; author: string | null; body: string; created_at: string };

const COOKIE = "sx_vc";
const MAX_BODY = 1000;
const preview = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 140);
const out = (m: VMsg) => ({ id: m.id, sender: m.sender, author: m.sender === "team" ? m.author || "SellxBD" : null, body: m.body, at: m.created_at });
const db = (c: PCtx) => c.env.PLATFORM_DB;
/** টিমের পেজের JS (support.js bubble) যে ছকে চায় — ভিজিটর = "shop" পাশ */
const teamOut = (m: VMsg) => ({ id: m.id, sender: m.sender === "visitor" ? "shop" : m.sender, author: m.author, body: m.body, created_at: m.created_at, internal: 0, attachment: null });

/** একই সাইট থেকে এসেছে কি না (অন্য সাইট থেকে ফর্ম পাঠিয়ে মেসেজ দেওয়া আটকাতে) */
function sameOrigin(c: PCtx): boolean {
  const o = c.req.header("origin");
  if (!o) return true;
  try { return new URL(o).host === new URL(c.req.url).host; } catch { return false; }
}

async function current(c: PCtx): Promise<VisitorChat | null> {
  const t = getCookie(c, COOKIE);
  if (!t || !/^[a-f0-9]{48}$/.test(t)) return null;
  return db(c).prepare("SELECT * FROM visitor_chats WHERE token_hash = ?").bind(await sha256Hex(t)).first<VisitorChat>();
}

async function list(c: PCtx, chatId: number, after = 0): Promise<VMsg[]> {
  const r = await db(c).prepare("SELECT * FROM visitor_messages WHERE chat_id = ? AND id > ? ORDER BY id LIMIT 200").bind(chatId, after).all<VMsg>();
  return r.results;
}

async function addMessage(c: PCtx, chatId: number, sender: VMsg["sender"], author: string | null, body: string): Promise<VMsg> {
  const m = (await db(c).prepare("INSERT INTO visitor_messages (chat_id, sender, author, body) VALUES (?, ?, ?, ?) RETURNING *")
    .bind(chatId, sender, author, body).first<VMsg>())!;
  if (sender === "visitor") {
    await db(c).prepare("UPDATE visitor_chats SET last_message_at = datetime('now'), last_preview = ?, last_sender = 'visitor', team_unread = team_unread + 1, status = 'open' WHERE id = ?")
      .bind(preview(body), chatId).run();
  } else if (sender === "team") {
    await db(c).prepare("UPDATE visitor_chats SET last_message_at = datetime('now'), last_preview = ?, last_sender = 'team', visitor_unread = visitor_unread + 1, first_response_at = COALESCE(first_response_at, datetime('now')) WHERE id = ?")
      .bind(preview(body), chatId).run();
  }
  return m;
}

/** টিমের কেউ অনলাইনে না থাকলে Telegram-এ খবর — একটা চ্যাটে ১০ মিনিটে একবার */
async function notifyTeam(c: PCtx, chat: VisitorChat, body: string, isNew: boolean) {
  if ((await agentsOnline(c.env)) > 0) return;
  const ok = await db(c).prepare(
    "UPDATE visitor_chats SET notified_at = datetime('now') WHERE id = ? AND (notified_at IS NULL OR notified_at < datetime('now', '-10 minutes')) RETURNING id",
  ).bind(chat.id).first();
  if (!ok) return;
  const s = await platformSettings(db(c));
  const who = `${chat.name}${chat.phone ? ` (${chat.phone})` : ""}`;
  await telegram(s, `${isNew ? "🟢 সাইটে নতুন ভিজিটর চ্যাট" : "💬 ভিজিটরের মেসেজ"} — ${who}\n${body.slice(0, 500)}\nhttps://${c.env.PLATFORM_DOMAIN}/super/visitors/${chat.id}`);
}

/* =================== ভিজিটরের দিক (পাবলিক) =================== */
export function registerVisitorChat(app: Hono<PEnv>) {
  const noStore = (c: PCtx) => c.header("Cache-Control", "no-store");

  app.get("/chat/state", async (c) => {
    noStore(c);
    const s = await platformSettings(db(c));
    if (s.visitor_chat === "0") return c.json({ enabled: false });
    const [chat, online] = await Promise.all([current(c), agentsOnline(c.env)]);
    const within = withinHours(s);
    const phone = /^01[3-9]\d{8}$/.test(s.support_phone || "") ? s.support_phone : "";
    const base = { enabled: true, online: online > 0 && within, within, hours: hoursText(s), phone };
    if (!chat) return c.json({ ...base, chat: null });
    const msgs = await list(c, chat.id);
    if (chat.visitor_unread) await db(c).prepare("UPDATE visitor_chats SET visitor_unread = 0 WHERE id = ?").bind(chat.id).run();
    return c.json({ ...base, chat: { name: chat.name, status: chat.status }, messages: msgs.map(out) });
  });

  /** বন্ধ থাকা অবস্থায় হালকা খোঁজ — নতুন উত্তর এসেছে কি না (D1-এ একটা ছোট পড়া) */
  app.get("/chat/unread", async (c) => {
    noStore(c);
    const chat = await current(c);
    return c.json({ unread: chat?.visitor_unread ?? 0 });
  });

  app.get("/chat/messages", async (c) => {
    noStore(c);
    const chat = await current(c);
    if (!chat) return c.json({ messages: [] });
    const msgs = await list(c, chat.id, toInt(c.req.query("after")));
    if (chat.visitor_unread) await db(c).prepare("UPDATE visitor_chats SET visitor_unread = 0 WHERE id = ?").bind(chat.id).run();
    return c.json({ status: chat.status, messages: msgs.map(out) });
  });

  app.post("/chat/start", async (c) => {
    noStore(c);
    if (!sameOrigin(c)) return c.json({ error: "অনুমতি নেই" }, 403);
    const s = await platformSettings(db(c));
    if (s.visitor_chat === "0") return c.json({ error: "চ্যাট এখন বন্ধ" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (str(b.website, 50)) return c.json({ error: "ঠিক নেই" }, 400); // বটের ফাঁদ
    const name = str(b.name, 60);
    const body = str(b.body, MAX_BODY);
    const rawPhone = str(b.phone, 20);
    const phone = rawPhone ? normalizePhone(rawPhone) : null; // নম্বর বাধ্যতামূলক — চলে গেলেও উত্তর দেওয়া যায়
    if (!name) return c.json({ error: "আপনার নাম লিখুন" }, 400);
    if (!rawPhone) return c.json({ error: "মোবাইল নম্বর লিখুন" }, 400);
    if (!phone) return c.json({ error: "মোবাইল নম্বর ঠিক নেই (যেমন 017XXXXXXXX)" }, 400);
    if (!body) return c.json({ error: "আপনার প্রশ্ন লিখুন" }, 400);
    if (!(await platformRateLimit(c.env, `vchat:start:${clientIp(c)}`, 5, 3600))) return c.json({ error: "অনেকবার চেষ্টা হয়েছে — একটু পরে আবার চেষ্টা করুন, অথবা WhatsApp-এ লিখুন।" }, 429);

    // আগে চ্যাট থাকলে সেটাতেই চলবে
    const existing = await current(c);
    if (existing) {
      const m = await addMessage(c, existing.id, "visitor", existing.name, body);
      await emit(c.env, { type: "visitor", chatId: existing.id, name: existing.name, message: out(m) });
      return c.json({ ok: true });
    }
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
    const page = str(b.page, 200).replace(/[^\w\-/?=&.%#]/g, "").slice(0, 200) || "/";
    const chat = (await db(c).prepare("INSERT INTO visitor_chats (token_hash, name, phone, page) VALUES (?, ?, ?, ?) RETURNING *")
      .bind(await sha256Hex(token), name, phone, page).first<VisitorChat>())!;
    setCookie(c, COOKIE, token, { path: "/", httpOnly: true, sameSite: "Lax", secure: isHttps(c), maxAge: 90 * 86400 });
    // JS শুধু জানবে "আগে চ্যাট আছে" (টোকেন নয়) — তাহলেই পেজ খুললে নতুন উত্তরের খোঁজ নেয়
    setCookie(c, "sx_vc_on", "1", { path: "/", sameSite: "Lax", secure: isHttps(c), maxAge: 90 * 86400 });
    const m = await addMessage(c, chat.id, "visitor", name, body);
    if (!withinHours(s)) {
      await addMessage(c, chat.id, "system", null, `আমাদের টিম এখন অফিসের বাইরে (সাপোর্টের সময় ${hoursText(s)})। মেসেজ পেয়েছি — সময় হলেই উত্তর দেব।${phone ? " দরকার হলে এই নম্বরে ফোন করব।" : ""}`);
    }
    await emit(c.env, { type: "visitor", chatId: chat.id, name, isNew: true, message: out(m) });
    c.executionCtx.waitUntil(notifyTeam(c, chat, body, true));
    return c.json({ ok: true });
  });

  app.post("/chat/send", async (c) => {
    noStore(c);
    if (!sameOrigin(c)) return c.json({ error: "অনুমতি নেই" }, 403);
    const chat = await current(c);
    if (!chat) return c.json({ error: "চ্যাট পাওয়া যায়নি — আবার শুরু করুন", restart: true }, 404);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const body = str(b.body, MAX_BODY);
    if (!body) return c.json({ error: "মেসেজ লিখুন" }, 400);
    if (!(await platformRateLimit(c.env, `vchat:send:${chat.id}`, 20, 600))) return c.json({ error: "খুব দ্রুত মেসেজ যাচ্ছে — একটু থামুন।" }, 429);
    const m = await addMessage(c, chat.id, "visitor", chat.name, body);
    await emit(c.env, { type: "visitor", chatId: chat.id, name: chat.name, message: out(m) });
    c.executionCtx.waitUntil(notifyTeam(c, chat, body, false));
    return c.json({ message: out(m) });
  });
}

/* =================== টিমের দিক (/super/visitors) =================== */
type Helpers = {
  page: (c: PCtx, title: string, active: string, body: unknown, status?: 200 | 404 | 422, actions?: unknown) => Promise<Response>;
  allowed: (c: PCtx, perm: string) => boolean;
  forbidden: (c: PCtx) => Response;
  audit: (c: PCtx, action: string, targetType: string | null, targetId: string | null, detail?: string) => Promise<void>;
};

export async function visitorOpenCount(d: D1Database): Promise<number> {
  return (await d.prepare("SELECT COUNT(*) n FROM visitor_chats WHERE status = 'open' AND last_sender = 'visitor'").first<{ n: number }>())?.n ?? 0;
}

export function registerSuperVisitors(app: Hono<PEnv>, h: Helpers) {
  const me = (c: PCtx) => c.var.superAdmin!;
  const name = (c: PCtx) => me(c).name || me(c).email.split("@")[0]!;
  const guard = (c: PCtx) => (h.allowed(c, "support") ? null : h.forbidden(c));
  const isAjax = (c: PCtx) => c.req.header("x-sx-ajax") === "1";
  const load = (c: PCtx, id: number) => db(c).prepare("SELECT * FROM visitor_chats WHERE id = ?").bind(id).first<VisitorChat>();

  // পুরোনো তালিকা এখন সাপোর্ট ডেস্কের "ওয়েবসাইট ভিজিটর" কিউ
  app.get("/visitors", (c) => c.redirect(c.req.query("view") === "closed" ? "/super/support/leads" : "/super/support?who=visitor", 303));

  app.get("/visitors/:id{[0-9]+}", async (c) => {
    const no = guard(c); if (no) return no;
    const v = await load(c, toInt(c.req.param("id")));
    if (!v) return c.redirect("/super/visitors", 303);
    const msgs = await list(c, v.id);
    if (v.team_unread) await db(c).prepare("UPDATE visitor_chats SET team_unread = 0 WHERE id = ?").bind(v.id).run();
    const shop = v.phone ? await db(c).prepare("SELECT id, name, slug FROM shops WHERE owner_phone = ? AND deleted_at IS NULL LIMIT 1").bind(v.phone).first<{ id: string; name: string; slug: string }>() : null;
    const sh = shop ? await db(c).prepare("SELECT status, plan FROM shops WHERE id = ?").bind(shop.id).first<{ status: string; plan: string | null }>() : null;
    return h.page(c, `${v.name} — ভিজিটর চ্যাট`, "support",
      <DeskShell active="chat-visitor" counts={await deskCounts(c)} canSettings={h.allowed(c, "support.settings")}>
        {v.phone && <ProfileLink href={`/super/support/lead/${v.phone}`} tier={sh ? tierOf(sh) : "visitor"} label={`${v.name}-এর পুরো প্রোফাইল (এই নম্বরের সব চ্যাট)`} />}
        <VisitorThread v={v} msgs={msgs} shop={shop} />
      </DeskShell>);
  });

  app.get("/visitors/:id{[0-9]+}/messages", async (c) => {
    const no = guard(c); if (no) return c.json({}, 403);
    const v = await load(c, toInt(c.req.param("id")));
    if (!v) return c.json({ error: "not found" }, 404);
    const msgs = await list(c, v.id, toInt(c.req.query("after")));
    if (v.team_unread && msgs.length) await db(c).prepare("UPDATE visitor_chats SET team_unread = 0 WHERE id = ?").bind(v.id).run();
    return c.json({ status: v.status, messages: msgs.map(teamOut) });
  });

  app.post("/visitors/:id{[0-9]+}/reply", async (c) => {
    const no = guard(c); if (no) return no;
    const v = await load(c, toInt(c.req.param("id")));
    if (!v) return c.redirect("/super/visitors", 303);
    const b = await c.req.parseBody();
    const body = str(b.body, 3000);
    if (!body) return isAjax(c) ? c.json({ error: "উত্তর লিখুন" }, 400) : c.redirect(`/super/visitors/${v.id}`, 303);
    const m = await addMessage(c, v.id, "team", name(c), body);
    await db(c).prepare("UPDATE visitor_chats SET assigned_to = COALESCE(assigned_to, ?), status = 'open' WHERE id = ?").bind(me(c).id, v.id).run();
    await emit(c.env, { type: "visitor_reply", chatId: v.id });
    if (isAjax(c)) return c.json({ message: teamOut(m) });
    if (typeof b.back === "string" && /^\/super\/support\/lead\/01\d{9}$/.test(b.back)) return c.redirect(b.back, 303);
    return c.redirect(`/super/visitors/${v.id}`, 303);
  });

  app.post("/visitors/:id{[0-9]+}/status", async (c) => {
    const no = guard(c); if (no) return no;
    const v = await load(c, toInt(c.req.param("id")));
    if (!v) return c.redirect("/super/visitors", 303);
    const b = await c.req.parseBody();
    const next = b.status === "closed" ? "closed" : "open";
    if (next !== v.status) {
      await db(c).prepare("UPDATE visitor_chats SET status = ? WHERE id = ?").bind(next, v.id).run();
      await addMessage(c, v.id, "system", null, next === "closed" ? "কথোপকথন শেষ হয়েছে। আবার কিছু জানতে চাইলে এখানেই লিখুন।" : "কথোপকথন আবার খোলা হয়েছে।");
      await h.audit(c, next === "closed" ? "visitor.close" : "visitor.reopen", "visitor_chat", String(v.id));
    }
    return c.redirect(next === "closed" ? "/super/support?who=visitor" : `/super/visitors/${v.id}`, 303);
  });
}

/* =================== টিমের পেজ =================== */
const asMsg = (m: VMsg): Message => ({ id: m.id, ticket_id: m.chat_id, sender: m.sender === "visitor" ? "shop" : m.sender, author: m.author, body: m.body, attachment: null, internal: 0, created_at: m.created_at });

const VisitorThread = (p: { v: VisitorChat; msgs: VMsg[]; shop: { id: string; name: string; slug: string } | null }) => {
  const v = p.v;
  const wa = v.phone ? `https://wa.me/88${v.phone}` : "";
  return (
    <div class="sx-split" data-sx-agent-page="visitor" data-visitor-id={v.id}>
      <div class="sa-card sx-ticket">
        <div class="sx-ticket-head">
          <div>
            <h2 class="sx-title">{v.name}</h2>
            <div class="sx-tags">
              <span class="sx-chip">সাইটের ভিজিটর</span>
              <span class="sx-muted">শুরু {dhakaTime(v.created_at)}{v.first_response_at ? ` · প্রথম উত্তর ${dhakaTime(v.first_response_at)}` : " · এখনো উত্তর দেওয়া হয়নি"}</span>
            </div>
          </div>
        </div>
        <div class="sx-thread" id="sx-vthread" data-last={p.msgs.length ? p.msgs[p.msgs.length - 1]!.id : 0}>
          {p.msgs.map((m) => <Bubble m={asMsg(m)} viewer="team" />)}
        </div>
        <form method="post" action={`/super/visitors/${v.id}/reply`} class="sx-reply sx-reply-team" data-vx-reply>
          <textarea name="body" rows={3} placeholder="উত্তর লিখুন… (Enter = পাঠান, Shift+Enter = নতুন লাইন)" required maxlength={3000}></textarea>
          <div class="sx-reply-foot">
            <span class="sx-muted">ভিজিটর সাইটে থাকলে কয়েক সেকেন্ডের মধ্যে দেখবে; চলে গেলে পরের বার সাইটে এলে দেখবে।</span>
            <button class="sa-btn">পাঠান</button>
          </div>
        </form>
      </div>
      <aside class="sx-side">
        <div class="sa-card">
          <dl class="sx-dl">
            <dt>নাম</dt><dd>{v.name}</dd>
            <dt>মোবাইল</dt><dd>{v.phone ? <><a href={`tel:${v.phone}`}>{v.phone}</a> · <a href={wa} target="_blank" rel="noopener">WhatsApp</a></> : "—"}</dd>
            <dt>কোন পেজ থেকে</dt><dd>{v.page || "/"}</dd>
            {p.shop && <><dt>দোকান</dt><dd><a href={`/super/shops/${p.shop.id}`}>{p.shop.name}</a> (এই নম্বরে আগে খোলা)</dd></>}
          </dl>
          <form method="post" action={`/super/visitors/${v.id}/status`} class="sx-side-actions">
            <input type="hidden" name="status" value={v.status === "open" ? "closed" : "open"} />
            <button class={`sa-btn sa-btn-sm${v.status === "open" ? " sa-btn-ghost" : ""}`}>{v.status === "open" ? "কথোপকথন শেষ করুন" : "আবার খুলুন"}</button>
          </form>
        </div>
      </aside>
    </div>
  );
};
