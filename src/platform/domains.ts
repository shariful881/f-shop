import { Cloudflare, cfError, type CfConfig, type DnsRecord } from "./cf";
import { clearShopCache } from "./resolve";

/** দুই ভাগের দেশীয় ডোমেইন — এগুলোর আগে আরেকটা নাম থাকলেও সেটা মূল ডোমেইন */
const TWO_PART_SUFFIXES = new Set([
  "com.bd", "net.bd", "org.bd", "edu.bd", "gov.bd", "ac.bd", "info.bd", "co.bd",
  "co.uk", "org.uk", "com.au", "co.in", "com.my", "com.pk", "co.id",
]);

export type DomainRow = {
  hostname: string; shop_id: string; status: string; zone_id: string | null; nameservers: string | null;
  root: string | null; checked_at: string | null; error: string | null; created_at: string;
};

/** ইনপুট থেকে মূল ডোমেইন (dokan.com) বের করা, ভুল হলে বার্তা */
export function normalizeDomain(input: string, platformDomain: string): { domain?: string; error?: string } {
  let d = (input || "").trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0]!.split(":")[0]!.replace(/\.$/, "");
  if (d.startsWith("www.")) d = d.slice(4);
  if (!d) return { error: "ডোমেইন লিখুন" };
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return { error: "সঠিক ডোমেইন লিখুন, যেমন dokan.com" };
  const base = platformDomain.toLowerCase();
  if (d === base || d.endsWith(`.${base}`)) return { error: "এটা আমাদের নিজের ডোমেইন" };
  const parts = d.split(".");
  const suffix2 = parts.slice(-2).join(".");
  const apexParts = TWO_PART_SUFFIXES.has(suffix2) ? 3 : 2;
  if (parts.length !== apexParts) {
    return { error: `শুধু মূল ডোমেইন দিন (যেমন ${parts.slice(-apexParts).join(".")}), subdomain নয়` };
  }
  return { domain: d };
}

export function cfFromEnv(env: { CF_API_TOKEN?: string; CF_ACCOUNT_ID?: string; WORKER_NAME?: string; PLATFORM_DOMAIN?: string }): Cloudflare {
  const cfg: CfConfig = { token: env.CF_API_TOKEN, accountId: env.CF_ACCOUNT_ID, workerName: env.WORKER_NAME, platformDomain: env.PLATFORM_DOMAIN };
  return new Cloudflare(cfg);
}

export async function shopDomains(db: D1Database, shopId: string) {
  const { results } = await db.prepare("SELECT * FROM domains WHERE shop_id = ? AND zone_id IS NOT NULL ORDER BY hostname").bind(shopId).all<DomainRow>();
  return results;
}

/** ১. ডোমেইন যোগ: Cloudflare-এ zone তৈরি → নেমসার্ভার */
export async function addDomain(db: D1Database, cf: Cloudflare, shopId: string, domain: string): Promise<{ ok: boolean; message: string }> {
  if (!cf.configured) return { ok: false, message: "ডোমেইন ফিচার এখনো চালু করা হয়নি (প্ল্যাটফর্মের Cloudflare টোকেন সেট নেই)। সাপোর্টে যোগাযোগ করুন।" };
  if ((await shopDomains(db, shopId)).length) return { ok: false, message: "আপনার দোকানে আগেই একটা ডোমেইন আছে। আগে সেটা সরান।" };
  const taken = await db.prepare("SELECT shop_id FROM domains WHERE hostname IN (?, ?)").bind(domain, `www.${domain}`).first();
  if (taken) return { ok: false, message: "এই ডোমেইন আগে থেকেই অন্য একটা দোকানে যুক্ত আছে।" };

  const z = await cf.createZone(domain);
  if (!z.ok) return { ok: false, message: cfError(z) };
  const ns = JSON.stringify(z.result.name_servers ?? []);
  await db.batch([
    db.prepare("INSERT INTO domains (hostname, shop_id, status, zone_id, nameservers, root) VALUES (?, ?, 'pending', ?, ?, ?)").bind(domain, shopId, z.result.id, ns, domain),
    db.prepare("INSERT INTO domains (hostname, shop_id, status, zone_id, nameservers, root) VALUES (?, ?, 'pending', ?, ?, ?)").bind(`www.${domain}`, shopId, z.result.id, ns, domain),
  ]);
  // পুরনো DNS রেকর্ড (ইমেইল ইত্যাদি) খুঁজে আনার স্ক্যান — DNS পেজে দেখে গ্রহণ করা যাবে
  await cf.scanTrigger(z.result.id);
  return { ok: true, message: "ডোমেইন যোগ হয়েছে। এখন নিচের নেমসার্ভার দুটো আপনার ডোমেইন কোম্পানির প্যানেলে বসান।" };
}

/** ২. যাচাই: নেমসার্ভার বসেছে কি না → বসলে Worker-এর সাথে যুক্ত করে দোকান চালু */
export async function checkDomain(db: D1Database, cf: Cloudflare, shopId: string): Promise<{ status: "active" | "pending" | "none" | "error"; message: string }> {
  const rows = await shopDomains(db, shopId);
  if (!rows.length) return { status: "none", message: "কোনো ডোমেইন নেই" };
  const zoneId = rows[0]!.zone_id!;
  const root = rows[0]!.root!;
  if (rows.every((r) => r.status === "active")) return { status: "active", message: "ডোমেইন চালু আছে" };

  const z = await cf.getZone(zoneId);
  if (!z.ok) {
    await db.prepare("UPDATE domains SET checked_at = datetime('now'), error = ? WHERE zone_id = ?").bind(cfError(z), zoneId).run();
    return { status: "error", message: cfError(z) };
  }
  if (z.result.status !== "active") {
    await cf.activationCheck(zoneId);
    await db.prepare("UPDATE domains SET checked_at = datetime('now'), error = NULL WHERE zone_id = ?").bind(zoneId).run();
    return { status: "pending", message: "নেমসার্ভার এখনো বসেনি বা ছড়ায়নি। বসানোর পর কয়েক মিনিট থেকে ২৪ ঘণ্টা লাগতে পারে।" };
  }

  // মূল আর www-এ আগে থেকে A/AAAA/CNAME থাকলে Worker যুক্ত করা যায় না — সরিয়ে দেওয়া
  const dns = await cf.listDns(zoneId);
  if (dns.ok) {
    for (const r of dns.result ?? []) {
      if ((r.name === root || r.name === `www.${root}`) && ["A", "AAAA", "CNAME"].includes(r.type) && !r.meta?.read_only) {
        await cf.deleteDns(zoneId, r.id);
      }
    }
  }
  for (const host of [root, `www.${root}`]) {
    const a = await cf.attachWorker(host, zoneId);
    if (!a.ok) {
      await db.prepare("UPDATE domains SET checked_at = datetime('now'), error = ? WHERE zone_id = ?").bind(cfError(a), zoneId).run();
      return { status: "error", message: `সাইট যুক্ত করা যায়নি: ${cfError(a)}` };
    }
  }
  await db.prepare("UPDATE domains SET status = 'active', checked_at = datetime('now'), error = NULL WHERE zone_id = ?").bind(zoneId).run();
  clearShopCache();
  return { status: "active", message: `অভিনন্দন! আপনার দোকান এখন ${root} ঠিকানায় চালু।` };
}

/** ডোমেইন সরানো */
export async function removeDomain(db: D1Database, cf: Cloudflare, shopId: string) {
  const rows = await shopDomains(db, shopId);
  if (!rows.length) return;
  const zoneId = rows[0]!.zone_id!;
  const wd = await cf.listWorkerDomains(zoneId);
  for (const d of (wd.ok ? wd.result : []) ?? []) await cf.detachWorker(d.id);
  await cf.deleteZone(zoneId);
  await db.prepare("DELETE FROM domains WHERE zone_id = ?").bind(zoneId).run();
  clearShopCache();
}

/** প্রতি ৩০ মিনিটে: অপেক্ষায় থাকা ডোমেইন যাচাই */
export async function checkPendingDomains(db: D1Database, cf: Cloudflare) {
  if (!cf.configured) return 0;
  const { results } = await db.prepare(
    "SELECT DISTINCT shop_id FROM domains WHERE status = 'pending' AND zone_id IS NOT NULL AND created_at > datetime('now', '-30 days') LIMIT 50",
  ).all<{ shop_id: string }>();
  let activated = 0;
  for (const r of results) if ((await checkDomain(db, cf, r.shop_id)).status === "active") activated++;
  return activated;
}

/* ---------- DNS রেকর্ড (দোকানদারের ইমেইল ইত্যাদি) ---------- */
export const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT"] as const;

export function isProtected(r: DnsRecord, root: string): boolean {
  if (r.meta?.read_only || r.meta?.origin_worker_id) return true;
  return (r.name === root || r.name === `www.${root}`) && ["A", "AAAA", "CNAME"].includes(r.type);
}

export function validateDnsInput(type: string, name: string, content: string, root: string): { record?: Partial<DnsRecord>; error?: string } {
  if (!(DNS_TYPES as readonly string[]).includes(type)) return { error: "ধরন বাছাই করুন" };
  let n = name.trim().toLowerCase().replace(/\.$/, "");
  if (n === "" || n === "@") n = root;
  else if (!n.endsWith(root)) n = `${n}.${root}`;
  if (!/^([a-z0-9_*](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)*[a-z0-9-]+\.[a-z]{2,63}$/.test(n)) return { error: "সঠিক নাম দিন" };
  if ((n === root || n === `www.${root}`) && ["A", "AAAA", "CNAME"].includes(type)) {
    return { error: "মূল ডোমেইন আর www আপনার দোকানের জন্য সংরক্ষিত" };
  }
  const c = content.trim();
  if (!c) return { error: "মান লিখুন" };
  if (type === "A" && !/^(\d{1,3}\.){3}\d{1,3}$/.test(c)) return { error: "সঠিক IPv4 ঠিকানা দিন" };
  if (type === "AAAA" && !/^[0-9a-f:]+$/i.test(c)) return { error: "সঠিক IPv6 ঠিকানা দিন" };
  if ((type === "CNAME" || type === "MX") && !/^[a-z0-9.-]+\.[a-z]{2,63}\.?$/i.test(c)) return { error: "সঠিক হোস্টনেম দিন" };
  if (c.length > 2000) return { error: "মান অনেক বড়" };
  return { record: { type, name: n, content: c, ttl: 1, proxied: false } };
}
