/**
 * রেডিমেড ল্যান্ডিং টেমপ্লেট — SellxBD-এর (মূল ডাটাবেসে, সব দোকানে ফ্রি)
 * আর দোকানদারের নিজের সেভ করা (দোকানের ডাটাবেসে, শুধু তার তালিকায়)।
 */
import { normalizeLanding, parseLanding, type Landing } from "./landing";

export const TEMPLATE_CATEGORIES = ["সাধারণ", "ফ্যাশন", "বেবি প্রোডাক্ট", "গ্যাজেট", "কসমেটিক্স", "ফুড/অর্গানিক", "অন্যান্য"];
export const MAX_MY_TEMPLATES = 50;

export type PlatformTemplate = { id: number; name: string; category: string; description: string | null; json: string; active: number; sort_order: number };
export type MyTemplate = { id: number; name: string; json: string; created_at: string };

export async function platformTemplates(db: D1Database, onlyActive = true): Promise<PlatformTemplate[]> {
  const { results } = await db
    .prepare(`SELECT * FROM landing_templates ${onlyActive ? "WHERE active = 1" : ""} ORDER BY sort_order, id`)
    .all<PlatformTemplate>();
  return results;
}

export async function myTemplates(db: D1Database): Promise<MyTemplate[]> {
  const { results } = await db.prepare("SELECT * FROM my_templates ORDER BY id DESC").all<MyTemplate>();
  return results;
}

/** "p:3" = SellxBD টেমপ্লেট ৩, "m:5" = আমার টেমপ্লেট ৫ */
export async function loadTemplate(platformDb: D1Database, shopDb: D1Database, ref: string): Promise<Landing | null> {
  const m = /^([pm]):(\d{1,9})$/.exec(ref);
  if (!m) return null;
  const row = m[1] === "p"
    ? await platformDb.prepare("SELECT json FROM landing_templates WHERE id = ? AND active = 1").bind(+m[2]!).first<{ json: string }>()
    : await shopDb.prepare("SELECT json FROM my_templates WHERE id = ?").bind(+m[2]!).first<{ json: string }>();
  return row ? parseLanding(row.json) : null;
}

/** গ্যালারির ছোট ছবি: প্রতিটা সেকশনের রং দিয়ে একটা ছোট নকশা */
export function thumbBlocks(json: string): { type: string; bg: string; fg: string; btn: string }[] {
  const l = parseLanding(json) ?? normalizeLanding({});
  return l.sections.filter((s) => s.enabled).slice(0, 8).map((s) => ({
    type: s.type,
    bg: s.style?.bg || "#ffffff",
    fg: s.style?.color || "#334155",
    btn: s.style?.btn_bg || "#0f766e",
  }));
}
