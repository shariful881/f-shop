/**
 * সার্ভারের এরর মূল ডাটাবেসে লিখে রাখা — যাতে কোনো দোকানে সমস্যা হলে আমরা আগেই দেখি।
 * একই জায়গার একই এরর একটাই লাইন (count বাড়ে), তাই টেবিল ফুলে ওঠে না। লেখা ব্যর্থ হলেও কিছু ভাঙে না।
 */
export type ErrorInfo = { shopId?: string | null; method?: string; path?: string; err: unknown };

export const ERROR_KEEP = 300;

async function fingerprintOf(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function logError(db: D1Database | undefined, info: ErrorInfo) {
  if (!db) return;
  try {
    const e = info.err instanceof Error ? info.err : new Error(String(info.err));
    const message = `${e.name}: ${e.message}`.slice(0, 500);
    const stack = (e.stack || "").split("\n").slice(0, 8).join("\n").slice(0, 2000);
    // পথের সংখ্যা (আইডি) বাদ দিয়ে মেলানো: /admin/orders/12 আর /13 একই এরর
    const path = (info.path || "").slice(0, 200);
    const route = path.replace(/\/\d+(?=\/|$)/g, "/:id");
    const fp = await fingerprintOf(`${info.shopId ?? ""}|${info.method ?? ""}|${route}|${message}`);
    await db.prepare(
      `INSERT INTO error_log (fingerprint, shop_id, method, path, message, stack) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(fingerprint) DO UPDATE SET count = count + 1, last_at = datetime('now'), path = excluded.path, stack = excluded.stack, resolved = 0`,
    ).bind(fp, info.shopId ?? null, info.method ?? null, path, message, stack).run();
    // মাঝে মাঝে পুরনো লাইন ছাঁটা
    if (Math.random() < 0.05) {
      await db.prepare(`DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY last_at DESC LIMIT ${ERROR_KEEP})`).run();
    }
  } catch (e) {
    console.error("error_log write failed", e);
  }
}
