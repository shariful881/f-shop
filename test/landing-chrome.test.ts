import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, resetDb } from "./helpers";
import { normalizeLanding } from "../src/shop/lib/landing";

beforeEach(resetDb);

const sections = [{ type: "hero", data: { headline: "হেডার-টেস্ট-শিরোনাম" } }, { type: "order_form" }];

describe("ল্যান্ডিং পেজ — দোকানের হেডার/ফুটার লুকানো", () => {
  it("শুধু 'hide' মান টিকে থাকে", () => {
    expect(normalizeLanding({ style: { header: "hide", footer: "hide", font: "x" }, sections }).style).toEqual({ header: "hide", footer: "hide" });
    expect(normalizeLanding({ style: { header: "yes", footer: 1 }, sections }).style).toBeUndefined();
  });

  it("ডিফল্টে হেডার-ফুটার দেখায়; লুকালে নেই, কিন্তু কপিরাইট আর SellxBD লেখা থাকে", async () => {
    const a = await adminBrowser();
    await a.post("/admin/products/1/landing", { landing_json: JSON.stringify({ sections }) });
    const shown = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(shown).toMatch(/<header class="(site-header|px-header)/);
    expect(shown).toMatch(/<footer class="(site-footer|px-footer)/);
    expect(shown).not.toContain("lp-mini-foot");

    await a.post("/admin/products/1/landing", { landing_json: JSON.stringify({ style: { header: "hide", footer: "hide" }, sections }) });
    const hidden = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(hidden).toContain("হেডার-টেস্ট-শিরোনাম");
    expect(hidden).not.toMatch(/<header class="(site-header|px-header)/);
    expect(hidden).not.toMatch(/<footer class="(site-footer|px-footer)/);
    expect(hidden).toContain("lp-mini-foot");
    expect(hidden).toContain("SellxBD দিয়ে তৈরি");

    // শুধু হেডার লুকানো → পুরো ফুটার থাকে
    await a.post("/admin/products/1/landing", { landing_json: JSON.stringify({ style: { header: "hide" }, sections }) });
    const h2 = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(h2).not.toMatch(/<header class="(site-header|px-header)/);
    expect(h2).toMatch(/<footer class="(site-footer|px-footer)/);
  });

  it("এডিটরের প্রিভিউতেও সাথে সাথে লুকায়", async () => {
    const a = await adminBrowser();
    const r = await a.post("/admin/products/1/landing/preview", { landing_json: JSON.stringify({ style: { header: "hide", footer: "hide" }, sections }), editor: "1" });
    const html = await r.text();
    expect(html).not.toMatch(/<header class="(site-header|px-header)/);
    expect(html).toContain("lp-mini-foot");
  });
});

describe("ল্যান্ডিং এডিটরে AI লেখার বক্স বন্ধ", () => {
  it("এডিটরে 'AI দিয়ে লেখা বানান' দেখায় না", async () => {
    const html = await (await (await adminBrowser()).get("/admin/products/1/landing")).text();
    expect(html).toContain('id="builder"');
    expect(html).not.toContain("AI দিয়ে লেখা বানান");
    expect(html).not.toContain("data-ai-form");
  });
});
