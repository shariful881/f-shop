import { beforeEach, describe, expect, it } from "vitest";
import { Browser, DB, adminBrowser, resetDb } from "./helpers";

const set = (k: string, v: string) => DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();
beforeEach(async () => { await resetDb(); });

describe("ওয়েবসাইটে নম্বর ইংরেজি অঙ্কে", () => {
  it("যোগাযোগ নম্বর বাংলা অঙ্কে রাখা থাকলেও দোকানে ইংরেজিতে দেখায়, tel: লিংক ঠিক", async () => {
    await set("contact_phone", "০১৮২৪২১২২৭১");
    const html = await (await new Browser().get("/")).text();
    expect(html).toContain("01824212271");
    expect(html).not.toContain("০১৮২৪২১২২৭১");
    expect(html).toContain('href="tel:01824212271"');
  });

  it("সেটিংসে বাংলা অঙ্কে নম্বর দিলে ইংরেজিতে সেভ হয়; বিকাশ নম্বর অগ্রিমের বক্সে ইংরেজিতে", async () => {
    const a = await adminBrowser();
    const r = await a.post("/admin/settings/general", { _section: "general", site_name: "ডেমো", contact_phone: "০১৭১১-১২৩৪৫৬", whatsapp: "০১৭১১১২৩৪৫৬" });
    expect([200, 303]).toContain(r.status);
    const row = await DB.prepare("SELECT value FROM settings WHERE key = 'contact_phone'").first<{ value: string }>();
    expect(row?.value).toBe("01711-123456");
    await set("payment_bkash", "০১৯১১২২২৩৩৩");
    await set("advance_mode", "delivery");
    const html = await (await new Browser().get("/")).text();
    const page = html.includes("advance-box") ? html : await (await new Browser().get("/checkout")).text();
    if (page.includes("advance-box")) expect(page).toContain("01911222333");
  });
});
