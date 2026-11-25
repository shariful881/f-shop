import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, createShop, DEMO_SHOP_ID, resetDb } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { clearSettingsCache } from "../src/platform/billing";
import { clearShopCache } from "../src/platform/resolve";
import { hoursText, withinHours } from "../src/platform/support";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;

async function agent(email = "sup@t.com", role = "support") {
  await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES (?, ?, ?, ?, 1)")
    .bind(email, email.split("@")[0], role, await hashPassword("teampass123", 1000)).run();
  const b = new Browser();
  expect((await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email, password: "teampass123" }) } as RequestInit)).status).toBe(303);
  return b;
}
const sget = (b: Browser, path: string) => b.fetch(path, { base: P } as RequestInit);
const spost = (b: Browser, path: string, data: Record<string, string> = {}) => b.fetch(path, { method: "POST", base: P, body: new URLSearchParams(data) } as RequestInit);
const ticket = (id: number) => pdb().prepare("SELECT * FROM support_tickets WHERE id = ?").bind(id).first<Record<string, any>>();
const msgs = (id: number) => pdb().prepare("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY id").bind(id).all<Record<string, any>>().then((r) => r.results);

async function newTicket(a: Browser, data: Record<string, string> = {}) {
  const fd = new FormData();
  const v = { category: "courier", priority: "high", subject: "পার্সেল যাচ্ছে না", body: "Steadfast-এ পাঠাতে গেলে এরর দেখায়, অর্ডার #১২", ...data };
  for (const [k, x] of Object.entries(v)) fd.append(k, x);
  const r = await a.fetch("/admin/support/new", { method: "POST", body: fd });
  expect(r.status).toBe(303);
  return Number(/\/admin\/support\/(\d+)/.exec(r.headers.get("location") || "")![1]);
}

beforeEach(async () => {
  await resetDb();
  await pdb().batch([
    pdb().prepare("DELETE FROM support_messages"), pdb().prepare("DELETE FROM support_tickets"), pdb().prepare("DELETE FROM super_admins"),
    pdb().prepare("UPDATE platform_settings SET value = '00:00' WHERE key IN ('support_hours_start', 'support_hours_end')"),
    pdb().prepare("UPDATE platform_settings SET value = '' WHERE key IN ('telegram_bot_token', 'telegram_chat_id')"),
  ]);
  clearShopCache();
  clearSettingsCache();
});

describe("অফিস সময়", () => {
  it("ঢাকার সময় ধরে হিসাব, রাত পার হওয়া সময়ও", () => {
    const s = { support_hours_start: "10:00", support_hours_end: "22:00" };
    expect(withinHours(s, new Date("2026-01-01T05:00:00Z"))).toBe(true); // ঢাকা ১১টা
    expect(withinHours(s, new Date("2026-01-01T17:00:00Z"))).toBe(false); // ঢাকা রাত ১১টা
    expect(withinHours({ support_hours_start: "20:00", support_hours_end: "02:00" }, new Date("2026-01-01T19:00:00Z"))).toBe(true); // রাত ১টা
    expect(withinHours({ support_hours_start: "00:00", support_hours_end: "00:00" })).toBe(true);
    expect(hoursText(s)).toBe("সকাল ১০টা থেকে রাত ১০টা");
    expect(hoursText({ support_hours_start: "09:30", support_hours_end: "18:00" })).toBe("সকাল ৯:৩০টা থেকে বিকাল ৬টা");
  });
});

describe("দোকানদার → টিকেট", () => {
  it("টিকেট জমা, তালিকায় দেখায়, টিমের ইনবক্সে না-পড়া হিসেবে আসে", async () => {
    const a = await adminBrowser();
    const id = await newTicket(a);
    const t = (await ticket(id))!;
    expect(t.shop_id).toBe(DEMO_SHOP_ID);
    expect(t.status).toBe("open");
    expect(t.priority).toBe("high");
    expect(t.team_unread).toBe(1);
    const page = await (await a.fetch(`/admin/support/${id}`)).text();
    expect(page).toContain("পার্সেল যাচ্ছে না");
    expect(page).toContain("Steadfast-এ পাঠাতে গেলে");
    // টিম অফলাইন → অটো-উত্তর
    expect((await msgs(id)).some((m) => m.sender === "system")).toBe(true);
    expect(await (await a.fetch("/admin/support")).text()).toContain("পার্সেল যাচ্ছে না");

    const s = await agent();
    const inbox = await (await sget(s, "/super/support/tickets")).text();
    expect(inbox).toContain("পার্সেল যাচ্ছে না");
    expect(inbox).toContain("কেউ নেয়নি");
    expect(inbox).toContain("উত্তরের অপেক্ষায় — সিরিয়াল");
  });

  it("খালি বা খুব ছোট টিকেট নেয় না, ভুল ফাইল নেয় না", async () => {
    const a = await adminBrowser();
    const fd = new FormData();
    fd.append("subject", "ab"); fd.append("body", "ছোট");
    expect((await a.fetch("/admin/support/new", { method: "POST", body: fd })).status).toBe(422);
    const fd2 = new FormData();
    fd2.append("subject", "সমস্যা আছে"); fd2.append("body", "বিস্তারিত সমস্যা লিখলাম এখানে");
    fd2.append("attachment", new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    const r = await a.fetch("/admin/support/new", { method: "POST", body: fd2 });
    expect(r.status).toBe(422);
    expect(await r.text()).toContain("JPG, PNG বা WebP");
    expect((await pdb().prepare("SELECT COUNT(*) n FROM support_tickets").first<{ n: number }>())!.n).toBe(0);
  });

  it("স্ক্রিনশট দোকানের স্টোরে সেভ হয়, পূর্ণ লিংক মেসেজে থাকে", async () => {
    const a = await adminBrowser();
    const fd = new FormData();
    fd.append("subject", "ছবি দেখুন"); fd.append("body", "স্ক্রিনশট দিলাম, দেখুন সমস্যাটা");
    fd.append("attachment", new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
    const r = await a.fetch("/admin/support/new", { method: "POST", body: fd });
    const id = Number(/(\d+)$/.exec(r.headers.get("location")!)![1]);
    const m = (await msgs(id))[0]!;
    expect(m.attachment).toMatch(/^https:\/\/shop\.test\/img\/support\/[0-9a-f-]+\.jpg$/);
    const img = await new Browser().fetch(new URL(m.attachment).pathname);
    expect(img.status).toBe(200);
  });

  it("অন্য দোকানের টিকেট দেখা যায় না", async () => {
    await createShop("00000000-0000-4000-8000-000000000002", "other");
    const other = await pdb().prepare(
      "INSERT INTO support_tickets (shop_id, subject) VALUES ('00000000-0000-4000-8000-000000000002', 'গোপন') RETURNING id",
    ).first<{ id: number }>();
    const a = await adminBrowser();
    expect((await a.fetch(`/admin/support/${other!.id}`)).status).toBe(303);
    expect((await a.fetch(`/admin/support/${other!.id}/messages`)).status).toBe(404);
    expect(await (await a.fetch("/admin/support")).text()).not.toContain("গোপন");
  });
});

describe("টিমের উত্তর, নোট, অবস্থা", () => {
  it("উত্তরে দোকানের অপেক্ষায় যায়, প্রথম উত্তরের সময় আর দায়িত্ব সেভ হয়; দোকান উত্তর দিলে আবার খোলে", async () => {
    const a = await adminBrowser();
    const id = await newTicket(a);
    const s = await agent();
    expect((await spost(s, `/super/support/${id}/reply`, { body: "API key আবার দিন", internal: "0", next_status: "pending" })).status).toBe(303);
    let t = (await ticket(id))!;
    expect(t.status).toBe("pending");
    expect(t.first_response_at).toBeTruthy();
    expect(t.assigned_to).toBeTruthy();
    expect(t.shop_unread).toBe(1);
    expect(t.team_unread).toBe(0);

    const chat = await (await a.fetch("/admin/support/chat")).json<any>();
    expect(chat.unread).toBe(1);

    const fd = new FormData(); fd.append("body", "দিলাম, এখনো হচ্ছে না");
    const r = await a.fetch(`/admin/support/${id}/reply`, { method: "POST", body: fd, headers: { "x-sx-ajax": "1" } });
    expect((await r.json<any>()).message.body).toBe("দিলাম, এখনো হচ্ছে না");
    t = (await ticket(id))!;
    expect(t.status).toBe("open");
    expect(t.team_unread).toBe(1);
  });

  it("ভিতরের নোট দোকান দেখে না", async () => {
    const a = await adminBrowser();
    const id = await newTicket(a);
    const s = await agent();
    await spost(s, `/super/support/${id}/reply`, { body: "গোপন নোট: এদের কুরিয়ার কী ভুল", internal: "1" });
    expect((await ticket(id))!.status).toBe("open"); // নোটে অবস্থা বদলায় না
    expect(await (await a.fetch(`/admin/support/${id}`)).text()).not.toContain("গোপন নোট");
    const poll = await (await a.fetch(`/admin/support/${id}/messages`)).json<any>();
    expect(poll.messages.some((m: any) => m.internal)).toBe(false);
    expect(await (await sget(s, `/super/support/${id}`)).text()).toContain("গোপন নোট");
  });

  it("সমাধান → দোকানদার রেটিং দেয়, CSAT হিসাবে আসে", async () => {
    const a = await adminBrowser();
    const id = await newTicket(a);
    const s = await agent();
    await spost(s, `/super/support/${id}/update`, { status: "resolved" });
    expect((await ticket(id))!.status).toBe("resolved");
    const page = await (await a.fetch(`/admin/support/${id}`)).text();
    expect(page).toContain("সমাধান হিসেবে চিহ্নিত");
    expect(page).toContain("সাপোর্ট কেমন ছিল");
    await a.post(`/admin/support/${id}/rate`, { rating: "5", comment: "দারুণ" });
    expect((await ticket(id))!.rating).toBe(5);
    await a.post(`/admin/support/${id}/rate`, { rating: "1" }); // দ্বিতীয়বার বদলানো যায় না
    expect((await ticket(id))!.rating).toBe(5);
    expect(await (await sget(s, "/super/support/tickets?view=resolved")).text()).toContain("পার্সেল যাচ্ছে না");
    expect(await (await sget(s, `/super/support/shop/${(await ticket(id))!.shop_id}`)).text()).toContain("৫.০ ★");
  });
});

describe("লাইভ চ্যাট", () => {
  it("প্রথম মেসেজে চ্যাট কথোপকথন খোলে, পরেরগুলো একই চ্যাটে যায়", async () => {
    const a = await adminBrowser();
    const send = (body: string) => a.fetch("/admin/support/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) }).then((r) => r.json<any>());
    const one = await send("হ্যালো, একটু সাহায্য দরকার");
    const two = await send("ডোমেইন কীভাবে যোগ করব?");
    expect(one.ticketId).toBe(two.ticketId);
    const t = (await ticket(one.ticketId))!;
    expect(t.channel).toBe("chat");
    expect(t.team_unread).toBe(2);
    const state = await (await a.fetch("/admin/support/chat")).json<any>();
    expect(state.ticketId).toBe(one.ticketId);
    expect(state.online).toBe(false);
    expect(state.messages.map((m: any) => m.body)).toContain("ডোমেইন কীভাবে যোগ করব?");
    // টিম উত্তর দিলে পোলিংয়ে আসে
    const s = await agent();
    const r = await s.fetch(`/super/support/${one.ticketId}/reply`, { method: "POST", base: P, body: new URLSearchParams({ body: "সেটিংস → ডোমেইন", internal: "0", next_status: "pending" }), headers: { "x-sx-ajax": "1" } } as RequestInit);
    expect(r.status).toBe(200);
    const poll = await (await a.fetch(`/admin/support/${one.ticketId}/messages?after=${two.message.id}`)).json<any>();
    expect(poll.messages.at(-1).body).toBe("সেটিংস → ডোমেইন");
  });

  it("খালি মেসেজ নেয় না", async () => {
    const a = await adminBrowser();
    const r = await a.fetch("/admin/support/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "  " }) });
    expect(r.status).toBe(400);
  });

  it("সব অ্যাডমিন পেজে চ্যাট উইজেট আর সাপোর্ট মেনু থাকে", async () => {
    const a = await adminBrowser();
    const html = await (await a.fetch("/admin")).text();
    expect(html).toContain('id="sx-widget"');
    expect(html).toContain("/js/support.js");
    expect(html).toContain('href="/admin/support"');
  });
});

describe("সুপার অ্যাডমিন: অনুমতি, তৈরি উত্তর, সেটিংস", () => {
  it("ফাইন্যান্স রোল সাপোর্ট দেখতে পারে না; সাপোর্ট রোল সেটিংস বদলাতে পারে না", async () => {
    const f = await agent("fin@t.com", "finance");
    expect((await sget(f, "/super/support")).status).toBe(403);
    const s = await agent();
    expect((await sget(s, "/super/support")).status).toBe(200);
    expect((await sget(s, "/super/support/settings")).status).toBe(403);
  });

  it("তৈরি উত্তর যোগ/মুছা; উত্তরের পাতায় বাছাই করা যায়", async () => {
    const a = await adminBrowser();
    const id = await newTicket(a);
    const s = await agent();
    await spost(s, "/super/support/canned", { title: "টেস্ট উত্তর", body: "এটা তৈরি উত্তর", sort_order: "0" });
    const row = await pdb().prepare("SELECT id FROM canned_replies WHERE title = 'টেস্ট উত্তর'").first<{ id: number }>();
    expect(row).toBeTruthy();
    expect(await (await sget(s, `/super/support/${id}`)).text()).toContain("টেস্ট উত্তর");
    await spost(s, `/super/support/canned/${row!.id}/delete`);
    expect(await pdb().prepare("SELECT id FROM canned_replies WHERE id = ?").bind(row!.id).first()).toBeNull();
  });

  it("সেটিংস: সময় সেভ, ভুল টোকেন নেয় না, টোকেন পেজে পুরো দেখায় না", async () => {
    const o = await agent("own@t.com", "owner");
    await spost(o, "/super/support/settings", { support_hours_start: "09:30", support_hours_end: "21:00", telegram_bot_token: "bad", telegram_chat_id: "-100123" });
    clearSettingsCache();
    let s = Object.fromEntries((await pdb().prepare("SELECT key, value FROM platform_settings").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
    expect(s.support_hours_start).not.toBe("09:30"); // ভুল টোকেনে কিছুই সেভ হয়নি
    const tok = "123456789:AAH-abcdefghijklmnopqrstuvwxyz1234";
    await spost(o, "/super/support/settings", { support_hours_start: "09:30", support_hours_end: "21:00", telegram_bot_token: tok, telegram_chat_id: "-100123" });
    s = Object.fromEntries((await pdb().prepare("SELECT key, value FROM platform_settings").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
    expect(s.support_hours_start).toBe("09:30");
    expect(s.telegram_bot_token).toBe(tok);
    const page = await (await sget(o, "/super/support/settings")).text();
    expect(page).not.toContain(tok);
    expect(page).toContain("…1234");
  });

  it("দায়িত্ব দেওয়া, গুরুত্ব বদল — টিমের লগে থাকে, দোকান দেখে না", async () => {
    const a = await adminBrowser();
    const id = await newTicket(a);
    const s = await agent();
    const meId = (await pdb().prepare("SELECT id FROM super_admins WHERE email = 'sup@t.com'").first<{ id: number }>())!.id;
    await spost(s, `/super/support/${id}/update`, { assigned_to: String(meId), priority: "urgent" });
    const t = (await ticket(id))!;
    expect(t.assigned_to).toBe(meId);
    expect(t.priority).toBe("urgent");
    expect(await (await sget(s, "/super/support/tickets?view=mine")).text()).toContain("পার্সেল যাচ্ছে না");
    expect(await (await a.fetch(`/admin/support/${id}`)).text()).not.toContain("দায়িত্বে:");
  });
});

describe("রিয়েল-টাইম (WebSocket)", () => {
  it("দোকানদার সংযুক্ত হলে hello পায়, টিমের উত্তর সাথে সাথে আসে; লগইন ছাড়া সংযোগ হয় না", async () => {
    const a = await adminBrowser();
    const id = await newTicket(a);
    const res = await a.fetch("/admin/support/ws", { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    const got: any[] = [];
    ws.addEventListener("message", (e) => { got.push(JSON.parse(e.data as string)); });
    ws.accept();
    const wait = async (fn: () => boolean) => { for (let i = 0; i < 50 && !fn(); i++) await new Promise((r) => setTimeout(r, 20)); };
    await wait(() => got.some((x) => x.type === "hello"));
    expect(got.find((x) => x.type === "hello").agentsOnline).toBe(0);

    const s = await agent();
    const sres = await s.fetch("/super/support/ws", { base: P, headers: { Upgrade: "websocket" } } as RequestInit);
    expect(sres.status).toBe(101);
    sres.webSocket!.accept();
    await wait(() => got.some((x) => x.type === "presence"));
    expect(got.find((x) => x.type === "presence").agentsOnline).toBe(1);

    await spost(s, `/super/support/${id}/reply`, { body: "লাইভ উত্তর", internal: "0", next_status: "pending" });
    await spost(s, `/super/support/${id}/reply`, { body: "গোপন", internal: "1" });
    await wait(() => got.some((x) => x.type === "message"));
    const ms = got.filter((x) => x.type === "message").map((x) => x.message.body);
    expect(ms).toContain("লাইভ উত্তর");
    expect(ms).not.toContain("গোপন");
    ws.close(); sres.webSocket!.close();

    const anon = await new Browser().fetch("/admin/support/ws", { headers: { Upgrade: "websocket" } });
    expect(anon.status).not.toBe(101);
  });
});

describe("উইজেটের দুই ভাগ", () => {
  it("উইজেট থেকে টিকেট (ajax) জমা হয়, টিকেটের তালিকায় শুধু টিকেট — চ্যাট নয়", async () => {
    const a = await adminBrowser();
    const html = await (await a.fetch("/admin")).text();
    expect(html).toContain('data-sx-tab="chat"');
    expect(html).toContain('data-sx-tab="ticket"');

    const bad = new FormData(); bad.append("subject", "x"); bad.append("body", "y");
    const r0 = await a.fetch("/admin/support/new", { method: "POST", body: bad, headers: { "x-sx-ajax": "1" } });
    expect(r0.status).toBe(422);
    expect((await r0.json<any>()).error).toContain("বিষয়");

    const fd = new FormData(); fd.append("subject", "পেমেন্ট আটকে আছে"); fd.append("body", "রিচার্জ করেছি কিন্তু ব্যালেন্সে আসেনি");
    const r = await a.fetch("/admin/support/new", { method: "POST", body: fd, headers: { "x-sx-ajax": "1" } });
    const j = await r.json<any>();
    expect(j.url).toBe(`/admin/support/${j.id}`);
    await a.fetch("/admin/support/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "চ্যাটের মেসেজ" }) });

    const list = await (await a.fetch("/admin/support/tickets.json")).json<any>();
    expect(list.tickets.map((t: any) => t.subject)).toEqual(["পেমেন্ট আটকে আছে"]);
    expect(list.tickets[0].status_label).toBe("উত্তরের অপেক্ষায়");

    const s = await agent();
    const chats = await (await sget(s, "/super/support")).text();
    expect(chats).toContain("চ্যাটের মেসেজ");
    expect(chats).not.toContain("পেমেন্ট আটকে আছে");
  });
});
