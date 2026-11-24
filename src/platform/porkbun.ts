/**
 * Porkbun API v3 — দোকানদারের জন্য ডোমেইন কেনা আর রিনিউ (SellxBD-এর নিজের Porkbun অ্যাকাউন্ট থেকে)।
 * দরকার: PORKBUN_API_KEY, PORKBUN_SECRET_KEY (wrangler secret)। `pk1_sb_` দিয়ে শুরু চাবি = sandbox (নকল ক্রেডিট, আসল টাকা কাটে না)।
 * টাকার হিসাব Porkbun-এ পয়সায় (USD cents) — `cost`, `balance`।
 * নিয়ম (Porkbun ডক, নভেম্বর ২০২৬): একবারে $১০০-এর বেশি অর্ডার নয়, মাসে API খরচের সীমা (ডিফল্ট $১০০, অ্যাকাউন্টে বদলানো যায়),
 * premium ডোমেইন API-তে কেনা যায় না, রেজিস্ট্রেশন সবসময় রেজিস্ট্রির ন্যূনতম মেয়াদে (সাধারণত ১ বছর), WHOIS privacy নিজে চালু।
 */
export type PorkbunConfig = { apiKey?: string; secret?: string };

export type PbResult<T = Record<string, unknown>> = { ok: boolean; data: T; code?: string; message?: string };

/** একটা নামের দাম/অবস্থা (checkDomain) */
export type PbCheck = {
  domain: string;
  available: boolean;
  premium: boolean;
  /** প্রথম বছরের দাম, USD */
  price: number;
  /** রিনিউয়ের দাম, USD (না জানা গেলে প্রথম বছরের দাম) */
  renewal: number;
  /** প্রথম বছরে ছাড় আছে কি না (তাহলে রিনিউ বেশি) */
  promo: boolean;
};

const BASE = "https://api.porkbun.com/api/json/v3";

const toUsd = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const yes = (v: unknown) => v === true || v === 1 || v === "yes" || v === "1";

/** Porkbun-এর checkDomain উত্তরের একটা নাম → PbCheck */
export function parseCheck(domain: string, r: Record<string, any> | undefined | null): PbCheck | null {
  if (!r || typeof r !== "object") return null;
  const price = toUsd(r.price);
  const renewal = toUsd(r.additional?.renewal?.price) || toUsd(r.regularPrice) || price;
  return { domain, available: yes(r.avail), premium: yes(r.premium), price, renewal, promo: yes(r.firstYearPromo) };
}

/** USD → পয়সা (৯.৭৩ → ৯৭৩) — Porkbun-এর `cost` ঘরের জন্য */
export const cents = (usd: number) => Math.round(usd * 100);

export class Porkbun {
  constructor(private cfg: PorkbunConfig) {}

  get configured(): boolean {
    return !!(this.cfg.apiKey && this.cfg.secret);
  }

  /** sandbox চাবি (pk1_sb_…) — আসল টাকা কাটে না */
  get sandbox(): boolean {
    return (this.cfg.apiKey || "").startsWith("pk1_sb_");
  }

  async req<T = Record<string, any>>(path: string, body: Record<string, unknown> = {}, idem?: string): Promise<PbResult<T>> {
    if (!this.configured) return { ok: false, data: {} as T, code: "NOT_CONFIGURED", message: "Porkbun-এর চাবি বসানো নেই" };
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "X-API-Key": this.cfg.apiKey!,
        "X-Secret-API-Key": this.cfg.secret!,
      };
      // একই কেনা/রিনিউ নেটওয়ার্কের কারণে দুবার গেলে Porkbun আগের উত্তরই দেয় (২৪ ঘণ্টা)
      if (idem) headers["Idempotency-Key"] = idem;
      const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      const json = (await res.json().catch(() => ({}))) as Record<string, any>;
      const ok = res.ok && json.status === "SUCCESS";
      return { ok, data: json as T, code: ok ? undefined : String(json.code || `HTTP_${res.status}`), message: ok ? undefined : String(json.message || "Porkbun থেকে উত্তর আসেনি") };
    } catch (e) {
      return { ok: false, data: {} as T, code: "NETWORK", message: (e as Error).message };
    }
  }

  /** সংযোগ যাচাই — কোন অ্যাকাউন্টের চাবি */
  ping() {
    return this.req<{ account?: string; yourIp?: string; sandbox?: boolean }>("/ping");
  }

  /** একটা নামের দাম/অবস্থা (দামি কাজের ঠিক আগে) */
  async check(domain: string): Promise<{ ok: boolean; check?: PbCheck; message?: string; code?: string }> {
    const r = await this.req<{ response?: Record<string, unknown> }>(`/domain/checkDomain/${encodeURIComponent(domain)}`);
    if (!r.ok) return { ok: false, message: r.message, code: r.code };
    const check = parseCheck(domain, r.data.response);
    return check ? { ok: true, check } : { ok: false, message: "দাম জানা যায়নি" };
  }

  /** একসাথে ২৫টা পর্যন্ত নাম (খোঁজার পেজ) — যেগুলোর উত্তর আসেনি সেগুলো `unresolved` */
  async checkMany(domains: string[]): Promise<{ ok: boolean; results: PbCheck[]; unresolved: string[]; message?: string; code?: string }> {
    const list = [...new Set(domains)].slice(0, 25);
    const r = await this.req<{ domains?: Record<string, Record<string, unknown>>; unresolved?: string[] }>("/domain/checkDomain", { domains: list });
    if (!r.ok) return { ok: false, results: [], unresolved: list, message: r.message, code: r.code };
    const results = list.map((d) => parseCheck(d, r.data.domains?.[d])).filter((x): x is PbCheck => !!x);
    const unresolved = list.filter((d) => !results.some((x) => x.domain === d));
    return { ok: true, results, unresolved };
  }

  /** কেনা — cost (পয়সা) Porkbun-এর এখনকার দামের সাথে হুবহু মিলতে হবে */
  register(domain: string, costCents: number, idem: string) {
    return this.req<{ domain?: string; cost?: number; orderId?: number | string; balance?: number }>(
      `/domain/create/${encodeURIComponent(domain)}`, { cost: costCents, agreeToTerms: "yes" }, idem);
  }

  /** রিনিউ (ন্যূনতম মেয়াদ, সাধারণত ১ বছর) — কেনা/রিনিউয়ের ৩০ দিনের মধ্যে হয় না (RENEWAL_TOO_SOON) */
  renew(domain: string, costCents: number, idem: string) {
    return this.req<{ expirationDate?: string; cost?: number; orderId?: number | string; balance?: number }>(
      `/domain/renew/${encodeURIComponent(domain)}`, { cost: costCents }, idem);
  }

  /** নেমসার্ভার বসানো (Cloudflare-এর দুটো) */
  updateNs(domain: string, ns: string[]) {
    return this.req(`/domain/updateNs/${encodeURIComponent(domain)}`, { ns });
  }

  /** Porkbun-এর নিজের অটো-রিনিউ বন্ধ — রিনিউ আমরা করি, দোকানদারের ব্যালেন্স থেকে (নইলে আমাদের ক্রেডিট থেকে কেটে নিত) */
  autoRenewOff(domain: string) {
    return this.req(`/domain/updateAutoRenew/${encodeURIComponent(domain)}`, { status: "off" });
  }
}

export function porkbunFromEnv(env: { PORKBUN_API_KEY?: string; PORKBUN_SECRET_KEY?: string }): Porkbun {
  return new Porkbun({ apiKey: env.PORKBUN_API_KEY, secret: env.PORKBUN_SECRET_KEY });
}

/** Porkbun-এর ত্রুটি → দোকানদারের বোঝার মতো বার্তা */
export function pbError(code?: string, message?: string): string {
  switch (code) {
    case "NOT_CONFIGURED": return "ডোমেইন বিক্রি এখনো চালু করা হয়নি। সাপোর্টে যোগাযোগ করুন।";
    case "INSUFFICIENT_FUNDS": return "এই মুহূর্তে ডোমেইন কেনা যাচ্ছে না (আমাদের দিকের সমস্যা)। আপনার টাকা ফেরত দেওয়া হয়েছে — একটু পরে চেষ্টা করুন বা সাপোর্টে জানান।";
    case "COST_MISMATCH": return "ডোমেইনের দাম এইমাত্র বদলেছে। আবার খুঁজে নতুন দামে কিনুন।";
    case "ORDER_TOO_LARGE": return "এই ডোমেইনের দাম আমাদের সীমার বেশি।";
    case "RATE_LIMIT_EXCEEDED": return "একটু বেশি খোঁজা হয়েছে — এক মিনিট পরে আবার চেষ্টা করুন।";
    case "RENEWAL_TOO_SOON": return "কেনা বা রিনিউয়ের ৩০ দিনের মধ্যে আবার রিনিউ করা যায় না।";
    case "NETWORK": return "ডোমেইন কোম্পানির সাথে যোগাযোগ হয়নি। একটু পরে আবার চেষ্টা করুন।";
    default: return `ডোমেইন কোম্পানি থেকে ত্রুটি${message ? `: ${message}` : ""}`;
  }
}
