/**
 * পুরো পথ এক টেস্টে: সাইনআপ → নিজে লগইন → পণ্য যোগ → কাস্টমারের অর্ডার → কনফার্ম → কুরিয়ারে পাঠানো → CSV
 * প্রতি ডিপ্লয়ের আগে চলে, তাই মূল পথ ভাঙলে লাইভে যায় না।
 */
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Browser, resetDb, shopDb } from "./helpers";

const P = "https://ourdomain.com";
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

beforeEach(async () => {
  await resetDb();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://portal.packzy.com/") && url.endsWith("/create_order")) {
      const body = JSON.parse(init.body);
      return json({ status: 200, consignment: { consignment_id: 5501, tracking_code: "SF" + body.invoice, status: "in_review" } });
    }
    return json({ ok: true });
  });
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 50));
  vi.restoreAllMocks();
});

describe("পুরো পথ: সাইনআপ থেকে কুরিয়ার", () => {
  it("নতুন দোকানদার দোকান খুলে প্রথম অর্ডার কুরিয়ারে পাঠাতে পারে", async () => {
    // ১. সাইনআপ (নমুনা পণ্য ছাড়া)
    const owner = new Browser("172.31.0.9");
    const r = await owner.fetch("/signup", { method: "POST", base: P, body: new URLSearchParams({
      shop_name: "ফ্লো দোকান", slug: "flowshop", owner_name: "মালিক", phone: "01811111111",
      email: "owner@flow.test", password: "secret123", seed_demo: "",
    }) } as RequestInit);
    expect(r.status).toBe(303);
    const loc = new URL(r.headers.get("location")!);
    const S = loc.origin; // https://flowshop.ourdomain.com
    const shop = (await env.PLATFORM_DB.prepare("SELECT id FROM shops WHERE slug = 'flowshop'").first<{ id: string }>())!;
    const db = shopDb(shop.id);
    const go = (path: string, init: RequestInit = {}) => owner.fetch(path, { ...init, base: S } as RequestInit);

    // ২. নিজে নিজে লগইন হয়ে প্যানেলে
    expect((await go(loc.pathname + loc.search)).status).toBe(303);
    expect((await go("/admin")).status).toBe(200);

    // ৩. প্রথম পণ্য যোগ
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: "কাঠের ট্রে", slug: "", price: "850", is_active: "1", show_on_home: "1" })) fd.append(k, v);
    expect((await go("/admin/products", { method: "POST", body: fd })).status).toBe(303);
    const p = (await db.prepare("SELECT id, slug FROM products WHERE name = 'কাঠের ট্রে'").first<{ id: number; slug: string }>())!;
    expect(p).toBeTruthy();

    // ৪. কাস্টমার দোকানে পণ্য দেখে অর্ডার দেয়
    const buyer = new Browser("172.31.0.10");
    expect(await (await buyer.fetch(`/product/${p.slug}`, { base: S } as RequestInit)).text()).toContain("কাঠের ট্রে");
    const ord = await buyer.fetch("/order", { method: "POST", base: S, body: new URLSearchParams({
      source: "landing", product_id: String(p.id), name: "ক্রেতা", phone: "01712345678", address: "বাসা ৫, মিরপুর, ঢাকা", area: "inside", note: "",
    }) } as RequestInit);
    expect(ord.status).toBe(303);
    const o = (await db.prepare("SELECT id, order_no, status, total FROM orders ORDER BY id DESC LIMIT 1").first<{ id: number; order_no: string; status: string; total: number }>())!;
    expect(o.status).toBe("new");

    // ৫. মালিক কনফার্ম করে, কুরিয়ার সেট করে, পাঠায়
    expect((await go(`/admin/orders/${o.id}/status`, { method: "POST", body: new URLSearchParams({ status: "confirmed" }) })).status).toBe(303);
    expect((await go("/admin/courier", { method: "POST", body: new URLSearchParams({ steadfast_api_key: "K", steadfast_secret_key: "S" }) })).status).toBe(303);
    expect((await go(`/admin/orders/${o.id}/courier`, { method: "POST", body: new URLSearchParams({ courier: "steadfast", cod: String(o.total) }) })).status).toBe(303);
    const after = (await db.prepare("SELECT status, courier, tracking_code FROM orders WHERE id = ?").bind(o.id).first<Record<string, string>>())!;
    expect(after).toMatchObject({ status: "shipped", courier: "steadfast", tracking_code: "SF" + o.order_no });

    // ৬. হিসাব: ট্রায়ালের অর্ডার গোনা হলো, আর CSV-তে অর্ডারটা আছে
    const s = (await env.PLATFORM_DB.prepare("SELECT trial_orders_left FROM shops WHERE id = ?").bind(shop.id).first<{ trial_orders_left: number }>())!;
    expect(s.trial_orders_left).toBe(399);
    expect(await (await go("/admin/export/orders.csv")).text()).toContain(o.order_no);
  });
});
