/**
 * থিম কাস্টমাইজ — প্রতিটা থিমের নিজস্ব আলাদা সেটিংস (settings টেবিলে theme_cfg_<থিম>)।
 * দোকানদার কোড ছাড়া রং, ফন্ট, হেডার, হোমপেজ, কার্ড, ফুটার, ভাসমান বাটন বদলাতে পারে।
 * সব মান সার্ভারে যাচাই হয়; CSS-এ শুধু যাচাই করা মান বসে।
 */
import { FONTS } from "./landing";
import { darken, freeDeliveryMin, themeOf, type Settings, type ThemeKey } from "./settings";

export type Cfg = Record<string, string>;

type Opt = Record<string, string>;
export type Field =
  | { key: string; type: "color"; label: string; hint?: string }
  | { key: string; type: "select"; label: string; options: Opt; hint?: string }
  | { key: string; type: "toggle"; label: string; hint?: string }
  | { key: string; type: "text"; label: string; max: number; placeholder?: string; hint?: string; wide?: boolean }
  | { key: string; type: "textarea"; label: string; max: number; hint?: string }
  | { key: string; type: "url"; label: string; placeholder?: string; hint?: string }
  | { key: string; type: "order"; label: string; hint?: string }
  | { key: string; type: "choice"; label: string; options: Opt; preview: string; hint?: string; legacy?: Opt }
  | { key: string; type: "products"; label: string; hint?: string }
  | { key: string; type: "image"; label: string; hint?: string };

export const HOME_SECTIONS: Record<string, string> = {
  banner: "ব্যানার স্লাইডার",
  features: "ফিচার বক্স (৩টা সুবিধা)",
  categories: "ক্যাটাগরি টাইল",
  offers: "অফার চলছে (ছাড়ের পণ্য নিজে থেকে)",
  offer1: "অফার সেকশন ১ (নিজে বাছাই করা পণ্য)",
  latest: "নতুন পণ্য",
  midbanner: "মাঝের ব্যানার",
  offer2: "অফার সেকশন ২",
  video: "ভিডিও",
  products: "ক্যাটাগরি অনুযায়ী পণ্য",
  offer3: "অফার সেকশন ৩",
  trust: "বিশ্বাসের ব্যাজ",
  text: "নিজের লেখা (শিরোনাম + বিবরণ)",
};

export const ICONS: Opt = { truck: "🚚 ডেলিভারি", cash: "💵 টাকা", shield: "🛡️ নিরাপদ", refresh: "🔄 রিটার্ন", gift: "🎁 উপহার", star: "⭐ সেরা মান", clock: "⏰ দ্রুত", phone: "📞 সাপোর্ট", leaf: "🌿 প্রাকৃতিক" };

const fontOpts: Opt = { "": "থিমের ডিফল্ট", ...Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, v.label])) };

const ALL_GROUPS: { key: string; title: string; desc: string; fields: Field[] }[] = [
  {
    key: "style", title: "রং, ফন্ট আর বাটন", desc: "উপরের তৈরি রং থেকে এক ক্লিকে বাছুন, বা নিচে একটা একটা করে। রং না বাছলে থিমের নিজের রং থাকে।",
    fields: [
      { key: "c_brand", type: "color", label: "মূল রং (শিরোনাম, লিংক, ফিতা)", hint: "না বাছলে দোকানের মূল রং থাকে" },
      { key: "c_accent", type: "color", label: "বাটনের মূল রং", hint: "না বাছলে দোকানের বাটনের রং থাকে" },
      { key: "c_bg", type: "color", label: "পেজের ব্যাকগ্রাউন্ড" },
      { key: "c_header_bg", type: "color", label: "হেডারের ব্যাকগ্রাউন্ড" },
      { key: "c_header_text", type: "color", label: "হেডারের লেখা" },
      { key: "c_topbar_bg", type: "color", label: "ঘোষণা বারের ব্যাকগ্রাউন্ড" },
      { key: "c_topbar_text", type: "color", label: "ঘোষণা বারের লেখা" },
      { key: "c_btn", type: "color", label: "অর্ডার বাটনের রং" },
      { key: "c_btn_text", type: "color", label: "অর্ডার বাটনের লেখা" },
      { key: "c_cart", type: "color", label: "কার্ট বাটনের রং" },
      { key: "c_cart_text", type: "color", label: "কার্ট বাটনের লেখা" },
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
      { key: "header_layout", type: "choice", label: "হেডারের ডিজাইন", preview: "header", options: { standard: "লোগো বাঁয়ে, বড় সার্চ", center: "লোগো মাঝে", inline: "এক সারিতে মেনু", colored: "রঙিন সরু হেডার" } },
      { key: "cart_icon", type: "choice", label: "কার্টের আইকন", preview: "cart", options: { cart: "ট্রলি", bag: "ব্যাগ", basket: "ঝুড়ি" } },
      { key: "topbar", type: "toggle", label: "উপরে ঘোষণা বার দেখাবে" },
      { key: "announcement", type: "text", label: "ঘোষণার লেখা", max: 120, wide: true, placeholder: "যেমন: ঈদ অফার — সব পণ্যে ১০% ছাড়!", hint: "ফাঁকা রাখলে ফ্রি ডেলিভারি বা ক্যাশ অন ডেলিভারির কথা দেখাবে" },
      { key: "topbar_hotline", type: "toggle", label: "ঘোষণা বারে হটলাইন নম্বর" },
      { key: "header_search", type: "toggle", label: "পণ্য খোঁজার বক্স" },
      { key: "header_nav", type: "toggle", label: "ক্যাটাগরি মেনু (মোবাইলে ☰ মেনু)" },
      { key: "header_pages", type: "toggle", label: "নিজের পেজের মেনু (যেমন: আমাদের সম্পর্কে)", hint: "পেজ বানাতে: সাইডবারে \"পেজ\"" },
      { key: "header_call", type: "toggle", label: "হেডারে \"কল করুন\" নম্বর (কম্পিউটারে)" },
      { key: "header_sticky", type: "toggle", label: "স্ক্রল করলেও হেডার উপরে থাকবে" },
      { key: "logo_size", type: "select", label: "লোগোর সাইজ", options: { sm: "ছোট", md: "মাঝারি", lg: "বড়" } },
    ],
  },
  {
    key: "home", title: "হোমপেজ", desc: "কোন সেকশন দেখাবে, কোন ক্রমে, ব্যানার আর শিরোনামের ডিজাইন।",
    fields: [
      { key: "hero_style", type: "select", label: "উপরের অংশের (ব্যানার) ডিজাইন", options: { sidebar: "বাঁয়ে ক্যাটাগরি মেনু + ব্যানার + ডানে তথ্য (মার্কেটপ্লেস)", slider: "চওড়া ব্যানার স্লাইডার", full: "পুরো স্ক্রিনজুড়ে ব্যানার (প্রিমিয়াম)", skew: "তির্যক ব্যানার + চলন্ত লেখা (ফ্যাশন)" }, hint: "ব্যানারের ছবি না থাকলে দোকানের নাম আর ঘোষণার লেখা দিয়ে একটা বড় শিরোনাম দেখায়" },
      { key: "title_style", type: "select", label: "সেকশনের শিরোনামের ডিজাইন", options: { bar: "বাঁয়ে রঙিন দাগ, সাদা বক্সে সেকশন", ribbon: "মাঝে রঙিন ফিতা", eyebrow: "ছোট উপশিরোনাম + বড় পাতলা লেখা", marker: "মোটা লেখা + হাইলাইট" } },
      { key: "marquee", type: "toggle", label: "চলন্ত লেখার ফিতা (ব্যানারের নিচে)", hint: "বিশ্বাসের ব্যাজের লেখাগুলো আর ঘোষণা চলতে থাকে" },
      { key: "offers_countdown", type: "toggle", label: "অফার সেকশনে কাউন্টডাউন (আজ রাত ১২টা পর্যন্ত)" },
      { key: "home_order", type: "order", label: "সেকশন সাজানো", hint: "টিক দেওয়াগুলো দেখাবে। ↑↓ দিয়ে ক্রম বদলান। ব্যানারের ছবি \"থিম ও লোগো\" ট্যাবে দিন।" },
      { key: "title_categories", type: "text", label: "ক্যাটাগরি সেকশনের শিরোনাম", max: 60 },
      { key: "cat_style", type: "select", label: "ক্যাটাগরির ডিজাইন", options: { icons: "ছোট টাইলের গ্রিড (মার্কেটপ্লেস)", circle: "গোল ছবি", square: "চারকোনা ছবি", tiles: "বড় ছবির টাইল (প্রিমিয়াম)", cards: "ছবির উপর লেখা, বড় কার্ড (ফ্যাশন)" } },
      { key: "title_offers", type: "text", label: "অফার সেকশনের শিরোনাম", max: 60 },
      { key: "per_section", type: "select", label: "প্রতি ক্যাটাগরিতে কয়টা পণ্য দেখাবে", options: { "4": "৪টা", "8": "৮টা", "12": "১২টা", "0": "সব" } },
      { key: "show_more", type: "toggle", label: "\"সব দেখুন\" লিংক" },
      { key: "text_title", type: "text", label: "নিজের লেখার শিরোনাম", max: 100, placeholder: "যেমন: আমাদের সম্পর্কে" },
      { key: "text_body", type: "textarea", label: "নিজের লেখার বিবরণ", max: 1000 },
    ],
  },
  {
    key: "sections", title: "হোমপেজের বাড়তি সেকশন", desc: "নতুন পণ্য, নিজে বাছাই করা অফার, মাঝের ব্যানার, ভিডিও, ফিচার বক্স। চালু করতে উপরের \"সেকশন সাজানো\"-তে টিক দিন।",
    fields: [
      { key: "latest_title", type: "text", label: "নতুন পণ্যের শিরোনাম", max: 60 },
      { key: "latest_count", type: "select", label: "কয়টা নতুন পণ্য", options: { "4": "৪টা", "8": "৮টা", "12": "১২টা" } },
      { key: "offer1_title", type: "text", label: "অফার সেকশন ১-এর শিরোনাম", max: 60 },
      { key: "offer1_products", type: "products", label: "অফার সেকশন ১-এর পণ্য" },
      { key: "offer2_title", type: "text", label: "অফার সেকশন ২-এর শিরোনাম", max: 60 },
      { key: "offer2_products", type: "products", label: "অফার সেকশন ২-এর পণ্য" },
      { key: "offer3_title", type: "text", label: "অফার সেকশন ৩-এর শিরোনাম", max: 60 },
      { key: "offer3_products", type: "products", label: "অফার সেকশন ৩-এর পণ্য" },
      { key: "mid_banner", type: "image", label: "মাঝের ব্যানারের ছবি", hint: "চওড়া ছবি, যেমন ১২০০×৩০০। JPG/WebP, ২ MB পর্যন্ত।" },
      { key: "mid_banner_link", type: "text", label: "মাঝের ব্যানারে ক্লিক করলে যাবে", max: 200, placeholder: "/p/... বা /c/..." },
      { key: "video_title", type: "text", label: "ভিডিও সেকশনের শিরোনাম", max: 60 },
      { key: "video_url", type: "url", label: "YouTube ভিডিওর লিংক", placeholder: "https://youtu.be/..." },
      { key: "feature_1_icon", type: "select", label: "ফিচার ১-এর আইকন", options: ICONS }, { key: "feature_1", type: "text", label: "ফিচার ১", max: 40 }, { key: "feature_1_sub", type: "text", label: "ফিচার ১-এর নিচের লেখা", max: 60 },
      { key: "feature_2_icon", type: "select", label: "ফিচার ২-এর আইকন", options: ICONS }, { key: "feature_2", type: "text", label: "ফিচার ২", max: 40 }, { key: "feature_2_sub", type: "text", label: "ফিচার ২-এর নিচের লেখা", max: 60 },
      { key: "feature_3_icon", type: "select", label: "ফিচার ৩-এর আইকন", options: ICONS }, { key: "feature_3", type: "text", label: "ফিচার ৩", max: 40 }, { key: "feature_3_sub", type: "text", label: "ফিচার ৩-এর নিচের লেখা", max: 60 },
    ],
  },
  {
    key: "popup", title: "অফারের পপআপ", desc: "দোকানে ঢুকলে একটা অফারের ছবি ভেসে উঠবে। কাস্টমার বন্ধ করলে সেদিন আর দেখাবে না।",
    fields: [
      { key: "popup_on", type: "toggle", label: "পপআপ চালু" },
      { key: "popup_image", type: "image", label: "পপআপের ছবি", hint: "যেমন ৮০০×৮০০ বা ৮০০×১০০০। JPG/WebP, ২ MB পর্যন্ত।" },
      { key: "popup_link", type: "text", label: "ছবিতে ক্লিক করলে যাবে", max: 200, placeholder: "/p/... বা /c/..." },
      { key: "popup_delay", type: "select", label: "কত সেকেন্ড পরে দেখাবে", options: { "0": "সাথে সাথে", "3": "৩ সেকেন্ড", "5": "৫ সেকেন্ড", "10": "১০ সেকেন্ড" } },
    ],
  },
  {
    key: "product", title: "পণ্যের পেজ", desc: "পণ্যের বিস্তারিত পেজ (ছবি, দাম, কার্টে যোগ, এখনই কিনুন) আর ল্যান্ডিং পেজের বাটন, শেয়ার, সম্পর্কিত পণ্য।",
    fields: [
      { key: "product_link", type: "select", label: "পণ্যে ক্লিক করলে কোন পেজ খুলবে", options: { product: "পণ্যের বিস্তারিত পেজ (ছবি, বিবরণ, কার্টে যোগ)", landing: "সরাসরি অর্ডারের পেজ (ল্যান্ডিং পেজ)" }, hint: "ফেসবুক অ্যাডের জন্য ল্যান্ডিং পেজের লিংক (/p/...) সবসময় আলাদা কাজ করে" },
      { key: "pd_cart_text", type: "text", label: "\"কার্টে যোগ করুন\" বাটনের লেখা", max: 30 },
      { key: "pd_buy_text", type: "text", label: "\"এখনই কিনুন\" বাটনের লেখা", max: 30 },
      { key: "pd_delivery_info", type: "toggle", label: "ডেলিভারি চার্জ আর সময় দেখাবে" },
      { key: "pd_trust", type: "toggle", label: "বিশ্বাসের ব্যাজ দেখাবে (ফুটারের ব্যাজের লেখা)" },
      { key: "pd_call", type: "toggle", label: "\"কল করুন\" বাটন" },
      { key: "pd_call_text", type: "text", label: "কল বাটনের লেখা", max: 40 },
      { key: "pd_wa", type: "toggle", label: "WhatsApp বাটন", hint: "\"দোকানের তথ্য\" ট্যাবে WhatsApp নম্বর লাগবে" },
      { key: "pd_wa_text", type: "text", label: "WhatsApp বাটনের লেখা", max: 40 },
      { key: "pd_msg", type: "toggle", label: "Messenger বাটন", hint: "\"ভাসমান বাটন\" অংশে Messenger লিংক লাগবে" },
      { key: "pd_msg_text", type: "text", label: "Messenger বাটনের লেখা", max: 40 },
      { key: "pd_sticky", type: "toggle", label: "মোবাইলে নিচে আটকে থাকা অর্ডার বার" },
      { key: "pd_sticky_text", type: "text", label: "অর্ডার বারের লেখা", max: 30 },
      { key: "pd_variant_style", type: "select", label: "সাইজ/রং বাছাইয়ের ধরন", options: { pills: "বোতাম (সব একসাথে দেখা যায়)", select: "ড্রপডাউন (অনেক অপশন হলে)" } },
      { key: "pd_zoom", type: "toggle", label: "ছবিতে চাপলে বড় করে দেখা" },
      { key: "pd_share", type: "toggle", label: "শেয়ার বাটন (Facebook, WhatsApp, লিংক কপি)" },
      { key: "pd_related", type: "toggle", label: "সম্পর্কিত পণ্য (একই ক্যাটাগরির)" },
      { key: "pd_related_title", type: "text", label: "সম্পর্কিত পণ্যের শিরোনাম", max: 60 },
      { key: "pd_related_count", type: "select", label: "কয়টা সম্পর্কিত পণ্য", options: { "2": "২টা", "3": "৩টা", "4": "৪টা", "6": "৬টা", "8": "৮টা", "12": "১২টা" } },
      { key: "pd_related_mobile", type: "choice", label: "📱 মোবাইলে সম্পর্কিত পণ্য এক সারিতে", preview: "cols", options: { auto: "পণ্যের তালিকার মতো", "1": "১টা", "2": "২টা", "3": "৩টা" } },
      { key: "pd_related_desktop", type: "choice", label: "💻 কম্পিউটারে সম্পর্কিত পণ্য এক সারিতে", preview: "cols", options: { auto: "পণ্যের তালিকার মতো", "2": "২টা", "3": "৩টা", "4": "৪টা", "5": "৫টা", "6": "৬টা" } },
    ],
  },
  {
    key: "reviews", title: "ক্রেতাদের রিভিউ", desc: "পণ্যের পেজ আর ল্যান্ডিং পেজের রিভিউ অংশ। রিভিউ নেওয়া পুরো চালু/বন্ধ আর অনুমোদন: অ্যাডমিন › রিভিউ।",
    fields: [
      { key: "rv_show", type: "toggle", label: "পণ্যের পেজে রিভিউ অংশ দেখাবে" },
      { key: "rv_landing", type: "toggle", label: "ল্যান্ডিং পেজেও রিভিউ দেখাবে" },
      { key: "rv_title", type: "text", label: "শিরোনাম", max: 60 },
      { key: "rv_layout", type: "select", label: "রিভিউ সাজানোর ধরন", options: { list: "একটার নিচে একটা", grid: "২ কলামের কার্ড", slider: "পাশাপাশি স্লাইড (মোবাইলে সোয়াইপ)" } },
      { key: "rv_count", type: "select", label: "কয়টা রিভিউ দেখাবে", options: { "3": "৩টা", "6": "৬টা", "10": "১০টা", "20": "২০টা" }, hint: "ছবিসহ রিভিউ আগে দেখায়" },
      { key: "rv_summary", type: "toggle", label: "উপরে গড় রেটিং (★ ৪.৮ · ২৫টা রিভিউ)" },
      { key: "rv_verified", type: "toggle", label: "\"✓ যাচাই করা ক্রেতা\" ব্যাজ" },
      { key: "rv_photos", type: "toggle", label: "ক্রেতার দেওয়া ছবি দেখাবে" },
      { key: "rv_reply", type: "toggle", label: "দোকানের উত্তর দেখাবে" },
      { key: "rv_empty", type: "select", label: "কোনো রিভিউ না থাকলে", options: { show: "লেখা আর \"রিভিউ দিন\" বাটন দেখাবে", hide: "পুরো অংশ লুকাবে" } },
      { key: "rv_empty_text", type: "text", label: "রিভিউ না থাকলে যে লেখা দেখাবে", max: 80 },
      { key: "rv_btn", type: "toggle", label: "\"রিভিউ দিন\" বাটন" },
      { key: "rv_btn_text", type: "text", label: "রিভিউ বাটনের লেখা", max: 40 },
      { key: "rv_card_stars", type: "toggle", label: "পণ্যের কার্ডে তারা (★) দেখাবে" },
      { key: "c_star", type: "color", label: "তারার রং", hint: "না বাছলে সোনালি" },
    ],
  },
  {
    key: "layout", title: "কলাম আর ছবির আকার", desc: "এক সারিতে কয়টা পণ্য আর পণ্যের ছবি কেমন আকারে দেখাবে। হোম, ক্যাটাগরি, সার্চ আর সম্পর্কিত পণ্য — সব জায়গায় একই।",
    fields: [
      { key: "per_row_mobile", type: "choice", label: "📱 মোবাইলে এক সারিতে পণ্য", preview: "cols", options: { "1": "১টা", "2": "২টা", "3": "৩টা" } },
      { key: "m1_style", type: "choice", label: "মোবাইলে ১টা করে দেখালে কার্ডের ধরন", preview: "m1", options: { card: "বড় কার্ড", list: "তালিকা (ছবি বাঁয়ে)" }, hint: "শুধু মোবাইলে ১টা কলাম বাছলে কাজ করে" },
      { key: "per_row_desktop", type: "choice", label: "💻 কম্পিউটারে এক সারিতে পণ্য", preview: "cols", options: { "3": "৩টা", "4": "৪টা", "5": "৫টা", "6": "৬টা" } },
      { key: "per_row_tablet", type: "select", label: "ট্যাবলেটে এক সারিতে পণ্য (ঐচ্ছিক)", options: { auto: "নিজে থেকে (মোবাইল আর কম্পিউটারের মাঝামাঝি)", "2": "২টা", "3": "৩টা", "4": "৪টা" } },
      { key: "img_ratio", type: "choice", label: "পণ্যের ছবির আকার", preview: "ratio", options: { "1/1": "বর্গাকার", "4/5": "লম্বা", "4/3": "চওড়া" }, legacy: { "3/4": "আরও লম্বা", "16/9": "খুব চওড়া" }, hint: "বর্গাকার: সাধারণ পণ্য, গ্যাজেট · লম্বা: পোশাক, মডেলের ছবি · চওড়া: ফার্নিচার, বড় জিনিস" },
      { key: "img_fit", type: "select", label: "ছবি কীভাবে বসবে", options: { cover: "পুরো বক্স ভরে (কিছুটা কাটা যেতে পারে)", contain: "পুরো ছবি দেখাবে" } },
    ],
  },
  {
    key: "listpage", title: "ক্যাটাগরি আর সার্চ পেজ", desc: "ক্যাটাগরি, সব পণ্য আর সার্চের ফলাফলের পেজ।",
    fields: [
      { key: "list_per_page", type: "select", label: "এক পাতায় কয়টা পণ্য", options: { "24": "২৪টা", "48": "৪৮টা", "96": "৯৬টা" } },
      { key: "list_filter", type: "toggle", label: "দামের ফিল্টার (সর্বনিম্ন–সর্বোচ্চ)" },
      { key: "list_sort", type: "toggle", label: "\"সাজান\" (দাম কম-বেশি, নতুন)" },
      { key: "breadcrumbs", type: "toggle", label: "উপরে পথ দেখানো (হোম › ...)" },
    ],
  },
  {
    key: "card", title: "কার্ডের ডিজাইন আর বাটন", desc: "প্রতিটা পণ্যের বক্স: ডিজাইন, বাটন, ব্যাজ, ট্যাগ।",
    fields: [
      { key: "card_design", type: "select", label: "কার্ডের ডিজাইন", options: { pro: "পরিষ্কার, হালকা ছায়া", classic: "বর্ডার, মাঝে লেখা, কোণে ছাড়ের ফিতা", minimal: "বর্ডার নেই, লেখার মতো বাটন", bold: "মোটা বর্ডার আর গাঢ় ছায়া" } },
      { key: "card_order_btn", type: "toggle", label: "\"অর্ডার করুন\" বাটন" },
      { key: "card_order_text", type: "text", label: "অর্ডার বাটনের লেখা", max: 30 },
      { key: "card_cart_btn", type: "toggle", label: "\"কার্টে যোগ\" বাটন" },
      { key: "card_cart_text", type: "text", label: "কার্ট বাটনের লেখা", max: 30 },
      { key: "free_tag", type: "toggle", label: "\"ফ্রি ডেলিভারি\" ট্যাগ", hint: "ডেলিভারি সেটিংসে ফ্রি ডেলিভারির টাকা দেওয়া থাকলে, তার বেশি দামের পণ্যে দেখাবে" },
      { key: "card_btn_size", type: "select", label: "বাটনের লেখার সাইজ", options: { sm: "ছোট", md: "মাঝারি", lg: "বড়" } },
      { key: "badge_fmt", type: "select", label: "ছাড়ের ব্যাজ", options: { pct: "২৪% ছাড়", minus: "-২৪%", off: "দেখাবে না" } },
    ],
  },
  {
    key: "footer", title: "ফুটার আর বিশ্বাসের ব্যাজ", desc: "পেজের একদম নিচের অংশ।",
    fields: [
      { key: "footer_style", type: "choice", label: "ফুটারের ডিজাইন", preview: "footer", options: { simple: "সাধারণ", full: "বড় (৪ কলাম)", center: "মাঝখানে সাজানো" } },
      { key: "footer_logo", type: "image", label: "ফুটারের আলাদা লোগো (ঐচ্ছিক)", hint: "গাঢ় ফুটারে সাদা লোগো ভালো দেখায়। না দিলে মূল লোগো।" },
      { key: "footer_payments", type: "text", label: "পেমেন্টের মাধ্যম (কমা দিয়ে)", max: 120, placeholder: "ক্যাশ অন ডেলিভারি, bKash, Nagad", hint: "ফুটারে ছোট ব্যাজ হিসেবে দেখাবে। ফাঁকা রাখলে দেখাবে না।" },
      { key: "footer_trust", type: "toggle", label: "ফুটারের উপরে বিশ্বাসের ব্যাজ", hint: "চালু থাকলে হোমপেজের বিশ্বাসের ব্যাজ সেকশন আর আলাদা দেখায় না (দুবার না আসার জন্য)" },
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
      { key: "back_top", type: "toggle", label: "\"উপরে যান\" বাটন" },
      { key: "side_cart", type: "toggle", label: "কার্টে যোগ করলে পাশ থেকে কার্ট খুলবে", hint: "বন্ধ থাকলে শুধু ছোট একটা বার্তা দেখায়" },
    ],
  },
  {
    key: "other", title: "অন্যান্য", desc: "দোকান সাময়িক বন্ধ রাখা আর ছোটখাটো সেটিং।",
    fields: [
      { key: "coming_soon", type: "toggle", label: "দোকান সাময়িক বন্ধ (Coming Soon)", hint: "কাস্টমার শুধু নিচের লেখা দেখবে। আপনি অ্যাডমিনে লগইন থাকলে দোকান দেখতে পাবেন। ল্যান্ডিং পেজ খোলা থাকে।" },
      { key: "coming_soon_text", type: "textarea", label: "বন্ধ থাকার সময়ের লেখা", max: 300 },
      { key: "track_link", type: "toggle", label: "\"অর্ডার ট্র্যাক করুন\" লিংক (মেনু আর ফুটারে)" },
    ],
  },
];

/** থিম এডিটরে সেটিং পেজ অনুযায়ী সাজানো — দোকানদার যে পেজ বদলাতে চান সেটা খুঁজে পান */
export const PAGES: { key: string; title: string; desc: string; groups: string[] }[] = [
  { key: "all", title: "পুরো দোকান", desc: "সব পেজে একই থাকে", groups: ["style", "header", "footer", "float", "popup", "other"] },
  { key: "home", title: "হোমপেজ", desc: "দোকানের প্রথম পেজ", groups: ["home", "sections"] },
  { key: "list", title: "পণ্যের তালিকা", desc: "হোম, ক্যাটাগরি আর সার্চে পণ্যের গ্রিড", groups: ["layout", "card", "listpage"] },
  { key: "product", title: "পণ্যের পেজ", desc: "একটা পণ্যের বিস্তারিত পেজ", groups: ["product", "reviews"] },
];
const ORDER = PAGES.flatMap((p) => p.groups);
export const GROUPS = [...ALL_GROUPS].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
export const pageOfGroup = (key: string) => PAGES.find((p) => p.groups.includes(key))?.key ?? "all";

const TRUST_DEFAULTS: Cfg = {
  trust_1: "ক্যাশ অন ডেলিভারি", trust_1_sub: "পণ্য হাতে পেয়ে টাকা দিন",
  trust_2: "সারাদেশে ডেলিভারি", trust_2_sub: "দ্রুত হোম ডেলিভারি",
  trust_3: "১০০% অরিজিনাল", trust_3_sub: "মান যাচাই করা পণ্য",
  trust_4: "সহজ রিটার্ন", trust_4_sub: "ডেলিভারির সময় দেখে নিন",
};

const BASE: Cfg = {
  font_body: "", font_heading: "", font_size: "md", btn_shape: "rounded", radius: "sm", card_style: "border",
  topbar: "0", announcement: "", topbar_hotline: "1", header_search: "0", header_nav: "0", header_call: "0", header_sticky: "1", logo_size: "md",
  home_order: Object.keys(HOME_SECTIONS).join(","), sec_banner: "1", sec_categories: "0", sec_offers: "0", sec_products: "1", sec_trust: "0", sec_text: "0",
  title_categories: "ক্যাটাগরি", cat_style: "circle", title_offers: "🔥 অফার চলছে",
  per_row_mobile: "2", per_row_desktop: "4", per_section: "0", show_more: "1", text_title: "", text_body: "",
  card_order_btn: "1", card_order_text: "অর্ডার করুন", card_cart_btn: "1", card_cart_text: "কার্টে যোগ", img_fit: "cover", badge_fmt: "pct",
  footer_style: "simple", footer_trust: "0", footer_about: "", social_instagram: "", social_youtube: "", social_tiktok: "", footer_copy: "",
  float_whatsapp: "0", float_call: "0", float_messenger: "", bottom_nav: "0", back_top: "1",
  header_layout: "colored", cart_icon: "cart", per_row_tablet: "auto", m1_style: "card", img_ratio: "1/1", free_tag: "1", list_sort: "1",
  sec_features: "0", sec_offer1: "0", sec_latest: "0", sec_midbanner: "0", sec_offer2: "0", sec_video: "0", sec_offer3: "0",
  latest_title: "নতুন পণ্য", latest_count: "8", offer1_title: "বিশেষ অফার", offer1_products: "", offer2_title: "সেরা বিক্রি", offer2_products: "", offer3_title: "আপনার জন্য", offer3_products: "",
  mid_banner: "", mid_banner_link: "", video_title: "ভিডিওতে দেখুন", video_url: "",
  feature_1_icon: "truck", feature_1: "দ্রুত ডেলিভারি", feature_1_sub: "সারাদেশে হোম ডেলিভারি",
  feature_2_icon: "cash", feature_2: "ক্যাশ অন ডেলিভারি", feature_2_sub: "পণ্য হাতে পেয়ে টাকা দিন",
  feature_3_icon: "shield", feature_3: "অরিজিনাল পণ্য", feature_3_sub: "মান যাচাই করে পাঠানো",
  popup_on: "0", popup_image: "", popup_link: "", popup_delay: "3",
  product_link: "product", pd_cart_text: "কার্টে যোগ করুন", pd_buy_text: "এখনই কিনুন", pd_delivery_info: "1", pd_trust: "1",
  pd_call: "1", pd_call_text: "কল করে অর্ডার করুন", pd_wa: "1", pd_wa_text: "WhatsApp-এ জিজ্ঞাসা করুন", pd_msg: "0", pd_msg_text: "Messenger-এ মেসেজ দিন",
  pd_sticky: "1", pd_sticky_text: "অর্ডার করুন", pd_variant_style: "pills", pd_zoom: "1", pd_share: "0", pd_related: "1", pd_related_title: "আরও দেখুন", pd_related_count: "4", pd_related_mobile: "auto", pd_related_desktop: "auto",
  card_btn_size: "md", list_filter: "1", list_per_page: "24", header_pages: "1", footer_logo: "", footer_payments: "ক্যাশ অন ডেলিভারি, bKash, Nagad", side_cart: "1",
  hero_style: "slider", title_style: "ribbon", marquee: "0", offers_countdown: "0", card_design: "classic",
  rv_show: "1", rv_landing: "1", rv_title: "ক্রেতাদের রিভিউ", rv_layout: "list", rv_count: "10", rv_summary: "1", rv_verified: "1", rv_photos: "1", rv_reply: "1",
  rv_empty: "show", rv_empty_text: "এখনো কোনো রিভিউ নেই।", rv_btn: "1", rv_btn_text: "এই পণ্য কিনেছেন? রিভিউ দিন", rv_card_stars: "1",
  coming_soon: "0", coming_soon_text: "আমাদের দোকান খুব শীঘ্রই আসছে। অর্ডার করতে কল করুন।", breadcrumbs: "1", track_link: "1",
  ...TRUST_DEFAULTS,
};

/** প্রতিটা থিমের শুরুর সেটিংস */
export const THEME_DEFAULTS: Record<ThemeKey, Cfg> = {
  pro: {
    ...BASE, header_layout: "standard", cart_icon: "cart", btn_shape: "pill", radius: "lg", card_style: "shadow", sec_latest: "1",
    topbar: "1", header_search: "1", header_nav: "1", header_call: "1",
    sec_categories: "1", sec_offers: "1", per_section: "8", img_fit: "contain", badge_fmt: "minus",
    footer_style: "full", footer_trust: "1", float_whatsapp: "1", bottom_nav: "1",
    hero_style: "sidebar", title_style: "bar", cat_style: "icons", card_design: "pro", offers_countdown: "1",
  },
  classic: {
    ...BASE, hero_style: "slider", title_style: "ribbon", cat_style: "circle", card_design: "classic", font_heading: "hind",
    sec_categories: "1", sec_offers: "1", sec_features: "1", btn_shape: "rounded", card_style: "border",
  },
  minimal: {
    ...BASE, btn_shape: "square", radius: "none", card_style: "flat", header_layout: "center", font_heading: "anek",
    hero_style: "full", title_style: "eyebrow", cat_style: "tiles", card_design: "minimal", card_cart_btn: "0", per_row_desktop: "4",
    sec_categories: "1", img_fit: "cover", img_ratio: "4/5", footer_style: "center",
  },
  bold: {
    ...BASE, btn_shape: "rounded", radius: "lg", card_style: "border", topbar: "1", float_whatsapp: "1", header_layout: "inline", font_heading: "baloo",
    hero_style: "skew", title_style: "marker", cat_style: "cards", card_design: "bold", marquee: "1", offers_countdown: "1",
    sec_categories: "1", sec_offers: "1", badge_fmt: "minus",
  },
};

const HEX = /^#[0-9a-f]{6}$/i;
const URL_RE = /^https:\/\/[^\s"'<>]+$/;

/** এক থিমের সেটিংস (ডিফল্ট + সেভ করা, যাচাই করে) */
export function themeConfig(s: Settings, theme: ThemeKey = themeOf(s)): Cfg {
  const def = THEME_DEFAULTS[theme];
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(s[`theme_cfg_${theme}`] || "{}"); } catch { /* ভাঙা JSON */ }
  const cfg = clean({ ...def, ...(saved && typeof saved === "object" ? saved : {}) }, def);
  for (const k of ["mid_banner_link", "popup_link"]) if (!/^(\/[^/\s][^\s"'<>]*|https:\/\/[^\s"'<>]+)$/.test(cfg[k] || "")) cfg[k] = "";
  // পুরনো "ঘোষণা" সেটিং (থিম কাস্টমাইজের আগে)
  if (!cfg.announcement && s.announcement) cfg.announcement = s.announcement;
  cfg._free_min = String(freeDeliveryMin(s));
  cfg._reviews = s.reviews_enabled === "0" ? "0" : "1";
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
      case "choice": out[f.key] = v in f.options || (f.legacy && v in f.legacy) ? v : def[f.key] ?? ""; break;
      case "products": out[f.key] = [...new Set(v.split(",").map((x) => parseInt(x, 10)).filter((n) => n > 0))].slice(0, 24).join(","); break;
      case "image": out[f.key] = /^[a-z0-9_]+\/[a-z0-9-]+\.(jpg|png|webp)$/i.test(v) ? v : ""; break;
      case "order": {
        // মূল সেকশন (প্রতিটা একবার) + নিজে যোগ করা "এক ক্যাটাগরির পণ্য" ব্লক (cat_<id>, সর্বোচ্চ ১২টা)
        const raw = [...new Set(v.split(","))];
        const cats = raw.filter((k) => CAT_BLOCK.test(k)).slice(0, MAX_CAT_BLOCKS);
        const keys = raw.filter((k) => k in HOME_SECTIONS || cats.includes(k));
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
    else if (f.type === "products") input[f.key] = Array.isArray(body[f.key]) ? (body[f.key] as unknown[]).join(",") : body[f.key] ?? "";
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

/** হোমপেজে কোন সেকশন কোন ক্রমে — ক্যাটাগরি ব্লক তালিকায় থাকলেই চালু */
export const homeOrder = (cfg: Cfg) => cfg.home_order!.split(",").filter((k) => CAT_BLOCK.test(k) || cfg[`sec_${k}`] === "1");

export const CAT_BLOCK = /^cat_[1-9][0-9]{0,8}$/;
export const MAX_CAT_BLOCKS = 12;

/** সেটিংস থেকে CSS (শুধু যাচাই করা মান) */
export function cfgCss(cfg: Cfg): string {
  const r: string[] = [];
  const c = (k: string) => cfg[k];
  if (c("c_brand")) r.push(`:root{--brand:${c("c_brand")};--brand-dark:${darken(c("c_brand")!)}}`);
  if (c("c_accent")) r.push(`:root{--accent:${c("c_accent")};--accent-dark:${darken(c("c_accent")!, 0.85)}}`);
  if (c("c_bg")) r.push(`body{background:${c("c_bg")}}`);
  if (c("c_header_bg")) r.push(`.site-header,.px-header{background:${c("c_header_bg")}}`);
  if (c("c_header_text")) r.push(`.site-header,.site-header .logo,.cart-link,.px-header,.px-logo,.px-icon-btn,.px-call,.px-nav a{color:${c("c_header_text")}}`);
  if (c("c_topbar_bg")) r.push(`.px-topbar{background:${c("c_topbar_bg")}}`);
  if (c("c_topbar_text")) r.push(`.px-topbar,.px-hotline{color:${c("c_topbar_text")}}`);
  if (c("c_btn")) r.push(`.btn-primary,.theme-pro .card-actions .btn-primary,.sticky-order{background:${c("c_btn")};border-color:${c("c_btn")}}`);
  if (c("c_btn_text")) r.push(`.btn-primary,.theme-pro .card-actions .btn-primary,.sticky-order{color:${c("c_btn_text")}}`);
  if (c("c_price")) r.push(`.price,.theme-pro .price{color:${c("c_price")}}`);
  if (c("c_badge")) r.push(`.badge,.theme-pro .badge{background:${c("c_badge")}}`);
  if (c("c_star")) r.push(`.stars-on{color:${c("c_star")}}`);
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
  const bs = { sm: ".82rem", md: ".92rem", lg: "1.02rem" }[c("card_btn_size") as "sm"] ?? ".92rem";
  r.push(`.card-actions .btn,.theme-pro .card-actions .btn{font-size:${bs}}`);
  if (c("pd_sticky") === "0") r.push(".sticky-order{display:none!important}");
  if (c("header_sticky") === "0") r.push(".site-header,.px-header{position:static}");
  if (c("cat_style") === "square") r.push(".px-cat-img{border-radius:16px}");
  const m = Math.min(3, Math.max(1, parseInt(c("per_row_mobile") || "2", 10)));
  const d = Math.min(6, Math.max(3, parseInt(c("per_row_desktop") || "4", 10)));
  const t = Math.min(4, Math.max(2, c("per_row_tablet") === "auto" || !c("per_row_tablet") ? Math.min(3, Math.round((m + d) / 2)) : parseInt(c("per_row_tablet")!, 10)));
  r.push(`.grid,.theme-pro .px-grid{grid-template-columns:repeat(${m},1fr)}@media(min-width:700px){.grid,.theme-pro .px-grid{grid-template-columns:repeat(${t},1fr)}}@media(min-width:1000px){.grid,.theme-pro .px-grid{grid-template-columns:repeat(${d},1fr)}}`);
  if (m === 1 && c("m1_style") === "list") r.push("@media(max-width:699px){.grid .card,.theme-pro .px-grid .card{flex-direction:row;align-items:stretch}.grid .card-img,.theme-pro .px-grid .card-img{flex:0 0 38%;max-width:38%;align-self:flex-start}.grid .card-body{min-width:0}}");
  if (m === 1 && c("m1_style") !== "list") r.push("@media(max-width:699px){.grid .card-actions{grid-template-columns:1fr 1fr}}");
  // সম্পর্কিত পণ্যের আলাদা কলাম ("auto" হলে উপরের পণ্যের তালিকার মতোই)
  const rm = parseInt(c("pd_related_mobile") || "", 10), rd = parseInt(c("pd_related_desktop") || "", 10);
  if (rm >= 1 && rm <= 3) {
    r.push(`@media(max-width:699px){.pd-related .grid,.theme-pro .pd-related .px-grid{grid-template-columns:repeat(${rm},1fr)}}`);
    if (rm !== 1 && m === 1 && c("m1_style") === "list") r.push("@media(max-width:699px){.pd-related .grid .card,.theme-pro .pd-related .px-grid .card{flex-direction:column}.pd-related .grid .card-img,.theme-pro .pd-related .px-grid .card-img{flex:none;max-width:none;align-self:auto}}");
  }
  if (rd >= 2 && rd <= 6) r.push(`@media(min-width:1000px){.pd-related .grid,.theme-pro .pd-related .px-grid{grid-template-columns:repeat(${rd},1fr)}}`);
  if (m === 3) r.push("@media(max-width:699px){.card-actions .btn{font-size:.78rem;padding:6px 4px}.card-title{font-size:.85rem}}");
  const ratio = { "1/1": "1/1", "4/5": "4/5", "3/4": "3/4", "4/3": "4/3", "16/9": "16/9" }[c("img_ratio") as "1/1"] ?? "1/1";
  r.push(`.card-img{aspect-ratio:${ratio}}.card-img img{width:100%;height:100%}`);
  if (c("c_cart")) r.push(`.card-actions .btn-outline{background:${c("c_cart")};border-color:${c("c_cart")};color:${c("c_cart_text") || "#fff"}}`);
  else if (c("c_cart_text")) r.push(`.card-actions .btn-outline{color:${c("c_cart_text")}}`);
  if (c("card_order_btn") !== "1" || c("card_cart_btn") !== "1") r.push("@media(min-width:700px){.theme-pro .card-actions{grid-template-columns:1fr}}");
  return r.join("");
}

/** Google ফন্টের লিংক (বাছাই করা থাকলে) */
export function cfgFontsHref(cfg: Cfg): string | null {
  const keys = [...new Set([cfg.font_body, cfg.font_heading].filter((k): k is string => !!k && !!FONTS[k]))];
  return keys.length ? `https://fonts.googleapis.com/css2?${keys.map((k) => `family=${FONTS[k]!.query}`).join("&")}&display=swap` : null;
}
