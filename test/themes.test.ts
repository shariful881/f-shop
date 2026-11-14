import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";

beforeEach(resetDb);
const base = { site_name: "দোকান", contact_phone: "01811111111", delivery_inside: "70", delivery_outside: "130", fb_pixel_id: "", fb_capi_token: "", fb_test_event_code: "", fb_graph_version: "v26.0" };

describe("থিম", () => {
  it("ডিফল্ট ক্লাসিক — আলাদা CSS লোড হয় না", async () => {
    const html = await (await new Browser().get("/")).text();
    expect(html).toContain('class="theme-classic"');
    expect(html).not.toContain("/css/theme-");
  });

  it.each(["minimal", "bold"])("%s বাছলে সব পেজে সেই থিম", async (t) => {
    const a = await adminBrowser();
    await a.post("/admin/settings", { ...base, theme: t });
    for (const path of ["/", "/p/wooden-wall-shelf", "/cart"]) {
      const html = await (await new Browser().get(path)).text();
      expect(html).toContain(`class="theme-${t}"`);
      expect(html).toContain(`/css/theme-${t}.css`);
    }
  });

  it("ভুল থিম নেয় না; সেটিংস পেজে তিনটা থিম দেখায়", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings", { ...base, theme: "bold" });
    await a.post("/admin/settings", { ...base, theme: "../../evil" });
    expect((await DB.prepare("SELECT value FROM settings WHERE key='theme'").first<any>()).value).toBe("bold");
    const page = await (await a.get("/admin/settings/appearance")).text();
    for (const n of ["ক্লাসিক", "মিনিমাল", "বোল্ড"]) expect(page).toContain(n);
  });
});
