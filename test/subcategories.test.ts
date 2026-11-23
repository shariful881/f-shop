import { beforeEach, describe, expect, it } from "vitest";
import { Browser, DB, adminBrowser, resetDb } from "./helpers";

beforeEach(resetDb);

const jpg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "c.jpg", { type: "image/jpeg" });

async function makeSub(a: Awaited<ReturnType<typeof adminBrowser>>, parent: number, name: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ full: "1", name, parent_id: String(parent), sort_order: "0", title: "", description: "", ...extra })) fd.append(k, v);
  const r = await a.fetch("/admin/categories", { method: "POST", body: fd });
  expect(r.status).toBe(303);
  return (await DB.prepare("SELECT * FROM categories WHERE name = ?").bind(name).first<Record<string, any>>())!;
}

describe("সাব-ক্যাটাগরি", () => {
  it("নতুন ক্যাটাগরির ফর্মে উপরের ক্যাটাগরি, শিরোনাম, ছবি, বিবরণ (এডিটর) আছে", async () => {
    const a = await adminBrowser();
    const html = await (await a.get("/admin/categories/new?parent=1")).text();
    expect(html).toContain('enctype="multipart/form-data"');
    for (const n of ['name="parent_id"', 'name="title"', 'name="image_file"', 'name="description"', "data-rich-editor", 'name="sort_order"']) expect(html).toContain(n);
    expect(html).toMatch(/<option value="1" selected/);
  });

  it("সাব-ক্যাটাগরি বানানো, তালিকায় নিচে, পেজ/মেনু/হোমে ঠিকমতো", async () => {
    const a = await adminBrowser();
    const parent = (await DB.prepare("SELECT c.id, c.name FROM categories c JOIN products p ON p.category_id = c.id AND p.is_active = 1 LIMIT 1").first<{ id: number; name: string }>())!;
    const fd = new FormData();
    for (const [k, v] of Object.entries({ full: "1", name: "দেয়ালের তাক", parent_id: String(parent.id), sort_order: "1", title: "দেয়ালের সব তাক — হাতে বানানো", description: "<h2>কেন আমাদের তাক</h2><p onclick='x()'>মজবুত</p>" })) fd.append(k, v);
    fd.append("image_file", jpg());
    expect((await a.fetch("/admin/categories", { method: "POST", body: fd })).status).toBe(303);
    const sub = (await DB.prepare("SELECT * FROM categories WHERE name = 'দেয়ালের তাক'").first<Record<string, any>>())!;
    expect(sub).toMatchObject({ parent_id: parent.id, title: "দেয়ালের সব তাক — হাতে বানানো" });
    expect(sub.image).toMatch(/^p\/.+\.jpg$/);

    // একটা পণ্য সাব-ক্যাটাগরিতে
    const prod = (await DB.prepare("SELECT id, name FROM products WHERE category_id = ? AND is_active = 1 LIMIT 1").bind(parent.id).first<{ id: number; name: string }>())!;
    await DB.prepare("UPDATE products SET category_id = ? WHERE id = ?").bind(sub.id, prod.id).run();

    const list = await (await a.get("/admin/categories")).text();
    expect(list).toContain("cat-sub");
    expect(list.indexOf(parent.name)).toBeLessThan(list.indexOf("দেয়ালের তাক"));

    // উপরের ক্যাটাগরির পেজে সাব-ক্যাটাগরির পণ্যও, আর সাব-ক্যাটাগরির বোতাম
    const top = await (await new Browser().get(`/c/${parent.id}`)).text();
    expect(top).toContain(prod.name);
    expect(top).toContain(`href="/c/${sub.id}"`);
    expect(top).toContain("px-subcats");

    // সাব-ক্যাটাগরির পেজ: শিরোনাম, ছবি, নিরাপদ বিবরণ, পথ
    const page = await (await new Browser().get(`/c/${sub.id}`)).text();
    expect(page).toContain("দেয়ালের সব তাক — হাতে বানানো");
    expect(page).toContain(prod.name);
    expect(page).toContain("<h2>কেন আমাদের তাক</h2><p>মজবুত</p>");
    expect(page).not.toContain("onclick");
    expect(page).toContain(sub.image);
    expect(page).toContain(`<a href="/c/${parent.id}">${parent.name}</a>`);
    expect(page).not.toMatch(/<\/h1>\s*0\s*</); // এক পণ্যে ফাঁকা "0" না দেখায়

    // মেনুতে সাব-ক্যাটাগরি আলাদা আসে না; পণ্যের পেজে পথ: উপরের › সাব
    const home = await (await new Browser().get("/")).text();
    expect(home).not.toMatch(new RegExp(`href="/c/${sub.id}"[^>]*>দেয়ালের তাক`));
    const slug = (await DB.prepare("SELECT slug FROM products WHERE id = ?").bind(prod.id).first<{ slug: string }>())!.slug;
    const pp = await (await new Browser().get(`/product/${slug}`)).text();
    expect(pp).toContain(`<a href="/c/${parent.id}">${parent.name}</a> › <a href="/c/${sub.id}">দেয়ালের তাক</a>`);

    // পণ্যের ফর্মে সাজানো তালিকা
    const pf = await (await a.get("/admin/products/new")).text();
    expect(pf).toContain("↳ দেয়ালের তাক");
  });

  it("সাব-ক্যাটাগরির নিচে আরেকটা নয়; উপরেরটা মুছলে সাব মূল হয়ে যায়; পুরনো ছোট ফর্মও চলে", async () => {
    const a = await adminBrowser();
    const sub = await makeSub(a, 1, "সাব এক");
    const fd = new FormData();
    for (const [k, v] of Object.entries({ full: "1", name: "নাতি", parent_id: String(sub.id) })) fd.append(k, v);
    const r = await a.fetch("/admin/categories", { method: "POST", body: fd });
    expect(r.status).toBe(422);
    expect(await DB.prepare("SELECT id FROM categories WHERE name = 'নাতি'").first()).toBeNull();

    await a.post("/admin/categories/1", { name: "নতুন নাম", sort_order: 4 });
    expect(await DB.prepare("SELECT name, sort_order, parent_id FROM categories WHERE id = 1").first()).toEqual({ name: "নতুন নাম", sort_order: 4, parent_id: null });
    expect((await DB.prepare("SELECT parent_id FROM categories WHERE id = ?").bind(sub.id).first<{ parent_id: number }>())!.parent_id).toBe(1);

    await a.post("/admin/categories/1/delete", {});
    expect((await DB.prepare("SELECT parent_id FROM categories WHERE id = ?").bind(sub.id).first<{ parent_id: number | null }>())!.parent_id).toBeNull();
  });
});
