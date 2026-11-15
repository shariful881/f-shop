import { AREA_LABEL } from "../lib/orders";
import { bn, taka } from "../lib/format";
import { Icon } from "./icons";
import { EmptyState, PageHead } from "./ui";

/** ফোন, Messenger, WhatsApp বা দোকানে এসে পাওয়া অর্ডার — কোথা থেকে এলো */
export const MANUAL_SOURCES = {
  phone: "ফোন কল",
  messenger: "Facebook Messenger / কমেন্ট",
  whatsapp: "WhatsApp",
  walkin: "দোকানে এসে",
  other: "অন্য কোথাও",
} as const;
export type ManualSource = keyof typeof MANUAL_SOURCES;

export type ManualOption = { value: string; label: string; price: number; stock: number | null };

export const MANUAL_ROWS = 6;

export type ManualValues = {
  name: string; phone: string; address: string; area: string; note: string; source: string;
  delivery: string; discount: string; confirm: boolean; items: { item: string; qty: string }[];
};

export const emptyManual = (): ManualValues => ({
  name: "", phone: "", address: "", area: "inside", note: "", source: "phone", delivery: "", discount: "", confirm: false,
  items: [],
});

/** নতুন অর্ডার নিজে লেখা (ফোনে/ইনবক্সে পাওয়া অর্ডার) */
export const ManualOrderPage = (p: {
  options: ManualOption[];
  delivery: { inside: number; outside: number; freeMin: number };
  values: ManualValues;
  errors?: Record<string, string>;
  blocked?: boolean;
  pending?: string | null;
}) => {
  const v = p.values;
  const e = p.errors ?? {};
  const rows = Array.from({ length: MANUAL_ROWS }, (_, i) => v.items[i] ?? { item: "", qty: "1" });
  return (
    <>
      <p><a href="/admin/orders">← অর্ডার</a></p>
      <PageHead title="নতুন অর্ডার" desc="ফোন, Messenger, WhatsApp বা দোকানে এসে পাওয়া অর্ডার এখানে লিখে রাখুন — বাকি অর্ডারের মতোই তালিকায় থাকবে, কুরিয়ারে পাঠানো, ইনভয়েস, স্টক আর হিসাব সব চলবে।" />
      {p.options.length === 0 ? (
        <div class="sa-card"><EmptyState icon="package" title="কোনো চালু পণ্য নেই" text="অর্ডার বানাতে আগে অন্তত একটা পণ্য যোগ করে চালু রাখুন।" action={<a href="/admin/products/new" class="btn btn-primary">পণ্য যোগ করুন</a>} /></div>
      ) : (
        <form method="post" action="/admin/orders/new" class="admin-form sa-card mo-form" data-manual-order
          data-inside={p.delivery.inside} data-outside={p.delivery.outside} data-free={p.delivery.freeMin}>
          {p.blocked && <div class="alert alert-error">এই নম্বর আপনার ফেক অর্ডার ব্লক তালিকায় আছে।</div>}
          {p.pending && <div class="alert mo-warn">এই নম্বরের একটা অর্ডার এখনো "নতুন"-এ আছে (<a href={p.pending} target="_blank">দেখুন</a>) — একই অর্ডার দুবার হচ্ছে না তো?</div>}
          {(p.blocked || p.pending) && <><input type="hidden" name="force" value="1" /><p class="mo-warn-note">নিশ্চিত হলে নিচের "অর্ডার বানান" আবার চাপুন।</p></>}
          {e.form && <div class="alert alert-error">{e.form}</div>}

          <h3 class="mo-h"><Icon name="package" size="sm" /> পণ্য</h3>
          <div class="mo-items">
            {rows.map((r, i) => (
              <div class="mo-row" data-mo-row data-extra={i > 0 && !r.item ? "1" : undefined}>
                <select name="item" class="input" aria-label={`পণ্য ${bn(i + 1)}`}>
                  <option value="">— পণ্য বাছুন —</option>
                  {p.options.map((o) => (
                    <option value={o.value} data-price={o.price} selected={o.value === r.item} disabled={o.stock !== null && o.stock <= 0}>
                      {o.label} — {taka(o.price)}{o.stock !== null ? (o.stock <= 0 ? " (স্টক নেই)" : ` (স্টক ${bn(o.stock)})`) : ""}
                    </option>
                  ))}
                </select>
                <input type="number" class="input" name="qty" min={1} max={999} value={r.qty || "1"} aria-label="পরিমাণ" inputmode="numeric" />
              </div>
            ))}
            {e.items && <small class="error">{e.items}</small>}
            <button type="button" class="btn btn-outline btn-sm" data-mo-add hidden><Icon name="plus" size="sm" /> আরেকটা পণ্য</button>
          </div>

          <h3 class="mo-h"><Icon name="users" size="sm" /> ক্রেতা</h3>
          <div class="form-grid">
            <label class="field"><span>নাম</span><input name="name" value={v.name} required maxlength={100} />{e.name && <small class="error">{e.name}</small>}</label>
            <label class="field"><span>মোবাইল</span><input name="phone" value={v.phone} required maxlength={20} inputmode="tel" placeholder="01XXXXXXXXX" />{e.phone && <small class="error">{e.phone}</small>}</label>
          </div>
          <label class="field"><span>ঠিকানা</span><textarea name="address" rows={2} required maxlength={300}>{v.address}</textarea>{e.address && <small class="error">{e.address}</small>}</label>
          <div class="field"><span>ডেলিভারি এলাকা</span>
            <label class="inline-check"><input type="radio" name="area" value="inside" checked={v.area !== "outside"} /> {AREA_LABEL.inside} ({taka(p.delivery.inside)})</label>
            <label class="inline-check"><input type="radio" name="area" value="outside" checked={v.area === "outside"} /> {AREA_LABEL.outside} ({taka(p.delivery.outside)})</label>
          </div>
          <div class="form-grid">
            <label class="field"><span>ডেলিভারি চার্জ (ঐচ্ছিক)</span><input type="number" name="delivery" min={0} max={100000} value={v.delivery} placeholder="খালি = নিয়ম অনুযায়ী" inputmode="numeric" /></label>
            <label class="field"><span>ছাড় (ঐচ্ছিক)</span><input type="number" name="discount" min={0} max={10000000} value={v.discount} placeholder="০" inputmode="numeric" /></label>
          </div>
          <div class="form-grid">
            <label class="field"><span>অর্ডার কোথা থেকে</span>
              <select name="source">{Object.entries(MANUAL_SOURCES).map(([k, l]) => <option value={k} selected={v.source === k}>{l}</option>)}</select>
            </label>
            <label class="field"><span>নোট (ঐচ্ছিক)</span><input name="note" value={v.note} maxlength={300} /></label>
          </div>

          <div class="mo-total" data-mo-total hidden>
            <span>পণ্য <b data-mo-sub>৳০</b></span><span>ডেলিভারি <b data-mo-del>৳০</b></span><span>ছাড় <b data-mo-dis>৳০</b></span>
            <span class="mo-grand">মোট <b data-mo-grand>৳০</b></span>
          </div>

          <label class="inline-check mo-confirm">
            <input type="checkbox" name="confirm" value="1" checked={v.confirm} />
            <span><b>এখনই কনফার্ম করুন</b> — ক্রেতার সাথে কথা বলে নিশ্চিত হলে। স্টক কমবে, Facebook-এ Purchase যাবে (Pixel চালু থাকলে)। না বাছলে অর্ডার "নতুন"-এ থাকবে।</span>
          </label>
          <button class="btn btn-primary"><Icon name="check" size="sm" /> অর্ডার বানান</button>
        </form>
      )}
    </>
  );
};
