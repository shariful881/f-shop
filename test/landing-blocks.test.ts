import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, DB, resetDb } from "./helpers";
import { normalizeLanding } from "../src/shop/lib/landing";

beforeEach(resetDb);

describe("ল্যান্ডিং: শিরোনাম, ছবি+লেখা, ছবির গ্রিড — যাচাই", () => {
  it("শিরোনাম: ভুল সাইজ/সাজানো হলে ডিফল্ট, prototype নাম চলে না", () => {
    const l = normalizeLanding({ sections: [
      { type: "heading", data: { headline: "কেন সেরা", hsize: "xl", align: "right" } },
      { type: "heading", data: { headline: "দুই", hsize: "toString", align: "justify" } },
    ] });
    expect(l.sections[0]!.data).toMatchObject({ headline: "কেন সেরা", hsize: "xl", align: "right" });
    expect(l.sections[1]!.data).toMatchObject({ hsize: "md", align: "center" });
  });

  it("ছবি+লেখা: লেখা নিরাপদ, পাশ/মোবাইল ক্রম যাচাই, ফাঁকা বাটন মানে বাটন নেই", () => {
    const d = normalizeLanding({ sections: [{ type: "image_text", data: {
      images: ["p/a.jpg", "p/b.jpg"], title: "কাঠ", html: '<p onclick="x()">ভালো <b>কাঠ</b></p><script>bad()</script>', side: "up", mobile_first: "text", button_text: "",
    } }] }).sections[0]!.data;
    expect(d.images).toEqual(["p/a.jpg"]);
    expect(d.html).toBe("<p>ভালো <b>কাঠ</b></p>");
    expect(d.side).toBe("left");
    expect(d.mobile_first).toBe("text");
    expect(d.button_text).toBe("");
  });

  it("গ্রিড: কলাম ১/২/৩, আকার যাচাই, ভুল ছবি বাদ গেলে তার লেখাও বাদ", () => {
    const d = normalizeLanding({ sections: [{ type: "gallery", data: {
      layout: "grid", cols: 7, ratio: "weird", images: ["p/1.jpg", "../bad", "p/3.jpg"], captions: ["এক", "খারাপ", "তিন"],
    } }] }).sections[0]!.data;
    expect(d).toMatchObject({ layout: "grid", cols: 2, ratio: "square", images: ["p/1.jpg", "p/3.jpg"], captions: ["এক", "তিন"] });
    const d3 = normalizeLanding({ sections: [{ type: "gallery", data: { layout: "grid", cols: "3", ratio: "portrait", images: ["p/1.jpg"] } }] }).sections[0]!.data;
    expect(d3).toMatchObject({ cols: 3, ratio: "portrait" });
    expect(d3.captions).toBeUndefined();
  });

  it("পুরোনো গ্যালারি (layout ছাড়া) আগের মতোই স্লাইড থাকে", () => {
    const d = normalizeLanding({ sections: [{ type: "gallery", data: { images: ["p/1.jpg"] } }] }).sections[0]!.data;
    expect(d).toEqual({ images: ["p/1.jpg"] });
  });
});

describe("ল্যান্ডিং: নতুন ব্লক প্রিভিউতে দেখায়", () => {
  it("শিরোনাম, ছবি+লেখা, গ্রিড HTML-এ আসে; বিল্ডারে 'ছবির গ্রিড' অপশন আছে", async () => {
    const a = await adminBrowser();
    const p = await DB.prepare("SELECT id FROM products LIMIT 1").first<{ id: number }>();
    const landing = { sections: [
      { type: "heading", data: { headline: "বড়-শিরোনাম-টেস্ট", subheadline: "সাব-টেস্ট", hsize: "lg", align: "left" } },
      { type: "image_text", data: { images: ["p/a.jpg"], title: "ছবি-লেখা-টেস্ট", html: "<ul><li>পয়েন্ট-এক</li></ul>", side: "right", mobile_first: "text", button_text: "কিনুন-টেস্ট" } },
      { type: "gallery", data: { layout: "grid", cols: 3, ratio: "portrait", images: ["p/1.jpg", "p/2.jpg"], captions: ["ক্যাপশন-এক", ""] } },
    ] };
    const fd = new FormData();
    fd.append("landing_json", JSON.stringify(landing));
    const html = await (await a.fetch(`/admin/products/${p!.id}/landing/preview`, { method: "POST", body: fd })).text();
    for (const x of ["lp-heading lp-h-lg lp-al-left", "বড়-শিরোনাম-টেস্ট", "সাব-টেস্ট", "lp-imgtext lp-img-right lp-text-first", "ছবি-লেখা-টেস্ট", "<li>পয়েন্ট-এক</li>", "কিনুন-টেস্ট", "lp-grid lp-cols-3 lp-ratio-portrait", "<figcaption>ক্যাপশন-এক</figcaption>"]) expect(html).toContain(x);
    expect(html.match(/<figcaption>/g)?.length).toBe(1);

    const b = await (await a.get(`/admin/products/${p!.id}/landing`)).text();
    expect(b).toContain('value="gallery_grid"');
    expect(b).toContain('value="heading"');
    expect(b).toContain('value="image_text"');
  });
});

describe("ল্যান্ডিং: '+ সেকশন' লিস্ট ভাগ করা", () => {
  it("অর্ডার ফর্ম ছাড়া সব সেকশন কোনো একটা ভাগে আছে, একবারই", async () => {
    const { SECTION_GROUPS, SECTION_TYPES } = await import("../src/shop/lib/landing");
    const vals = SECTION_GROUPS.flatMap((g) => g.items.map((i) => i.value));
    expect(new Set(vals).size).toBe(vals.length);
    for (const t of SECTION_TYPES) if (t !== "order_form") expect(vals).toContain(t);
    expect(vals).toContain("gallery_grid");
  });

  it("বিল্ডারে ভাগগুলো optgroup হিসেবে আসে", async () => {
    const a = await adminBrowser();
    const p = await DB.prepare("SELECT id FROM products LIMIT 1").first<{ id: number }>();
    const b = await (await a.get(`/admin/products/${p!.id}/landing`)).text();
    expect(b).toContain('<optgroup label="✍️ শিরোনাম ও লেখা">');
    expect(b).toContain('<optgroup label="🛒 অর্ডারে উৎসাহ">');
    expect(b).not.toContain('<option value="order_form"');
  });
});

describe("ল্যান্ডিং: কল / WhatsApp বাটনের সেকশন", () => {
  it("যাচাই: ডিফল্টে দুটো বাটনই চালু, ফাঁকা লেখায় ডিফল্ট লেখা, বন্ধ করা যায়", () => {
    const [a, b] = normalizeLanding({ sections: [
      { type: "contact", data: {} },
      { type: "contact", data: { headline: "জানতে কল দিন", call: false, wa_text: "মেসেজ দিন" } },
    ] }).sections;
    expect(a!.data).toMatchObject({ call: true, wa: true, call_text: "কল করে অর্ডার করুন", wa_text: "WhatsApp-এ জিজ্ঞাসা করুন" });
    expect(b!.data).toMatchObject({ headline: "জানতে কল দিন", call: false, wa: true, wa_text: "মেসেজ দিন" });
  });

  it("ল্যান্ডিং পেজের ভেতরে দোকানের নম্বর দিয়ে বাটন আসে; নম্বর না থাকলে সেকশন আসে না", async () => {
    await DB.prepare("UPDATE settings SET value = '01711111111' WHERE key = 'whatsapp'").run();
    const a = await adminBrowser();
    const p = await DB.prepare("SELECT id, slug FROM products WHERE is_active = 1 LIMIT 1").first<{ id: number; slug: string }>();
    const landing = { sections: [{ type: "contact", data: { headline: "কল-সেকশন-টেস্ট", call_text: "কল-টেস্ট", wa_text: "হোয়াটস-টেস্ট" } }] };
    const fd = new FormData();
    fd.append("landing_json", JSON.stringify(landing));
    const html = await (await a.fetch(`/admin/products/${p!.id}/landing/preview`, { method: "POST", body: fd })).text();
    for (const x of ["lp-contact", "কল-সেকশন-টেস্ট", "pd-call", "কল-টেস্ট", "wa.me/8801711111111?text=", "হোয়াটস-টেস্ট"]) expect(html).toContain(x);

    await DB.prepare("UPDATE settings SET value = '' WHERE key IN ('whatsapp','contact_phone')").run();
    await DB.prepare("UPDATE products SET landing_json = ? WHERE id = ?").bind(JSON.stringify(landing), p!.id).run();
    const live = await (await new (await import("./helpers")).Browser().get(`/p/${p!.slug}`)).text();
    expect(live).not.toContain("lp-contact");
    expect(live).not.toContain("কল-সেকশন-টেস্ট");

    const b = await (await a.get(`/admin/products/${p!.id}/landing`)).text();
    expect(b).toContain('value="contact"');
  });
});
