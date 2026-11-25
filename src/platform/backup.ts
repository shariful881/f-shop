/**
 * সুপার অ্যাডমিনের অফলাইন ব্যাকআপ (মোঃ, ২৫ নভেম্বর ২০২৬)
 *
 * পুরো প্রজেক্ট এক ZIP-এ, বা ভাগে ভাগে। ব্যাকআপ কোথাও জমা থাকে না — সরাসরি ডাউনলোড হয়।
 *   1-platform-database/  platform.sql (পুরো মূল ডাটাবেস, D1-এ ফেরানো যায়) + shops.csv
 *   2-shops/<slug>/        shop-data.json (দোকানের "ফেরানো"-র ফরম্যাট) + orders/products/customers.csv
 *   3-images/<slug>/       ছবি (চাইলে — ফাইল বড় হয়)
 *   4-code/                GitHub থেকে কোডের সর্বশেষ কপি
 *   5-secrets/             Worker-এর গোপন চাবির নাম; চাইলে পাসওয়ার্ডে তালাবদ্ধ চাবি + খোলার পেজ
 */
import type { WorkerEnv } from "../worker-env";
import { bn } from "../shop/lib/format";
import { ZipWriter } from "./zip";

/** ব্যাকআপে যায় না — অস্থায়ী, আর ফেরালে ক্ষতি (পুরনো লগইন সেশন, যাচাইয়ের কোড, গতির সীমা) */
const SKIP_TABLES = new Set(["super_sessions", "verify_codes", "platform_rate_limits", "_cf_KV", "_cf_METADATA", "sqlite_sequence"]);

/** Worker-এর গোপন চাবি (Cloudflare এগুলো আর দেখায় না) */
export const SECRET_KEYS = ["CF_API_TOKEN", "PORKBUN_API_KEY", "PORKBUN_SECRET_KEY"] as const;
const REPO = "shariful881/f-shop";

export type BackupShop = { id: string; slug: string; name: string; status: string; db_bytes: number | null; demo_niche: string | null };

export async function backupShops(db: D1Database): Promise<BackupShop[]> {
  const r = await db.prepare(
    "SELECT id, slug, name, status, db_bytes, demo_niche FROM shops WHERE deleted_at IS NULL ORDER BY demo_niche IS NOT NULL, created_at",
  ).all<BackupShop>();
  return r.results;
}

const stamp = (d = new Date()) => new Date(d.getTime() + 6 * 3600_000).toISOString().slice(0, 16).replace("T", "-").replace(":", "");
export const backupName = (part: string) => `sellxbd-${part}-${stamp()}`;

/* ---------- মূল ডাটাবেস (SQL) ---------- */

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const b = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return `X'${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}'`;
  }
  if (Array.isArray(v)) return sqlValue(new Uint8Array(v as number[]));
  return `'${String(v).replace(/'/g, "''")}'`;
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** পুরো মূল ডাটাবেস SQL ফাইলে — `wrangler d1 execute <db> --remote --file platform.sql` দিয়ে ফেরানো যায় */
export async function platformSql(db: D1Database): Promise<{ sql: string; tables: Record<string, number> }> {
  const { results: objs } = await db.prepare(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid",
  ).all<{ type: string; name: string; tbl_name: string; sql: string }>();
  const out: string[] = [
    "-- SellxBD মূল ডাটাবেস (f-shop-platform) — ব্যাকআপ " + new Date().toISOString(),
    "-- ফেরাতে: নতুন খালি D1 ডাটাবেসে  npx wrangler d1 execute <নাম> --remote --file platform.sql",
    "-- বাদ: লগইন সেশন, যাচাইয়ের কোড, গতির সীমা (অস্থায়ী)",
    "PRAGMA defer_foreign_keys = TRUE;",
    "",
  ];
  const tables: Record<string, number> = {};
  const tableObjs = objs.filter((o) => o.type === "table" && !SKIP_TABLES.has(o.name));
  for (const t of tableObjs) {
    out.push(`-- ${t.name}`, `DROP TABLE IF EXISTS ${q(t.name)};`, `${t.sql};`);
    let n = 0;
    let off = 0;
    for (;;) {
      const { results } = await db.prepare(`SELECT * FROM ${q(t.name)} ORDER BY rowid LIMIT 500 OFFSET ?`).bind(off).all<Record<string, unknown>>()
        .catch(() => db.prepare(`SELECT * FROM ${q(t.name)} LIMIT 500 OFFSET ?`).bind(off).all<Record<string, unknown>>());
      if (!results.length) break;
      for (const r of results) {
        const cols = Object.keys(r);
        out.push(`INSERT INTO ${q(t.name)} (${cols.map(q).join(", ")}) VALUES (${cols.map((c) => sqlValue(r[c])).join(", ")});`);
      }
      n += results.length;
      off += results.length;
      if (results.length < 500) break;
    }
    tables[t.name] = n;
    out.push("");
  }
  for (const o of objs) {
    if ((o.type === "index" || o.type === "trigger" || o.type === "view") && !SKIP_TABLES.has(o.tbl_name)) out.push(`${o.sql};`);
  }
  out.push("");
  return { sql: out.join("\n"), tables };
}

/* ---------- CSV ---------- */
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // Excel-এ সূত্র হয়ে না চলে
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const BOM = "﻿";

export async function shopsCsv(db: D1Database): Promise<string> {
  const { results } = await db.prepare(
    `SELECT s.slug, s.name, s.owner_email, s.owner_phone, s.plan, s.status, s.balance, s.confirmed_orders, s.created_at, s.last_order_at, s.demo_niche,
       (SELECT hostname FROM domains d WHERE d.shop_id = s.id AND d.status = 'active' LIMIT 1) domain, s.id
     FROM shops s WHERE s.deleted_at IS NULL ORDER BY s.created_at`,
  ).all<Record<string, unknown>>().catch(async () => db.prepare("SELECT * FROM shops WHERE deleted_at IS NULL").all<Record<string, unknown>>());
  if (!results.length) return BOM + "খালি\n";
  const cols = Object.keys(results[0]!);
  return BOM + [cols.join(","), ...results.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

/* ---------- দোকান ---------- */
export async function addShopData(zip: ZipWriter, env: WorkerEnv, s: BackupShop, dir: string) {
  const stub = env.SHOP.getByName(s.id);
  const data = await stub.exportData(s.id);
  await zip.add(`${dir}/shop-data.json`, JSON.stringify({ ...(data as object), slug: s.slug, name: s.name }));
  for (const kind of ["orders", "products", "customers"] as const) {
    const csv = await stub.exportCsv(s.id, kind).catch(() => "");
    if (csv) await zip.add(`${dir}/${kind}.csv`, csv);
  }
}

/** দোকানের সব ছবি — R2-তে থাকলে সেখান থেকে, নইলে দোকানের ডাটাবেস থেকে */
export async function addShopImages(zip: ZipWriter, env: WorkerEnv, s: BackupShop, dir: string): Promise<{ n: number; missing: number }> {
  const stub = env.SHOP.getByName(s.id);
  const list = await stub.imageList(s.id).catch(() => []);
  let n = 0;
  let missing = 0;
  for (const img of list) {
    let body: Uint8Array | null = null;
    const o = env.IMG_BUCKET ? await env.IMG_BUCKET.get(`shops/${s.id}/${img.key}`).catch(() => null) : null;
    if (o) body = new Uint8Array(await o.arrayBuffer());
    else body = (await stub.imageBytes(s.id, img.key).catch(() => null))?.body ?? null;
    if (!body) { missing++; continue; }
    await zip.add(`${dir}/${img.key}`, body, { compress: false });
    n++;
  }
  if (missing) await zip.add(`${dir}/_missing-images.txt`, `${bn(missing)}টা ছবির ফাইল পাওয়া যায়নি (তালিকায় আছে কিন্তু বাইট নেই)।\n`);
  return { n, missing };
}

/* ---------- কোড ---------- */
export async function fetchCode(env: WorkerEnv): Promise<Uint8Array | null> {
  if (env.TEST_MIGRATIONS) return null; // টেস্টে বাইরের নেটওয়ার্ক নয়
  try {
    const r = await fetch(`https://codeload.github.com/${REPO}/zip/refs/heads/main`, { headers: { "user-agent": "sellxbd-backup" }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function addCode(zip: ZipWriter, env: WorkerEnv, dir: string) {
  const code = await fetchCode(env);
  if (code) await zip.add(`${dir}/f-shop-main.zip`, code, { compress: false });
  else await zip.add(`${dir}/code-not-downloaded.txt`, `GitHub থেকে কোড আনা যায়নি। নিজে নামান: https://github.com/${REPO}/archive/refs/heads/main.zip\n`);
}

/* ---------- গোপন চাবি ---------- */
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const SECRET_ITER = 250_000;

export function secretNames(env: WorkerEnv) {
  const has = (k: string) => typeof (env as Record<string, unknown>)[k] === "string" && !!(env as Record<string, unknown>)[k];
  return [
    "SellxBD — গোপন চাবির তালিকা",
    "",
    "Cloudflare → Workers & Pages → f-shop → Settings → Variables and Secrets (Secret হিসেবে, শুধু Production):",
    ...SECRET_KEYS.map((k) => `  ${k}  ${has(k) ? "(বসানো আছে)" : "(নেই)"}`),
    "",
    "GitHub → shariful881/f-shop → Settings → Secrets and variables → Actions:",
    "  CLOUDFLARE_API_TOKEN  (ডিপ্লয়ের টোকেন — Worker থেকে পড়া যায় না, নিজের কাছে আলাদা রাখুন)",
    "",
    "অন্য চাবি (কুরিয়ার, SMS, Telegram, Facebook ইত্যাদি) মূল ডাটাবেসের platform_settings টেবিলে —",
    "1-platform-database/platform.sql-এর ভেতরেই আছে।",
    "",
  ].join("\r\n");
}

/** চাবিগুলো পাসওয়ার্ড দিয়ে তালাবদ্ধ (PBKDF2-SHA256 → AES-256-GCM) */
export async function encryptSecrets(env: WorkerEnv, password: string): Promise<string> {
  const plain: Record<string, string> = {};
  for (const k of SECRET_KEYS) {
    const v = (env as Record<string, unknown>)[k];
    if (typeof v === "string" && v) plain[k] = v;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: SECRET_ITER }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify({ created_at: new Date().toISOString(), secrets: plain }))));
  return JSON.stringify({ v: 1, kdf: "PBKDF2-SHA256", iter: SECRET_ITER, cipher: "AES-256-GCM", salt: b64(salt), iv: b64(iv), data: b64(data) }, null, 1);
}

/** অফলাইনে চাবি খোলার পেজ — ইন্টারনেট ছাড়াই ব্রাউজারে চলে */
export const DECRYPT_HTML = `<!DOCTYPE html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SellxBD — চাবি খুলুন</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#0f172a}h1{color:#0f766e}
input,button,textarea{font:inherit;padding:10px;border-radius:8px;border:1px solid #cbd5e1;width:100%;box-sizing:border-box;margin:6px 0}
button{background:#0f766e;color:#fff;border:0;cursor:pointer}pre{background:#f1f5f9;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-all}
.err{color:#b91c1c}</style></head><body>
<h1>গোপন চাবি খুলুন</h1>
<p>এই পেজটা ইন্টারনেট ছাড়াই চলে। <b>secrets.enc</b> ফাইলটা বেছে, ব্যাকআপ নামানোর সময় দেওয়া পাসওয়ার্ড দিন।</p>
<input type="file" id="f" accept=".enc,.json"><input type="password" id="p" placeholder="পাসওয়ার্ড"><button id="go">খুলুন</button>
<div id="out"></div>
<script>
const d=(s)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
document.getElementById("go").onclick=async()=>{const out=document.getElementById("out");out.textContent="";
try{const f=document.getElementById("f").files[0];if(!f)throw new Error("ফাইল বাছুন");const j=JSON.parse(await f.text());
const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(document.getElementById("p").value),"PBKDF2",false,["deriveKey"]);
const key=await crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt:d(j.salt),iterations:j.iter},base,{name:"AES-GCM",length:256},false,["decrypt"]);
const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:d(j.iv)},key,d(j.data));const o=JSON.parse(new TextDecoder().decode(plain));
const pre=document.createElement("pre");pre.textContent=Object.entries(o.secrets).map(([k,v])=>k+" = "+v).join("\\n")+"\\n\\n(ব্যাকআপ: "+o.created_at+")";out.appendChild(pre);}
catch(e){const p=document.createElement("p");p.className="err";p.textContent=e&&e.name==="OperationError"?"পাসওয়ার্ড ভুল, বা ফাইল নষ্ট।":String(e&&e.message||e);out.appendChild(p);}};
</script></body></html>
`;

/* ---------- README ---------- */
export function readme(opts: { full: boolean; images: boolean; secrets: boolean; shops: BackupShop[]; by: string }) {
  const L = [
    "SellxBD — অফলাইন ব্যাকআপ",
    "=========================",
    `তৈরি: ${new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 16).replace("T", " ")} (ঢাকা) · যিনি নামিয়েছেন: ${opts.by}`,
    `দোকান: ${bn(opts.shops.length)}টা · ছবি: ${opts.images ? "আছে" : "নেই (ভাগে ভাগে আলাদা নামান)"} · তালাবদ্ধ চাবি: ${opts.secrets ? "আছে" : "নেই"}`,
    "",
    "⚠ এই ফাইলে সব দোকানের ক্রেতার নাম, ফোন, ঠিকানা আর প্ল্যাটফর্মের চাবি আছে।",
    "  কাউকে পাঠাবেন না; পেনড্রাইভ/হার্ডডিস্কে রাখুন, সম্ভব হলে তালাবদ্ধ ড্রাইভে।",
    "",
    "ভেতরে কী আছে",
    "------------",
    "1-platform-database/platform.sql  মূল ডাটাবেস (দোকানের তালিকা, ব্যালেন্স, লেনদেন, ডোমেইন, সাপোর্ট, সেটিংস)",
    "1-platform-database/shops.csv     দোকানের তালিকা — Excel-এ খোলে",
    "2-shops/<দোকান>/shop-data.json    দোকানের পুরো ডাটা (পণ্য, অর্ডার, ক্রেতা, পেজ, সেটিংস) — ফেরানোর ফাইল",
    "2-shops/<দোকান>/*.csv             অর্ডার, পণ্য, ক্রেতা — Excel-এ খোলে",
    "3-images/<দোকান>/                 দোকানের ছবি (থাকলে)",
    "4-code/f-shop-main.zip            কোড (GitHub-এর main)",
    "5-secrets/secret-names.txt        কোন গোপন চাবি কোথায় বসাতে হয়",
    "5-secrets/secrets.enc + open-secrets.html  তালাবদ্ধ চাবি; open-secrets.html ব্রাউজারে খুলে পাসওয়ার্ড দিন",
    "manifest.json                     প্রতিটা ফাইলের আকার আর যাচাই-কোড (CRC32)",
    "",
    "কীভাবে ফেরাবেন",
    "-------------",
    "• একটা দোকান: সুপার অ্যাডমিন → দোকান → দোকানটা খুলে \"ব্যাকআপ থেকে ফেরান\" → shop-data.json দিন।",
    "  (ইউজার/পাসওয়ার্ড আর ছবি যেমন আছে তেমন থাকে)",
    "• মূল ডাটাবেস (বড় বিপদে): পিসিতে Node.js আর wrangler লাগবে —",
    "    npx wrangler d1 create f-shop-platform-restore",
    "    npx wrangler d1 execute f-shop-platform-restore --remote --file 1-platform-database/platform.sql",
    "  তারপর wrangler.jsonc-তে database_id বদলে ডিপ্লয়। (৩০ দিনের ভেতরের ভুল হলে Cloudflare-এর",
    "  Time Travel আগে দেখুন: npx wrangler d1 time-travel info f-shop-platform)",
    "• কোড: f-shop-main.zip খুলে README দেখুন; GitHub-এ নতুন repo বানিয়ে push করলেই ডিপ্লয় চলে।",
    "• ছবি: R2 bucket sellxbd-images-এ shops/<দোকানের id>/<ফাইল> পথে তুলতে হয় (দোকানের id shops.csv-এ)।",
    "",
    "পরামর্শ: সপ্তাহে একবার পুরো ব্যাকআপ, মাসে একবার ছবিসহ। দুই জায়গায় রাখুন (পিসি + পেনড্রাইভ/হার্ডডিস্ক)।",
    "",
  ];
  return "﻿" + L.join("\r\n");
}

export const manifest = (zip: ZipWriter, extra: Record<string, unknown>) =>
  JSON.stringify({ app: "SellxBD", created_at: new Date().toISOString(), ...extra, files: zip.files }, null, 1);

/** ZIP ডাউনলোডের উত্তর — বানানো চলতে থাকে পেছনে, ব্রাউজারে সাথে সাথে নামা শুরু */
export function zipResponse(name: string, build: (zip: ZipWriter) => Promise<void>, waitUntil: (p: Promise<unknown>) => void): Response {
  const zip = new ZipWriter();
  const job = (async () => {
    try {
      await build(zip);
      await zip.finish();
    } catch (e) {
      console.error("backup zip", e);
      await zip.abort(e);
    }
  })();
  try { waitUntil(job); } catch { /* টেস্ট */ }
  return new Response(zip.readable, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}.zip"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
