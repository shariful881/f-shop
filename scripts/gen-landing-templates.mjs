// SellxBD-এর শুরুর ল্যান্ডিং টেমপ্লেটগুলোর SQL বানায় (migrations/platform/0006_landing_templates.sql)
// চালান: node scripts/gen-landing-templates.mjs > migrations/platform/0006_landing_templates.sql
const S = (id, type, data, style, enabled = true) => ({ id, type, enabled, data, ...(style ? { style } : {}) });
const faq = (extra = []) => S("faq", "faq", { title: "সাধারণ প্রশ্ন", faqs: [
  { q: "ডেলিভারি কত দিনে পাব?", a: "ঢাকার ভিতরে ১-২ দিন, ঢাকার বাইরে ২-৪ দিন।" },
  { q: "টাকা কখন দিতে হবে?", a: "পণ্য হাতে পেয়ে দেখে তারপর টাকা দিন (ক্যাশ অন ডেলিভারি)।" },
  ...extra,
] });
const reviews = (style) => S("reviews", "reviews", { title: "কাস্টমারদের মতামত", reviews: [] }, style);
const order = (style) => S("order", "order_form", { title: "অর্ডার করতে নিচের ফর্মটি পূরণ করুন" }, style);

const T = [
  {
    name: "ক্লাসিক অফার", category: "সাধারণ", description: "যেকোনো পণ্যের জন্য সহজ, পরিষ্কার পেজ",
    landing: { style: { font: "hind" }, sections: [
      S("hero", "hero", { headline: "", subheadline: "সীমিত সময়ের বিশেষ অফার — আজই অর্ডার করুন", show_price: true, button_text: "এখনই অর্ডার করুন" }, { bg: "#0f766e", color: "#ffffff", btn_bg: "#f97316", btn_color: "#ffffff" }),
      S("gallery", "gallery", { images: [] }),
      S("benefits", "benefits", { title: "কেন আমাদের পণ্য নেবেন?", items: ["১০০% অরিজিনাল পণ্য", "পণ্য হাতে পেয়ে টাকা দিন", "সারাদেশে হোম ডেলিভারি"] }),
      S("text", "text", { html: "" }),
      S("trust", "trust", { title: "", items: ["ক্যাশ অন ডেলিভারি", "সারাদেশে ডেলিভারি", "সহজ রিটার্ন"] }, { bg: "#f0fdfa" }),
      order({ bg: "#f8fafc", btn_bg: "#0f766e", btn_color: "#ffffff" }),
      faq(),
    ] },
  },
  {
    name: "ফ্যাশন ও পোশাক", category: "ফ্যাশন", description: "পোশাক, শাড়ি, থ্রি-পিস, অন্তর্বাস",
    landing: { style: { font: "anek" }, sections: [
      S("hero", "hero", { headline: "", subheadline: "আরামদায়ক কাপড়, নিখুঁত ফিটিং", show_price: true, button_text: "পছন্দের সাইজ অর্ডার করুন" }, { bg: "#fff1f2", color: "#881337", btn_bg: "#e11d48", btn_color: "#ffffff" }),
      S("gallery", "gallery", { images: [] }),
      S("countdown", "countdown", { title: "অফার শেষ হতে বাকি", mode: "evergreen", minutes: 120 }, { btn_bg: "#be123c", btn_color: "#ffffff" }),
      S("benefits", "benefits", { title: "কেন এই পোশাক?", items: ["প্রিমিয়াম মানের কাপড়", "ধোয়ার পরও রং নষ্ট হয় না", "সব সাইজ পাওয়া যায়"] }, { btn_bg: "#e11d48" }),
      S("text", "text", { html: "" }),
      reviews(),
      order({ bg: "#fff1f2", btn_bg: "#e11d48", btn_color: "#ffffff" }),
      faq([{ q: "সাইজ না মিললে কী করব?", a: "ডেলিভারির সময় দেখে নিন, সাইজ না মিললে বদলে দেওয়া হবে।" }]),
    ] },
  },
  {
    name: "বেবি প্রোডাক্ট", category: "বেবি প্রোডাক্ট", description: "দোলনা, খেলনা, বাচ্চার পোশাক ও জিনিস",
    landing: { style: { font: "baloo" }, sections: [
      S("hero", "hero", { headline: "", subheadline: "আপনার সোনামণির আরাম আর নিরাপত্তার জন্য", show_price: true, button_text: "এখনই অর্ডার করুন" }, { bg: "#eff6ff", color: "#1e3a8a", btn_bg: "#f59e0b", btn_color: "#1f2937" }),
      S("gallery", "gallery", { images: [] }),
      S("benefits", "benefits", { title: "মা-বাবারা কেন পছন্দ করছেন", items: ["বাচ্চার জন্য নিরাপদ উপকরণ", "মজবুত ও টেকসই", "সহজে ব্যবহার করা যায়"] }, { bg: "#fffbeb", btn_bg: "#f59e0b", btn_color: "#1f2937" }),
      S("video", "video", { youtube_url: "" }),
      S("text", "text", { html: "" }),
      reviews(),
      S("trust", "trust", { title: "", items: ["ক্যাশ অন ডেলিভারি", "সারাদেশে ডেলিভারি", "চেক করে টাকা দিন"] }),
      order({ bg: "#eff6ff", btn_bg: "#2563eb", btn_color: "#ffffff" }),
      faq(),
    ] },
  },
  {
    name: "গ্যাজেট ও ইলেকট্রনিক্স", category: "গ্যাজেট", description: "ডার্ক ডিজাইন — গ্যাজেট, এক্সেসরিজ, টুলস",
    landing: { style: { font: "noto" }, sections: [
      S("hero", "hero", { headline: "", subheadline: "স্মার্ট ফিচার, সাশ্রয়ী দাম", show_price: true, button_text: "এখনই কিনুন" }, { bg: "#0f172a", color: "#f8fafc", btn_bg: "#22c55e", btn_color: "#052e16", size: "lg" }),
      S("gallery", "gallery", { images: [] }, { bg: "#0f172a" }),
      S("video", "video", { youtube_url: "" }),
      S("benefits", "benefits", { title: "মূল ফিচার", items: ["দীর্ঘস্থায়ী ব্যাটারি", "মজবুত বিল্ড কোয়ালিটি", "সহজ ব্যবহার"] }, { btn_bg: "#22c55e", btn_color: "#052e16" }),
      S("text", "text", { html: "" }),
      S("countdown", "countdown", { title: "অফার দামে পাবেন আর", mode: "evergreen", minutes: 180 }, { btn_bg: "#0f172a", btn_color: "#f8fafc" }),
      S("trust", "trust", { title: "", items: ["ওয়ারেন্টি সহ", "ক্যাশ অন ডেলিভারি", "সারাদেশে ডেলিভারি"] }),
      order({ bg: "#f1f5f9", btn_bg: "#16a34a", btn_color: "#ffffff" }),
      faq([{ q: "ওয়ারেন্টি আছে?", a: "পণ্যের বিবরণে ওয়ারেন্টির তথ্য দেওয়া আছে।" }]),
    ] },
  },
  {
    name: "কসমেটিক্স ও বিউটি", category: "কসমেটিক্স", description: "স্কিন কেয়ার, হেয়ার কেয়ার, মেকআপ",
    landing: { style: { font: "hind" }, sections: [
      S("hero", "hero", { headline: "", subheadline: "প্রাকৃতিক সৌন্দর্যের যত্নে", show_price: true, button_text: "অর্ডার করুন" }, { bg: "#faf5ff", color: "#581c87", btn_bg: "#9333ea", btn_color: "#ffffff" }),
      S("gallery", "gallery", { images: [] }),
      S("benefits", "benefits", { title: "ব্যবহারে যা পাবেন", items: ["ত্বকের জন্য কোমল", "নিয়মিত ব্যবহারে ভালো ফল", "অরিজিনাল পণ্য"] }, { btn_bg: "#9333ea" }),
      S("text", "text", { html: "" }),
      reviews(),
      S("countdown", "countdown", { title: "অফার শেষ হতে বাকি", mode: "evergreen", minutes: 90 }, { btn_bg: "#7e22ce", btn_color: "#ffffff" }),
      order({ bg: "#faf5ff", btn_bg: "#9333ea", btn_color: "#ffffff" }),
      faq([{ q: "কীভাবে ব্যবহার করব?", a: "পণ্যের সাথে ব্যবহারবিধি দেওয়া থাকে।" }]),
    ] },
  },
  {
    name: "অর্গানিক ও খাবার", category: "ফুড/অর্গানিক", description: "মধু, ঘি, তেল, বীজ, অর্গানিক খাবার",
    landing: { style: { font: "anek" }, sections: [
      S("hero", "hero", { headline: "", subheadline: "খাঁটি ও ভেজালমুক্ত — সরাসরি উৎস থেকে", show_price: true, button_text: "এখনই অর্ডার করুন" }, { bg: "#f0fdf4", color: "#14532d", btn_bg: "#16a34a", btn_color: "#ffffff" }),
      S("gallery", "gallery", { images: [] }),
      S("text", "text", { html: "" }),
      S("benefits", "benefits", { title: "কেন আমাদেরটা নেবেন?", items: ["১০০% খাঁটি", "স্বাস্থ্যসম্মত প্যাকেজিং", "পণ্য হাতে পেয়ে টাকা দিন"] }, { bg: "#fefce8", btn_bg: "#ca8a04", btn_color: "#ffffff" }),
      S("trust", "trust", { title: "", items: ["ভেজালমুক্ত", "ক্যাশ অন ডেলিভারি", "সারাদেশে ডেলিভারি"] }),
      reviews(),
      order({ bg: "#f0fdf4", btn_bg: "#15803d", btn_color: "#ffffff" }),
      faq(),
    ] },
  },
];

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
let out = `-- রেডিমেড ল্যান্ডিং পেজ টেমপ্লেট (সুপার অ্যাডমিন যোগ/এডিট করে, সব দোকানে ফ্রি)
CREATE TABLE landing_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT,
  json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_landing_templates_active ON landing_templates (active, sort_order);
`;
T.forEach((t, i) => {
  out += `INSERT INTO landing_templates (name, category, description, json, sort_order) VALUES (${q(t.name)}, ${q(t.category)}, ${q(t.description)}, ${q(JSON.stringify(t.landing))}, ${i + 1});\n`;
});
process.stdout.write(out);
