import type { Ctx } from "../env";
import { publicOrigin } from "./http";

/** এক রিকোয়েস্টে একবারই খোঁজা */
const memo = new WeakMap<Request, Promise<string>>();

/** দোকানের ফ্রি ঠিকানা (slug.sellxbd.com) */
export const freeShopUrl = (c: Ctx) => `https://${c.env.SHOP_SLUG}.${c.env.PLATFORM_DOMAIN}`;

/**
 * দোকানের আসল পাবলিক ঠিকানা: নিজের ডোমেইন চালু (DNS আর Cloudflare সম্পূর্ণ) হলে সেটা, নইলে slug.sellxbd.com।
 * অ্যাডমিন প্যানেল সাব-ডোমেইনে চললেও ক্রেতাকে পাঠানো লিংক (WhatsApp, রিভিউ, ফিড) এটা দিয়ে বানাতে হয়।
 * ঠিকানার তথ্য না থাকলে এখনকার ঠিকানা।
 */
export function storeOrigin(c: Ctx): Promise<string> {
  if (!c.env.PLATFORM_DOMAIN || !c.env.SHOP_SLUG) return Promise.resolve(publicOrigin(c));
  // প্যানেল নিজের ডোমেইনেই খোলা থাকলে (এই রিকোয়েস্ট সেই ডোমেইনে এসেছে) সেটাই দোকানের ঠিকানা
  const here = publicOrigin(c);
  if (!new URL(here).hostname.endsWith(`.${c.env.PLATFORM_DOMAIN}`)) return Promise.resolve(here);
  let p = memo.get(c.req.raw);
  if (!p) {
    p = c.env.PLATFORM_DB.prepare("SELECT root FROM domains WHERE shop_id = ? AND status = 'active' AND zone_id IS NOT NULL AND hostname = root ORDER BY created_at LIMIT 1")
      .bind(c.env.SHOP_ID).first<{ root: string }>().catch(() => null)
      .then((d) => (d?.root ? `https://${d.root}` : freeShopUrl(c)));
    memo.set(c.req.raw, p);
  }
  return p;
}

/** অ্যাডমিন থেকে দোকানের কোনো পেজে যাওয়ার লিংক — /admin/view-shop সঠিক ঠিকানায় পাঠায় */
export const shopLink = (path: string) => `/admin/view-shop?to=${encodeURIComponent(path)}`;

/** ?to= শুধু দোকানের ভেতরের পথ ("/..." কিন্তু "//" বা "/\" নয়, /admin নয়) */
export function safeShopPath(to: string | undefined): string {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\") || /^\/admin(\/|$|\?)/.test(to) || /[\r\n]/.test(to)) return "/";
  return to.slice(0, 500);
}
