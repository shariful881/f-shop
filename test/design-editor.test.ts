import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";

beforeEach(resetDb);

const draftBody = (text: string) => new URLSearchParams([["announcement", text], ["topbar", "1"], ["home_order", "banner,categories"]]);

describe("থিম লাইভ এডিটর", () => {
  it("খসড়া শুধু মালিকের প্রিভিউতে, ক্রেতা দেখে না; পাবলিশের পরে সবাই দেখে", async () => {
    const a = await adminBrowser();
    expect((await a.get("/admin/design")).status).toBe(200);
    const r = await a.fetch("/admin/design/draft", { method: "POST", body: draftBody("খসড়া-ঘোষণা-৭৭") });
    expect(await r.json()).toEqual({ ok: true, changed: true });

    const buyer = await (await new Browser().get("/?__preview=1")).text();
    expect(buyer).not.toContain("খসড়া-ঘোষণা-৭৭");
    const preview = await a.get("/?__preview=1");
    expect(preview.headers.get("cache-control")).toBe("no-store");
    const html = await preview.text();
    expect(html).toContain("খসড়া-ঘোষণা-৭৭");
    expect(html).toContain("__preview"); // লিংকে প্রিভিউ ধরে রাখার স্ক্রিপ্ট

    await a.fetch("/admin/design/publish", { method: "POST" });
    expect(await (await new Browser().get("/")).text()).toContain("খসড়া-ঘোষণা-৭৭");
    const d = await DB.prepare("SELECT value FROM settings WHERE key LIKE 'theme_draft_%' AND value != ''").first();
    expect(d).toBeNull();
  });

  it("খসড়া বাতিল করলে লাইভ ডিজাইনই থাকে", async () => {
    const a = await adminBrowser();
    await a.fetch("/admin/design/draft", { method: "POST", body: draftBody("বাতিল-হবে") });
    await a.fetch("/admin/design/discard", { method: "POST" });
    expect(await (await a.get("/?__preview=1")).text()).not.toContain("বাতিল-হবে");
  });

  it("লগইন ছাড়া এডিটর বা খসড়া সেভ করা যায় না", async () => {
    const b = new Browser();
    expect((await b.get("/admin/design")).status).toBe(303);
    expect((await b.fetch("/admin/design/draft", { method: "POST", body: draftBody("x") })).status).toBe(303);
  });
});
