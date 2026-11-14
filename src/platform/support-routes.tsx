/**
 * সুপার অ্যাডমিন → /super/support — ইনবক্স, কথোপকথন, তৈরি উত্তর, সেটিংস, রিয়েল-টাইম।
 */
import type { Hono } from "hono";
import { str, toInt } from "../shop/lib/http";
import { clearSettingsCache, platformSettings } from "./billing";
import { shopUrl, type PCtx, type PEnv } from "./lib";
import {
  agentsOnline, CATEGORIES, emit, hoursText, hub, messages, PRIORITY, publicMsg, STATUS, STATUS_TEAM, systemMessage, teamMessage, telegram,
  type Ticket,
} from "./support";
import { CannedPage, InboxPage, SupportSettingsPage, SuperTicketPage, type Canned, type InboxRow, type Metrics, type ShopCtx, type TeamMember } from "./support-views";

type Helpers = {
  page: (c: PCtx, title: string, active: string, body: unknown, status?: 200 | 404 | 422, actions?: unknown) => Promise<Response>;
  flash: (c: PCtx, type: "ok" | "error", text: string) => void;
  allowed: (c: PCtx, perm: string) => boolean;
  forbidden: (c: PCtx) => Response;
  audit: (c: PCtx, action: string, targetType: string | null, targetId: string | null, detail?: string) => Promise<void>;
};

const OPEN = "t.status IN ('open', 'pending')";
const VIEW_SQL: Record<string, string> = {
  open: OPEN,
  mine: `${OPEN} AND t.assigned_to = ?`,
  unassigned: `${OPEN} AND t.assigned_to IS NULL`,
  waiting: "t.status = 'pending'",
  resolved: "t.status IN ('resolved', 'closed')",
  all: "1",
};
const AGENT_ROLES = "('owner', 'admin', 'support')";
const isAjax = (c: PCtx) => c.req.header("x-sx-ajax") === "1";

export function registerSuperSupport(app: Hono<PEnv>, h: Helpers) {
  const me = (c: PCtx) => c.var.superAdmin!;
  const name = (c: PCtx) => me(c).name || me(c).email.split("@")[0]!;
  const guard = (c: PCtx) => (h.allowed(c, "support") ? null : h.forbidden(c));
  const db = (c: PCtx) => c.env.PLATFORM_DB;

  /* ---------- ইনবক্স ---------- */
  app.get("/support", async (c) => {
    const no = guard(c); if (no) return no;
    const view = c.req.query("view") && VIEW_SQL[c.req.query("view")!] ? c.req.query("view")! : "open";
    const q = str(c.req.query("q"), 80);
    const channel = ["chat", "ticket"].includes(c.req.query("channel") ?? "") ? c.req.query("channel")! : "";
    const where = [VIEW_SQL[view]!];
    const binds: unknown[] = view === "mine" ? [me(c).id] : [];
    if (channel) { where.push("t.channel = ?"); binds.push(channel); }
    if (q) {
      const id = /^#?(\d+)$/.exec(q)?.[1];
      if (id) { where.push("t.id = ?"); binds.push(Number(id)); }
      else { where.push("(t.subject LIKE ? OR s.name LIKE ? OR s.slug LIKE ?)"); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    }
    const order = view === "resolved" || view === "all"
      ? "t.last_message_at DESC"
      : "(t.team_unread > 0) DESC, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, (t.status = 'open') DESC, t.last_message_at DESC";
    const [rows, m, counts] = await db(c).batch([
      db(c).prepare(
        `SELECT t.*, s.name AS shop_name, s.slug, COALESCE(a.name, a.email) AS agent_name FROM support_tickets t
         JOIN shops s ON s.id = t.shop_id LEFT JOIN super_admins a ON a.id = t.assigned_to
         WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 200`,
      ).bind(...binds),
      db(c).prepare(
        `SELECT
           SUM(status IN ('open','pending')) open,
           SUM(status IN ('open','pending') AND assigned_to IS NULL) unassigned,
           SUM(status IN ('open','pending') AND assigned_to = ?1) mine,
           SUM(status IN ('open','pending') AND priority = 'urgent') urgent,
           AVG(CASE WHEN created_at >= datetime('now','-7 days') AND first_response_at IS NOT NULL THEN (julianday(first_response_at) - julianday(created_at)) * 1440 END) frt,
           SUM(resolved_at >= datetime('now','-7 days')) resolved7,
           AVG(CASE WHEN created_at >= datetime('now','-30 days') THEN rating END) csat,
           SUM(created_at >= datetime('now','-30 days') AND rating IS NOT NULL) rated
         FROM support_tickets`,
      ).bind(me(c).id),
      db(c).prepare(
        "SELECT SUM(status = 'pending') waiting, SUM(channel = 'chat' AND status IN ('open','pending')) chat, SUM(channel = 'ticket' AND status IN ('open','pending')) ticket FROM support_tickets",
      ),
    ]);
    const mm = (m!.results[0] ?? {}) as Record<string, number | null>;
    const metrics: Metrics = {
      open: mm.open ?? 0, unassigned: mm.unassigned ?? 0, mine: mm.mine ?? 0, urgent: mm.urgent ?? 0, frt: mm.frt ?? null,
      resolved7: mm.resolved7 ?? 0, csat: mm.csat ?? null, rated: mm.rated ?? 0, online: await agentsOnline(c.env),
    };
    const cc = (counts!.results[0] ?? {}) as { waiting: number | null; chat: number | null; ticket: number | null };
    const tabCounts: Record<string, number> = { open: metrics.open, mine: metrics.mine, unassigned: metrics.unassigned, waiting: cc.waiting ?? 0 };
    return h.page(c, "সাপোর্ট", "support",
      <InboxPage rows={rows!.results as InboxRow[]} m={metrics} view={view} q={q} channel={channel} counts={tabCounts} chCounts={{ chat: cc.chat ?? 0, ticket: cc.ticket ?? 0 }} />, 200,
      <>
        <a href="/super/support/canned" class="sa-btn sa-btn-ghost sa-btn-sm">⚡ তৈরি উত্তর</a>
        {h.allowed(c, "support.settings") && <a href="/super/support/settings" class="sa-btn sa-btn-ghost sa-btn-sm">⚙ সেটিংস</a>}
      </>);
  });

  /** মেনুর ব্যাজ আর নতুন কথোপকথনের খবর (WebSocket না চললে পোলিং) */
  app.get("/support/pulse", async (c) => {
    const no = guard(c); if (no) return c.json({}, 403);
    const r = await db(c).prepare(
      "SELECT SUM(status IN ('open','pending')) open, SUM(team_unread > 0) unread, MAX(id) last FROM support_tickets",
    ).first<{ open: number | null; unread: number | null; last: number | null }>();
    return c.json({ open: r?.open ?? 0, unread: r?.unread ?? 0, last: r?.last ?? 0 });
  });

  app.get("/support/ws", async (c) => {
    if (!h.allowed(c, "support")) return c.text("forbidden", 403);
    if (c.req.header("Upgrade") !== "websocket") return c.text("expected websocket", 426);
    const origin = c.req.header("origin");
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.text("forbidden", 403);
    return hub(c.env).fetch(new Request("https://hub/ws", { headers: { Upgrade: "websocket", "x-sh-role": "agent", "x-sh-name": name(c) } }));
  });

  /* ---------- তৈরি উত্তর ---------- */
  app.get("/support/canned", async (c) => {
    const no = guard(c); if (no) return no;
    const { results } = await db(c).prepare("SELECT * FROM canned_replies ORDER BY sort_order, id").all<Canned>();
    const edit = c.req.query("edit") ? results.find((r) => r.id === toInt(c.req.query("edit"))) ?? null : null;
    return h.page(c, "তৈরি উত্তর", "support", <CannedPage list={results} edit={edit} />, 200, <a href="/super/support" class="sa-btn sa-btn-ghost sa-btn-sm">← ইনবক্স</a>);
  });
  const cannedInput = async (c: PCtx) => {
    const b = await c.req.parseBody();
    return { title: str(b.title, 60), body: str(b.body, 3000), sort: toInt(b.sort_order) };
  };
  app.post("/support/canned", async (c) => {
    const no = guard(c); if (no) return no;
    const v = await cannedInput(c);
    if (v.title && v.body) {
      await db(c).prepare("INSERT INTO canned_replies (title, body, sort_order) VALUES (?, ?, ?)").bind(v.title, v.body, v.sort).run();
      h.flash(c, "ok", "তৈরি উত্তর যোগ হয়েছে।");
    }
    return c.redirect("/super/support/canned", 303);
  });
  app.post("/support/canned/:id{[0-9]+}", async (c) => {
    const no = guard(c); if (no) return no;
    const v = await cannedInput(c);
    if (v.title && v.body) {
      await db(c).prepare("UPDATE canned_replies SET title = ?, body = ?, sort_order = ? WHERE id = ?").bind(v.title, v.body, v.sort, toInt(c.req.param("id"))).run();
      h.flash(c, "ok", "সেভ হয়েছে।");
    }
    return c.redirect("/super/support/canned", 303);
  });
  app.post("/support/canned/:id{[0-9]+}/delete", async (c) => {
    const no = guard(c); if (no) return no;
    await db(c).prepare("DELETE FROM canned_replies WHERE id = ?").bind(toInt(c.req.param("id"))).run();
    h.flash(c, "ok", "মুছে ফেলা হয়েছে।");
    return c.redirect("/super/support/canned", 303);
  });

  /* ---------- সেটিংস ---------- */
  app.get("/support/settings", async (c) => {
    if (!h.allowed(c, "support.settings")) return h.forbidden(c);
    return h.page(c, "সাপোর্ট সেটিংস", "support", <SupportSettingsPage s={await platformSettings(db(c), true)} />, 200, <a href="/super/support" class="sa-btn sa-btn-ghost sa-btn-sm">← ইনবক্স</a>);
  });
  app.post("/support/settings", async (c) => {
    if (!h.allowed(c, "support.settings")) return h.forbidden(c);
    const b = await c.req.parseBody();
    const time = (v: unknown, d: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(str(v, 5)) ? str(v, 5) : d);
    const values: [string, string][] = [
      ["support_hours_start", time(b.support_hours_start, "00:00")],
      ["support_hours_end", time(b.support_hours_end, "00:00")],
      ["telegram_chat_id", b.telegram_clear ? "" : str(b.telegram_chat_id, 40).replace(/[^\d-]/g, "")],
    ];
    const token = str(b.telegram_bot_token, 120);
    if (b.telegram_clear) values.push(["telegram_bot_token", ""]);
    else if (token) {
      if (!/^\d+:[\w-]{20,}$/.test(token)) {
        h.flash(c, "error", "Bot token সঠিক নয় — BotFather যেমন দিয়েছে (123456789:AA…) তেমন দিন।");
        return c.redirect("/super/support/settings", 303);
      }
      values.push(["telegram_bot_token", token]);
    }
    await db(c).batch(values.map(([k, v]) =>
      db(c).prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v)));
    clearSettingsCache();
    await h.audit(c, "support.settings", "settings", null, `সময় ${values[0]![1]}–${values[1]![1]}${token ? ", Telegram টোকেন বদল" : ""}${b.telegram_clear ? ", Telegram বন্ধ" : ""}`);
    if (b.test) {
      const s = await platformSettings(db(c), true);
      if (!s.telegram_bot_token || !s.telegram_chat_id) h.flash(c, "error", "সেভ হয়েছে, কিন্তু টেস্টের জন্য টোকেন আর chat id দুটোই লাগবে।");
      else {
        await telegram(s, `✅ SellxBD সাপোর্ট — টেস্ট মেসেজ (${name(c)})। নতুন টিকেট/চ্যাট এলে এখানে খবর পাবেন। সাপোর্টের সময়: ${hoursText(s)}`);
        h.flash(c, "ok", "সেভ হয়েছে আর টেস্ট মেসেজ পাঠানো হয়েছে — Telegram-এ না এলে টোকেন/chat id আর বট গ্রুপে আছে কি না দেখুন।");
      }
    } else h.flash(c, "ok", "সাপোর্ট সেটিংস সেভ হয়েছে।");
    return c.redirect("/super/support/settings", 303);
  });

  /* ---------- একটা কথোপকথন ---------- */
  const load = (c: PCtx, id: number) => db(c).prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first<Ticket>();

  app.get("/support/:id{[0-9]+}", async (c) => {
    const no = guard(c); if (no) return no;
    const t = await load(c, toInt(c.req.param("id")));
    if (!t) return c.redirect("/super/support", 303);
    const [shop, team, canned, history] = await db(c).batch([
      db(c).prepare("SELECT s.*, (SELECT group_concat(hostname, ', ') FROM domains d WHERE d.shop_id = s.id) AS domains FROM shops s WHERE s.id = ?").bind(t.shop_id),
      db(c).prepare(`SELECT id, name, email FROM super_admins WHERE active = 1 AND role IN ${AGENT_ROLES} ORDER BY name, email`),
      db(c).prepare("SELECT * FROM canned_replies ORDER BY sort_order, id"),
      db(c).prepare("SELECT * FROM support_tickets WHERE shop_id = ? AND id != ? ORDER BY id DESC LIMIT 8").bind(t.shop_id, t.id),
    ]);
    const msgs = await messages(db(c), t.id, { includeInternal: true });
    if (t.team_unread) await db(c).prepare("UPDATE support_tickets SET team_unread = 0 WHERE id = ?").bind(t.id).run();
    const s = shop!.results[0] as ShopCtx;
    return h.page(c, `${s.name} — #${t.id}`, "support",
      <SuperTicketPage t={t} msgs={msgs} shop={s} team={team!.results as TeamMember[]} canned={canned!.results as Canned[]} history={history!.results as Ticket[]}
        canEnter={h.allowed(c, "shop.impersonate")} shopLink={shopUrl(c.env, s.slug, "/")} meId={me(c).id} />);
  });

  app.get("/support/:id{[0-9]+}/messages", async (c) => {
    const no = guard(c); if (no) return c.json({}, 403);
    const t = await load(c, toInt(c.req.param("id")));
    if (!t) return c.json({ error: "not found" }, 404);
    const list = await messages(db(c), t.id, { afterId: toInt(c.req.query("after")), includeInternal: true });
    if (t.team_unread && list.length) await db(c).prepare("UPDATE support_tickets SET team_unread = 0 WHERE id = ?").bind(t.id).run();
    return c.json({ status: t.status, messages: list.map(publicMsg) });
  });

  app.post("/support/:id{[0-9]+}/reply", async (c) => {
    const no = guard(c); if (no) return no;
    const t = await load(c, toInt(c.req.param("id")));
    if (!t) return c.redirect("/super/support", 303);
    const b = await c.req.parseBody();
    const body = str(b.body, 5000);
    if (!body) return isAjax(c) ? c.json({ error: "উত্তর লিখুন" }, 400) : c.redirect(`/super/support/${t.id}`, 303);
    const internal = b.internal === "1";
    const next = str(b.next_status, 10);
    const msg = await teamMessage(db(c), t.id, name(c), body, internal, next);
    if (!internal && !t.assigned_to) await db(c).prepare("UPDATE support_tickets SET assigned_to = ? WHERE id = ? AND assigned_to IS NULL").bind(me(c).id, t.id).run();
    const status = internal ? t.status : next in STATUS ? next : "pending";
    // ভিতরের নোট শুধু টিম পায় (shopId ছাড়া)
    await emit(c.env, { type: "message", ticketId: t.id, shopId: internal ? undefined : t.shop_id, status, message: publicMsg(msg) });
    if (isAjax(c)) return c.json({ message: publicMsg(msg), status });
    return c.redirect(next === "resolved" && !internal ? "/super/support" : `/super/support/${t.id}`, 303);
  });

  app.post("/support/:id{[0-9]+}/update", async (c) => {
    const no = guard(c); if (no) return no;
    const t = await load(c, toInt(c.req.param("id")));
    if (!t) return c.redirect("/super/support", 303);
    const b = await c.req.parseBody();
    const sets: string[] = [];
    const binds: unknown[] = [];
    const notes: string[] = [];
    let shopNote: string | null = null;

    if (typeof b.status === "string" && b.status in STATUS && b.status !== t.status) {
      sets.push("status = ?", "resolved_at = ?");
      binds.push(b.status, ["resolved", "closed"].includes(b.status) ? new Date().toISOString().replace("T", " ").slice(0, 19) : null);
      notes.push(`অবস্থা: ${STATUS_TEAM[b.status]}`);
      if (b.status === "resolved") shopNote = "সাপোর্ট টিম টিকেটটি সমাধান হিসেবে চিহ্নিত করেছে। এখনো সমস্যা থাকলে উত্তর দিন — টিকেট আবার খুলবে।";
      if (b.status === "closed") shopNote = "টিকেটটি বন্ধ করা হয়েছে।";
    }
    if (typeof b.priority === "string" && b.priority in PRIORITY && b.priority !== t.priority) { sets.push("priority = ?"); binds.push(b.priority); notes.push(`গুরুত্ব: ${PRIORITY[b.priority]}`); }
    if (typeof b.category === "string" && b.category in CATEGORIES && b.category !== t.category) { sets.push("category = ?"); binds.push(b.category); notes.push(`ধরন: ${CATEGORIES[b.category]}`); }
    if (b.assigned_to !== undefined) {
      const aid = toInt(b.assigned_to) || null;
      if (aid !== t.assigned_to) {
        const agent = aid ? await db(c).prepare(`SELECT id, COALESCE(name, email) n FROM super_admins WHERE id = ? AND active = 1 AND role IN ${AGENT_ROLES}`).bind(aid).first<{ id: number; n: string }>() : null;
        if (!aid || agent) { sets.push("assigned_to = ?"); binds.push(aid); notes.push(aid ? `দায়িত্বে: ${agent!.n}` : "দায়িত্ব থেকে সরানো হলো"); }
      }
    }
    if (sets.length) {
      await db(c).prepare(`UPDATE support_tickets SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, t.id).run();
      // টিমের জন্য পরিবর্তনের লগ (দোকান দেখে না)
      const log = await db(c).prepare("INSERT INTO support_messages (ticket_id, sender, author, body, internal) VALUES (?, 'system', ?, ?, 1) RETURNING *")
        .bind(t.id, name(c), `${name(c)} — ${notes.join(" · ")}`).first<import("./support").Message>();
      if (log) await emit(c.env, { type: "message", ticketId: t.id, message: publicMsg(log) });
      if (shopNote) {
        const sys = await systemMessage(db(c), t.id, shopNote);
        await emit(c.env, { type: "status", ticketId: t.id, shopId: t.shop_id, status: b.status, message: sys ? publicMsg(sys) : undefined });
      }
      h.flash(c, "ok", "আপডেট হয়েছে।");
    }
    return c.redirect(`/super/support/${t.id}`, 303);
  });
}

