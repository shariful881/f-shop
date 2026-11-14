/**
 * পণ্যের বিস্তারিত পেজ (/product/:slug) — চারটা থিমেই।
 * ছবির গ্যালারি, দাম, সাইজ/রং, পরিমাণ নয় (প্রতিটা পণ্য একটা করে), কার্টে যোগ, এখনই কিনুন,
 * ডেলিভারি তথ্য, বিশ্বাসের ব্যাজ, বিস্তারিত, ভিডিও, শেয়ার, সম্পর্কিত পণ্য, মোবাইলে নিচে আটকে থাকা বাটন।
 * ল্যান্ডিং পেজ (/p/:slug) আলাদা — অ্যাডের জন্য সরাসরি অর্ডার ফর্ম।
 */
import type { Product, Variant } from "../lib/products";
import type { Settings } from "../lib/settings";
import { deliveryCharge, freeDeliveryMin } from "../lib/settings";
import type { Cfg } from "../lib/theme-config";
import { bn, discountPercent, imageUrl, taka, youtubeId } from "../lib/format";
import { sanitizeHtml } from "../lib/sanitize";
import { ProductCard } from "./shop";

export const ProductPage = (p: { p: Product; images: string[]; variants: Variant[]; s: Settings; cfg: Cfg; related: Product[]; category?: { id: number; name: string } | null; error?: string; closed?: string }) => {
  const { p: prod, s, cfg } = p;
  const off = discountPercent(prod.price, prod.compare_price);
  const yt = youtubeId(prod.youtube_url);
  const active = p.variants.filter((v) => v.active);
  const hasVar = p.variants.length > 0;
  const phone = (s.contact_phone || "").replace(/[^\d+]/g, "");
  const wa = s.whatsapp ? `https://wa.me/88${s.whatsapp.replace(/\D/g, "").replace(/^88/, "")}?text=${encodeURIComponent(`${prod.name} সম্পর্কে জানতে চাই`)}` : "";
  const freeMin = freeDeliveryMin(s);
  const minPrice = active.length ? Math.min(...active.map((v) => v.price ?? prod.price)) : prod.price;
  const maxPrice = active.length ? Math.max(...active.map((v) => v.price ?? prod.price)) : prod.price;
  const imgs = p.images.length ? p.images : [prod.image ?? ""];
  const trust = [1, 2, 3, 4].map((n) => cfg[`trust_${n}`]).filter(Boolean);

  const variantPicker = hasVar && (cfg.pd_variant_style === "select" ? (
    <label class="field">
      <span>সাইজ/রং বাছাই করুন *</span>
      <select name="variant_id" required data-pp-variant>
        <option value="">— বাছাই করুন —</option>
        {p.variants.map((v) => <option value={String(v.id)} disabled={!v.active} data-price={String(v.price ?? prod.price)}>{v.label}{v.active ? "" : " (স্টকে নেই)"}</option>)}
      </select>
    </label>
  ) : (
    <fieldset class="field variant-field">
      <span>সাইজ/রং বাছাই করুন *</span>
      <div class="variant-pills">
        {p.variants.map((v) => (
          <label class={`pill-option ${v.active ? "" : "disabled"}`}>
            <input type="radio" name="variant_id" value={String(v.id)} disabled={!v.active} required data-price={String(v.price ?? prod.price)} data-pp-variant />
            <span>{v.label}{v.active ? "" : " (স্টকে নেই)"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  ));

  return (
    <div class="wrap pp">
      {cfg.breadcrumbs === "1" && (
        <nav class="px-crumbs"><a href="/">হোম</a> › {p.category && <><a href={`/c/${p.category.id}`}>{p.category.name}</a> › </>}<span>{prod.name}</span></nav>
      )}
      <div class="pp-main">
        <div class="pp-gallery" data-pp-gallery>
          <div class="pp-main-img">
            <img src={imageUrl(imgs[0] || null)} alt={prod.name} width="800" height="800" fetchpriority="high" data-pp-big />
            {off > 0 && cfg.badge_fmt !== "off" && <span class="badge">{cfg.badge_fmt === "minus" ? `-${bn(off)}%` : `${bn(off)}% ছাড়`}</span>}
          </div>
          {imgs.length > 1 && (
            <div class="pp-thumbs">
              {imgs.map((k, i) => <button type="button" class={i ? "" : "on"} data-pp-thumb={imageUrl(k)} aria-label={`ছবি ${bn(i + 1)}`}><img src={imageUrl(k)} alt="" width="80" height="80" loading="lazy" /></button>)}
            </div>
          )}
        </div>

        <div class="pp-info" id="buy">
          <h1 class="pp-title">{prod.name}</h1>
          {prod.headline && prod.headline !== prod.name && <p class="pp-headline">{prod.headline}</p>}
          <div class="pp-price">
            <span class="price big" data-pp-price data-base={String(prod.price)}>{minPrice !== maxPrice ? `${taka(minPrice)} – ${taka(maxPrice)}` : taka(prod.price)}</span>
            {prod.compare_price && prod.compare_price > prod.price && <del class="compare">{taka(prod.compare_price)}</del>}
            {off > 0 && <span class="badge inline">{bn(off)}% ছাড়</span>}
          </div>
          {cfg.free_tag === "1" && freeMin > 0 && prod.price >= freeMin && <p class="pp-free">🚚 এই পণ্যে ডেলিভারি ফ্রি</p>}
          {prod.short_desc && <p class="pp-short">{prod.short_desc}</p>}

          {p.closed ? <div class="alert alert-error">{p.closed}</div> : (
            <form method="post" action="/cart/add" class="pp-form" data-pp-form>
              <input type="hidden" name="product_id" value={String(prod.id)} />
              <input type="hidden" name="from" value="product" />
              {p.error && <div class="alert alert-error">{p.error}</div>}
              {variantPicker}
              <div class="pp-actions">
                <button type="submit" name="buy_now" value="1" class="btn btn-primary btn-lg">{cfg.pd_buy_text || "এখনই কিনুন"}</button>
                <button type="submit" class="btn btn-outline btn-lg" data-pp-cart>{cfg.pd_cart_text || "কার্টে যোগ করুন"}</button>
              </div>
            </form>
          )}

          {(cfg.pd_call === "1" && phone) || (cfg.pd_wa === "1" && wa) ? (
            <div class="pp-contact">
              {cfg.pd_call === "1" && phone && <a href={`tel:${phone}`} class="pd-btn pd-call">📞 {cfg.pd_call_text || "কল করুন"}</a>}
              {cfg.pd_wa === "1" && wa && <a href={wa} target="_blank" rel="noopener" class="pd-btn pd-wa">💬 {cfg.pd_wa_text || "WhatsApp"}</a>}
              {cfg.pd_msg === "1" && cfg.float_messenger && <a href={cfg.float_messenger} target="_blank" rel="noopener" class="pd-btn pd-msg">✉️ {cfg.pd_msg_text || "Messenger"}</a>}
            </div>
          ) : null}

          {cfg.pd_delivery_info === "1" && (
            <ul class="pp-delivery">
              <li><span>🚚 ঢাকার ভিতরে</span><b>{taka(deliveryCharge(s, "inside"))}{s.delivery_time_inside ? ` · ${s.delivery_time_inside}` : ""}</b></li>
              <li><span>📦 ঢাকার বাইরে</span><b>{taka(deliveryCharge(s, "outside"))}{s.delivery_time_outside ? ` · ${s.delivery_time_outside}` : ""}</b></li>
              {freeMin > 0 && <li><span>🎁 ফ্রি ডেলিভারি</span><b>{taka(freeMin)} বা তার বেশি অর্ডারে</b></li>}
              <li><span>💵 পেমেন্ট</span><b>ক্যাশ অন ডেলিভারি</b></li>
            </ul>
          )}
          {cfg.pd_trust === "1" && trust.length > 0 && <div class="pp-trust">{trust.map((t) => <span>✓ {t}</span>)}</div>}

          {cfg.pd_share === "1" && (
            <div class="pd-share" data-share-url={`/product/${prod.slug}`}>
              <span>শেয়ার করুন:</span>
              <a href="#" data-share="facebook">Facebook</a>
              <a href="#" data-share="whatsapp">WhatsApp</a>
              <button type="button" data-share="copy">লিংক কপি</button>
            </div>
          )}
        </div>
      </div>

      {(prod.details_html || yt) && (
        <section class="pp-details">
          <h2 class="section-title">পণ্যের বিস্তারিত</h2>
          {yt && (
            <div class="video" data-yt={yt}>
              <button type="button" class="video-thumb" aria-label="ভিডিও চালান">
                <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="ভিডিও" loading="lazy" width="480" height="360" />
                <span class="play">▶</span>
              </button>
            </div>
          )}
          {prod.details_html && <div class="details" dangerouslySetInnerHTML={{ __html: sanitizeHtml(prod.details_html) }} />}
        </section>
      )}

      {p.related.length > 0 && (
        <section class="pd-related">
          <h2 class="section-title">{cfg.pd_related_title || "আরও দেখুন"}</h2>
          <div class="grid px-grid">{p.related.map((r) => <ProductCard p={r} cfg={cfg} />)}</div>
        </section>
      )}

      {cfg.pd_zoom === "1" && <span data-zoom-on hidden />}
      {cfg.pd_sticky !== "0" && !p.closed && (
        <div class="pp-sticky" data-pp-sticky>
          <span class="pp-sticky-price">{taka(prod.price)}</span>
          <button type="button" class="btn btn-outline" data-pp-sticky-cart>{cfg.pd_cart_text || "কার্টে যোগ"}</button>
          <button type="button" class="btn btn-primary" data-pp-sticky-buy>{cfg.pd_buy_text || "এখনই কিনুন"}</button>
        </div>
      )}
    </div>
  );
};
