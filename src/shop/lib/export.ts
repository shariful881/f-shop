/**
 * দোকানদারের নিজের ডাটা ডাউনলোড (Excel-এ খোলে এমন CSV) — ব্যাকআপ আর হিসাবের জন্য।
 * UTF-8 BOM থাকে, তাই Excel-এ বাংলা ঠিকমতো দেখায়। সূত্র দিয়ে শুরু হওয়া ঘর (=, +, -, @) নিরাপদ করা হয়।
 */

const cell = (v: unknown): string => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // Excel-এ সূত্র চালানো আটকাতে (CSV injection)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const STATUS_BN: Record<string, string> = { new: "নতুন", confirmed: "কনফার্ম", shipped: "শিপড", cancelled: "বাতিল", fake: "ফেক" };
const MAX_ROWS = 20000;

export async function ordersCsv(db: D1Database): Promise<string> {
  const { results } = await db.prepare(
    `SELECT o.order_no, o.created_at, o.status, o.name, o.phone, o.address, o.area, o.subtotal, o.delivery_charge, o.discount, o.total,
            o.coupon_code, o.courier, o.tracking_code, o.note,
            (SELECT group_concat(i.product_name || COALESCE(' (' || i.variant_label || ')', '') || ' × ' || i.qty, '; ') FROM order_items i WHERE i.order_id = o.id) AS items
     FROM orders o ORDER BY o.id DESC LIMIT ?`,
  ).bind(MAX_ROWS).all<Record<string, unknown>>();
  return toCsv(
    ["অর্ডার নং", "সময় (UTC)", "অবস্থা", "নাম", "মোবাইল", "ঠিকানা", "এলাকা", "পণ্যের দাম", "ডেলিভারি", "ছাড়", "মোট", "কুপন", "কুরিয়ার", "ট্র্যাকিং", "নোট", "পণ্য"],
    results.map((r) => [r.order_no, r.created_at, STATUS_BN[String(r.status)] ?? r.status, r.name, r.phone, r.address, r.area === "inside" ? "ঢাকার ভিতরে" : "ঢাকার বাইরে",
      r.subtotal, r.delivery_charge, r.discount, r.total, r.coupon_code, r.courier, r.tracking_code, r.note, r.items]),
  );
}

export async function productsCsv(db: D1Database): Promise<string> {
  const { results } = await db.prepare(
    `SELECT p.id, p.name, p.slug, c.name AS category, p.price, p.compare_price, p.cost_price, p.track_stock, p.stock, p.is_active, p.show_on_home, p.short_desc, p.image, p.created_at
     FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.id LIMIT ?`,
  ).bind(MAX_ROWS).all<Record<string, unknown>>();
  return toCsv(
    ["আইডি", "নাম", "লিংক (slug)", "ক্যাটাগরি", "দাম", "কাটা দাম", "ক্রয়মূল্য", "স্টক", "চালু", "হোমে", "ছোট বর্ণনা", "ছবি", "তৈরি (UTC)"],
    results.map((r) => [r.id, r.name, r.slug, r.category, r.price, r.compare_price, r.cost_price, r.track_stock ? r.stock : "গোনা হয় না", r.is_active ? "হ্যাঁ" : "না", r.show_on_home ? "হ্যাঁ" : "না", r.short_desc, r.image ? `/img/${r.image}` : "", r.created_at]),
  );
}

export async function customersCsv(db: D1Database): Promise<string> {
  const { results } = await db.prepare(
    `SELECT phone, (SELECT o2.name FROM orders o2 WHERE o2.phone = o.phone ORDER BY o2.id DESC LIMIT 1) AS name,
            (SELECT o3.address FROM orders o3 WHERE o3.phone = o.phone ORDER BY o3.id DESC LIMIT 1) AS address,
            COUNT(*) AS orders, SUM(status IN ('confirmed','shipped')) AS delivered, SUM(status IN ('cancelled','fake')) AS bad,
            COALESCE(SUM(CASE WHEN status IN ('confirmed','shipped') THEN total END), 0) AS spent, MAX(created_at) AS last_at
     FROM orders o GROUP BY phone ORDER BY MAX(id) DESC LIMIT ?`,
  ).bind(MAX_ROWS).all<Record<string, unknown>>();
  return toCsv(
    ["মোবাইল", "নাম", "শেষ ঠিকানা", "মোট অর্ডার", "ডেলিভারি", "বাতিল/ফেক", "মোট কেনা", "শেষ অর্ডার (UTC)"],
    results.map((r) => [r.phone, r.name, r.address, r.orders, r.delivered, r.bad, r.spent, r.last_at]),
  );
}
