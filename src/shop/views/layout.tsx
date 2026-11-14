import type { Child } from "hono/jsx";
import type { Settings } from "../lib/settings";
import { bn, imageUrl } from "../lib/format";
import { themeCss, themeOf } from "../lib/settings";

export const ASSET_VERSION = "4";

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

export const Layout = (p: LayoutProps) => (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{p.title}</title>
      {p.description && <meta name="description" content={p.description} />}
      <meta property="og:title" content={p.title} />
      {p.description && <meta property="og:description" content={p.description} />}
      {p.ogImage && <meta property="og:image" content={p.ogImage} />}
      <meta name="theme-color" content={p.settings.brand_color || "#0f766e"} />
      <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
      {themeOf(p.settings) !== "classic" && <link rel="stylesheet" href={`/css/theme-${themeOf(p.settings)}.css?v=${ASSET_VERSION}`} />}
      <style dangerouslySetInnerHTML={{ __html: themeCss(p.settings) }} />
      <script src={`/js/device.js?v=${ASSET_VERSION}`}></script>
      {p.head}
    </head>
    <body class={`theme-${themeOf(p.settings)}`}>
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
          <p class="muted">ক্যাশ অন ডেলিভারি • পণ্য হাতে পেয়ে টাকা দিন</p>
        </div>
      </footer>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <script src={`/js/app.js?v=${ASSET_VERSION}`} defer></script>
      {p.bodyEnd}
    </body>
  </html>
);
