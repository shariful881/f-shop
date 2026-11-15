import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";
import { folderOf } from "../src/shop/lib/media";

beforeEach(resetDb);

const png = (name = "a.png") => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], name, { type: "image/png" });

async function uploadVia(a: Browser, folder: string, name: string) {
  const fd = new FormData();
  fd.append("image", png(`${name}.png`));
  fd.append("folder", folder);
  fd.append("name", name);
  fd.append("w", "800");
  fd.append("h", "300");
  const res = await a.fetch("/admin/upload-image", { method: "POST", body: fd });
  expect(res.status).toBe(200);
  return (await res.json()) as { key: string; url: string };
}

const baseSettings = { site_name: "টেস্ট দোকান", phone: "01700000000" };

describe("মিডিয়া লাইব্রেরি", () => {
  it("ফোল্ডার key থেকে বোঝা যায়", () => {
    expect(folderOf("p/x.jpg")).toBe("product");
    expect(folderOf("banner1/x.jpg")).toBe("banner");
    expect(folderOf("banner/x.webp")).toBe("banner");
    expect(folderOf("logo/x.png")).toBe("logo");
    expect(folderOf("lp/x.webp")).toBe("landing");
    expect(folderOf("theme/x.webp")).toBe("theme");
  });

  it("আপলোডে নাম আর মাপ থাকে, মিডিয়া পেজে আর JSON-এ দেখায়; সাপোর্টের ছবি দেখায় না", async () => {
    const a = await adminBrowser();
    const up = await uploadVia(a, "banner", "ঈদ-ব্যানার");
    expect(up.key).toMatch(/^banner\//);
    const row = await DB.prepare("SELECT name, width, height FROM images WHERE key = ?").bind(up.key).first<{ name: string; width: number; height: number }>();
    expect(row).toEqual({ name: "ঈদ-ব্যানার", width: 800, height: 300 });
    await DB.prepare("INSERT OR IGNORE INTO images (key, type, size, chunks) VALUES ('support/s.png', 'image/png', 4, 1)").run();
    const html = await (await a.get("/admin/media")).text();
    expect(html).toContain("ঈদ-ব্যানার");
    expect(html).not.toContain("support/s.png");
    const j = await (await a.get("/admin/media.json?folder=banner")).json() as { items: { key: string }[] };
    expect(j.items.map((i) => i.key)).toEqual([up.key]);
    const p = await (await a.get("/admin/media.json?folder=product")).json() as { items: unknown[] };
    expect(p.items).toHaveLength(0);
  });

  it("লাইব্রেরির ছবি ব্যানারে বসানো যায়; ব্যবহার হওয়া ছবি মোছা যায় না, অব্যবহৃত মোছা যায়", async () => {
    const a = await adminBrowser();
    const used = await uploadVia(a, "banner", "used");
    const free = await uploadVia(a, "banner", "free");
    await a.post("/admin/settings/appearance", { _section: "appearance", theme: "classic", banner_1_pick: used.key });
    expect((await DB.prepare("SELECT value FROM settings WHERE key='banner_1'").first<{ value: string }>())!.value).toBe(used.key);

    const body = new URLSearchParams([["keys", used.key], ["keys", free.key]]);
    await a.fetch("/admin/media/delete", { method: "POST", body });
    expect(await DB.prepare("SELECT 1 FROM images WHERE key = ?").bind(used.key).first()).not.toBeNull();
    expect(await DB.prepare("SELECT 1 FROM images WHERE key = ?").bind(free.key).first()).toBeNull();

    const unused = await (await a.get("/admin/media?folder=unused")).text();
    expect(unused).not.toContain(used.key);
  });

  it("অচেনা বা সাপোর্টের key বাছাই করে বসানো যায় না", async () => {
    const a = await adminBrowser();
    await DB.prepare("INSERT OR IGNORE INTO images (key, type, size, chunks) VALUES ('support/s.png', 'image/png', 4, 1)").run();
    await a.post("/admin/settings/appearance", { _section: "appearance", theme: "classic", banner_1_pick: "support/s.png" });
    await a.post("/admin/settings/appearance", { _section: "appearance", theme: "classic", banner_2_pick: "banner/nope.png" });
    const rows = await DB.prepare("SELECT key, value FROM settings WHERE key IN ('banner_1','banner_2')").all<{ key: string; value: string }>();
    for (const r of rows.results) {
      expect(r.value).not.toBe("support/s.png");
      expect(r.value).not.toBe("banner/nope.png");
    }
  });

  it("একই ছবি দুই পণ্যে; একটায় বদলালে অন্যটার ছবি মুছে যায় না", async () => {
    const a = await adminBrowser();
    const img = await uploadVia(a, "product", "shared");
    const ids = await DB.prepare("SELECT id, name, slug, price FROM products ORDER BY id LIMIT 2").all<{ id: number; name: string; slug: string; price: number }>();
    const [p1, p2] = ids.results;
    for (const p of [p1!, p2!]) {
      await a.post(`/admin/products/${p.id}`, { name: p.name, slug: p.slug, price: p.price, is_active: 1, image_pick: img.key });
    }
    expect((await DB.prepare("SELECT image FROM products WHERE id = ?").bind(p2!.id).first<{ image: string }>())!.image).toBe(img.key);
    const other = await uploadVia(a, "product", "other");
    await a.post(`/admin/products/${p1!.id}`, { name: p1!.name, slug: p1!.slug, price: p1!.price, is_active: 1, image_pick: other.key });
    expect(await DB.prepare("SELECT 1 FROM images WHERE key = ?").bind(img.key).first()).not.toBeNull();
    // শেষ ব্যবহারও সরলে তবেই মোছে
    await a.post(`/admin/products/${p2!.id}`, { name: p2!.name, slug: p2!.slug, price: p2!.price, is_active: 1, image_pick: other.key });
    expect(await DB.prepare("SELECT 1 FROM images WHERE key = ?").bind(img.key).first()).toBeNull();
    void baseSettings;
  });
});
