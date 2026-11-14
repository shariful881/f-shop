import type { Landing, Section } from "../lib/landing";
import type { Product, Variant } from "../lib/products";
import type { Settings } from "../lib/settings";
import { bn, discountPercent, imageUrl, taka, youtubeId } from "../lib/format";
import { OrderForm, type FormState } from "./shop";

/** বিল্ডার দিয়ে বানানো ল্যান্ডিং পেজ — সেকশন ক্রম অনুযায়ী */
export const BuiltLanding = (p: { p: Product; landing: Landing; variants: Variant[]; settings: Settings; form?: FormState; closed?: string }) => {
  const prod = p.p;
  const off = discountPercent(prod.price, prod.compare_price);
  const priceRow = (
    <div class="landing-price">
      <span class="price big">{taka(prod.price)}</span>
      {prod.compare_price && prod.compare_price > prod.price && <del class="compare">{taka(prod.compare_price)}</del>}
      {off > 0 && <span class="badge inline">{bn(off)}% ছাড়</span>}
    </div>
  );

  const render = (sec: Section) => {
    const d = sec.data;
    switch (sec.type) {
      case "hero":
        return (
          <section class="lp-hero">
            <h1 class="landing-title">{d.headline || prod.headline || prod.name}</h1>
            {d.subheadline && <p class="lead">{d.subheadline}</p>}
            {d.show_price && priceRow}
            <a href="#order" class="btn btn-primary btn-block btn-lg">{d.button_text}</a>
          </section>
        );
      case "gallery": {
        const imgs = d.images?.length ? d.images : prod.image ? [prod.image] : [];
        if (!imgs.length) return null;
        return (
          <section class="lp-gallery">
            <div class="gallery-track">
              {imgs.map((k, i) => <img src={imageUrl(k)} alt={prod.name} width="800" height="800" loading={i ? "lazy" : "eager"} fetchpriority={i ? undefined : "high"} />)}
            </div>
            {imgs.length > 1 && <p class="muted center">← সরিয়ে আরও ছবি দেখুন →</p>}
          </section>
        );
      }
      case "video": {
        const yt = youtubeId(d.youtube_url);
        if (!yt) return null;
        return (
          <div class="video" data-yt={yt}>
            <button type="button" class="video-thumb" aria-label="ভিডিও চালান">
              <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="ভিডিও" loading="lazy" width="480" height="360" />
              <span class="play">▶</span>
            </button>
          </div>
        );
      }
      case "text":
        return d.html ? <div class="details" dangerouslySetInnerHTML={{ __html: d.html }} /> : null;
      case "benefits":
        return d.items?.length ? (
          <section class="lp-box lp-benefits">
            {d.title && <h2>{d.title}</h2>}
            <ul>{d.items.map((x) => <li>{x}</li>)}</ul>
          </section>
        ) : null;
      case "reviews":
        return d.reviews?.length ? (
          <section class="lp-reviews">
            {d.title && <h2 class="center">{d.title}</h2>}
            <div class="review-grid">
              {d.reviews.map((r) => (
                <div class="review">
                  <div class="stars" aria-label={`${r.rating} তারকা`}>{"★".repeat(r.rating)}<span>{"★".repeat(5 - r.rating)}</span></div>
                  {r.text && <p>{r.text}</p>}
                  {r.image && <img src={imageUrl(r.image)} alt="রিভিউ" loading="lazy" />}
                  {r.name && <strong>— {r.name}</strong>}
                </div>
              ))}
            </div>
          </section>
        ) : null;
      case "faq":
        return d.faqs?.length ? (
          <section class="lp-faq">
            {d.title && <h2 class="center">{d.title}</h2>}
            {d.faqs.map((f) => <details class="faq-item"><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </section>
        ) : null;
      case "countdown":
        return (
          <section class="lp-countdown" data-countdown={d.mode} data-ends={d.mode === "fixed" ? d.ends_at : ""} data-minutes={String(d.minutes ?? 120)} data-key={`cd_${prod.id}_${sec.id}`}>
            {d.title && <p class="cd-title">{d.title}</p>}
            <div class="cd-boxes">
              {[["d", "দিন"], ["h", "ঘণ্টা"], ["m", "মিনিট"], ["s", "সেকেন্ড"]].map(([k, l]) => (
                <div class="cd-box"><span data-cd={k}>০০</span><small>{l}</small></div>
              ))}
            </div>
          </section>
        );
      case "trust":
        return d.items?.length ? (
          <section class="lp-trust">
            {d.title && <h2 class="center">{d.title}</h2>}
            <div class="trust-items">{d.items.map((x) => <span class="trust-item">✓ {x}</span>)}</div>
          </section>
        ) : null;
      case "order_form":
        return (
          <section id="order" class="order-section">
            <h2>{d.title}</h2>
            <div class="order-product">
              <img src={imageUrl(prod.image)} alt="" width="64" height="64" loading="lazy" />
              <div><strong>{prod.name}</strong><br />{taka(prod.price)}</div>
            </div>
            {p.closed ? <div class="alert alert-error">{p.closed}</div> : (
              <OrderForm settings={p.settings} subtotal={prod.price} basePrice={prod.price} productId={prod.id} source="landing" form={p.form} variants={p.variants} />
            )}
          </section>
        );
    }
  };

  return (
    <div class="landing built">
      <div class="wrap narrow">
        {p.landing.sections.filter((x) => x.enabled).map(render)}
      </div>
      <a href="#order" class="sticky-order">অর্ডার করুন — {taka(prod.price)}</a>
    </div>
  );
};
