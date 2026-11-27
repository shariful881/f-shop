import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Browser, DB, resetDb } from "./helpers";

beforeEach(resetDb);
// resetDb থিমের সেটিংস আর ক্যাটাগরির ছবি মোছে না — অন্য টেস্টে না ছড়াক
afterEach(async () => {
  await DB.prepare("DELETE FROM settings WHERE key LIKE 'theme_cfg_%'").run();
  await DB.prepare("UPDATE categories SET image = NULL WHERE image = 'p/x.jpg'").run();
});

async function setCfg(cfg: Record<string, string>) {
  const theme = (await DB.prepare("SELECT value FROM settings WHERE key = 'theme'").first<{ value: string }>())?.value || "pro";
  await DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(`theme_cfg_${theme}`, JSON.stringify(cfg)).run();
}

describe("ক্যাটাগরি পেজে ছবি আর নামের চালু/বন্ধ", () => {
  it("চালু থাকলে ব্যানার আর নাম; বন্ধ করলে দেখায় না (নাম লুকানো h1-এ)", async () => {
    const cat = (await DB.prepare("SELECT c.id, c.name FROM categories c JOIN products p ON p.category_id = c.id AND p.is_active = 1 LIMIT 1").first<{ id: number; name: string }>())!;
    await DB.prepare("UPDATE categories SET image = 'p/x.jpg' WHERE id = ?").bind(cat.id).run();
    const b = new Browser();
    let html = await (await b.get(`/c/${cat.id}`)).text();
    expect(html).toContain("px-cat-banner");
    expect(html).toMatch(/<h1 class="page-title">/);

    await setCfg({ list_cat_image: "0", list_cat_title: "0" });
    html = await (await new Browser().get(`/c/${cat.id}`)).text();
    expect(html).not.toContain("px-cat-banner");
    expect(html).not.toMatch(/<h1 class="page-title">/);
    expect(html).toContain(`<h1 class="sr-only">${cat.name}</h1>`);
  });
});
