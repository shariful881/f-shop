/**
 * ধাপ ৫: পণ্যের ক্যাটালগ ফিড — Facebook/Instagram ক্যাটালগ অ্যাড আর Google Merchant Center-এর জন্য।
 * id = পণ্যের আইডি — Pixel/CAPI-র content_ids-এর সাথে মিলতে হয়, তাই ভ্যারিয়েন্ট আলাদা লাইন নয়।
 */
import type { Settings } from "./settings";
import { parseGallery, type Product } from "./products";
import { imageUrl } from "./format";

export type FeedItem = {
  id: string;
  title: string;
  description: string;
  availability: "in stock" | "out of stock";
  condition: "new";
  price: string;
  sale_price: string;
  link: string;
  image_link: string;
  /** গ্যালারির বাকি ছবি (কমা দিয়ে, সর্বোচ্চ ১০টা) */
  additional_image_link: string;
  brand: string;
  product_type: string;
  quantity: string;
};

export const feedOn = (s: Settings) => s.feed_enabled !== "0";

/** HTML থেকে সাধারণ লেখা (বর্ণনার জন্য) */
const plain = (html: string | null | undefined) =>
  (html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();

export async function feedItems(db: D1Database, s: Settings, origin: string): Promise<{ items: FeedItem[]; skipped: number }> {
  const { results } = await db
    .prepare(
      `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = 1 ORDER BY p.sort_order, p.id LIMIT 5000`,
    )
    .all<Product & { category_name: string | null }>();
  const brand = (s.feed_brand || s.site_name || "").slice(0, 100);
  const linkBase = s.feed_link === "product" ? "/product/" : "/p/";
  let skipped = 0;
  const items: FeedItem[] = [];
  for (const p of results) {
    // ছবি ছাড়া পণ্য Facebook/Google নেয় না
    if (!p.image) { skipped++; continue; }
    const out = p.stock_status === "out" || (p.track_stock === 1 && (p.stock ?? 0) <= 0);
    const onSale = !!p.compare_price && p.compare_price > p.price;
    const desc = (p.short_desc || plain(p.details_html) || p.headline || p.name).slice(0, 4900);
    items.push({
      id: String(p.id),
      title: (p.meta_title || p.name).slice(0, 150),
      description: desc,
      availability: out ? "out of stock" : "in stock",
      condition: "new",
      price: `${onSale ? p.compare_price : p.price}.00 BDT`,
      sale_price: onSale ? `${p.price}.00 BDT` : "",
      link: `${origin}${linkBase}${encodeURIComponent(p.slug)}`,
      image_link: new URL(imageUrl(p.image), origin).toString(),
      additional_image_link: parseGallery(p.gallery_json).map((k) => new URL(imageUrl(k), origin).toString()).join(","),
      brand: p.brand || brand,
      product_type: p.category_name || "",
      quantity: p.track_stock === 1 ? String(Math.max(0, p.stock ?? 0)) : "",
    });
  }
  return { items, skipped };
}

const xml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** RSS 2.0 + g: namespace — Facebook আর Google দুটোই পড়ে */
export function toRss(items: FeedItem[], s: Settings, origin: string): string {
  const tag = (k: string, v: string) => (v ? `<g:${k}>${xml(v)}</g:${k}>` : "");
  const body = items.map((i) =>
    `<item>${tag("id", i.id)}<title>${xml(i.title)}</title><description>${xml(i.description)}</description><link>${xml(i.link)}</link>` +
    tag("image_link", i.image_link) +
    (i.additional_image_link ? i.additional_image_link.split(",").map((u) => tag("additional_image_link", u)).join("") : "") + tag("availability", i.availability) + tag("condition", i.condition) + tag("price", i.price) +
    tag("sale_price", i.sale_price) + tag("brand", i.brand) + tag("product_type", i.product_type) +
    (i.quantity ? tag("quantity_to_sell_on_facebook", i.quantity) : "") + `</item>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(s.site_name || "দোকান")}</title><link>${xml(origin)}</link><description>${xml(s.seo_description || s.site_name || "")}</description>\n${body}\n</channel></rss>`;
}

/** CSV (Facebook Commerce Manager-এ সরাসরি) */
export function toFeedCsv(items: FeedItem[]): string {
  const cols: (keyof FeedItem)[] = ["id", "title", "description", "availability", "condition", "price", "sale_price", "link", "image_link", "additional_image_link", "brand", "product_type"];
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [cols.join(","), ...items.map((i) => cols.map((k) => cell(String(i[k] ?? ""))).join(","))].join("\n") + "\n";
}
