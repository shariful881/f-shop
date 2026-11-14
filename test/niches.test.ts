import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, DB, resetDb, shopDb, shopStub } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { clearSettingsCache } from "../src/platform/billing";
import { clearShopCache } from "../src/platform/resolve";
import { NICHES, nicheByKey } from "../src/shop/lib/niches";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;
let ipN = 1;
const freshIp = () => `172.20.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

async function superB() {
  await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES ('o@t.com', 'o', 'owner', ?, 1)")
    .bind(await hashPassword("teampass123", 1000)).run();
  const b = new Browser(freshIp());
  await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "o@t.com", password: "teampass123" }) } as RequestInit);
  return b;
}
const spost = (b: Browser, path: string) => b.fetch(path, { method: "POST", base: P, body: new URLSearchParams() } as RequestInit);
const setting = async (shopId: string, k: string) => ((await shopDb(shopId).prepare("SELECT value FROM settings WHERE key = ?").bind(k).first()) as any)?.value;

function signup(over: Record<string, string>) {
  return new Browser(freshIp()).fetch("/signup", {
    method: "POST", base: P,
    body: new URLSearchParams({ shop_name: "নতুন দোকান", owner_name: "করিম", phone: "01812345678", email: `${over.slug}@x.com`, password: "secret123", seed_demo: "1", ...over }),
  } as RequestInit);
}

let ghFiles: Record<string, Uint8Array> = {};
const ghHits: string[] = [];
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  ghFiles = {}; ghHits.length = 0;
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://raw.githubusercontent.com/")) {
      ghHits.push(url);
      const f = ghFiles[url.split("/").pop()!];
      return f ? new Response(f, { headers: { "content-type": "image/jpeg" } }) : new Response("nai", { status: 404 });
    }
    return real(input, init);
  });
  await resetDb();
  await pdb().prepare("DELETE FROM shops WHERE demo_niche IS NOT NULL OR niche IS NOT NULL").run();
  clearShopCache();
  clearSettingsCache();
});

describe("নিশের ডাটা", () => {
  it("৬টা নিশ, প্রতিটায় ২০টা পণ্য, সব পণ্যের ক্যাটাগরি তালিকায় আছে", () => {
    expect(NICHES.length).toBe(6);
    for (const n of NICHES) {
      expect(n.products.length).toBe(20);
      for (const p of n.products) {
        expect(n.cats).toContain(p.cat);
        expect(p.compare).toBeGreaterThan(p.price);
      }
    }
  });
});

describe("সাইনআপে নিশ বাছাই", () => {
  it("নিশ + নমুনা পণ্য: ক্যাটাগরি, ২০টা পণ্য, থিম, রং, ডেলিভারি, পেজ বসে", async () => {
    const r = await signup({ slug: "sutoshop", niche: "sutokotha" });
    expect(r.status).toBe(303);
    const s = (await pdb().prepare("SELECT id, niche FROM shops WHERE slug = 'sutoshop'").first<{ id: string; niche: string }>())!;
    expect(s.niche).toBe("sutokotha");
    const db = shopDb(s.id);
    expect((await db.prepare("SELECT COUNT(*) n FROM categories").first())!.n).toBe(5);
    expect((await db.prepare("SELECT COUNT(*) n FROM products").first())!.n).toBe(20);
    expect((await db.prepare("SELECT COUNT(*) n FROM product_variants").first())!.n).toBe(12); // ৪টা কুর্তি × ৩ সাইজ
    expect(await setting(s.id, "theme")).toBe("pro");
    expect(await setting(s.id, "brand_color")).toBe("#9d174d");
    expect(await setting(s.id, "delivery_inside")).toBe("70");
    expect(await setting(s.id, "site_name")).toBe("নতুন দোকান"); // ডেমোর নাম নয়
    expect(await setting(s.id, "demo_mode")).toBeFalsy();
    expect((await db.prepare("SELECT COUNT(*) n FROM pages").first())!.n).toBe(4);
    expect(JSON.parse(await setting(s.id, "theme_cfg_pro")).announcement).toContain("থ্রি-পিস");
  });

  it("নিশ বাছল কিন্তু নমুনা পণ্য চাইল না: শুধু ক্যাটাগরি আর সেটিং, পণ্য নেই", async () => {
    await signup({ slug: "khalishop", niche: "tokmaya", seed_demo: "" });
    const s = (await pdb().prepare("SELECT id FROM shops WHERE slug = 'khalishop'").first<{ id: string }>())!;
    expect((await shopDb(s.id).prepare("SELECT COUNT(*) n FROM products").first())!.n).toBe(0);
    expect((await shopDb(s.id).prepare("SELECT COUNT(*) n FROM categories").first())!.n).toBe(5);
    expect(await setting(s.id, "theme")).toBe("minimal");
  });

  it("ভুল নিশ নাম উপেক্ষা হয়, পুরনো নমুনা পণ্য বসে; ?niche= দিলে ফর্মে বাছাই থাকে", async () => {
    await signup({ slug: "vulshop", niche: "nai" });
    const s = (await pdb().prepare("SELECT id, niche FROM shops WHERE slug = 'vulshop'").first<{ id: string; niche: string | null }>())!;
    expect(s.niche).toBeNull();
    expect((await shopDb(s.id).prepare("SELECT COUNT(*) n FROM products").first())!.n).toBe(3);
    const html = await (await new Browser().fetch("/signup?niche=khatibari", { base: P } as RequestInit)).text();
    expect(html).toMatch(/<option value="khatibari" selected/);
  });
});

describe("ডেমো দোকান", () => {
  it("সুপার অ্যাডমিন তৈরি করে: সাপোর্ট নম্বর, লোগো, ডেমো বার, অর্ডার বন্ধ, বিল হয় না, হোমপেজে লিংক", async () => {
    await pdb().prepare("INSERT INTO platform_settings (key, value) VALUES ('support_phone', '01300901666') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    clearSettingsCache();
    const b = await superB();
    const dp = await (await b.fetch("/super/demos", { base: P } as RequestInit)).text();
    expect(dp).toContain("সুতোকথা");
    expect((await spost(b, "/super/demos/sutokotha")).status).toBe(303);
    const s = (await pdb().prepare("SELECT * FROM shops WHERE demo_niche = 'sutokotha'").first<Record<string, any>>())!;
    expect(s).toMatchObject({ slug: "sutokotha", status: "active", next_bill_at: null });
    expect(await setting(s.id, "site_name")).toBe("সুতোকথা");
    expect(await setting(s.id, "contact_phone")).toBe("01300901666");
    expect(await setting(s.id, "whatsapp")).toBe("01300901666");
    expect(await setting(s.id, "logo")).toBe("logo/sutokotha.png");
    expect((await shopDb(s.id).prepare("SELECT COUNT(*) n FROM products").first())!.n).toBe(20);

    // আবার চাপলে দ্বিগুণ হয় না
    await spost(b, "/super/demos/sutokotha");
    expect((await shopDb(s.id).prepare("SELECT COUNT(*) n FROM products").first())!.n).toBe(20);
    expect((await pdb().prepare("SELECT COUNT(*) n FROM shops WHERE demo_niche = 'sutokotha'").first())!.n).toBe(1);

    const shopBase = "https://sutokotha.ourdomain.com";
    const v = new Browser(freshIp());
    const home = await (await v.fetch("/", { base: shopBase } as RequestInit)).text();
    expect(home).toContain("ডেমো দোকান");
    expect(home).toContain("/signup?niche=sutokotha");
    const pid = ((await shopDb(s.id).prepare("SELECT id FROM products WHERE slug = 'sutokotha-01'").first()) as any).id;
    const r = await v.fetch("/order", {
      method: "POST", base: shopBase,
      body: new URLSearchParams({ source: "landing", product_id: String(pid), name: "রহিম উদ্দিন", phone: "01712345678", address: "বাসা ১২, রোড ৩, মিরপুর, ঢাকা", area: "inside" }),
    } as RequestInit);
    expect(r.status).toBe(403);
    expect(await r.text()).toContain("ডেমো দোকান");
    expect((await shopDb(s.id).prepare("SELECT COUNT(*) n FROM orders").first())!.n).toBe(0);

    const ph = await (await new Browser().fetch("/", { base: P } as RequestInit)).text();
    expect(ph).toContain("https://sutokotha.ourdomain.com");
  });

  it("ঠিকানা আগেই নেওয়া থাকলে <নিশ>-demo ঠিকানায় তৈরি হয়", async () => {
    await pdb().prepare("INSERT INTO shops (id, slug, name, status) VALUES ('x-1', 'tokmaya', 'অন্য', 'active')").run();
    await spost(await superB(), "/super/demos/tokmaya");
    expect((await pdb().prepare("SELECT slug FROM shops WHERE demo_niche = 'tokmaya'").first<{ slug: string }>())!.slug).toBe("tokmaya-demo");
    await pdb().prepare("DELETE FROM shops WHERE id = 'x-1'").run();
  });

  it("ডেমোর ছবি নতুন দোকানে কপি হয় (নিশ + নমুনা পণ্য বাছলে)", async () => {
    await spost(await superB(), "/super/demos/khatibari");
    const demo = (await pdb().prepare("SELECT id FROM shops WHERE demo_niche = 'khatibari'").first<{ id: string }>())!;
    await shopStub(demo.id).importNicheImages(demo.id, [
      { key: "p/honey.png", type: "image/png", data: PNG.slice().buffer, product: "khatibari-01" },
      { key: "banner1/b.png", type: "image/png", data: PNG.slice().buffer, setting: "banner_1" },
    ]);
    await signup({ slug: "modhushop", niche: "khatibari" });
    const s = (await pdb().prepare("SELECT id FROM shops WHERE slug = 'modhushop'").first<{ id: string }>())!;
    expect(((await shopDb(s.id).prepare("SELECT image FROM products WHERE slug = 'khatibari-01'").first()) as any).image).toBe("p/honey.png");
    expect(await setting(s.id, "banner_1")).toBe("banner1/b.png");
    const img = await new Browser().fetch("/img/p/honey.png", { base: "https://modhushop.ourdomain.com" } as RequestInit);
    expect(img.status).toBe(200);
  });
});

describe("ডেমোর আঁকা ছবি repo থেকে", () => {
  it("তৈরি/আপডেটের সময় যেসব ছবি নেই সেগুলো demo/images থেকে বসে; আবার চাপলে আর আনে না", async () => {
    ghFiles = { "gadgetpara-01.jpg": PNG, "gadgetpara-banner-1.jpg": PNG };
    const b = await superB();
    await spost(b, "/super/demos/gadgetpara");
    expect(ghHits.length).toBe(23); // ২০ পণ্য + ৩ ব্যানার
    expect(ghHits[0]).toBe("https://raw.githubusercontent.com/shariful881/f-shop/main/demo/images/gadgetpara-01.jpg");
    const s = (await pdb().prepare("SELECT id FROM shops WHERE demo_niche = 'gadgetpara'").first<{ id: string }>())!;
    expect(((await shopDb(s.id).prepare("SELECT image FROM products WHERE slug = 'gadgetpara-01'").first()) as any).image).toBe("p/gadgetpara-01.jpg");
    expect(await setting(s.id, "banner_1")).toBe("banner1/gadgetpara-banner-1.jpg");
    ghHits.length = 0;
    await spost(b, "/super/demos/gadgetpara");
    expect(ghHits.length).toBe(21); // শুধু যেগুলো এখনো নেই
  });
});

describe("একসাথে ছবি আপলোড", () => {
  it("ফাইলের নাম = slug হলে পণ্যে, -banner-N হলে ব্যানারে বসে; না মিললে জানায়", async () => {
    const a = await adminBrowser();
    await DB.prepare("UPDATE products SET slug = 'demo-01', image = NULL WHERE id = 1").run();
    const fd = new FormData();
    fd.append("files", new File([PNG], "DEMO-01.png", { type: "image/png" }));
    fd.append("files", new File([PNG], "amar-banner-2.png", { type: "image/png" }));
    fd.append("files", new File([PNG], "kichu-na.png", { type: "image/png" }));
    const r = await a.fetch("/admin/products/images", { method: "POST", body: fd });
    const html = await r.text();
    expect(html).toContain("২টা ছবি বসেছে");
    expect(html).toContain("kichu-na.png");
    const p = (await DB.prepare("SELECT image FROM products WHERE id = 1").first()) as any;
    expect(p.image).toMatch(/^p\/.+\.png$/);
    expect(((await DB.prepare("SELECT value FROM settings WHERE key = 'banner_2'").first()) as any).value).toMatch(/^banner2\//);
    expect(nicheByKey("sutokotha")?.name).toBe("সুতোকথা");
  });
});
