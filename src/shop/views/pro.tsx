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
import { bn, dhakaTime, imageUrl, taka } from "../lib/format";
import { AREA_LABEL, STATUS_LABEL, type Order, type OrderItem } from "../lib/orders";
import { ProductCard } from "./shop";

export type NavCat = { id: number; name: string };
export type NavPage = { title: string; slug: string };

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
  bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
  basket: "M3 10h18l-2 10H5zM8 10l4-6 4 6M9 14v3M15 14v3",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  leaf: "M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7",
  up: "M12 19V5M5 12l7-7 7 7",
  track: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 11h5",
};
export const Icon = ({ name, size = 22 }: { name: keyof typeof I; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={I[name]} />
  </svg>
);

const phoneHref = (s: Settings) => `tel:${(s.contact_phone || "").replace(/[^\d+]/g, "")}`;
export const waHref = (s: Settings) => (s.whatsapp ? `https://wa.me/88${s.whatsapp.replace(/\D/g, "").replace(/^88/, "")}` : "");
const on = (cfg: Cfg, k: string) => cfg[k] === "1";
const cartIco = (cfg: Cfg): keyof typeof I => (cfg.cart_icon === "bag" ? "bag" : cfg.cart_icon === "basket" ? "basket" : "cart");
const safeLink = (l?: string) => (l && /^(\/[^/]|https:\/\/)/.test(l) ? l : undefined);

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

const Drawer = ({ s, nav, cfg, pages = [] }: { s: Settings; nav: NavCat[]; cfg: Cfg; pages?: NavPage[] }) => (
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
      {on(cfg, "track_link") && <a href="/track">অর্ডার ট্র্যাক করুন</a>}
      {pages.map((pg) => <a href={`/page/${pg.slug}`}>{pg.title}</a>)}
      {s.contact_phone && <a href={phoneHref(s)}>📞 {bn(s.contact_phone)}</a>}
    </aside>
    <label for="px-drawer" class="px-scrim" aria-hidden="true"></label>
  </>
);

const NavRow = ({ nav, center, pages = [] }: { nav: NavCat[]; center?: boolean; pages?: NavPage[] }) => (
  <nav class="px-nav px-only-desktop" aria-label="ক্যাটাগরি">
    <div class={`wrap px-nav-in ${center ? "center" : ""}`}>
      <a href="/">হোম</a>
      {nav.map((c) => <a href={`/c/${c.id}`}>{c.name}</a>)}
      {pages.map((pg) => <a href={`/page/${pg.slug}`}>{pg.title}</a>)}
    </div>
  </nav>
);

/* ---------- হেডার (৪টা ডিজাইন, যেকোনো থিমে) ---------- */
export const StoreHeader = ({ s, cfg, cartCount, nav, q, pages = [] }: { s: Settings; cfg: Cfg; cartCount: number; nav: NavCat[]; q?: string; pages?: NavPage[] }) => {
  const menuPages = on(cfg, "header_pages") ? pages : [];
  const layout = cfg.header_layout || (themeOf(s) === "pro" ? "standard" : "colored");
  const showNav = (on(cfg, "header_nav") && nav.length > 0) || menuPages.length > 0;
  const navCats = on(cfg, "header_nav") ? nav : [];
  const search = on(cfg, "header_search");
  const logo = s.logo ? <img src={imageUrl(s.logo)} alt={s.site_name || ""} class="logo-img" height="40" /> : <span>{s.site_name || "দোকান"}</span>;
  const menuBtn = (showNav || search || on(cfg, "track_link")) && <label for="px-drawer" class="px-icon-btn px-only-mobile" aria-label="মেনু"><Icon name="menu" /></label>;
  const cart = (
    <a href="/cart" class="px-icon-btn px-cart" aria-label="কার্ট">
      <Icon name={cartIco(cfg)} /><span class="px-cart-count" data-cart-count>{bn(cartCount)}</span>
    </a>
  );
  const call = on(cfg, "header_call") && s.contact_phone && (
    <a href={phoneHref(s)} class="px-call px-only-desktop">
      <Icon name="phone" /><span><small>অর্ডার করতে কল করুন</small><b>{bn(s.contact_phone)}</b></span>
    </a>
  );
  const shell = (header: Child) => (
    <>
      <TopBar s={s} cfg={cfg} />
      <input type="checkbox" id="px-drawer" class="px-drawer-toggle" aria-hidden="true" />
      {header}
      <Drawer s={s} nav={navCats} cfg={cfg} pages={menuPages} />
    </>
  );

  if (layout === "colored") {
    return shell(
      <header class="site-header">
        <div class="wrap header-inner">
          {menuBtn}
          <a href="/" class="logo">{logo}</a>
          {search && <div class="px-only-desktop px-search-wrap"><SearchBox q={q} /></div>}
          {on(cfg, "header_call") && s.contact_phone && <a href={phoneHref(s)} class="px-call px-only-desktop"><Icon name="phone" size={18} /> {bn(s.contact_phone)}</a>}
          <a href="/cart" class="cart-link" aria-label="কার্ট">
            <Icon name={cartIco(cfg)} size={20} /> কার্ট <span class="cart-count" data-cart-count>{bn(cartCount)}</span>
          </a>
        </div>
        {search && <div class="wrap px-only-mobile px-search-mobile"><SearchBox q={q} /></div>}
        {showNav && <NavRow nav={navCats} pages={menuPages} />}
      </header>,
    );
  }

  if (layout === "inline") {
    return shell(
      <header class="px-header px-h-inline">
        <div class="wrap px-header-in">
          {menuBtn}
          <a href="/" class="px-logo">{logo}</a>
          {showNav && (
            <nav class="px-inline-nav px-only-desktop" aria-label="ক্যাটাগরি">
              <a href="/">হোম</a>
              {navCats.slice(0, 7).map((c) => <a href={`/c/${c.id}`}>{c.name}</a>)}
              {menuPages.map((pg) => <a href={`/page/${pg.slug}`}>{pg.title}</a>)}
            </nav>
          )}
          <div class="px-actions">
            {search && <a href="/search" class="px-icon-btn" aria-label="খুঁজুন"><Icon name="search" /></a>}
            {call}
            {cart}
          </div>
        </div>
      </header>,
    );
  }

  if (layout === "center") {
    return shell(
      <header class="px-header px-h-center">
        <div class="wrap px-header-in">
          <div class="px-h-side">
            {menuBtn}
            {search && <div class="px-only-desktop px-search-wrap"><SearchBox q={q} /></div>}
          </div>
          <a href="/" class="px-logo">{logo}</a>
          <div class="px-h-side px-h-right">{call}{cart}</div>
        </div>
        {search && <div class="wrap px-only-mobile px-search-mobile"><SearchBox q={q} /></div>}
        {showNav && <NavRow nav={navCats} pages={menuPages} center />}
      </header>,
    );
  }

  // standard: লোগো বাঁয়ে, বড় সার্চ
  return shell(
    <header class="px-header">
      <div class="wrap px-header-in">
        {menuBtn}
        <a href="/" class="px-logo">{logo}</a>
        {search && <div class="px-only-desktop px-search-wrap"><SearchBox q={q} /></div>}
        <div class="px-actions">{call}{cart}</div>
      </div>
      {search && <div class="wrap px-only-mobile px-search-mobile"><SearchBox q={q} /></div>}
      {showNav && <NavRow nav={navCats} pages={menuPages} />}
    </header>,
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
export const StoreFooter = ({ s, cfg, nav, pages = [] }: { s: Settings; cfg: Cfg; nav: NavCat[]; pages?: NavPage[] }) => {
  const flogo = cfg.footer_logo || s.logo;
  const payments = (cfg.footer_payments || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const payRow = payments.length > 0 && <p class="px-pay">{payments.map((x) => <span>{x}</span>)}</p>;
  const wa = waHref(s);
  const fb = s.facebook_page && /^https:\/\//.test(s.facebook_page) ? s.facebook_page : "";
  const socials = ([["Facebook", fb], ["Instagram", cfg.social_instagram], ["YouTube", cfg.social_youtube], ["TikTok", cfg.social_tiktok]] as const).filter(([, u]) => u);
  const trust = on(cfg, "footer_trust") && <TrustStrip cfg={cfg} />;

  const track = on(cfg, "track_link");
  if (cfg.footer_style === "center") {
    return (
      <>
        {trust}
        <footer class="px-footer px-footer-center">
          <div class="wrap">
            <a href="/" class="px-footer-logo">{flogo ? <img src={imageUrl(flogo)} alt={s.site_name || ""} height="40" /> : s.site_name}</a>
            {(cfg.footer_about || s.seo_description) && <p class="px-fc-about">{cfg.footer_about || s.seo_description}</p>}
            <nav class="px-fc-links">
              <a href="/">হোম</a>
              {nav.slice(0, 6).map((c) => <a href={`/c/${c.id}`}>{c.name}</a>)}
              <a href="/cart">কার্ট</a>
              {track && <a href="/track">অর্ডার ট্র্যাক</a>}
              {pages.map((pg) => <a href={`/page/${pg.slug}`}>{pg.title}</a>)}
            </nav>
            <p class="px-fc-contact">
              {s.contact_phone && <a href={phoneHref(s)}>📞 {bn(s.contact_phone)}</a>}
              {wa && <a href={wa} target="_blank" rel="noopener">💬 WhatsApp</a>}
              {s.store_email && <a href={`mailto:${s.store_email}`}>✉️ {s.store_email}</a>}
            </p>
            {s.store_address && <p class="px-fc-addr">📍 {s.store_address}</p>}
            {socials.length > 0 && <p class="px-socials center">{socials.map(([n, u]) => <a href={u} target="_blank" rel="noopener">{n}</a>)}</p>}
            {payRow}
          </div>
          <div class="px-copy"><div class="wrap">{cfg.footer_copy || `© ${s.site_name || ""} · ক্যাশ অন ডেলিভারি · সারাদেশে হোম ডেলিভারি`}</div></div>
        </footer>
      </>
    );
  }

  if (cfg.footer_style !== "full") {
    return (
      <>
        {trust}
        <footer class="site-footer">
          <div class="wrap">
            {s.contact_phone && <p>যেকোনো প্রয়োজনে কল করুন: <a href={phoneHref(s)}>{bn(s.contact_phone)}</a></p>}
            {(wa || s.store_email || socials.length > 0) && (
              <p class="footer-links">
                {track && <a href="/track">অর্ডার ট্র্যাক</a>}
                {wa && <a href={wa} target="_blank" rel="noopener">WhatsApp</a>}
                {socials.map(([n, u]) => <a href={u} target="_blank" rel="noopener">{n === "Facebook" ? "Facebook পেজ" : n}</a>)}
                {s.store_email && <a href={`mailto:${s.store_email}`}>{s.store_email}</a>}
              </p>
            )}
            {s.store_address && <p class="muted">{s.store_address}</p>}
            {pages.length > 0 && <p class="footer-links">{pages.map((pg) => <a href={`/page/${pg.slug}`}>{pg.title}</a>)}</p>}
            {payRow}
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
            <a href="/" class="px-footer-logo">{flogo ? <img src={imageUrl(flogo)} alt={s.site_name || ""} height="40" /> : s.site_name}</a>
            {(cfg.footer_about || s.seo_description) && <p>{cfg.footer_about || s.seo_description}</p>}
            {socials.length > 0 && <p class="px-socials">{socials.map(([n, u]) => <a href={u} target="_blank" rel="noopener">{n}</a>)}</p>}
            {payRow}
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
              {track && <li><a href="/track">অর্ডার ট্র্যাক করুন</a></li>}
              {pages.map((pg) => <li><a href={`/page/${pg.slug}`}>{pg.title}</a></li>)}
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
      {on(cfg, "side_cart") && (
        <div class="px-side-cart" data-side-cart hidden>
          <aside class="px-side-box" aria-label="কার্ট">
            <div class="px-side-head"><b><Icon name={cartIco(cfg)} /> আপনার কার্ট (<span data-side-count>{bn(cartCount)}</span>)</b><button type="button" data-side-close aria-label="বন্ধ করুন"><Icon name="close" /></button></div>
            <p data-side-msg class="px-side-msg"></p>
            <a href="/checkout" class="btn btn-primary btn-block btn-lg">চেকআউট করুন</a>
            <a href="/cart" class="btn btn-outline btn-block">কার্ট দেখুন</a>
            <button type="button" class="btn-link" data-side-close>কেনাকাটা চালিয়ে যান</button>
          </aside>
        </div>
      )}
      {on(cfg, "back_top") && <a href="#" class={`px-top ${nav ? "" : "low"}`} aria-label="উপরে যান" data-back-top hidden><Icon name="up" size={20} /></a>}
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
          <a href="/cart" class="px-bottom-cart"><Icon name={cartIco(cfg)} /><span>কার্ট</span><i data-cart-count>{bn(cartCount)}</i></a>
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

export const StoreHome = ({ s, cfg, sections, picked, latest }: { s: Settings; cfg: Cfg; sections: HomeSection[]; picked: Map<number, Product>; latest: Product[] }) => {
  const offer = (n: number) => () => {
    const list = (cfg[`offer${n}_products`] || "").split(",").map((x) => picked.get(parseInt(x, 10))).filter((p): p is Product => !!p);
    return list.length ? <Section title={cfg[`offer${n}_title`]}><div class="grid px-grid">{list.map((p) => <ProductCard p={p} cfg={cfg} />)}</div></Section> : null;
  };
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
    // ফুটারের উপরে একই ব্যাজ চালু থাকলে হোমে আবার দেখায় না (দুবার আসত)
    trust: () => on(cfg, "footer_trust") ? null : <div class="px-home-trust"><TrustStrip cfg={cfg} /></div>,
    offer1: offer(1), offer2: offer(2), offer3: offer(3),
    latest: () => latest.length ? (
      <Section title={cfg.latest_title}><div class="grid px-grid">{latest.map((p) => <ProductCard p={p} cfg={cfg} />)}</div></Section>
    ) : null,
    midbanner: () => {
      if (!cfg.mid_banner) return null;
      const img = <img src={imageUrl(cfg.mid_banner)} alt="" loading="lazy" width="1200" height="300" />;
      const href = safeLink(cfg.mid_banner_link);
      return <div class="px-midbanner">{href ? <a href={href}>{img}</a> : img}</div>;
    },
    video: () => {
      const m = /(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/.exec(cfg.video_url || "");
      if (!m) return null;
      return (
        <Section title={cfg.video_title || undefined}>
          <div class="video" data-yt={m[1]}>
            <button type="button" class="video-thumb" aria-label="ভিডিও চালান">
              <img src={`https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`} alt="ভিডিও" loading="lazy" width="480" height="360" />
              <span class="play">▶</span>
            </button>
          </div>
        </Section>
      );
    },
    features: () => {
      const items = [1, 2, 3].map((n) => ({ t: cfg[`feature_${n}`], sub: cfg[`feature_${n}_sub`], icon: (cfg[`feature_${n}_icon`] || "star") as keyof typeof I })).filter((x) => x.t);
      return items.length ? (
        <div class="px-features">
          {items.map((x) => <div class="px-feature"><Icon name={x.icon in I ? x.icon : "star"} size={26} /><span><b>{x.t}</b>{x.sub && <small>{x.sub}</small>}</span></div>)}
        </div>
      ) : null;
    },
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
      {on(cfg, "popup_on") && cfg.popup_image && (
        <div class="px-popup" data-popup data-delay={cfg.popup_delay || "3"} data-key={cfg.popup_image} hidden>
          <div class="px-popup-box">
            <button type="button" class="px-popup-x" aria-label="বন্ধ করুন" data-popup-close><Icon name="close" /></button>
            {safeLink(cfg.popup_link)
              ? <a href={safeLink(cfg.popup_link)}><img src={imageUrl(cfg.popup_image)} alt="অফার" width="800" height="800" loading="lazy" /></a>
              : <img src={imageUrl(cfg.popup_image)} alt="অফার" width="800" height="800" loading="lazy" />}
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- ক্যাটাগরি / সার্চের পণ্য তালিকা ---------- */
export const SORTS: Record<string, string> = { "": "ডিফল্ট", new: "নতুন আগে", price_asc: "দাম: কম থেকে বেশি", price_desc: "দাম: বেশি থেকে কম", name: "নাম অনুযায়ী" };

export type ListParams = { per: number; min: number; max: number; pageNo: number };
export const ListingPage = ({ title, products, q, nav, activeId, cfg, sort = "", total, lp }: { title: string; products: Product[]; q?: string; nav: NavCat[]; activeId?: number; cfg: Cfg; sort?: string; total?: number; lp?: ListParams }) => {
  const count = total ?? products.length;
  const pages = lp ? Math.max(1, Math.ceil(count / lp.per)) : 1;
  const qs = (pg: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (sort) u.set("sort", sort);
    if (lp?.min) u.set("min", String(lp.min));
    if (lp?.max) u.set("max", String(lp.max));
    if (pg > 1) u.set("page", String(pg));
    const t = u.toString();
    return t ? `?${t}` : "?";
  };
  return (
  <div class="wrap px-listing">
    {on(cfg, "breadcrumbs") && <nav class="px-crumbs"><a href="/">হোম</a> › <span>{title}</span></nav>}
    <div class="px-list-head">
      <h1 class="page-title">{title} <small class="muted">({bn(count)}টা পণ্য)</small></h1>
      {(on(cfg, "list_sort") || on(cfg, "list_filter")) && (count > 1 || lp?.min || lp?.max) && (
        <form method="get" class="px-sort">
          {q !== undefined && <input type="hidden" name="q" value={q} />}
          {on(cfg, "list_filter") && (
            <span class="px-price-filter">
              <input type="number" name="min" min="0" value={lp?.min ? String(lp.min) : ""} placeholder="৳ সর্বনিম্ন" aria-label="সর্বনিম্ন দাম" />
              <span>–</span>
              <input type="number" name="max" min="0" value={lp?.max ? String(lp.max) : ""} placeholder="৳ সর্বোচ্চ" aria-label="সর্বোচ্চ দাম" />
              <button class="btn btn-outline">ফিল্টার</button>
            </span>
          )}
          {on(cfg, "list_sort") && (
            <label>সাজান:{" "}
              <select name="sort" data-autosubmit>{Object.entries(SORTS).map(([k, l]) => <option value={k} selected={k === sort}>{l}</option>)}</select>
            </label>
          )}
        </form>
      )}
    </div>
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
    {lp && pages > 1 && (
      <nav class="px-pager" aria-label="পাতা">
        {lp.pageNo > 1 && <a href={qs(lp.pageNo - 1)}>← আগের</a>}
        {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => Math.abs(n - lp.pageNo) <= 2 || n === 1 || n === pages).map((n) =>
          n === lp.pageNo ? <span class="on">{bn(n)}</span> : <a href={qs(n)}>{bn(n)}</a>)}
        {lp.pageNo < pages && <a href={qs(lp.pageNo + 1)}>পরের →</a>}
      </nav>
    )}
  </div>
  );
};

/* ---------- দোকান সাময়িক বন্ধ ---------- */
export const ComingSoonPage = ({ s, cfg }: { s: Settings; cfg: Cfg }) => (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{s.site_name || "দোকান"} — শীঘ্রই আসছে</title>
      <link rel="stylesheet" href="/css/app.css" />
    </head>
    <body class="px-soon">
      <main class="px-soon-box">
        {s.logo ? <img src={imageUrl(s.logo)} alt={s.site_name || ""} height="64" /> : <h1>{s.site_name}</h1>}
        <p>{cfg.coming_soon_text}</p>
        {s.contact_phone && <a href={phoneHref(s)} class="btn btn-primary">📞 {bn(s.contact_phone)}</a>}
      </main>
    </body>
  </html>
);

/* ---------- অর্ডার ট্র্যাকিং ---------- */
const STEPS = ["new", "confirmed", "shipped"] as const;
export const TrackPage = ({ s, order, error, values }: { s: Settings; order: { order: Order; items: OrderItem[] } | null; error: string; values: { order: string; phone: string } }) => {
  const st = order?.order.status;
  const idx = st ? STEPS.indexOf(st as (typeof STEPS)[number]) : -1;
  return (
    <div class="wrap narrow px-track">
      <h1 class="page-title">অর্ডার ট্র্যাক করুন</h1>
      <form method="get" action="/track" class="px-track-form">
        <label class="field"><span>অর্ডার নম্বর</span><input type="text" name="order" value={values.order} placeholder="যেমন FS-1001" required maxlength={30} /></label>
        <label class="field"><span>যে মোবাইল নম্বরে অর্ডার করেছেন</span><input type="tel" name="phone" value={values.phone} placeholder="01XXXXXXXXX" required inputmode="tel" /></label>
        <button class="btn btn-primary btn-block">খুঁজুন</button>
      </form>
      {error && <div class="alert alert-error">{error}</div>}
      {order && (
        <div class="px-track-result">
          <p>অর্ডার <b>{order.order.order_no}</b> · {dhakaTime(order.order.created_at)}</p>
          {st === "cancelled" || st === "fake" ? (
            <div class="alert alert-error">এই অর্ডারটি বাতিল হয়েছে। প্রশ্ন থাকলে কল করুন: {bn(s.contact_phone || "")}</div>
          ) : (
            <ol class="px-steps">
              {STEPS.map((k, i) => <li class={i <= idx ? "done" : ""}><span>{bn(i + 1)}</span>{STATUS_LABEL[k]}</li>)}
            </ol>
          )}
          <div class="summary">
            {order.items.map((i) => <div><span>{i.product_name}{i.variant_label ? ` (${i.variant_label})` : ""}{(i.qty || 1) > 1 ? ` × ${bn(i.qty)}` : ""}</span><span>{taka(i.price * (i.qty || 1))}</span></div>)}
            <div><span>ডেলিভারি ({AREA_LABEL[order.order.area]})</span><span>{taka(order.order.delivery_charge)}</span></div>
            <div class="summary-total"><span>মোট</span><span>{taka(order.order.total)}</span></div>
          </div>
          <a href={`/track/invoice?order=${encodeURIComponent(values.order)}&phone=${encodeURIComponent(values.phone)}`} target="_blank" class="btn btn-outline btn-block">🧾 ইনভয়েস দেখুন / ডাউনলোড</a>
        </div>
      )}
    </div>
  );
};
