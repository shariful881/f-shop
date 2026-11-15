/**
 * ধাপ ৮: AI দিয়ে ল্যান্ডিং পেজের বাংলা লেখা — Cloudflare Workers AI (দিনে ১০,০০০ neuron ফ্রি)।
 * ফ্রি সীমার মধ্যে থাকতে: প্রতি দোকানে দিনে ১০ বার, সব দোকান মিলে দিনে AI_DAILY_CAP বার।
 */
import type { Landing, Section, SectionType } from "./landing";
import { normalizeLanding } from "./landing";
import type { Product } from "./products";
import type { Settings } from "./settings";

export const AI_MODELS = ["@cf/google/gemma-4-26b-a4b-it", "@cf/google/gemma-3-12b-it", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"];
export const AI_SHOP_DAILY = 10;
export const AI_DAILY_CAP = 150;

export type AiCopy = {
  headline: string;
  subheadline: string;
  button_text: string;
  intro: string;               // ২–৩ বাক্যের বর্ণনা
  benefits_title: string;
  benefits: string[];
  comparison: { label: string; us: string; them: string }[];
  guarantee: string;
  faqs: { q: string; a: string }[];
  cta: string;
};

export type AiEnv = { AI?: Ai; IS_TEST?: boolean; PLATFORM_DB: D1Database };

const TONES: Record<string, string> = {
  friendly: "বন্ধুর মতো, সহজ আর আন্তরিক",
  premium: "প্রিমিয়াম, মার্জিত আর আত্মবিশ্বাসী",
  urgent: "অফার চলছে — উৎসাহী, কিন্তু মিথ্যা দাবি ছাড়া",
};
export const TONE_LABEL: Record<string, string> = { friendly: "সহজ ও আন্তরিক", premium: "প্রিমিয়াম", urgent: "অফার/জরুরি" };

function prompt(p: Product, about: string, tone: string, shop: string) {
  return [
    {
      role: "system",
      content:
        "তুমি বাংলাদেশের ফেসবুক-ভিত্তিক অনলাইন দোকানের জন্য বিক্রয়ের লেখা লেখো। শুধু শুদ্ধ, সহজ বাংলায় লিখবে (ইংরেজি শব্দ যত কম)। " +
        "কোনো মিথ্যা বা যাচাই করা যায় না এমন দাবি (যেমন 'দেশের সেরা', নির্দিষ্ট পরিসংখ্যান, ডাক্তারি দাবি, বানানো রিভিউ) লিখবে না। " +
        "উত্তর দেবে শুধু একটা JSON অবজেক্ট — আগে-পরে কোনো লেখা, ব্যাখ্যা বা ``` নয়।",
    },
    {
      role: "user",
      content:
        `দোকান: ${shop}\nপণ্য: ${p.name}\nদাম: ${p.price} টাকা${p.compare_price && p.compare_price > p.price ? ` (আগে ${p.compare_price} টাকা)` : ""}\n` +
        `পণ্য সম্পর্কে দোকানদারের কথা: ${about}\nলেখার ধরন: ${TONES[tone] ?? TONES.friendly}\n\n` +
        "এই কাঠামোয় JSON দাও:\n" +
        '{"headline":"বড় শিরোনাম (১২ শব্দের মধ্যে)","subheadline":"ছোট উপশিরোনাম (১ বাক্য)","button_text":"বাটনের লেখা (৩-৪ শব্দ)",' +
        '"intro":"পণ্যের ২-৩ বাক্যের বর্ণনা","benefits_title":"সুবিধার অংশের শিরোনাম","benefits":["৫টা ছোট সুবিধা"],' +
        '"comparison":[{"label":"বিষয়","us":"আমাদের পণ্যে","them":"সাধারণ পণ্যে"}],"guarantee":"গ্যারান্টি/রিটার্নের ১ বাক্য (সাধারণ, নির্দিষ্ট দিন নয়)",' +
        '"faqs":[{"q":"প্রশ্ন","a":"উত্তর"}],"cta":"শেষে অর্ডারে ডাকার ১ বাক্য"}\n' +
        "comparison-এ ৩-৪টা সারি, faqs-এ ৪টা প্রশ্ন (ডেলিভারি, পেমেন্ট আর পণ্য নিয়ে)। ক্যাশ অন ডেলিভারি আর সারাদেশে ডেলিভারির কথা বলা যাবে।",
    },
  ];
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** মডেলের লেখা থেকে JSON বের করা (``` বা আগে-পরে লেখা থাকলেও) */
export function parseAiCopy(text: string): AiCopy | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const copy: AiCopy = {
    headline: str(j.headline, 200),
    subheadline: str(j.subheadline, 400),
    button_text: str(j.button_text, 40) || "এখনই অর্ডার করুন",
    intro: str(j.intro, 800),
    benefits_title: str(j.benefits_title, 100) || "কেন এই পণ্য নেবেন?",
    benefits: arr(j.benefits).map((x) => str(x, 160)).filter(Boolean).slice(0, 8),
    comparison: arr(j.comparison).map((r) => {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return { label: str(o.label, 100), us: str(o.us, 100), them: str(o.them, 100) };
    }).filter((r) => r.label && r.us).slice(0, 6),
    guarantee: str(j.guarantee, 400),
    faqs: arr(j.faqs).map((f) => {
      const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      return { q: str(o.q, 200), a: str(o.a, 600) };
    }).filter((f) => f.q && f.a).slice(0, 8),
    cta: str(j.cta, 200),
  };
  return copy.headline && copy.benefits.length >= 2 ? copy : null;
}

const utcDay = () => new Date().toISOString().slice(0, 10);

/** সব দোকান মিলে দিনের সীমা — সীমা পার হলে false */
async function takeGlobalSlot(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare("INSERT INTO ai_usage (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1 RETURNING calls")
    .bind(utcDay())
    .first<{ calls: number }>();
  return (row?.calls ?? 1) <= AI_DAILY_CAP;
}

export async function generateCopy(env: AiEnv, s: Settings, p: Product, about: string, tone: string): Promise<AiCopy | { error: string }> {
  const messages = prompt(p, about, tone, s.site_name || "দোকান");
  // টেস্টে আসল AI চলে না — সেটিংসে রাখা উত্তর
  if (env.IS_TEST) return parseAiCopy(s.test_ai_response || "") ?? { error: "AI-এর উত্তর বোঝা যায়নি, আবার চেষ্টা করুন" };
  if (!env.AI) return { error: "AI এখন চালু নেই" };
  if (!(await takeGlobalSlot(env.PLATFORM_DB))) return { error: "আজকের AI-এর সীমা শেষ — কাল আবার চেষ্টা করুন" };
  for (const model of AI_MODELS) {
    try {
      const out = (await env.AI.run(model as Parameters<Ai["run"]>[0], { messages, max_tokens: 1800, temperature: 0.6 } as never)) as { response?: unknown };
      const text = typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? "");
      const copy = parseAiCopy(text);
      if (copy) return copy;
    } catch (e) {
      console.error("ai error", model, e);
    }
  }
  return { error: "AI এখন উত্তর দিতে পারছে না, একটু পরে আবার চেষ্টা করুন" };
}

/**
 * এখনকার ল্যান্ডিং পেজে AI-এর লেখা বসানো: ছবি, ভিডিও, অর্ডার ফর্ম, ডিজাইন যেমন আছে থাকে;
 * লেখার সেকশন (শিরোনাম, বর্ণনা, সুবিধা, তুলনা, গ্যারান্টি, প্রশ্নোত্তর, শেষের বাটন) নতুন করে।
 */
export function applyCopy(current: Landing, c: AiCopy): Landing {
  const sec = (type: SectionType, data: Section["data"]): Section => ({ id: `ai-${type}`, type, enabled: true, data });
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const textTypes = new Set<SectionType>(["hero", "text", "benefits", "comparison", "guarantee", "faq", "cta"]);
  const keep = current.sections.filter((x) => !textTypes.has(x.type));
  const gallery = keep.filter((x) => x.type === "gallery" || x.type === "image" || x.type === "video");
  const rest = keep.filter((x) => !gallery.includes(x) && x.type !== "order_form");
  const form = keep.find((x) => x.type === "order_form");
  const oldHero = current.sections.find((x) => x.type === "hero");
  const sections: Section[] = [
    { ...(oldHero ?? sec("hero", {})), enabled: true, data: { headline: c.headline, subheadline: c.subheadline, show_price: oldHero?.data.show_price !== false, button_text: c.button_text } },
    ...gallery,
    ...(c.intro ? [sec("text", { html: `<p>${esc(c.intro)}</p>` })] : []),
    sec("benefits", { title: c.benefits_title, items: c.benefits }),
    ...(c.comparison.length >= 2 ? [sec("comparison", { title: "অন্যদের সাথে তুলনা", labels: ["আমাদের পণ্য", "সাধারণ পণ্য"], rows: c.comparison })] : []),
    ...rest,
    ...(c.guarantee ? [sec("guarantee", { title: "নিশ্চিন্তে কিনুন", subheadline: c.guarantee })] : []),
    ...(c.faqs.length ? [sec("faq", { title: "সাধারণ প্রশ্ন", faqs: c.faqs })] : []),
    ...(c.cta ? [sec("cta", { headline: c.cta, button_text: c.button_text, show_price: true })] : []),
    ...(form ? [form] : []),
  ];
  return normalizeLanding({ ...current, sections });
}
