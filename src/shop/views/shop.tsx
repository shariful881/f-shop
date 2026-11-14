import type { HomeSection, Product, Variant } from "../lib/products";
import type { Settings } from "../lib/settings";
import type { Order, OrderItem } from "../lib/orders";
import { AREA_LABEL } from "../lib/orders";
import { bn, discountPercent, imageUrl, taka, youtubeId } from "../lib/format";
import { deliveryCharge } from "../lib/settings";

/* ---------- পণ্যের কার্ড ---------- */
export const ProductCard = ({ p }: { p: Product }) => {
  const off = discountPercent(p.price, p.compare_price);
  return (
    <div class="card">
      <a href={`/p/${p.slug}`} class="card-img">
        <img src={imageUrl(p.image)} alt={p.name} loading="lazy" width="400" height="400" />
        {off > 0 && <span class="badge">{bn(off)}% ছাড়</span>}
      </a>
      <div class="card-body">
        <a href={`/p/${p.slug}`} class="card-title">{p.name}</a>
        <div class="price-row">
          <span class="price">{taka(p.price)}</span>
          {p.compare_price && p.compare_price > p.price && <del class="compare">{taka(p.compare_price)}</del>}
        </div>
        <div class="card-actions">
          <a href={`/p/${p.slug}#order`} class="btn btn-primary">অর্ডার করুন</a>
          {p.variant_count ? (
            <a href={`/p/${p.slug}#order`} class="btn btn-outline">অপশন বাছুন</a>
          ) : (
            <form method="post" action="/cart/add" data-add-to-cart>
              <input type="hidden" name="product_id" value={String(p.id)} />
              <button type="submit" class="btn btn-outline">কার্টে যোগ</button>
            </form>
          )}
        </div>
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
}) => {
  const v = p.form?.values ?? {};
  const e = p.form?.errors ?? {};
  const area = v.area === "outside" ? "outside" : "inside";
  const inside = deliveryCharge(p.settings, "inside");
  const outside = deliveryCharge(p.settings, "outside");
  return (
    <form method="post" action="/order" class="order-form" id="order-form" data-order-form
      data-subtotal={String(p.subtotal)} data-inside={String(inside)} data-outside={String(outside)}
      data-source={p.source} data-product-id={p.productId ? String(p.productId) : ""} novalidate>
      {p.form?.alert && <div class="alert alert-error" role="alert">{p.form.alert}</div>}
      <input type="hidden" name="source" value={p.source} />
      {p.productId && <input type="hidden" name="product_id" value={String(p.productId)} />}
      <input type="hidden" name="did_ls" value="" data-did-ls />

      {p.variants && p.variants.length > 0 && (
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
      )}

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
      <fieldset class="field area-field">
        <span>ডেলিভারি এলাকা *</span>
        <label class="radio"><input type="radio" name="area" value="inside" checked={area === "inside"} /> {AREA_LABEL.inside} ({taka(inside)})</label>
        <label class="radio"><input type="radio" name="area" value="outside" checked={area === "outside"} /> {AREA_LABEL.outside} ({taka(outside)})</label>
        {e.area && <small class="error">{e.area}</small>}
      </fieldset>
      <label class="field">
        <span>নোট (ঐচ্ছিক)</span>
        <input type="text" name="note" value={v.note ?? ""} maxlength={300} />
      </label>

      <div class="summary">
        <div><span>পণ্যের দাম</span><span data-subtotal-text>{taka(p.subtotal)}</span></div>
        <div><span>ডেলিভারি চার্জ</span><span data-delivery>{taka(area === "inside" ? inside : outside)}</span></div>
        <div class="summary-total"><span>মোট</span><span data-total>{taka(p.subtotal + (area === "inside" ? inside : outside))}</span></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block btn-lg" data-submit>অর্ডার কনফার্ম করুন</button>
      <p class="muted center">ক্যাশ অন ডেলিভারি — পণ্য হাতে পেয়ে টাকা দিন</p>
    </form>
  );
};

/* ---------- ল্যান্ডিং পেজ ---------- */
export const LandingPage = ({ p, variants = [], settings, form, closed }: { p: Product; variants?: Variant[]; settings: Settings; form?: FormState; closed?: string }) => {
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

        {p.details_html && <div class="details" dangerouslySetInnerHTML={{ __html: p.details_html }} />}

        <section id="order" class="order-section">
          <h2>অর্ডার করতে নিচের ফর্মটি পূরণ করুন</h2>
          <div class="order-product">
            <img src={imageUrl(p.image)} alt="" width="64" height="64" loading="lazy" />
            <div><strong>{p.name}</strong><br />{taka(p.price)}</div>
          </div>
          {closed ? <div class="alert alert-error">{closed}</div> : <OrderForm settings={settings} subtotal={p.price} basePrice={p.price} productId={p.id} source="landing" form={form} variants={variants} />}
        </section>
      </div>
      <a href="#order" class="sticky-order">অর্ডার করুন — {taka(p.price)}</a>
    </div>
  );
};

/* ---------- কার্ট ---------- */
export const CartPage = ({ products }: { products: Product[] }) => {
  const subtotal = products.reduce((s, p) => s + p.price, 0);
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
          <ul class="cart-list">
            {products.map((p) => (
              <li class="cart-item">
                <img src={imageUrl(p.image)} alt="" width="64" height="64" loading="lazy" />
                <div class="cart-item-info">
                  <a href={`/p/${p.slug}`}>{p.name}</a>
                  {p.variant_label && <div class="muted">{p.variant_label}</div>}
                  <div class="price">{taka(p.price)}</div>
                </div>
                <form method="post" action="/cart/remove">
                  <input type="hidden" name="product_id" value={String(p.id)} />
                  <button type="submit" class="btn-link danger" aria-label="মুছুন">✕</button>
                </form>
              </li>
            ))}
          </ul>
          <p class="muted">প্রতিটা পণ্য একটা করে নেওয়া যায়।</p>
          <div class="summary"><div class="summary-total"><span>মোট (ডেলিভারি ছাড়া)</span><span>{taka(subtotal)}</span></div></div>
          <a href="/checkout" class="btn btn-primary btn-block btn-lg">চেকআউট করুন</a>
        </>
      )}
    </div>
  );
};

/* ---------- চেকআউট ---------- */
export const CheckoutPage = ({ products, settings, form, closed }: { products: Product[]; settings: Settings; form?: FormState; closed?: string }) => {
  const subtotal = products.reduce((s, p) => s + p.price, 0);
  return (
    <div class="wrap narrow">
      <h1 class="page-title">চেকআউট</h1>
      <ul class="cart-list compact">
        {products.map((p) => (
          <li class="cart-item">
            <img src={imageUrl(p.image)} alt="" width="48" height="48" loading="lazy" />
            <div class="cart-item-info"><span>{p.name}</span>{p.variant_label && <div class="muted">{p.variant_label}</div>}<div class="price">{taka(p.price)}</div></div>
          </li>
        ))}
      </ul>
      {closed ? <div class="alert alert-error">{closed}</div> : <OrderForm settings={settings} subtotal={subtotal} source="cart" form={form} />}
    </div>
  );
};

/* ---------- ধন্যবাদ ---------- */
export const ThanksPage = ({ order, items, settings }: { order: Order; items: OrderItem[]; settings: Settings }) => (
  <div class="wrap narrow thanks">
    <div class="thanks-icon">✓</div>
    <h1>ধন্যবাদ, আপনার অর্ডারটি পেয়েছি!</h1>
    <p class="order-no">অর্ডার নম্বর: <strong>{order.order_no}</strong></p>
    <p>আমাদের প্রতিনিধি শীঘ্রই <strong>{bn(order.phone)}</strong> নম্বরে কল করে অর্ডারটি কনফার্ম করবেন।</p>
    <div class="summary">
      {items.map((i) => <div><span>{i.product_name}{i.variant_label ? ` (${i.variant_label})` : ""}</span><span>{taka(i.price)}</span></div>)}
      <div><span>ডেলিভারি চার্জ ({AREA_LABEL[order.area]})</span><span>{taka(order.delivery_charge)}</span></div>
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
