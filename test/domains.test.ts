import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, DEMO_SHOP_ID, resetDb } from "./helpers";
import { normalizeDomain, validateDnsInput, checkPendingDomains, cfFromEnv } from "../src/platform/domains";
import { clearShopCache } from "../src/platform/resolve";

/* ---------- নকল Cloudflare API ---------- */
type Rec = { id: string; type: string; name: string; content: string; priority?: number; meta?: Record<string, unknown> };
let cf: {
  zones: Map<string, { id: string; name: string; status: string }>;
  dns: Map<string, Rec[]>;
  scanned: Map<string, Rec[]>;
  workerDomains: { id: string; hostname: string; zone_id: string }[];
  calls: string[];
  failCreate?: { code: number; message: string };
};

function reply(result: unknown, ok = true, errors: unknown[] = []) {
  return new Response(JSON.stringify({ success: ok, result, errors }), { status: ok ? 200 : 400, headers: { "content-type": "application/json" } });
}

beforeEach(async () => {
  await resetDb();
  await env.PLATFORM_DB.prepare("DELETE FROM domains WHERE zone_id IS NOT NULL").run();
  clearShopCache();
  cf = { zones: new Map(), dns: new Map(), scanned: new Map(), workerDomains: [], calls: [] };
  let n = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "api.cloudflare.com") throw new Error("unexpected fetch " + url);
    const method = init?.method || "GET";
    const path = url.pathname.replace("/client/v4", "");
    const body = init?.body ? JSON.parse(init.body) : {};
    cf.calls.push(`${method} ${path}`);
    expect(init.headers.authorization).toBe("Bearer test-token");
    let m: RegExpMatchArray | null;
    if (method === "POST" && path === "/zones") {
      if (cf.failCreate) return reply(null, false, [cf.failCreate]);
      expect(body.account.id).toBe("acc1");
      const id = `zone${++n}`;
      cf.zones.set(id, { id, name: body.name, status: "pending" });
      cf.dns.set(id, []);
      cf.scanned.set(id, [
        { id: `s${n}a`, type: "MX", name: body.name, content: "mx.zoho.com", priority: 10 },
        { id: `s${n}b`, type: "A", name: body.name, content: "1.2.3.4" },
        { id: `s${n}c`, type: "TXT", name: body.name, content: "v=spf1 include:zoho.com ~all" },
      ]);
      return reply({ id, name_servers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"], status: "pending" });
    }
    if ((m = path.match(/^\/zones\/([^/]+)$/))) {
      const z = cf.zones.get(m[1]!);
      if (method === "DELETE") { cf.zones.delete(m[1]!); return reply({ id: m[1] }); }
      return z ? reply({ ...z, name_servers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"] }) : reply(null, false, [{ code: 1001, message: "not found" }]);
    }
    if ((m = path.match(/^\/zones\/([^/]+)\/activation_check$/))) return reply({});
    if ((m = path.match(/^\/zones\/([^/]+)\/dns_records\/scan\/trigger$/))) return reply({});
    if ((m = path.match(/^\/zones\/([^/]+)\/dns_records\/scan\/review$/))) {
      const z = m[1]!;
      if (method === "GET") return reply(cf.scanned.get(z) ?? []);
      const acc = (body.accepts as { id: string }[]).map((a) => a.id);
      for (const r of cf.scanned.get(z) ?? []) if (acc.includes(r.id)) cf.dns.get(z)!.push({ ...r, id: `d-${r.id}` });
      cf.scanned.set(z, []);
      return reply({});
    }
    if ((m = path.match(/^\/zones\/([^/]+)\/dns_records$/))) {
      const z = m[1]!;
      if (method === "GET") return reply(cf.dns.get(z) ?? []);
      const rec = { ...body, id: `d${++n}` };
      cf.dns.get(z)!.push(rec);
      return reply(rec);
    }
    if ((m = path.match(/^\/zones\/([^/]+)\/dns_records\/([^/]+)$/)) && method === "DELETE") {
      cf.dns.set(m[1]!, (cf.dns.get(m[1]!) ?? []).filter((r) => r.id !== m![2]));
      return reply({ id: m[2] });
    }
    if (path === "/accounts/acc1/workers/domains" && method === "PUT") {
      expect(body.service).toBe("f-shop");
      const conflict = (cf.dns.get(body.zone_id) ?? []).some((r) => r.name === body.hostname && ["A", "AAAA", "CNAME"].includes(r.type));
      if (conflict) return reply(null, false, [{ code: 100117, message: "Hostname already has externally managed DNS records" }]);
      cf.workerDomains.push({ id: `w${++n}`, hostname: body.hostname, zone_id: body.zone_id });
      cf.dns.get(body.zone_id)!.push({ id: `wr${n}`, type: "AAAA", name: body.hostname, content: "100::", meta: { read_only: true } });
      return reply({ id: `w${n}`, hostname: body.hostname });
    }
    if (path === "/accounts/acc1/workers/domains" && method === "GET") {
      return reply(cf.workerDomains.filter((d) => d.zone_id === url.searchParams.get("zone_id")));
    }
    if ((m = path.match(/^\/accounts\/acc1\/workers\/domains\/([^/]+)$/)) && method === "DELETE") {
      cf.workerDomains = cf.workerDomains.filter((d) => d.id !== m![1]);
      return reply({});
    }
    throw new Error(`unmocked CF call ${method} ${path}`);
  });
});
afterEach(() => vi.restoreAllMocks());

const domainRows = async () => (await env.PLATFORM_DB.prepare("SELECT hostname, status, zone_id FROM domains WHERE shop_id = ? AND zone_id IS NOT NULL ORDER BY hostname").bind(DEMO_SHOP_ID).all<any>()).results;

describe("ডোমেইন ইনপুট যাচাই", () => {
  it.each([
    ["dokan.com", "dokan.com"],
    ["https://www.Dokan.com/shop?x=1", "dokan.com"],
    ["rojoni.com.bd", "rojoni.com.bd"],
    ["www.rojoni.com.bd", "rojoni.com.bd"],
  ])("%s → %s", (input, out) => expect(normalizeDomain(input, "ourdomain.com").domain).toBe(out));

  it.each([
    ["shop.dokan.com", "subdomain নয়"],
    ["abc", "সঠিক ডোমেইন"],
    ["my shop.com", "সঠিক ডোমেইন"],
    ["ourdomain.com", "আমাদের নিজের"],
    ["x.ourdomain.com", "আমাদের নিজের"],
  ])("বাতিল: %s", (input, msg) => expect(normalizeDomain(input, "ourdomain.com").error).toContain(msg));
});

describe("নিজের ডোমেইন: নেমসার্ভার পদ্ধতি", () => {
  it("যোগ → নেমসার্ভার দেখায় → যাচাই (অপেক্ষায়) → নেমসার্ভার বসলে চালু → ডোমেইনে দোকান খোলে", async () => {
    const a = await adminBrowser();
    const r = await a.post("/admin/domain", { domain: "www.dokan.com" });
    expect(r.status).toBe(303);
    expect(await domainRows()).toEqual([
      { hostname: "dokan.com", status: "pending", zone_id: "zone1" },
      { hostname: "www.dokan.com", status: "pending", zone_id: "zone1" },
    ]);
    expect(cf.calls).toContain("POST /zones/zone1/dns_records/scan/trigger");

    const page = await (await a.get("/admin/domain")).text();
    expect(page).toContain("ada.ns.cloudflare.com");
    expect(page).toContain("bob.ns.cloudflare.com");

    // pending ডোমেইনে দোকান খোলে না
    expect((await SELF.fetch("https://dokan.com/")).status).toBe(404);

    // নেমসার্ভার বসেনি
    await a.post("/admin/domain/check", {});
    expect((await domainRows())[0].status).toBe("pending");

    // পুরনো A রেকর্ড আছে (স্ক্যান থেকে) — চালুর সময় সরিয়ে দিতে হবে
    cf.dns.get("zone1")!.push({ id: "old", type: "A", name: "dokan.com", content: "1.2.3.4" });
    cf.zones.get("zone1")!.status = "active";
    await a.post("/admin/domain/check", {});
    expect((await domainRows()).map((d: any) => d.status)).toEqual(["active", "active"]);
    expect(cf.workerDomains.map((d) => d.hostname).sort()).toEqual(["dokan.com", "www.dokan.com"]);
    expect(cf.dns.get("zone1")!.some((r) => r.id === "old")).toBe(false);

    clearShopCache();
    const site = await SELF.fetch("https://dokan.com/");
    expect(site.status).toBe(200);
    expect(await site.text()).toContain("কাঠের ওয়াল শেলফ");
    expect((await SELF.fetch("https://www.dokan.com/")).status).toBe(200);
  });

  it("cron প্রতি ৩০ মিনিটে অপেক্ষায় থাকা ডোমেইন নিজে চালু করে", async () => {
    const a = await adminBrowser();
    await a.post("/admin/domain", { domain: "auto.com" });
    cf.zones.get("zone1")!.status = "active";
    const n = await checkPendingDomains(env.PLATFORM_DB, cfFromEnv(env));
    expect(n).toBe(1);
    expect((await domainRows()).every((d: any) => d.status === "active")).toBe(true);
  });

  it("একই ডোমেইন দুই দোকানে নয়; এক দোকানে একটাই ডোমেইন", async () => {
    await env.PLATFORM_DB.prepare("INSERT INTO shops (id, slug, name) VALUES ('other', 'other', 'অন্য')").run();
    await env.PLATFORM_DB.prepare("INSERT INTO domains (hostname, shop_id, status, zone_id, root) VALUES ('taken.com', 'other', 'active', 'zx', 'taken.com')").run();
    const a = await adminBrowser();
    const r = await a.post("/admin/domain", { domain: "taken.com" });
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("অন্য একটা দোকানে");

    await a.post("/admin/domain", { domain: "first.com" });
    const r2 = await a.post("/admin/domain", { domain: "second.com" });
    expect(await r2.text()).toContain("আগেই একটা ডোমেইন আছে");
  });

  it("Cloudflare-এ অন্য অ্যাকাউন্টে থাকলে বোঝার মতো বার্তা", async () => {
    cf.failCreate = { code: 1061, message: "already exists" };
    const a = await adminBrowser();
    const r = await a.post("/admin/domain", { domain: "exists.com" });
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("অন্য কোনো অ্যাকাউন্টে");
    expect(await domainRows()).toEqual([]);
  });

  it("ডোমেইন সরালে zone আর Worker সংযোগ মুছে যায়", async () => {
    const a = await adminBrowser();
    await a.post("/admin/domain", { domain: "gone.com" });
    cf.zones.get("zone1")!.status = "active";
    await a.post("/admin/domain/check", {});
    await a.post("/admin/domain/remove", {});
    expect(await domainRows()).toEqual([]);
    expect(cf.zones.size).toBe(0);
    expect(cf.workerDomains).toEqual([]);
    clearShopCache();
    expect((await SELF.fetch("https://gone.com/")).status).toBe(404);
  });

  it("শুধু মালিক ডোমেইন আর DNS পেজ দেখতে পারে", async () => {
    const owner = await adminBrowser();
    await owner.post("/admin/staff", { name: "ম্যানেজার", email: "m@shop.test", password: "staffpass1", role: "manager" });
    const m = new Browser();
    await m.post("/admin/login", { email: "m@shop.test", password: "staffpass1" });
    expect((await m.get("/admin/domain")).status).toBe(403);
    expect((await m.get("/admin/dns")).status).toBe(403);
  });
});

describe("DNS রেকর্ড পেজ", () => {
  async function withDomain() {
    const a = await adminBrowser();
    await a.post("/admin/domain", { domain: "mail.test.com".replace("mail.", "") });
    return a;
  }

  it("আগের DNS-এর রেকর্ড গ্রহণ করা যায় — মূল ডোমেইনের A বাদ যায়, MX/TXT যোগ হয়", async () => {
    const a = await withDomain();
    const page = await (await a.get("/admin/dns")).text();
    expect(page).toContain("mx.zoho.com");
    await a.post("/admin/dns/accept-scan", {});
    const types = cf.dns.get("zone1")!.map((r) => r.type).sort();
    expect(types).toEqual(["MX", "TXT"]);
  });

  it("রেকর্ড যোগ আর মোছা; মূল/www-এ A/CNAME দেওয়া যায় না", async () => {
    const a = await withDomain();
    expect((await a.post("/admin/dns", { type: "MX", name: "@", content: "mx1.example.net", priority: 5 })).status).toBe(303);
    expect((await a.post("/admin/dns", { type: "TXT", name: "_verify", content: "abc123" })).status).toBe(303);
    const recs = cf.dns.get("zone1")!;
    expect(recs.find((r) => r.type === "MX")).toMatchObject({ name: "test.com", content: "mx1.example.net", priority: 5 });
    expect(recs.find((r) => r.type === "TXT")).toMatchObject({ name: "_verify.test.com" });

    const bad = await a.post("/admin/dns", { type: "CNAME", name: "www", content: "x.com" });
    expect(bad.status).toBe(422);
    expect(await bad.text()).toContain("সংরক্ষিত");

    const txt = recs.find((r) => r.type === "TXT")!;
    await a.post(`/admin/dns/${txt.id}/delete`, {});
    expect(cf.dns.get("zone1")!.some((r) => r.id === txt.id)).toBe(false);
  });

  it("দোকানের জন্য সংরক্ষিত রেকর্ড মোছা যায় না", async () => {
    const a = await withDomain();
    cf.zones.get("zone1")!.status = "active";
    await a.post("/admin/domain/check", {});
    const protectedRec = cf.dns.get("zone1")!.find((r) => r.meta?.read_only)!;
    await a.post(`/admin/dns/${protectedRec.id}/delete`, {});
    expect(cf.dns.get("zone1")!.some((r) => r.id === protectedRec.id)).toBe(true);
  });

  it("ইনপুট যাচাই", () => {
    expect(validateDnsInput("A", "api", "999.1", "x.com").error).toBeTruthy();
    expect(validateDnsInput("A", "api", "1.2.3.4", "x.com").record).toMatchObject({ name: "api.x.com" });
    expect(validateDnsInput("A", "@", "1.2.3.4", "x.com").error).toContain("সংরক্ষিত");
    expect(validateDnsInput("SRV", "@", "x", "x.com").error).toBeTruthy();
  });
});
