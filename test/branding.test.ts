import { beforeEach, describe, expect, it } from "vitest";
import { adminBrowser, Browser, DB, resetDb } from "./helpers";

beforeEach(resetDb);

const baseSettings = {
  site_name: "রঙিন দোকান", contact_phone: "01811111111", delivery_inside: "60", delivery_outside: "120",
  fb_pixel_id: "", fb_capi_token: "", fb_test_event_code: "", fb_graph_version: "v26.0",
};

describe("দোকানের লোগো আর রং", () => {
  it("রং বদলালে দোকানের সব পেজে লাগে; ভুল রং নেয় না", async () => {
    const a = await adminBrowser();
    await a.post("/admin/settings", { ...baseSettings, brand_color: "#7C3AED", accent_color: "#DB2777" });
    const html = await (await new Browser().get("/")).text();
    expect(html).toContain("--brand:#7c3aed");
    expect(html).toContain("--accent:#db2777");
    expect(html).toContain('name="theme-color" content="#7c3aed"');

    await a.post("/admin/settings", { ...baseSettings, brand_color: "red;}</style><script>", accent_color: "#db2777" });
    const html2 = await (await new Browser().get("/")).text();
    expect(html2).toContain("--brand:#7c3aed");
    expect(html2).not.toContain("<script>alert");
  });

  it("লোগো আপলোড করলে হেডারে দেখায়, ছবি দোকানের ফোল্ডার থেকে আসে; সরানো যায়", async () => {
    const a = await adminBrowser();
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...baseSettings, brand_color: "#0f766e", accent_color: "#ea580c" })) fd.append(k, v);
    fd.append("logo", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], "logo.png", { type: "image/png" }));
    expect((await a.fetch("/admin/settings", { method: "POST", body: fd })).status).toBe(303);

    const key = (await DB.prepare("SELECT value FROM settings WHERE key='logo'").first<{ value: string }>())!.value;
    expect(key).toMatch(/^logo\/.+\.png$/);
    const html = await (await new Browser().get("/")).text();
    expect(html).toContain(`src="/img/${key}"`);
    const img = await new Browser().get(`/img/${key}`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");

    await a.post("/admin/settings", { ...baseSettings, remove_logo: "1" });
    expect((await DB.prepare("SELECT value FROM settings WHERE key='logo'").first<{ value: string }>())!.value).toBe("");
    expect((await new Browser().get(`/img/${key}`)).status).toBe(404);
  });

  it("বড় বা ভুল ধরনের লোগো নেয় না", async () => {
    const a = await adminBrowser();
    const fd = new FormData();
    for (const [k, v] of Object.entries(baseSettings)) fd.append(k, v);
    fd.append("logo", new File(["hello"], "logo.gif", { type: "image/gif" }));
    await a.fetch("/admin/settings", { method: "POST", body: fd });
    expect((await DB.prepare("SELECT value FROM settings WHERE key='logo'").first<{ value: string }>())!.value).toBe("");
  });
});
