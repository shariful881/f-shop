/**
 * অর্ডারে দোকানের নিজের নোট আর ফলো-আপ (মনে করানো)।
 * সময় ঢাকার (UTC+6, ডেলাইট সেভিং নেই); ডাটাবেসে UTC।
 */
export type OrderNote = { id: number; order_id: number; body: string; remind_at: string | null; done_at: string | null; pushed_at: string | null; by_name: string | null; by_role: string | null; created_at: string };

const DHAKA_MS = 6 * 3600_000;
const sqlUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
export const parseUtc = (s: string) => Date.parse(s.replace(" ", "T") + "Z");

/** ঢাকার আজকের তারিখের নির্দিষ্ট ঘণ্টা (দিন যোগ করে) → UTC মিলিসেকেন্ড */
function dhakaAt(now: number, addDays: number, hour: number) {
  const d = new Date(now + DHAKA_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + addDays, hour, 0, 0) - DHAKA_MS;
}

/** ফর্মের তৈরি সময়গুলো — যেগুলো এখনো আসেনি শুধু সেগুলো */
export function remindPresets(now = Date.now()): { key: string; label: string }[] {
  const out = [{ key: "1h", label: "১ ঘণ্টা পরে" }];
  if (dhakaAt(now, 0, 15) > now + 10 * 60_000) out.push({ key: "t15", label: "আজ দুপুর ৩টা" });
  if (dhakaAt(now, 0, 19) > now + 10 * 60_000) out.push({ key: "t19", label: "আজ সন্ধ্যা ৭টা" });
  out.push({ key: "n10", label: "আগামীকাল সকাল ১০টা" });
  return out;
}

/** বাছাই থেকে UTC সময় (`custom` = datetime-local, ঢাকার সময়ে লেখা); ভুল/অতীত হলে null */
export function remindAt(choice: string, custom: string, now = Date.now()): string | null {
  let ms: number | null = null;
  if (choice === "1h") ms = now + 3600_000;
  else if (choice === "t15") ms = dhakaAt(now, 0, 15);
  else if (choice === "t19") ms = dhakaAt(now, 0, 19);
  else if (choice === "n10") ms = dhakaAt(now, 1, 10);
  else if (choice === "custom") {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(custom.trim());
    if (m) ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - DHAKA_MS;
  }
  if (ms === null || !Number.isFinite(ms) || ms < now - 60_000 || ms > now + 90 * 86400_000) return null;
  return sqlUtc(ms);
}

/** আজ (ঢাকা) শেষ হওয়ার মুহূর্ত — ফলো-আপ ট্যাবে আজকের আর পেরিয়ে যাওয়াগুলো */
export const endOfTodayUtc = (now = Date.now()) => sqlUtc(dhakaAt(now, 1, 0) - 1000);

/** নোটের সাথে মিলিয়ে ছোট সময়-লেখা: "৩:০০ pm" / "আগামীকাল ১০:০০ am" */
export function remindLabel(utc: string, now = Date.now()): string {
  const ms = parseUtc(utc);
  const d = new Date(ms + DHAKA_MS);
  const today = new Date(now + DHAKA_MS);
  const dayDiff = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400_000);
  let h = d.getUTCHours(); const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12;
  const t = `${h}:${mm} ${ap}`;
  const day = dayDiff === 0 ? "আজ" : dayDiff === 1 ? "আগামীকাল" : dayDiff === -1 ? "গতকাল" : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  return `${day} ${t}`;
}

export async function orderNotes(db: D1Database, orderId: number): Promise<OrderNote[]> {
  return (await db.prepare("SELECT * FROM order_notes WHERE order_id = ? ORDER BY id DESC LIMIT 50").bind(orderId).all<OrderNote>()).results;
}

/** তালিকার পাতার অর্ডারগুলোর শেষ নোট আর সবচেয়ে কাছের খোলা ফলো-আপ */
export type ListNoteInfo = { last?: OrderNote; due?: string; dueId?: number };
export async function notesForList(db: D1Database, ids: number[]): Promise<Record<number, ListNoteInfo>> {
  const out: Record<number, ListNoteInfo> = {};
  if (!ids.length) return out;
  const ph = ids.map(() => "?").join(",");
  const [a, b] = await db.batch([
    db.prepare(`SELECT n.* FROM order_notes n JOIN (SELECT order_id, MAX(id) id FROM order_notes WHERE order_id IN (${ph}) GROUP BY order_id) m ON m.id = n.id`).bind(...ids),
    db.prepare(`SELECT order_id, id, remind_at FROM order_notes WHERE order_id IN (${ph}) AND remind_at IS NOT NULL AND done_at IS NULL ORDER BY remind_at, id`).bind(...ids),
  ]);
  for (const n of a!.results as OrderNote[]) (out[n.order_id] ??= {}).last = n;
  for (const r of b!.results as { order_id: number; id: number; remind_at: string }[]) {
    const o = (out[r.order_id] ??= {});
    if (!o.due) { o.due = r.remind_at; o.dueId = r.id; }
  }
  return out;
}

/** অর্ডার কনফার্ম/শিপড/বাতিল/ফেক হলে বাকি ফলো-আপ বন্ধ */
export const closeFollowupsStatement = (db: D1Database, orderId: number) =>
  db.prepare("UPDATE order_notes SET done_at = datetime('now') WHERE order_id = ? AND remind_at IS NOT NULL AND done_at IS NULL").bind(orderId);

/** সবচেয়ে কাছের যে মনে করানো এখনো ফোনে যায়নি — DO alarm এর জন্য */
export async function nextReminder(db: D1Database): Promise<number | null> {
  const r = await db.prepare("SELECT MIN(remind_at) t FROM order_notes WHERE remind_at IS NOT NULL AND done_at IS NULL AND pushed_at IS NULL").first<{ t: string | null }>();
  return r?.t ? parseUtc(r.t) : null;
}
