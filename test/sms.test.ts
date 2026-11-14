import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb, setStatus } from "./helpers";
import { renderTemplate, to880 } from "../src/shop/lib/sms";

type Call = { url: string; method: string; body: string | null; headers: Record<string, string> };
let calls: Call[] = [];
let reply: (c: Call) => Response | undefined;
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });

function defaultReply(c: Call): Response {
  const u = new URL(c.url);
  if (u.hostname === "bulksmsbd.net") return json({ response_code: 202, message_id: 1, success_message: "SMS Submitted Successfully" });
  if (u.hostname === "api.sms.net.bd") return json({ error: 0, msg: "Request successfully submitted", data: { request_id: 1 } });
  if (u.hostname === "portal.packzy.com") return json({ status: 200, consignment: { consignment_id: 77, tracking_code: "TRK77", status: "in_review" } });
  if (u.hostname === "gw.example.com") return new Response("OK: queued");
  return json({}, 404);
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
    const c: Call = { url, method: init?.method ?? "GET", body: init?.body ? String(init.body) : null, headers };
    calls.push(c);
    return reply(c) ?? defaultReply(c);
  });
});
afterEach(async () => {
  await settle();
  vi.restoreAllMocks();
});

const settle = () => new Promise((r) => setTimeout(r, 80));
const smsCalls = () => calls.filter((c) => !c.url.includes("packzy"));
const BULK = { sms_enabled: "1", sms_provider: "bulksmsbd", sms_api_key: "BKEY", sms_sender_id: "8809617", sms_on_confirm: "1", sms_on_shipped: "1",
  sms_tpl_confirmed: "প্রিয় {নাম}, অর্ডার {অর্ডার} কনফার্ম। মোট {টাকা} টাকা - {দোকান}", sms_tpl_shipped: "{অর্ডার} {কুরিয়ার}-এ গেছে, ট্র্যাকিং {ট্র্যাকিং}" };

async function newOrder(phone = "01712345678") {
  await new Browser().order({ phone });
  return (await lastOrder())!.id as number;
}
const logs = () => DB.prepare("SELECT * FROM sms_logs ORDER BY id").all<any>().then((r) => r.results);

describe("SMS টেমপ্লেট", () => {
  it("তথ্য বসে, অচেনা {} যেমন ছিল থাকে; নম্বর 880 দিয়ে", () => {
    const t = renderTemplate("{নাম} {অর্ডার} {টাকা} {দোকান} {কুরিয়ার} {ট্র্যাকিং} {অজানা}", { site_name: "দোকান" },
      { name: "রহিম", order_no: "FS-1", total: 1320, courier: "steadfast", tracking_code: "T1", consignment_id: "C1" });
    expect(t).toBe("রহিম FS-1 1320 দোকান Steadfast T1 {অজানা}");
    expect(to880("01712345678")).toBe("8801712345678");
  });
});

describe("SMS সেটিংস", () => {
  it("শুধু মালিক; API key পেজে দেখায় না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/sms", BULK);
    const page = await (await a.get("/admin/sms")).text();
    expect(page).not.toContain("BKEY");
    expect(page).toContain("সেভ করা আছে");
    await a.post("/admin/staff", { name: "ম্যানেজার", email: "m@s.test", password: "staffpass1", role: "manager" });
    const m = new Browser();
    await m.post("/admin/login", { email: "m@s.test", password: "staffpass1" });
    expect((await m.get("/admin/sms")).status).toBe(403);
  });

  it("টেস্ট SMS", async () => {
    const a = await adminBrowser();
    await a.post("/admin/sms", BULK);
    await a.post("/admin/sms/test", { phone: "01812345678" });
    const u = new URL(smsCalls()[0]!.url);
    expect(u.searchParams.get("number")).toBe("8801812345678");
    expect(u.searchParams.get("api_key")).toBe("BKEY");
    expect(u.searchParams.get("senderid")).toBe("8809617");
    expect((await logs())[0]).toMatchObject({ event: "test", status: "sent" });
  });
});

describe("অর্ডারে SMS", () => {
  it("কনফার্ম হলে টেমপ্লেট অনুযায়ী SMS যায়, একবারই", async () => {
    const a = await adminBrowser();
    await a.post("/admin/sms", BULK);
    const id = await newOrder();
    expect(smsCalls().length).toBe(0); // নতুন অর্ডারে SMS নয়
    await setStatus(a, id, "confirmed");
    await settle();
    const o = (await lastOrder())!;
    const msg = new URL(smsCalls()[0]!.url).searchParams.get("message");
    expect(msg).toBe(`প্রিয় রহিম উদ্দিন, অর্ডার ${o.order_no} কনফার্ম। মোট 1320 টাকা - আমার দোকান`);
    expect((await logs())[0]).toMatchObject({ order_id: id, event: "confirmed", status: "sent", phone: "01712345678" });
    // সফল SMS "আবার পাঠান" দিয়ে দ্বিতীয়বার যায় না
    await a.post(`/admin/orders/sms/${(await logs())[0].id}/resend`, {});
    expect(smsCalls().length).toBe(1);
  });

  it("কুরিয়ারে পাঠালে ট্র্যাকিংসহ SMS", async () => {
    const a = await adminBrowser();
    await a.post("/admin/sms", BULK);
    await a.post("/admin/courier", { steadfast_api_key: "k", steadfast_secret_key: "s" });
    const id = await newOrder();
    await setStatus(a, id, "confirmed");
    await a.post(`/admin/orders/${id}/courier`, { courier: "steadfast" });
    await settle();
    const o = (await lastOrder())!;
    const last = new URL(smsCalls().at(-1)!.url).searchParams.get("message");
    expect(last).toBe(`${o.order_no} Steadfast-এ গেছে, ট্র্যাকিং TRK77`);
    expect((await logs()).map((l: any) => l.event)).toEqual(["confirmed", "shipped"]);
    const detail = await (await a.get(`/admin/orders/${id}`)).text();
    expect(detail).toContain("ট্র্যাকিং TRK77");
  });

  it("SMS বন্ধ থাকলে বা ঘটনা বন্ধ থাকলে যায় না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/sms", { ...BULK, sms_enabled: "" });
    const id = await newOrder();
    await setStatus(a, id, "confirmed");
    await settle();
    expect(smsCalls().length).toBe(0);
    await a.post("/admin/sms", { ...BULK, sms_api_key: "", sms_on_shipped: "" });
    await setStatus(a, id, "shipped");
    await settle();
    expect(smsCalls().length).toBe(0);
  });

  it("গেটওয়ে ব্যর্থ হলে লগে কারণ, 'আবার পাঠান' কাজ করে", async () => {
    const a = await adminBrowser();
    await a.post("/admin/sms", BULK);
    reply = (c) => (c.url.includes("bulksmsbd") ? json({ response_code: 1007, error_message: "Balance Insufficient" }) : undefined);
    const id = await newOrder();
    await setStatus(a, id, "confirmed");
    await settle();
    const [log] = await logs();
    expect(log).toMatchObject({ status: "failed" });
    expect(log.response).toContain("Balance Insufficient");
    expect(await (await a.get(`/admin/orders/${id}`)).text()).toContain("আবার পাঠান");
    reply = () => undefined;
    await a.post(`/admin/orders/sms/${log.id}/resend`, {});
    expect((await logs())[0].status).toBe("sent");
    expect(smsCalls().length).toBe(2);
  });

  it("SMS.net.bd গেটওয়ে", async () => {
    const a = await adminBrowser();
    await a.post("/admin/sms", { ...BULK, sms_provider: "smsnetbd", sms_sender_id: "" });
    const id = await newOrder();
    await setStatus(a, id, "confirmed");
    await settle();
    const c = smsCalls()[0]!;
    expect(c.url).toBe("https://api.sms.net.bd/sendsms");
    const body = new URLSearchParams(c.body!);
    expect(body.get("api_key")).toBe("BKEY");
    expect(body.get("to")).toBe("8801712345678");
    expect((await logs())[0].status).toBe("sent");
  });

  it("নিজের URL টেমপ্লেট — GET আর JSON POST", async () => {
    const a = await adminBrowser();
    await a.post("/admin/sms", { ...BULK, sms_provider: "custom", sms_custom_url: "https://gw.example.com/send?key=K1&to={number}&text={message}", sms_custom_success: "OK" });
    const id = await newOrder();
    await setStatus(a, id, "confirmed");
    await settle();
    const u = new URL(smsCalls()[0]!.url);
    expect(u.searchParams.get("to")).toBe("8801712345678");
    expect(u.searchParams.get("text")).toContain("কনফার্ম");
    expect((await logs())[0].status).toBe("sent");

    await a.post("/admin/sms", { ...BULK, sms_provider: "custom", sms_custom_url: "https://gw.example.com/api", sms_custom_method: "POST",
      sms_custom_body: '{"to":"{number}","msg":"{message}"}', sms_custom_success: "nope" });
    await a.post("/admin/sms/test", { phone: "01812345678" });
    const c = smsCalls().at(-1)!;
    expect(c.method).toBe("POST");
    expect(c.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(c.body!)).toMatchObject({ to: "8801812345678" });
    expect((await logs()).at(-1).status).toBe("failed"); // সফলতার লেখা মেলেনি
  });
});
