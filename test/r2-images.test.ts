import { beforeEach, describe, expect, it } from "vitest";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import type { ShopDO } from "../src/shop/shop-do";
import { SqlImageStore } from "../src/shop/lib/images";
import { syncShopsToR2, purgeShopsLocal, setAutoPurge } from "../src/platform/r2";
import { clearShopCache } from "../src/platform/resolve";
import { adminBrowser, BASE, DB, DEMO_SHOP_ID, resetDb, shopStub } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await env.PLATFORM_DB.prepare("UPDATE shops SET images_r2 = 0 WHERE id = ?").bind(DEMO_SHOP_ID).run();
  await env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES ('r2_public_ok', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
  await env.PLATFORM_DB.prepare("DELETE FROM platform_settings WHERE key = 'r2_auto_purge'").run();
  clearShopCache();
});

const R2 = (key: string) => `shops/${DEMO_SHOP_ID}/${key}`;
const bytes = () => new Uint8Array([0xff, 0xd8, 1, 2, 3, 4]).buffer;

/** পুরনো ছবি: শুধু দোকানের ডাটাবেসে (R2 চালুর আগের মতো) */
async function oldImage(key: string) {
  await runInDurableObject(shopStub(), (i: ShopDO) => new SqlImageStore(i.db).put(key, bytes(), { httpMetadata: { contentType: "image/jpeg" } }));
}

async function productWithImage(key: string) {
  const p = await DB.prepare("SELECT id, slug FROM products WHERE is_active = 1 ORDER BY id LIMIT 1").first<{ id: number; slug: string }>();
  await DB.prepare("UPDATE products SET image = ? WHERE id = ?").bind(key, p!.id).run();
  return p!.slug;
}

describe("দোকানের ছবি R2-তে", () => {
  it("নতুন ছবি দোকানের ডাটাবেস আর R2 দুই জায়গায় যায় (সাপোর্টের ছবি R2-তে নয়)", async () => {
    await runInDurableObject(shopStub(), async (i: ShopDO) => {
      await i.images(DEMO_SHOP_ID).put(R2("p/new.jpg"), bytes(), { httpMetadata: { contentType: "image/jpeg" } });
      await i.images(DEMO_SHOP_ID).put(R2("support/s.png"), bytes(), { httpMetadata: { contentType: "image/png" } });
    });
    const o = await env.IMG_BUCKET!.get(R2("p/new.jpg"));
    expect(o?.httpMetadata?.contentType).toBe("image/jpeg");
    expect(o?.httpMetadata?.cacheControl).toContain("immutable");
    expect(await env.IMG_BUCKET!.head(R2("support/s.png"))).toBeNull();
    expect((await DB.prepare("SELECT r2 FROM images WHERE key = 'p/new.jpg'").first<{ r2: number }>())!.r2).toBe(1);
  });

  it("পুরনো ছবি কপি হলে দোকানের পেজে ছবি img ঠিকানা থেকে; প্যানেল আর ফাঁকা ছবি আগের মতো; /img/ → 301", async () => {
    await oldImage("p/old.jpg");
    const slug = await productWithImage("p/old.jpg");
    // কপির আগে: আগের মতো /img/
    let html = await (await SELF.fetch(`${BASE}/product/${slug}`)).text();
    expect(html).toContain('"/img/p/old.jpg"');

    const r = await syncShopsToR2(env, 50, 3);
    expect(r.copied).toBeGreaterThanOrEqual(1);
    expect(await env.IMG_BUCKET!.head(R2("p/old.jpg"))).not.toBeNull();
    const row = await env.PLATFORM_DB.prepare("SELECT images_r2 FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<{ images_r2: number }>();
    expect(row!.images_r2).toBe(1);

    html = await (await SELF.fetch(`${BASE}/product/${slug}`)).text();
    expect(html).toContain(`"${env.IMG_PUBLIC_URL}/shops/${DEMO_SHOP_ID}/p/old.jpg"`);
    expect(html).not.toContain('"/img/p/old.jpg"');

    const img = await SELF.fetch(`${BASE}/img/p/old.jpg`, { redirect: "manual" });
    expect(img.status).toBe(301);
    expect(img.headers.get("location")).toBe(`${env.IMG_PUBLIC_URL}/shops/${DEMO_SHOP_ID}/p/old.jpg`);

    const a = await adminBrowser();
    const admin = await (await a.get("/admin/products")).text();
    expect(admin).not.toContain(env.IMG_PUBLIC_URL!);
  });

  it("পুরনো কপি মুছলে জায়গা খালি হয়, ছবি R2 থেকে পাওয়া যায়; মিডিয়ার তথ্য থাকে", async () => {
    await oldImage("p/old.jpg");
    await syncShopsToR2(env, 50, 3);
    expect((await purgeShopsLocal(env)).shops).toBe(0); // চালু না করলে মোছে না
    await setAutoPurge(env, true);
    const r = await purgeShopsLocal(env, 50, 3);
    expect(r.purged).toBeGreaterThanOrEqual(1);
    expect((await DB.prepare("SELECT COUNT(*) n FROM image_chunks WHERE key = 'p/old.jpg'").first<{ n: number }>())!.n).toBe(0);
    expect((await DB.prepare("SELECT COUNT(*) n FROM images WHERE key = 'p/old.jpg'").first<{ n: number }>())!.n).toBe(1);
    const got = await runInDurableObject(shopStub(), (i: ShopDO) => i.images(DEMO_SHOP_ID).get("p/old.jpg"));
    expect(got?.type).toBe("image/jpeg");
    expect((await env.PLATFORM_DB.prepare("SELECT images_r2 FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<{ images_r2: number }>())!.images_r2).toBe(2);
  });

  it("পাবলিক ঠিকানা যাচাই না হলে কিছুই কপি হয় না, পেজ আগের মতো", async () => {
    await env.PLATFORM_DB.prepare("UPDATE platform_settings SET value = '0' WHERE key = 'r2_public_ok'").run();
    await oldImage("p/never.jpg");
    expect((await syncShopsToR2(env)).shops).toBe(0);
    expect(await env.IMG_BUCKET!.head(R2("p/never.jpg"))).toBeNull();
  });
});
