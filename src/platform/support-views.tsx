/**
 * সুপার অ্যাডমিন → সাপোর্ট ইনবক্স, কথোপকথন, তৈরি উত্তর, সাপোর্ট সেটিংস।
 */
import { bn, dhakaTime, taka } from "../shop/lib/format";
import { CATEGORIES, PRIORITY, STATUS_TEAM, type Message, type Ticket } from "./support";
import { ChannelTag, PriorityTag, StatusTag, Thread } from "../shop/views/support";
import { ago, StatusPill } from "./super-views";
import { Icon } from "../shop/views/icons";

export type TeamMember = { id: number; name: string | null; email: string };
export type Canned = { id: number; title: string; body: string; sort_order: number };

/** মিনিট → "২ ঘ ১৫ মি" */
export function dur(min: number | null): string {
  if (min == null) return "—";
  const m = Math.round(min);
  if (m < 60) return `${bn(m)} মিনিট`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${bn(h)} ঘ ${bn(m % 60)} মি`;
  return `${bn(Math.round(h / 24))} দিন`;
}

export type ShopCtx = {
  id: string; name: string; slug: string; status: string; owner_name: string | null; owner_phone: string | null; owner_email: string | null;
  balance: number; confirmed_orders: number; created_at: string; last_login_at: string | null; domains: string | null;
};

export const SuperTicketPage = (p: {
  t: Ticket; msgs: Message[]; shop: ShopCtx; team: TeamMember[]; canned: Canned[]; history: Ticket[]; canEnter: boolean; shopLink: string; meId: number;
}) => {
  const t = p.t;
  return (
    <div class="sx-split" data-sx-agent-page="ticket" data-shop-id={t.shop_id}>
      <div class="sa-card sx-ticket">
        <div class="sx-ticket-head">
          <div>
            <a href="/super/support" class="sa-link">← ইনবক্স</a>
            <h2><ChannelTag c={t.channel} /> {t.subject}</h2>
            <div class="sx-tags">
              <span class="sx-muted">#{bn(t.id)}</span> <StatusTag s={t.status} team /> <PriorityTag p={t.priority} />
              <span class="sx-chip">{CATEGORIES[t.category] ?? t.category}</span>
              <span class="sx-muted">শুরু {dhakaTime(t.created_at)}{t.first_response_at ? ` · প্রথম উত্তর ${dhakaTime(t.first_response_at)}` : " · এখনো উত্তর দেওয়া হয়নি"}</span>
            </div>
          </div>
          {t.assigned_to !== p.meId && (
            <form method="post" action={`/super/support/${t.id}/update`}>
              <input type="hidden" name="assigned_to" value={p.meId} />
              <button class="sa-btn sa-btn-sm">আমি নিচ্ছি</button>
            </form>
          )}
        </div>

        <Thread msgs={p.msgs} viewer="team" ticketId={t.id} />
        {t.rating ? <div class="sx-rated">দোকানের রেটিং: <span class="sx-gold">{"★".repeat(t.rating)}</span>{"☆".repeat(5 - t.rating)}{t.rating_comment ? ` — “${t.rating_comment}”` : ""}</div> : null}

        <form method="post" action={`/super/support/${t.id}/reply`} class="sx-reply sx-reply-team" data-sx-reply data-shop-id={t.shop_id}>
          <div class="sx-reply-tabs">
            <label><input type="radio" name="internal" value="0" checked /> ↩ দোকানকে উত্তর</label>
            <label><input type="radio" name="internal" value="1" /> <Icon name="lock" size="sm" /> ভিতরের নোট</label>
            {p.canned.length > 0 && (
              <select class="sx-canned" data-sx-canned aria-label="তৈরি উত্তর">
                <option value="">তৈরি উত্তর…</option>
                {p.canned.map((c) => <option value={c.body}>{c.title}</option>)}
              </select>
            )}
          </div>
          <textarea name="body" rows={4} maxlength={5000} required placeholder="উত্তর লিখুন… (Ctrl+Enter = পাঠান)" data-sx-typing></textarea>
          <div class="sx-reply-foot">
            <label class="sx-after">পাঠানোর পরে:
              <select name="next_status">
                <option value="pending">দোকানের উত্তরের অপেক্ষায়</option>
                <option value="resolved">সমাধান হিসেবে বন্ধ</option>
                <option value="open">খোলা রাখুন</option>
              </select>
            </label>
            <button class="sa-btn">পাঠান</button>
          </div>
        </form>
      </div>

      <aside class="sx-side">
        <div class="sa-card">
          <div class="sx-shop-head">
            <span class="sa-avatar">{p.shop.name.slice(0, 1)}</span>
            <div><b>{p.shop.name}</b><small><a href={p.shopLink} target="_blank" rel="noopener">{p.shop.slug} ↗</a></small></div>
            <StatusPill s={p.shop.status} />
          </div>
          <dl class="sx-dl">
            <dt>মালিক</dt><dd>{p.shop.owner_name || "—"}</dd>
            <dt>মোবাইল</dt><dd>{p.shop.owner_phone ? <a href={`tel:${p.shop.owner_phone}`}>{p.shop.owner_phone}</a> : "—"}</dd>
            <dt>ইমেইল</dt><dd>{p.shop.owner_email || "—"}</dd>
            <dt>ব্যালেন্স</dt><dd class={p.shop.balance < 0 ? "sx-neg" : ""}>{taka(p.shop.balance)}</dd>
            <dt>কনফার্ম অর্ডার</dt><dd>{bn(p.shop.confirmed_orders)}</dd>
            <dt>শেষ লগইন</dt><dd>{ago(p.shop.last_login_at)}</dd>
            {p.shop.domains && <><dt>ডোমেইন</dt><dd>{p.shop.domains}</dd></>}
          </dl>
          <div class="sx-side-actions">
            {p.canEnter && (
              <form method="post" action={`/super/shops/${p.shop.id}/impersonate`} target="_blank">
                <input type="hidden" name="reason" value={`সাপোর্ট টিকেট #${t.id}`} />
                <button class="sa-btn sa-btn-sm"><Icon name="key-round" size="sm" /> দোকানের প্যানেলে ঢুকুন</button>
              </form>
            )}
            <a href={`/super/shops/${p.shop.id}`} class="sa-btn sa-btn-ghost sa-btn-sm">দোকানের বিস্তারিত</a>
          </div>
        </div>

        <form method="post" action={`/super/support/${t.id}/update`} class="sa-card sx-props">
          <h3>টিকেট</h3>
          <label class="field">অবস্থা
            <select name="status">{Object.entries(STATUS_TEAM).map(([k, l]) => <option value={k} selected={t.status === k}>{l}</option>)}</select>
          </label>
          <label class="field">গুরুত্ব
            <select name="priority">{Object.entries(PRIORITY).map(([k, l]) => <option value={k} selected={t.priority === k}>{l}</option>)}</select>
          </label>
          <label class="field">ধরন
            <select name="category">{Object.entries(CATEGORIES).map(([k, l]) => <option value={k} selected={t.category === k}>{l}</option>)}</select>
          </label>
          <label class="field">দায়িত্বে
            <select name="assigned_to">
              <option value="0">— কেউ না —</option>
              {p.team.map((m) => <option value={m.id} selected={t.assigned_to === m.id}>{m.name || m.email}</option>)}
            </select>
          </label>
          <button class="sa-btn sa-btn-ghost sa-btn-sm">সেভ</button>
        </form>

        {p.history.length > 0 && (
          <div class="sa-card">
            <h3>এই দোকানের আগের কথোপকথন</h3>
            <ul class="sx-hist">
              {p.history.map((h) => (
                <li><a href={`/super/support/${h.id}`}><ChannelTag c={h.channel} /> {h.subject}</a><small>{ago(h.created_at)} · <StatusTag s={h.status} team /></small></li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
};

export const CannedPage = (p: { list: Canned[]; edit?: Canned | null }) => (
  <div class="sx-split">
    <div class="sa-card">
      <div class="sa-card-head"><h2>তৈরি উত্তর</h2><span class="sx-muted">উত্তর লেখার সময় এক ক্লিকে বসানো যায়</span></div>
      {p.list.length === 0 ? <p class="sa-empty">কোনো তৈরি উত্তর নেই।</p> : (
        <div class="sx-canned-list">
          {p.list.map((c) => (
            <div class="sx-canned-item">
              <div><b>{c.title}</b><p>{c.body}</p></div>
              <div class="sx-canned-actions">
                <a href={`/super/support/canned?edit=${c.id}`} class="sa-btn sa-btn-ghost sa-btn-sm">এডিট</a>
                <form method="post" action={`/super/support/canned/${c.id}/delete`}><button class="sa-btn sa-btn-ghost sa-btn-sm" data-confirm="এই তৈরি উত্তরটি মুছবেন?">মুছুন</button></form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    <form method="post" action={p.edit ? `/super/support/canned/${p.edit.id}` : "/super/support/canned"} class="sa-card sx-props">
      <h3>{p.edit ? "এডিট করুন" : "নতুন তৈরি উত্তর"}</h3>
      <label class="field">শিরোনাম<input name="title" maxlength={60} required value={p.edit?.title ?? ""} placeholder="যেমন: রিচার্জ কীভাবে" /></label>
      <label class="field">উত্তর<textarea name="body" rows={8} maxlength={3000} required>{p.edit?.body ?? ""}</textarea></label>
      <label class="field">ক্রম<input name="sort_order" type="number" value={String(p.edit?.sort_order ?? 0)} /></label>
      <div class="sx-form-foot">
        <button class="sa-btn">{p.edit ? "সেভ" : "যোগ করুন"}</button>
        {p.edit && <a href="/super/support/canned" class="sa-btn sa-btn-ghost">বাতিল</a>}
      </div>
    </form>
  </div>
);

export const SupportSettingsPage = (p: { s: Record<string, string> }) => {
  const token = p.s.telegram_bot_token || "";
  return (
    <form method="post" action="/super/support/settings" class="sa-card sx-form sx-narrow">
      <div class="sa-card-head"><h2>সাপোর্ট সেটিংস</h2></div>
      <h3>অফিস সময় (বাংলাদেশ সময়)</h3>
      <p class="sx-muted">এই সময়ের বাইরে দোকানদার চ্যাট করলে অটো-উত্তর যাবে আর মেসেজ টিকেট হিসেবে জমা থাকবে। শুরু আর শেষ একই দিলে ২৪ ঘণ্টা খোলা (এখনকার নিয়ম)। ২৪ ঘণ্টায় টিমের কেউ অনলাইনে না থাকলে "সবাই ব্যস্ত" অটো-উত্তর যায়।</p>
      <div class="sx-grid2">
        <label class="field">শুরু<input type="time" name="support_hours_start" value={p.s.support_hours_start || "00:00"} required /></label>
        <label class="field">শেষ<input type="time" name="support_hours_end" value={p.s.support_hours_end || "00:00"} required /></label>
      </div>
      <h3>sellxbd.com-এ ভিজিটর চ্যাট</h3>
      <label class="sx-check"><input type="checkbox" name="visitor_chat" value="1" checked={p.s.visitor_chat !== "0"} /> সাইটের সব পাবলিক পেজের কোণে চ্যাট বাটন দেখান — যে কেউ (দোকান না খুলেও) মেসেজ দিতে পারবে। মেসেজ আসে <a href="/super/visitors">সাপোর্ট → সাইটের ভিজিটর</a>-এ।</label>
      <h3>Telegram নোটিফিকেশন</h3>
      <p class="sx-muted">
        নতুন টিকেট/চ্যাট এলে (আর টিমের কেউ অনলাইনে না থাকলে নতুন মেসেজ) Telegram-এ খবর যাবে।
        বানাতে: Telegram-এ <b>@BotFather</b> → /newbot → টোকেন কপি করুন। তারপর বটকে আপনার গ্রুপে যোগ করে একটা মেসেজ দিন, আর <b>@userinfobot</b> বা getUpdates থেকে chat id নিন (গ্রুপের id সাধারণত -100 দিয়ে শুরু)।
      </p>
      <label class="field">Bot token {token && <small>(সেভ করা আছে: …{token.slice(-4)} — বদলাতে নতুনটা দিন, খালি রাখলে আগেরটাই থাকবে)</small>}
        <input name="telegram_bot_token" autocomplete="off" placeholder={token ? "••••••••" : "123456789:AA…"} />
      </label>
      <label class="field">Chat id<input name="telegram_chat_id" value={p.s.telegram_chat_id || ""} placeholder="-1001234567890" /></label>
      <label class="sx-check"><input type="checkbox" name="telegram_clear" value="1" /> Telegram বন্ধ করুন (টোকেন মুছে ফেলুন)</label>
      <div class="sx-form-foot">
        <button class="sa-btn">সেভ</button>
        <button class="sa-btn sa-btn-ghost" name="test" value="1">সেভ করে টেস্ট মেসেজ পাঠান</button>
      </div>
    </form>
  );
};
