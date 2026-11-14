import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await DB.prepare("UPDATE settings SET value = 'pro' WHERE key = 'theme'").run();
  await DB.prepare("UPDATE settings SET value = '' WHERE key IN ('announcement','banner_1','banner_1_link','banner_2','banner_3','whatsapp')").run();
});
const get = async (path: string) => (await new Browser().get(path)).text();

describe("প্রো স্টোর থিম", () => {
  it("হোমে সার্চ, ক্যাটাগরি মেনু, ক্যাটাগরি টাইল, নিচের মেনু আর বিশ্বাসের ব্যাজ", async () => {
    const html = await get("/");
    expect(html).toContain('class="theme-pro"');
    expect(html).toContain("/css/theme-pro.css");
    expect(html).toContain('action="/search"');
    expect(html).toMatch(/href="\/c\/\d+"/);
    expect(html).toContain('class="px-bottom"');
    expect(html).toContain("ক্যাশ অন ডেলিভারি");
    expect(html).toContain("হটলাইন");
  });

  it("ল্যান্ডিং পেজে নিচের মেনু থাকে না (অর্ডার বাটনের জায়গা), হেডার থাকে", async () => {
    const html = await get("/p/wooden-wall-shelf");
    expect(html).toContain("px-header");
    expect(html).not.toContain('class="px-bottom"');
    expect(html).toContain('data-bare="1"');
  });

  it("ক্যাটাগরি পেজ আর সার্চ", async () => {
    const cat = (await DB.prepare("SELECT c.id, c.name FROM categories c JOIN products p ON p.category_id = c.id WHERE p.is_active = 1 LIMIT 1").first<any>())!;
    const html = await get(`/c/${cat.id}`);
    expect(html).toContain(cat.name);
    expect(html).toContain('class="card"');
    expect((await new Browser().get("/c/99999")).status).toBe(404);

    const found = await get(`/search?q=${encodeURIComponent("শেলফ")}`);
    expect(found).toContain("wooden-wall-shelf");
    const none = await get(`/search?q=${encodeURIComponent("%_নেই")}`);
    expect(none).toContain("কোনো পণ্য পাওয়া যায়নি");
  });

  it("ঘোষণা, ব্যানার লিংক আর WhatsApp সেটিংস থেকে আসে; খারাপ লিংক বাদ", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings/appearance", { theme: "pro", announcement: "ঈদ অফার চলছে", banner_1_link: "javascript:alert(1)", brand_color: "#0f766e", accent_color: "#ea580c" });
    await a.post("/admin/settings", { whatsapp: "01711111111" });
    expect((await DB.prepare("SELECT value FROM settings WHERE key='banner_1_link'").first<any>()).value).toBe("");
    const html = await get("/");
    expect(html).toContain("ঈদ অফার চলছে");
    expect(html).toContain("https://wa.me/8801711111111");
  });

  it("অন্য থিমে সার্চ/ক্যাটাগরি পেজ কাজ করে, প্রো হেডার দেখায় না", async () => {
    await DB.prepare("UPDATE settings SET value = 'classic' WHERE key = 'theme'").run();
    const html = await get(`/search?q=${encodeURIComponent("শেলফ")}`);
    expect(html).toContain("wooden-wall-shelf");
    expect(html).not.toContain("px-header");
  });
});
