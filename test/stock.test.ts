/**
 * ধাপ ৪: স্টক আর ইনভেন্টরি
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb, setStatus } from "./helpers";
import { syncVariants } from "../src/shop/lib/products";

beforeEach(async () => {
  await resetDb();
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 20));
});

const stockOf = async (id = 1) => (await DB.prepare("SELECT stock FROM products WHERE id = ?").bind(id).first<{ stock: number }>())!.stock;
const track = (id: number, stock: number) => DB.prepare("UPDATE products SET track_stock = 1, stock = ? WHERE id = ?").bind(stock, id).run();

/** সাইজওয়ালা পণ্য: S (স্টক s), M (স্টক m) */
async function sized(s: number, m: number) {
  await DB.prepare("UPDATE products SET track_stock = 1, options_json = ? WHERE id = 1").bind(JSON.stringify([{ name: "সাইজ", values: ["S", "M"] }])).run();
  await syncVariants(DB as unknown as D1Database, 1, [{ name: "সাইজ", values: ["S", "M"] }]);
  const vs = (await DB.prepare("SELECT id, label FROM product_variants WHERE product_id = 1 ORDER BY sort_order").all<{ id: number; label: string }>()).results;
  await DB.prepare("UPDATE product_variants SET stock = ? WHERE id = ?").bind(s, vs[0]!.id).run();
  await DB.prepare("UPDATE product_variants SET stock = ? WHERE id = ?").bind(m, vs[1]!.id).run();
  await DB.prepare("UPDATE products SET stock = ? WHERE id = 1").bind(s + m).run();
  return { S: vs[0]!.id, M: vs[1]!.id };
}

describe("স্টক কমা আর ফেরা", () => {
  it("পণ্যের পেজ থেকে স্টক চালু; কনফার্মে কমে, বাতিলে ফেরে, সব লগে থাকে", async () => {
    const admin = await adminBrowser();
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: "কাঠের ওয়াল শেলফ", slug: "wooden-wall-shelf", price: "1250", is_active: "1", show_on_home: "1", track_stock: "1", stock: "3", low_stock: "1", cost_price: "800" })) fd.append(k, v);
    expect((await admin.fetch("/admin/products/1", { method: "POST", body: fd })).status).toBe(303);
    expect(await DB.prepare("SELECT track_stock, stock, low_stock, cost_price FROM products WHERE id = 1").first()).toMatchObject({ track_stock: 1, stock: 3, low_stock: 1, cost_price: 800 });

    await new Browser().order();
    const o = (await lastOrder())!;
    expect(await stockOf()).toBe(3); // নতুন অর্ডারে কমে না
    await setStatus(admin, o.id, "confirmed");
    expect(await stockOf()).toBe(2);
    await setStatus(admin, o.id, "confirmed"); // দুবার কমে না
    expect(await stockOf()).toBe(2);
    await setStatus(admin, o.id, "cancelled");
    expect(await stockOf()).toBe(3);
    const moves = (await DB.prepare("SELECT change, reason FROM stock_moves ORDER BY id").all<{ change: number; reason: string }>()).results;
    expect(moves).toEqual([{ change: 3, reason: "manual" }, { change: -1, reason: "order" }, { change: 1, reason: "cancel" }]);
  });

  it("স্টক কম থাকলে কনফার্ম হয় না", async () => {
    await track(1, 1);
    await new Browser().order();
    const o = (await lastOrder())!;
    await DB.prepare("UPDATE products SET stock = 0 WHERE id = 1").run();
    const admin = await adminBrowser();
    await setStatus(admin, o.id, "confirmed");
    expect((await lastOrder())!.status).toBe("new");
    expect(await (await admin.get(`/admin/orders/${o.id}`)).text()).toContain("স্টকে নেই");
  });

  it("পার্সেল ফেরত এলে স্টকে ফেরে, পরে ডেলিভারি দিলে আবার কমে", async () => {
    await track(1, 5);
    const admin = await adminBrowser();
    await new Browser().order();
    const o = (await lastOrder())!;
    await setStatus(admin, o.id, "confirmed");
    expect(await stockOf()).toBe(4);
    await admin.post(`/admin/orders/${o.id}/outcome`, { outcome: "returned" });
    expect(await stockOf()).toBe(5);
    await admin.post(`/admin/orders/${o.id}/outcome`, { outcome: "delivered" });
    expect(await stockOf()).toBe(4);
    // ফেরতের পর বাতিল করলে আর বাড়ে না
    await admin.post(`/admin/orders/${o.id}/outcome`, { outcome: "returned" });
    await setStatus(admin, o.id, "cancelled");
    expect(await stockOf()).toBe(5);
  });

  it("স্টক না গুনলে কিছুই বদলায় না", async () => {
    const admin = await adminBrowser();
    await new Browser().order();
    await setStatus(admin, (await lastOrder())!.id, "confirmed");
    expect((await DB.prepare("SELECT COUNT(*) n FROM stock_moves").first<{ n: number }>())!.n).toBe(0);
  });
});

describe("দোকানে স্টক নেই", () => {
  it("শেষ হলে ল্যান্ডিং/পণ্যের পেজে 'স্টক নেই', কার্ডে চিহ্ন, অর্ডার নেয় না", async () => {
    await track(1, 0);
    const b = new Browser();
    expect(await (await b.get("/p/wooden-wall-shelf")).text()).toContain("এই পণ্যটি এখন স্টকে নেই");
    expect(await (await b.get("/product/wooden-wall-shelf")).text()).toContain("এই পণ্যটি এখন স্টকে নেই");
    expect(await (await b.get("/")).text()).toContain("sold-out-tag");
    const r = await b.order();
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("এই পণ্যটি এখন স্টকে নেই");
    const c = await b.post("/cart/add", { product_id: 1 }, { accept: "application/json" });
    expect(c.status).toBe(422);
  });

  it("কার্টে যতটা আছে তার বেশি চাইলে অর্ডার হয় না", async () => {
    await track(1, 2);
    const b = new Browser();
    await b.post("/cart/add", { product_id: 1, qty: 3 });
    const r = await b.post("/order", { source: "cart", name: "রহিম", phone: "01712345678", address: "বাসা ১২, মিরপুর, ঢাকা", area: "inside", note: "" });
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("মাত্র ২টা আছে");
  });

  it("সাইজ ধরে স্টক: শেষ হওয়া সাইজ বাছাই করা যায় না, বাকিটা চলে", async () => {
    const v = await sized(0, 2);
    const b = new Browser();
    const html = await (await b.get("/p/wooden-wall-shelf")).text();
    expect(html).toMatch(new RegExp(`value="${v.S}"[^>]*disabled`));
    const bad = await b.order({ variant_id: v.S });
    expect(bad.status).toBe(422);
    expect(await bad.text()).toContain("S&quot; এখন স্টকে নেই");
    expect((await b.order({ variant_id: v.M })).status).toBe(303);
    const admin = await adminBrowser();
    await setStatus(admin, (await lastOrder())!.id, "confirmed");
    expect((await DB.prepare("SELECT stock FROM product_variants WHERE id = ?").bind(v.M).first<{ stock: number }>())!.stock).toBe(1);
    expect(await stockOf()).toBe(1); // মোট = ভ্যারিয়েন্টের যোগফল
  });
});

describe("ইনভেন্টরি পেজ", () => {
  it("একসাথে চালু, সংখ্যা বসানো আর যোগ করা", async () => {
    const admin = await adminBrowser();
    expect(await (await admin.get("/admin/inventory")).text()).toContain("স্টক গোনা চালু করুন");
    const body = new URLSearchParams();
    body.append("ids", "1"); body.append("ids", "2");
    expect((await admin.fetch("/admin/inventory/track", { method: "POST", body })).status).toBe(303);
    expect((await DB.prepare("SELECT COUNT(*) n FROM products WHERE track_stock = 1").first<{ n: number }>())!.n).toBe(2);

    await admin.post("/admin/inventory", { s_1_0: 10, a_2_0: 4, note: "নতুন মাল" });
    expect(await stockOf(1)).toBe(10);
    expect(await stockOf(2)).toBe(4);
    await admin.post("/admin/inventory", { a_1_0: -3 });
    expect(await stockOf(1)).toBe(7);
    const html = await (await admin.get("/admin/inventory")).text();
    expect(html).toContain("নতুন মাল");
    expect(html).toContain("কাঠের ওয়াল শেলফ");
  });

  it("সাইজের স্টক পণ্যের পেজ থেকে, আর কম থাকলে ড্যাশবোর্ডে সতর্কতা", async () => {
    const v = await sized(5, 5);
    const admin = await adminBrowser();
    await admin.post("/admin/products/1/variants", { [`price_${v.S}`]: "", [`active_${v.S}`]: "1", [`stock_${v.S}`]: 2, [`cost_${v.S}`]: 700, [`price_${v.M}`]: "", [`active_${v.M}`]: "1", [`stock_${v.M}`]: 8 });
    expect(await stockOf()).toBe(10);
    expect((await DB.prepare("SELECT cost_price FROM product_variants WHERE id = ?").bind(v.S).first<{ cost_price: number }>())!.cost_price).toBe(700);
    const dash = await (await admin.get("/admin")).text();
    expect(dash).toContain("স্টক কম বা শেষ");
    expect(dash).toContain("কাঠের ওয়াল শেলফ (S)");
  });

  it("অর্ডার স্টাফ ইনভেন্টরি দেখতে পারে না", async () => {
    const admin = await adminBrowser();
    await DB.prepare("UPDATE users SET role = 'orders'").run();
    expect((await admin.get("/admin/inventory")).status).toBe(403);
  });
});
