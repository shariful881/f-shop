/**
 * ডোমেইন বিক্রি — দোকানদার SellxBD থেকে ডোমেইন কেনেন, টাকা দোকানের ব্যালেন্স থেকে কাটে,
 * ডোমেইন আমাদের Porkbun অ্যাকাউন্টে কেনা হয়, Cloudflare-এ zone বানিয়ে নেমসার্ভার নিজে বসে → দোকান ওই ডোমেইনে চালু।
 * রিনিউও ব্যালেন্স থেকে (Porkbun-এর নিজের অটো-রিনিউ বন্ধ রাখা হয়)।
 */
import { applyLedger, num, platformSettings, type PlatformSettings } from "./billing";
import type { Cloudflare } from "./cf";
import { addDomain } from "./domains";
import { cents, pbError, type PbCheck, type Porkbun } from "./porkbun";

export type SaleConfig = { enabled: boolean; rate: number; markup: number; tlds: string[]; maxUsd: number };

export function saleConfig(s: PlatformSettings): SaleConfig {
  const tlds = (s.domain_tlds || "com,shop,store,online,xyz,net").split(/[\s,]+/).map((t) => t.replace(/^\./, "").toLowerCase()).filter((t) => /^[a-z]{2,24}$/.test(t));
  return {
    enabled: s.domain_sale === "1",
    rate: num(s, "domain_usd_rate", 130),
    markup: num(s, "domain_markup", 300),
    tlds: [...new Set(tlds)].slice(0, 12),
    maxUsd: num(s, "domain_max_usd", 30),
  };
}

/** দোকানদারের দাম (টাকা): Porkbun-এর দাম × ডলার রেট + লাভ, ১০ টাকায় গোল করে উপরে */
export const bdtPrice = (usd: number, cfg: SaleConfig) => Math.ceil((usd * cfg.rate + cfg.markup) / 10) * 10;

export type Offer = PbCheck & { bdt: number; renewBdt: number; buyable: boolean; reason?: string };

export function offerOf(c: PbCheck, cfg: SaleConfig): Offer {
  const tld = c.domain.split(".").slice(1).join(".");
  let reason: string | undefined;
  if (!c.available) reason = "আগেই কেউ নিয়েছে";
  else if (c.premium) reason = "প্রিমিয়াম ডোমেইন — এখানে কেনা যায় না";
  else if (!cfg.tlds.includes(tld)) reason = `.${tld} এখানে বিক্রি হয় না`;
  else if (!c.price || c.price > cfg.maxUsd || c.renewal > cfg.maxUsd) reason = "এই এক্সটেনশনের রিনিউ খরচ অনেক বেশি — এখানে বিক্রি হয় না";
  return { ...c, bdt: c.price ? bdtPrice(c.price, cfg) : 0, renewBdt: c.renewal ? bdtPrice(c.renewal, cfg) : 0, buyable: !reason, reason };
}

/** .com না পেলে কাছাকাছি নাম (একই খোঁজায়, আলাদা অংশে দেখায়) */
export function variants(base: string): string[] {
  if (base.length > 40) return [];
  const v = [`${base}bd`, `${base}shop`, `get${base}`, `${base}store`, `${base}online`].filter((x) => x.length <= 63 && x !== base);
  return [...new Set(v)].map((x) => `${x}.com`);
}

/** খোঁজার ফল সাজানো: পাওয়া যায় আগে, তারপর কম রিনিউ দাম; "সেরা পছন্দ" — .com পেলে সেটা, নইলে সবচেয়ে কম রিনিউ */
export function arrangeOffers(main: Offer[], extra: Offer[]) {
  const buyable = main.filter((o) => o.buyable);
  const best = buyable.find((o) => o.domain.endsWith(".com")) ?? [...buyable].sort((a, b) => a.renewBdt - b.renewBdt)[0] ?? null;
  const rest = buyable.filter((o) => o !== best).sort((a, b) => a.renewBdt - b.renewBdt || a.bdt - b.bdt);
  const taken = main.filter((o) => !o.buyable);
  return { best, rest, taken, suggest: extra.filter((o) => o.buyable).slice(0, 4) };
}

/** খোঁজার লেখা → নামের তালিকা ("kathbon" → kathbon.com, kathbon.shop…; "kathbon.shop" আগে) */
export function candidates(input: string, cfg: SaleConfig): { names: string[]; base?: string; error?: string } {
  let q = (input || "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0]!;
  if (!q) return { names: [], error: "ডোমেইনের নাম লিখুন" };
  let first: string | null = null;
  const dot = q.indexOf(".");
  if (dot > 0) {
    const tld = q.slice(dot + 1);
    q = q.slice(0, dot);
    if (cfg.tlds.includes(tld)) first = `${q}.${tld}`;
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(q) || q.includes("--")) {
    return { names: [], error: "শুধু ইংরেজি অক্ষর (a-z), সংখ্যা আর মাঝে হাইফেন (-) দিয়ে নাম লিখুন — যেমন kathbon বা kath-bon" };
  }
  const names = [...new Set([...(first ? [first] : []), ...cfg.tlds.map((t) => `${q}.${t}`)])];
  return { names, base: q };
}

export type RegRow = {
  domain: string; shop_id: string; status: string; cost_cents: number | null; price_bdt: number | null; renew_cents: number | null;
  order_id: string | null; expires_at: string | null; auto_renew: number; ns_ok: number; warned: string | null; error: string | null; created_at: string;
};

export const shopReg = (db: D1Database, shopId: string) =>
  db.prepare("SELECT * FROM domain_regs WHERE shop_id = ? AND status IN ('registering', 'active', 'expired') ORDER BY created_at DESC LIMIT 1").bind(shopId).first<RegRow>();

const addYear = (d: Date) => { const x = new Date(d); x.setUTCFullYear(x.getUTCFullYear() + 1); return x.toISOString().slice(0, 10); };

/** zone-এর নেমসার্ভার Porkbun-এ বসানো (কেনার পরে, আর cron-এ আবার চেষ্টা) */
export async function pushNameservers(db: D1Database, pb: Porkbun, domain: string): Promise<boolean> {
  const row = await db.prepare("SELECT nameservers FROM domains WHERE hostname = ? AND zone_id IS NOT NULL").bind(domain).first<{ nameservers: string | null }>();
  let ns: string[] = [];
  try { ns = JSON.parse(row?.nameservers || "[]"); } catch { /* ফাঁকা */ }
  if (!ns.length) return false;
  const r = await pb.updateNs(domain, ns);
  await db.prepare("UPDATE domain_regs SET ns_ok = ?, error = ?, updated_at = datetime('now') WHERE domain = ?")
    .bind(r.ok ? 1 : 0, r.ok ? null : `নেমসার্ভার: ${r.message ?? r.code}`, domain).run();
  return r.ok;
}

export type BuyResult = { ok: boolean; message: string; refreshed?: Offer };

/**
 * কেনা: দাম আবার যাচাই → ব্যালেন্স যাচাই → তালিকায় "registering" → ব্যালেন্স থেকে কাটা → Porkbun-এ কেনা
 * → ব্যর্থ হলে টাকা ফেরত; সফল হলে Porkbun-এর অটো-রিনিউ বন্ধ, Cloudflare zone, নেমসার্ভার বসানো।
 * `expectedBdt` — দোকানদার যে দাম দেখে "কিনুন" চেপেছেন; দাম বদলালে না কিনে নতুন দাম দেখায়।
 */
export async function buyDomain(db: D1Database, pb: Porkbun, cf: Cloudflare, shopId: string, domain: string, expectedBdt: number): Promise<BuyResult> {
  const cfg = saleConfig(await platformSettings(db, true));
  if (!cfg.enabled || !pb.configured) return { ok: false, message: pbError("NOT_CONFIGURED") };
  if (!cf.configured) return { ok: false, message: "ডোমেইন ফিচার এখনো চালু করা হয়নি (Cloudflare)। সাপোর্টে যোগাযোগ করুন।" };
  const has = await db.prepare("SELECT 1 FROM domains WHERE shop_id = ? AND zone_id IS NOT NULL LIMIT 1").bind(shopId).first();
  if (has) return { ok: false, message: "আপনার দোকানে আগেই একটা ডোমেইন আছে। নতুন কিনতে আগে সেটা সরান।" };
  if (await shopReg(db, shopId)) return { ok: false, message: "আপনার দোকানের জন্য আগেই একটা ডোমেইন কেনা আছে।" };

  const chk = await pb.check(domain);
  if (!chk.ok || !chk.check) return { ok: false, message: pbError(chk.code, chk.message) };
  const offer = offerOf(chk.check, cfg);
  if (!offer.buyable) return { ok: false, message: `${domain} কেনা যাবে না — ${offer.reason}।` };
  if (offer.bdt !== expectedBdt) return { ok: false, message: `দাম বদলেছে — এখন ৳${offer.bdt}। নতুন দাম দেখে আবার "কিনুন" চাপুন।`, refreshed: offer };

  const shop = await db.prepare("SELECT balance FROM shops WHERE id = ?").bind(shopId).first<{ balance: number }>();
  if (!shop || shop.balance < offer.bdt) {
    return { ok: false, message: `ব্যালেন্সে ৳${offer.bdt} দরকার, আছে ৳${shop?.balance ?? 0}। আগে বিলিং পেজ থেকে রিচার্জ করুন।` };
  }

  // একই ডোমেইন দুজন একসাথে কিনতে পারে না (PRIMARY KEY) — আগে ব্যর্থ হওয়া সারি থাকলে মুছে নতুন
  await db.prepare("DELETE FROM domain_regs WHERE domain = ? AND status = 'failed'").bind(domain).run();
  const ins = await db.prepare("INSERT OR IGNORE INTO domain_regs (domain, shop_id, status, cost_cents, price_bdt, renew_cents) VALUES (?, ?, 'registering', ?, ?, ?)")
    .bind(domain, shopId, cents(offer.price), offer.bdt, cents(offer.renewal)).run();
  if (!ins.meta.changes) return { ok: false, message: "এই ডোমেইন এইমাত্র অন্য কেউ কিনছে। অন্য নাম দেখুন।" };

  const stamp = Date.now().toString(36);
  const ref = `dom:${domain}:${stamp}`;
  await applyLedger(db, shopId, "domain_buy", -offer.bdt, ref, `ডোমেইন কেনা: ${domain} (১ বছর)`);

  const reg = await pb.register(domain, cents(offer.price), `sx-reg-${domain}-${stamp}`);
  if (!reg.ok) {
    await applyLedger(db, shopId, "domain_refund", offer.bdt, ref, `ফেরত: ${domain} কেনা যায়নি`);
    await db.prepare("UPDATE domain_regs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE domain = ?").bind(`${reg.code}: ${reg.message}`, domain).run();
    return { ok: false, message: `${pbError(reg.code, reg.message)} আপনার ৳${offer.bdt} ব্যালেন্সে ফেরত দেওয়া হয়েছে।` };
  }

  await db.prepare("UPDATE domain_regs SET status = 'active', order_id = ?, cost_cents = COALESCE(?, cost_cents), expires_at = ?, error = NULL, updated_at = datetime('now') WHERE domain = ?")
    .bind(reg.data.orderId != null ? String(reg.data.orderId) : null, typeof reg.data.cost === "number" ? reg.data.cost : null, addYear(new Date()), domain).run();
  await pb.autoRenewOff(domain);

  // Cloudflare zone → নেমসার্ভার Porkbun-এ (ব্যর্থ হলে cron আবার চেষ্টা করে)
  const z = await addDomain(db, cf, shopId, domain);
  if (!z.ok) {
    await db.prepare("UPDATE domain_regs SET error = ?, updated_at = datetime('now') WHERE domain = ?").bind(`Cloudflare: ${z.message}`, domain).run();
    return { ok: true, message: `অভিনন্দন! ${domain} কেনা হয়েছে। দোকানে বসাতে একটু সমস্যা হয়েছে — আমাদের টিম ঠিক করে দেবে, সাপোর্টে জানান।` };
  }
  await pushNameservers(db, pb, domain);
  return { ok: true, message: `অভিনন্দন! ${domain} কেনা হয়েছে। নেমসার্ভার নিজে বসানো হয়েছে — সাধারণত কয়েক মিনিট থেকে কয়েক ঘণ্টায় দোকান এই ডোমেইনে চালু হবে।` };
}

/** রিনিউয়ের দাম (টাকা) — Porkbun থেকে এখনকার দাম */
export async function renewQuote(db: D1Database, pb: Porkbun, domain: string): Promise<{ ok: boolean; usd?: number; bdt?: number; message?: string }> {
  const cfg = saleConfig(await platformSettings(db));
  const chk = await pb.check(domain);
  if (!chk.ok || !chk.check?.renewal) return { ok: false, message: pbError(chk.code, chk.message) };
  await db.prepare("UPDATE domain_regs SET renew_cents = ? WHERE domain = ?").bind(cents(chk.check.renewal), domain).run();
  return { ok: true, usd: chk.check.renewal, bdt: bdtPrice(chk.check.renewal, cfg) };
}

/** রিনিউ — ব্যালেন্স থেকে কেটে Porkbun-এ ১ বছর বাড়ানো; ব্যর্থ হলে ফেরত */
export async function renewDomain(db: D1Database, pb: Porkbun, shopId: string, domain: string): Promise<{ ok: boolean; message: string }> {
  const reg = await db.prepare("SELECT * FROM domain_regs WHERE domain = ? AND shop_id = ?").bind(domain, shopId).first<RegRow>();
  if (!reg || (reg.status !== "active" && reg.status !== "expired")) return { ok: false, message: "এই ডোমেইন আপনার দোকানের কেনা তালিকায় নেই।" };
  const q = await renewQuote(db, pb, domain);
  if (!q.ok) return { ok: false, message: q.message! };
  const shop = await db.prepare("SELECT balance FROM shops WHERE id = ?").bind(shopId).first<{ balance: number }>();
  if (!shop || shop.balance < q.bdt!) return { ok: false, message: `রিনিউয়ে ৳${q.bdt} দরকার, ব্যালেন্সে আছে ৳${shop?.balance ?? 0}। আগে রিচার্জ করুন।` };

  const ref = `ren:${domain}:${reg.expires_at ?? "x"}`;
  const applied = await applyLedger(db, shopId, "domain_renew", -q.bdt!, ref, `ডোমেইন রিনিউ: ${domain} (১ বছর)`);
  if (!applied) return { ok: false, message: "এই মেয়াদের রিনিউ আগেই হয়েছে।" };
  const r = await pb.renew(domain, cents(q.usd!), `sx-${ref}`);
  if (!r.ok) {
    await applyLedger(db, shopId, "domain_refund", q.bdt!, ref, `ফেরত: ${domain} রিনিউ হয়নি`);
    await db.prepare("UPDATE domain_regs SET error = ?, updated_at = datetime('now') WHERE domain = ?").bind(`রিনিউ ${r.code}: ${r.message}`, domain).run();
    return { ok: false, message: `${pbError(r.code, r.message)} ৳${q.bdt} ফেরত দেওয়া হয়েছে।` };
  }
  const base = reg.expires_at && reg.expires_at > new Date().toISOString().slice(0, 10) ? new Date(`${reg.expires_at}T00:00:00Z`) : new Date();
  const next = /^\d{4}-\d{2}-\d{2}/.test(String(r.data.expirationDate || "")) ? String(r.data.expirationDate).slice(0, 10) : addYear(base);
  await db.prepare("UPDATE domain_regs SET status = 'active', expires_at = ?, warned = NULL, error = NULL, updated_at = datetime('now') WHERE domain = ?").bind(next, domain).run();
  return { ok: true, message: `${domain} রিনিউ হয়েছে — নতুন মেয়াদ ${next} পর্যন্ত। ৳${q.bdt} কাটা হয়েছে।` };
}

export type Notify = (shopId: string, msg: { title: string; body: string; url?: string }) => Promise<unknown> | unknown;

/** মেয়াদ শেষের আগে: এত দিনের মধ্যে ব্যালেন্স থাকলে নিজে রিনিউ */
export const AUTO_RENEW_DAYS = 14;

/**
 * রোজ একবার (cron): নেমসার্ভার আবার চেষ্টা; মেয়াদ শেষের ৩০/৭/১ দিন আগে সতর্কবার্তা;
 * ১৪ দিন বাকি থাকলে অটো-রিনিউ চালু আর ব্যালেন্স থাকলে নিজে রিনিউ; মেয়াদ পেরোলে "expired"।
 */
export async function runDomainRenewals(db: D1Database, pb: Porkbun, notify: Notify, now = new Date()) {
  const out = { ns: 0, renewed: 0, warned: 0, expired: 0 };
  if (!pb.configured) return out;
  const { results: nsRows } = await db.prepare("SELECT domain FROM domain_regs WHERE status = 'active' AND ns_ok = 0 LIMIT 20").all<{ domain: string }>();
  for (const r of nsRows) if (await pushNameservers(db, pb, r.domain)) out.ns++;

  const today = now.toISOString().slice(0, 10);
  const soon = new Date(now.getTime() + 31 * 86400_000).toISOString().slice(0, 10);
  const { results } = await db.prepare("SELECT * FROM domain_regs WHERE status IN ('active', 'expired') AND expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at LIMIT 50").bind(soon).all<RegRow>();
  for (const reg of results) {
    const days = Math.round((Date.parse(`${reg.expires_at}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
    if (days < -30) continue; // অনেক আগে মেয়াদ শেষ — হাতে দেখতে হবে
    if (days < 0 && reg.status === "active") {
      await db.prepare("UPDATE domain_regs SET status = 'expired', updated_at = datetime('now') WHERE domain = ?").bind(reg.domain).run();
      await notify(reg.shop_id, { title: "ডোমেইনের মেয়াদ শেষ", body: `${reg.domain}-এর মেয়াদ শেষ হয়েছে। দ্রুত রিনিউ করুন, নইলে ডোমেইন হারাতে পারেন।`, url: "/admin/domain" });
      out.expired++;
    }
    if (reg.auto_renew && days <= AUTO_RENEW_DAYS) {
      const r = await renewDomain(db, pb, reg.shop_id, reg.domain);
      if (r.ok) {
        out.renewed++;
        await notify(reg.shop_id, { title: "ডোমেইন রিনিউ হয়েছে", body: r.message, url: "/admin/domain" });
        continue;
      }
    }
    const stage = days <= 1 ? 1 : days <= 7 ? 7 : days <= 30 ? 30 : 0;
    const key = `${reg.expires_at}:${stage}`;
    if (stage && reg.warned !== key) {
      const q = reg.renew_cents ? bdtPrice(reg.renew_cents / 100, saleConfig(await platformSettings(db))) : null;
      await db.prepare("UPDATE domain_regs SET warned = ? WHERE domain = ?").bind(key, reg.domain).run();
      await notify(reg.shop_id, {
        title: days < 0 ? "ডোমেইনের মেয়াদ শেষ" : `ডোমেইনের মেয়াদ ${days} দিন বাকি`,
        body: `${reg.domain}${q ? ` — রিনিউ ৳${q}` : ""}। ${reg.auto_renew ? `ব্যালেন্সে টাকা রাখুন, মেয়াদ শেষের ${AUTO_RENEW_DAYS} দিন আগে থেকে নিজে রিনিউ হবে।` : "অটো-রিনিউ বন্ধ — ডোমেইন পেজ থেকে রিনিউ করুন।"}`,
        url: "/admin/domain",
      });
      out.warned++;
    }
  }
  return out;
}
