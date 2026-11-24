import type { Child } from "hono/jsx";
import type { Settings } from "../lib/settings";
import { bn, imageUrl } from "../lib/format";
import { GA4_RE, GTM_RE, themeCss, themeOf, TIKTOK_RE } from "../lib/settings";
import { MadeBy, StoreFloating, StoreFooter, StoreHeader, type NavCat } from "./pro";
import { cfgCss, cfgFontsHref, themeConfig } from "../lib/theme-config";

export const ASSET_VERSION = "78";

export type LayoutProps = {
  title: string;
  settings: Settings;
  cartCount?: number;
  description?: string;
  ogImage?: string;
  head?: Child;
  bodyEnd?: Child;
  children?: Child;
  /** প্রো থিম: ক্যাটাগরি মেনু */
  nav?: NavCat[];
  /** নিজের পেজের মেনু */
  pages?: { title: string; slug: string; href?: string }[];
  /** প্রো থিম: ল্যান্ডিং/চেকআউটে নিচের মেনু লুকানো (অর্ডার বাটনের জায়গা) */
  bare?: boolean;
  /** ল্যান্ডিং পেজে দোকানের হেডার লুকানো */
  hideHeader?: boolean;
  /** ল্যান্ডিং পেজে পুরো ফুটার লুকানো — ছোট কপিরাইট আর "SellxBD দিয়ে তৈরি" থাকে */
  hideFooter?: boolean;
  /** সার্চ বক্সে আগের লেখা */
  q?: string;
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
  const cfg = themeConfig(s);
  const fonts = cfgFontsHref(cfg);
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
      <link rel="stylesheet" href={`/css/designs.css?v=${ASSET_VERSION}`} />
      <style dangerouslySetInnerHTML={{ __html: themeCss(p.settings) + cfgCss(cfg) }} />
      {fonts && <><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" /><link rel="stylesheet" href={fonts} /></>}
      <script src={`/js/device.js?v=${ASSET_VERSION}`}></script>
      {p.head}
    </head>
    <body class={`theme-${themeOf(p.settings)}`} data-bare={p.bare ? "1" : undefined}>
      {gtm && <noscript><iframe src={`https://www.googletagmanager.com/ns.html?id=${gtm}`} height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>}
      {s.demo_mode === "1" && (
        <div class="demo-bar">
          <span>এটা একটা <b>ডেমো দোকান</b> — এখানে অর্ডার নেওয়া হয় না।</span>
          {s.demo_signup_url && <a href={s.demo_signup_url}>এই ডিজাইনে নিজের দোকান খুলুন →</a>}
        </div>
      )}
      {!p.hideHeader && <StoreHeader s={s} cfg={cfg} cartCount={p.cartCount ?? 0} nav={p.nav ?? []} q={p.q} pages={p.pages ?? []} />}
      <main>{p.children}</main>
      {p.hideFooter ? (
        <footer class="lp-mini-foot">
          <div class="lp-mini-copy">© {new Date().getFullYear()} {s.site_name || ""}। সর্বস্বত্ব সংরক্ষিত।</div>
          <MadeBy />
        </footer>
      ) : <StoreFooter s={s} cfg={cfg} nav={p.nav ?? []} pages={p.pages ?? []} />}
      <StoreFloating s={s} cfg={cfg} cartCount={p.cartCount ?? 0} bare={p.bare} />
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <script src={`/js/app.js?v=${ASSET_VERSION}`} defer></script>
      {p.bodyEnd}
    </body>
  </html>
  );
};
