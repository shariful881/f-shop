import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { fontsHref, normalizeLanding, styleAttr } from "../src/shop/lib/landing";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;
const landingOf = async (id: number) => (await DB.prepare("SELECT landing_json FROM products WHERE id = ?").bind(id).first<any>())?.landing_json ?? null;

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM my_templates").run();
});

describe("সেকশনের ডিজাইন যাচাই", () => {
  it("শুধু বৈধ রং/ফন্ট/সাইজ থাকে, CSS ঢোকানো যায় না", () => {
    const l = normalizeLanding({
      style: { font: "baloo" },
      sections: [{ id: "h1", type: "hero", style: { bg: "#FF0000", color: "red;background:url(x)", btn_bg: "#00ff00", font: "comic", size: "lg", align: "center" } }],
    });
    expect(l.style).toEqual({ font: "baloo" });
    expect(l.sections[0]!.style).toEqual({ bg: "#ff0000", btn_bg: "#00ff00", size: "lg", align: "center" });
    expect(styleAttr(l.sections[0]!.style)).toBe("--lp-bg:#ff0000;--lp-btn:#00ff00;text-align:center");
    expect(fontsHref(l)).toContain("family=Baloo+Da+2");
    expect(fontsHref(normalizeLanding({ sections: [] }))).toBeNull();
  });

  it("একই id দুবার থাকলে আলাদা করে দেয়, id-তে অদ্ভুত অক্ষর বাদ", () => {
    const l = normalizeLanding({ sections: [{ id: "a\"><x", type: "faq" }, { id: "ax", type: "trust" }] });
    const ids = l.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("ax");
  });
});

describe("টেমপ্লেট গ্যালারি", () => {
  it("SellxBD-এর টেমপ্লেট দেখায়, টেমপ্লেট + পণ্য বাছাই করলে পেজ তৈরি হয়", async () => {
    const a = await adminBrowser();
    const html = await (await a.get("/admin/landing/new")).text();
    expect(html).toContain("ফ্যাশন ও পোশাক");
    expect(html).toContain("বেবি প্রোডাক্ট");
    const tpl = (await pdb().prepare("SELECT id FROM landing_templates WHERE name = 'ফ্যাশন ও পোশাক'").first<{ id: number }>())!;

    const r = await a.post("/admin/landing/new", { template: `p:${tpl.id}`, product_id: "1" });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/admin/products/1/landing");
    const saved = JSON.parse(await landingOf(1));
    expect(saved.style.font).toBe("anek");
    expect(saved.sections[0].style.bg).toBe("#fff1f2");

    // দাম, ছবি পণ্য থেকেই; শিরোনাম ফাঁকা থাকলে পণ্যের শিরোনাম
    const page = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(page).toContain("ঘরের দেয়ালে আনুন প্রাকৃতিক কাঠের সৌন্দর্য");
    expect(page).toContain("--lp-bg:#fff1f2");
    expect(page).toContain("fonts.googleapis.com/css2?family=Anek+Bangla");
    expect(page).toContain("আরামদায়ক কাপড়, নিখুঁত ফিটিং");

    expect((await a.get("/admin/landing")).status).toBe(200);
    expect(await (await a.get("/admin/landing")).text()).toContain("/admin/products/1/landing");
  });

  it("পণ্য না দিলে বা ভুল টেমপ্লেটে তৈরি হয় না; বন্ধ টেমপ্লেট দেখায় না", async () => {
    const a = await adminBrowser();
    expect((await a.post("/admin/landing/new", { template: "p:1", product_id: "" })).headers.get("location")).toBe("/admin/landing/new");
    expect((await a.post("/admin/landing/new", { template: "x:1", product_id: "1" })).headers.get("location")).toBe("/admin/landing/new");
    expect(await landingOf(1)).toBeNull();

    await pdb().prepare("UPDATE landing_templates SET active = 0 WHERE name = 'গ্যাজেট ও ইলেকট্রনিক্স'").run();
    const html = await (await a.get("/admin/landing/new")).text();
    expect(html).not.toContain("গ্যাজেট ও ইলেকট্রনিক্স");
    const off = (await pdb().prepare("SELECT id FROM landing_templates WHERE name = 'গ্যাজেট ও ইলেকট্রনিক্স'").first<{ id: number }>())!;
    await a.post("/admin/landing/new", { template: `p:${off.id}`, product_id: "1" });
    expect(await landingOf(1)).toBeNull();
    await pdb().prepare("UPDATE landing_templates SET active = 1").run();
  });
});

describe("আমার টেমপ্লেট", () => {
  const design = { sections: [{ id: "h", type: "hero", data: { headline: "আমার ডিজাইন" }, style: { bg: "#123456" } }, { id: "o", type: "order_form", data: {} }] };

  it("এডিটর থেকে সেভ → শুধু এই দোকানের তালিকায়, অন্য পণ্যে বসানো যায়, মোছা যায়", async () => {
    const a = await adminBrowser();
    const r = await a.post("/admin/products/1/landing/save-template", { name: "ঈদ অফার", landing_json: JSON.stringify(design) });
    expect(r.status).toBe(200);
    const row = (await DB.prepare("SELECT id, name FROM my_templates").first<any>())!;
    expect(row.name).toBe("ঈদ অফার");
    expect(await pdb().prepare("SELECT COUNT(*) n FROM landing_templates WHERE name = 'ঈদ অফার'").first("n")).toBe(0);

    const mine = await (await a.get("/admin/landing/new?tab=mine")).text();
    expect(mine).toContain("ঈদ অফার");
    expect(await (await a.get("/admin/landing/new")).text()).not.toContain("ঈদ অফার");

    await a.post("/admin/landing/new", { template: `m:${row.id}`, product_id: "2" });
    expect(JSON.parse(await landingOf(2)).sections[0].data.headline).toBe("আমার ডিজাইন");

    await a.post(`/admin/landing/my-templates/${row.id}/delete`, {});
    expect(await DB.prepare("SELECT COUNT(*) n FROM my_templates").first("n")).toBe(0);
    expect(await landingOf(2)).not.toBeNull();
  });

  it("নাম ছাড়া সেভ হয় না", async () => {
    const a = await adminBrowser();
    expect((await a.post("/admin/products/1/landing/save-template", { name: " ", landing_json: JSON.stringify(design) })).status).toBe(400);
  });
});

describe("লাইভ এডিটর", () => {
  it("এডিটর প্রিভিউতে সেকশনে data-sec থাকে, সাধারণ পেজে থাকে না", async () => {
    const a = await adminBrowser();
    const l = JSON.stringify({ sections: [{ id: "hh", type: "hero", data: { headline: "এডিট" } }, { id: "rv", type: "reviews", data: {} }] });
    const ed = await (await a.post("/admin/products/1/landing/preview", { landing_json: l, editor: "1" })).text();
    expect(ed).toContain('data-sec="hh"');
    expect(ed).toContain('data-sec="rv"'); // খালি রিভিউও ক্লিক করার জন্য দেখায়
    expect(ed).not.toContain("প্রিভিউ — এখনো সেভ হয়নি");
    await a.post("/admin/products/1/landing", { landing_json: l });
    const live = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(live).not.toContain("data-sec=");
    expect(live).not.toContain("lp-empty");
  });

  it("এডিটর পেজে পণ্যের ড্রপডাউন; পণ্য বদলালে ডিজাইন নতুন পণ্যে যায়", async () => {
    const a = await adminBrowser();
    const html = await (await a.get("/admin/products/1/landing")).text();
    expect(html).toContain('id="lb-product"');
    expect(html).toContain('id="lb-frame"');
    const l = JSON.stringify({ sections: [{ id: "h", type: "hero", data: { headline: "সরানো ডিজাইন" } }] });
    await a.post("/admin/products/1/landing", { landing_json: l });
    const r = await a.post("/admin/products/1/landing/move", { to: "2", landing_json: l });
    expect(r.headers.get("location")).toBe("/admin/products/2/landing");
    expect(await landingOf(1)).toBeNull();
    expect(JSON.parse(await landingOf(2)).sections[0].data.headline).toBe("সরানো ডিজাইন");
  });
});

describe("সুপার অ্যাডমিন: টেমপ্লেট", () => {
  async function superB() {
    await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES ('t@t.com', 't', 'admin', ?, 1)")
      .bind(await hashPassword("teampass123", 1000)).run();
    const b = new Browser();
    await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "t@t.com", password: "teampass123" }) } as RequestInit);
    return b;
  }
  const post = (b: Browser, path: string, data: Record<string, string>) => b.fetch(path, { method: "POST", base: P, body: new URLSearchParams(data) } as RequestInit);

  it("যোগ, ভুল JSON আটকায়, দোকানের গ্যালারিতে দেখায়, মোছা যায়", async () => {
    const b = await superB();
    expect((await b.fetch("/super/templates", { base: P } as RequestInit)).status).toBe(200);
    const bad = await post(b, "/super/templates", { name: "ভুল", category: "সাধারণ", json: "{nope" });
    expect(bad.status).toBe(422);
    const json = JSON.stringify({ sections: [{ type: "hero", data: { subheadline: "ঈদ স্পেশাল" } }, { type: "order_form" }] });
    expect((await post(b, "/super/templates", { name: "ঈদ স্পেশাল", category: "সাধারণ", json, sort_order: "0" })).status).toBe(303);
    const a = await adminBrowser();
    expect(await (await a.get("/admin/landing/new")).text()).toContain("ঈদ স্পেশাল");
    const id = (await pdb().prepare("SELECT id FROM landing_templates WHERE name = 'ঈদ স্পেশাল'").first<{ id: number }>())!.id;
    await post(b, `/super/templates/${id}/delete`, {});
    expect(await (await a.get("/admin/landing/new")).text()).not.toContain("ঈদ স্পেশাল");
  });
});

describe("নিশের নতুন টেমপ্লেট", () => {
  it("৮টা নতুন টেমপ্লেট আছে, সব ঠিকমতো পড়া যায়, নতুন সেকশন থাকে", async () => {
    const { PLATFORM_DB } = (await import("cloudflare:test")).env as unknown as { PLATFORM_DB: D1Database };
    const { parseLanding } = await import("../src/shop/lib/landing");
    const { results } = await PLATFORM_DB.prepare("SELECT name, json FROM landing_templates WHERE sort_order >= 20").all<{ name: string; json: string }>();
    expect(results.length).toBe(8);
    const types = new Set<string>();
    for (const r of results) {
      const l = parseLanding(r.json);
      expect(l, r.name).not.toBeNull();
      expect(l!.sections.some((x) => x.type === "order_form")).toBe(true);
      l!.sections.forEach((x) => types.add(x.type));
    }
    for (const t of ["before_after", "comparison", "steps", "guarantee", "cta"]) expect(types.has(t)).toBe(true);
  });
});
