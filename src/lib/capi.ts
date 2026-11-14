import type { Settings } from "./settings";

// ধাপ (ঙ)-তে আসল Conversions API বসবে
export async function sendPurchase(_db: D1Database, _orderId: number, _s: Settings): Promise<{ ok: boolean; message: string }> {
  return { ok: false, message: "Facebook ট্র্যাকিং এখনো যোগ হয়নি" };
}
