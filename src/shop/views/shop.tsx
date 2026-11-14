import { linesSubtotal, type HomeSection, type Product, type Variant } from "../lib/products";
import type { Settings } from "../lib/settings";
import type { Order, OrderItem } from "../lib/orders";
import { AREA_LABEL } from "../lib/orders";
import { bn, discountPercent, imageUrl, taka, youtubeId } from "../lib/format";
import { deliveryCharge, freeDeliveryMin } from "../lib/settings";
import { parseLanding } from "../lib/landing";
import { sanitizeHtml } from "../lib/sanitize";
import { BuiltLanding } from "./landing";
import type { Cfg } from "../lib/theme-config";

/* ---------- পণ্যের কার্ড (থিম কাস্টমাইজের লেখা/বাটন অনুযায়ী) ---------- */
export const ProductCard = ({ p, cfg }: { p: Product; cfg?: Cfg }) => {
  const off = discountPercent(p.price, p.compare_price);
  const fmt = cfg?.badge_fmt ?? "pct";
  const orderBtn = (cfg?.card_order_btn ?? "1") === "1";
  // পণ্যের পেজ (বিস্তারিত) নাকি সরাসরি ল্যান্ডিং পেজ
  const href = (cfg?.product_link ?? "product") === "landing" ? `/p/${p.slug}` : `/product/${p.slug}`;
  const cartBtn = (cfg?.card_cart_btn ?? "1") === "1";
  return (
    <div class={`card cd-${cfg?.card_design || "classic"}`}>
      <a href={href} class="card-img">
        <img src={imageUrl(p.image)} alt={p.name} loading="lazy" width="400" height="400" />
        {off > 0 && fmt !== "off" && <span class="badge">{fmt === "minus" ? `-${bn(off)}%` : `${bn(off)}% ছাড়`}</span>}
        {cfg?.free_tag === "1" && +(cfg._free_min || 0) > 0 && p.price >= +(cfg._free_min || 0) && <span class="free-tag">ফ্রি ডেলিভারি</span>}
      </a>
      <div class="card-body">
        <a href={href} class="card-title">{p.name}</a>
        <div class="price-row">
          <span class="price">{taka(p.price)}</span>
          {p.compare_price && p.compare_price > p.price && <del class="compare">{taka(p.compare_price)}</del>}
        </div>
        {(orderBtn || cartBtn) && (
          <div class="card-actions">
            {orderBtn && (p.variant_count || cfg?.product_link === "landing" ? (
              <a href={p.variant_count && cfg?.product_link !== "landing" ? `${href}#buy` : `/p/${p.slug}#order`} class="btn btn-primary">{cfg?.card_order_text || "অর্ডার করুন"}</a>
            ) : (
              <form method="post" action="/cart/add">
                <input type="hidden" name="product_id" value={String(p.id)} />
                <input type="hidden" name="buy_now" value="1" />
                <button type="submit" class="btn btn-primary">{cfg?.card_order_text || "অর্ডার করুন"}</button>
              </form>
            ))}
            {cartBtn && (p.variant_count ? (
              <a href={`${href}#buy`} class="btn btn-outline">অপশন বাছুন</a>
            ) : (
              <form method="post" action="/cart/add" data-add-to-cart>
                <input type="hidden" name="product_id" value={String(p.id)} />
                <button type="submit" class="btn btn-outline">{cfg?.card_cart_text || "কার্টে যোগ"}</button>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------- হোম ---------- */
export const HomePage = ({ sections }: { sections: HomeSection[] }) => (
  <div class="wrap">
    {sections.length === 0 && <p class="empty">এখনো কোনো পণ্য যোগ করা হয়নি।</p>}
    {sections.map((s) => (
      <section class="home-section">
        <h2 class="section-title">{s.category.name}</h2>
        <div class="grid">
          {s.products.map((p) => <ProductCard p={p} />)}
        </div>
      </section>
    ))}
  </div>
);

/* ---------- অর্ডার ফর্ম (ল্যান্ডিং আর চেকআউট দুই জায়গায়) ---------- */
export type FormState = {
  values?: Record<string, string>;
  errors?: Record<string, string>;
  alert?: string;
};

export const OrderForm = (p: {
  settings: Settings;
  subtotal: number;
  productId?: number;
  source: "landing" | "cart";
  form?: FormState;
  variants?: Variant[];
  basePrice?: number;
  variantStyle?: string;
}) => {
  const v = p.form?.values ?? {};
  const e = p.form?.errors ?? {};
  const s0 = p.settings;
  const defArea = s0.default_area === "outside" ? "outside" : s0.default_area === "none" ? "" : "inside";
  const area = v.area === "outside" || v.area === "inside" ? v.area : defArea;
  const inside = deliveryCharge(p.settings, "inside");
  const outside = deliveryCharge(p.settings, "outside");
  const freeMin = freeDeliveryMin(p.settings);
  const isFree = freeMin > 0 && p.subtotal >= freeMin;
  const s = p.settings;
  return (
    <form method="post" action="/order" class={`order-form ${s0.sticky_submit !== "0" ? "sticky-submit" : ""}`} id="order-form" data-order-form
      data-subtotal={String(p.subtotal)} data-inside={String(inside)} data-outside={String(outside)} data-free-min={String(freeMin)}
      data-source={p.source} data-product-id={p.productId ? String(p.productId) : ""} novalidate>
      {s.order_form_title && <h3 class="order-form-title">{s.order_form_title}</h3>}
      {p.form?.alert && <div class="alert alert-error" role="alert">{p.form.alert}</div>}
      {freeMin > 0 && <p class="free-delivery-note" data-free-note>🚚 {taka(freeMin)} বা তার বেশি অর্ডারে ডেলিভারি ফ্রি!</p>}
      <input type="hidden" name="source" value={p.source} />
      {p.productId && <input type="hidden" name="product_id" value={String(p.productId)} />}
      <input type="hidden" name="did_ls" value="" data-did-ls />

      {p.variants && p.variants.length > 0 && (p.variantStyle === "select" ? (
        <label class="field variant-field">
          <span>সাইজ/রং বাছাই করুন *</span>
          <select name="variant_id" required>
            <option value="">— বাছাই করুন —</option>
            {p.variants.map((vr) => (
              <option value={String(vr.id)} disabled={!vr.active} selected={v.variant_id === String(vr.id)} data-price={String(vr.price ?? p.basePrice ?? p.subtotal)}>
                {vr.label}{vr.price != null && vr.price !== p.basePrice ? ` — ${taka(vr.price)}` : ""}{vr.active ? "" : " (স্টকে নেই)"}
              </option>
            ))}
          </select>
          {e.variant && <small class="error">{e.variant}</small>}
        </label>
      ) : (
        <fieldset class="field variant-field">
          <span>সাইজ/রং বাছাই করুন *</span>
          <div class="variant-pills">
            {p.variants.map((vr) => (
              <label class={`pill-option ${vr.active ? "" : "disabled"}`}>
                <input type="radio" name="variant_id" value={String(vr.id)} disabled={!vr.active}
                  checked={v.variant_id === String(vr.id)} data-price={String(vr.price ?? p.basePrice ?? p.subtotal)} />
                <span>{vr.label}{vr.price != null && vr.price !== p.basePrice ? ` — ${taka(vr.price)}` : ""}{vr.active ? "" : " (স্টকে নেই)"}</span>
              </label>
            ))}
          </div>
          {e.variant && <small class="error">{e.variant}</small>}
        </fieldset>
      ))}

      <label class="field">
        <span>আপনার নাম *</span>
        <input type="text" name="name" value={v.name ?? ""} required maxlength={100} autocomplete="name" />
        {e.name && <small class="error">{e.name}</small>}
      </label>
      <label class="field">
        <span>মোবাইল নম্বর *</span>
        <input type="tel" name="phone" value={v.phone ?? ""} required inputmode="tel" placeholder="01XXXXXXXXX" autocomplete="tel" />
        {e.phone && <small class="error">{e.phone}</small>}
      </label>
      <label class="field">
        <span>সম্পূর্ণ ঠিকানা *</span>
        <textarea name="address" rows={2} required maxlength={500} placeholder="বাসা, রোড, এলাকা, থানা, জেলা">{v.address ?? ""}</textarea>
        {e.address && <small class="error">{e.address}</small>}
      </label>
      {s.checkout_email && s.checkout_email !== "off" && (
        <label class="field">
          <span>ইমেইল{s.checkout_email === "required" ? " *" : " (ঐচ্ছিক)"}</span>
          <input type="email" name="email" value={v.email ?? ""} maxlength={120} autocomplete="email" required={s.checkout_email === "required"} />
          {e.email && <small class="error">{e.email}</small>}
        </label>
      )}
      {[1, 2, 3].map((n) => {
        const label = (s[`cf${n}_label`] || "").trim();
        if (!label) return null;
        const req = s[`cf${n}_req`] === "1";
        return (
          <label class="field">
            <span>{label}{req ? " *" : " (ঐচ্ছিক)"}</span>
            <input type="text" name={`cf${n}`} value={v[`cf${n}`] ?? ""} maxlength={200} required={req} />
            {e[`cf${n}`] && <small class="error">{e[`cf${n}`]}</small>}
          </label>
        );
      })}
      <fieldset class="field area-field">
        <span>ডেলিভারি এলাকা *</span>
        <label class="radio"><input type="radio" name="area" value="inside" checked={area === "inside"} /> {AREA_LABEL.inside} ({taka(inside)}){s.delivery_time_inside && <small class="muted"> · {s.delivery_time_inside}</small>}</label>
        <label class="radio"><input type="radio" name="area" value="outside" checked={area === "outside"} /> {AREA_LABEL.outside} ({taka(outside)}){s.delivery_time_outside && <small class="muted"> · {s.delivery_time_outside}</small>}</label>
        {e.area && <small class="error">{e.area}</small>}
      </fieldset>
      <details class="coupon-box" open={!!v.coupon || !!e.coupon}>
        <summary>কুপন কোড আছে?</summary>
        <div class="coupon-row">
          <input type="text" name="coupon" value={v.coupon ?? ""} placeholder="কুপন কোড" maxlength={30} autocomplete="off" data-coupon />
          <button type="button" class="btn btn-outline" data-coupon-apply>প্রয়োগ</button>
        </div>
        <small data-coupon-msg class={e.coupon ? "error" : "muted"}>{e.coupon ?? ""}</small>
      </details>
      {s.show_note !== "0" && (
        <label class="field">
          <span>নোট (ঐচ্ছিক)</span>
          <input type="text" name="note" value={v.note ?? ""} maxlength={300} />
        </label>
      )}

      <div class="summary">
        <div><span>পণ্যের দাম</span><span data-subtotal-text>{taka(p.subtotal)}</span></div>
        <div><span>ডেলিভারি চার্জ</span><span data-delivery>{taka(isFree ? 0 : area === "outside" ? outside : area === "inside" ? inside : 0)}</span></div>
        <div class="discount-row" data-discount-row hidden><span>কুপন ছাড়</span><span data-discount>-৳০</span></div>
        <div class="summary-total"><span>মোট</span><span data-total>{taka(p.subtotal + (isFree ? 0 : area === "outside" ? outside : area === "inside" ? inside : 0))}</span></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block btn-lg" data-submit>অর্ডার কনফার্ম করুন — <span data-total-btn>{taka(p.subtotal + (isFree ? 0 : area === "outside" ? outside : area === "inside" ? inside : 0))}</span></button>
      <p class="muted center">ক্যাশ অন ডেলিভারি — পণ্য হাতে পেয়ে টাকা দিন</p>
    </form>
  );
};

/* ---------- ল্যান্ডিং পেজ ---------- */
export const LandingPage = (props: { p: Product; variants?: Variant[]; settings: Settings; form?: FormState; closed?: string; cfg?: Cfg; related?: Product[] }) => (
  <>
    <LandingBody {...props} />
    {props.cfg && <ProductExtras p={props.p} s={props.settings} cfg={props.cfg} related={props.related ?? []} />}
  </>
);

const LandingBody = ({ p, variants = [], settings, form, closed, cfg }: { p: Product; variants?: Variant[]; settings: Settings; form?: FormState; closed?: string; cfg?: Cfg }) => {
  const built = parseLanding(p.landing_json);
  if (built) return <BuiltLanding p={p} landing={built} variants={variants} settings={settings} form={form} closed={closed} cfg={cfg} />;
  const yt = youtubeId(p.youtube_url);
  const off = discountPercent(p.price, p.compare_price);
  return (
    <div class="landing">
      <div class="wrap narrow">
        <h1 class="landing-title">{p.headline || p.name}</h1>
        <div class="landing-img">
          <img src={imageUrl(p.image)} alt={p.name} width="800" height="800" fetchpriority="high" />
        </div>
        <div class="landing-price">
          <span class="price big">{taka(p.price)}</span>
          {p.compare_price && p.compare_price > p.price && <del class="compare">{taka(p.compare_price)}</del>}
          {off > 0 && <span class="badge inline">{bn(off)}% ছাড়</span>}
        </div>
        {p.short_desc && <p class="lead">{p.short_desc}</p>}
        <a href="#order" class="btn btn-primary btn-block btn-lg">অর্ডার করতে এখানে চাপুন</a>

        {yt && (
          <div class="video" data-yt={yt}>
            <button type="button" class="video-thumb" aria-label="ভিডিও চালান">
              <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="ভিডিও" loading="lazy" width="480" height="360" />
              <span class="play">▶</span>
            </button>
          </div>
        )}

        {p.details_html && <div class="details" dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.details_html) }} />}

        <section id="order" class="order-section">
          <h2>অর্ডার করতে নিচের ফর্মটি পূরণ করুন</h2>
          <div class="order-product">
            <img src={imageUrl(p.image)} alt="" width="64" height="64" loading="lazy" />
            <div><strong>{p.name}</strong><br />{taka(p.price)}</div>
          </div>
          {closed ? <div class="alert alert-error">{closed}</div> : <OrderForm settings={settings} subtotal={p.price} basePrice={p.price} productId={p.id} source="landing" form={form} variants={variants} variantStyle={cfg?.pd_variant_style} />}
        </section>
      </div>
      <a href="#order" class="sticky-order">{cfg?.pd_sticky_text || "অর্ডার করুন"} — {taka(p.price)}</a>
    </div>
  );
};

/* ---------- পণ্যের পেজের নিচে: যোগাযোগের বাটন, শেয়ার, সম্পর্কিত পণ্য ---------- */
const ProductExtras = ({ p, s, cfg, related }: { p: Product; s: Settings; cfg: Cfg; related: Product[] }) => {
  const phone = (s.contact_phone || "").replace(/[^\d+]/g, "");
  const wa = s.whatsapp ? `https://wa.me/88${s.whatsapp.replace(/\D/g, "").replace(/^88/, "")}?text=${encodeURIComponent(`${p.name} সম্পর্কে জানতে চাই`)}` : "";
  const msg = cfg.float_messenger;
  const btns = [
    cfg.pd_call === "1" && phone && <a href={`tel:${phone}`} class="pd-btn pd-call">📞 {cfg.pd_call_text || "কল করুন"}</a>,
    cfg.pd_wa === "1" && wa && <a href={wa} target="_blank" rel="noopener" class="pd-btn pd-wa">💬 {cfg.pd_wa_text || "WhatsApp"}</a>,
    cfg.pd_msg === "1" && msg && <a href={msg} target="_blank" rel="noopener" class="pd-btn pd-msg">✉️ {cfg.pd_msg_text || "Messenger"}</a>,
  ].filter(Boolean);
  const share = cfg.pd_share === "1";
  if (!btns.length && !share && !related.length) return <>{cfg.pd_zoom === "1" && <span data-zoom-on hidden />}</>;
  return (
    <div class="pd-extras">
      {cfg.pd_zoom === "1" && <span data-zoom-on hidden />}
      <div class="wrap narrow">
        {btns.length > 0 && <div class="pd-btns">{btns}</div>}
        {share && (
          <div class="pd-share" data-share-url={`/p/${p.slug}`}>
            <span>শেয়ার করুন:</span>
            <a href="#" data-share="facebook">Facebook</a>
            <a href="#" data-share="whatsapp">WhatsApp</a>
            <button type="button" data-share="copy">লিংক কপি</button>
          </div>
        )}
      </div>
      {related.length > 0 && (
        <div class="wrap pd-related">
          <h2 class="section-title">{cfg.pd_related_title || "আরও দেখুন"}</h2>
          <div class="grid px-grid">{related.map((r) => <ProductCard p={r} cfg={cfg} />)}</div>
        </div>
      )}
    </div>
  );
};

/* ---------- কার্ট আর চেকআউটের পণ্যের তালিকা: পরিমাণ (+/−) আর মুছে ফেলা (✕) ---------- */
const CartItems = ({ products, back, max }: { products: Product[]; back: "/cart" | "/checkout"; max: number }) => (
  <section class="ci" data-cart-items data-back={back}>
    <div class="ci-head"><h2>পণ্যের বিবরণ</h2><span>দাম</span></div>
    {products.map((p) => {
      const q = p.qty ?? 1;
      return (
        <div class="ci-row" data-ci-row={String(p.id)}>
          <a href={`/product/${p.slug}`} class="ci-img"><img src={imageUrl(p.image)} alt="" width="72" height="72" loading="lazy" /></a>
          <div class="ci-info">
            <a href={`/product/${p.slug}`} class="ci-name">{p.name}</a>
            {p.variant_label && <div class="muted">{p.variant_label}</div>}
            <div class="ci-qty" role="group" aria-label="পরিমাণ">
              <span class="muted">পরিমাণ:</span>
              <form method="post" action="/cart/qty" class="inline">
                <input type="hidden" name="product_id" value={String(p.id)} /><input type="hidden" name="back" value={back} />
                <input type="hidden" name="qty" value={String(q - 1)} />
                <button type="submit" class="ci-step" aria-label="কমান" disabled={q <= 1} data-ci-step="-1">−</button>
              </form>
              <b data-ci-qty>{bn(q)}</b>
              <form method="post" action="/cart/qty" class="inline">
                <input type="hidden" name="product_id" value={String(p.id)} /><input type="hidden" name="back" value={back} />
                <input type="hidden" name="qty" value={String(q + 1)} />
                <button type="submit" class="ci-step" aria-label="বাড়ান" disabled={q >= max} data-ci-step="1">+</button>
              </form>
            </div>
          </div>
          <div class="ci-price">
            <b data-ci-total data-unit={String(p.price)}>{taka(p.price * q)}</b>
            {p.compare_price && p.compare_price > p.price && <del class="compare" data-ci-compare={String(p.compare_price)}>{taka(p.compare_price * q)}</del>}
            {q > 1 && <small class="muted" data-ci-unit>প্রতিটা {taka(p.price)}</small>}
            <form method="post" action="/cart/remove">
              <input type="hidden" name="product_id" value={String(p.id)} /><input type="hidden" name="back" value={back} />
              <button type="submit" class="ci-remove" aria-label={`${p.name} মুছে ফেলুন`} data-ci-remove>✕ মুছুন</button>
            </form>
          </div>
        </div>
      );
    })}
  </section>
);

/* ---------- কার্ট ---------- */
export const CartPage = ({ products, max = 5 }: { products: Product[]; max?: number }) => {
  const subtotal = linesSubtotal(products);
  return (
    <div class="wrap narrow">
      <h1 class="page-title">আপনার কার্ট</h1>
      {products.length === 0 ? (
        <div class="empty">
          <p>কার্টে কোনো পণ্য নেই।</p>
          <a href="/" class="btn btn-primary">পণ্য দেখুন</a>
        </div>
      ) : (
        <>
          <CartItems products={products} back="/cart" max={max} />
          <div class="summary"><div class="summary-total"><span>মোট (ডেলিভারি ছাড়া)</span><span data-cart-subtotal>{taka(subtotal)}</span></div></div>
          <a href="/checkout" class="btn btn-primary btn-block btn-lg">চেকআউট করুন</a>
          <a href="/" class="btn-link ci-more">← আরও পণ্য দেখুন</a>
        </>
      )}
    </div>
  );
};

/* ---------- চেকআউট ---------- */
export const CheckoutPage = ({ products, settings, form, closed, max = 5 }: { products: Product[]; settings: Settings; form?: FormState; closed?: string; max?: number }) => {
  const subtotal = linesSubtotal(products);
  return (
    <div class="wrap narrow">
      <h1 class="page-title">চেকআউট</h1>
      {products.length === 0 ? (
        <div class="empty"><p>কার্টে কোনো পণ্য নেই।</p><a href="/" class="btn btn-primary">পণ্য দেখুন</a></div>
      ) : (
        <>
          <CartItems products={products} back="/checkout" max={max} />
          {closed ? <div class="alert alert-error">{closed}</div> : <OrderForm settings={settings} subtotal={subtotal} source="cart" form={form} />}
        </>
      )}
    </div>
  );
};

/* ---------- ধন্যবাদ ---------- */
/** ধন্যবাদের লেখায় {name}, {order_no}, {total}, {phone}, {shop} বসানো */
export function fillThanks(t: string, o: Order, s: Settings): string {
  const map: Record<string, string> = { name: o.name, order_no: o.order_no, orderid: o.order_no, total: taka(o.total).replace("৳", ""), totalamount: taka(o.total).replace("৳", ""), phone: bn(o.phone), shop: s.site_name || "", mysite: s.site_name || "" };
  return t.replace(/\{(\w+)\}/g, (m, k: string) => map[k.toLowerCase()] ?? m);
}
export const ThanksPage = ({ order, items, settings }: { order: Order; items: OrderItem[]; settings: Settings }) => (
  <div class="wrap narrow thanks">
    <div class="thanks-icon">✓</div>
    <h1>ধন্যবাদ, আপনার অর্ডারটি পেয়েছি!</h1>
    <p class="order-no">অর্ডার নম্বর: <strong>{order.order_no}</strong></p>
    {settings.thanks_message ? <p class="thanks-message">{fillThanks(settings.thanks_message, order, settings)}</p> : <p>আমাদের প্রতিনিধি শীঘ্রই <strong>{bn(order.phone)}</strong> নম্বরে কল করে অর্ডারটি কনফার্ম করবেন।</p>}
    <div class="summary">
      {items.map((i) => <div><span>{i.product_name}{i.variant_label ? ` (${i.variant_label})` : ""}{(i.qty || 1) > 1 ? ` × ${bn(i.qty)}` : ""}</span><span>{taka(i.price * (i.qty || 1))}</span></div>)}
      <div><span>ডেলিভারি চার্জ ({AREA_LABEL[order.area]})</span><span>{taka(order.delivery_charge)}</span></div>
      {order.discount > 0 && <div><span>কুপন ছাড় ({order.coupon_code})</span><span>-{taka(order.discount)}</span></div>}
      <div class="summary-total"><span>মোট (ক্যাশ অন ডেলিভারি)</span><span>{taka(order.total)}</span></div>
    </div>
    <p class="muted">ঠিকানা: {order.address}</p>
    <p>কোনো প্রশ্ন থাকলে কল করুন: <a href={`tel:${settings.contact_phone}`}>{bn(settings.contact_phone || "")}</a></p>
    <a href="/" class="btn btn-outline">আরও পণ্য দেখুন</a>
  </div>
);

export const NotFoundPage = () => (
  <div class="wrap narrow empty">
    <h1>পেজটি পাওয়া যায়নি</h1>
    <a href="/" class="btn btn-primary">হোম পেজে যান</a>
  </div>
);
