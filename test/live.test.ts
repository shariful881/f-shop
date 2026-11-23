import { beforeEach, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { BASE, Browser, DB, adminBrowser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await DB.prepare("DELETE FROM activity").run();
});

type Msg = { t: string; [k: string]: any };
/** লগইন করা অ্যাডমিন হিসেবে /admin/live-এ যুক্ত হওয়া; আসা মেসেজগুলো জমা হয় */
async function connect(b: Browser | null, headers: Record<string, string> = {}) {
  const res = await SELF.fetch(BASE + "/admin/live", { headers: { Upgrade: "websocket", ...(b ? { cookie: b.cookieHeader() } : {}), ...headers } });
  const ws = res.webSocket;
  const got: Msg[] = [];
  if (ws) {
    ws.accept();
    ws.addEventListener("message", (e) => { try { got.push(JSON.parse(e.data as string)); } catch { got.push({ t: "raw", data: e.data }); } });
  }
  const wait = async (pred: (m: Msg) => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const m = got.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("message not received: " + JSON.stringify(got));
  };
  return { res, ws, got, wait };
}

describe("লাইভ নোটিফিকেশন", () => {
  it("লগইন ছাড়া বা অন্য সাইট থেকে যুক্ত হওয়া যায় না", async () => {
    expect((await connect(null)).res.status).toBe(401);
    const a = await adminBrowser();
    expect((await connect(a, { Origin: "https://evil.example" })).res.status).toBe(403);
    const plain = await SELF.fetch(BASE + "/admin/live", { headers: { cookie: a.cookieHeader() } });
    expect(plain.status).toBe(426);
  });

  it("নতুন অর্ডার এলে সাথে সাথে খবর: নাম, টাকা, নতুন অর্ডারের সংখ্যা — ফোন নম্বর যায় না", async () => {
    const a = await adminBrowser();
    const live = await connect(a, { Origin: BASE });
    expect(live.res.status).toBe(101);
    const hello = await live.wait((m) => m.t === "hello");
    expect(hello.new_count).toBe(0);

    const buyer = new Browser();
    await buyer.order();
    const ev = (await live.wait((m) => m.t === "ev")).ev;
    expect(ev.kind).toBe("order_new");
    expect(ev.order_no).toMatch(/^[A-Z0-9-]+\d+$/);
    expect(ev.total).toBeGreaterThan(0);
    expect(ev.new_count).toBe(1);
    expect(ev.mine).toBe(false);
    expect(JSON.stringify(ev)).not.toMatch(/01[3-9]\d{8}/);
    live.ws!.close();
  });

  it("স্ট্যাটাস বদল: কে করল সেটা যায়; নিজের কাজ mine=true; ইতিহাস since দিয়ে পাওয়া যায়", async () => {
    const buyer = new Browser();
    await buyer.order();
    const o = await DB.prepare("SELECT id FROM orders ORDER BY id DESC LIMIT 1").first<{ id: number }>();
    const a = await adminBrowser();
    const live = await connect(a);
    await live.wait((m) => m.t === "hello");
    await a.post(`/admin/orders/${o!.id}/status`, { status: "confirmed" });
    const ev = (await live.wait((m) => m.t === "ev" && m.ev.kind === "status")).ev;
    expect(ev.status).toBe("confirmed");
    expect(ev.mine).toBe(true);
    expect(ev.by_name).toBeTruthy();
    expect(ev.new_count).toBe(0);

    live.ws!.send(JSON.stringify({ t: "since", since: 0 }));
    const hist = await live.wait((m) => m.t === "events");
    expect(hist.list.map((e: any) => e.kind)).toEqual(["status", "order_new"]);
    live.ws!.close();
  });

  it("প্যানেলে বেল, শব্দের বাটন আর live.js থাকে; অর্ডার লিস্টে লাইভ অংশ", async () => {
    const a = await adminBrowser();
    const h = await (await a.get("/admin/orders")).text();
    expect(h).toContain("data-live-bell");
    expect(h).toContain("data-live-sound");
    expect(h).toContain("/js/live.js");
    expect(h).toContain('data-live-orders="1"');
    const d = await (await a.get("/admin")).text();
    expect(d).toContain('data-live-dash="kpis"');
    expect(d).toContain('data-live-dash="recent"');
  });
});
