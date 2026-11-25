/**
 * সাপোর্ট ডেস্ক (সুপার অ্যাডমিন → সাপোর্ট) — পেশাদার হেল্পডেস্কের মতো:
 *  বাঁয়ে মেনু (লাইভ চ্যাট / টিকেট / দোকান / ভিজিটর), মাঝে সিরিয়াল ধরে কিউ, আর প্রতিটা দোকান ও ভিজিটরের (ফোন নম্বর ধরে) সাপোর্ট প্রোফাইল।
 * লেবেল: 🔵 ওয়েবসাইট ভিজিটর · 🟡 ট্রায়াল/ফ্রি · 🟢 পেইড · 🔴 মেয়াদ শেষ
 */
import type { Child } from "hono/jsx";
import type { Hono } from "hono";
import { bn, dhakaTime, taka } from "../shop/lib/format";
import { str } from "../shop/lib/http";
import { normalizePhone } from "../shop/lib/phone";
import { Icon, type IconName } from "../shop/views/icons";
import { Bubble } from "../shop/views/support";
import { ago } from "./super-views";
import { agentsOnline, CATEGORIES, STATUS_TEAM, type Message } from "./support";
import { dur } from "./support-views";
import { shopUrl, type PCtx, type PEnv } from "./lib";

type Helpers = {
  page: (c: PCtx, title: string, active: string, body: unknown, status?: 200 | 404 | 422, actions?: unknown) => Promise<Response>;
  allowed: (c: PCtx, perm: string) => boolean;
  forbidden: (c: PCtx) => Response;
  audit: (c: PCtx, action: string, targetType: string | null, targetId: string | null, detail?: string) => Promise<void>;
};

/* ---------------- লেবেল ---------------- */
export type Tier = "visitor" | "trial" | "paid" | "expired" | "closed";
export const TIER: Record<Tier, string> = { visitor: "ওয়েবসাইট ভিজিটর", trial: "ফ্রি ট্রায়াল", paid: "পেইড", expired: "মেয়াদ শেষ", closed: "বন্ধ" };
export function tierOf(s: { status?: string | null; plan?: string | null } | null | undefined): Tier {
  if (!s || !s.status) return "visitor";
  if (s.status === "trial") return "trial";
  if (s.status === "active") return s.plan && s.plan !== "free" ? "paid" : "trial";
  if (s.status === "suspended") return "expired";
  return "closed";
}
export const TierTag = ({ t }: { t: Tier }) => <span class={`hd-tag hd-t-${t}`}>{TIER[t]}</span>;
/** SQL: দোকানের লেবেল (shops s) */
const TIER_SQL = `CASE WHEN s.id IS NULL THEN 'visitor' WHEN s.status = 'trial' THEN 'trial' WHEN s.status = 'active' AND COALESCE(s.plan, 'free') != 'free' THEN 'paid'
  WHEN s.status = 'active' THEN 'trial' WHEN s.status = 'suspended' THEN 'expired' ELSE 'closed' END`;

const PLAN_NAME: Record<string, string> = { free: "ফ্রি", small: "ছোট দোকান", grow: "বাড়ন্ত", big: "বড় ব্র্যান্ড" };

export const FOLLOW: Record<string, string> = { new: "নতুন", called: "ফোন করা হয়েছে", interested: "আগ্রহী", not_interested: "আগ্রহী না" };

/* ---------------- কাউন্ট (বাঁয়ের মেনু) ---------------- */
export type DeskCounts = { chat: number; chatVisitor: number; chatTrial: number; chatPaid: number; ticket: number; ticketMine: number; online: number };

const W_TICKET = `(SELECT MIN(m.created_at) FROM support_messages m WHERE m.ticket_id = t.id AND m.sender = 'shop'
  AND m.id > COALESCE((SELECT MAX(x.id) FROM support_messages x WHERE x.ticket_id = t.id AND x.sender = 'team' AND x.internal = 0), 0))`;
const W_VISITOR = `(SELECT MIN(m.created_at) FROM visitor_messages m WHERE m.chat_id = v.id AND m.sender = 'visitor'
  AND m.id > COALESCE((SELECT MAX(x.id) FROM visitor_messages x WHERE x.chat_id = v.id AND x.sender = 'team'), 0))`;

export async function deskCounts(c: PCtx): Promise<DeskCounts> {
  const db = c.env.PLATFORM_DB;
  const meId = c.var.superAdmin?.id ?? 0;
  const [a, b] = await db.batch([
    db.prepare(`SELECT
        SUM(t.channel = 'chat' AND t.last_sender = 'shop') chat,
        SUM(t.channel = 'chat' AND t.last_sender = 'shop' AND ${TIER_SQL} = 'trial') ctrial,
        SUM(t.channel = 'chat' AND t.last_sender = 'shop' AND ${TIER_SQL} IN ('paid', 'expired')) cpaid,
        SUM(t.channel = 'ticket') ticket,
        SUM(t.channel = 'ticket' AND t.assigned_to = ?) mine
      FROM support_tickets t JOIN shops s ON s.id = t.shop_id WHERE t.status IN ('open', 'pending')`).bind(meId),
    db.prepare("SELECT COUNT(*) n FROM visitor_chats WHERE status = 'open' AND last_sender = 'visitor'"),
  ]);
  const x = (a!.results[0] ?? {}) as Record<string, number | null>;
  const v = ((b!.results[0] ?? {}) as { n: number }).n ?? 0;
  return { chat: (x.chat ?? 0) + v, chatVisitor: v, chatTrial: x.ctrial ?? 0, chatPaid: x.cpaid ?? 0, ticket: x.ticket ?? 0, ticketMine: x.mine ?? 0, online: await agentsOnline(c.env) };
}

/* ---------------- খোলস: বাঁয়ে মেনু + ডানে কাজ ---------------- */
export const DeskShell = (p: { active: string; counts: DeskCounts; children?: Child; kind?: string; canSettings?: boolean }) => {
  const N = ({ n }: { n: number }) => (n > 0 ? <span class="hd-n">{bn(n)}</span> : null);
  const L = ({ k, href, icon, label, n, dot }: { k: string; href: string; icon?: IconName; label: string; n?: number; dot?: Tier }) => (
    <a href={href} class={`hd-link${p.active === k ? " active" : ""}`}>
      {dot ? <i class={`hd-dot hd-t-${dot}`} /> : <Icon name={icon!} size="sm" />}<span>{label}</span>{n != null && <N n={n} />}
    </a>
  );
  return (
    <div class="hd" data-sx-agent-page={p.kind}>
      <aside class="hd-rail">
        <div class="hd-rail-head"><b>সাপোর্ট ডেস্ক</b><span class="hd-online"><i />{bn(p.counts.online)} জন অনলাইনে</span></div>
        <div class="hd-sec">লাইভ চ্যাট</div>
        <L k="chat" href="/super/support" icon="message-circle" label="সব চ্যাট" n={p.counts.chat} />
        <L k="chat-visitor" href="/super/support?who=visitor" dot="visitor" label="ওয়েবসাইট ভিজিটর" n={p.counts.chatVisitor} />
        <L k="chat-trial" href="/super/support?who=trial" dot="trial" label="ফ্রি ট্রায়াল" n={p.counts.chatTrial} />
        <L k="chat-paid" href="/super/support?who=paid" dot="paid" label="পেইড" n={p.counts.chatPaid} />
        <div class="hd-sec">টিকেট</div>
        <L k="ticket" href="/super/support/tickets" icon="ticket" label="চলমান টিকেট" n={p.counts.ticket} />
        <L k="ticket-mine" href="/super/support/tickets?view=mine" icon="user" label="আমার টিকেট" n={p.counts.ticketMine} />
        <L k="ticket-done" href="/super/support/tickets?view=resolved" icon="check" label="সমাধান হয়েছে" />
        <div class="hd-sec">প্রোফাইল</div>
        <L k="shops" href="/super/support/shops" icon="store" label="দোকান" />
        <L k="leads" href="/super/support/leads" icon="users" label="ভিজিটর (ফোন নম্বর)" />
        <div class="hd-sec">টুল</div>
        <L k="canned" href="/super/support/canned" icon="zap" label="তৈরি উত্তর" />
        {p.canSettings && <L k="settings" href="/super/support/settings" icon="settings" label="সাপোর্ট সেটিংস" />}
      </aside>
      <section class="hd-main">{p.children}</section>
    </div>
  );
};

/* ---------------- কিউ (সিরিয়াল) ---------------- */
type QRow = {
  kind: "shop" | "visitor"; id: number; href: string; name: string; sub: string; tier: Tier; preview: string | null; lastSender: string | null;
  lastAt: string; waiting: string | null; unread: number; agent: string | null; profile: string; created: string;
};
const minsSince = (utc: string | null) => (utc ? Math.max(0, (Date.now() - new Date(utc.replace(" ", "T") + "Z").getTime()) / 60000) : null);

const QueueList = (p: { rows: QRow[]; empty: string; ticket?: boolean }) => {
  const wait = p.rows.filter((r) => r.waiting);
  const rest = p.rows.filter((r) => !r.waiting);
  const Row = ({ r, n }: { r: QRow; n?: number }) => {
    const m = minsSince(r.waiting);
    return (
      <a href={r.href} class={`hd-row${r.unread ? " unread" : ""}`} data-ticket={r.kind === "shop" ? r.id : undefined} data-visitor={r.kind === "visitor" ? r.id : undefined}>
        <span class={`hd-serial${n ? "" : " done"}`}>{n ? bn(n) : <Icon name="check" size="sm" />}</span>
        <span class={`hd-av hd-t-${r.tier}`}>{(r.name || "?").trim().charAt(0).toUpperCase()}</span>
        <span class="hd-row-main">
          <span class="hd-row-top"><b>{r.name}</b><TierTag t={r.tier} /><span class="hd-muted">{r.sub}</span></span>
          <span class="hd-row-prev sx-row-prev">{r.lastSender === "team" ? "↩ আপনি: " : ""}{r.preview || "—"}</span>
        </span>
        <span class="hd-row-side">
          {m != null ? <span class={`hd-wait${m > 60 ? " late" : m > 15 ? " warn" : ""}`}><Icon name="clock" size="sm" /> {dur(m)} ধরে অপেক্ষায়</span> : <small>{ago(r.lastAt)}</small>}
          <small>{r.agent ? r.agent : "কেউ নেয়নি"}</small>
          {r.unread > 0 && <span class="sa-badge">{bn(r.unread)}</span>}
        </span>
      </a>
    );
  };
  if (!p.rows.length) return <div class="hd-empty"><Icon name="check" /><p>{p.empty}</p></div>;
  return (
    <div class="hd-queue" data-sx-inbox-list>
      {wait.length > 0 && <div class="hd-group">উত্তরের অপেক্ষায় — সিরিয়াল ({bn(wait.length)})</div>}
      {wait.map((r, i) => <Row r={r} n={i + 1} />)}
      {rest.length > 0 && <div class="hd-group">{p.ticket ? "দোকানের উত্তরের অপেক্ষায় / চলমান" : "উত্তর দেওয়া হয়েছে"} ({bn(rest.length)})</div>}
      {rest.map((r) => <Row r={r} />)}
    </div>
  );
};

const Head = (p: { title: string; sub?: string; children?: Child }) => (
  <div class="hd-head"><div><h1>{p.title}</h1>{p.sub && <p>{p.sub}</p>}</div><div class="hd-head-actions">{p.children}</div></div>
);

/* ---------------- প্রোফাইলের অংশ ---------------- */
type ShopP = {
  id: string; name: string; slug: string; status: string; plan: string | null; owner_name: string | null; owner_phone: string | null; owner_email: string | null;
  balance: number; confirmed_orders: number; created_at: string; last_login_at: string | null; phone_verified: number | null; domains: string | null;
};
type TicketL = { id: number; channel: "chat" | "ticket"; subject: string; category: string; status: string; created_at: string; resolved_at: string | null; last_message_at: string; rating: number | null; rating_comment: string | null };
type VChat = { id: number; name: string; phone: string | null; page: string | null; status: string; created_at: string; last_message_at: string };
type VMsg = { id: number; chat_id: number; sender: "visitor" | "team" | "system"; author: string | null; body: string; created_at: string };
type Profile = { note: string | null; follow_up: string | null; updated_at: string; updated_by: string | null };

const NoteBox = (p: { k: string; prof: Profile | null; back: string; follow?: boolean }) => (
  <form method="post" action="/super/support/profile" class="hd-card hd-note">
    <input type="hidden" name="key" value={p.k} /><input type="hidden" name="back" value={p.back} />
    <h3><Icon name="lock" size="sm" /> ভিতরের নোট <small>শুধু টিম দেখবে</small></h3>
    {p.follow && (
      <label class="hd-field">ফলো-আপ
        <select name="follow_up">
          <option value="">— বাছুন —</option>
          {Object.entries(FOLLOW).map(([k, l]) => <option value={k} selected={p.prof?.follow_up === k}>{l}</option>)}
        </select>
      </label>
    )}
    <textarea name="note" rows={4} maxlength={3000} placeholder="যেমন: কাপড়ের ব্যবসা, কম্পিউটারে কম বোঝেন — ধীরে বোঝাতে হয়">{p.prof?.note ?? ""}</textarea>
    <div class="hd-note-foot">{p.prof?.updated_by ? <small class="hd-muted">শেষ বদল: {p.prof.updated_by} · {ago(p.prof.updated_at)}</small> : <span />}<button class="sa-btn sa-btn-sm">সেভ</button></div>
  </form>
);

const Stat = (p: { label: string; value: string; sub?: string }) => <div class="hd-stat"><small>{p.label}</small><b>{p.value}</b>{p.sub && <span>{p.sub}</span>}</div>;

const Tabs = (p: { base: string; tab: string; items: [string, string, number?][] }) => (
  <nav class="hd-tabs">
    {p.items.map(([k, l, n]) => <a href={`${p.base}?tab=${k}`} class={p.tab === k ? "active" : ""}>{l}{n != null && <span class="hd-n">{bn(n)}</span>}</a>)}
  </nav>
);

const vAsMsg = (m: VMsg, who?: string): Message => ({ id: m.id, ticket_id: m.chat_id, sender: m.sender === "visitor" ? "shop" : m.sender, author: m.author ?? (m.sender === "visitor" ? who ?? "ভিজিটর" : null), body: m.body, attachment: null, internal: 0, created_at: m.created_at });

/** সব চ্যাট এক লম্বা থ্রেডে — প্রতিটা কথোপকথনের শুরুতে ভাগ */
const MergedThread = (p: { parts: { key: number; label: string; status: string; msgs: Message[] }[] }) => (
  <div class="hd-thread">
    {p.parts.length === 0 && <div class="hd-empty"><Icon name="message-circle" /><p>এখনো কোনো চ্যাট নেই।</p></div>}
    {p.parts.map((x) => (
      <>
        <div class="hd-sep"><span>{x.label} · {x.status}</span></div>
        {x.msgs.map((m) => <Bubble m={m} viewer="team" />)}
      </>
    ))}
  </div>
);

const ShopProfilePage = (p: {
  s: ShopP; tab: string; prof: Profile | null; tickets: TicketL[]; chatMsgs: Message[]; vchats: VChat[]; vmsgs: VMsg[]; shopLink: string; canEnter: boolean; openChat: TicketL | null;
}) => {
  const s = p.s;
  const tier = tierOf(s);
  const chats = p.tickets.filter((t) => t.channel === "chat").sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id));
  const tks = p.tickets.filter((t) => t.channel === "ticket");
  const rated = p.tickets.filter((t) => t.rating);
  const avg = rated.length ? rated.reduce((x, t) => x + (t.rating ?? 0), 0) / rated.length : null;
  const last = p.tickets.reduce<string | null>((x, t) => (!x || t.last_message_at > x ? t.last_message_at : x), null);
  const base = `/super/support/shop/${s.id}`;
  const wa = s.owner_phone ? `https://wa.me/88${s.owner_phone}` : "";
  const history: { at: string; icon: IconName; text: string; href: string }[] = [
    ...p.tickets.flatMap((t) => [
      { at: t.created_at, icon: (t.channel === "chat" ? "message-circle" : "ticket") as IconName, text: `${t.channel === "chat" ? "লাইভ চ্যাট" : "টিকেট"} শুরু — ${t.subject}`, href: `/super/support/${t.id}` },
      ...(t.resolved_at ? [{ at: t.resolved_at, icon: "check" as IconName, text: `সমাধান — #${bn(t.id)} ${t.subject}`, href: `/super/support/${t.id}` }] : []),
      ...(t.rating ? [{ at: t.resolved_at ?? t.last_message_at, icon: "star" as IconName, text: `রেটিং ${"★".repeat(t.rating)}${t.rating_comment ? ` — “${t.rating_comment}”` : ""}`, href: `/super/support/${t.id}` }] : []),
    ]),
    ...p.vchats.map((v) => ({ at: v.created_at, icon: "globe" as IconName, text: `দোকান খোলার ${v.created_at < s.created_at ? "আগে" : "পরে"} ওয়েবসাইটে চ্যাট (${v.page || "/"})`, href: `/super/support/lead/${s.owner_phone}` })),
    { at: s.created_at, icon: "store" as IconName, text: "দোকান খুলেছে", href: `/super/shops/${s.id}` },
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div class="hd-profile">
      <div class="hd-card hd-hero">
        <span class={`hd-av hd-av-lg hd-t-${tier}`}>{s.name.trim().charAt(0).toUpperCase()}</span>
        <div class="hd-hero-main">
          <h1>{s.name} <TierTag t={tier} /></h1>
          <p class="hd-muted"><a href={p.shopLink} target="_blank" rel="noopener">{s.slug} ↗</a>{s.domains ? ` · ${s.domains}` : ""} · খুলেছে {dhakaTime(s.created_at)}</p>
          <div class="hd-contact">
            <span><Icon name="user" size="sm" /> {s.owner_name || "—"}</span>
            {s.owner_phone && <a href={`tel:${s.owner_phone}`}><Icon name="phone" size="sm" /> {s.owner_phone}</a>}
            {wa && <a href={wa} target="_blank" rel="noopener" class="hd-wa"><Icon name="message-circle" size="sm" /> WhatsApp</a>}
            {s.owner_email && <span><Icon name="mail" size="sm" /> {s.owner_email}</span>}
            <span class={s.phone_verified === 0 ? "hd-bad" : "hd-ok"}>{s.phone_verified === 0 ? "মোবাইল যাচাই বাকি" : "মোবাইল যাচাই ✓"}</span>
          </div>
        </div>
        <div class="hd-hero-actions">
          {p.canEnter && (
            <form method="post" action={`/super/shops/${s.id}/impersonate`} target="_blank">
              <input type="hidden" name="reason" value="সাপোর্ট প্রোফাইল" />
              <button class="sa-btn sa-btn-sm"><Icon name="key-round" size="sm" /> প্যানেলে ঢুকুন</button>
            </form>
          )}
          <a href={`/super/shops/${s.id}`} class="sa-btn sa-btn-ghost sa-btn-sm">দোকানের বিস্তারিত</a>
        </div>
      </div>

      <div class="hd-stats">
        <Stat label="প্ল্যান" value={s.status === "trial" ? "ট্রায়াল" : PLAN_NAME[s.plan ?? ""] ?? s.plan ?? "—"} sub={`ব্যালেন্স ${taka(s.balance)}`} />
        <Stat label="লাইভ চ্যাট" value={bn(chats.length)} sub="বার" />
        <Stat label="টিকেট" value={bn(tks.length)} sub={`${bn(tks.filter((t) => ["open", "pending"].includes(t.status)).length)}টা চলমান`} />
        <Stat label="শেষ সাপোর্ট" value={last ? ago(last) : "—"} />
        <Stat label="গড় রেটিং" value={avg == null ? "—" : `${bn(avg.toFixed(1))} ★`} sub={`${bn(rated.length)}টা রেটিং`} />
        <Stat label="কনফার্ম অর্ডার" value={bn(s.confirmed_orders)} sub={`শেষ লগইন ${ago(s.last_login_at)}`} />
      </div>

      <div class="hd-cols">
        <div class="hd-card hd-work">
          <Tabs base={base} tab={p.tab} items={[["chat", "💬 লাইভ চ্যাট", chats.length], ["tickets", "🎫 টিকেট", tks.length], ["history", "🕑 ইতিহাস"], ...(p.vchats.length ? [["web", "🌐 ওয়েবসাইট চ্যাট", p.vchats.length] as [string, string, number]] : [])]} />
          {p.tab === "chat" && <>
            <MergedThread parts={chats.map((t) => ({ key: t.id, label: `চ্যাট #${bn(t.id)} · ${dhakaTime(t.created_at)}`, status: STATUS_TEAM[t.status] ?? t.status, msgs: p.chatMsgs.filter((m) => m.ticket_id === t.id) }))} />
            {p.openChat ? (
              <form method="post" action={`/super/support/${p.openChat.id}/reply`} class="hd-reply">
                <input type="hidden" name="back" value={`${base}?tab=chat`} />
                <textarea name="body" rows={3} maxlength={5000} required placeholder="উত্তর লিখুন…"></textarea>
                <div class="hd-reply-foot">
                  <label class="hd-muted"><input type="checkbox" name="next_status" value="resolved" /> পাঠিয়ে "সমাধান" করুন</label>
                  <span><a href={`/super/support/${p.openChat.id}`} class="sa-link">পুরো কথোপকথন →</a> <button class="sa-btn sa-btn-sm">পাঠান</button></span>
                </div>
              </form>
            ) : <p class="hd-muted hd-pad">এখন কোনো চলমান চ্যাট নেই — দোকান নতুন করে চ্যাট করলে এখানে উত্তর দিতে পারবেন।</p>}
          </>}
          {p.tab === "tickets" && (
            tks.length ? (
              <div class="hd-tlist">
                {tks.map((t) => (
                  <a href={`/super/support/${t.id}`} class="hd-trow">
                    <span class="hd-muted">#{bn(t.id)}</span>
                    <span class="hd-trow-main"><b>{t.subject}</b><small>{CATEGORIES[t.category] ?? t.category} · {dhakaTime(t.created_at)}</small></span>
                    <span class={`sx-st sx-st-${t.status}`}>{STATUS_TEAM[t.status] ?? t.status}</span>
                  </a>
                ))}
              </div>
            ) : <div class="hd-empty"><Icon name="ticket" /><p>এই দোকান এখনো কোনো টিকেট খোলেনি।</p></div>
          )}
          {p.tab === "history" && (
            <ol class="hd-timeline">
              {history.map((e) => <li><span class="hd-tl-ic"><Icon name={e.icon} size="sm" /></span><a href={e.href}>{e.text}</a><small>{dhakaTime(e.at)}</small></li>)}
            </ol>
          )}
          {p.tab === "web" && <MergedThread parts={p.vchats.map((v) => ({ key: v.id, label: `ওয়েবসাইট চ্যাট · ${dhakaTime(v.created_at)} · ${v.page || "/"}`, status: v.status === "open" ? "চলমান" : "শেষ", msgs: p.vmsgs.filter((m) => m.chat_id === v.id).map((m) => vAsMsg(m, v.name)) }))} />}
        </div>
        <NoteBox k={`shop:${s.id}`} prof={p.prof} back={`${base}?tab=${p.tab}`} />
      </div>
    </div>
  );
};

const LeadProfilePage = (p: { phone: string; chats: VChat[]; msgs: VMsg[]; prof: Profile | null; shop: { id: string; name: string; status: string; plan: string | null } | null }) => {
  const names = [...new Set(p.chats.map((c) => c.name))];
  const pages = [...new Set(p.chats.map((c) => c.page || "/"))];
  const open = [...p.chats].reverse().find((c) => c.status === "open") ?? null;
  const tier = p.shop ? tierOf(p.shop) : "visitor";
  const base = `/super/support/lead/${p.phone}`;
  return (
    <div class="hd-profile">
      <div class="hd-card hd-hero">
        <span class={`hd-av hd-av-lg hd-t-${tier}`}>{(names[names.length - 1] || "?").trim().charAt(0).toUpperCase()}</span>
        <div class="hd-hero-main">
          <h1>{names[names.length - 1] || p.phone} <TierTag t={tier} /></h1>
          {names.length > 1 && <p class="hd-muted">অন্য নামে: {names.slice(0, -1).join(", ")}</p>}
          <div class="hd-contact">
            <a href={`tel:${p.phone}`}><Icon name="phone" size="sm" /> {p.phone}</a>
            <a href={`https://wa.me/88${p.phone}`} target="_blank" rel="noopener" class="hd-wa"><Icon name="message-circle" size="sm" /> WhatsApp</a>
            {p.prof?.follow_up && <span class={`hd-fu hd-fu-${p.prof.follow_up}`}>{FOLLOW[p.prof.follow_up]}</span>}
          </div>
        </div>
        <div class="hd-hero-actions">
          {p.shop ? <a href={`/super/support/shop/${p.shop.id}`} class="sa-btn sa-btn-sm"><Icon name="store" size="sm" /> দোকান খুলেছে: {p.shop.name}</a>
            : <span class="hd-muted">এই নম্বরে এখনো দোকান খোলা হয়নি</span>}
        </div>
      </div>
      <div class="hd-stats">
        <Stat label="মোট চ্যাট" value={bn(p.chats.length)} sub="বার" />
        <Stat label="প্রথম এসেছে" value={p.chats.length ? ago(p.chats[0]!.created_at) : "—"} />
        <Stat label="শেষ চ্যাট" value={p.chats.length ? ago(p.chats[p.chats.length - 1]!.last_message_at) : "—"} />
        <Stat label="কোন পেজ থেকে" value={bn(pages.length)} sub={pages.slice(0, 3).join(", ")} />
      </div>
      <div class="hd-cols">
        <div class="hd-card hd-work">
          <MergedThread parts={p.chats.map((v) => ({ key: v.id, label: `চ্যাট · ${dhakaTime(v.created_at)} · ${v.page || "/"}`, status: v.status === "open" ? "চলমান" : "শেষ", msgs: p.msgs.filter((m) => m.chat_id === v.id).map((m) => vAsMsg(m, v.name)) }))} />
          {open ? (
            <form method="post" action={`/super/visitors/${open.id}/reply`} class="hd-reply">
              <input type="hidden" name="back" value={base} />
              <textarea name="body" rows={3} maxlength={3000} required placeholder="উত্তর লিখুন…"></textarea>
              <div class="hd-reply-foot"><a href={`/super/visitors/${open.id}`} class="sa-link">পুরো কথোপকথন →</a><button class="sa-btn sa-btn-sm">পাঠান</button></div>
            </form>
          ) : <p class="hd-muted hd-pad">এখন কোনো চলমান চ্যাট নেই।</p>}
        </div>
        <NoteBox k={`phone:${p.phone}`} prof={p.prof} back={base} follow />
      </div>
    </div>
  );
};

/* ---------------- রাউট ---------------- */
export function registerDesk(app: Hono<PEnv>, h: Helpers) {
  const db = (c: PCtx) => c.env.PLATFORM_DB;
  const guard = (c: PCtx) => (h.allowed(c, "support") ? null : h.forbidden(c));
  const me = (c: PCtx) => c.var.superAdmin!;
  const shell = async (c: PCtx, title: string, active: string, body: Child, kind?: string) =>
    h.page(c, title, "support", <DeskShell active={active} counts={await deskCounts(c)} kind={kind} canSettings={h.allowed(c, "support.settings")}>{body}</DeskShell>);

  /** লাইভ চ্যাট কিউ — দোকান আর ওয়েবসাইট ভিজিটর একসাথে, যে আগে থেকে অপেক্ষায় সে আগে */
  app.get("/support", async (c) => {
    const no = guard(c); if (no) return no;
    const who = ["visitor", "trial", "paid"].includes(c.req.query("who") ?? "") ? c.req.query("who")! : "";
    const [st, vt] = await db(c).batch([
      db(c).prepare(`SELECT t.id, t.shop_id, t.subject, t.last_preview, t.last_sender, t.last_message_at, t.team_unread, t.created_at, s.name, s.slug, s.status AS sstatus, s.plan,
          COALESCE(a.name, a.email) agent, ${W_TICKET} waiting
        FROM support_tickets t JOIN shops s ON s.id = t.shop_id LEFT JOIN super_admins a ON a.id = t.assigned_to
        WHERE t.channel = 'chat' AND t.status IN ('open', 'pending') ORDER BY t.last_message_at DESC LIMIT 200`),
      db(c).prepare(`SELECT v.id, v.name, v.phone, v.page, v.last_preview, v.last_sender, v.last_message_at, v.team_unread, v.created_at,
          COALESCE(a.name, a.email) agent, ${W_VISITOR} waiting, s.id AS shop_id, s.status AS sstatus, s.plan
        FROM visitor_chats v LEFT JOIN super_admins a ON a.id = v.assigned_to
        LEFT JOIN shops s ON s.id = (SELECT id FROM shops WHERE owner_phone = v.phone AND deleted_at IS NULL LIMIT 1)
        WHERE v.status = 'open' ORDER BY v.last_message_at DESC LIMIT 200`),
    ]);
    type SR = { id: number; shop_id: string; subject: string; last_preview: string | null; last_sender: string | null; last_message_at: string; team_unread: number; created_at: string; name: string; slug: string; sstatus: string; plan: string | null; agent: string | null; waiting: string | null };
    type VR = { id: number; name: string; phone: string | null; page: string | null; last_preview: string | null; last_sender: string | null; last_message_at: string; team_unread: number; created_at: string; agent: string | null; waiting: string | null; shop_id: string | null; sstatus: string | null; plan: string | null };
    let rows: QRow[] = [
      ...(st!.results as SR[]).map((r): QRow => ({ kind: "shop", id: r.id, href: `/super/support/${r.id}`, name: r.name, sub: `চ্যাট #${bn(r.id)}`, tier: tierOf({ status: r.sstatus, plan: r.plan }),
        preview: r.last_preview, lastSender: r.last_sender, lastAt: r.last_message_at, waiting: r.last_sender === "shop" ? r.waiting ?? r.last_message_at : null, unread: r.team_unread, agent: r.agent, profile: `/super/support/shop/${r.shop_id}`, created: r.created_at })),
      ...(vt!.results as VR[]).map((r): QRow => ({ kind: "visitor", id: r.id, href: `/super/visitors/${r.id}`, name: r.name, sub: `${r.phone ?? ""} · ${r.page || "/"}`, tier: r.shop_id ? tierOf({ status: r.sstatus, plan: r.plan }) : "visitor",
        preview: r.last_preview, lastSender: r.last_sender, lastAt: r.last_message_at, waiting: r.last_sender === "visitor" ? r.waiting ?? r.last_message_at : null, unread: r.team_unread, agent: r.agent, profile: r.phone ? `/super/support/lead/${r.phone}` : "", created: r.created_at })),
    ];
    if (who === "visitor") rows = rows.filter((r) => r.tier === "visitor");
    if (who === "trial") rows = rows.filter((r) => r.tier === "trial");
    if (who === "paid") rows = rows.filter((r) => r.tier === "paid" || r.tier === "expired");
    rows.sort((a, b) => (a.waiting && b.waiting ? (a.waiting < b.waiting ? -1 : 1) : a.waiting ? -1 : b.waiting ? 1 : a.lastAt < b.lastAt ? 1 : -1));
    const title = who ? `লাইভ চ্যাট — ${TIER[who as Tier]}` : "লাইভ চ্যাট";
    return shell(c, title, who ? `chat-${who}` : "chat",
      <>
        <Head title={title} sub="যে আগে থেকে উত্তরের অপেক্ষায়, সে সিরিয়ালে আগে। চাপলে কথোপকথন খুলবে।" />
        <QueueList rows={rows} empty="এখন কোনো চলমান চ্যাট নেই 🎉" />
      </>, "inbox");
  });

  /** টিকেট — যে আগে জমা দিয়েছে সে আগে */
  app.get("/support/tickets", async (c) => {
    const no = guard(c); if (no) return no;
    const view = ["mine", "resolved"].includes(c.req.query("view") ?? "") ? c.req.query("view")! : "open";
    const where = view === "resolved" ? "t.status IN ('resolved', 'closed')" : view === "mine" ? "t.status IN ('open', 'pending') AND t.assigned_to = ?" : "t.status IN ('open', 'pending')";
    const q = db(c).prepare(`SELECT t.id, t.shop_id, t.subject, t.category, t.priority, t.last_preview, t.last_sender, t.last_message_at, t.team_unread, t.created_at, s.name, s.status AS sstatus, s.plan,
        COALESCE(a.name, a.email) agent
      FROM support_tickets t JOIN shops s ON s.id = t.shop_id LEFT JOIN super_admins a ON a.id = t.assigned_to
      WHERE t.channel = 'ticket' AND ${where} ORDER BY ${view === "resolved" ? "t.last_message_at DESC" : "t.created_at ASC"} LIMIT 200`);
    const { results } = await (view === "mine" ? q.bind(me(c).id) : q).all<{ id: number; shop_id: string; subject: string; category: string; priority: string; last_preview: string | null; last_sender: string | null; last_message_at: string; team_unread: number; created_at: string; name: string; sstatus: string; plan: string | null; agent: string | null }>();
    const rows = results.map((r): QRow => ({
      kind: "shop", id: r.id, href: `/super/support/${r.id}`, name: r.name, sub: `#${bn(r.id)} · ${r.subject}${r.priority !== "normal" ? ` · ${r.priority === "urgent" ? "জরুরি" : "গুরুত্বপূর্ণ"}` : ""}`,
      tier: tierOf({ status: r.sstatus, plan: r.plan }), preview: r.last_preview, lastSender: r.last_sender, lastAt: r.last_message_at,
      // টিকেটের সিরিয়াল: জমা দেওয়ার সময় ধরে — দোকানের শেষ কথা হলে উত্তরের অপেক্ষায়
      waiting: view !== "resolved" && r.last_sender !== "team" ? r.created_at : null, unread: r.team_unread, agent: r.agent, profile: `/super/support/shop/${r.shop_id}`, created: r.created_at,
    }));
    const title = view === "resolved" ? "সমাধান হওয়া টিকেট" : view === "mine" ? "আমার টিকেট" : "টিকেট";
    return shell(c, title, view === "resolved" ? "ticket-done" : view === "mine" ? "ticket-mine" : "ticket",
      <>
        <Head title={title} sub={view === "resolved" ? "শেষ ২০০টা" : "যে আগে জমা দিয়েছে, সে সিরিয়ালে আগে।"} />
        <QueueList rows={rows} ticket empty={view === "resolved" ? "এখনো কিছু সমাধান হয়নি।" : "এখন কোনো চলমান টিকেট নেই 🎉"} />
      </>, "inbox");
  });

  /** সব দোকানের সাপোর্ট প্রোফাইল */
  app.get("/support/shops", async (c) => {
    const no = guard(c); if (no) return no;
    const q = str(c.req.query("q"), 60);
    const tier = ["trial", "paid", "expired"].includes(c.req.query("tier") ?? "") ? c.req.query("tier")! : "";
    const where = ["s.deleted_at IS NULL", "s.demo_niche IS NULL"];
    const binds: unknown[] = [];
    if (q) { where.push("(s.name LIKE ? OR s.slug LIKE ? OR s.owner_phone LIKE ? OR s.owner_name LIKE ?)"); binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
    if (tier) where.push(`${TIER_SQL} = '${tier}'`);
    const { results } = await db(c).prepare(`SELECT s.id, s.name, s.slug, s.status, s.plan, s.owner_name, s.owner_phone, s.created_at,
        COUNT(t.id) n, SUM(t.status IN ('open', 'pending')) open, MAX(t.last_message_at) last
      FROM shops s LEFT JOIN support_tickets t ON t.shop_id = s.id WHERE ${where.join(" AND ")}
      GROUP BY s.id ORDER BY (MAX(t.last_message_at) IS NULL), MAX(t.last_message_at) DESC, s.created_at DESC LIMIT 200`).bind(...binds)
      .all<{ id: string; name: string; slug: string; status: string; plan: string | null; owner_name: string | null; owner_phone: string | null; created_at: string; n: number; open: number | null; last: string | null }>();
    const chip = (k: string, l: string) => <a href={`/super/support/shops?${new URLSearchParams({ ...(q ? { q } : {}), ...(k ? { tier: k } : {}) })}`} class={tier === k ? "active" : ""}>{l}</a>;
    return shell(c, "দোকানের সাপোর্ট প্রোফাইল", "shops",
      <>
        <Head title="দোকান" sub="প্রতিটা দোকানের সব চ্যাট, টিকেট আর নোট এক প্রোফাইলে।">
          <form method="get" class="hd-search"><input type="search" name="q" value={q} placeholder="নাম, ঠিকানা বা ফোন…" />{tier && <input type="hidden" name="tier" value={tier} />}</form>
        </Head>
        <nav class="hd-chips">{chip("", "সব")}{chip("trial", "ফ্রি ট্রায়াল")}{chip("paid", "পেইড")}{chip("expired", "মেয়াদ শেষ")}</nav>
        {results.length ? (
          <div class="hd-table">
            <div class="hd-tr hd-th"><span>দোকান</span><span>মালিক</span><span>সাপোর্ট</span><span>শেষ সাপোর্ট</span></div>
            {results.map((r) => (
              <a href={`/super/support/shop/${r.id}`} class="hd-tr">
                <span class="hd-cell-shop"><span class={`hd-av hd-t-${tierOf(r)}`}>{r.name.trim().charAt(0).toUpperCase()}</span><span><b>{r.name}</b><TierTag t={tierOf(r)} /></span></span>
                <span>{r.owner_name || "—"}<small>{r.owner_phone || ""}</small></span>
                <span>{r.n ? `${bn(r.n)} বার` : "—"}{(r.open ?? 0) > 0 && <small class="hd-bad">{bn(r.open!)}টা চলমান</small>}</span>
                <span>{r.last ? ago(r.last) : "কখনো না"}</span>
              </a>
            ))}
          </div>
        ) : <div class="hd-empty"><Icon name="store" /><p>কোনো দোকান পাওয়া যায়নি।</p></div>}
      </>);
  });

  /** ফোন নম্বর ধরে ওয়েবসাইট ভিজিটরের প্রোফাইল — লিড তালিকা */
  app.get("/support/leads", async (c) => {
    const no = guard(c); if (no) return no;
    const q = str(c.req.query("q"), 40);
    const f = c.req.query("f") ?? "";
    const where = ["v.phone IS NOT NULL"];
    const binds: unknown[] = [];
    if (q) { where.push("(v.phone LIKE ? OR v.name LIKE ?)"); binds.push(`%${q}%`, `%${q}%`); }
    const { results } = await db(c).prepare(`SELECT v.phone, (SELECT name FROM visitor_chats x WHERE x.phone = v.phone ORDER BY id DESC LIMIT 1) name,
        COUNT(*) n, MIN(v.created_at) first, MAX(v.last_message_at) last, SUM(v.status = 'open') open,
        (SELECT id FROM shops WHERE owner_phone = v.phone AND deleted_at IS NULL LIMIT 1) shop_id, p.follow_up
      FROM visitor_chats v LEFT JOIN support_profiles p ON p.key = 'phone:' || v.phone
      WHERE ${where.join(" AND ")} GROUP BY v.phone ORDER BY MAX(v.last_message_at) DESC LIMIT 300`).bind(...binds)
      .all<{ phone: string; name: string; n: number; first: string; last: string; open: number; shop_id: string | null; follow_up: string | null }>();
    const rows = results.filter((r) => (f === "shop" ? r.shop_id : f === "noshop" ? !r.shop_id : f in FOLLOW ? r.follow_up === f : true));
    const chip = (k: string, l: string) => <a href={`/super/support/leads?${new URLSearchParams({ ...(q ? { q } : {}), ...(k ? { f: k } : {}) })}`} class={f === k ? "active" : ""}>{l}</a>;
    return shell(c, "ভিজিটর প্রোফাইল", "leads",
      <>
        <Head title="ভিজিটর (ফোন নম্বর ধরে)" sub="ওয়েবসাইটে যারা চ্যাট করেছে — কতবার এসেছে, দোকান খুলেছে কিনা, ফলো-আপ।">
          <form method="get" class="hd-search"><input type="search" name="q" value={q} placeholder="নাম বা ফোন…" />{f && <input type="hidden" name="f" value={f} />}</form>
        </Head>
        <nav class="hd-chips">{chip("", "সব")}{chip("noshop", "দোকান খোলেনি")}{chip("shop", "দোকান খুলেছে ✓")}{chip("interested", "আগ্রহী")}{chip("called", "ফোন করা হয়েছে")}</nav>
        {rows.length ? (
          <div class="hd-table">
            <div class="hd-tr hd-th"><span>ভিজিটর</span><span>চ্যাট</span><span>ফলো-আপ</span><span>শেষ এসেছে</span></div>
            {rows.map((r) => (
              <a href={`/super/support/lead/${r.phone}`} class="hd-tr">
                <span class="hd-cell-shop"><span class="hd-av hd-t-visitor">{(r.name || "?").trim().charAt(0).toUpperCase()}</span><span><b>{r.name}</b><small>{r.phone}</small></span></span>
                <span>{bn(r.n)} বার{r.open > 0 && <small class="hd-bad">চলমান</small>}</span>
                <span>{r.shop_id ? <span class="hd-fu hd-fu-shop">দোকান খুলেছে ✓</span> : r.follow_up ? <span class={`hd-fu hd-fu-${r.follow_up}`}>{FOLLOW[r.follow_up]}</span> : <span class="hd-muted">—</span>}</span>
                <span>{ago(r.last)}<small>প্রথম {ago(r.first)}</small></span>
              </a>
            ))}
          </div>
        ) : <div class="hd-empty"><Icon name="users" /><p>কোনো ভিজিটর পাওয়া যায়নি।</p></div>}
      </>);
  });

  app.get("/support/shop/:id{[A-Za-z0-9-]+}", async (c) => {
    const no = guard(c); if (no) return no;
    const id = c.req.param("id");
    const s = await db(c).prepare("SELECT s.*, (SELECT group_concat(hostname, ', ') FROM domains d WHERE d.shop_id = s.id AND d.zone_id IS NOT NULL) AS domains FROM shops s WHERE s.id = ?").bind(id).first<ShopP>();
    if (!s) return c.redirect("/super/support/shops", 303);
    const tab = ["chat", "tickets", "history", "web"].includes(c.req.query("tab") ?? "") ? c.req.query("tab")! : "chat";
    const [tk, cm, pr, vc, vm] = await db(c).batch([
      db(c).prepare("SELECT id, channel, subject, category, status, created_at, resolved_at, last_message_at, rating, rating_comment FROM support_tickets WHERE shop_id = ? ORDER BY id DESC LIMIT 300").bind(id),
      db(c).prepare(`SELECT * FROM (SELECT m.* FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id WHERE t.shop_id = ? AND t.channel = 'chat' ORDER BY m.id DESC LIMIT 600) ORDER BY id`).bind(id),
      db(c).prepare("SELECT * FROM support_profiles WHERE key = ?").bind(`shop:${id}`),
      db(c).prepare("SELECT id, name, phone, page, status, created_at, last_message_at FROM visitor_chats WHERE phone = ? ORDER BY created_at, id").bind(s.owner_phone ?? "-"),
      db(c).prepare("SELECT m.* FROM visitor_messages m JOIN visitor_chats v ON v.id = m.chat_id WHERE v.phone = ? ORDER BY m.id LIMIT 600").bind(s.owner_phone ?? "-"),
    ]);
    const tickets = tk!.results as TicketL[];
    const openChat = tickets.filter((t) => t.channel === "chat" && ["open", "pending"].includes(t.status)).sort((a, b) => b.id - a.id)[0] ?? null;
    return shell(c, `${s.name} — সাপোর্ট প্রোফাইল`, "shops",
      <ShopProfilePage s={s} tab={tab} prof={(pr!.results[0] as Profile) ?? null} tickets={tickets} chatMsgs={cm!.results as Message[]} vchats={vc!.results as VChat[]} vmsgs={vm!.results as VMsg[]}
        shopLink={shopUrl(c.env, s.slug, "/")} canEnter={h.allowed(c, "shop.impersonate")} openChat={openChat} />);
  });

  app.get("/support/lead/:phone{01[0-9]{9}}", async (c) => {
    const no = guard(c); if (no) return no;
    const phone = c.req.param("phone");
    const [vc, vm, pr, sh] = await db(c).batch([
      db(c).prepare("SELECT id, name, phone, page, status, created_at, last_message_at FROM visitor_chats WHERE phone = ? ORDER BY created_at, id").bind(phone),
      db(c).prepare("SELECT m.* FROM visitor_messages m JOIN visitor_chats v ON v.id = m.chat_id WHERE v.phone = ? ORDER BY m.id LIMIT 800").bind(phone),
      db(c).prepare("SELECT * FROM support_profiles WHERE key = ?").bind(`phone:${phone}`),
      db(c).prepare("SELECT id, name, status, plan FROM shops WHERE owner_phone = ? AND deleted_at IS NULL LIMIT 1").bind(phone),
    ]);
    const chats = vc!.results as VChat[];
    const shop = (sh!.results[0] as { id: string; name: string; status: string; plan: string | null }) ?? null;
    if (!chats.length) return shop ? c.redirect(`/super/support/shop/${shop.id}`, 303) : c.redirect("/super/support/leads", 303);
    return shell(c, `${chats[chats.length - 1]!.name} — ভিজিটর প্রোফাইল`, "leads",
      <LeadProfilePage phone={phone} chats={chats} msgs={vm!.results as VMsg[]} prof={(pr!.results[0] as Profile) ?? null} shop={shop} />);
  });

  /** প্রোফাইলের নোট আর ফলো-আপ */
  app.post("/support/profile", async (c) => {
    const no = guard(c); if (no) return no;
    const b = await c.req.parseBody();
    const key = str(b.key, 80);
    const back = typeof b.back === "string" && /^\/super\/support\/(shop|lead)\/[A-Za-z0-9-]+(\?tab=[a-z]+)?$/.test(b.back) ? b.back : "/super/support";
    const okKey = /^shop:[A-Za-z0-9-]{4,64}$/.test(key) || (key.startsWith("phone:") && normalizePhone(key.slice(6)) === key.slice(6));
    if (!okKey) return c.redirect(back, 303);
    const fu = typeof b.follow_up === "string" && b.follow_up in FOLLOW ? b.follow_up : null;
    const note = str(b.note, 3000) || null;
    const who = me(c).name || me(c).email.split("@")[0]!;
    await db(c).prepare(`INSERT INTO support_profiles (key, note, follow_up, updated_at, updated_by) VALUES (?, ?, ?, datetime('now'), ?)
      ON CONFLICT(key) DO UPDATE SET note = excluded.note, follow_up = ${key.startsWith("phone:") ? "excluded.follow_up" : "support_profiles.follow_up"}, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(key, note, fu, who).run();
    await h.audit(c, "support.profile", key.startsWith("shop:") ? "shop" : "visitor", key.split(":")[1]!, fu ? `ফলো-আপ: ${FOLLOW[fu]}` : "নোট");
    return c.redirect(back, 303);
  });
}

/** কথোপকথনের পাশে ছোট প্রোফাইল-লিংক (টিকেট/ভিজিটর পেজে) */
export const ProfileLink = (p: { href: string; tier: Tier; label?: string }) => (
  <a href={p.href} class="hd-plink"><TierTag t={p.tier} /> {p.label ?? "পুরো সাপোর্ট প্রোফাইল"} →</a>
);
