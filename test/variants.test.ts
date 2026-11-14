import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb, setStatus } from "./helpers";

beforeEach(resetDb);

/** পণ্য ১-এ সাইজ (S, M, L) আর রং (লাল, কালো) — অ্যাডমিন ফর্ম দিয়ে */
async function setupVariants() {
  const a = await adminBrowser();
  const r = await a.post("/admin/products/1", {
    name: "কাঠের ওয়াল শেলফ", slug: "wooden-wall-shelf", category_id: 1, price: 1250, compare_price: 1650, sort_order: 1,
    headline: "", short_desc: "", details_html: "", youtube_url: "", is_active: 1, show_on_home: 1,
    opt0_name: "সাইজ", opt0_values: "S, M, L", opt1_name: "রং", opt1_values: "লাল, কালো, লাল",
  });
  expect(r.status).toBe(303);
  expect(r.headers.get("location")).toBe("/admin/products/1/edit");
  const { results } = await DB.prepare("SELECT id, label FROM product_variants WHERE product_id = 1 ORDER BY sort_order").all<{ id: number; label: string }>();
  return { a, variants: results };
}
const vid = (vs: { id: number; label: string }[], label: string) => vs.find((v) => v.label === label)!.id;

describe("ভ্যারিয়েন্ট তৈরি", () => {
  it("অপশন থেকে সব কম্বিনেশন হয় (ডুপ্লিকেট মান বাদ)", async () => {
    const { variants } = await setupVariants();
    expect(variants.map((v) => v.label)).toEqual(["S / লাল", "S / কালো", "M / লাল", "M / কালো", "L / লাল", "L / কালো"]);
  });

  it("আলাদা দাম আর স্টকে নেই সেট করা যায়; অপশন বদলালে আগের সেটিং থাকে", async () => {
    const { a, variants } = await setupVariants();
    const form: Record<string, string> = {};
    for (const v of variants) {
      form[`active_${v.id}`] = "1";
      if (v.label.startsWith("L")) form[`price_${v.id}`] = "1400";
    }
    delete form[`active_${vid(variants, "S / কালো")}`];
    await a.post("/admin/products/1/variants", form);

    // রং থেকে "কালো" সরালে কালো ভ্যারিয়েন্টগুলো মুছে যায়, বাকিগুলোর দাম থাকে
    await a.post("/admin/products/1", {
      name: "কাঠের ওয়াল শেলফ", slug: "wooden-wall-shelf", category_id: 1, price: 1250, sort_order: 1, is_active: 1, show_on_home: 1,
      opt0_name: "সাইজ", opt0_values: "S, M, L", opt1_name: "রং", opt1_values: "লাল",
    });
    const { results } = await DB.prepare("SELECT label, price, active FROM product_variants WHERE product_id = 1 ORDER BY sort_order").all();
    expect(results).toEqual([
      { label: "S / লাল", price: null, active: 1 },
      { label: "M / লাল", price: null, active: 1 },
      { label: "L / লাল", price: 1400, active: 1 },
    ]);
  });
});

describe("কাস্টমারের দিক", () => {
  it("ল্যান্ডিং পেজে ভ্যারিয়েন্ট দেখায়, স্টকে না থাকলে বন্ধ; হোমে 'অপশন বাছুন'", async () => {
    const { a, variants } = await setupVariants();
    const off = vid(variants, "M / কালো");
    const form: Record<string, string> = {};
    for (const v of variants) if (v.id !== off) form[`active_${v.id}`] = "1";
    await a.post("/admin/products/1/variants", form);

    const html = await (await new Browser().get("/p/wooden-wall-shelf")).text();
    expect(html).toContain("সাইজ/রং বাছাই করুন");
    expect(html).toContain("S / লাল");
    expect(html).toMatch(new RegExp(`value="${off}" disabled`));
    const home = await (await new Browser().get("/")).text();
    expect(home).toContain("অপশন বাছুন");
  });

  it("ভ্যারিয়েন্ট না বাছলে অর্ডার হয় না; বাছলে অর্ডারে সেভ হয়, ভ্যারিয়েন্টের দাম লাগে", async () => {
    const { a, variants } = await setupVariants();
    const L = vid(variants, "L / কালো");
    const form: Record<string, string> = {};
    for (const v of variants) form[`active_${v.id}`] = "1";
    form[`price_${L}`] = "1400";
    await a.post("/admin/products/1/variants", form);

    const bad = await new Browser().order();
    expect(bad.status).toBe(422);
    expect(await bad.text()).toContain("সাইজ/রং বাছাই করুন");

    expect((await new Browser().order({ variant_id: L })).status).toBe(303);
    const o = (await lastOrder())!;
    expect(o.subtotal).toBe(1400);
    const item = await DB.prepare("SELECT variant_id, variant_label, price FROM order_items WHERE order_id = ?").bind(o.id).first();
    expect(item).toEqual({ variant_id: L, variant_label: "L / কালো", price: 1400 });

    const detail = await (await a.get(`/admin/orders/${o.id}`)).text();
    expect(detail).toContain("(L / কালো)");
  });

  it("স্টকে নেই এমন বা অন্য পণ্যের ভ্যারিয়েন্ট দিয়ে অর্ডার হয় না", async () => {
    const { a, variants } = await setupVariants();
    const off = vid(variants, "S / লাল");
    const form: Record<string, string> = {};
    for (const v of variants) if (v.id !== off) form[`active_${v.id}`] = "1";
    await a.post("/admin/products/1/variants", form);
    expect((await new Browser().order({ variant_id: off })).status).toBe(422);
    expect((await new Browser().order({ variant_id: 99999, phone: "01811111111" })).status).toBe(422);
  });

  it("কার্টে: ভ্যারিয়েন্ট ছাড়া যোগ হয় না; এক পণ্য একটাই (অন্য ভ্যারিয়েন্টেও না)", async () => {
    const { variants } = await setupVariants();
    const b = new Browser();
    const r0 = await b.post("/cart/add", { product_id: 1 }, { accept: "application/json" });
    expect(await r0.json()).toMatchObject({ ok: false, redirect: "/p/wooden-wall-shelf#order" });

    const r1 = await b.post("/cart/add", { product_id: 1, variant_id: vid(variants, "M / লাল") }, { accept: "application/json" });
    expect(await r1.json()).toMatchObject({ ok: true });
    const r2 = await b.post("/cart/add", { product_id: 1, variant_id: vid(variants, "L / কালো") }, { accept: "application/json" });
    expect(await r2.json()).toMatchObject({ ok: false, message: "এই পণ্যটি আগেই কার্টে আছে" });

    await b.post("/cart/add", { product_id: 3 });
    const cart = await (await b.get("/cart")).text();
    expect(cart).toContain("M / লাল");

    // কুকি বদলে একই পণ্যের দুই ভ্যারিয়েন্ট ঢোকালেও একটাই থাকে
    b.cookies.set("cart", `1:${vid(variants, "M / লাল")},1:${vid(variants, "L / লাল")},3`);
    await b.post("/order", { source: "cart", name: "করিম", phone: "01812345678", address: "চট্টগ্রাম সদর", area: "inside" });
    const o = (await lastOrder())!;
    const { results } = await DB.prepare("SELECT product_id, variant_label FROM order_items WHERE order_id = ? ORDER BY product_id").bind(o.id).all();
    expect(results).toEqual([{ product_id: 1, variant_label: "M / লাল" }, { product_id: 3, variant_label: null }]);
  });

  it("ধন্যবাদ পেজে আর কনফার্মের Purchase-এ সব ঠিক থাকে", async () => {
    const { a, variants } = await setupVariants();
    const b = new Browser();
    await b.order({ variant_id: vid(variants, "S / লাল") });
    expect(await (await b.get("/thanks")).text()).toContain("(S / লাল)");
    const o = (await lastOrder())!;
    await setStatus(a, o.id, "confirmed");
    expect((await lastOrder())!.status).toBe("confirmed");
  });
});
