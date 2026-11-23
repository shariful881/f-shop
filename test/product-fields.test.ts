import { beforeEach, describe, expect, it } from "vitest";
import { Browser, DB, adminBrowser, resetDb } from "./helpers";

beforeEach(resetDb);

const jpg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], name, { type: "image/jpeg" });

function form(extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ name: "Wall Shelf", slug: "wall-shelf", price: "1500", is_active: "1", show_on_home: "1", ...extra })) fd.append(k, v);
  return fd;
}

describe("নতুন পণ্যের বাড়তি তথ্য", () => {
  it("ফর্মে SKU, বারকোড, গ্যালারি, বৈশিষ্ট্য, ব্র্যান্ড, স্টকের অবস্থা আছে", async () => {
    const a = await adminBrowser();
    const html = await (await a.get("/admin/products/new")).text();
    for (const n of ['name="sku"', 'name="barcode"', 'name="features"', 'name="brand"', 'name="stock_status"', 'name="g0_file"', 'name="g8_pick"', "data-pf-gal-more"]) expect(html).toContain(n);
  });

  it("সেভ হয়, পণ্যের পেজে একাধিক ছবি, বৈশিষ্ট্য, ব্র্যান্ড আর কোড দেখায়", async () => {
    const a = await adminBrowser();
    const fd = form({ sku: "KB-01", barcode: "8901234567890", brand: "কাঠবন", features: "খাঁটি সেগুন কাঠ\n• ৬ মাসের ওয়ারেন্টি\n\n" });
    fd.append("image", jpg("main.jpg"));
    fd.append("g0_file", jpg("g1.jpg"));
    fd.append("g1_file", jpg("g2.jpg"));
    expect((await a.fetch("/admin/products", { method: "POST", body: fd })).status).toBe(303);
    const p = await DB.prepare("SELECT * FROM products WHERE slug='wall-shelf'").first<Record<string, any>>();
    expect(p).toMatchObject({ sku: "KB-01", barcode: "8901234567890", brand: "কাঠবন", features: "খাঁটি সেগুন কাঠ\n৬ মাসের ওয়ারেন্টি", stock_status: "in" });
    const gal = JSON.parse(p!.gallery_json);
    expect(gal).toHaveLength(2);
    expect((await new Browser().get("/img/" + gal[1])).status).toBe(200);

    const page = await (await new Browser().get("/product/wall-shelf")).text();
    expect(page).toContain("pp-thumbs");
    for (const k of [p!.image, ...gal]) expect(page).toContain(k);
    expect(page).toContain('<ul class="pp-features"><li>খাঁটি সেগুন কাঠ</li><li>৬ মাসের ওয়ারেন্টি</li></ul>');
    expect(page).toContain("কাঠবন");
    expect(page).toContain("KB-01");

    // ক্যাটালগ ফিডে বাড়তি ছবি আর ব্র্যান্ড
    const feed = await (await new Browser().get("/feed.xml")).text();
    expect(feed).toContain("<g:additional_image_link>");
    expect(feed).toContain("<g:brand>কাঠবন</g:brand>");

    // এডিট: প্রথম গ্যালারি ছবি সরানো, দ্বিতীয়টা থাকে
    const ed = form({ sku: "KB-01", g0_cur: gal[0], g0_remove: "1", g1_cur: gal[1] });
    expect((await a.fetch(`/admin/products/${p!.id}`, { method: "POST", body: ed })).status).toBe(303);
    const p2 = await DB.prepare("SELECT gallery_json FROM products WHERE id=?").bind(p!.id).first<{ gallery_json: string }>();
    expect(JSON.parse(p2!.gallery_json)).toEqual([gal[1]]);
    expect((await new Browser().get("/img/" + gal[0])).status).toBe(404);
  });

  it("অন্য পণ্যের ছবির key 'আগের' বলে চালানো যায় না; একই SKU দুবার নয়", async () => {
    const a = await adminBrowser();
    const fd = form({ g0_cur: "p/someone-else.jpg" });
    await a.fetch("/admin/products", { method: "POST", body: fd });
    const p = await DB.prepare("SELECT gallery_json FROM products WHERE slug='wall-shelf'").first<{ gallery_json: string | null }>();
    expect(p!.gallery_json).toBeNull();

    await DB.prepare("UPDATE products SET sku = 'DUP-1' WHERE id = 1").run();
    const r = await a.fetch("/admin/products", { method: "POST", body: form({ slug: "x2", sku: "DUP-1" }) });
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("এই SKU আরেকটা পণ্যে আছে");
  });

  it("\"স্টক নেই\" বসালে পণ্য দেখায় কিন্তু কার্টে যায় না", async () => {
    await DB.prepare("UPDATE products SET stock_status = 'out' WHERE id = 1").run();
    const slug = (await DB.prepare("SELECT slug FROM products WHERE id = 1").first<{ slug: string }>())!.slug;
    const page = await (await new Browser().get(`/product/${slug}`)).text();
    expect(page).toContain("স্টকে নেই");
    const b = new Browser();
    await b.post("/cart/add", { product_id: 1 });
    const cart = await (await b.get("/cart")).text();
    expect(cart).not.toContain(`value="1" name="product_id"`);
    expect((await b.order()).status).not.toBe(303);
  });
});
