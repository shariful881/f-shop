/**
 * থিম লাইভ এডিটর — বাঁয়ে সেটিংসের ভাগ, মাঝে দোকানের আসল প্রিভিউ, ডানে সেটিং।
 * বদলালেই খসড়া সেভ হয়ে প্রিভিউ নতুন হয়; "পাবলিশ" চাপলে তবেই ক্রেতারা দেখে।
 */
import { GROUPS, type Cfg } from "../lib/theme-config";
import { THEMES, type ThemeKey } from "../lib/settings";
import { ASSET_VERSION } from "./layout";
import { CfgField } from "./admin-pro";
import { Icon, type IconName } from "./icons";

const GROUP_ICON: Record<string, IconName> = {
  style: "palette", header: "layout-template", home: "layout-dashboard", sections: "layout-template", popup: "megaphone",
  product: "package", card: "tag", footer: "file-text", float: "message-square", other: "sliders-horizontal",
};

export const DesignEditorPage = (p: { theme: ThemeKey; cfg: Cfg; products: { id: number; name: string }[]; hasDraft: boolean; shopName: string }) => (
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
          <form id="de-form" enctype="multipart/form-data" onsubmit="return false">
            {GROUPS.map((g, i) => (
              <section class="de-sec" data-sec={g.key} hidden={i !== 0}>
                <h2>{g.title}</h2>
                <p class="muted small">{g.desc}</p>
                <div class="set-fields">{g.fields.map((f) => <CfgField f={f} cfg={p.cfg} products={p.products} />)}</div>
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
