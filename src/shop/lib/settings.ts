export type Settings = Record<string, string>;

export const SETTING_KEYS = [
  "site_name",
  "contact_phone",
  "delivery_inside",
  "delivery_outside",
  "fb_pixel_id",
  "fb_capi_token",
  "fb_test_event_code",
  "fb_graph_version",
  "logo",
  "brand_color",
  "accent_color",
  "theme",
] as const;

export const THEMES = {
  classic: { name: "ক্লাসিক", desc: "রঙিন হেডার, কার্ডে বর্ডার — সব ধরনের দোকানের জন্য" },
  minimal: { name: "মিনিমাল", desc: "সাদা, পরিষ্কার, অনেক ফাঁকা জায়গা — প্রিমিয়াম পণ্যের জন্য" },
  bold: { name: "বোল্ড", desc: "বড় লেখা, গাঢ় রং, ছায়া — ফ্যাশন আর অফারের জন্য" },
} as const;
export type ThemeKey = keyof typeof THEMES;
export const themeOf = (s: Settings): ThemeKey => (s.theme && s.theme in THEMES ? (s.theme as ThemeKey) : "classic");

const HEX = /^#[0-9a-f]{6}$/i;
export const safeColor = (v: string | undefined, def: string) => (v && HEX.test(v) ? v.toLowerCase() : def);

/** রং একটু গাঢ় করা (hover/শিরোনামের জন্য) */
export function darken(hex: string, f = 0.8): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * f).toString(16).padStart(2, "0"));
  return `#${c.join("")}`;
}

/** দোকানের রং দিয়ে CSS ভেরিয়েবল */
export function themeCss(s: Settings): string {
  const brand = safeColor(s.brand_color, "#0f766e");
  const accent = safeColor(s.accent_color, "#ea580c");
  return `:root{--brand:${brand};--brand-dark:${darken(brand)};--accent:${accent};--accent-dark:${darken(accent, 0.85)}}`;
}

export async function loadSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string | null }>();
  const s: Settings = {};
  for (const r of results) s[r.key] = r.value ?? "";
  return s;
}

export async function saveSettings(db: D1Database, values: Partial<Settings>) {
  const stmts = Object.entries(values).map(([k, v]) =>
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v ?? ""),
  );
  if (stmts.length) await db.batch(stmts);
}

export function deliveryCharge(s: Settings, area: string): number {
  const v = area === "inside" ? s.delivery_inside : s.delivery_outside;
  const n = parseInt(v || "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
