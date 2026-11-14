/**
 * দোকানের হেডার, ফুটার, হোমপেজ, ভাসমান বাটন — চারটা থিমেই,
 * প্রতিটা থিমের নিজস্ব সেটিংস (থিম কাস্টমাইজ) অনুযায়ী।
 * প্রো স্টোর থিমের হেডার আলাদা (সার্চসহ বড় হেডার); বাকি তিনটার রঙিন সরু হেডার।
 */
import type { Child } from "hono/jsx";
import type { HomeSection, Product } from "../lib/products";
import type { Settings } from "../lib/settings";
import { freeDeliveryMin, themeOf } from "../lib/settings";
import { homeOrder, type Cfg } from "../lib/theme-config";
import { bn, imageUrl, taka } from "../lib/format";
import { ProductCard } from "./shop";

export type NavCat = { id: number; name: string };

/* ---------- ছোট আইকন (নিজের আঁকা, হালকা SVG) ---------- */
export const I = {
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3",
  cart: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6M9.5 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17.5 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  menu: "M4 6h16M4 12h16M4 18h16",
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  bolt: "M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zM7 14l3.5-3.5 2.5 2.5L17 9",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  cash: "M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4M18 10v4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
  close: "M6 6l12 12M18 6L6 18",
};
export const Icon = ({ name, size = 22 }: { name: keyof typeof I; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={I[name]} />
  </svg>
);

const phoneHref = (s: Settings) => `tel:${(s.contact_phone || "").replace(/[^\d+]/g, "")}`;
export const waHref = (s: Settings) => (s.whatsapp ? `https://wa.me/88${s.whatsapp.replace(/\D/g, "").replace(/^88/, "")}` : "");
const on = (cfg: Cfg, k: string) => cfg[k] === "1";

const SearchBox = ({ q }: { q?: string }) => (
  <form action="/search" method="get" class="px-search" role="search">
    <input type="search" name="q" value={q ?? ""} placeholder="পণ্য খুঁজুন…" aria-label="পণ্য খুঁজুন" maxlength={60} />
    <button type="submit" aria-label="খুঁজুন"><Icon name="search" size={20} /></button>
  </form>
);

const TopBar = ({ s, cfg }: { s: Settings; cfg: Cfg }) => {
  if (!on(cfg, "topbar")) return null;
  const freeMin = freeDeliveryMin(s);
  const note = cfg.announcement || (freeMin > 0 ? `🚚 ${taka(freeMin)} বা তার বেশি অর্ডারে ডেলিভারি ফ্রি` : "ক্যাশ অন ডেলিভারি — পণ্য হাতে পেয়ে টাকা দিন");
  const hot = on(cfg, "topbar_hotline") && s.contact_phone;
  return (
    <div class="px-topbar">
      <div class={`wrap px-topbar-in ${hot ? "" : "solo"}`}>
        <span class="px-note">{note}</span>
        {hot && <a href={phoneHref(s)} class="px-hotline"><Icon name="phone" size={14} /> হটলাইন: {bn(s.contact_phone!)}</a>}
      </div>
    </div>
  );
};

const Drawer = ({ s, nav }: { s: Settings; nav: NavCat[] }) => (
  <>
    <aside class="px-drawer" aria-label="মেনু">
      <div class="px-drawer-head">
        <strong>{s.site_name || "মেনু"}</strong>
        <label for="px-drawer" class="px-icon-btn" aria-label="বন্ধ করুন"><Icon name="close" /></label>
      </div>
      <a href="/">হোম</a>
      {nav.map((c) => <a href={`/c/${c.id}`}>{c.name}</a>)}
      <a href="/search">পণ্য খুঁজুন</a>
      <a href="/cart">কার্ট</a>
      {s.contact_phone && <a href={phoneHref(s)}>📞 {bn(s.contact_phone)}</a>}
    </aside>
    <label for="px-drawer" class="px-scrim" aria-hidden="true"></label>
  </>
);

const NavRow = ({ nav }: { nav: NavCat[] }) => (
  <nav class="px-nav px-only-desktop" aria-label="ক্যাটাগরি">
    <div class="wrap px-nav-in">
      <a href="/">হোম</a>
      {nav.map((c) => <a href={`/c/${c.id}`}>{c.name}</a>)}
    </div>
  </nav>
);

/* ---------- হেডার ---------- */
export const StoreHeader = ({ s, cfg, cartCount, nav, q }: { s: Settings; cfg: Cfg; cartCount: number; nav: NavCat[]; q?: string }) => {
  const showNav = on(cfg, "header_nav") && nav.length > 0;
  const logo = s.logo ? <img src={imageUrl(s.logo)} alt={s.site_name || ""} class="logo-img" height="40" /> : <span>{s.site_name || "দোকান"}</span>;
  const menuBtn = (showNav || on(cfg, "header_search")) && <label for="px-drawer" class="px-icon-btn px-only-mobile" aria-label="মেনু"><Icon name="menu" /></label>;

  if (themeOf(s) === "pro") {
    return (
      <>
        <TopBar s={s} cfg={cfg} />
        <input type="checkbox" id="px-drawer" class="px-drawer-toggle" aria-hidden="true" />
        <header class="px-header">
          <div class="wrap px-header-in">
            {menuBtn}
            <a href="/" class="px-logo">{logo}</a>
            {on(cfg, "header_search") && <div class="px-only-desktop px-search-wrap"><SearchBox q={q} /></div>}
            <div class="px-actions">
              {on(cfg, "header_call") && s.contact_phone && (
                <a href={phoneHref(s)} class="px-call px-only-desktop">
                  <Icon name="phone" /><span><small>অর্ডার করতে কল করুন</small><b>{bn(s.contact_phone)}</b></span>
                </a>
              )}
              <a href="/cart" class="px-icon-btn px-cart" aria-label="কার্ট">
                <Icon name="cart" /><span class="px-cart-count" data-cart-count>{bn(cartCount)}</span>
              </a>
            </div>
          </div>
          {on(cfg, "header_search") && <div class="wrap px-only-mobile px-search-mobile"><SearchBox q={q} /></div>}
          {showNav && <NavRow nav={nav} />}
        </header>
        <Drawer s={s} nav={nav} />
      </>
    );
  }

  // ক্লাসিক, মিনিমাল, বোল্ড: রঙিন সরু হেডার
  return (
    <>
      <TopBar s={s} cfg={cfg} />
      <input type="checkbox" id="px-drawer" class="px-drawer-toggle" aria-hidden="true" />
      <header class="site-header">
        <div class="wrap header-inner">
          {menuBtn}
          <a href="/" class="logo">{logo}</a>
          {on(cfg, "header_search") && <div class="px-only-desktop px-search-wrap"><SearchBox q={q} /></div>}
          {on(cfg, "header_call") && s.contact_phone && <a href={phoneHref(s)} class="px-call px-only-desktop"><Icon name="phone" size={18} /> {bn(s.contact_phone)}</a>}
          <a href="/cart" class="cart-link" aria-label="কার্ট">
            🛒 কার্ট <span class="cart-count" data-cart-count>{bn(cartCount)}</span>
          </a>
        </div>
        {on(cfg, "header_search") && <div class="wrap px-only-mobile px-search-mobile"><SearchBox q={q} /></div>}
        {showNav && <NavRow nav={nav} />}
      </header>
      <Drawer s={s} nav={nav} />
    </>
  );
};

/* ---------- বিশ্বাসের ব্যাজ ---------- */
const TRUST_ICONS: (keyof typeof I)[] = ["cash", "truck", "shield", "refresh"];
export const TrustStrip = ({ cfg }: { cfg: Cfg }) => {
  const items = [1, 2, 3, 4].map((n) => ({ t: cfg[`trust_${n}`], sub: cfg[`trust_${n}_sub`], icon: TRUST_ICONS[n - 1]! })).filter((x) => x.t);
  if (!items.length) return null;
  return (
    <div class="px-trust-strip">
      <div class="wrap px-trust-in">
        {items.map((x) => <div><Icon name={x.icon} /><span><b>{x.t}</b>{x.sub && <small>{x.sub}</small>}</span></div>)}
      </div>
    </div>
  );
};

/* ---------- ফুটার ---------- */
export const StoreFooter = ({ s, cfg, nav }: { s: Settings; cfg: Cfg; nav: NavCat[] }) => {
  const wa = waHref(s);
  const fb = s.facebook_page && /^https:\/\//.test(s.facebook_page) ? s.facebook_page : "";
  const socials = ([["Facebook", fb], ["Instagram", cfg.social_instagram], ["YouTube", cfg.social_youtube], ["TikTok", cfg.social_tiktok]] as const).filter(([, u]) => u);
  const trust = on(cfg, "footer_trust") && <TrustStrip cfg={cfg} />;

  if (cfg.footer_style !== "full") {
    return (
      <>
        {trust}
        <footer class="site-footer">
          <div class="wrap">
            {s.contact_phone && <p>যেকোনো প্রয়োজনে কল করুন: <a href={phoneHref(s)}>{bn(s.contact_phone)}</a></p>}
            {(wa || s.store_email || socials.length > 0) && (
              <p class="footer-links">
                {wa && <a href={wa} target="_blank" rel="noopener">WhatsApp</a>}
                {socials.map(([n, u]) => <a href={u} target="_blank" rel="noopener">{n === "Facebook" ? "Facebook পেজ" : n}</a>)}
                {s.store_email && <a href={`mailto:${s.store_email}`}>{s.store_email}</a>}
              </p>
            )}
            {s.store_address && <p class="muted">{s.store_address}</p>}
            <p class="muted">{cfg.footer_copy || "ক্যাশ অন ডেলিভারি • পণ্য হাতে পেয়ে টাকা দিন"}</p>
          </div>
        </footer>
      </>
    );
  }

  return (
    <>
      {trust}
      <footer class="px-footer">
        <div class="wrap px-footer-grid">
          <div>
            <a href="/" class="px-footer-logo">{s.logo ? <img src={imageUrl(s.logo)} alt={s.site_name || ""} height="40" /> : s.site_name}</a>
            {(cfg.footer_about || s.seo_description) && <p>{cfg.footer_about || s.seo_description}</p>}
            {socials.length > 0 && <p class="px-socials">{socials.map(([n, u]) => <a href={u} target="_blank" rel="noopener">{n}</a>)}</p>}
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
        <div class="px-copy"><div class="wrap">{cfg.footer_copy || `© ${s.site_name || ""} · ক্যাশ অন ডেলিভারি · সারাদেশে হোম ডেলিভারি`}</div></div>
      </footer>
    </>
  );
};

/* ---------- ভাসমান বাটন + মোবাইলের নিচের মেনু ---------- */
export const StoreFloating = ({ s, cfg, cartCount, bare }: { s: Settings; cfg: Cfg; cartCount: number; bare?: boolean }) => {
  const wa = on(cfg, "float_whatsapp") ? waHref(s) : "";
  const call = on(cfg, "float_call") && s.contact_phone ? phoneHref(s) : "";
  const msg = cfg.float_messenger;
  const nav = on(cfg, "bottom_nav") && !bare;
  return (
    <>
      {(wa || call || msg) && (
        <div class={`px-floats ${nav ? "" : "low"} ${bare ? "bare" : ""}`}>
          {msg && <a href={msg} class="px-fab px-fab-msg" target="_blank" rel="noopener" aria-label="Messenger-এ মেসেজ দিন"><Icon name="bolt" size={24} /></a>}
          {call && <a href={call} class="px-fab px-fab-call" aria-label="কল করুন"><Icon name="phone" size={24} /></a>}
          {wa && <a href={wa} class="px-fab px-wa" target="_blank" rel="noopener" aria-label="WhatsApp-এ মেসেজ দিন"><Icon name="chat" size={26} /></a>}
        </div>
      )}
      {nav && (
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
const Section = ({ title, href, children }: { title?: string; href?: string; children?: Child }) => (
  <section class="home-section px-section">
    {title && (
      <div class="px-section-head">
        <h2 class="section-title">{title}</h2>
        {href && <a href={href} class="px-more">সব দেখুন →</a>}
      </div>
    )}
    {children}
  </section>
);

export const StoreHome = ({ s, cfg, sections }: { s: Settings; cfg: Cfg; sections: HomeSection[] }) => {
  const safeLink = (l?: string) => (l && /^(\/[^/]|https:\/\/)/.test(l) ? l : undefined);
  const per = parseInt(cfg.per_section || "0", 10);
  const parts: Record<string, () => Child> = {
    banner: () => {
      const banners = ([1, 2, 3] as const).map((n) => ({ img: s[`banner_${n}`], link: s[`banner_${n}_link`] })).filter((b) => !!b.img);
      if (!banners.length) return null;
      return (
        <div class="px-slider" data-slider>
          <div class="px-slides">
            {banners.map((b, i) => {
              const img = <img src={imageUrl(b.img!)} alt="" width="1200" height="450" loading={i ? "lazy" : "eager"} fetchpriority={i ? undefined : "high"} />;
              const href = safeLink(b.link);
              return <div class="px-slide">{href ? <a href={href}>{img}</a> : img}</div>;
            })}
          </div>
          {banners.length > 1 && <div class="px-dots">{banners.map((_, i) => <button type="button" aria-label={`ব্যানার ${i + 1}`} data-dot={String(i)} class={i ? "" : "on"}></button>)}</div>}
        </div>
      );
    },
    categories: () => sections.length < 2 ? null : (
      <Section title={cfg.title_categories}>
        <div class="px-cats">
          {sections.map((x) => (
            <a href={`/c/${x.category.id}`} class="px-cat">
              <span class="px-cat-img"><img src={imageUrl(x.products[0]?.image ?? null)} alt="" loading="lazy" width="120" height="120" /></span>
              <span class="px-cat-name">{x.category.name}</span>
            </a>
          ))}
        </div>
      </Section>
    ),
    offers: () => {
      const seen = new Set<number>();
      const deals = sections.flatMap((x) => x.products)
        .filter((p) => p.compare_price && p.compare_price > p.price && !seen.has(p.id) && (seen.add(p.id), true)).slice(0, 8);
      return deals.length < 2 ? null : (
        <Section title={cfg.title_offers}><div class="grid px-grid">{deals.map((p) => <ProductCard p={p} cfg={cfg} />)}</div></Section>
      );
    },
    products: () => (
      <>
        {sections.map((x) => {
          const list = per > 0 ? x.products.slice(0, per) : x.products;
          return (
            <Section title={x.category.name} href={on(cfg, "show_more") && x.products.length > list.length ? `/c/${x.category.id}` : undefined}>
              <div class="grid px-grid">{list.map((p) => <ProductCard p={p} cfg={cfg} />)}</div>
            </Section>
          );
        })}
      </>
    ),
    trust: () => <div class="px-home-trust"><TrustStrip cfg={cfg} /></div>,
    text: () => (cfg.text_title || cfg.text_body) ? (
      <Section title={cfg.text_title || undefined}><div class="px-text-block">{cfg.text_body}</div></Section>
    ) : null,
  };
  return (
    <div class="px-home">
      <div class="wrap">
        {sections.length === 0 && <p class="empty">এখনো কোনো পণ্য যোগ করা হয়নি।</p>}
        {homeOrder(cfg).map((k) => parts[k]?.())}
      </div>
    </div>
  );
};

/* ---------- ক্যাটাগরি / সার্চের পণ্য তালিকা ---------- */
export const ListingPage = ({ title, products, q, nav, activeId, cfg }: { title: string; products: Product[]; q?: string; nav: NavCat[]; activeId?: number; cfg: Cfg }) => (
  <div class="wrap px-listing">
    <nav class="px-crumbs"><a href="/">হোম</a> › <span>{title}</span></nav>
    <h1 class="page-title">{title} <small class="muted">({bn(products.length)}টা পণ্য)</small></h1>
    {q !== undefined && (
      <form action="/search" method="get" class={`px-search px-search-page ${on(cfg, "header_search") ? "dup" : ""}`} role="search">
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
      <div class="grid px-grid">{products.map((p) => <ProductCard p={p} cfg={cfg} />)}</div>
    )}
  </div>
);
