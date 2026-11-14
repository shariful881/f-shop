/**
 * দোকানের অ্যাডমিন → /admin/support — টিকেট, লাইভ চ্যাট (JSON), রিয়েল-টাইম WebSocket।
 * ডাটা থাকে প্ল্যাটফর্ম D1-এ (support_*), স্ক্রিনশট দোকানের নিজের ইমেজ স্টোরে।
 */
import type { Hono } from "hono";
import { imageStorageKey, type AppEnv, type Ctx } from "../env";
import { publicOrigin, str, toInt } from "../lib/http";
import { platformSettings } from "../../platform/billing";
import {
  agentsOnline, CATEGORIES, createTicket, STATUS, emit, hoursText, hub, messages, openChat, PRIORITY, publicMsg, shopMessage, systemMessage, telegram, withinHours,
  type Ticket,
} from "../../platform/support";
import { ShopNewTicket, ShopSupportList, ShopTicketPage } from "../views/support";

type Render = (c: Ctx, title: string, active: string, body: unknown, status?: 200 | 404 | 422) => Promise<Response>;
type Flash = (c: Ctx, type: "ok" | "error", text: string) => void;

const IMG: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 3 * 1024 * 1024;

function checkFile(f: unknown): string | null {
  if (!(f instanceof File) || f.size === 0) return null;
  if (!IMG[f.type]) return "শুধু JPG, PNG বা WebP ছবি দিন";
  if (f.size > MAX) return "ছবি ৩ MB-এর কম হতে হবে";
  return null;
}
/** স্ক্রিনশট দোকানের স্টোরে রেখে পূর্ণ URL ফেরত — সুপার অ্যাডমিন থেকেও দেখা যায় */
async function saveFile(c: Ctx, f: unknown): Promise<string | null> {
  if (!(f instanceof File) || f.size === 0 || !IMG[f.type]) return null;
  const key = `support/${crypto.randomUUID()}.${IMG[f.type]}`;
  await c.env.IMAGES.put(imageStorageKey(c.env.SHOP_ID, key), await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
  return `${publicOrigin(c)}/img/${key}`;
}

const shopName = (c: Ctx) => c.var.settings.site_name || c.env.SHOP_SLUG;
const author = (c: Ctx) => c.var.admin!.name || c.var.admin!.email;
const superLink = (c: Ctx, id: number) => `https://${c.env.PLATFORM_DOMAIN}/super/support/${id}`;

async function myTicket(c: Ctx, id: number) {
  return c.env.PLATFORM_DB.prepare("SELECT * FROM support_tickets WHERE id = ? AND shop_id = ?").bind(id, c.env.SHOP_ID).first<Ticket>();
}

/** নতুন কথোপকথনে: টিমকে জানানো (প্যানেল + Telegram), অফলাইনে থাকলে অটো-উত্তর */
async function announceNew(c: Ctx, t: { id: number; channel: string; subject: string; priority: string; body: string }) {
  const s = await platformSettings(c.env.PLATFORM_DB);
  const online = (await agentsOnline(c.env)) > 0;
  await emit(c.env, { type: "ticket", ticketId: t.id, shopId: c.env.SHOP_ID, shopName: shopName(c), subject: t.subject, channel: t.channel });
  const pri = t.priority === "normal" ? "" : ` [${PRIORITY[t.priority]}]`;
  await telegram(s, `${t.channel === "chat" ? "💬 নতুন লাইভ চ্যাট" : "🎫 নতুন টিকেট"}${pri} — ${shopName(c)}\n${t.subject}\n\n${t.body.slice(0, 600)}\n\n${superLink(c, t.id)}`);
  if (!online || !withinHours(s)) {
    const sys = await systemMessage(c.env.PLATFORM_DB, t.id,
      withinHours(s)
        ? "ধন্যবাদ! টিমের সবাই এই মুহূর্তে ব্যস্ত আছেন — আপনার মেসেজ টিকেট হিসেবে জমা হয়েছে, যত দ্রুত সম্ভব এখানেই উত্তর পাবেন।"
        : `ধন্যবাদ! এখন অফিস সময়ের বাইরে (সাপোর্ট: ${hoursText(s)})। আপনার মেসেজ টিকেট হিসেবে জমা হয়েছে, অফিস খুললেই উত্তর পাবেন।`);
    if (sys) await emit(c.env, { type: "message", ticketId: t.id, shopId: c.env.SHOP_ID, message: publicMsg(sys) });
  }
}

export function registerSupport(admin: Hono<AppEnv>, render: Render, flash: Flash) {
  /* ---------- তালিকা ---------- */
  admin.get("/support", async (c) => {
    const [{ results }, s, n] = await Promise.all([
      c.env.PLATFORM_DB.prepare("SELECT * FROM support_tickets WHERE shop_id = ? ORDER BY (status IN ('open','pending')) DESC, last_message_at DESC LIMIT 100").bind(c.env.SHOP_ID).all<Ticket>(),
      platformSettings(c.env.PLATFORM_DB),
      agentsOnline(c.env),
    ]);
    return render(c, "সাপোর্ট", "support", <ShopSupportList tickets={results} online={n > 0} within={withinHours(s)} hours={hoursText(s)} phone={s.support_phone} />);
  });

  /* ---------- নতুন টিকেট ---------- */
  admin.get("/support/new", (c) => render(c, "নতুন টিকেট", "support", <ShopNewTicket />));

  admin.post("/support/new", async (c) => {
    const b = await c.req.parseBody();
    const values = { category: str(b.category, 20), priority: str(b.priority, 10), subject: str(b.subject, 150), body: str(b.body, 5000) };
    const errors: Record<string, string> = {};
    if (values.subject.length < 4) errors.subject = "বিষয় লিখুন (অন্তত ৪ অক্ষর)";
    if (values.body.length < 10) errors.body = "সমস্যাটা একটু বিস্তারিত লিখুন";
    const fe = checkFile(b.attachment);
    if (fe) errors.attachment = fe;
    const ajax = c.req.header("x-sx-ajax") === "1";
    if (Object.keys(errors).length) {
      if (ajax) return c.json({ error: Object.values(errors).join(" · "), errors }, 422);
      return render(c, "নতুন টিকেট", "support", <ShopNewTicket errors={errors} values={values} />, 422);
    }

    const attachment = await saveFile(c, b.attachment);
    const id = await createTicket(c.env.PLATFORM_DB, {
      shopId: c.env.SHOP_ID, channel: "ticket", subject: values.subject, category: values.category in CATEGORIES ? values.category : "other",
      priority: values.priority, openedBy: author(c), body: values.body, attachment,
    });
    await announceNew(c, { id, channel: "ticket", subject: values.subject, priority: values.priority, body: values.body });
    if (ajax) return c.json({ id, url: `/admin/support/${id}` });
    flash(c, "ok", `টিকেট #${id} জমা হয়েছে। উত্তর এলে এখানে আর মেনুতে দেখাবে।`);
    return c.redirect(`/admin/support/${id}`, 303);
  });

  /** উইজেটের "সাপোর্ট টিকেট" ভাগের তালিকা */
  admin.get("/support/tickets.json", async (c) => {
    const { results } = await c.env.PLATFORM_DB.prepare(
      `SELECT id, subject, status, priority, shop_unread, last_message_at, last_preview, last_sender FROM support_tickets
       WHERE shop_id = ? AND channel = 'ticket' ORDER BY (status IN ('open','pending')) DESC, last_message_at DESC LIMIT 15`,
    ).bind(c.env.SHOP_ID).all<Ticket>();
    return c.json({ tickets: results.map((t) => ({ ...t, status_label: STATUS[t.status] ?? t.status })) });
  });

  /* ---------- লাইভ চ্যাট (JSON — support.js) ---------- */
  admin.get("/support/chat", async (c) => {
    const db = c.env.PLATFORM_DB;
    const [chat, s, n, unread] = await Promise.all([
      openChat(db, c.env.SHOP_ID),
      platformSettings(db),
      agentsOnline(c.env),
      db.prepare("SELECT COALESCE(SUM(shop_unread), 0) n, COALESCE(SUM(CASE WHEN channel = 'ticket' THEN shop_unread END), 0) t FROM support_tickets WHERE shop_id = ?").bind(c.env.SHOP_ID).first<{ n: number; t: number }>(),
    ]);
    return c.json({
      online: n > 0, within: withinHours(s), hours: hoursText(s), unread: unread?.n ?? 0, ticketUnread: unread?.t ?? 0,
      ticketId: chat?.id ?? null, chatUnread: chat?.shop_unread ?? 0,
      messages: chat ? (await messages(db, chat.id, { includeInternal: false })).slice(-80).map(publicMsg) : [],
    });
  });

  admin.post("/support/chat", async (c) => {
    const b = await c.req.json<{ body?: string }>().catch(() => ({} as { body?: string }));
    const body = str(b.body, 2000);
    if (!body) return c.json({ error: "মেসেজ লিখুন" }, 400);
    const db = c.env.PLATFORM_DB;
    let chat = await openChat(db, c.env.SHOP_ID);
    if (!chat) {
      const subject = body.replace(/\s+/g, " ").slice(0, 60) + (body.length > 60 ? "…" : "");
      const id = await createTicket(db, { shopId: c.env.SHOP_ID, channel: "chat", subject, category: "other", priority: "normal", openedBy: author(c), body });
      const [msg] = await messages(db, id, { includeInternal: false });
      await announceNew(c, { id, channel: "chat", subject, priority: "normal", body });
      return c.json({ ticketId: id, message: publicMsg(msg!) });
    }
    const msg = await shopMessage(db, chat.id, author(c), body);
    await emit(c.env, { type: "message", ticketId: chat.id, shopId: c.env.SHOP_ID, shopName: shopName(c), message: publicMsg(msg) });
    if ((await agentsOnline(c.env)) === 0) {
      await telegram(await platformSettings(db), `💬 ${shopName(c)}: ${body.slice(0, 600)}\n\n${superLink(c, chat.id)}`);
    }
    return c.json({ ticketId: chat.id, message: publicMsg(msg) });
  });

  /** WebSocket না চললে পোলিং — নতুন মেসেজ */
  admin.get("/support/:id{[0-9]+}/messages", async (c) => {
    const t = await myTicket(c, toInt(c.req.param("id")));
    if (!t) return c.json({ error: "not found" }, 404);
    const list = await messages(c.env.PLATFORM_DB, t.id, { afterId: toInt(c.req.query("after")), includeInternal: false });
    return c.json({ status: t.status, messages: list.map(publicMsg) });
  });

  /** দোকানদার পড়েছে */
  admin.post("/support/:id{[0-9]+}/read", async (c) => {
    await c.env.PLATFORM_DB.prepare("UPDATE support_tickets SET shop_unread = 0 WHERE id = ? AND shop_id = ?").bind(toInt(c.req.param("id")), c.env.SHOP_ID).run();
    return c.json({ ok: true });
  });

  /** রিয়েল-টাইম: সেশন যাচাই হয়ে গেছে (requireAdmin), এখন হাবে পাঠানো */
  admin.get("/support/ws", async (c) => {
    if (c.req.header("Upgrade") !== "websocket") return c.text("expected websocket", 426);
    const origin = c.req.header("origin");
    if (origin && origin !== publicOrigin(c) && origin !== new URL(c.req.url).origin) return c.text("forbidden", 403);
    return hub(c.env).fetch(new Request("https://hub/ws", {
      headers: { Upgrade: "websocket", "x-sh-role": "shop", "x-sh-shop": c.env.SHOP_ID, "x-sh-name": author(c) },
    }));
  });

  /* ---------- একটা টিকেট ---------- */
  admin.get("/support/:id{[0-9]+}", async (c) => {
    const t = await myTicket(c, toInt(c.req.param("id")));
    if (!t) return c.redirect("/admin/support", 303);
    const msgs = await messages(c.env.PLATFORM_DB, t.id, { includeInternal: false });
    if (t.shop_unread) await c.env.PLATFORM_DB.prepare("UPDATE support_tickets SET shop_unread = 0 WHERE id = ?").bind(t.id).run();
    return render(c, `টিকেট #${t.id}`, "support", <ShopTicketPage t={t} msgs={msgs} />);
  });

  admin.post("/support/:id{[0-9]+}/reply", async (c) => {
    const t = await myTicket(c, toInt(c.req.param("id")));
    if (!t) return c.redirect("/admin/support", 303);
    const b = await c.req.parseBody();
    const body = str(b.body, 5000);
    const fe = checkFile(b.attachment);
    const ajax = c.req.header("x-sx-ajax") === "1";
    if (fe) { if (ajax) return c.json({ error: fe }, 400); flash(c, "error", fe); return c.redirect(`/admin/support/${t.id}`, 303); }
    if (!body && !(b.attachment instanceof File && b.attachment.size)) return ajax ? c.json({ error: "মেসেজ লিখুন" }, 400) : c.redirect(`/admin/support/${t.id}`, 303);
    const msg = await shopMessage(c.env.PLATFORM_DB, t.id, author(c), body, await saveFile(c, b.attachment));
    await emit(c.env, { type: "message", ticketId: t.id, shopId: c.env.SHOP_ID, shopName: shopName(c), message: publicMsg(msg) });
    if ((await agentsOnline(c.env)) === 0) {
      await telegram(await platformSettings(c.env.PLATFORM_DB), `↩️ ${shopName(c)} — #${t.id} ${t.subject}\n${body.slice(0, 600)}\n\n${superLink(c, t.id)}`);
    }
    return ajax ? c.json({ message: publicMsg(msg), status: "open" }) : c.redirect(`/admin/support/${t.id}`, 303);
  });

  admin.post("/support/:id{[0-9]+}/resolve", async (c) => {
    const t = await myTicket(c, toInt(c.req.param("id")));
    if (!t) return c.redirect("/admin/support", 303);
    const db = c.env.PLATFORM_DB;
    await db.prepare("UPDATE support_tickets SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?").bind(t.id).run();
    const sys = await systemMessage(db, t.id, `${author(c)} টিকেটটি সমাধান হয়েছে বলে বন্ধ করেছেন।`);
    await emit(c.env, { type: "status", ticketId: t.id, shopId: c.env.SHOP_ID, status: "resolved", message: sys ? publicMsg(sys) : undefined });
    flash(c, "ok", "ধন্যবাদ! টিকেটটি সমাধান হিসেবে বন্ধ হয়েছে।");
    return c.redirect(`/admin/support/${t.id}`, 303);
  });

  admin.post("/support/:id{[0-9]+}/rate", async (c) => {
    const t = await myTicket(c, toInt(c.req.param("id")));
    if (!t) return c.redirect("/admin/support", 303);
    const b = await c.req.parseBody();
    const rating = toInt(b.rating);
    if (rating >= 1 && rating <= 5 && !t.rating) {
      await c.env.PLATFORM_DB.prepare("UPDATE support_tickets SET rating = ?, rating_comment = ? WHERE id = ?").bind(rating, str(b.comment, 500) || null, t.id).run();
      await emit(c.env, { type: "rating", ticketId: t.id, rating });
      flash(c, "ok", "রেটিংয়ের জন্য ধন্যবাদ!");
    }
    return c.redirect(`/admin/support/${t.id}`, 303);
  });
}
