import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb, setStatus } from "./helpers";

type Call = { url: string; method: string; headers: Record<string, string>; body: any };
let calls: Call[] = [];
let reply: (c: Call) => Response | undefined;

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

function defaultReply(c: Call): Response {
  const u = new URL(c.url);
  if (u.hostname === "portal.packzy.com") {
    if (u.pathname.endsWith("/create_order")) return json({ status: 200, consignment: { consignment_id: 9001 + calls.filter((x) => x.url.endsWith("/create_order")).length - 1, tracking_code: "SFTRK" + c.body.invoice, status: "in_review" } });
    if (u.pathname.includes("/status_by_cid/")) return json({ status: 200, delivery_status: "delivered" });
  }
  if (u.hostname === "api-hermes.pathao.com") {
    if (u.pathname.endsWith("/issue-token")) return json({ token_type: "Bearer", expires_in: 432000, access_token: "PTOKEN", refresh_token: "r" });
    if (u.pathname.endsWith("/city-list")) return json({ data: { data: [{ city_id: 1, city_name: "Dhaka" }, { city_id: 2, city_name: "Chattogram" }] } });
    if (u.pathname.endsWith("/zone-list")) return json({ data: { data: [{ zone_id: 52, zone_name: "Mirpur" }] } });
    if (u.pathname.endsWith("/orders")) return json({ message: "Order Created Successfully", type: "success", code: 200, data: { consignment_id: "DL121224VS8TTJ", merchant_order_id: c.body.merchant_order_id, order_status: "Pending", delivery_fee: 80 } });
    if (u.pathname.endsWith("/info")) return json({ data: { consignment_id: "DL121224VS8TTJ", order_status: "Picked" } });
  }
  if (u.hostname === "openapi.redx.com.bd") {
    if (u.pathname.endsWith("/areas")) return json({ areas: [{ id: 1, name: "Mirpur DOHS", post_code: 1216, division_name: "Dhaka", zone_id: 1 }] });
    if (u.pathname.endsWith("/parcel")) return json({ tracking_id: "21A427TU4BN3R" }, 201);
    if (u.pathname.includes("/parcel/info/")) return json({ parcel: { tracking_id: "21A427TU4BN3R", status: "delivery-in-progress" } });
  }
  return json({ message: "not found" }, 404);
}

beforeEach(async () => {
  await resetDb();
  calls = [];
  reply = () => undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://graph.facebook.com/")) return json({ events_received: 1 });
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const c: Call = { url, method: init?.method ?? "GET", headers, body: init?.body ? JSON.parse(init.body) : null };
    calls.push(c);
    return reply(c) ?? defaultReply(c);
  });
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 50));
  vi.restoreAllMocks();
});

async function setup(settings: Record<string, string>) {
  const a = await adminBrowser();
  await a.post("/admin/courier", settings);
  return a;
}
const STEADFAST = { steadfast_api_key: "SFKEY", steadfast_secret_key: "SFSECRET" };
const PATHAO = { pathao_client_id: "cid", pathao_client_secret: "csec", pathao_username: "m@shop.test", pathao_password: "pw", pathao_store_id: "777" };
const REDX = { redx_token: "RXTOKEN", redx_pickup_store_id: "55" };

async function confirmedOrder(a: Browser, phone = "01712345678") {
  await new Browser().order({ phone, note: "সন্ধ্যায় দিন" });
  const o = (await lastOrder())!;
  await setStatus(a, o.id, "confirmed");
  return o.id as number;
}
const order = (id: number) => DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<any>();
const sends = () => calls.filter((c) => c.method === "POST" && !c.url.endsWith("/issue-token"));

describe("কুরিয়ার সেটিংস", () => {
  it("মালিক সেভ করতে পারে; গোপন তথ্য পেজে দেখায় না, ফাঁকা রাখলে আগেরটা থাকে", async () => {
    const a = await setup({ ...STEADFAST });
    let s = await DB.prepare("SELECT value FROM settings WHERE key='steadfast_secret_key'").first<any>();
    expect(s.value).toBe("SFSECRET");
    const page = await (await a.get("/admin/courier")).text();
    expect(page).not.toContain("SFSECRET");
    expect(page).toContain("সেভ করা আছে");
    await a.post("/admin/courier", { steadfast_api_key: "SFKEY2", steadfast_secret_key: "" });
    s = await DB.prepare("SELECT value FROM settings WHERE key='steadfast_secret_key'").first<any>();
    expect(s.value).toBe("SFSECRET");
    await a.post("/admin/courier", { steadfast_api_key: "SFKEY2", clear_steadfast_secret_key: "1" });
    s = await DB.prepare("SELECT value FROM settings WHERE key='steadfast_secret_key'").first<any>();
    expect(s.value).toBe("");
  });

  it("ম্যানেজার/অর্ডার স্টাফ কুরিয়ার সেটিংস দেখতে পারে না, কিন্তু অর্ডার কুরিয়ারে পাঠাতে পারে", async () => {
    const a = await setup(STEADFAST);
    await a.post("/admin/staff", { name: "অর্ডার স্টাফ", email: "o@s.test", password: "staffpass1", role: "orders" });
    const o = new Browser();
    await o.post("/admin/login", { email: "o@s.test", password: "staffpass1" });
    expect((await o.get("/admin/courier")).status).toBe(403);
    const id = await confirmedOrder(a);
    expect((await o.post(`/admin/orders/${id}/courier`, { courier: "steadfast" })).status).toBe(303);
    expect((await order(id)).consignment_id).toBe("9001");
  });
});

describe("Steadfast", () => {
  it("কনফার্ম অর্ডার বুক হয়: সঠিক হেডার/তথ্য, ট্র্যাকিং সেভ, অর্ডার শিপড", async () => {
    const a = await setup(STEADFAST);
    const id = await confirmedOrder(a);
    const detail = await (await a.get(`/admin/orders/${id}`)).text();
    expect(detail).toContain("কুরিয়ারে পাঠান");
    const res = await a.post(`/admin/orders/${id}/courier`, { courier: "steadfast", cod: 1320 });
    expect(res.status).toBe(303);
    const sent = sends()[0]!;
    expect(sent.url).toBe("https://portal.packzy.com/api/v1/create_order");
    expect(sent.headers["api-key"]).toBe("SFKEY");
    expect(sent.headers["secret-key"]).toBe("SFSECRET");
    const o = await order(id);
    expect(sent.body).toMatchObject({ invoice: o.order_no, recipient_phone: "01712345678", cod_amount: 1320 });
    expect(sent.body.note).toContain("সন্ধ্যায় দিন");
    expect(o).toMatchObject({ status: "shipped", courier: "steadfast", consignment_id: "9001", tracking_code: "SFTRK" + o.order_no, courier_status: "in_review" });
    const after = await (await a.get(`/admin/orders/${id}`)).text();
    expect(after).toContain("SFTRK" + o.order_no);
    expect(after).toContain("স্ট্যাটাস আপডেট");
  });

  it("দুবার পাঠানো যায় না; নতুন (কনফার্ম না হওয়া) অর্ডার পাঠানো যায় না", async () => {
    const a = await setup(STEADFAST);
    const id = await confirmedOrder(a);
    await a.post(`/admin/orders/${id}/courier`, { courier: "steadfast" });
    await a.post(`/admin/orders/${id}/courier`, { courier: "steadfast" });
    expect(sends().length).toBe(1);
    await new Browser().order({ phone: "01812345678" });
    const fresh = (await lastOrder())!;
    await a.post(`/admin/orders/${fresh.id}/courier`, { courier: "steadfast" });
    expect(sends().length).toBe(1);
    expect((await order(fresh.id)).status).toBe("new");
  });

  it("কুরিয়ার ভুল বললে অর্ডার কনফার্মই থাকে, কারণ দেখায়, আবার চেষ্টা করা যায়", async () => {
    const a = await setup(STEADFAST);
    const id = await confirmedOrder(a);
    reply = (c) => (c.url.endsWith("/create_order") ? json({ status: 400, message: "Invalid phone" }, 400) : undefined);
    await a.post(`/admin/orders/${id}/courier`, { courier: "steadfast" });
    let o = await order(id);
    expect(o).toMatchObject({ status: "confirmed", consignment_id: null, courier: null });
    expect(await (await a.get(`/admin/orders/${id}`)).text()).toContain("Invalid phone");
    reply = () => undefined;
    await a.post(`/admin/orders/${id}/courier`, { courier: "steadfast" });
    o = await order(id);
    expect(o.status).toBe("shipped");
  });

  it("স্ট্যাটাস আপডেট বাটন", async () => {
    const a = await setup(STEADFAST);
    const id = await confirmedOrder(a);
    await a.post(`/admin/orders/${id}/courier`, { courier: "steadfast" });
    await a.post(`/admin/orders/${id}/courier/status`, {});
    expect(calls.at(-1)!.url).toBe("https://portal.packzy.com/api/v1/status_by_cid/9001");
    expect((await order(id)).courier_status).toBe("delivered");
  });

  it("API তথ্য না দিলে পাঠানো যায় না", async () => {
    const a = await adminBrowser();
    const id = await confirmedOrder(a);
    expect(await (await a.get(`/admin/orders/${id}`)).text()).toContain("কুরিয়ার চালু নেই");
    await a.post(`/admin/orders/${id}/courier`, { courier: "steadfast" });
    expect(calls.length).toBe(0);
    expect((await order(id)).status).toBe("confirmed");
  });

  it("একসাথে অনেক অর্ডার পাঠানো (বাল্ক)", async () => {
    const a = await setup(STEADFAST);
    const ids = [await confirmedOrder(a, "01712345671"), await confirmedOrder(a, "01712345672"), await confirmedOrder(a, "01712345673")];
    const list = await (await a.get("/admin/orders?status=confirmed")).text();
    expect(list).toContain("বাছাই করা অর্ডার কুরিয়ারে পাঠান");
    const body = new URLSearchParams();
    body.append("courier", "steadfast");
    for (const id of ids.slice(0, 2)) body.append("ids", String(id));
    await a.fetch("/admin/orders/bulk-courier", { method: "POST", body });
    expect(sends().length).toBe(2);
    expect((await order(ids[0]!)).status).toBe("shipped");
    expect((await order(ids[1]!)).status).toBe("shipped");
    expect((await order(ids[2]!)).status).toBe("confirmed");
  });
});

describe("Pathao", () => {
  it("টোকেন নিয়ে বুক করে, টোকেন সেভ রেখে আবার ব্যবহার করে; শহর/জোন ড্রপডাউন", async () => {
    const a = await setup(PATHAO);
    const cities = await (await a.get("/admin/orders/courier-locations?courier=pathao&type=cities")).json<any>();
    expect(cities.items).toEqual([{ id: 1, name: "Dhaka" }, { id: 2, name: "Chattogram" }]);
    const zones = await (await a.get("/admin/orders/courier-locations?courier=pathao&type=zones&id=1")).json<any>();
    expect(zones.items[0]).toEqual({ id: 52, name: "Mirpur" });
    expect(calls.filter((c) => c.url.endsWith("/issue-token")).length).toBe(1);
    const tokenCall = calls.find((c) => c.url.endsWith("/issue-token"))!;
    expect(tokenCall.body).toMatchObject({ client_id: "cid", grant_type: "password", username: "m@shop.test" });

    const id = await confirmedOrder(a);
    await a.post(`/admin/orders/${id}/courier`, { courier: "pathao", pathao_city: 1, pathao_zone: 52 });
    expect(calls.filter((c) => c.url.endsWith("/issue-token")).length).toBe(1); // সেভ করা টোকেন
    const sent = sends()[0]!;
    expect(sent.url).toBe("https://api-hermes.pathao.com/aladdin/api/v1/orders");
    expect(sent.headers["authorization"]).toBe("Bearer PTOKEN");
    expect(sent.body).toMatchObject({ store_id: 777, recipient_city: 1, recipient_zone: 52, delivery_type: 48, item_type: 2 });
    expect(await order(id)).toMatchObject({ status: "shipped", courier: "pathao", consignment_id: "DL121224VS8TTJ", courier_status: "Pending" });
    await a.post(`/admin/orders/${id}/courier/status`, {});
    expect((await order(id)).courier_status).toBe("Picked");
  });

  it("Pathao তথ্য বদলালে পুরনো টোকেন বাদ যায়; sandbox মোডে sandbox সার্ভার", async () => {
    const a = await setup(PATHAO);
    await a.get("/admin/orders/courier-locations?courier=pathao&type=cities");
    expect((await DB.prepare("SELECT value FROM settings WHERE key='pathao_token'").first<any>()).value).toBe("PTOKEN");
    reply = (c) => {
      if (new URL(c.url).hostname !== "courier-api-sandbox.pathao.com") return undefined;
      if (c.url.endsWith("/issue-token")) return json({ access_token: "SANDBOX", expires_in: 100 });
      return json({ data: { data: [] } });
    };
    await a.post("/admin/courier", { ...PATHAO, pathao_client_secret: "", pathao_password: "", pathao_sandbox: "1" });
    expect((await DB.prepare("SELECT value FROM settings WHERE key='pathao_token'").first<any>()).value).toBe("");
    await a.get("/admin/orders/courier-locations?courier=pathao&type=cities");
    expect(calls.at(-2)!.url).toBe("https://courier-api-sandbox.pathao.com/aladdin/api/v1/issue-token");
  });
});

describe("RedX", () => {
  it("এলাকা ড্রপডাউন, এলাকা ছাড়া পাঠানো যায় না, বুক হলে শিপড", async () => {
    const a = await setup(REDX);
    const areas = await (await a.get("/admin/orders/courier-locations?courier=redx")).json<any>();
    expect(areas.items[0]).toEqual({ id: 1, name: "Mirpur DOHS (Dhaka)" });
    expect(calls[0]!.headers["api-access-token"]).toBe("Bearer RXTOKEN");
    const id = await confirmedOrder(a);
    await a.post(`/admin/orders/${id}/courier`, { courier: "redx" });
    expect(sends().length).toBe(0);
    expect((await order(id)).status).toBe("confirmed");
    await a.post(`/admin/orders/${id}/courier`, { courier: "redx", redx_area_id: 1, redx_area_name: "Mirpur DOHS (Dhaka)" });
    const sent = sends()[0]!;
    expect(sent.url).toBe("https://openapi.redx.com.bd/v1.0.0-beta/parcel");
    expect(sent.body).toMatchObject({ delivery_area_id: 1, delivery_area: "Mirpur DOHS (Dhaka)", pickup_store_id: 55, customer_phone: "01712345678" });
    expect(await order(id)).toMatchObject({ status: "shipped", courier: "redx", tracking_code: "21A427TU4BN3R" });
    await a.post(`/admin/orders/${id}/courier/status`, {});
    expect((await order(id)).courier_status).toBe("delivery-in-progress");
  });

  it("RedX বাল্কে পাঠানো যায় না", async () => {
    const a = await setup(REDX);
    const id = await confirmedOrder(a);
    await a.post("/admin/orders/bulk-courier", { courier: "redx", ids: id });
    expect(sends().length).toBe(0);
  });
});
