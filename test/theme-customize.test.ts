import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";
import { cfgCss, themeConfig } from "../src/shop/lib/theme-config";

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM settings WHERE key LIKE 'theme_cfg_%'").run();
  await DB.prepare("UPDATE settings SET value = 'classic' WHERE key = 'theme'").run();
});
const home = async () => (await new Browser().get("/")).text();

describe("থিম কাস্টমাইজ", () => {
  it("প্রতিটা থিমের শুরুর সেটিংস আলাদা; ভুল মান বাদ, CSS-এ ঢোকানো যায় না", () => {
    expect(themeConfig({ theme: "pro" }).bottom_nav).toBe("1");
    expect(themeConfig({ theme: "classic" }).bottom_nav).toBe("0");
    const cfg = themeConfig({ theme: "classic", theme_cfg_classic: JSON.stringify({ c_bg: "red;}body{x", btn_shape: "evil", per_row_desktop: "5", social_youtube: "javascript:x" }) });
    expect(cfg.c_bg).toBe("");
    expect(cfg.btn_shape).toBe("rounded");
    expect(cfg.social_youtube).toBe("");
    expect(cfgCss(cfg)).toContain("repeat(5,1fr)");
    expect(cfgCss(cfg)).not.toContain("red;");
  });

  it("পেজ খোলে, সেভ করলে শুধু সেই থিমে লাগে আর দোকানে দেখায়", async () => {
    const a = await adminBrowser();
    const page = await (await a.get("/admin/design")).text();
    expect(page).toContain("হেডার, মেনু আর ঘোষণা বার");
    expect(page).toContain('name="home_order"');
    expect(page).not.toContain("cz-themes"); // শুধু চালু থিমের সেটিংস, অন্য থিমের বাছাই নেই

    const r = await a.post("/admin/settings/customize", {
      theme: "classic", topbar: "1", announcement: "বিশেষ ছাড় চলছে", header_search: "1", header_nav: "1", header_sticky: "1",
      c_btn: "#123456", c_btn_on: "1", font_body: "baloo", btn_shape: "pill",
      home_order: "text,products,banner,categories,offers,trust", sec_products: "1", sec_text: "1", text_title: "আমাদের কথা", text_body: "হাতে বানানো পণ্য",
      card_order_btn: "1", card_order_text: "এখনই কিনুন", float_call: "1", bottom_nav: "1", footer_style: "full",
    });
    expect(r.status).toBe(303);
    const html = await home();
    expect(html).toContain("বিশেষ ছাড় চলছে");
    expect(html).toContain('action="/search"');
    expect(html).toContain(".btn-primary,.theme-pro .card-actions .btn-primary,.sticky-order{background:#123456");
    expect(html).toContain("family=Baloo+Da+2");
    expect(html).toContain("এখনই কিনুন");
    expect(html).not.toContain(">কার্টে যোগ<"); // টিক না দেওয়ায় বন্ধ
    expect(html).toContain('class="px-bottom"');
    expect(html).toContain("px-fab-call");
    expect(html).toContain('class="px-footer"');
    expect(html.indexOf("আমাদের কথা")).toBeLessThan(html.indexOf('class="card cd-'));

    // অন্য থিমে লাগেনি
    await DB.prepare("UPDATE settings SET value = 'bold' WHERE key = 'theme'").run();
    expect(await home()).not.toContain("বিশেষ ছাড় চলছে");
    // সেটিংস পেজে এখন বোল্ডের নিজের সেটিংস, ক্লাসিকেরটা নয়
    const boldPage = await (await a.get("/admin/design")).text();
    expect(boldPage).toContain("বোল্ড");
    expect(boldPage).not.toContain("বিশেষ ছাড় চলছে");
    // ক্লাসিকে ফিরলে আগের সেটিংস আবার আসে
    await DB.prepare("UPDATE settings SET value = 'classic' WHERE key = 'theme'").run();
    expect(await (await a.get("/admin/design")).text()).toContain("বিশেষ ছাড় চলছে");
  });

  it("শুরুর সেটিংসে ফেরা যায়", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings/customize", { theme: "classic", bottom_nav: "1" });
    expect(await home()).toContain('class="px-bottom"');
    await a.post("/admin/settings/customize", { theme: "classic", reset: "1" });
    expect(await home()).not.toContain('class="px-bottom"');
  });
});
