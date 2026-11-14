/**
 * থিম কাস্টমাইজ — প্রতিটা থিমের নিজস্ব আলাদা সেটিংস (settings টেবিলে theme_cfg_<থিম>)।
 * দোকানদার কোড ছাড়া রং, ফন্ট, হেডার, হোমপেজ, কার্ড, ফুটার, ভাসমান বাটন বদলাতে পারে।
 * সব মান সার্ভারে যাচাই হয়; CSS-এ শুধু যাচাই করা মান বসে।
 */
import { FONTS } from "./landing";
import { themeOf, type Settings, type ThemeKey } from "./settings";

export type Cfg = Record<string, string>;

type Opt = Record<string, string>;
export type Field =
  | { key: string; type: "color"; label: string; hint?: string }
  | { key: string; type: "select"; label: string; options: Opt; hint?: string }
  | { key: string; type: "toggle"; label: string; hint?: string }
  | { key: string; type: "text"; label: string; max: number; placeholder?: string; hint?: string; wide?: boolean }
  | { key: string; type: "textarea"; label: string; max: number; hint?: string }
  | { key: string; type: "url"; label: string; placeholder?: string; hint?: string }
  | { key: string; type: "order"; label: string; hint?: string };

export const HOME_SECTIONS: Record<string, string> = {
  banner: "ব্যানার স্লাইডার",
  categories: "ক্যাটাগরি টাইল",
  offers: "অফার চলছে",
  products: "ক্যাটাগরি অনুযায়ী পণ্য",
  trust: "বিশ্বাসের ব্যাজ",
  text: "নিজের লেখা (শিরোনাম + বিবরণ)",
};

const fontOpts: Opt = { "": "থিমের ডিফল্ট", ...Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, v.label])) };

export const GROUPS: { key: string; title: string; desc: string; fields: Field[] }[] = [
  {
    key: "style", title: "রং, ফন্ট আর বাটন", desc: "রং না বাছলে থিমের নিজের রং থাকে (মূল রং আর বাটনের রং \"থিম ও লোগো\" ট্যাবে)।",
    fields: [
      { key: "c_bg", type: "color", label: "পেজের ব্যাকগ্রাউন্ড" },
      { key: "c_header_bg", type: "color", label: "হেডারের ব্যাকগ্রাউন্ড" },
      { key: "c_header_text", type: "color", label: "হেডারের লেখা" },
      { key: "c_topbar_bg", type: "color", label: "ঘোষণা বারের ব্যাকগ্রাউন্ড" },
      { key: "c_topbar_text", type: "color", label: "ঘোষণা বারের লেখা" },
      { key: "c_btn", type: "color", label: "অর্ডার বাটনের রং" },
      { key: "c_btn_text", type: "color", label: "অর্ডার বাটনের লেখা" },
      { key: "c_price", type: "color", label: "দামের রং" },
      { key: "c_badge", type: "color", label: "ছাড়ের ব্যাজের রং" },
      { key: "c_footer_bg", type: "color", label: "ফুটারের ব্যাকগ্রাউন্ড" },
      { key: "c_footer_text", type: "color", label: "ফুটারের লেখা" },
      { key: "font_body", type: "select", label: "লেখার ফন্ট", options: fontOpts },
      { key: "font_heading", type: "select", label: "শিরোনামের ফন্ট", options: fontOpts },
      { key: "font_size", type: "select", label: "লেখার সাইজ", options: { sm: "ছোট", md: "মাঝারি", lg: "বড়" } },
      { key: "btn_shape", type: "select", label: "বাটনের আকার", options: { square: "চারকোনা", rounded: "একটু গোল কোনা", pill: "পুরো গোল" } },
      { key: "radius", type: "select", label: "কার্ড আর ছবির কোনা", options: { none: "চারকোনা", sm: "একটু গোল", lg: "বেশি গোল" } },
      { key: "card_style", type: "select", label: "কার্ডের ধরন", options: { border: "বর্ডার", shadow: "ছায়া", flat: "সাদামাটা" } },
    ],
  },
  {
    key: "header", title: "হেডার, মেনু আর ঘোষণা বার", desc: "দোকানের একদম উপরের অংশ।",
    fields: [
      { key: "topbar", type: "toggle", label: "উপরে ঘোষণা বার দেখাবে" },
      { key: "announcement", type: "text", label: "ঘোষণার লেখা", max: 120, wide: true, placeholder: "যেমন: ঈদ অফার — সব পণ্যে ১০% ছাড়!", hint: "ফাঁকা রাখলে ফ্রি ডেলিভারি বা ক্যাশ অন ডেলিভারির কথা দেখাবে" },
      { key: "topbar_hotline", type: "toggle", label: "ঘোষণা বারে হটলাইন নম্বর" },
      { key: "header_search", type: "toggle", label: "পণ্য খোঁজার বক্স" },
      { key: "header_nav", type: "toggle", label: "ক্যাটাগরি মেনু (মোবাইলে ☰ মেনু)" },
      { key: "header_call", type: "toggle", label: "হেডারে \"কল করুন\" নম্বর (কম্পিউটারে)" },
      { key: "header_sticky", type: "toggle", label: "স্ক্রল করলেও হেডার উপরে থাকবে" },
      { key: "logo_size", type: "select", label: "লোগোর সাইজ", options: { sm: "ছোট", md: "মাঝারি", lg: "বড়" } },
    ],
  },
  {
    key: "home", title: "হোমপেজ", desc: "কোন সেকশন দেখাবে, কোন ক্রমে, আর এক সারিতে কয়টা পণ্য।",
    fields: [
      { key: "home_order", type: "order", label: "সেকশন সাজানো", hint: "টিক দেওয়াগুলো দেখাবে। ↑↓ দিয়ে ক্রম বদলান। ব্যানারের ছবি \"থিম ও লোগো\" ট্যাবে দিন।" },
      { key: "title_categories", type: "text", label: "ক্যাটাগরি সেকশনের শিরোনাম", max: 60 },
      { key: "cat_style", type: "select", label: "ক্যাটাগরি টাইলের আকার", options: { circle: "গোল", square: "চারকোনা" } },
      { key: "title_offers", type: "text", label: "অফার সেকশনের শিরোনাম", max: 60 },
      { key: "per_row_mobile", type: "select", label: "মোবাইলে এক সারিতে পণ্য", options: { "1": "১টা", "2": "২টা" } },
      { key: "per_row_desktop", type: "select", label: "কম্পিউটারে এক সারিতে পণ্য", options: { "3": "৩টা", "4": "৪টা", "5": "৫টা" } },
      { key: "per_section", type: "select", label: "প্রতি ক্যাটাগরিতে কয়টা পণ্য দেখাবে", options: { "4": "৪টা", "8": "৮টা", "12": "১২টা", "0": "সব" } },
      { key: "show_more", type: "toggle", label: "\"সব দেখুন\" লিংক" },
      { key: "text_title", type: "text", label: "নিজের লেখার শিরোনাম", max: 100, placeholder: "যেমন: আমাদের সম্পর্কে" },
      { key: "text_body", type: "textarea", label: "নিজের লেখার বিবরণ", max: 1000 },
    ],
  },
  {
    key: "card", title: "পণ্যের কার্ড", desc: "হোম, ক্যাটাগরি আর সার্চ পেজের পণ্যের বক্স।",
    fields: [
      { key: "card_order_btn", type: "toggle", label: "\"অর্ডার করুন\" বাটন" },
      { key: "card_order_text", type: "text", label: "অর্ডার বাটনের লেখা", max: 30 },
      { key: "card_cart_btn", type: "toggle", label: "\"কার্টে যোগ\" বাটন" },
      { key: "card_cart_text", type: "text", label: "কার্ট বাটনের লেখা", max: 30 },
      { key: "img_fit", type: "select", label: "ছবি কীভাবে বসবে", options: { cover: "পুরো বক্স ভরে (কিছুটা কাটা যেতে পারে)", contain: "পুরো ছবি দেখাবে" } },
      { key: "badge_fmt", type: "select", label: "ছাড়ের ব্যাজ", options: { pct: "২৪% ছাড়", minus: "-২৪%", off: "দেখাবে না" } },
    ],
  },
  {
    key: "footer", title: "ফুটার আর বিশ্বাসের ব্যাজ", desc: "পেজের একদম নিচের অংশ।",
    fields: [
      { key: "footer_style", type: "select", label: "ফুটারের ধরন", options: { simple: "সাধারণ (এক লাইনে যোগাযোগ)", full: "বড় (৪ কলাম)" } },
      { key: "footer_trust", type: "toggle", label: "ফুটারের উপরে বিশ্বাসের ব্যাজ" },
      { key: "footer_about", type: "textarea", label: "দোকান সম্পর্কে ছোট লেখা", max: 300, hint: "ফাঁকা রাখলে SEO ডেসক্রিপশন দেখাবে" },
      { key: "trust_1", type: "text", label: "ব্যাজ ১", max: 40 }, { key: "trust_1_sub", type: "text", label: "ব্যাজ ১-এর নিচের লেখা", max: 60 },
      { key: "trust_2", type: "text", label: "ব্যাজ ২", max: 40 }, { key: "trust_2_sub", type: "text", label: "ব্যাজ ২-এর নিচের লেখা", max: 60 },
      { key: "trust_3", type: "text", label: "ব্যাজ ৩", max: 40 }, { key: "trust_3_sub", type: "text", label: "ব্যাজ ৩-এর নিচের লেখা", max: 60 },
      { key: "trust_4", type: "text", label: "ব্যাজ ৪", max: 40 }, { key: "trust_4_sub", type: "text", label: "ব্যাজ ৪-এর নিচের লেখা", max: 60 },
      { key: "social_instagram", type: "url", label: "Instagram লিংক", placeholder: "https://instagram.com/..." },
      { key: "social_youtube", type: "url", label: "YouTube লিংক", placeholder: "https://youtube.com/..." },
      { key: "social_tiktok", type: "url", label: "TikTok লিংক", placeholder: "https://tiktok.com/@..." },
      { key: "footer_copy", type: "text", label: "একদম নিচের লেখা (কপিরাইট)", max: 120, wide: true },
    ],
  },
  {
    key: "float", title: "ভাসমান বাটন আর মোবাইলের নিচের মেনু", desc: "স্ক্রিনের কোনায় সবসময় দেখা যায় এমন বাটন।",
    fields: [
      { key: "float_whatsapp", type: "toggle", label: "WhatsApp বাটন", hint: "\"দোকানের তথ্য\" ট্যাবে WhatsApp নম্বর লাগবে" },
      { key: "float_call", type: "toggle", label: "কল বাটন" },
      { key: "float_messenger", type: "url", label: "Messenger লিংক (দিলে বাটন দেখাবে)", placeholder: "https://m.me/yourpage" },
      { key: "bottom_nav", type: "toggle", label: "মোবাইলে নিচের মেনু (হোম, ক্যাটাগরি, কার্ট, কল)" },
    ],
  },
];

const TRUST_DEFAULTS: Cfg = {
  trust_1: "ক্যাশ অন ডেলিভারি", trust_1_sub: "পণ্য হাতে পেয়ে টাকা দিন",
  trust_2: "সারাদেশে ডেলিভারি", trust_2_sub: "দ্রুত হোম ডেলিভারি",
  trust_3: "১০০% অরিজিনাল", trust_3_sub: "মান যাচাই করা পণ্য",
  trust_4: "সহজ রিটার্ন", trust_4_sub: "ডেলিভারির সময় দেখে নিন",
};

const BASE: Cfg = {
  font_body: "", font_heading: "", font_size: "md", btn_shape: "rounded", radius: "sm", card_style: "border",
  topbar: "0", announcement: "", topbar_hotline: "1", header_search: "0", header_nav: "0", header_call: "0", header_sticky: "1", logo_size: "md",
  home_order: "banner,categories,offers,products,trust,text", sec_banner: "1", sec_categories: "0", sec_offers: "0", sec_products: "1", sec_trust: "0", sec_text: "0",
  title_categories: "ক্যাটাগরি", cat_style: "circle", title_offers: "🔥 অফার চলছে",
  per_row_mobile: "2", per_row_desktop: "4", per_section: "0", show_more: "1", text_title: "", text_body: "",
  card_order_btn: "1", card_order_text: "অর্ডার করুন", card_cart_btn: "1", card_cart_text: "কার্টে যোগ", img_fit: "cover", badge_fmt: "pct",
  footer_style: "simple", footer_trust: "0", footer_about: "", social_instagram: "", social_youtube: "", social_tiktok: "", footer_copy: "",
  float_whatsapp: "0", float_call: "0", float_messenger: "", bottom_nav: "0",
  ...TRUST_DEFAULTS,
};

/** প্রতিটা থিমের শুরুর সেটিংস */
export const THEME_DEFAULTS: Record<ThemeKey, Cfg> = {
  pro: {
    ...BASE, btn_shape: "pill", radius: "lg", card_style: "shadow",
    topbar: "1", header_search: "1", header_nav: "1", header_call: "1",
    sec_categories: "1", sec_offers: "1", per_section: "8", img_fit: "contain", badge_fmt: "minus",
    footer_style: "full", footer_trust: "1", float_whatsapp: "1", bottom_nav: "1",
  },
  classic: { ...BASE },
  minimal: { ...BASE, btn_shape: "square", radius: "none", card_style: "flat" },
  bold: { ...BASE, btn_shape: "rounded", radius: "lg", card_style: "shadow", topbar: "1", float_whatsapp: "1" },
};

const HEX = /^#[0-9a-f]{6}$/i;
const URL_RE = /^https:\/\/[^\s"'<>]+$/;

/** এক থিমের সেটিংস (ডিফল্ট + সেভ করা, যাচাই করে) */
export function themeConfig(s: Settings, theme: ThemeKey = themeOf(s)): Cfg {
  const def = THEME_DEFAULTS[theme];
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(s[`theme_cfg_${theme}`] || "{}"); } catch { /* ভাঙা JSON */ }
  const cfg = clean({ ...def, ...(saved && typeof saved === "object" ? saved : {}) }, def);
  // পুরনো "ঘোষণা" সেটিং (থিম কাস্টমাইজের আগে)
  if (!cfg.announcement && s.announcement) cfg.announcement = s.announcement;
  return cfg;
}

/** যেকোনো ইনপুট → শুধু বৈধ মান (ভুল হলে ডিফল্ট) */
function clean(input: Record<string, unknown>, def: Cfg): Cfg {
  const out: Cfg = {};
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  for (const g of GROUPS) for (const f of g.fields) {
    const v = str(f.key).trim();
    switch (f.type) {
      case "color": out[f.key] = HEX.test(v) ? v.toLowerCase() : ""; break;
      case "select": out[f.key] = v in f.options ? v : def[f.key] ?? ""; break;
      case "toggle": out[f.key] = v === "1" ? "1" : "0"; break;
      case "text": case "textarea": out[f.key] = v.slice(0, f.max); break;
      case "url": out[f.key] = URL_RE.test(v) && v.length <= 200 ? v : ""; break;
      case "order": {
        const keys = v.split(",").filter((k) => k in HOME_SECTIONS);
        const all = [...new Set([...keys, ...Object.keys(HOME_SECTIONS)])];
        out.home_order = all.join(",");
        for (const k of Object.keys(HOME_SECTIONS)) out[`sec_${k}`] = str(`sec_${k}`) === "1" ? "1" : "0";
        break;
      }
    }
  }
  return out;
}

/** সেটিংস ফর্ম থেকে (চেকবক্স না এলে বন্ধ) */
export function cfgFromForm(body: Record<string, unknown>, theme: ThemeKey): Cfg {
  const input: Record<string, unknown> = {};
  for (const g of GROUPS) for (const f of g.fields) {
    if (f.type === "toggle") input[f.key] = body[f.key] ? "1" : "0";
    else if (f.type === "color") input[f.key] = body[`${f.key}_on`] ? body[f.key] : "";
    else if (f.type === "order") {
      input.home_order = body.home_order;
      for (const k of Object.keys(HOME_SECTIONS)) input[`sec_${k}`] = body[`sec_${k}`] ? "1" : "0";
    } else input[f.key] = body[f.key];
  }
  return clean(input, THEME_DEFAULTS[theme]);
}

/** শুধু ডিফল্ট থেকে আলাদা মানগুলো সেভ হয় (পরে ডিফল্ট বদলালে বাকিগুলো নতুনটা পায়) */
export function cfgDiff(cfg: Cfg, theme: ThemeKey): Cfg {
  const def = THEME_DEFAULTS[theme];
  return Object.fromEntries(Object.entries(cfg).filter(([k, v]) => def[k] !== v));
}

export const homeOrder = (cfg: Cfg) => cfg.home_order!.split(",").filter((k) => cfg[`sec_${k}`] === "1");

/** সেটিংস থেকে CSS (শুধু যাচাই করা মান) */
export function cfgCss(cfg: Cfg): string {
  const r: string[] = [];
  const c = (k: string) => cfg[k];
  if (c("c_bg")) r.push(`body{background:${c("c_bg")}}`);
  if (c("c_header_bg")) r.push(`.site-header,.px-header{background:${c("c_header_bg")}}`);
  if (c("c_header_text")) r.push(`.site-header,.site-header .logo,.cart-link,.px-header,.px-logo,.px-icon-btn,.px-call,.px-nav a{color:${c("c_header_text")}}`);
  if (c("c_topbar_bg")) r.push(`.px-topbar{background:${c("c_topbar_bg")}}`);
  if (c("c_topbar_text")) r.push(`.px-topbar,.px-hotline{color:${c("c_topbar_text")}}`);
  if (c("c_btn")) r.push(`.btn-primary,.theme-pro .card-actions .btn-primary,.sticky-order{background:${c("c_btn")};border-color:${c("c_btn")}}`);
  if (c("c_btn_text")) r.push(`.btn-primary,.theme-pro .card-actions .btn-primary,.sticky-order{color:${c("c_btn_text")}}`);
  if (c("c_price")) r.push(`.price,.theme-pro .price{color:${c("c_price")}}`);
  if (c("c_badge")) r.push(`.badge,.theme-pro .badge{background:${c("c_badge")}}`);
  if (c("c_footer_bg")) r.push(`.site-footer,.px-footer{background:${c("c_footer_bg")}}`);
  if (c("c_footer_text")) r.push(`.site-footer,.px-footer,.px-footer a,.px-footer h4,.px-copy,.site-footer a{color:${c("c_footer_text")}}`);
  const fb = FONTS[c("font_body") ?? ""]; if (fb) r.push(`body{font-family:${fb.family},"Noto Sans Bengali",sans-serif}`);
  const fh = FONTS[c("font_heading") ?? ""]; if (fh) r.push(`h1,h2,h3,.px-logo,.logo{font-family:${fh.family},"Noto Sans Bengali",sans-serif}`);
  if (c("font_size") === "sm") r.push("body{font-size:15px}");
  if (c("font_size") === "lg") r.push("body{font-size:17.5px}");
  const br = { square: "0", rounded: "10px", pill: "999px" }[c("btn_shape") as "square"] ?? "10px";
  r.push(`.btn,.theme-pro .card-actions .btn,.theme-bold .btn{border-radius:${br}}`);
  const rad = { none: "0", sm: "12px", lg: "18px" }[c("radius") as "none"] ?? "12px";
  r.push(`.card,.theme-pro .card,.theme-bold .card{border-radius:${rad}}.card-img img,.theme-pro .card-img img{border-radius:${c("radius") === "none" ? "0" : "8px"}}`);
  if (c("card_style") === "shadow") r.push(".card,.theme-pro .card{border-color:transparent;box-shadow:0 6px 20px rgba(15,23,42,.08)}");
  if (c("card_style") === "flat") r.push(".card,.theme-pro .card,.theme-bold .card{border-color:transparent;box-shadow:none}");
  if (c("card_style") === "border") r.push(".card,.theme-pro .card,.theme-bold .card{border:1px solid #e5e7eb;box-shadow:none}");
  r.push(`.card-img img,.theme-pro .card-img img{object-fit:${c("img_fit") === "contain" ? "contain" : "cover"}}`);
  if (c("img_fit") === "cover") r.push(".theme-pro .card-img{padding:0}");
  const lh = { sm: 30, md: 40, lg: 54 }[c("logo_size") as "sm"] ?? 40;
  r.push(`.logo-img,.px-logo img{height:${lh}px}`);
  if (c("header_sticky") === "0") r.push(".site-header,.px-header{position:static}");
  if (c("cat_style") === "square") r.push(".px-cat-img{border-radius:16px}");
  const m = c("per_row_mobile") === "1" ? 1 : 2;
  const d = Math.min(5, Math.max(3, parseInt(c("per_row_desktop") || "4", 10)));
  r.push(`.grid,.theme-pro .px-grid{grid-template-columns:repeat(${m},1fr)}@media(min-width:700px){.grid,.theme-pro .px-grid{grid-template-columns:repeat(3,1fr)}}@media(min-width:1000px){.grid,.theme-pro .px-grid{grid-template-columns:repeat(${d},1fr)}}`);
  if (c("card_order_btn") !== "1" || c("card_cart_btn") !== "1") r.push("@media(min-width:700px){.theme-pro .card-actions{grid-template-columns:1fr}}");
  return r.join("");
}

/** Google ফন্টের লিংক (বাছাই করা থাকলে) */
export function cfgFontsHref(cfg: Cfg): string | null {
  const keys = [...new Set([cfg.font_body, cfg.font_heading].filter((k): k is string => !!k && !!FONTS[k]))];
  return keys.length ? `https://fonts.googleapis.com/css2?${keys.map((k) => `family=${FONTS[k]!.query}`).join("&")}&display=swap` : null;
}
