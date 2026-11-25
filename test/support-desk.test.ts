/** সাপোর্ট ডেস্ক: সিরিয়াল কিউ, লেবেল, দোকান আর ফোন-নম্বরের প্রোফাইল, নোট/ফলো-আপ */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Browser, DEMO_SHOP_ID, resetDb } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { clearShopCache } from "../src/platform/resolve";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;
async function agent() {
  await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES ('sup@t.com', 'সাপোর্ট', 'support', ?, 1)").bind(await hashPassword("teampass123", 1000)).run();
  const b = new Browser();
  await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email: "sup@t.com", password: "teampass123" }) } as RequestInit);
  return b;
}
const get = async (b: Browser, p: string) => (await b.fetch(p, { base: P } as RequestInit)).text();
const post = (b: Browser, p: string, d: Record<string, string>) => b.fetch(p, { method: "POST", base: P, body: new URLSearchParams(d) } as RequestInit);

async function chat(shopId: string, body: string, minsAgo: number, channel = "chat", subject = "চ্যাট") {
  const t = (await pdb().prepare(`INSERT INTO support_tickets (shop_id, channel, subject, last_sender, last_preview, team_unread, created_at, last_message_at)
    VALUES (?, ?, ?, 'shop', ?, 1, datetime('now', ?), datetime('now', ?)) RETURNING id`).bind(shopId, channel, subject, body, `-${minsAgo} minutes`, `-${minsAgo} minutes`).first<{ id: number }>())!;
  await pdb().prepare("INSERT INTO support_messages (ticket_id, sender, author, body, created_at) VALUES (?, 'shop', 'মালিক', ?, datetime('now', ?))").bind(t.id, body, `-${minsAgo} minutes`).run();
  return t.id;
}
async function visitor(name: string, phone: string, body: string, minsAgo: number) {
  const v = (await pdb().prepare(`INSERT INTO visitor_chats (token_hash, name, phone, page, last_sender, last_preview, team_unread, created_at, last_message_at)
    VALUES (?, ?, ?, '/pricing', 'visitor', ?, 1, datetime('now', ?), datetime('now', ?)) RETURNING id`).bind(crypto.randomUUID(), name, phone, body, `-${minsAgo} minutes`, `-${minsAgo} minutes`).first<{ id: number }>())!;
  await pdb().prepare("INSERT INTO visitor_messages (chat_id, sender, body, created_at) VALUES (?, 'visitor', ?, datetime('now', ?))").bind(v.id, body, `-${minsAgo} minutes`).run();
  return v.id;
}

beforeEach(async () => {
  await resetDb();
  await pdb().batch([pdb().prepare("DELETE FROM support_messages"), pdb().prepare("DELETE FROM support_tickets"), pdb().prepare("DELETE FROM visitor_messages"),
    pdb().prepare("DELETE FROM visitor_chats"), pdb().prepare("DELETE FROM support_profiles"), pdb().prepare("DELETE FROM super_admins")]);
  clearShopCache();
});

describe("সাপোর্ট ডেস্ক", () => {
  it("লাইভ চ্যাট কিউ: দোকান আর ভিজিটর একসাথে, যে আগে অপেক্ষায় সে আগে; লেবেল আর ফিল্টার", async () => {
    await pdb().prepare("UPDATE shops SET status = 'trial' WHERE id = ?").bind(DEMO_SHOP_ID).run();
    await chat(DEMO_SHOP_ID, "দোকানের প্রশ্ন", 5);
    await visitor("রহিম", "01711111111", "ভিজিটরের প্রশ্ন", 30);
    const s = await agent();
    const html = await get(s, "/super/support");
    expect(html.indexOf("ভিজিটরের প্রশ্ন")).toBeLessThan(html.indexOf("দোকানের প্রশ্ন")); // ৩০ মিনিট আগে → সিরিয়াল ১
    expect(html).toContain("ওয়েবসাইট ভিজিটর");
    expect(html).toContain("ফ্রি ট্রায়াল");
    expect(html).toContain("সাপোর্ট ডেস্ক");
    const trial = await get(s, "/super/support?who=trial");
    expect(trial).toContain("দোকানের প্রশ্ন");
    expect(trial).not.toContain("ভিজিটরের প্রশ্ন");
    const paid = await get(s, "/super/support?who=paid");
    expect(paid).not.toContain("দোকানের প্রশ্ন");
  });

  it("টিকেট: আগে জমা দেওয়া আগে, পেইড লেবেল", async () => {
    await pdb().prepare("UPDATE shops SET status = 'active', plan = 'small' WHERE id = ?").bind(DEMO_SHOP_ID).run();
    await chat(DEMO_SHOP_ID, "পরের টিকেট", 10, "ticket", "দ্বিতীয়");
    await chat(DEMO_SHOP_ID, "আগের টিকেট", 90, "ticket", "প্রথম");
    const s = await agent();
    const html = await get(s, "/super/support/tickets");
    expect(html.indexOf("প্রথম")).toBeLessThan(html.indexOf("দ্বিতীয়"));
    expect(html).toContain("পেইড");
  });

  it("দোকানের প্রোফাইল: সব চ্যাট এক থ্রেডে, আগের ওয়েবসাইট চ্যাট জোড়া, নোট সেভ, প্রোফাইল থেকে উত্তর", async () => {
    await pdb().prepare("UPDATE shops SET owner_phone = '01812345678' WHERE id = ?").bind(DEMO_SHOP_ID).run();
    const shop = { owner_phone: "01812345678" };
    await chat(DEMO_SHOP_ID, "প্রথম চ্যাট", 300);
    await pdb().prepare("UPDATE support_tickets SET status = 'resolved'").run();
    const open = await chat(DEMO_SHOP_ID, "দ্বিতীয় চ্যাট", 5);
    await visitor("মালিক", shop.owner_phone, "দোকান খোলার আগের প্রশ্ন", 9000);
    const s = await agent();
    const base = `/super/support/shop/${DEMO_SHOP_ID}`;
    const html = await get(s, base);
    expect(html).toContain("প্রথম চ্যাট");
    expect(html).toContain("দ্বিতীয় চ্যাট");
    expect(html).toContain("ওয়েবসাইট চ্যাট");
    expect(await get(s, `${base}?tab=web`)).toContain("দোকান খোলার আগের প্রশ্ন");
    expect(await get(s, `${base}?tab=history`)).toContain("দোকান খুলেছে");

    await post(s, "/super/support/profile", { key: `shop:${DEMO_SHOP_ID}`, back: base, note: "ধীরে বোঝাতে হয়" });
    expect(await get(s, base)).toContain("ধীরে বোঝাতে হয়");

    const r = await post(s, `/super/support/${open}/reply`, { body: "দেখছি", back: `${base}?tab=chat` });
    expect(r.headers.get("location")).toBe(`${base}?tab=chat`);
    expect((await pdb().prepare("SELECT COUNT(*) n FROM support_messages WHERE ticket_id = ? AND sender = 'team'").bind(open).first<{ n: number }>())!.n).toBe(1);
    // বাইরের ঠিকানায় ফেরত পাঠানো যায় না
    const bad = await post(s, `/super/support/${open}/reply`, { body: "আবার", back: "https://evil.test/" });
    expect(bad.headers.get("location")).not.toContain("evil");
  });

  it("ফোন নম্বর ধরে ভিজিটর প্রোফাইল: কতবার এসেছে, ফলো-আপ, দোকান খুলেছে কিনা", async () => {
    await visitor("করিম", "01799999999", "প্রথমবার", 3000);
    await pdb().prepare("UPDATE visitor_chats SET status = 'closed'").run();
    await visitor("করিম ভাই", "01799999999", "দ্বিতীয়বার", 10);
    const s = await agent();
    const leads = await get(s, "/super/support/leads");
    expect(leads).toContain("করিম ভাই");
    expect(leads).toContain("২ বার");
    const prof = await get(s, "/super/support/lead/01799999999");
    expect(prof).toContain("প্রথমবার");
    expect(prof).toContain("দ্বিতীয়বার");
    expect(prof).toContain("অন্য নামে: করিম");
    await post(s, "/super/support/profile", { key: "phone:01799999999", back: "/super/support/lead/01799999999", follow_up: "interested", note: "পরের মাসে শুরু" });
    expect(await get(s, "/super/support/leads?f=interested")).toContain("করিম ভাই");
    expect(await get(s, "/super/support/leads?f=shop")).not.toContain("করিম ভাই");
    // প্রোফাইল থেকে উত্তর
    const v = (await pdb().prepare("SELECT id FROM visitor_chats WHERE status = 'open'").first<{ id: number }>())!;
    const r = await post(s, `/super/visitors/${v.id}/reply`, { body: "জি বলুন", back: "/super/support/lead/01799999999" });
    expect(r.headers.get("location")).toBe("/super/support/lead/01799999999");
  });
});
