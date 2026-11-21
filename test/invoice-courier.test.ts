import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, lastOrder, resetDb } from "./helpers";

beforeEach(resetDb);

describe("ইনভয়েস আর স্টিকারে কুরিয়ারের আইডি", () => {
  it("বুক হওয়া অর্ডারে কুরিয়ারের নাম, কনসাইনমেন্ট আইডি, ট্র্যাকিং আর আইডির বারকোড", async () => {
    await new Browser().order({ phone: "01712345678" });
    const o = (await lastOrder())!;
    const admin = await adminBrowser();
    // বুক হওয়ার আগে কুরিয়ারের অংশ নেই
    expect(await (await admin.get(`/admin/orders/${o.id}/invoice?size=sticker`)).text()).not.toContain("st-courier");
    await DB.prepare("UPDATE orders SET status = 'shipped', courier = 'steadfast', consignment_id = '152874963', tracking_code = 'SFT9X2K7' WHERE id = ?").bind(o.id).run();
    const sticker = await (await admin.get(`/admin/orders/${o.id}/invoice?size=sticker`)).text();
    expect(sticker).toContain('class="st-courier"');
    expect(sticker).toContain("Steadfast");
    expect(sticker).toContain("152874963");
    expect(sticker).toContain("SFT9X2K7");
    const a4 = await (await admin.get(`/admin/orders/${o.id}/invoice?size=a4`)).text();
    expect(a4).toContain("Steadfast আইডি: <b>152874963</b>");
    expect(a4).toContain("ট্র্যাকিং: <b>SFT9X2K7</b>");
  });
});
