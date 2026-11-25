import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { Browser, DEMO_SHOP_ID, resetDb } from "./helpers";
import { hashPassword } from "../src/shop/lib/auth";
import { crc32 } from "../src/platform/zip";

const P = "https://ourdomain.com";
const pdb = () => env.PLATFORM_DB;
async function member(email: string, role: string) {
  await pdb().prepare("INSERT OR REPLACE INTO super_admins (email, name, role, password_hash, active) VALUES (?, ?, ?, ?, 1)")
    .bind(email, email.split("@")[0], role, await hashPassword("teampass123", 1000)).run();
  const b = new Browser();
  await b.fetch("/super/login", { method: "POST", base: P, body: new URLSearchParams({ email, password: "teampass123" }) } as RequestInit);
  return b;
}
const get = (b: Browser, path: string) => b.fetch(path, { base: P } as RequestInit);
const post = (b: Browser, path: string, data: Record<string, string> = {}) =>
  b.fetch(path, { method: "POST", base: P, body: new URLSearchParams(data) } as RequestInit);

/** ছোট ZIP পাঠক — central directory থেকে সব ফাইল, deflate খুলে, CRC মিলিয়ে */
async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  expect(e).toBeGreaterThanOrEqual(0);
  const n = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), csize = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nl));
    const lnl = v.getUint16(off + 26, true), lxl = v.getUint16(off + 28, true);
    const body = new Uint8Array(buf, off + 30 + lnl + lxl, csize);
    const data = method === 8 ? new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()) : body.slice();
    expect(crc32(data), name).toBe(crc);
    out.set(name, data);
    p += 46 + nl + xl + cl;
  }
  return out;
}
const text = (b: Uint8Array | undefined) => new TextDecoder().decode(b);

async function decrypt(encJson: string, password: string) {
  const j = JSON.parse(encJson);
  const d = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: d(j.salt), iterations: j.iter }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: d(j.iv) }, key, d(j.data))));
}

beforeEach(async () => {
  await resetDb();
  await pdb().batch([pdb().prepare("DELETE FROM audit_log"), pdb().prepare("DELETE FROM super_admins"), pdb().prepare("DELETE FROM platform_settings WHERE key LIKE 'backup_unlock:%'")]);
});

describe("সুপার অ্যাডমিন ব্যাকআপ", () => {
  it("শুধু মালিক দেখতে পারেন; পাসওয়ার্ড দিয়ে না খুললে কিছু নামে না", async () => {
    const sup = await member("sup@t.com", "support");
    expect((await get(sup, "/super/backup")).status).toBe(403);
    const o = await member("owner@t.com", "owner");
    const page = await (await get(o, "/super/backup")).text();
    expect(page).toContain("আগে পাসওয়ার্ড দিন");
    const r = await get(o, "/super/backup/platform.zip");
    expect(r.status).toBe(303);
    await post(o, "/super/backup/unlock", { password: "ভুল" });
    expect(await (await get(o, "/super/backup")).text()).toContain("আগে পাসওয়ার্ড দিন");
    expect(await pdb().prepare("SELECT 1 FROM audit_log WHERE action = 'backup.unlock_fail'").first()).toBeTruthy();
    await post(o, "/super/backup/unlock", { password: "teampass123" });
    const open = await (await get(o, "/super/backup")).text();
    expect(open).toContain("পুরো ব্যাকআপ নামান");
    expect(open).toContain("ডাটা + Excel");
  });

  it("পুরো ব্যাকআপ: প্রতিটা অংশ আলাদা ফোল্ডারে, ZIP ঠিকঠাক খোলে, চাবি পাসওয়ার্ডে খোলে", async () => {
    await new Browser().order({ phone: "01711112222", name: "ব্যাকআপ ক্রেতা" });
    const o = await member("owner@t.com", "owner");
    await post(o, "/super/backup/unlock", { password: "teampass123" });

    // চাবির পাসওয়ার্ড না মিললে নামে না
    const bad = await post(o, "/super/backup/full", { secrets: "1", pass: "abcdefghij", pass2: "abcdefghiX" });
    expect(bad.status).toBe(303);

    const r = await post(o, "/super/backup/full", { secrets: "1", pass: "গোপন-পাসওয়ার্ড-১২৩", pass2: "গোপন-পাসওয়ার্ড-১২৩" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/zip");
    expect(r.headers.get("content-disposition")).toMatch(/sellxbd-full-.*\.zip/);
    const files = await unzip(await r.arrayBuffer());
    const names = [...files.keys()];
    expect(names).toContain("README.txt");
    expect(names).toContain("manifest.json");
    expect(names).toContain("1-platform-database/platform.sql");
    expect(names).toContain("1-platform-database/shops.csv");
    expect(names.some((n) => n.startsWith("4-code/"))).toBe(true);
    expect(names).toContain("5-secrets/secret-names.txt");
    expect(names).toContain("5-secrets/open-secrets.html");

    const sql = text(files.get("1-platform-database/platform.sql"));
    expect(sql).toContain("CREATE TABLE shops");
    expect(sql).toContain(`INSERT INTO "shops"`);
    expect(sql).toContain(DEMO_SHOP_ID);
    expect(sql).not.toContain(`INSERT INTO "super_sessions"`); // লগইন সেশন বাদ

    const slug = (await pdb().prepare("SELECT slug FROM shops WHERE id = ?").bind(DEMO_SHOP_ID).first<{ slug: string }>())!.slug;
    const data = JSON.parse(text(files.get(`2-shops/${slug}/shop-data.json`)));
    expect(data.shop_id).toBe(DEMO_SHOP_ID);
    expect(data.tables.orders.some((x: any) => x.name === "ব্যাকআপ ক্রেতা")).toBe(true);
    expect(text(files.get(`2-shops/${slug}/orders.csv`))).toContain("ব্যাকআপ ক্রেতা");
    expect(names.some((n) => n.startsWith("3-images/"))).toBe(false); // ছবি টিক দেওয়া হয়নি

    const man = JSON.parse(text(files.get("manifest.json")));
    expect(man.files.length).toBe(names.length - 1);

    const enc = text(files.get("5-secrets/secrets.enc"));
    expect(enc).not.toContain("secrets\":{");
    const plain = await decrypt(enc, "গোপন-পাসওয়ার্ড-১২৩");
    expect(typeof plain.secrets).toBe("object");
    await expect(decrypt(enc, "ভুল-পাসওয়ার্ড-০০০")).rejects.toThrow();

    const a = await pdb().prepare("SELECT detail FROM audit_log WHERE action = 'backup.full'").first<{ detail: string }>();
    expect(a?.detail).toContain("তালাবদ্ধ চাবিসহ");
  });

  it("ভাগে ভাগে: মূল ডাটাবেস, একটা দোকান, ছবি, চাবির নাম", async () => {
    const o = await member("owner@t.com", "owner");
    await post(o, "/super/backup/unlock", { password: "teampass123" });
    const p = await unzip(await (await get(o, "/super/backup/platform.zip")).arrayBuffer());
    expect([...p.keys()].sort()).toEqual(["manifest.json", "platform.sql", "shops.csv"]);
    const s = await unzip(await (await get(o, `/super/backup/shop/${DEMO_SHOP_ID}/data.zip`)).arrayBuffer());
    expect([...s.keys()].some((n) => n.endsWith("/shop-data.json"))).toBe(true);
    const img = await get(o, `/super/backup/shop/${DEMO_SHOP_ID}/images.zip`);
    expect(img.status).toBe(200);
    expect([...(await unzip(await img.arrayBuffer())).keys()]).toContain("manifest.json");
    const names = await (await get(o, "/super/backup/secret-names.txt")).text();
    expect(names).toContain("PORKBUN_API_KEY");
    expect((await get(o, "/super/backup/shop/nope/data.zip")).status).toBe(404);
    // বন্ধ করলে আর নামে না
    await post(o, "/super/backup/lock");
    expect((await get(o, "/super/backup/platform.zip")).status).toBe(303);
  });
});
