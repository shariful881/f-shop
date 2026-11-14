/**
 * সাপোর্ট — দোকানদারের দিকের পেজ (টিকেট তালিকা, নতুন টিকেট, কথোপকথন)।
 * Thread আর Bubble সুপার অ্যাডমিনও ব্যবহার করে।
 */
import { CATEGORIES, PRIORITY, STATUS, type Message, type Ticket } from "../../platform/support";
import { bn, dhakaTime } from "../lib/format";

export const StatusTag = ({ s, team }: { s: string; team?: boolean }) => {
  const label = team ? ({ open: "খোলা", pending: "দোকানের অপেক্ষায়", resolved: "সমাধান", closed: "বন্ধ" } as Record<string, string>)[s] : STATUS[s];
  return <span class={`sx-st sx-st-${s}`}>{label ?? s}</span>;
};
export const PriorityTag = ({ p }: { p: string }) => (p === "normal" ? null : <span class={`sx-pri sx-pri-${p}`}>{PRIORITY[p]}</span>);
export const ChannelTag = ({ c }: { c: string }) => <span class="sx-ch" title={c === "chat" ? "লাইভ চ্যাট" : "টিকেট"}>{c === "chat" ? "💬" : "🎫"}</span>;

/** একটা মেসেজ — viewer: কে দেখছে (নিজের মেসেজ ডানে) */
export const Bubble = ({ m, viewer }: { m: Message; viewer: "shop" | "team" }) => {
  if (m.sender === "system") return <div class="sx-sys" data-id={m.id}>{m.body}</div>;
  const mine = m.sender === viewer;
  return (
    <div class={`sx-msg ${mine ? "mine" : "theirs"}${m.internal ? " internal" : ""}`} data-id={m.id}>
      <div class="sx-bubble">
        {m.internal ? <div class="sx-internal-tag">🔒 ভিতরের নোট — দোকান দেখবে না</div> : null}
        {m.body && <div class="sx-body">{m.body}</div>}
        {m.attachment && <a href={m.attachment} target="_blank" rel="noopener" class="sx-att"><img src={m.attachment} alt="স্ক্রিনশট" loading="lazy" /></a>}
      </div>
      <div class="sx-meta">{m.sender === "team" ? (viewer === "shop" ? `${m.author || "SellxBD"} · সাপোর্ট টিম` : m.author) : m.author} · {dhakaTime(m.created_at)}</div>
    </div>
  );
};

export const Thread = ({ msgs, viewer, ticketId }: { msgs: Message[]; viewer: "shop" | "team"; ticketId: number }) => (
  <div class="sx-thread" id="sx-thread" data-ticket={ticketId} data-viewer={viewer} data-last={msgs.length ? msgs[msgs.length - 1]!.id : 0}>
    {msgs.map((m) => <Bubble m={m} viewer={viewer} />)}
    <div class="sx-typing" id="sx-typing" hidden>লিখছে<span>.</span><span>.</span><span>.</span></div>
  </div>
);

/* ---------- দোকানদার: তালিকা ---------- */
export const ShopSupportList = (p: { tickets: Ticket[]; online: boolean; hours: string; within: boolean; phone?: string }) => (
  <div class="sx-wrap">
    <div class="sx-hero">
      <div>
        <h2>কীভাবে সাহায্য করতে পারি?</h2>
        <p>লাইভ চ্যাটে সাথে সাথে কথা বলুন, অথবা সমস্যার বিস্তারিত লিখে টিকেট দিন — স্ক্রিনশটসহ। আমাদের টিম উত্তর দিলে এখানেই দেখবেন।</p>
        <div class="sx-hero-actions">
          <button type="button" class="sa-btn" data-sx-open>💬 লাইভ চ্যাট</button>
          <a href="/admin/support/new" class="sa-btn sa-btn-ghost">🎫 নতুন টিকেট</a>
        </div>
      </div>
      <div class="sx-status-card">
        <div class={`sx-dot ${p.online && p.within ? "on" : "off"}`} data-sx-presence></div>
        <div>
          <b data-sx-presence-text>{p.online && p.within ? "টিম এখন অনলাইনে" : "টিম এখন অফলাইনে"}</b>
          <small>সাপোর্টের সময়: প্রতিদিন {p.hours}</small>
          {p.phone && <small>জরুরি ফোন: <a href={`tel:${p.phone}`}>{bn(p.phone)}</a></small>}
        </div>
      </div>
    </div>

    <div class="sa-card">
      <div class="sa-card-head"><h2>আমার টিকেট ও চ্যাট</h2></div>
      {p.tickets.length === 0 ? (
        <p class="sa-empty">এখনো কোনো টিকেট নেই। কোনো সমস্যা হলে উপরের বাটন থেকে জানান।</p>
      ) : (
        <div class="sx-list">
          {p.tickets.map((t) => (
            <a href={`/admin/support/${t.id}`} class={`sx-row${t.shop_unread ? " unread" : ""}`}>
              <ChannelTag c={t.channel} />
              <div class="sx-row-main">
                <div class="sx-row-title"><b>{t.subject}</b> <span class="sx-muted">#{bn(t.id)}</span> <PriorityTag p={t.priority} /></div>
                <div class="sx-row-prev">{t.last_sender === "team" ? "সাপোর্ট: " : ""}{t.last_preview}</div>
              </div>
              <div class="sx-row-side">
                <StatusTag s={t.status} />
                <small>{dhakaTime(t.last_message_at)}</small>
                {t.shop_unread > 0 && <span class="sa-badge">{bn(t.shop_unread)} নতুন</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  </div>
);

/* ---------- দোকানদার: নতুন টিকেট ---------- */
export const ShopNewTicket = (p: { errors?: Record<string, string>; values?: Record<string, string> }) => {
  const v = p.values ?? {};
  const e = p.errors ?? {};
  return (
    <div class="sx-wrap">
      <form method="post" action="/admin/support/new" enctype="multipart/form-data" class="sa-card sx-form">
        <div class="sa-card-head"><h2>🎫 নতুন টিকেট</h2><a href="/admin/support" class="sa-link">← সব টিকেট</a></div>
        <div class="sx-grid2">
          <label class="field">সমস্যার ধরন
            <select name="category">{Object.entries(CATEGORIES).map(([k, l]) => <option value={k} selected={v.category === k}>{l}</option>)}</select>
          </label>
          <label class="field">গুরুত্ব
            <select name="priority">
              <option value="normal" selected={!v.priority || v.priority === "normal"}>সাধারণ</option>
              <option value="high" selected={v.priority === "high"}>জরুরি — কাজ আটকে আছে</option>
              <option value="urgent" selected={v.priority === "urgent"}>খুব জরুরি — দোকান/অর্ডার বন্ধ</option>
            </select>
          </label>
        </div>
        <label class="field">বিষয় <small>(এক লাইনে)</small>
          <input name="subject" maxlength={150} required value={v.subject ?? ""} placeholder="যেমন: Steadfast-এ পার্সেল যাচ্ছে না" />
          {e.subject && <span class="err">{e.subject}</span>}
        </label>
        <label class="field">বিস্তারিত
          <textarea name="body" rows={7} maxlength={5000} required placeholder={"কী করতে চাইছিলেন, কী হয়েছে, কোন পেজে — যত বিস্তারিত লিখবেন তত দ্রুত সমাধান হবে।\nঅর্ডার নম্বর থাকলে দিন।"}>{v.body ?? ""}</textarea>
          {e.body && <span class="err">{e.body}</span>}
        </label>
        <label class="field">স্ক্রিনশট <small>(ঐচ্ছিক — JPG/PNG/WebP, ৩ MB পর্যন্ত)</small>
          <input type="file" name="attachment" accept="image/jpeg,image/png,image/webp" />
          {e.attachment && <span class="err">{e.attachment}</span>}
        </label>
        <div class="sx-form-foot">
          <button class="sa-btn">টিকেট জমা দিন</button>
          <span class="sx-muted">সাধারণত অফিস সময়ে কয়েক ঘণ্টার মধ্যে উত্তর পাবেন।</span>
        </div>
      </form>
    </div>
  );
};

/* ---------- দোকানদার: একটা টিকেট ---------- */
export const ShopTicketPage = (p: { t: Ticket; msgs: Message[] }) => {
  const t = p.t;
  const closed = t.status === "resolved" || t.status === "closed";
  return (
    <div class="sx-wrap">
      <div class="sa-card sx-ticket">
        <div class="sx-ticket-head">
          <div>
            <a href="/admin/support" class="sa-link">← সব টিকেট</a>
            <h2><ChannelTag c={t.channel} /> {t.subject}</h2>
            <div class="sx-tags"><span class="sx-muted">#{bn(t.id)}</span> <StatusTag s={t.status} /> <PriorityTag p={t.priority} /> <span class="sx-chip">{CATEGORIES[t.category] ?? t.category}</span></div>
          </div>
          {!closed && (
            <form method="post" action={`/admin/support/${t.id}/resolve`}>
              <button class="sa-btn sa-btn-ghost sa-btn-sm" data-confirm="সমস্যার সমাধান হয়েছে? টিকেটটি বন্ধ হবে (পরে আবার মেসেজ দিলে খুলবে)।">✓ সমাধান হয়েছে</button>
            </form>
          )}
        </div>
        <Thread msgs={p.msgs} viewer="shop" ticketId={t.id} />

        {closed && !t.rating && (
          <form method="post" action={`/admin/support/${t.id}/rate`} class="sx-rate">
            <b>আমাদের সাপোর্ট কেমন ছিল?</b>
            <div class="sx-stars">
              {[5, 4, 3, 2, 1].map((n) => <><input type="radio" name="rating" value={n} id={`r${n}`} required /><label for={`r${n}`} title={`${n} তারা`}>★</label></>)}
            </div>
            <input name="comment" maxlength={500} placeholder="কিছু বলতে চাইলে লিখুন (ঐচ্ছিক)" />
            <button class="sa-btn sa-btn-sm">রেটিং দিন</button>
          </form>
        )}
        {t.rating ? <div class="sx-rated">আপনার রেটিং: <span class="sx-gold">{"★".repeat(t.rating)}</span>{"☆".repeat(5 - t.rating)} — ধন্যবাদ!</div> : null}

        <form method="post" action={`/admin/support/${t.id}/reply`} enctype="multipart/form-data" class="sx-reply" data-sx-reply>
          <textarea name="body" rows={3} maxlength={5000} placeholder={closed ? "আবার সমস্যা হলে লিখুন — টিকেটটি আবার খুলবে" : "উত্তর লিখুন…"} data-sx-typing></textarea>
          <div class="sx-reply-foot">
            <label class="sx-attach">📎 স্ক্রিনশট<input type="file" name="attachment" accept="image/jpeg,image/png,image/webp" /></label>
            <button class="sa-btn">পাঠান</button>
          </div>
        </form>
      </div>
    </div>
  );
};

/** সব অ্যাডমিন পেজের কোণে ভাসমান চ্যাট বাটন — বাকিটা support.js বানায় */
export const ChatWidget = ({ shopName }: { shopName: string }) => (
  <div id="sx-widget" class="sx-widget" data-shop={shopName}>
    <button type="button" class="sx-fab" data-sx-open aria-label="লাইভ সাপোর্ট">
      <span class="sx-fab-ico">💬</span><span class="sx-fab-label">সাপোর্ট</span><span class="sx-fab-badge" hidden></span>
    </button>
    <section class="sx-panel" hidden aria-label="লাইভ সাপোর্ট চ্যাট">
      <header class="sx-panel-head">
        <div><b>SellxBD সাপোর্ট</b><small data-sx-presence-text>সংযোগ হচ্ছে…</small></div>
        <span class="sx-dot" data-sx-presence></span>
        <button type="button" class="sx-x" data-sx-close aria-label="বন্ধ">✕</button>
      </header>
      <div class="sx-panel-body" data-sx-log>
        <div class="sx-sys">আসসালামু আলাইকুম! আপনার সমস্যা বা প্রশ্ন লিখুন — টিম অনলাইনে থাকলে সাথে সাথে উত্তর দেবে, না থাকলে টিকেট হিসেবে জমা থাকবে।</div>
      </div>
      <div class="sx-typing" data-sx-typing-ind hidden>সাপোর্ট লিখছে<span>.</span><span>.</span><span>.</span></div>
      <form class="sx-panel-form" data-sx-chat-form>
        <textarea rows={1} maxlength={2000} placeholder="মেসেজ লিখুন…" required></textarea>
        <button aria-label="পাঠান">➤</button>
      </form>
      <footer class="sx-panel-foot"><a href="/admin/support">সব টিকেট</a> · <a href="/admin/support/new">স্ক্রিনশটসহ টিকেট দিন</a></footer>
    </section>
  </div>
);
