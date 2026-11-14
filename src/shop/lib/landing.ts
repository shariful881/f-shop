/**
 * ল্যান্ডিং পেজ বিল্ডার — সেকশনের ধরন আর ডাটা যাচাই।
 * সব ইনপুট সার্ভারে পরিষ্কার করা হয় (দৈর্ঘ্য, সংখ্যা, HTML)।
 */
import { sanitizeHtml } from "./sanitize";
import { youtubeId } from "./format";
import type { Product } from "./products";

export const SECTION_TYPES = ["hero", "gallery", "video", "text", "benefits", "reviews", "faq", "countdown", "trust", "order_form"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABEL: Record<SectionType, string> = {
  hero: "বড় শিরোনাম",
  gallery: "ছবির গ্যালারি",
  video: "ভিডিও",
  text: "লেখা / বিস্তারিত",
  benefits: "সুবিধার তালিকা",
  reviews: "কাস্টমার রিভিউ",
  faq: "প্রশ্নোত্তর",
  countdown: "কাউন্টডাউন টাইমার",
  trust: "বিশ্বাসের ব্যাজ",
  order_form: "অর্ডার ফর্ম",
};

export type Review = { name: string; rating: number; text: string; image: string };
export type Section = {
  id: string;
  type: SectionType;
  enabled: boolean;
  data: {
    headline?: string; subheadline?: string; show_price?: boolean; button_text?: string;
    title?: string; images?: string[]; youtube_url?: string; html?: string;
    items?: string[]; reviews?: Review[]; faqs?: { q: string; a: string }[];
    mode?: "fixed" | "evergreen"; ends_at?: string; minutes?: number;
  };
};
export type Landing = { sections: Section[] };

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
      case "gallery":
        data.images = (Array.isArray(d.images) ? d.images : []).map(imgKey).filter(Boolean).slice(0, 12);
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
    }
    sections.push({ id: s(it.id, 40) || crypto.randomUUID().slice(0, 8), type, enabled: it.enabled !== false, data });
  }
  // অর্ডার ফর্ম সবসময় থাকবে, একবারই, আর চালু
  const forms = sections.filter((x) => x.type === "order_form");
  if (!forms.length) sections.push({ id: "order", type: "order_form", enabled: true, data: { title: "অর্ডার করতে নিচের ফর্মটি পূরণ করুন" } });
  let seen = false;
  return {
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
