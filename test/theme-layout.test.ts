import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, resetDb } from "./helpers";
import { cfgCss, GROUPS, PAGES, THEME_DEFAULTS } from "../src/shop/lib/theme-config";

beforeEach(resetDb);

describe("থিম এডিটর — পেজ অনুযায়ী ভাগ, কলাম আর ছবির আকার", () => {
  it("প্রতিটা ভাগ ঠিক একটা পেজে, কোনো সেটিং দুবার নেই", () => {
    const listed = PAGES.flatMap((p) => p.groups);
    expect(new Set(listed).size).toBe(listed.length);
    expect(GROUPS.map((g) => g.key).sort()).toEqual([...listed].sort());
    const keys = GROUPS.flatMap((g) => g.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(GROUPS.find((g) => g.key === "layout")!.fields.map((f) => f.key)).toContain("per_row_mobile");
  });

  it("এডিটরে পেজের শিরোনাম আর ছবিসহ কলাম/আকারের বাটন", async () => {
    const html = await (await (await adminBrowser()).get("/admin/design")).text();
    for (const t of ["পুরো দোকান", "হোমপেজ", "পণ্যের তালিকা", "পণ্যের পেজ"]) expect(html).toContain(`de-page-head">${t}`);
    expect(html).toContain('name="per_row_mobile" value="1"');
    expect(html).toContain('name="img_ratio" value="4/5"');
    expect(html).toContain("cz-pv-cols");
    expect(html).not.toContain('name="img_ratio" value="16/9"'); // পুরনো আকার শুধু আগে বাছাই করা থাকলে
  });

  it("মোবাইলে ১ কলাম + তালিকা, ট্যাবলেট নিজে থেকে, পুরনো আকার বজায় থাকে", async () => {
    const a = await adminBrowser();
    const body = new URLSearchParams([["home_order", "banner"], ["per_row_mobile", "1"], ["m1_style", "list"], ["per_row_desktop", "5"], ["per_row_tablet", "auto"], ["img_ratio", "16/9"]]);
    await a.fetch("/admin/design/draft", { method: "POST", body });
    const html = await (await a.get("/search?q=&__preview=1")).text();
    expect(html).toContain("grid-template-columns:repeat(1,1fr)");
    expect(html).toContain("flex-direction:row");
    expect(html).toContain("repeat(5,1fr)");
    expect(html).toContain("aspect-ratio:16/9");
    // ভুল মান → ডিফল্ট
    await a.fetch("/admin/design/draft", { method: "POST", body: new URLSearchParams([["home_order", "banner"], ["img_ratio", "9/1"], ["per_row_mobile", "7"]]) });
    const h2 = await (await a.get("/?__preview=1")).text();
    expect(h2).toContain("aspect-ratio:1/1");
  });

  it("ট্যাবলেট 'নিজে থেকে' আগের দোকানগুলোর মতোই ৩ কলাম রাখে", () => {
    for (const d of Object.values(THEME_DEFAULTS)) {
      if (d.per_row_mobile === "1") continue;
      expect(cfgCss(d)).toContain("@media(min-width:700px){.grid,.theme-pro .px-grid{grid-template-columns:repeat(3,1fr)}}");
    }
  });

  it("সম্পর্কিত পণ্যের আলাদা কলাম মোবাইল আর কম্পিউটারে; auto হলে আলাদা নিয়ম নেই", () => {
    const base = THEME_DEFAULTS.classic;
    expect(cfgCss(base)).not.toContain(".pd-related .grid");
    const css = cfgCss({ ...base, pd_related_mobile: "1", pd_related_desktop: "6" });
    expect(css).toContain("@media(max-width:699px){.pd-related .grid,.theme-pro .pd-related .px-grid{grid-template-columns:repeat(1,1fr)}}");
    expect(css).toContain("@media(min-width:1000px){.pd-related .grid,.theme-pro .pd-related .px-grid{grid-template-columns:repeat(6,1fr)}}");
  });

  it("এডিটরে সম্পর্কিত পণ্যের কলামের বাটন", async () => {
    const html = await (await (await adminBrowser()).get("/admin/design")).text();
    expect(html).toContain('name="pd_related_mobile" value="2"');
    expect(html).toContain('name="pd_related_desktop" value="5"');
  });
});
