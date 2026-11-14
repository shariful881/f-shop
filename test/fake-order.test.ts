import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { normalizePhone } from "../src/lib/phone";
import { Browser, countOrders, lastOrder, resetDb } from "./helpers";

beforeEach(resetDb);

describe("নিয়ম ১: ফোন নম্বর যাচাই আর নরমালাইজ", () => {
  it.each([
    ["01712345678", "01712345678"],
    ["+8801712345678", "01712345678"],
    ["8801712345678", "01712345678"],
    ["008801712345678", "01712345678"],
    ["+880 1712-345678", "01712345678"],
    ["017 1234 5678", "01712345678"],
    ["০১৭১২৩৪৫৬৭৮", "01712345678"],
    ["+৮৮০১৯১২৩৪৫৬৭৮", "01912345678"],
    ["1312345678", "01312345678"],
  ])("%s → %s", (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it.each(["0171234567", "017123456789", "01212345678", "01012345678", "02712345678", "abc", "", "+1 202 555 0100"])(
    "ভুল নম্বর বাতিল: %s",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it("ভুল নম্বর দিয়ে সার্ভার অর্ডার নেয় না", async () => {
    const res = await new Browser().order({ phone: "01212345678" });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("সঠিক মোবাইল নম্বর লিখুন");
    expect(await countOrders()).toBe(0);
  });

  it("অর্ডারে নম্বর সবসময় 01... ফরম্যাটে সেভ হয়", async () => {
    await new Browser().order({ phone: "+880 1712-345678" });
    expect((await lastOrder())!.phone).toBe("01712345678");
  });
});

describe("নিয়ম ২: কার্টে একটা পণ্য সর্বোচ্চ ১টা", () => {
  it("একই পণ্য আবার যোগ করলে 'আগেই কার্টে আছে'", async () => {
    const b = new Browser();
    const r1 = await b.post("/cart/add", { product_id: 1 }, { accept: "application/json" });
    expect(await r1.json()).toMatchObject({ ok: true, count: 1 });
    const r2 = await b.post("/cart/add", { product_id: 1 }, { accept: "application/json" });
    const d2 = await r2.json<{ ok: boolean; message: string; count: number }>();
    expect(d2.ok).toBe(false);
    expect(d2.message).toContain("আগেই কার্টে আছে");
    expect(d2.count).toBe(1);
  });

  it("কুকি বদলে ডুপ্লিকেট ঢোকালেও সার্ভার একটাই রাখে, qty সবসময় ১", async () => {
    const b = new Browser();
    b.cookies.set("cart", "1,1,1,3,3");
    await b.post("/order", { source: "cart", name: "করিম", phone: "01812345678", address: "চট্টগ্রাম সদর", area: "inside" });
    const o = await lastOrder();
    const { results } = await env.DB.prepare("SELECT product_id, qty FROM order_items WHERE order_id=? ORDER BY product_id").bind(o!.id).all();
    expect(results).toEqual([{ product_id: 1, qty: 1 }, { product_id: 3, qty: 1 }]);
    expect(o!.subtotal).toBe(1250 + 690);
  });

  it("কার্ট পেজে কোয়ান্টিটি বাড়ানোর অপশন নেই", async () => {
    const b = new Browser();
    await b.post("/cart/add", { product_id: 1 });
    const html = await (await b.get("/cart")).text();
    expect(html).not.toMatch(/name="qty"|quantity/i);
  });
});

describe("নিয়ম ৩: আগের অর্ডার কনফার্ম না হলে নতুন অর্ডার নয়", () => {
  it("একই নম্বর থেকে (ভিন্নভাবে লিখলেও) দ্বিতীয় অর্ডার আটকায়", async () => {
    expect((await new Browser().order({ phone: "01712345678" })).status).toBe(303);
    const res = await new Browser().order({ phone: "+৮৮০ ১৭১২-৩৪৫৬৭৮", product_id: 2 });
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("আপনার আগের অর্ডারটি এখনো কনফার্মের অপেক্ষায় আছে");
    expect(html).toContain("01700000000"); // যোগাযোগ নম্বর
    expect(await countOrders()).toBe(1);
  });

  it("একই ডিভাইস থেকে অন্য নম্বরেও দ্বিতীয় অর্ডার আটকায়", async () => {
    const b = new Browser();
    await b.get("/");
    expect((await b.order({ phone: "01712345678" })).status).toBe(303);
    expect((await b.order({ phone: "01998765432" })).status).toBe(403);
    expect(await countOrders()).toBe(1);
  });

  it("কুকি মুছে ফেললেও localStorage-এর ডিভাইস আইডি দিয়ে ধরা পড়ে", async () => {
    const b = new Browser();
    await b.get("/");
    const did = b.cookies.get("did")!;
    await b.order({ phone: "01712345678" });

    const fresh = new Browser(); // নতুন কুকি, কিন্তু localStorage-এ পুরনো আইডি
    const res = await fresh.order({ phone: "01998765432", did_ls: did });
    expect(res.status).toBe(403);
  });

  it("অ্যাডমিন কনফার্ম করলে আবার অর্ডার দেওয়া যায়", async () => {
    const b = new Browser();
    await b.order({ phone: "01712345678" });
    expect((await b.order({ phone: "01712345678" })).status).toBe(403);
    await env.DB.prepare("UPDATE orders SET status='confirmed'").run();
    expect((await b.order({ phone: "01712345678" })).status).toBe(303);
    expect(await countOrders()).toBe(2);
  });
});

describe("নিয়ম ৪: ব্ল্যাকলিস্টের নম্বর/ডিভাইস অর্ডার দিতে পারে না", () => {
  it("ব্লক করা নম্বর (যেকোনোভাবে লিখলেও)", async () => {
    await env.DB.prepare("INSERT INTO blacklist_entries (type,value,reason) VALUES ('phone','01712345678','manual')").run();
    const res = await new Browser().order({ phone: "8801712345678" });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("অর্ডার নেওয়া সম্ভব হচ্ছে না");
    expect(await countOrders()).toBe(0);
  });

  it("ব্লক করা ডিভাইস, নতুন নম্বর দিলেও", async () => {
    const b = new Browser();
    await b.get("/");
    await env.DB.prepare("INSERT INTO blacklist_entries (type,value,reason) VALUES ('device',?,'fake')").bind(b.cookies.get("did")).run();
    expect((await b.order({ phone: "01611111111" })).status).toBe(403);
    expect(await countOrders()).toBe(0);
  });
});

describe("নিয়ম ৫: ডিভাইস চেনা", () => {
  it("প্রথম ভিজিটে ২ বছরের did কুকি (এনক্রিপ্ট নয়), অর্ডারে ডিভাইস, IP, user agent সেভ", async () => {
    const b = new Browser("203.0.113.9");
    const res = await b.get("/");
    const sc = res.headers.getSetCookie().find((c) => c.startsWith("did="))!;
    expect(sc).toMatch(/^did=[0-9a-f-]{36};/);
    expect(sc).toMatch(/Max-Age=63072000/);
    expect(sc).not.toMatch(/HttpOnly/i);

    await b.order();
    const o = await lastOrder();
    expect(o!.device_id).toBe(b.cookies.get("did"));
    expect(o!.ip).toBe("203.0.113.9");
    expect(o!.user_agent).toBe("TestBrowser/1.0");
  });

  it("did কুকি থাকলে নতুন বানায় না", async () => {
    const b = new Browser();
    await b.get("/");
    const did = b.cookies.get("did");
    const res = await b.get("/");
    expect(res.headers.getSetCookie().some((c) => c.startsWith("did="))).toBe(false);
    expect(b.cookies.get("did")).toBe(did);
  });
});

describe("নিয়ম ৬: lock আর rate limit", () => {
  it("একই নম্বরে একসাথে কয়েকবার সাবমিট করলেও একটাই অর্ডার হয়", async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => new Browser().order({ phone: "01712345678" })),
    );
    expect(results.filter((r) => r.status === 303)).toHaveLength(1);
    expect(await countOrders()).toBe(1);
  });

  it("একই IP থেকে মিনিটে ৫ বারের বেশি সাবমিট করলে ৪২৯", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await new Browser("198.51.100.7").order({ phone: "0171234567" + i })).status);
    }
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
