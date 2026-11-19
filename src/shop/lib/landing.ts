/**
 * ল্যান্ডিং পেজ বিল্ডার — সেকশনের ধরন আর ডাটা যাচাই।
 * সব ইনপুট সার্ভারে পরিষ্কার করা হয় (দৈর্ঘ্য, সংখ্যা, HTML)।
 */
import { sanitizeHtml } from "./sanitize";
import { youtubeId } from "./format";
import type { Product } from "./products";

export const SECTION_TYPES = ["hero", "heading", "gallery", "image", "image_text", "video", "text", "benefits", "before_after", "steps", "comparison", "reviews", "guarantee", "faq", "countdown", "cta", "trust", "order_form"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABEL: Record<SectionType, string> = {
  hero: "বড় শিরোনাম",
  heading: "শিরোনাম",
  image_text: "ছবি + লেখা",
  gallery: "ছবির গ্যালারি",
  image: "বড় ছবি / ব্যানার",
  before_after: "আগে-পরে (দুই ছবি)",
  steps: "কীভাবে অর্ডার করবেন (ধাপ)",
  comparison: "তুলনা (আমাদের বনাম অন্যরা)",
  guarantee: "গ্যারান্টি",
  cta: "মাঝে অর্ডারের বাটন",
  video: "ভিডিও",
  text: "লেখা / বিস্তারিত",
  benefits: "সুবিধার তালিকা",
  reviews: "কাস্টমার রিভিউ",
  faq: "প্রশ্নোত্তর",
  countdown: "কাউন্টডাউন টাইমার",
  trust: "বিশ্বাসের ব্যাজ",
  order_form: "অর্ডার ফর্ম",
};

/** বাংলা ফন্ট (Google Fonts) — শুধু বাছাই করা ফন্টটাই লোড হয় */
export const FONTS: Record<string, { label: string; family: string; query: string }> = {
  hind: { label: "Hind Siliguri", family: "'Hind Siliguri'", query: "Hind+Siliguri:wght@400;600;700" },
  noto: { label: "Noto Sans Bengali", family: "'Noto Sans Bengali'", query: "Noto+Sans+Bengali:wght@400;600;700" },
  baloo: { label: "Baloo Da 2", family: "'Baloo Da 2'", query: "Baloo+Da+2:wght@400;600;700" },
  anek: { label: "Anek Bangla", family: "'Anek Bangla'", query: "Anek+Bangla:wght@400;600;700" },
  tiro: { label: "Tiro Bangla", family: "'Tiro Bangla'", query: "Tiro+Bangla" },
};
export const SIZES = { sm: "ছোট", md: "মাঝারি", lg: "বড়" } as const;
export const ALIGNS = { "": "ডিফল্ট", left: "বাঁয়ে", center: "মাঝে" } as const;

/** সেকশনের ডিজাইন — সব ঐচ্ছিক, ফাঁকা মানে থিমের রং/ফন্ট */
export type SectionStyle = {
  bg?: string; color?: string; btn_bg?: string; btn_color?: string;
  font?: string; size?: keyof typeof SIZES; align?: "left" | "center";
};
/** header/footer: "hide" হলে ল্যান্ডিং পেজে দোকানের হেডার/পুরো ফুটার দেখায় না (ছোট কপিরাইট আর "SellxBD দিয়ে তৈরি" থাকে) */
export type PageStyle = { font?: string; header?: "hide"; footer?: "hide" };

export type Review = { name: string; rating: number; text: string; image: string };
export type Section = {
  id: string;
  type: SectionType;
  enabled: boolean;
  style?: SectionStyle;
  data: {
    headline?: string; subheadline?: string; show_price?: boolean; button_text?: string;
    title?: string; images?: string[]; youtube_url?: string; html?: string;
    items?: string[]; reviews?: Review[]; faqs?: { q: string; a: string }[];
    mode?: "fixed" | "evergreen"; ends_at?: string; minutes?: number;
    labels?: string[]; rows?: { label: string; us: string; them: string }[];
    /** শিরোনাম: সাইজ ও সাজানো */
    hsize?: HeadingSize; align?: "left" | "center" | "right";
    /** ছবি + লেখা: ছবি কোন পাশে, মোবাইলে কোনটা আগে */
    side?: "left" | "right"; mobile_first?: "image" | "text";
    /** গ্যালারি: স্লাইড না গ্রিড, কলাম, ছবির আকার, প্রতি ছবির নিচের লেখা */
    layout?: "slide" | "grid"; cols?: 1 | 2 | 3; ratio?: "square" | "original" | "portrait"; captions?: string[];
  };
};
export const HEADING_SIZES = { sm: "ছোট", md: "মাঝারি", lg: "বড়", xl: "খুব বড়" } as const;
export type HeadingSize = keyof typeof HEADING_SIZES;
export type Landing = { sections: Section[]; style?: PageStyle };

const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : "");
const font = (v: unknown) => (typeof v === "string" && FONTS[v] ? v : "");

export function normalizeStyle(input: unknown): SectionStyle | undefined {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const st: SectionStyle = {};
  for (const k of ["bg", "color", "btn_bg", "btn_color"] as const) { const c = hex(o[k]); if (c) st[k] = c; }
  const f = font(o.font); if (f) st.font = f;
  if (o.size === "sm" || o.size === "lg") st.size = o.size;
  if (o.align === "left" || o.align === "center") st.align = o.align;
  return Object.keys(st).length ? st : undefined;
}

/** নিরাপদ inline style (শুধু যাচাই করা মান) */
export function styleAttr(st: SectionStyle | undefined): string {
  if (!st) return "";
  const out: string[] = [];
  if (st.bg) out.push(`--lp-bg:${st.bg}`);
  if (st.color) out.push(`--lp-fg:${st.color}`);
  if (st.btn_bg) out.push(`--lp-btn:${st.btn_bg}`);
  if (st.btn_color) out.push(`--lp-btn-fg:${st.btn_color}`);
  if (st.font && FONTS[st.font]) out.push(`font-family:${FONTS[st.font]!.family},sans-serif`);
  if (st.align) out.push(`text-align:${st.align}`);
  return out.join(";");
}

/** পেজে যত ফন্ট লাগবে তার Google Fonts লিংক (না লাগলে null) */
export function fontsHref(l: Landing): string | null {
  const keys = new Set<string>();
  if (l.style?.font) keys.add(l.style.font);
  for (const x of l.sections) if (x.enabled && x.style?.font) keys.add(x.style.font);
  const q = [...keys].filter((k) => FONTS[k]).map((k) => `family=${FONTS[k]!.query}`);
  return q.length ? `https://fonts.googleapis.com/css2?${q.join("&")}&display=swap` : null;
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const imgKey = (v: unknown) => {
  const k = s(v, 200);
  return /^[a-z0-9/_.-]+$/i.test(k) && !k.includes("..") ? k : "";
};

/** যেকোনো ইনপুট থেকে নিরাপদ, বৈধ ল্যান্ডিং */
export function normalizeLanding(input: unknown): Landing {
  const raw = (input && typeof input === "object" ? (input as { sections?: unknown }).sections : null);
  const list = Array.isArray(raw) ? raw.slice(0, 30) : [];
  const sections: Section[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const type = it.type as SectionType;
    if (!SECTION_TYPES.includes(type)) continue;
    const d = (it.data && typeof it.data === "object" ? it.data : {}) as Record<string, unknown>;
    const data: Section["data"] = {};
    switch (type) {
      case "hero":
        data.headline = s(d.headline, 200);
        data.subheadline = s(d.subheadline, 500);
        data.show_price = d.show_price !== false;
        data.button_text = s(d.button_text, 60) || "এখনই অর্ডার করুন";
        break;
      case "gallery": {
        // ছবি আর তার নিচের লেখা একসাথে যাচাই — খারাপ ছবি বাদ গেলে লেখাও বাদ
        const imgs = Array.isArray(d.images) ? d.images : [];
        const caps = Array.isArray(d.captions) ? d.captions : [];
        const pairs = imgs.slice(0, 24).map((k, i) => [imgKey(k), s(caps[i], 120)] as const).filter(([k]) => k).slice(0, 12);
        data.images = pairs.map(([k]) => k);
        if (d.layout === "grid") {
          data.layout = "grid";
          const c = parseInt(String(d.cols ?? 2), 10);
          data.cols = c === 1 || c === 3 ? c : 2;
          data.ratio = d.ratio === "original" || d.ratio === "portrait" ? d.ratio : "square";
          if (pairs.some(([, c2]) => c2)) data.captions = pairs.map(([, c2]) => c2);
        }
        break;
      }
      case "heading":
        data.headline = s(d.headline, 200);
        data.subheadline = s(d.subheadline, 500);
        data.hsize = typeof d.hsize === "string" && Object.hasOwn(HEADING_SIZES, d.hsize) ? (d.hsize as HeadingSize) : "md";
        data.align = d.align === "left" || d.align === "right" ? d.align : "center";
        break;
      case "image_text":
        data.images = (Array.isArray(d.images) ? d.images : []).map(imgKey).filter(Boolean).slice(0, 1);
        data.title = s(d.title, 200);
        data.html = sanitizeHtml(typeof d.html === "string" ? d.html.slice(0, 20_000) : "");
        data.button_text = s(d.button_text, 60);
        data.side = d.side === "right" ? "right" : "left";
        data.mobile_first = d.mobile_first === "text" ? "text" : "image";
        break;
      case "video":
        data.youtube_url = youtubeId(s(d.youtube_url, 300)) ? s(d.youtube_url, 300) : "";
        break;
      case "text":
        data.html = sanitizeHtml(typeof d.html === "string" ? d.html : "");
        break;
      case "benefits":
      case "trust":
        data.title = s(d.title, 120);
        data.items = (Array.isArray(d.items) ? d.items : []).map((x) => s(x, 200)).filter(Boolean).slice(0, 20);
        break;
      case "reviews":
        data.title = s(d.title, 120);
        data.reviews = (Array.isArray(d.reviews) ? d.reviews : []).slice(0, 30).map((r) => {
          const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
          const rating = Math.min(5, Math.max(1, parseInt(String(o.rating ?? 5), 10) || 5));
          return { name: s(o.name, 60), rating, text: s(o.text, 1000), image: imgKey(o.image) };
        }).filter((r) => r.name || r.text || r.image);
        break;
      case "faq":
        data.title = s(d.title, 120);
        data.faqs = (Array.isArray(d.faqs) ? d.faqs : []).slice(0, 30).map((f) => {
          const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
          return { q: s(o.q, 300), a: s(o.a, 2000) };
        }).filter((f) => f.q);
        break;
      case "countdown": {
        data.title = s(d.title, 120);
        data.mode = d.mode === "fixed" ? "fixed" : "evergreen";
        const ends = s(d.ends_at, 30);
        data.ends_at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ends) ? ends.slice(0, 16) : "";
        data.minutes = Math.min(7 * 24 * 60, Math.max(1, parseInt(String(d.minutes ?? 120), 10) || 120));
        break;
      }
      case "order_form":
        data.title = s(d.title, 200) || "অর্ডার করতে নিচের ফর্মটি পূরণ করুন";
        break;
      case "image":
        data.images = (Array.isArray(d.images) ? d.images : []).map(imgKey).filter(Boolean).slice(0, 1);
        data.title = s(d.title, 200);
        break;
      case "before_after":
        data.title = s(d.title, 120);
        data.images = (Array.isArray(d.images) ? d.images : []).map(imgKey).slice(0, 2);
        data.labels = [0, 1].map((i) => s(Array.isArray(d.labels) ? d.labels[i] : "", 40) || (i ? "পরে" : "আগে"));
        break;
      case "steps":
        data.title = s(d.title, 120);
        data.items = (Array.isArray(d.items) ? d.items : []).map((x) => s(x, 200)).filter(Boolean).slice(0, 8);
        break;
      case "comparison":
        data.title = s(d.title, 120);
        data.labels = [0, 1].map((i) => s(Array.isArray(d.labels) ? d.labels[i] : "", 40) || (i ? "অন্যরা" : "আমাদের পণ্য"));
        data.rows = (Array.isArray(d.rows) ? d.rows : []).slice(0, 12).map((r) => {
          const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
          return { label: s(o.label, 120), us: s(o.us, 120), them: s(o.them, 120) };
        }).filter((r) => r.label);
        break;
      case "guarantee":
        data.title = s(d.title, 160) || "১০০% সন্তুষ্টির গ্যারান্টি";
        data.subheadline = s(d.subheadline, 600);
        break;
      case "cta":
        data.headline = s(d.headline, 200);
        data.button_text = s(d.button_text, 60) || "এখনই অর্ডার করুন";
        data.show_price = d.show_price !== false;
        break;
    }
    const style = normalizeStyle(it.style);
    sections.push({ id: s(it.id, 40).replace(/[^a-z0-9_-]/gi, "") || crypto.randomUUID().slice(0, 8), type, enabled: it.enabled !== false, data, ...(style ? { style } : {}) });
  }
  // অর্ডার ফর্ম সবসময় থাকবে, একবারই, আর চালু
  const forms = sections.filter((x) => x.type === "order_form");
  if (!forms.length) sections.push({ id: "order", type: "order_form", enabled: true, data: { title: "অর্ডার করতে নিচের ফর্মটি পূরণ করুন" } });
  const ids = new Set<string>();
  for (const x of sections) {
    while (ids.has(x.id)) x.id = `${x.id.slice(0, 30)}-${crypto.randomUUID().slice(0, 4)}`;
    ids.add(x.id);
  }
  let seen = false;
  const ist = (input as { style?: { font?: unknown; header?: unknown; footer?: unknown } } | null)?.style;
  const pst: PageStyle = {};
  const pf = font(ist?.font); if (pf) pst.font = pf;
  if (ist?.header === "hide") pst.header = "hide";
  if (ist?.footer === "hide") pst.footer = "hide";
  return {
    ...(Object.keys(pst).length ? { style: pst } : {}),
    sections: sections
      .filter((x) => (x.type === "order_form" ? (seen ? false : (seen = true)) : true))
      .map((x) => (x.type === "order_form" ? { ...x, enabled: true } : x)),
  };
}

export function parseLanding(json: string | null | undefined): Landing | null {
  if (!json) return null;
  try {
    return normalizeLanding(JSON.parse(json));
  } catch {
    return null;
  }
}

/** বিল্ডার প্রথমবার খুললে পণ্যের তথ্য দিয়ে সাজানো টেমপ্লেট */
export function defaultLanding(p: Product): Landing {
  const sec = (type: SectionType, data: Section["data"], enabled = true): Section => ({ id: type, type, enabled, data });
  return normalizeLanding({
    sections: [
      sec("hero", { headline: p.headline || p.name, subheadline: p.short_desc || "", show_price: true, button_text: "এখনই অর্ডার করুন" }),
      sec("gallery", { images: p.image ? [p.image] : [] }),
      sec("countdown", { title: "অফার শেষ হতে বাকি", mode: "evergreen", minutes: 120 }, false),
      sec("video", { youtube_url: p.youtube_url || "" }, !!p.youtube_url),
      sec("benefits", { title: "কেন আমাদের পণ্য নেবেন?", items: ["১০০% অরিজিনাল পণ্য", "পণ্য হাতে পেয়ে টাকা দিন", "সারাদেশে হোম ডেলিভারি"] }),
      sec("text", { html: p.details_html || "" }, !!p.details_html),
      sec("reviews", { title: "কাস্টমারদের মতামত", reviews: [] }, false),
      sec("faq", { title: "সাধারণ প্রশ্ন", faqs: [{ q: "ডেলিভারি কত দিনে পাব?", a: "ঢাকার ভিতরে ১-২ দিন, বাইরে ২-৪ দিন।" }] }),
      sec("trust", { title: "", items: ["ক্যাশ অন ডেলিভারি", "সারাদেশে ডেলিভারি", "সহজ রিটার্ন"] }),
      sec("order_form", { title: "অর্ডার করতে নিচের ফর্মটি পূরণ করুন" }),
    ],
  });
}

/** ল্যান্ডিং পেজে দোকানের হেডার/ফুটার লুকানো আছে কি না */
export function landingChrome(json: string | null | undefined): { hideHeader: boolean; hideFooter: boolean } {
  const l = parseLanding(json);
  return { hideHeader: l?.style?.header === "hide", hideFooter: l?.style?.footer === "hide" };
}
