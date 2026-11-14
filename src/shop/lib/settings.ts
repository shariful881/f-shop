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
] as const;

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
