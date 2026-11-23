/**
 * মিডিয়া লাইব্রেরি — দোকানের সব ছবি এক জায়গায়।
 * ছবি আগের মতোই `images` টেবিলে (lib/images.ts); এখানে শুধু তালিকা, ফোল্ডার,
 * কোথায় ব্যবহার হচ্ছে আর মোছার আগে যাচাই।
 */

export type MediaFolder = "product" | "banner" | "logo" | "landing" | "theme" | "other";

export const FOLDER_LABEL: Record<MediaFolder, string> = {
  product: "পণ্য",
  banner: "ব্যানার",
  logo: "লোগো ও আইকন",
  landing: "ল্যান্ডিং পেজ",
  theme: "থিম",
  other: "অন্যান্য",
};

/** key-এর শুরুর অংশ দেখে ফোল্ডার — আলাদা কলাম লাগে না, পুরনো ছবিও নিজে থেকে ঠিক ফোল্ডারে */
export function folderOf(key: string): MediaFolder {
  const top = key.split("/")[0] ?? "";
  if (top === "p") return "product";
  if (/^banner\d?$/.test(top)) return "banner";
  if (top === "logo" || top === "favicon" || top === "seo_image") return "logo";
  if (top === "lp") return "landing";
  if (top === "theme") return "theme";
  return "other";
}

/** নতুন আপলোডের key — ফোল্ডার অনুযায়ী শুরুর অংশ */
export function newMediaKey(folder: string, ext: string): string {
  const prefix = folder === "banner" ? "banner" : folder === "logo" ? "logo" : folder === "landing" ? "lp" : folder === "theme" ? "theme" : "p";
  return `${prefix}/${crypto.randomUUID()}.${ext}`;
}

/** লাইব্রেরিতে দেখানো হয় না: সাপোর্টের স্ক্রিনশট (দোকানদারের নিজের নয়) */
const HIDDEN = "support/%";

export type MediaItem = {
  key: string;
  type: string;
  size: number;
  name: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  folder: MediaFolder;
  used: string[]; // কোথায় ব্যবহার হচ্ছে (মানুষের পড়ার মতো)
};

/** দোকানের যেসব জায়গায় ছবির key থাকতে পারে — সব লেখা একসাথে, তারপর key খোঁজা */
async function usageMap(db: D1Database): Promise<(key: string) => string[]> {
  const [settings, products, templates, pages] = await Promise.all([
    db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>(),
    db.prepare("SELECT name, image, gallery_json, landing_json, details_html FROM products").all<{ name: string; image: string | null; gallery_json: string | null; landing_json: string | null; details_html: string | null }>(),
    db.prepare("SELECT name, json FROM my_templates").all<{ name: string; json: string }>(),
    db.prepare("SELECT title, content FROM pages").all<{ title: string; content: string }>(),
  ]);
  const SETTING_LABEL: Record<string, string> = {
    logo: "দোকানের লোগো", favicon: "ফেভিকন", seo_image: "শেয়ার ইমেজ",
    banner_1: "হোমের ব্যানার ১", banner_2: "হোমের ব্যানার ২", banner_3: "হোমের ব্যানার ৩",
  };
  const places: { label: string; text: string }[] = [];
  for (const s of settings.results) {
    if (!s.value) continue;
    places.push({ label: SETTING_LABEL[s.key] ?? (s.key.startsWith("theme_cfg_") ? "থিমের সেটিংস" : "সেটিংস"), text: s.value });
  }
  for (const p of products.results) {
    if (p.image) places.push({ label: `পণ্য: ${p.name}`, text: p.image });
    if (p.gallery_json) places.push({ label: `পণ্যের গ্যালারি: ${p.name}`, text: p.gallery_json });
    if (p.landing_json) places.push({ label: `ল্যান্ডিং: ${p.name}`, text: p.landing_json });
    if (p.details_html) places.push({ label: `পণ্যের বিবরণ: ${p.name}`, text: p.details_html });
  }
  for (const t of templates.results) places.push({ label: `নিজের টেমপ্লেট: ${t.name}`, text: t.json });
  for (const p of pages.results) places.push({ label: `পেজ: ${p.title}`, text: p.content });
  return (key) => [...new Set(places.filter((p) => p.text.includes(key)).map((p) => p.label))];
}

export async function listMedia(
  db: D1Database,
  opts: { folder?: MediaFolder | "unused" | ""; q?: string; limit?: number; offset?: number } = {},
): Promise<{ items: MediaItem[]; total: number; bytes: number; hasMore: boolean }> {
  const { results } = await db
    .prepare(`SELECT key, type, size, name, alt, width, height, created_at FROM images WHERE key NOT LIKE ? ORDER BY created_at DESC, key`)
    .bind(HIDDEN)
    .all<Omit<MediaItem, "folder" | "used">>();
  const usedBy = await usageMap(db);
  let items: MediaItem[] = results.map((r) => ({ ...r, folder: folderOf(r.key), used: usedBy(r.key) }));
  const bytes = items.reduce((n, i) => n + i.size, 0);
  const total = items.length;
  if (opts.folder === "unused") items = items.filter((i) => i.used.length === 0);
  else if (opts.folder) items = items.filter((i) => i.folder === opts.folder);
  const q = (opts.q || "").trim().toLowerCase();
  if (q) items = items.filter((i) => (i.name || "").toLowerCase().includes(q) || i.used.some((u) => u.toLowerCase().includes(q)));
  const limit = opts.limit ?? 60;
  const offset = opts.offset ?? 0;
  return { items: items.slice(offset, offset + limit), total, bytes, hasMore: items.length > offset + limit };
}

/** একটা ছবি কোথায় ব্যবহার হচ্ছে */
export async function mediaUsage(db: D1Database, key: string): Promise<string[]> {
  return (await usageMap(db))(key);
}

/** আপলোডের পরে নাম/মাপ লিখে রাখা (images.put টেবিলের বাকি কলাম মুছে দেয়, তাই পরে) */
export async function recordMedia(db: D1Database, key: string, meta: { name?: string; width?: number; height?: number; alt?: string }) {
  const name = (meta.name || "").replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || null;
  const w = meta.width && meta.width > 0 && meta.width < 20000 ? Math.round(meta.width) : null;
  const h = meta.height && meta.height > 0 && meta.height < 20000 ? Math.round(meta.height) : null;
  await db.prepare("UPDATE images SET name = COALESCE(?, name), width = COALESCE(?, width), height = COALESCE(?, height), alt = COALESCE(?, alt) WHERE key = ?")
    .bind(name, w, h, meta.alt?.slice(0, 200) || null, key).run();
}

/** key টা দোকানে সত্যিই আছে আর লাইব্রেরির ছবি কিনা — বাছাই করা ছবি বসানোর আগে */
export async function mediaExists(db: D1Database, key: string): Promise<boolean> {
  if (!/^[a-z0-9_]+\/[a-zA-Z0-9._-]+$/.test(key) || key.startsWith("support/")) return false;
  return !!(await db.prepare("SELECT 1 FROM images WHERE key = ?").bind(key).first());
}

/** প্রতি দোকানে ছবির জায়গা (নরম সীমা — ছাড়ালে সতর্কবার্তা, আপলোড বন্ধ নয়) */
export const MEDIA_SOFT_LIMIT = 300 * 1024 * 1024;

export const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);
