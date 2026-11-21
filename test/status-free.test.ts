import { env as rawEnv } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { WorkerEnv } from "../src/worker-env";
import { adminBrowser, Browser, DB, lastOrder, resetDb } from "./helpers";

const env = rawEnv as unknown as WorkerEnv;
beforeEach(resetDb);

const status = async (id: number) => (await DB.prepare("SELECT status, stock_applied FROM orders WHERE id = ?").bind(id).first<{ status: string; stock_applied: number }>())!;
const blocks = async (id: number) => (await DB.prepare("SELECT COUNT(*) n FROM blacklist_entries WHERE order_id = ?").bind(id).first<{ n: number }>())!.n;

describe("অর্ডারের স্ট্যাটাস যেকোনোটা থেকে যেকোনোটায়", () => {
  it("শিপড → নতুন → কনফার্ম → বাতিল → শিপড; ব্লক আর স্টক ঠিক থাকে, বিলিং একবারই", async () => {
    await new Browser().order({ phone: "01712345678" });
    const o = (await lastOrder())!;
    const a = await adminBrowser();
    const go = (to: string) => a.post(`/admin/orders/${o.id}/status`, { status: to });
    const charges = async () => (await env.PLATFORM_DB.prepare("SELECT COUNT(*) n FROM ledger WHERE ref = ?").bind(o.order_no).first<{ n: number }>())!.n;

    await go("confirmed");
    expect(await status(o.id)).toMatchObject({ status: "confirmed", stock_applied: 1 });
    await go("shipped");
    expect((await status(o.id)).status).toBe("shipped");
    const c1 = await charges();
    await go("new");
    expect(await status(o.id)).toMatchObject({ status: "new", stock_applied: 0 });
    await go("confirmed");
    expect(await status(o.id)).toMatchObject({ status: "confirmed", stock_applied: 1 });
    expect(await charges()).toBe(c1); // আবার কনফার্মে দুবার কাটে না
    await go("cancelled");
    expect(await status(o.id)).toMatchObject({ status: "cancelled", stock_applied: 0 });
    expect(await blocks(o.id)).toBeGreaterThan(0);
    await go("shipped");
    expect(await status(o.id)).toMatchObject({ status: "shipped", stock_applied: 1 });
    expect(await blocks(o.id)).toBe(0); // এই অর্ডারের ব্লক তুলে নেওয়া
    await go("fake");
    expect((await status(o.id)).status).toBe("fake");
    await go("new");
    expect((await status(o.id)).status).toBe("new");
  });

  it("ডিটেইল পেজে বর্তমানটা বাদে সব স্ট্যাটাসের বাটন; তালিকায় সব ট্যাবে একসাথে বদলের বাটন", async () => {
    await new Browser().order({ phone: "01712345679" });
    const o = (await lastOrder())!;
    const a = await adminBrowser();
    await a.post(`/admin/orders/${o.id}/status`, { status: "cancelled" });
    const html = await (await a.get(`/admin/orders/${o.id}`)).text();
    for (const to of ["new", "confirmed", "shipped", "fake"]) expect(html).toContain(`name="status" value="${to}"`);
    expect(html).not.toContain("আর বদলানো যাবে না");
    const list = await (await a.get("/admin/orders?status=cancelled")).text();
    for (const to of ["new", "confirmed", "shipped", "fake"]) expect(list).toContain(`name="to" value="${to}"`);
    expect(list).not.toContain(`name="to" value="cancelled"`);
    // একসাথে নতুনে ফেরানো
    await a.post("/admin/orders/bulk-status", { to: "new", ids: String(o.id), back: "/admin/orders" });
    expect((await status(o.id)).status).toBe("new");
  });
});
