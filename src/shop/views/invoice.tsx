/**
 * ইনভয়েস (A4) আর কুরিয়ার স্টিকার (৩×৪ ইঞ্চি) — প্রিন্টের জন্য আলাদা পেজ।
 * একসাথে অনেক অর্ডার দিলে প্রতিটা আলাদা পাতায়।
 */
import { ASSET_VERSION } from "./layout";
import type { Order, OrderItem } from "../lib/orders";
import { AREA_LABEL, orderExtras } from "../lib/orders";
import type { Settings } from "../lib/settings";
import { bn, dhakaTime, imageUrl, taka } from "../lib/format";
import { barcodeSvg } from "../lib/barcode";
import { codAmount, PAY_NAME, type PayKey } from "../lib/payment";

export type InvoiceData = { order: Order; items: (OrderItem & { image?: string | null })[] };

const Barcode = ({ text }: { text: string }) => <div class="iv-bar" dangerouslySetInnerHTML={{ __html: barcodeSvg(text) }} />;

const A4 = ({ d, s }: { d: InvoiceData; s: Settings }) => {
  const o = d.order;
  const subtotal = d.items.reduce((x, i) => x + i.price * (i.qty || 1), 0);
  return (
    <section class="iv-page iv-a4">
      <header class="iv-head">
        <div>
          {s.logo ? <img src={imageUrl(s.logo)} alt="" class="iv-logo" /> : <h1>{s.site_name}</h1>}
          <p class="iv-shop">{s.site_name}{s.contact_phone && <> · 📞 {bn(s.contact_phone)}</>}{s.store_email && <> · {s.store_email}</>}</p>
          {s.store_address && <p class="iv-shop">{s.store_address}</p>}
        </div>
        <div class="iv-meta">
          <h2>ইনভয়েস</h2>
          <p>অর্ডার: <b>{o.order_no}</b></p>
          <p>তারিখ: {dhakaTime(o.created_at)}</p>
          {s.invoice_barcode !== "0" && <Barcode text={o.order_no} />}
        </div>
      </header>
      <div class="iv-to">
        <h3>যাকে পাঠানো হবে</h3>
        <p><b>{o.name}</b> · 📞 {bn(o.phone)}</p>
        <p>{o.address}</p>
        <p class="iv-muted">{AREA_LABEL[o.area]}{o.email ? ` · ${o.email}` : ""}</p>
        {orderExtras(o).map(([k, v]) => <p class="iv-muted">{k}: {v}</p>)}
        {o.note && <p class="iv-muted">নোট: {o.note}</p>}
      </div>
      <table class="iv-table">
        <thead><tr>{s.invoice_image !== "0" && <th></th>}<th>পণ্য</th><th>পরিমাণ</th><th class="r">দাম</th></tr></thead>
        <tbody>
          {d.items.map((i) => (
            <tr>
              {s.invoice_image !== "0" && <td class="iv-img">{i.image && <img src={imageUrl(i.image)} alt="" />}</td>}
              <td>{i.product_name}{i.variant_label ? ` (${i.variant_label})` : ""}</td>
              <td>{bn(i.qty || 1)}</td>
              <td class="r">{(i.qty || 1) > 1 ? <small class="iv-muted">{bn(i.qty)} × {taka(i.price)}<br /></small> : null}{taka(i.price * (i.qty || 1))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="iv-sum">
        <div><span>পণ্যের দাম</span><span>{taka(subtotal)}</span></div>
        <div><span>ডেলিভারি চার্জ</span><span>{taka(o.delivery_charge)}</span></div>
        {o.discount > 0 && <div><span>{o.coupon_code ? `কুপন ছাড় (${o.coupon_code})` : "ছাড়"}</span><span>-{taka(o.discount)}</span></div>}
        {o.pay_status === "verified" && (o.advance_amount ?? 0) > 0 ? <>
          <div><span>মোট</span><span>{taka(o.total)}</span></div>
          <div><span>অগ্রিম পরিশোধ ({PAY_NAME[o.pay_method as PayKey] ?? o.pay_method})</span><span>-{taka(o.advance_amount!)}</span></div>
          <div class="iv-total"><span>বাকি (ক্যাশ অন ডেলিভারি)</span><span>{taka(codAmount(o))}</span></div>
        </> : <div class="iv-total"><span>মোট (ক্যাশ অন ডেলিভারি)</span><span>{taka(o.total)}</span></div>}
      </div>
      {s.invoice_note && <p class="iv-note">{s.invoice_note}</p>}
      <p class="iv-thanks">আমাদের থেকে কেনার জন্য ধন্যবাদ!</p>
    </section>
  );
};

const Sticker = ({ d, s }: { d: InvoiceData; s: Settings }) => {
  const o = d.order;
  return (
    <section class="iv-page iv-sticker">
      <div class="st-top"><b>{s.site_name}</b>{s.contact_phone && <span>📞 {bn(s.contact_phone)}</span>}</div>
      <div class="st-to">
        <small>প্রাপক</small>
        <b class="st-name">{o.name}</b>
        <b>📞 {bn(o.phone)}</b>
        <p>{o.address}</p>
      </div>
      <div class="st-items">{d.items.map((i) => `${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ""}${(i.qty || 1) > 1 ? ` × ${bn(i.qty)}` : ""}`).join(", ")}</div>
      <div class="st-cod"><span>ক্যাশ অন ডেলিভারি</span><b>{taka(codAmount(o))}</b></div>
      {s.invoice_barcode !== "0" && <Barcode text={o.order_no} />}
      <div class="st-no">{o.order_no} · {AREA_LABEL[o.area]}</div>
    </section>
  );
};

export const InvoicePage = ({ list, s, size, autoPrint }: { list: InvoiceData[]; s: Settings; size: "a4" | "sticker"; autoPrint?: boolean }) => (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{list.length === 1 ? `ইনভয়েস ${list[0]!.order.order_no}` : `${bn(list.length)}টা ইনভয়েস`}</title>
      <link rel="stylesheet" href={`/css/invoice.css?v=${ASSET_VERSION}`} />
      <style>{size === "sticker" ? "@page{size:3in 4in;margin:0}" : "@page{size:A4;margin:12mm}"}</style>
    </head>
    <body class={`iv iv-${size}-body`}>
      <div class="iv-toolbar">
        <button type="button" onclick="window.print()">🖨️ প্রিন্ট করুন</button>
        <span>{bn(list.length)}টা {size === "sticker" ? "স্টিকার (৩×৪ ইঞ্চি)" : "ইনভয়েস (A4)"}</span>
      </div>
      {list.map((d) => (size === "sticker" ? <Sticker d={d} s={s} /> : <A4 d={d} s={s} />))}
      {autoPrint && <script dangerouslySetInnerHTML={{ __html: "window.addEventListener('load',function(){setTimeout(function(){window.print()},400)})" }} />}
    </body>
  </html>
);
