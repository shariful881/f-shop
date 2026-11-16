/**
 * থিম লাইভ এডিটর — বাঁয়ে সেটিংসের ভাগ, মাঝে দোকানের আসল প্রিভিউ, ডানে সেটিং।
 * বদলালেই খসড়া সেভ হয়ে প্রিভিউ নতুন হয়; "পাবলিশ" চাপলে তবেই ক্রেতারা দেখে।
 */
import { GROUPS, type Cfg } from "../lib/theme-config";
import { THEMES, type ThemeKey } from "../lib/settings";
import { ASSET_VERSION } from "./layout";
import { CfgField } from "./admin-pro";
import { Icon, type IconName } from "./icons";
import { bn, dhakaTime } from "../lib/format";

/** তৈরি রঙের জোড়া — এক ক্লিকে হেডার, বাটন, দাম, ব্যাজ, ফুটারের রং */
export const COLOR_PRESETS: { name: string; c: Record<string, string> }[] = [
  { name: "টিল", c: { c_brand: "#0f766e", c_accent: "#ea580c", c_header_bg: "#0f766e", c_header_text: "#ffffff", c_btn: "#ea580c", c_btn_text: "#ffffff", c_price: "#0f766e", c_badge: "#dc2626", c_topbar_bg: "#134e4a", c_topbar_text: "#ffffff", c_footer_bg: "#0f172a", c_footer_text: "#e2e8f0" } },
  { name: "রাজকীয় বেগুনি", c: { c_brand: "#6d28d9", c_accent: "#db2777", c_header_bg: "#5b21b6", c_header_text: "#ffffff", c_btn: "#db2777", c_btn_text: "#ffffff", c_price: "#6d28d9", c_badge: "#db2777", c_topbar_bg: "#4c1d95", c_topbar_text: "#ffffff", c_footer_bg: "#1e1b4b", c_footer_text: "#e0e7ff" } },
  { name: "কালো-সোনালি", c: { c_brand: "#b45309", c_accent: "#d97706", c_header_bg: "#111827", c_header_text: "#fbbf24", c_btn: "#d97706", c_btn_text: "#111827", c_price: "#b45309", c_badge: "#111827", c_topbar_bg: "#000000", c_topbar_text: "#fbbf24", c_footer_bg: "#111827", c_footer_text: "#fde68a" } },
  { name: "গোলাপি (ফ্যাশন)", c: { c_brand: "#be185d", c_accent: "#db2777", c_header_bg: "#ffffff", c_header_text: "#be185d", c_btn: "#db2777", c_btn_text: "#ffffff", c_price: "#be185d", c_badge: "#be185d", c_topbar_bg: "#fce7f3", c_topbar_text: "#9d174d", c_footer_bg: "#500724", c_footer_text: "#fce7f3" } },
  { name: "সবুজ (প্রাকৃতিক)", c: { c_brand: "#15803d", c_accent: "#65a30d", c_header_bg: "#166534", c_header_text: "#ffffff", c_btn: "#65a30d", c_btn_text: "#ffffff", c_price: "#15803d", c_badge: "#ca8a04", c_topbar_bg: "#14532d", c_topbar_text: "#ecfccb", c_footer_bg: "#052e16", c_footer_text: "#dcfce7" } },
  { name: "নীল (গ্যাজেট)", c: { c_brand: "#1d4ed8", c_accent: "#2563eb", c_header_bg: "#1e3a8a", c_header_text: "#ffffff", c_btn: "#2563eb", c_btn_text: "#ffffff", c_price: "#1d4ed8", c_badge: "#f97316", c_topbar_bg: "#172554", c_topbar_text: "#bfdbfe", c_footer_bg: "#0f172a", c_footer_text: "#cbd5e1" } },
  { name: "লাল (অফার)", c: { c_brand: "#b91c1c", c_accent: "#dc2626", c_header_bg: "#b91c1c", c_header_text: "#ffffff", c_btn: "#facc15", c_btn_text: "#111827", c_price: "#b91c1c", c_badge: "#111827", c_topbar_bg: "#7f1d1d", c_topbar_text: "#fef9c3", c_footer_bg: "#1f2937", c_footer_text: "#f3f4f6" } },
  { name: "বাদামি (কাঠ, হস্তশিল্প)", c: { c_brand: "#92400e", c_accent: "#b45309", c_header_bg: "#78350f", c_header_text: "#fffbeb", c_btn: "#b45309", c_btn_text: "#ffffff", c_price: "#92400e", c_badge: "#166534", c_topbar_bg: "#451a03", c_topbar_text: "#fde68a", c_footer_bg: "#292524", c_footer_text: "#e7e5e4" } },
];

const Presets = () => (
  <div class="de-presets">
    <span class="de-presets-label">তৈরি রং — এক ক্লিকে</span>
    <div class="de-presets-row">
      {COLOR_PRESETS.map((p) => (
        <button type="button" data-preset={JSON.stringify(p.c)} title={p.name}>
          <span class="dp-sw"><i style={`background:${p.c.c_header_bg}`}></i><i style={`background:${p.c.c_btn}`}></i><i style={`background:${p.c.c_footer_bg}`}></i></span>
          <small>{p.name}</small>
        </button>
      ))}
      <button type="button" data-preset="{}" title="থিমের নিজের রং">
        <span class="dp-sw dp-reset">↺</span><small>থিমের নিজের রং</small>
      </button>
    </div>
  </div>
);

const GROUP_ICON: Record<string, IconName> = {
  style: "palette", header: "layout-template", home: "layout-dashboard", sections: "layout-template", popup: "megaphone",
  product: "package", card: "tag", footer: "file-text", float: "message-square", other: "sliders-horizontal",
};

export const DesignEditorPage = (p: { theme: ThemeKey; cfg: Cfg; products: { id: number; name: string }[]; categories: { id: number; name: string }[]; versions: string[]; hasDraft: boolean; shopName: string }) => (
  <html lang="bn">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>থিম এডিটর — {p.shopName}</title>
      <link rel="stylesheet" href={`/css/app.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/admin.css?v=${ASSET_VERSION}`} />
      <link rel="stylesheet" href={`/css/super.css?v=${ASSET_VERSION}`} />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" />
      <link rel="stylesheet" href={`/css/ui.css?v=${ASSET_VERSION}`} />
    </head>
    <body class="admin de" data-tab="settings">
      <header class="de-top">
        <a href="/admin" class="de-back" title="অ্যাডমিনে ফিরুন"><Icon name="arrow-left" /></a>
        <div class="de-title">
          <strong>থিম এডিটর</strong>
          <small>{THEMES[p.theme].name} থিম · <a href="/admin/settings/appearance">থিম বদলান</a></small>
        </div>
        <div class="de-devices" role="group" aria-label="প্রিভিউর মাপ">
          <button type="button" data-device="desktop" class="active" title="ডেস্কটপ">ডেস্কটপ</button>
          <button type="button" data-device="mobile" title="মোবাইল">মোবাইল</button>
        </div>
        <select class="de-page" aria-label="কোন পেজ দেখবেন">
          <option value="/">হোমপেজ</option>
          <option value="/search?q=">সব পণ্য</option>
          <option value="/cart">কার্ট</option>
        </select>
        <span class="de-status" data-status={p.hasDraft ? "draft" : "live"}>{p.hasDraft ? "খসড়া — ক্রেতারা এখনো দেখছে না" : "সব পাবলিশ করা"}</span>
        <div class="de-ver">
          <button type="button" class="btn btn-sm de-ver-btn" data-de-versions disabled={!p.versions.length} title="আগের পাবলিশ করা ডিজাইনে ফেরা">
            আগের সংস্করণ{p.versions.length ? ` (${bn(p.versions.length)})` : ""} ▾
          </button>
          <div class="de-ver-menu" hidden>
            <p class="muted small">যেকোনোটা খসড়ায় আনুন, প্রিভিউতে দেখে তারপর পাবলিশ করুন।</p>
            {p.versions.map((at, i) => (
              <button type="button" data-de-restore={String(i)}>
                <strong>{i === 0 ? "শেষ পাবলিশের আগের ডিজাইন" : `${bn(i + 1)} ধাপ আগের ডিজাইন`}</strong>
                <small>{dhakaTime(at.replace("T", " ").slice(0, 19))}</small>
              </button>
            ))}
          </div>
        </div>
        <button type="button" class="btn btn-sm de-discard" hidden={!p.hasDraft}>খসড়া বাতিল</button>
        <button type="button" class="btn btn-sm btn-primary de-publish" disabled={!p.hasDraft}>পাবলিশ</button>
      </header>

      <div class="de-body">
        <nav class="de-groups" aria-label="সেটিংসের ভাগ">
          {GROUPS.map((g, i) => (
            <button type="button" data-group={g.key} class={i === 0 ? "active" : ""}>
              <Icon name={GROUP_ICON[g.key] ?? "settings"} />
              <span><strong>{g.title}</strong><small>{g.desc}</small></span>
            </button>
          ))}
        </nav>

        <main class="de-stage">
          <div class="de-frame-wrap" data-device="desktop">
            <iframe id="de-frame" src="/?__preview=1" title="দোকানের প্রিভিউ"></iframe>
            <div class="de-loading" hidden>প্রিভিউ নতুন হচ্ছে…</div>
          </div>
        </main>

        <aside class="de-panel">
          <form id="de-form" enctype="multipart/form-data">
            {GROUPS.map((g, i) => (
              <section class="de-sec" data-sec={g.key} hidden={i !== 0}>
                <h2>{g.title}</h2>
                <p class="muted small">{g.desc}</p>
                {g.key === "style" && <Presets />}
                <div class="set-fields">{g.fields.map((f) => <CfgField f={f} cfg={p.cfg} products={p.products} categories={p.categories} />)}</div>
              </section>
            ))}
          </form>
          <p class="de-help muted small">বদলালেই প্রিভিউতে দেখাবে আর খসড়া নিজে থেকে সেভ হবে। ঠিক লাগলে উপরে <b>পাবলিশ</b> চাপুন।</p>
        </aside>
      </div>

      <nav class="de-mtabs">
        <button type="button" data-tab="groups">ভাগ</button>
        <button type="button" data-tab="settings" class="active">সেটিং</button>
        <button type="button" data-tab="preview">প্রিভিউ</button>
      </nav>

      <script src={`/js/admin.js?v=${ASSET_VERSION}`} defer></script>
      <script src={`/js/media.js?v=${ASSET_VERSION}`} defer></script>
      <script src={`/js/design.js?v=${ASSET_VERSION}`} defer></script>
    </body>
  </html>
);
