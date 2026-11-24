import { Icon } from "./icons";
import { bn, dhakaTime, taka } from "../lib/format";
import { STATUS_LABEL, type OrderStatus } from "../lib/orders";

/** অর্ডার তালিকায় নম্বরের পাশের ব্যাজের জন্য — এই দোকানে একই নম্বরের অর্ডার */
export type PhoneStat = { n: number; good: number; bad: number; fresh: number };

export const PhoneHistoryBadge = ({ phone, orderId, st }: { phone: string; orderId: number; st?: PhoneStat }) => {
  if (!st || st.n < 2) return null;
  const tone = st.bad > 0 ? "bad" : st.good > 0 ? "good" : "plain";
  const tip = `${bn(st.good)}টা কনফার্ম/শিপড · ${bn(st.bad)}টা বাতিল/ফেক — চাপলে সব অর্ডার`;
  return (
    <button type="button" class={`ph-badge ph-${tone}`} data-ph-open={phone} data-ph-order={String(orderId)} title={tip}>
      <Icon name="history" size="sm" /> {bn(st.n)}টা অর্ডার
    </button>
  );
};

export type PhoneHistoryOrder = {
  id: number; order_no: string; status: OrderStatus; total: number; created_at: string; name: string;
  outcome?: string | null; items: { product_name: string; variant_label: string | null; qty: number }[];
};

export const PhoneHistory = (p: { phone: string; current?: number; orders: PhoneHistoryOrder[]; total: number; more: boolean }) => {
  const good = p.orders.filter((o) => o.status === "confirmed" || o.status === "shipped");
  const bad = p.orders.filter((o) => o.status === "cancelled" || o.status === "fake");
  const spent = good.filter((o) => o.outcome !== "returned").reduce((s, o) => s + o.total, 0);
  return (
    <div class="ph">
      <div class="ph-sum">
        <div><small>মোট অর্ডার</small><b>{bn(p.total)}</b></div>
        <div class="ok"><small>কনফার্ম/শিপড</small><b>{bn(good.length)}</b></div>
        <div class="bad"><small>বাতিল/ফেক</small><b>{bn(bad.length)}</b></div>
        <div><small>মোট কেনা</small><b>{taka(spent)}</b></div>
      </div>
      {p.more && <p class="muted small">সর্বশেষ {bn(p.orders.length)}টা দেখানো হচ্ছে (হিসাবও এগুলোর)।</p>}
      <ol class="ph-list">
        {p.orders.map((o) => (
          <li class={o.id === p.current ? "is-cur" : ""}>
            <div class="ph-top">
              <a href={`/admin/orders/${o.id}`} class="ph-no">{o.order_no}</a>
              {o.id === p.current && <span class="ph-here">এই অর্ডার</span>}
              <span class={`status status-${o.status}`}>{STATUS_LABEL[o.status]}</span>
              {o.outcome === "delivered" && <span class="pill pill-ok">ডেলিভারি হয়েছে</span>}
              {o.outcome === "returned" && <span class="pill pill-bad">ফেরত</span>}
            </div>
            <ul class="ph-items">
              {o.items.map((i) => <li>{i.product_name}{i.variant_label && <span class="muted"> ({i.variant_label})</span>}{i.qty > 1 && <b> × {bn(i.qty)}</b>}</li>)}
            </ul>
            <div class="ph-foot"><span class="muted"><Icon name="clock" size="sm" /> {dhakaTime(o.created_at)}</span><b>{taka(o.total)}</b></div>
          </li>
        ))}
      </ol>
      <p class="ph-all"><a href={`/admin/orders?q=${encodeURIComponent(p.phone)}`} class="btn btn-outline btn-sm">এই নম্বরের সব অর্ডার তালিকায় দেখুন →</a></p>
    </div>
  );
};

export const PhoneHistoryDialog = () => (
  <dialog id="ph-dlg" class="fr-dlg ph-dlg" aria-labelledby="ph-dlg-title">
    <div class="fr-dlg-head">
      <div><strong id="ph-dlg-title">এই নম্বরের অর্ডার</strong><br /><small class="muted">মোবাইল <code data-ph-title></code></small></div>
      <button type="button" class="fr-x" data-ph-close aria-label="বন্ধ"><Icon name="x" /></button>
    </div>
    <div class="fr-dlg-body" data-ph-body><p class="muted center">লোড হচ্ছে…</p></div>
  </dialog>
);
