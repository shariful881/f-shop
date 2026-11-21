/**
 * ধাপ ৭: অর্ডারের পাশে WhatsApp বাটন — অবস্থা অনুযায়ী তৈরি মেসেজ (দোকানদার নিজের WhatsApp থেকে পাঠান)।
 */
import type { Order, OrderItem } from "./orders";
import type { Settings } from "./settings";
import { codAmount } from "./payment";
import { siteLang, tLines } from "../i18n";

export type WaMsg = { key: string; label: string; text: string };

const tk = (n: number) => `${n.toLocaleString("en-IN")} টাকা`;

export function waLink(phone: string, text: string) {
  const p = phone.replace(/\D/g, "").replace(/^0/, "880");
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

/** অর্ডারের অবস্থা অনুযায়ী মেসেজ — প্রথমটা "আসল" (তালিকার বাটনে) */
export function waMessages(o: Order, items: Pick<OrderItem, "product_name" | "variant_label" | "qty">[], s: Settings, origin: string): WaMsg[] {
  const shop = s.site_name || "আমাদের দোকান";
  const hi = `আসসালামু আলাইকুম ${o.name}, ${shop} থেকে বলছি।`;
  const list = items.map((i) => `${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ""}${(i.qty || 1) > 1 ? ` × ${i.qty}` : ""}`).join(", ") || "আপনার পণ্য";
  const due = codAmount(o);
  const review = `${origin}/review?o=${encodeURIComponent(o.order_no)}&p=${o.phone}`;
  const out: WaMsg[] = [];
  if (o.status === "new") {
    out.push({ key: "confirm", label: "কনফার্ম করতে", text: `${hi}\nআপনার অর্ডার ${o.order_no}: ${list}\nমোট ${tk(o.total)}${o.pay_trx ? ` (অগ্রিম ${tk(o.advance_amount ?? 0)})` : ""}\nঠিকানা: ${o.address}\nঅর্ডারটা কি কনফার্ম করব?` });
  }
  if (o.status === "confirmed") {
    out.push({ key: "confirmed", label: "কনফার্ম হয়েছে জানাতে", text: `${hi}\nআপনার অর্ডার ${o.order_no} কনফার্ম হয়েছে, শিগগির পাঠানো হবে। পণ্য হাতে পেয়ে ${tk(due)} দেবেন। ধন্যবাদ!` });
  }
  if (o.status === "shipped") {
    out.push({ key: "shipped", label: "পাঠানো হয়েছে জানাতে", text: `${hi}\nআপনার অর্ডার ${o.order_no} কুরিয়ারে পাঠানো হয়েছে${o.tracking_code ? ` (ট্র্যাকিং: ${o.tracking_code})` : ""}। ডেলিভারিম্যান ফোন করবে, পণ্য দেখে ${tk(due)} দেবেন।` });
  }
  if ((o.status === "confirmed" || o.status === "shipped") && o.outcome !== "returned" && s.reviews_enabled !== "0") {
    out.push({ key: "review", label: "রিভিউ চাইতে", text: `${hi}\nআশা করি ${list} হাতে পেয়েছেন। কেমন লাগল এক মিনিটে জানাবেন? আপনার মতামত অন্য ক্রেতাদের সাহায্য করবে:\n${review}` });
  }
  // কাস্টমারের কাছে যায় — ওয়েবসাইটের ভাষায়, প্রতিটা লাইন আলাদা করে
  const lang = siteLang(s);
  return lang === "en" ? out.map((m) => ({ ...m, text: tLines(m.text, lang) })) : out;
}
