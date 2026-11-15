import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb } from "./helpers";
import { sanitizeHtml } from "../src/shop/lib/sanitize";
import { normalizeLanding } from "../src/shop/lib/landing";

beforeEach(resetDb);

describe("HTML নিরাপদ করা", () => {
  it.each([
    ["<p>হ্যালো <b>বোল্ড</b></p>", "<p>হ্যালো <b>বোল্ড</b></p>"],
    ["<script>alert(1)</script><p>ok</p>", "<p>ok</p>"],
    ['<img src="x.jpg" onerror="alert(1)">', '<img src="x.jpg" loading="lazy">'],
    ['<a href="javascript:alert(1)">x</a>', "<a>x</a>"],
    ['<a href="https://a.com" target="_self" onclick="x()">x</a>', '<a href="https://a.com" target="_blank" rel="noopener noreferrer">x</a>'],
    ["<iframe src=//evil></iframe>ঠিক", "ঠিক"],
    ['<div style="background:url(javascript:1)">a</div>', "<div>a</div>"],
    ["<svg onload=alert(1)><p>x</p></svg>", ""],
    ["a < b > c", "a &lt; b &gt; c"],
  ])("%s", (input, out) => expect(sanitizeHtml(input)).toBe(out));
});

describe("সেকশন যাচাই", () => {
  it("অর্ডার ফর্ম না থাকলে যোগ হয়, দুটো থাকলে একটা থাকে, অজানা ধরন বাদ", () => {
    const l = normalizeLanding({ sections: [{ type: "hero", data: { headline: "এ" } }, { type: "virus" }, { type: "order_form" }, { type: "order_form", enabled: false }] });
    expect(l.sections.map((s) => s.type)).toEqual(["hero", "order_form"]);
    expect(normalizeLanding({ sections: [] }).sections.map((s) => s.type)).toEqual(["order_form"]);
  });

  it("রিভিউর তারকা ১-৫, লম্বা লেখা কাটা, ভুল ছবির key বাদ", () => {
    const l = normalizeLanding({ sections: [{ type: "reviews", data: { reviews: [{ name: "ক", rating: 9, text: "x".repeat(5000), image: "../../etc" }] } }] });
    const r = l.sections[0]!.data.reviews![0]!;
    expect(r.rating).toBe(5);
    expect(r.text.length).toBe(1000);
    expect(r.image).toBe("");
  });
});

describe("ল্যান্ডিং পেজ বিল্ডার", () => {
  const landing = {
    sections: [
      { id: "h", type: "hero", enabled: true, data: { headline: "সেরা অফার আজই!", subheadline: "সীমিত সময়", show_price: true, button_text: "কিনুন" } },
      { id: "o", type: "order_form", enabled: true, data: { title: "এখানে অর্ডার করুন" } },
      { id: "b", type: "benefits", enabled: true, data: { title: "সুবিধা", items: ["টেকসই-ডিজাইন", "সুন্দর"] } },
      { id: "r", type: "reviews", enabled: true, data: { title: "রিভিউ", reviews: [{ name: "করিম", rating: 4, text: "দারুণ পণ্য" }] } },
      { id: "f", type: "faq", enabled: false, data: { title: "প্রশ্ন", faqs: [{ q: "লুকানো প্রশ্ন?", a: "হ্যাঁ" }] } },
      { id: "c", type: "countdown", enabled: true, data: { title: "বাকি", mode: "evergreen", minutes: 90 } },
      { id: "t", type: "text", enabled: true, data: { html: "<h3>বিস্তারিত</h3><script>bad()</script>" } },
    ],
  };

  it("বিল্ডার পেজ খোলে (প্রথমবার পণ্যের তথ্য দিয়ে সাজানো)", async () => {
    const a = await adminBrowser();
    const html = await (await a.get("/admin/products/1/landing")).text();
    expect(html).toContain('id="builder"');
    expect(html).toContain("ঘরের দেয়ালে আনুন প্রাকৃতিক কাঠের সৌন্দর্য");
    expect(html).toContain("/js/builder.js");
  });

  it("সেভ করলে সেকশন ক্রম অনুযায়ী দেখায়, বন্ধগুলো লুকানো, script বাদ", async () => {
    const a = await adminBrowser();
    expect((await a.post("/admin/products/1/landing", { landing_json: JSON.stringify(landing) })).status).toBe(303);
    const html = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(html).toContain("সেরা অফার আজই!");
    expect(html).toContain("এখানে অর্ডার করুন");
    expect(html).toContain("দারুণ পণ্য");
    expect(html).toContain('data-countdown="evergreen"');
    expect(html).toContain("<h3>বিস্তারিত</h3>");
    expect(html).not.toContain("bad()");
    expect(html).not.toContain("লুকানো প্রশ্ন?");
    // ক্রম: শিরোনাম → ফর্ম → সুবিধা
    expect(html.indexOf("সেরা অফার আজই!")).toBeLessThan(html.indexOf("এখানে অর্ডার করুন"));
    expect(html.indexOf("এখানে অর্ডার করুন")).toBeLessThan(html.indexOf("টেকসই-ডিজাইন"));
    // অর্ডার ঠিকমতো হয়
    expect((await new Browser().order()).status).toBe(303);
    expect((await lastOrder())!.total).toBe(1320);
  });

  it("প্রিভিউ সেভ হয় না; রিসেট করলে সাধারণ পেজে ফেরে", async () => {
    const a = await adminBrowser();
    const prev = await a.post("/admin/products/1/landing/preview", { landing_json: JSON.stringify(landing) });
    expect(prev.status).toBe(200);
    expect(await prev.text()).toContain("প্রিভিউ — এখনো সেভ হয়নি");
    expect((await DB.prepare("SELECT landing_json FROM products WHERE id=1").first<any>()).landing_json).toBeNull();

    await a.post("/admin/products/1/landing", { landing_json: JSON.stringify(landing) });
    await a.post("/admin/products/1/landing/reset", {});
    const html = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(html).not.toContain("সেরা অফার আজই!");
    expect(html).toContain("ঘরের দেয়ালে আনুন প্রাকৃতিক কাঠের সৌন্দর্য");
  });

  it("ছবি আপলোড (গ্যালারির জন্য) আর গ্যালারিতে দেখানো", async () => {
    const a = await adminBrowser();
    const fd = new FormData();
    fd.append("image", new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], "a.jpg", { type: "image/jpeg" }));
    const r = await a.fetch("/admin/upload-image", { method: "POST", body: fd });
    const { key } = await r.json<{ key: string }>();
    expect(key).toMatch(/^p\/.+\.jpg$/);
    await a.post("/admin/products/1/landing", { landing_json: JSON.stringify({ sections: [{ type: "gallery", data: { images: [key] } }] }) });
    const html = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(html).toContain(`/img/${key}`);
    expect((await new Browser().get(`/img/${key}`)).status).toBe(200);
  });

  it("অর্ডার স্টাফ বিল্ডার বা আপলোড ব্যবহার করতে পারে না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/staff", { name: "অর্ডার স্টাফ", email: "o@s.test", password: "staffpass1", role: "orders" });
    const o = new Browser();
    await o.post("/admin/login", { email: "o@s.test", password: "staffpass1" });
    expect((await o.get("/admin/products/1/landing")).status).toBe(403);
    expect((await o.post("/admin/upload-image", {})).status).toBe(403);
  });

  it("পুরনো 'বিস্তারিত HTML'-ও নিরাপদ করে দেখায়", async () => {
    await DB.prepare("UPDATE products SET details_html = '<p>ভালো</p><script>steal()</script>' WHERE id = 1").run();
    const html = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(html).toContain("<p>ভালো</p>");
    expect(html).not.toContain("steal()");
  });
});

describe("ল্যান্ডিং: নতুন সেকশন", () => {
  it("আগে-পরে, ধাপ, তুলনা, গ্যারান্টি, মাঝের বাটন, বড় ছবি — যাচাই আর দেখানো", async () => {
    const { normalizeLanding } = await import("../src/shop/lib/landing");
    const l = normalizeLanding({ sections: [
      { type: "before_after", data: { title: "আগে-পরে", images: ["p/a.jpg", "p/b.jpg", "p/c.jpg"], labels: ["", "৭ দিন পরে"] } },
      { type: "steps", data: { title: "ধাপ", items: ["ফর্ম পূরণ", "", "ফোনে কনফার্ম"] } },
      { type: "comparison", data: { rows: [{ label: "মান", us: "", them: "" }, { label: "" }] } },
      { type: "guarantee", data: { subheadline: "ফেরত দিন" } },
      { type: "cta", data: { headline: "আজই নিন" } },
      { type: "image", data: { images: ["../x.jpg", "p/ok.jpg"] } },
    ] });
    const by = (t: string) => l.sections.find((x) => x.type === t)!.data;
    expect(by("before_after").images).toEqual(["p/a.jpg", "p/b.jpg"]);
    expect(by("before_after").labels).toEqual(["আগে", "৭ দিন পরে"]);
    expect(by("steps").items).toEqual(["ফর্ম পূরণ", "ফোনে কনফার্ম"]);
    expect(by("comparison").rows).toHaveLength(1);
    expect(by("comparison").labels).toEqual(["আমাদের পণ্য", "অন্যরা"]);
    expect(by("guarantee").title).toBe("১০০% সন্তুষ্টির গ্যারান্টি");
    expect(by("cta").button_text).toBe("এখনই অর্ডার করুন");
    expect(by("image").images).toEqual(["p/ok.jpg"]); // ভুল key বাদ, একটাই ছবি
  });
});

describe("ল্যান্ডিং: নতুন সেকশন প্রিভিউতে দেখায়", () => {
  it("তুলনা, গ্যারান্টি, ধাপ, মাঝের বাটন HTML-এ আসে", async () => {
    const { adminBrowser, DB } = await import("./helpers");
    const a = await adminBrowser();
    const p = await DB.prepare("SELECT id FROM products LIMIT 1").first<{ id: number }>();
    const landing = { sections: [
      { type: "comparison", data: { title: "তুলনা-শিরোনাম", rows: [{ label: "কাপড়ের মান", us: "প্রিমিয়াম", them: "" }] } },
      { type: "guarantee", data: { title: "ফেরতের গ্যারান্টি" } },
      { type: "steps", data: { items: ["প্রথম ধাপ"] } },
      { type: "cta", data: { headline: "আজই নিন" } },
    ] };
    const fd = new FormData();
    fd.append("landing_json", JSON.stringify(landing));
    const html = await (await a.fetch(`/admin/products/${p!.id}/landing/preview`, { method: "POST", body: fd })).text();
    for (const x of ["lp-compare", "তুলনা-শিরোনাম", "প্রিমিয়াম", "✕", "lp-guarantee", "ফেরতের গ্যারান্টি", "lp-steps", "প্রথম ধাপ", "lp-cta", "আজই নিন"]) expect(html).toContain(x);
  });

  it("নিজে থেকে সেভ (ajax) JSON ফেরত দেয় আর সেভ করে", async () => {
    const { adminBrowser, DB } = await import("./helpers");
    const a = await adminBrowser();
    const p = await DB.prepare("SELECT id FROM products LIMIT 1").first<{ id: number }>();
    const fd = new FormData();
    fd.append("landing_json", JSON.stringify({ sections: [{ type: "guarantee", data: { title: "অটো-সেভ" } }] }));
    fd.append("ajax", "1");
    const r = await a.fetch(`/admin/products/${p!.id}/landing`, { method: "POST", body: fd });
    expect(await r.json()).toEqual({ ok: true });
    const row = await DB.prepare("SELECT landing_json FROM products WHERE id = ?").bind(p!.id).first<{ landing_json: string }>();
    expect(row!.landing_json).toContain("অটো-সেভ");
  });
});
