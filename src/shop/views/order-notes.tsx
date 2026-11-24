import { Icon } from "./icons";
import { bn, dhakaTime } from "../lib/format";
import { ROLE_LABEL, type Role } from "../lib/auth";
import { parseUtc, remindLabel, type ListNoteInfo, type OrderNote } from "../lib/order-notes";

/** নোটের তৈরি লেখা — চাপলে ঘরে বসে, কিছুতে মনে করানোর সময়ও বাছে */
export const QUICK_NOTES: { text: string; remind?: string }[] = [
  { text: "ফোন ধরেনি", remind: "1h" },
  { text: "দুপুরের পর কল করতে বলেছে", remind: "t15" },
  { text: "সন্ধ্যায় কল", remind: "t19" },
  { text: "আগামীকাল কল", remind: "n10" },
  { text: "পরে জানাবে বলেছে" },
  { text: "বিকাশে টাকা পাঠাবে" },
];

/** মোবাইল থেকে এক চাপে কল */
export const CallButton = ({ phone, compact }: { phone: string; compact?: boolean }) => (
  <a href={`tel:${phone}`} class={compact ? "call-dot" : "btn btn-sm btn-call"} title={`কল করুন ${phone}`} aria-label={`কল করুন ${phone}`}>
    <Icon name="phone" size="sm" />{!compact && " কল"}
  </a>
);

const byLine = (n: OrderNote) => n.by_name ? `${n.by_name}${n.by_role && ROLE_LABEL[n.by_role as Role] ? ` (${ROLE_LABEL[n.by_role as Role]})` : ""}` : "";

/** অর্ডারের পাতা: দোকানের নোট আর ফলো-আপ */
export const NotesPanel = ({ orderId, notes, presets }: { orderId: number; notes: OrderNote[]; presets: { key: string; label: string }[] }) => {
  const now = Date.now();
  return (
    <section class="panel on-panel" id="notes">
      <h2><Icon name="notebook-pen" size="sm" /> নোট ও ফলো-আপ <small class="muted">(শুধু দোকানের — ক্রেতা দেখে না)</small></h2>
      <form method="post" action={`/admin/orders/${orderId}/notes`} class="admin-form on-form" data-on-form>
        <div class="on-quick">
          {QUICK_NOTES.map((q) => <button type="button" class="chip" data-on-quick={q.text} data-on-remind={q.remind ?? ""}>{q.text}</button>)}
        </div>
        <textarea name="body" rows={2} maxlength={500} required placeholder="যেমন: দুপুরের পর কল করতে বলেছে" data-on-body></textarea>
        <div class="on-remind">
          <span class="on-remind-label"><Icon name="clock" size="sm" /> মনে করাবে:</span>
          <label class="on-opt"><input type="radio" name="remind" value="" checked /><span>না</span></label>
          {presets.map((p) => <label class="on-opt"><input type="radio" name="remind" value={p.key} /><span>{p.label}</span></label>)}
          <label class="on-opt"><input type="radio" name="remind" value="custom" data-on-custom-radio /><span>নিজে সময়</span></label>
          <input type="datetime-local" name="remind_custom" class="on-custom" data-on-custom hidden />
        </div>
        <button class="btn btn-primary btn-sm"><Icon name="check" size="sm" /> নোট সেভ</button>
      </form>
      {notes.length > 0 && (
        <ol class="on-list">
          {notes.map((n) => {
            const open = n.remind_at && !n.done_at;
            const due = open && parseUtc(n.remind_at!) <= now;
            return (
              <li class={open ? (due ? "is-due" : "is-open") : ""}>
                <p class="on-body">{n.body}</p>
                <div class="on-meta">
                  <span>{dhakaTime(n.created_at)}{byLine(n) && ` · ${byLine(n)}`}</span>
                  {n.remind_at && (n.done_at
                    ? <span class="on-tag done"><Icon name="check" size="sm" /> ফলো-আপ শেষ</span>
                    : <span class={`on-tag ${due ? "due" : ""}`}><Icon name="clock" size="sm" /> {remindLabel(n.remind_at, now)}{due && " — সময় হয়েছে"}</span>)}
                  {open && (
                    <form method="post" action={`/admin/orders/${orderId}/notes/${n.id}/done`} class="on-done">
                      <button class="btn btn-outline btn-sm"><Icon name="check" size="sm" /> হয়ে গেছে</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

/** অর্ডার তালিকা: শেষ নোট আর ফলো-আপের ব্যাজ */
export const ListNote = ({ orderId, info, follow }: { orderId: number; info?: ListNoteInfo; follow?: boolean }) => {
  if (!info?.last && !info?.due) return null;
  const now = Date.now();
  const due = info.due ? parseUtc(info.due) <= now : false;
  return (
    <div class="ln">
      {info.due && <span class={`ln-due ${due ? "is-due" : ""}`}><Icon name="clock" size="sm" /> {remindLabel(info.due, now)}{due ? " — কল করুন" : ""}</span>}
      {info.last && <a href={`/admin/orders/${orderId}#notes`} class="ln-text" title={info.last.body}><Icon name="notebook-pen" size="sm" /> {info.last.body}</a>}
      {follow && info.dueId && (
        // তালিকাটা নিজেই একটা ফর্মের ভেতরে — তাই formaction দিয়ে
        <button class="btn-link ln-done" formaction={`/admin/orders/${orderId}/notes/${info.dueId}/done`} formmethod="post" name="to_list" value="1"><Icon name="check" size="sm" /> হয়ে গেছে</button>
      )}
    </div>
  );
};

