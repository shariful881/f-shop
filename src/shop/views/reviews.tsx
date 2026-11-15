/**
 * রিভিউ — দোকানের পেজে দেখানো, ক্রেতার রিভিউ ফর্ম, আর দোকানদারের অনুমোদনের পাতা।
 */
import { bn, dhakaTime, imageUrl } from "../lib/format";
import { REVIEW_TABS, shortName, stars, type Review, type ReviewStatus } from "../lib/reviews";
import { Icon } from "./icons";
import { EmptyState, PageHead } from "./ui";

/* ---------- দোকানে ---------- */
export const Stars = ({ avg, count }: { avg: number; count: number }) =>
  count > 0 ? <span class="stars" title={`${bn(avg)} / ৫ (${bn(count)}টা রিভিউ)`}><span class="stars-on">{stars(avg)}</span> <small>{bn(avg)} ({bn(count)})</small></span> : null;

export const ReviewsBlock = ({ reviews, avg, count, slug }: { reviews: Review[]; avg: number; count: number; slug: string }) => (
  <section class="reviews-block" id="reviews">
    <div class="reviews-head">
      <h2 class="section-title">ক্রেতাদের রিভিউ</h2>
      {count > 0 && <div class="reviews-avg"><b>{bn(avg)}</b><span class="stars-on">{stars(avg)}</span><small>{bn(count)}টা রিভিউ</small></div>}
    </div>
    {reviews.length === 0 ? <p class="muted center">এখনো কোনো রিভিউ নেই।</p> : (
      <div class="reviews-list">
        {reviews.map((r) => (
          <article class="review">
            <div class="review-top"><b>{shortName(r.name)}</b><span class="review-verified">✓ যাচাই করা ক্রেতা</span><span class="stars-on">{stars(r.rating)}</span></div>
            {r.body && <p>{r.body}</p>}
            {r.image && <a href={imageUrl(r.image)} target="_blank" rel="noopener" class="review-img"><img src={imageUrl(r.image)} alt="ক্রেতার ছবি" loading="lazy" width="120" height="120" /></a>}
            {r.reply && <p class="review-reply"><b>দোকানের উত্তর:</b> {r.reply}</p>}
          </article>
        ))}
      </div>
    )}
    <p class="center"><a href={`/review?from=${encodeURIComponent(slug)}`} class="btn btn-outline">এই পণ্য কিনেছেন? রিভিউ দিন</a></p>
  </section>
);

/* ---------- ক্রেতার রিভিউ ফর্ম ---------- */
export type ReviewFormState = {
  orderNo?: string;
  phone?: string;
  error?: string;
  done?: boolean;
  order?: { order_no: string; name: string };
  items?: { product_id: number; product_name: string; done: number | null }[];
  values?: Record<string, string>;
};

export const ReviewPage = ({ f }: { f: ReviewFormState }) => {
  if (f.done) {
    return (
      <div class="wrap narrow review-page center">
        <div class="thanks-icon">✓</div>
        <h1>রিভিউর জন্য ধন্যবাদ!</h1>
        <p>দোকান দেখে নেওয়ার পর রিভিউটা পণ্যের পেজে দেখাবে।</p>
        {f.items?.some((i) => !i.done) && <p><a class="btn btn-outline" href={`/review?o=${encodeURIComponent(f.orderNo ?? "")}&p=${encodeURIComponent(f.phone ?? "")}`}>অন্য পণ্যেরও রিভিউ দিন</a></p>}
        <a href="/" class="btn btn-primary">দোকানে ফিরুন</a>
      </div>
    );
  }
  const left = (f.items ?? []).filter((i) => !i.done);
  return (
    <div class="wrap narrow review-page">
      <h1>পণ্যের রিভিউ দিন</h1>
      {f.error && <div class="alert alert-error" role="alert">{f.error}</div>}
      {!f.order ? (
        <form method="get" action="/review" class="order-form">
          <p class="muted">শুধু যারা কিনেছেন তারাই রিভিউ দিতে পারেন। অর্ডার নম্বর আর অর্ডারের মোবাইল নম্বর দিন।</p>
          <label class="field"><span>অর্ডার নম্বর</span><input name="o" value={f.orderNo ?? ""} required placeholder="যেমন FS-100123" autocomplete="off" /></label>
          <label class="field"><span>মোবাইল নম্বর</span><input name="p" type="tel" inputmode="tel" value={f.phone ?? ""} required placeholder="01XXXXXXXXX" /></label>
          <button class="btn btn-primary btn-block">পরের ধাপ</button>
        </form>
      ) : left.length === 0 ? (
        <div class="alert">এই অর্ডারের সব পণ্যের রিভিউ দেওয়া হয়ে গেছে। ধন্যবাদ!</div>
      ) : (
        <form method="post" action="/review" enctype="multipart/form-data" class="order-form">
          <input type="hidden" name="o" value={f.order.order_no} />
          <input type="hidden" name="p" value={f.phone ?? ""} />
          <label class="field"><span>কোন পণ্য</span>
            <select name="product_id">{left.map((i) => <option value={String(i.product_id)} selected={f.values?.product_id === String(i.product_id)}>{i.product_name}</option>)}</select>
          </label>
          <fieldset class="field rating-field">
            <span>কেমন লেগেছে? *</span>
            <div class="rating-pick">
              {[5, 4, 3, 2, 1].map((n) => (
                <label><input type="radio" name="rating" value={String(n)} checked={(f.values?.rating ?? "5") === String(n)} /><span>{"★".repeat(n)}</span></label>
              ))}
            </div>
          </fieldset>
          <label class="field"><span>আপনার কথা</span><textarea name="body" rows={4} maxlength={1000} placeholder="পণ্যটা কেমন, ডেলিভারি কেমন ছিল…">{f.values?.body ?? ""}</textarea></label>
          <label class="field"><span>ছবি (ঐচ্ছিক, ২ MB পর্যন্ত)</span><input type="file" name="image" accept="image/jpeg,image/png,image/webp" /></label>
          <label class="field"><span>আপনার নাম</span><input name="name" value={f.values?.name ?? f.order.name} maxlength={60} required /></label>
          <button class="btn btn-primary btn-block">রিভিউ জমা দিন</button>
        </form>
      )}
    </div>
  );
};

/* ---------- দোকানদারের পাতা ---------- */
export const ReviewsAdminPage = (p: { rows: Review[]; status: ReviewStatus; counts: Record<string, number>; enabled: boolean; link: string }) => (
  <>
    <PageHead title="রিভিউ" desc="ক্রেতারা অর্ডার নম্বর আর মোবাইল দিয়ে রিভিউ দেয় — তাই সব রিভিউ আসল ক্রেতার। আপনি অনুমোদন করলে তবেই পণ্যের পেজে দেখাবে।" />
    <div class="sa-card review-settings">
      <form method="post" action="/admin/reviews/settings" class="row-form">
        <label class="set-check"><input type="checkbox" name="reviews_enabled" value="1" checked={p.enabled} /> পণ্যের পেজে রিভিউ আর কার্ডে তারা দেখাবে</label>
        <button class="btn btn-outline btn-sm">সেভ</button>
      </form>
      <p class="muted small">রিভিউ চাওয়ার লিংক (ডেলিভারির পরে WhatsApp-এ পাঠাতে পারেন): <code>{p.link}</code> — অর্ডারের পাতার WhatsApp বাটনে এটা নিজে থেকে থাকে।</p>
    </div>
    <div class="tabs">
      {(Object.keys(REVIEW_TABS) as ReviewStatus[]).map((k) => <a href={`/admin/reviews?status=${k}`} class={p.status === k ? "tab active" : "tab"}>{REVIEW_TABS[k]} <span class="tab-count">{bn(p.counts[k] ?? 0)}</span></a>)}
    </div>
    {p.rows.length === 0 ? (
      <div class="sa-card"><EmptyState icon="star" title="এই তালিকায় কোনো রিভিউ নেই" text={p.status === "pending" ? "ক্রেতা রিভিউ দিলে এখানে আসবে। ডেলিভারির পর WhatsApp-এ রিভিউর লিংক পাঠান।" : undefined} /></div>
    ) : (
      <div class="review-admin-list">
        {p.rows.map((r) => (
          <article class="sa-card review-admin">
            <div class="review-top">
              <b>{r.name}</b> <span class="stars-on">{stars(r.rating)}</span>
              <small class="muted">{r.product_name} · {r.order_id ? <a href={`/admin/orders/${r.order_id}`}>{r.order_no ?? `#${r.order_id}`}</a> : ""} · {dhakaTime(r.created_at)}</small>
            </div>
            {r.body && <p>{r.body}</p>}
            {r.image && <a href={imageUrl(r.image)} target="_blank" rel="noopener"><img src={imageUrl(r.image)} width="120" height="120" class="thumb" alt="" /></a>}
            <form method="post" action={`/admin/reviews/${r.id}`} class="review-actions">
              <input type="text" name="reply" value={r.reply ?? ""} maxlength={500} placeholder="দোকানের উত্তর (ঐচ্ছিক)" />
              {r.status !== "approved" && <button name="status" value="approved" class="btn btn-primary btn-sm"><Icon name="check" size="sm" /> অনুমোদন</button>}
              {r.status === "approved" && <button name="status" value="approved" class="btn btn-outline btn-sm">উত্তর সেভ</button>}
              {r.status !== "hidden" && <button name="status" value="hidden" class="btn btn-outline btn-sm">লুকান</button>}
              <button name="status" value="delete" class="btn-link" data-confirm="রিভিউটা একেবারে মুছবেন?">মুছুন</button>
            </form>
          </article>
        ))}
      </div>
    )}
  </>
);
