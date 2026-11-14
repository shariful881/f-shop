/**
 * প্রো স্টোর থিম — বাংলাদেশের বড় ই-কমার্স সাইটের মতো:
 * উপরে ঘোষণা/হটলাইন, সার্চসহ হেডার, ক্যাটাগরি মেনু, ব্যানার স্লাইডার,
 * ক্যাটাগরির টাইল, পণ্যের সারি, বিশ্বাসের ব্যাজ, বড় ফুটার, মোবাইলে নিচের মেনু, WhatsApp বাটন।
 */
import type { Child } from "hono/jsx";
import type { HomeSection, Product } from "../lib/products";
import type { Settings } from "../lib/settings";
import { freeDeliveryMin } from "../lib/settings";
import { bn, imageUrl, taka } from "../lib/format";
import { ProductCard } from "./shop";

export type NavCat = { id: number; name: string };

/* ---------- ছোট আইকন (নিজের আঁকা, হালকা SVG) ---------- */
const Ico = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
export const I = {
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3",
  cart: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6M9.5 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17.5 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  menu: "M4 6h16M4 12h16M4 18h16",
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  cash: "M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4M18 10v4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
  close: "M6 6l12 12M18 6L6 18",
};
export const Icon = ({ name, size }: { name: keyof typeof I; size?: number }) => <Ico d={I[name]} size={size} />;

const phoneHref = (s: Settings) => `tel:${(s.contact_phone || "").replace(/[^\d+]/g, "")}`;
export const waHref = (s: Settings) => (s.whatsapp ? `https://wa.me/88${s.whatsapp.replace(/\D/g, "").replace(/^88/, "")}` : "");

/* ---------- হেডার ---------- */
export const ProHeader = ({ s, cartCount, nav, q }: { s: Settings; cartCount: number; nav: NavCat[]; q?: string }) => {
  const freeMin = freeDeliveryMin(s);
  const note = s.announcement || (freeMin > 0 ? `🚚 ${taka(freeMin)} বা তার বেশি অর্ডারে ডেলিভারি ফ্রি` : "ক্যাশ অন ডেলিভারি — পণ্য হাতে পেয়ে টাকা দিন");
  const search = (
    <form action="/search" method="get" class="px-search" role="search">
      <input type="search" name="q" value={q ?? ""} placeholder="পণ্য খুঁজুন…" aria-label="পণ্য খুঁজুন" maxlength={60} />
      <button type="submit" aria-label="খুঁজুন"><Icon name="search" size={20} /></button>
    </form>
  );
  return (
    <>
      <div class="px-topbar">
        <div class="wrap px-topbar-in">
          <span class="px-note">{note}</span>
          {s.contact_phone && <a href={phoneHref(s)} class="px-hotline"><Icon name="phone" size={14} /> হটলাইন: {bn(s.contact_phone)}</a>}
        </div>
      </div>
      <input type="checkbox" id="px-drawer" class="px-drawer-toggle" aria-hidden="true" />
      <header class="px-header">
        <div class="wrap px-header-in">
          <label for="px-drawer" class="px-icon-btn px-only-mobile" aria-label="মেনু"><Icon name="menu" /></label>
          <a href="/" class="px-logo">
            {s.logo ? <img src={imageUrl(s.logo)} alt={s.site_name || ""} height="40" /> : <span>{s.site_name || "দোকান"}</span>}
          </a>
          <div class="px-only-desktop px-search-wrap">{search}</div>
          <div class="px-actions">
            {s.contact_phone && (
              <a href={phoneHref(s)} class="px-call px-only-desktop">
                <Icon name="phone" /><span><small>অর্ডার করতে কল করুন</small><b>{bn(s.contact_phone)}</b></span>
              </a>
            )}
            <a href="/cart" class="px-icon-btn px-cart" aria-label="কার্ট">
              <Icon name="cart" /><span class="px-cart-count" data-cart-count>{bn(cartCount)}</span>
            </a>
          </div>
        </div>
        <div class="wrap px-only-mobile px-search-mobile">{search}</div>
        {nav.length > 0 && (
          <nav class="px-nav px-only-desktop" aria-label="ক্যাটাগরি">
            <div class="wrap px-nav-in">
              <a href="/">হোম</a>
              {nav.map((c) => <a href={`/c/${c.id}`}>{c.name}</a>)}
            </div>
          </nav>
        )}
      </header>
      {/* মোবাইলের পাশের মেনু */}
      <aside class="px-drawer" aria-label="মেনু">
        <div class="px-drawer-head">
          <strong>{s.site_name || "মেনু"}</strong>
          <label for="px-drawer" class="px-icon-btn" aria-label="বন্ধ করুন"><Icon name="close" /></label>
        </div>
        <a href="/">হোম</a>
        {nav.map((c) => <a href={`/c/${c.id}`}>{c.name}</a>)}
        <a href="/cart">কার্ট</a>
        {s.contact_phone && <a href={phoneHref(s)}>📞 {bn(s.contact_phone)}</a>}
      </aside>
      <label for="px-drawer" class="px-scrim" aria-hidden="true"></label>
    </>
  );
};

/* ---------- ফুটার ---------- */
export const ProFooter = ({ s, nav }: { s: Settings; nav: NavCat[] }) => {
  const wa = waHref(s);
  return (
    <footer class="px-footer">
      <div class="px-trust-strip">
        <div class="wrap px-trust-in">
          <div><Icon name="cash" /><span><b>ক্যাশ অন ডেলিভারি</b><small>পণ্য হাতে পেয়ে টাকা দিন</small></span></div>
          <div><Icon name="truck" /><span><b>সারাদেশে ডেলিভারি</b><small>{s.delivery_time_inside ? `ঢাকায় ${s.delivery_time_inside}` : "দ্রুত হোম ডেলিভারি"}</small></span></div>
          <div><Icon name="shield" /><span><b>১০০% অরিজিনাল</b><small>মান যাচাই করা পণ্য</small></span></div>
          <div><Icon name="refresh" /><span><b>সহজ রিটার্ন</b><small>ডেলিভারির সময় দেখে নিন</small></span></div>
        </div>
      </div>
      <div class="wrap px-footer-grid">
        <div>
          <a href="/" class="px-footer-logo">{s.logo ? <img src={imageUrl(s.logo)} alt={s.site_name || ""} height="40" /> : s.site_name}</a>
          {s.seo_description && <p>{s.seo_description}</p>}
          {s.facebook_page && /^https:\/\//.test(s.facebook_page) && <p><a href={s.facebook_page} target="_blank" rel="noopener">Facebook পেজ ↗</a></p>}
        </div>
        {nav.length > 0 && (
          <div>
            <h4>ক্যাটাগরি</h4>
            <ul>{nav.slice(0, 8).map((c) => <li><a href={`/c/${c.id}`}>{c.name}</a></li>)}</ul>
          </div>
        )}
        <div>
          <h4>কেনাকাটা</h4>
          <ul>
            <li><a href="/">সব পণ্য</a></li>
            <li><a href="/cart">আমার কার্ট</a></li>
            <li><a href="/search">পণ্য খুঁজুন</a></li>
          </ul>
        </div>
        <div>
          <h4>যোগাযোগ</h4>
          <ul>
            {s.contact_phone && <li><a href={phoneHref(s)}>📞 {bn(s.contact_phone)}</a></li>}
            {wa && <li><a href={wa} target="_blank" rel="noopener">💬 WhatsApp</a></li>}
            {s.store_email && <li><a href={`mailto:${s.store_email}`}>✉️ {s.store_email}</a></li>}
            {s.store_address && <li>📍 {s.store_address}</li>}
          </ul>
        </div>
      </div>
      <div class="px-copy"><div class="wrap">© {s.site_name || ""} · ক্যাশ অন ডেলিভারি · সারাদেশে হোম ডেলিভারি</div></div>
    </footer>
  );
};

/* ---------- মোবাইলের নিচের মেনু + WhatsApp ---------- */
export const ProBottom = ({ s, cartCount, bare }: { s: Settings; cartCount: number; bare?: boolean }) => {
  const wa = waHref(s);
  return (
    <>
      {wa && <a href={wa} class={`px-wa ${bare ? "px-wa-up" : ""}`} target="_blank" rel="noopener" aria-label="WhatsApp-এ মেসেজ দিন"><Icon name="chat" size={26} /></a>}
      {!bare && (
        <nav class="px-bottom" aria-label="মোবাইল মেনু">
          <a href="/"><Icon name="home" /><span>হোম</span></a>
          <label for="px-drawer"><Icon name="grid" /><span>ক্যাটাগরি</span></label>
          <a href="/cart" class="px-bottom-cart"><Icon name="cart" /><span>কার্ট</span><i data-cart-count>{bn(cartCount)}</i></a>
          {s.contact_phone ? <a href={phoneHref(s)}><Icon name="phone" /><span>কল করুন</span></a> : <a href="/search"><Icon name="search" /><span>খুঁজুন</span></a>}
        </nav>
      )}
    </>
  );
};

/* ---------- হোম ---------- */
const Section = ({ title, href, children }: { title: string; href?: string; children?: Child }) => (
  <section class="px-section">
    <div class="px-section-head">
      <h2>{title}</h2>
      {href && <a href={href} class="px-more">সব দেখুন →</a>}
    </div>
    {children}
  </section>
);

export const ProHome = ({ s, sections }: { s: Settings; sections: HomeSection[] }) => {
  const banners = ([1, 2, 3] as const)
    .map((n) => ({ img: s[`banner_${n}`], link: s[`banner_${n}_link`] }))
    .filter((b): b is { img: string; link: string } => !!b.img);
  const safeLink = (l?: string) => (l && /^(\/[^/]|https:\/\/)/.test(l) ? l : undefined);
  const offers = sections.flatMap((x) => x.products).filter((p) => p.compare_price && p.compare_price > p.price);
  const seen = new Set<number>();
  const deals = offers.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 8);
  return (
    <div class="px-home">
      {banners.length > 0 && (
        <div class="wrap">
          <div class="px-slider" data-slider>
            <div class="px-slides">
              {banners.map((b, i) => {
                const img = <img src={imageUrl(b.img)} alt="" width="1200" height="450" loading={i ? "lazy" : "eager"} fetchpriority={i ? undefined : "high"} />;
                const href = safeLink(b.link);
                return <div class="px-slide">{href ? <a href={href}>{img}</a> : img}</div>;
              })}
            </div>
            {banners.length > 1 && <div class="px-dots">{banners.map((_, i) => <button type="button" aria-label={`ব্যানার ${i + 1}`} data-dot={String(i)} class={i ? "" : "on"}></button>)}</div>}
          </div>
        </div>
      )}

      <div class="wrap">
        {sections.length === 0 && <p class="empty">এখনো কোনো পণ্য যোগ করা হয়নি।</p>}

        {sections.length > 1 && (
          <Section title="ক্যাটাগরি">
            <div class="px-cats">
              {sections.map((x) => (
                <a href={`/c/${x.category.id}`} class="px-cat">
                  <span class="px-cat-img"><img src={imageUrl(x.products[0]?.image ?? null)} alt="" loading="lazy" width="120" height="120" /></span>
                  <span class="px-cat-name">{x.category.name}</span>
                </a>
              ))}
            </div>
          </Section>
        )}

        {deals.length >= 2 && (
          <Section title="🔥 অফার চলছে">
            <div class="grid px-grid">{deals.map((p) => <ProductCard p={p} />)}</div>
          </Section>
        )}

        {sections.map((x) => (
          <Section title={x.category.name} href={x.products.length > 8 ? `/c/${x.category.id}` : undefined}>
            <div class="grid px-grid">{x.products.slice(0, 8).map((p) => <ProductCard p={p} />)}</div>
          </Section>
        ))}
      </div>
    </div>
  );
};

/* ---------- ক্যাটাগরি / সার্চের পণ্য তালিকা (সব থিমে) ---------- */
export const ListingPage = ({ title, products, q, nav, activeId }: { title: string; products: Product[]; q?: string; nav: NavCat[]; activeId?: number }) => (
  <div class="wrap px-listing">
    <nav class="px-crumbs"><a href="/">হোম</a> › <span>{title}</span></nav>
    <h1 class="page-title">{title} <small class="muted">({bn(products.length)}টা পণ্য)</small></h1>
    {q !== undefined && (
      <form action="/search" method="get" class="px-search px-search-page" role="search">
        <input type="search" name="q" value={q} placeholder="পণ্যের নাম লিখুন…" maxlength={60} aria-label="পণ্য খুঁজুন" />
        <button type="submit" aria-label="খুঁজুন"><Icon name="search" size={20} /></button>
      </form>
    )}
    {nav.length > 1 && (
      <div class="px-chips">
        {nav.map((c) => <a href={`/c/${c.id}`} class={c.id === activeId ? "px-chip on" : "px-chip"}>{c.name}</a>)}
      </div>
    )}
    {products.length === 0 ? (
      <div class="empty"><p>{q ? `"${q}" নামে কোনো পণ্য পাওয়া যায়নি।` : "এখানে এখনো কোনো পণ্য নেই।"}</p><a href="/" class="btn btn-primary">সব পণ্য দেখুন</a></div>
    ) : (
      <div class="grid px-grid">{products.map((p) => <ProductCard p={p} />)}</div>
    )}
  </div>
);
