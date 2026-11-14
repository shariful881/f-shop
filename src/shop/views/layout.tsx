import type { Child } from "hono/jsx";
import type { Settings } from "../lib/settings";
import { bn, imageUrl } from "../lib/format";
import { GA4_RE, GTM_RE, themeCss, themeOf, TIKTOK_RE } from "../lib/settings";

export const ASSET_VERSION = "7";

export type LayoutProps = {
  title: string;
  settings: Settings;
  cartCount?: number;
  description?: string;
  ogImage?: string;
  head?: Child;
  bodyEnd?: Child;
  children?: Child;
};

/** Google Analytics 4, Google Tag Manager, TikTok Pixel — দোকানদার আইডি দিলে */
const trackingHead = (s: LayoutProps["settings"]) => {
  const ga = GA4_RE.test(s.ga4_id || "") ? s.ga4_id : "";
  const gtm = GTM_RE.test(s.gtm_id || "") ? s.gtm_id : "";
  const tt = TIKTOK_RE.test(s.tiktok_pixel_id || "") ? s.tiktok_pixel_id : "";
  let js = "";
  if (gtm) js += `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`;
  if (ga) js += `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga}');`;
  if (tt) js += `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${tt}');ttq.page();}(window,document,'ttq');`;
  return (
    <>
      {ga && <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}></script>}
      {js && <script dangerouslySetInnerHTML={{ __html: js }} />}
    </>
  );
};

export const Layout = (p: LayoutProps) => {
  const s = p.settings;
  const description = p.description || s.seo_description || undefined;
  const ogImage = p.ogImage || (s.seo_image ? imageUrl(s.seo_image) : undefined);
  const gtm = GTM_RE.test(s.gtm_id || "") ? s.gtm_id : "";
  return (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{p.title}</title>
      {description && <meta name="description" content={description} />}
      {s.seo_noindex === "1" && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={p.title} />
      <meta property="og:site_name" content={s.site_name || ""} />
      {description && <meta property="og:description" content={description} />}
      {ogImage && <meta property="og:image" content={ogImage} />}
      {s.favicon ? <link rel="icon" href={imageUrl(s.favicon)} /> : s.logo ? <link rel="icon" href={imageUrl(s.logo)} /> : null}
      <meta name="theme-color" content={p.settings.brand_color || "#0f766e"} />
      {trackingHead(s)}
      <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
      {themeOf(p.settings) !== "classic" && <link rel="stylesheet" href={`/css/theme-${themeOf(p.settings)}.css?v=${ASSET_VERSION}`} />}
      <style dangerouslySetInnerHTML={{ __html: themeCss(p.settings) }} />
      <script src={`/js/device.js?v=${ASSET_VERSION}`}></script>
      {p.head}
    </head>
    <body class={`theme-${themeOf(p.settings)}`}>
      {gtm && <noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${gtm}`} height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>}
      <header class="site-header">
        <div class="wrap header-inner">
          <a href="/" class="logo">
            {p.settings.logo ? <img src={imageUrl(p.settings.logo)} alt={p.settings.site_name || ""} class="logo-img" height="36" /> : (p.settings.site_name || "F-Shop")}
          </a>
          <a href="/cart" class="cart-link" aria-label="কার্ট">
            🛒 কার্ট <span class="cart-count" data-cart-count>{bn(p.cartCount ?? 0)}</span>
          </a>
        </div>
      </header>
      <main>{p.children}</main>
      <footer class="site-footer">
        <div class="wrap">
          <p>যেকোনো প্রয়োজনে কল করুন: <a href={`tel:${p.settings.contact_phone}`}>{bn(p.settings.contact_phone || "")}</a></p>
          {(s.whatsapp || s.facebook_page || s.store_email) && (
            <p class="footer-links">
              {s.whatsapp && <a href={`https://wa.me/88${s.whatsapp.replace(/\D/g, "").replace(/^88/, "")}`} target="_blank" rel="noopener">WhatsApp</a>}
              {s.facebook_page && /^https:\/\//.test(s.facebook_page) && <a href={s.facebook_page} target="_blank" rel="noopener">Facebook পেজ</a>}
              {s.store_email && <a href={`mailto:${s.store_email}`}>{s.store_email}</a>}
            </p>
          )}
          {s.store_address && <p class="muted">{s.store_address}</p>}
          <p class="muted">ক্যাশ অন ডেলিভারি • পণ্য হাতে পেয়ে টাকা দিন</p>
        </div>
      </footer>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <script src={`/js/app.js?v=${ASSET_VERSION}`} defer></script>
      {p.bodyEnd}
    </body>
  </html>
  );
};
