import { beforeEach, describe, expect, it } from "vitest";
import { Browser, DB, adminBrowser, resetDb } from "./helpers";

beforeEach(resetDb);

async function setup() {
  const a = await adminBrowser();
  await a.post("/admin/products/1/landing", { landing_json: JSON.stringify({ sections: [{ type: "hero", data: { title: "হ্যালো" } }] }) });
  return { a, p: (await DB.prepare("SELECT id, slug, name FROM products WHERE id=1").first<{ id: number; slug: string; name: string }>())! };
}

describe("ল্যান্ডিং পেজের শিরোনাম, বিবরণ আর লিংক", () => {
  it("তালিকা আর এডিটরে বোতাম, ফর্মে তিনটা ঘর আর প্রিভিউ", async () => {
    const { a, p } = await setup();
    expect(await (await a.get("/admin/landing")).text()).toContain(`/admin/products/${p.id}/landing/info`);
    expect(await (await a.get(`/admin/products/${p.id}/landing`)).text()).toContain(`/admin/products/${p.id}/landing/info?from=builder`);
    const html = await (await a.get(`/admin/products/${p.id}/landing/info`)).text();
    for (const n of ['name="meta_title"', 'name="meta_description"', 'name="slug"', "data-lpi", 'data-lpi-out="title"', `value="${p.slug}"`]) expect(html).toContain(n);
  });

  it("সেভ হয়, পেজে শিরোনাম/বিবরণ বসে, পুরনো লিংক নতুনটায় ৩০১", async () => {
    const { a, p } = await setup();
    const r = await a.post(`/admin/products/${p.id}/landing/info`, { meta_title: "পিরিয়ড প্যান্টি — আরামদায়ক", meta_description: "দাগ পড়ার ভয় ছাড়া সারাদিন আরাম।", slug: "Period Panty!" });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/admin/landing");
    const row = await DB.prepare("SELECT slug, meta_title, meta_description FROM products WHERE id=?").bind(p.id).first<any>();
    expect(row).toMatchObject({ slug: "period-panty", meta_title: "পিরিয়ড প্যান্টি — আরামদায়ক", meta_description: "দাগ পড়ার ভয় ছাড়া সারাদিন আরাম।" });

    const page = await (await new Browser().get("/p/period-panty")).text();
    expect(page).toContain("<title>পিরিয়ড প্যান্টি — আরামদায়ক");
    expect(page).toContain("দাগ পড়ার ভয় ছাড়া সারাদিন আরাম।");

    const old = await new Browser().fetch(`/p/${p.slug}?utm_source=fb`, { redirect: "manual" });
    expect(old.status).toBe(301);
    expect(old.headers.get("location")).toBe("/p/period-panty?utm_source=fb");
    const old2 = await new Browser().fetch(`/product/${p.slug}`, { redirect: "manual" });
    expect(old2.status).toBe(301);
    expect(old2.headers.get("location")).toBe("/product/period-panty");

    // তালিকায় নতুন শিরোনাম, এডিটর থেকে এলে এডিটরেই ফেরে
    expect(await (await a.get("/admin/landing")).text()).toContain("পিরিয়ড প্যান্টি — আরামদায়ক");
    const back = await a.post(`/admin/products/${p.id}/landing/info?from=builder`, { meta_title: "", meta_description: "", slug: "period-panty" });
    expect(back.headers.get("location")).toBe(`/admin/products/${p.id}/landing`);
    expect(await DB.prepare("SELECT meta_title FROM products WHERE id=?").bind(p.id).first("meta_title")).toBeNull();
  });

  it("ভুল বা অন্যের লিংক আটকায়; পুরনো লিংক অন্য পণ্য নিলে সেটাই খোলে", async () => {
    const { a, p } = await setup();
    const other = await DB.prepare("SELECT slug FROM products WHERE id != ? LIMIT 1").bind(p.id).first<{ slug: string }>();
    const bn = await a.post(`/admin/products/${p.id}/landing/info`, { meta_title: "", meta_description: "", slug: "বাংলা" });
    expect(bn.status).toBe(422);
    expect(await bn.text()).toContain("ইংরেজি অক্ষর");
    const dup = await a.post(`/admin/products/${p.id}/landing/info`, { meta_title: "", meta_description: "", slug: other!.slug });
    expect(dup.status).toBe(422);
    expect(await dup.text()).toContain("অন্য একটা পণ্যে");
    expect(await DB.prepare("SELECT slug FROM products WHERE id=?").bind(p.id).first("slug")).toBe(p.slug);

    // লিংক বদলে, তারপর আবার আগেরটায় ফিরলে — কোনো লুপ নেই
    await a.post(`/admin/products/${p.id}/landing/info`, { meta_title: "", meta_description: "", slug: "new-one" });
    await a.post(`/admin/products/${p.id}/landing/info`, { meta_title: "", meta_description: "", slug: p.slug });
    expect((await new Browser().get(`/p/${p.slug}`)).status).toBe(200);
    const nw = await new Browser().fetch("/p/new-one", { redirect: "manual" });
    expect(nw.status).toBe(301);
    expect(nw.headers.get("location")).toBe(`/p/${p.slug}`);
    expect((await new Browser().fetch("/p/kichu-nei", { redirect: "manual" })).status).toBe(404);
  });
});
