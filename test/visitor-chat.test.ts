/**
 * sellxbd.com-এর ভিজিটর লাইভ চ্যাট — ভিজিটর মেসেজ দেয়, টিম /super/visitors থেকে উত্তর দেয়
 */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Browser } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { clearSettingsCache } from "../src/platform/billing";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;
let ipN = 1;
const freshIp = () => `172.31.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const post = (b: Browser, path: string, body: unknown, headers: Record<string, string> = {}) =>
  b.fetch(path, { method: "POST", base: P, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) } as RequestInit);
const get = (b: Browser, path: string) => b.fetch(path, { base: P } as RequestInit);

async function superB() {
  await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES ('o@t.com', 'রাশেদ', 'owner', ?, 1)")
    .bind(await hashPassword("teampass123", 1000)).run();
  const b = new Browser(freshIp());
  await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "o@t.com", password: "teampass123" }) } as RequestInit);
  return b;
}

beforeEach(async () => {
  await pdb().prepare("DELETE FROM visitor_chats").run();
  await pdb().prepare("DELETE FROM platform_settings WHERE key = 'visitor_chat'").run();
  clearSettingsCache();
});

describe("ভিজিটর চ্যাট", () => {
  it("পাবলিক পেজে চ্যাট বাটনের স্ক্রিপ্ট আছে, সুপার অ্যাডমিনে নেই", async () => {
    const html = await (await get(new Browser(freshIp()), "/")).text();
    expect(html).toContain("/js/chat.js");
    const s = await superB();
    expect(await (await get(s, "/super")).text()).not.toContain("/js/chat.js");
  });

  it("ভিজিটর মেসেজ দেয় → টিম দেখে ও উত্তর দেয় → ভিজিটর উত্তর পায়", async () => {
    const v = new Browser(freshIp());
    const st0 = await (await get(v, "/chat/state")).json() as any;
    expect(st0).toMatchObject({ enabled: true, chat: null });

    const r = await post(v, "/chat/start", { name: "করিম", phone: "01712345678", body: "দাম কত?", page: "/pricing" });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("sx_vc_on=1");
    const st = await (await get(v, "/chat/state")).json() as any;
    expect(st.chat).toMatchObject({ name: "করিম", status: "open" });
    expect(st.messages.map((m: any) => m.body)).toContain("দাম কত?");

    const row = (await pdb().prepare("SELECT * FROM visitor_chats").first<any>())!;
    expect(row).toMatchObject({ name: "করিম", phone: "01712345678", page: "/pricing", team_unread: 1, last_sender: "visitor" });

    const s = await superB();
    const inbox = await (await get(s, "/super/visitors")).text();
    expect(inbox).toContain("করিম");
    expect(inbox).toContain("দাম কত?");
    expect(await (await get(s, "/super/support")).text()).toContain("সাইটের ভিজিটর");
    const pulse = await (await get(s, "/super/support/pulse")).json() as any;
    expect(pulse.vopen).toBe(1);

    const page = await (await get(s, `/super/visitors/${row.id}`)).text();
    expect(page).toContain("দাম কত?");
    expect(page).toContain("wa.me/8801712345678");
    const rep = await s.fetch(`/super/visitors/${row.id}/reply`, { method: "POST", base: P, headers: { "x-sx-ajax": "1" }, body: new URLSearchParams({ body: "ফ্রি থেকে শুরু, ৳৪৪৯ মাসে" }) } as RequestInit);
    expect(rep.status).toBe(200);

    expect(((await (await get(v, "/chat/unread")).json()) as any).unread).toBe(1);
    const msgs = await (await get(v, "/chat/messages?after=0")).json() as any;
    const team = msgs.messages.find((m: any) => m.sender === "team");
    expect(team).toMatchObject({ body: "ফ্রি থেকে শুরু, ৳৪৪৯ মাসে", author: "রাশেদ" });
    expect(((await (await get(v, "/chat/unread")).json()) as any).unread).toBe(0);

    // ভিজিটর আবার লেখে
    const sent = await post(v, "/chat/send", { body: "ধন্যবাদ" });
    expect(sent.status).toBe(200);
    const after = (await pdb().prepare("SELECT last_sender, assigned_to, first_response_at FROM visitor_chats WHERE id = ?").bind(row.id).first<any>())!;
    expect(after.last_sender).toBe("visitor");
    expect(after.first_response_at).toBeTruthy();

    // শেষ করা
    await s.fetch(`/super/visitors/${row.id}/status`, { method: "POST", base: P, body: new URLSearchParams({ status: "closed" }) } as RequestInit);
    expect((await pdb().prepare("SELECT status FROM visitor_chats WHERE id = ?").bind(row.id).first<any>())!.status).toBe("closed");
    expect(await (await get(s, "/super/visitors?view=closed")).text()).toContain("করিম");
  });

  it("অন্য ভিজিটরের চ্যাট দেখা যায় না; কুকি ছাড়া পাঠানো যায় না", async () => {
    const a = new Browser(freshIp());
    await post(a, "/chat/start", { name: "ক", body: "গোপন কথা" });
    const b = new Browser(freshIp());
    const st = await (await get(b, "/chat/state")).json() as any;
    expect(st.chat).toBeNull();
    expect(JSON.stringify(await (await get(b, "/chat/messages?after=0")).json())).not.toContain("গোপন");
    expect((await post(b, "/chat/send", { body: "হাই" })).status).toBe(404);
  });

  it("যাচাই: নাম/মেসেজ লাগে, ভুল নম্বর, বটের ফাঁদ, অন্য সাইট থেকে আটকায়", async () => {
    const v = new Browser(freshIp());
    expect((await post(v, "/chat/start", { name: "", body: "x" })).status).toBe(400);
    expect((await post(v, "/chat/start", { name: "ক", body: "" })).status).toBe(400);
    expect((await post(v, "/chat/start", { name: "ক", phone: "12345", body: "x" })).status).toBe(400);
    expect((await post(v, "/chat/start", { name: "ক", body: "x", website: "spam.com" })).status).toBe(400);
    expect((await post(v, "/chat/start", { name: "ক", body: "x" }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await pdb().prepare("SELECT COUNT(*) n FROM visitor_chats").first<any>())!.n).toBe(0);
  });

  it("একই জায়গা থেকে ঘণ্টায় ৫টার বেশি নতুন চ্যাট নয়", async () => {
    const ip = freshIp();
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await post(new Browser(ip), "/chat/start", { name: "ক", body: `m${i}` })).status;
    expect(last).toBe(429);
  });

  it("সেটিংসে বন্ধ করলে চ্যাট চলে না", async () => {
    await pdb().prepare("INSERT INTO platform_settings (key, value) VALUES ('visitor_chat', '0')").run();
    clearSettingsCache();
    const v = new Browser(freshIp());
    expect(await (await get(v, "/chat/state")).json()).toEqual({ enabled: false });
    expect((await post(v, "/chat/start", { name: "ক", body: "x" })).status).toBe(403);
  });
});
