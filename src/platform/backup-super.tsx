/**
 * সুপার অ্যাডমিন → ব্যাকআপ (শুধু মালিক)
 * পুরো প্রজেক্ট এক ZIP-এ, বা ভাগে ভাগে নামানো। আগে পাসওয়ার্ড দিয়ে ১৫ মিনিটের জন্য খুলতে হয়।
 */
import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { verifyPassword } from "../shop/lib/auth";
import { bn } from "../shop/lib/format";
import { isHttps } from "../shop/lib/http";
import { sha256Hex } from "../shop/lib/auth";
import type { PCtx, PEnv } from "./lib";
import { Card, ago } from "./super-views";
import {
  addCode, addShopData, addShopImages, backupName, backupShops, DECRYPT_HTML, encryptSecrets, fetchCode, manifest, platformSql, readme,
  secretNames, shopsCsv, zipResponse, type BackupShop,
} from "./backup";
import type { ZipWriter } from "./zip";

type Helpers = {
  page: (c: PCtx, title: string, active: string, body: unknown, status?: 200 | 404 | 422, actions?: unknown) => Promise<Response>;
  allowed: (c: PCtx, perm: string) => boolean;
  forbidden: (c: PCtx) => Response;
  flash: (c: PCtx, type: "ok" | "error", text: string) => void;
  audit: (c: PCtx, action: string, targetType: string | null, targetId: string | null, detail?: string) => Promise<void>;
};

const COOKIE = "sx_bk";
const UNLOCK_MIN = 15;
const PASS_MIN = 10;

const unlockKey = (c: PCtx) => `backup_unlock:${c.var.superAdmin!.id}`;

async function unlocked(c: PCtx): Promise<boolean> {
  const tok = getCookie(c, COOKIE);
  if (!tok || !/^[0-9a-f]{64}$/.test(tok)) return false;
  const row = await c.env.PLATFORM_DB.prepare("SELECT value FROM platform_settings WHERE key = ?").bind(unlockKey(c)).first<{ value: string }>();
  if (!row) return false;
  const [hash, exp] = row.value.split("|");
  return hash === (await sha256Hex(tok)) && Number(exp) > Date.now();
}

const fmtBytes = (b: number | null | undefined) =>
  !b ? "—" : b < 1024 * 1024 ? `${bn(Math.max(1, Math.round(b / 1024)))} KB` : `${bn((b / 1024 / 1024).toFixed(1))} MB`;

const BackupPage = (p: { open: boolean; shops: BackupShop[]; last: { full: string | null; images: string | null }; secretsSet: number; codeOk?: boolean }) => (
  <div class="sa-grid bk">
    <Card title="ব্যাকআপ কেন, কীভাবে">
      <p>এখান থেকে পুরো SellxBD — মূল ডাটাবেস, সব দোকানের ডাটা, ছবি, কোড আর গোপন চাবি — আপনার পিসিতে নামানো যায়। ব্যাকআপ কোথাও জমা থাকে না, সরাসরি নামে।</p>
      <ul class="bk-tips">
        <li><b>সপ্তাহে একবার</b> পুরো ব্যাকআপ, <b>মাসে একবার</b> ছবিসহ। দুই জায়গায় রাখুন: পিসি + পেনড্রাইভ/হার্ডডিস্ক।</li>
        <li>ফাইলে সব ক্রেতার নাম, ফোন, ঠিকানা আছে — কাউকে পাঠাবেন না।</li>
        <li>শেষ পুরো ব্যাকআপ: <b class={!p.last.full ? "bk-warn" : ""}>{p.last.full ? ago(p.last.full) : "কখনো না"}</b> · ছবিসহ: <b>{p.last.images ? ago(p.last.images) : "কখনো না"}</b></li>
      </ul>
    </Card>

    {!p.open ? (
      <Card title="🔒 আগে পাসওয়ার্ড দিন">
        <form method="post" action="/super/backup/unlock" class="sa-form bk-unlock">
          <label>আপনার সুপার অ্যাডমিন পাসওয়ার্ড
            <input type="password" name="password" required autocomplete="current-password" autofocus />
          </label>
          <button class="sa-btn sa-btn-primary">খুলুন ({bn(UNLOCK_MIN)} মিনিটের জন্য)</button>
        </form>
      </Card>
    ) : (
      <>
        <Card title="১. পুরো ব্যাকআপ (এক ফাইলে)" action={<form method="post" action="/super/backup/lock"><button class="sa-btn sa-btn-sm">🔒 বন্ধ করুন</button></form>}>
          <form method="post" action="/super/backup/full" class="sa-form bk-full" data-bk-full>
            <p class="sa-muted">ZIP-এর ভেতরে প্রতিটা অংশ আলাদা ফোল্ডারে: 1-platform-database, 2-shops, 3-images, 4-code, 5-secrets, সাথে বাংলায় README।</p>
            <label class="sa-check"><input type="checkbox" name="images" value="1" /> ছবিসহ <span class="sa-muted">(ফাইল অনেক বড় হবে, সময় লাগবে)</span></label>
            <label class="sa-check"><input type="checkbox" name="secrets" value="1" data-bk-secret-toggle /> গোপন চাবিসহ — পাসওয়ার্ড দিয়ে তালাবদ্ধ</label>
            <div class="bk-pass" data-bk-pass hidden>
              <label>চাবির পাসওয়ার্ড (কমপক্ষে {bn(PASS_MIN)} অক্ষর)<input type="password" name="pass" minlength={PASS_MIN} autocomplete="new-password" /></label>
              <label>আবার লিখুন<input type="password" name="pass2" minlength={PASS_MIN} autocomplete="new-password" /></label>
              <p class="bk-warn">এই পাসওয়ার্ড ভুলে গেলে চাবি আর খোলা যাবে না। কোথাও লিখে রাখুন (ব্যাকআপ ফাইলের সাথে নয়)।</p>
            </div>
            <button class="sa-btn sa-btn-primary bk-big">⬇ পুরো ব্যাকআপ নামান</button>
            <p class="sa-muted">নামা শুরু হলে ব্রাউজারের ডাউনলোডে অগ্রগতি দেখবেন। শেষ না হওয়া পর্যন্ত পেজ বন্ধ করবেন না।</p>
          </form>
        </Card>

        <Card title="২. ভাগে ভাগে নামান">
          <div class="sa-table-wrap">
            <table class="sa-table bk-table">
              <thead><tr><th>অংশ</th><th>আকার</th><th></th></tr></thead>
              <tbody>
                <tr><td><b>মূল ডাটাবেস</b><br /><small class="sa-muted">দোকানের তালিকা, ব্যালেন্স, লেনদেন, ডোমেইন, সাপোর্ট, সেটিংস</small></td><td>—</td>
                  <td><div class="bk-act"><a class="sa-btn sa-btn-sm" href="/super/backup/platform.zip">SQL + CSV</a></div></td></tr>
                <tr><td><b>কোড</b><br /><small class="sa-muted">GitHub-এর main (সর্বশেষ)</small></td><td>—</td>
                  <td><div class="bk-act"><a class="sa-btn sa-btn-sm" href="/super/backup/code.zip">ZIP</a></div></td></tr>
                <tr><td><b>গোপন চাবি</b><br /><small class="sa-muted">Worker-এ বসানো: {bn(p.secretsSet)}টা</small></td><td>—</td>
                  <td><div class="bk-act">
                    <a class="sa-btn sa-btn-sm" href="/super/backup/secret-names.txt">নামের তালিকা</a>
                    <details class="bk-sec"><summary class="sa-btn sa-btn-sm">তালাবদ্ধ চাবি</summary>
                      <form method="post" action="/super/backup/secrets.zip" class="sa-form">
                        <input type="password" name="pass" minlength={PASS_MIN} required placeholder={`পাসওয়ার্ড (${bn(PASS_MIN)}+ অক্ষর)`} autocomplete="new-password" />
                        <input type="password" name="pass2" minlength={PASS_MIN} required placeholder="আবার লিখুন" autocomplete="new-password" />
                        <button class="sa-btn sa-btn-sm sa-btn-primary">নামান</button>
                      </form>
                    </details>
                  </div></td></tr>
                {p.shops.map((s) => (
                  <tr>
                    <td><b>{s.name}</b> {s.demo_niche && <span class="sa-pill">ডেমো</span>}<br /><small class="sa-muted">{s.slug}</small></td>
                    <td>{fmtBytes(s.db_bytes)}</td>
                    <td><div class="bk-act">
                      <a class="sa-btn sa-btn-sm" href={`/super/backup/shop/${s.id}/data.zip`}>ডাটা + Excel</a>
                      <a class="sa-btn sa-btn-sm" href={`/super/backup/shop/${s.id}/images.zip`}>ছবি</a>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="sa-muted">"ডাটা + Excel"-এর shop-data.json দিয়ে দোকানের পেজের "ব্যাকআপ থেকে ফেরান" চলে।</p>
        </Card>
      </>
    )}
    <script dangerouslySetInnerHTML={{ __html: `document.addEventListener("change",function(e){var t=e.target;if(t&&t.matches&&t.matches("[data-bk-secret-toggle]")){var b=document.querySelector("[data-bk-pass]");if(b){b.hidden=!t.checked;b.querySelectorAll("input").forEach(function(i){i.required=t.checked;});}}});` }} />
  </div>
);

export function registerSuperBackup(app: Hono<PEnv>, h: Helpers) {
  const guard = async (c: PCtx) => {
    if (!h.allowed(c, "backup")) return h.forbidden(c);
    if (!(await unlocked(c))) { h.flash(c, "error", "আগে পাসওয়ার্ড দিয়ে ব্যাকআপ খুলুন।"); return c.redirect("/super/backup", 303); }
    return null;
  };
  const wait = (c: PCtx) => (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
  const by = (c: PCtx) => c.var.superAdmin!.email;

  app.get("/backup", async (c) => {
    if (!h.allowed(c, "backup")) return h.forbidden(c);
    const db = c.env.PLATFORM_DB;
    const [shops, last, lastImg] = await Promise.all([
      backupShops(db),
      db.prepare("SELECT created_at FROM audit_log WHERE action = 'backup.full' ORDER BY id DESC LIMIT 1").first<{ created_at: string }>(),
      db.prepare("SELECT created_at FROM audit_log WHERE action = 'backup.full' AND detail LIKE '%ছবিসহ%' ORDER BY id DESC LIMIT 1").first<{ created_at: string }>(),
    ]);
    const secretsSet = (["CF_API_TOKEN", "PORKBUN_API_KEY", "PORKBUN_SECRET_KEY"] as const).filter((k) => !!c.env[k]).length;
    return h.page(c, "ব্যাকআপ", "backup",
      <BackupPage open={await unlocked(c)} shops={shops} last={{ full: last?.created_at ?? null, images: lastImg?.created_at ?? null }} secretsSet={secretsSet} />);
  });

  app.post("/backup/unlock", async (c) => {
    if (!h.allowed(c, "backup")) return h.forbidden(c);
    const b = await c.req.parseBody();
    const row = await c.env.PLATFORM_DB.prepare("SELECT password_hash FROM super_admins WHERE id = ?").bind(c.var.superAdmin!.id).first<{ password_hash: string }>();
    if (!row || !(await verifyPassword(String(b.password ?? ""), row.password_hash))) {
      await h.audit(c, "backup.unlock_fail", null, null, "ব্যাকআপ খুলতে ভুল পাসওয়ার্ড");
      h.flash(c, "error", "পাসওয়ার্ড মেলেনি।");
      return c.redirect("/super/backup", 303);
    }
    const tok = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("");
    await c.env.PLATFORM_DB.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(unlockKey(c), `${await sha256Hex(tok)}|${Date.now() + UNLOCK_MIN * 60_000}`).run();
    setCookie(c, COOKIE, tok, { path: "/super/backup", httpOnly: true, sameSite: "Strict", secure: isHttps(c), maxAge: UNLOCK_MIN * 60 });
    await h.audit(c, "backup.unlock", null, null, "ব্যাকআপ খোলা");
    return c.redirect("/super/backup", 303);
  });

  app.post("/backup/lock", async (c) => {
    if (!h.allowed(c, "backup")) return h.forbidden(c);
    await c.env.PLATFORM_DB.prepare("DELETE FROM platform_settings WHERE key = ?").bind(unlockKey(c)).run();
    deleteCookie(c, COOKIE, { path: "/super/backup" });
    return c.redirect("/super/backup", 303);
  });

  /** চাবির পাসওয়ার্ড যাচাই — ঠিক থাকলে পাসওয়ার্ড, নইলে ভুলের বার্তা */
  const passFrom = (b: Record<string, unknown>): { pass: string } | { error: string } => {
    const pass = String(b.pass ?? "");
    if (pass.length < PASS_MIN) return { error: `চাবির পাসওয়ার্ড কমপক্ষে ${bn(PASS_MIN)} অক্ষর দিন।` };
    if (pass !== String(b.pass2 ?? "")) return { error: "চাবির দুটো পাসওয়ার্ড মেলেনি।" };
    return { pass };
  };

  const addSecrets = async (zip: ZipWriter, c: PCtx, pass: string | null) => {
    await zip.add("5-secrets/secret-names.txt", "﻿" + secretNames(c.env));
    if (pass) {
      await zip.add("5-secrets/secrets.enc", await encryptSecrets(c.env, pass));
      await zip.add("5-secrets/open-secrets.html", DECRYPT_HTML);
    }
  };

  app.post("/backup/full", async (c) => {
    const g = await guard(c); if (g) return g;
    const b = await c.req.parseBody();
    const images = b.images === "1";
    let pass: string | null = null;
    if (b.secrets === "1") {
      const r = passFrom(b);
      if ("error" in r) { h.flash(c, "error", r.error); return c.redirect("/super/backup", 303); }
      pass = r.pass;
    }
    const shops = await backupShops(c.env.PLATFORM_DB);
    await h.audit(c, "backup.full", null, null, `পুরো ব্যাকআপ — ${shops.length}টা দোকান${images ? ", ছবিসহ" : ""}${pass ? ", তালাবদ্ধ চাবিসহ" : ""}`);
    const env = c.env;
    return zipResponse(backupName(images ? "full-with-images" : "full"), async (zip) => {
      await zip.add("README.txt", readme({ full: true, images, secrets: !!pass, shops, by: by(c) }));
      const p = await platformSql(env.PLATFORM_DB);
      await zip.add("1-platform-database/platform.sql", p.sql);
      await zip.add("1-platform-database/shops.csv", await shopsCsv(env.PLATFORM_DB));
      const errors: string[] = [];
      for (const s of shops) {
        await addShopData(zip, env, s, `2-shops/${s.slug}`).catch((e) => errors.push(`${s.slug}: ডাটা — ${String(e)}`));
      }
      if (images) for (const s of shops) {
        await addShopImages(zip, env, s, `3-images/${s.slug}`).catch((e) => errors.push(`${s.slug}: ছবি — ${String(e)}`));
      }
      await addCode(zip, env, "4-code");
      await addSecrets(zip, c, pass);
      if (errors.length) await zip.add("PROBLEMS.txt", "﻿" + "এগুলো ব্যাকআপে আসেনি — আলাদা করে নামান:\r\n" + errors.join("\r\n"));
      await zip.add("manifest.json", manifest(zip, { kind: "full", images, secrets: !!pass, shops: shops.length, platform_tables: p.tables, errors }));
    }, wait(c));
  });

  app.get("/backup/platform.zip", async (c) => {
    const g = await guard(c); if (g) return g;
    await h.audit(c, "backup.platform", null, null, "মূল ডাটাবেস নামানো");
    const env = c.env;
    return zipResponse(backupName("platform-database"), async (zip) => {
      const p = await platformSql(env.PLATFORM_DB);
      await zip.add("platform.sql", p.sql);
      await zip.add("shops.csv", await shopsCsv(env.PLATFORM_DB));
      await zip.add("manifest.json", manifest(zip, { kind: "platform", platform_tables: p.tables }));
    }, wait(c));
  });

  const loadShop = (c: PCtx) =>
    c.env.PLATFORM_DB.prepare("SELECT id, slug, name, status, db_bytes, demo_niche FROM shops WHERE id = ? AND deleted_at IS NULL").bind(c.req.param("id")).first<BackupShop>();

  app.get("/backup/shop/:id/data.zip", async (c) => {
    const g = await guard(c); if (g) return g;
    const s = await loadShop(c);
    if (!s) return c.notFound();
    await h.audit(c, "backup.shop", "shop", s.id, "দোকানের ডাটা নামানো");
    const env = c.env;
    return zipResponse(backupName(`${s.slug}-data`), async (zip) => {
      await addShopData(zip, env, s, s.slug);
      await zip.add("manifest.json", manifest(zip, { kind: "shop", shop: s.slug, shop_id: s.id }));
    }, wait(c));
  });

  app.get("/backup/shop/:id/images.zip", async (c) => {
    const g = await guard(c); if (g) return g;
    const s = await loadShop(c);
    if (!s) return c.notFound();
    await h.audit(c, "backup.images", "shop", s.id, "দোকানের ছবি নামানো");
    const env = c.env;
    return zipResponse(backupName(`${s.slug}-images`), async (zip) => {
      const r = await addShopImages(zip, env, s, s.slug);
      await zip.add("manifest.json", manifest(zip, { kind: "images", shop: s.slug, shop_id: s.id, images: r.n, missing: r.missing }));
    }, wait(c));
  });

  app.get("/backup/code.zip", async (c) => {
    const g = await guard(c); if (g) return g;
    await h.audit(c, "backup.code", null, null, "কোড নামানো");
    const code = await fetchCode(c.env);
    if (!code) { h.flash(c, "error", "GitHub থেকে কোড আনা যায়নি — github.com থেকে সরাসরি নামান।"); return c.redirect("/super/backup", 303); }
    return new Response(code, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${backupName("code")}.zip"`, "cache-control": "no-store" } });
  });

  app.get("/backup/secret-names.txt", async (c) => {
    const g = await guard(c); if (g) return g;
    return new Response("﻿" + secretNames(c.env), { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${backupName("secret-names")}.txt"`, "cache-control": "no-store" } });
  });

  app.post("/backup/secrets.zip", async (c) => {
    const g = await guard(c); if (g) return g;
    const r = passFrom(await c.req.parseBody());
    if ("error" in r) { h.flash(c, "error", r.error); return c.redirect("/super/backup", 303); }
    await h.audit(c, "backup.secrets", null, null, "তালাবদ্ধ চাবি নামানো");
    return zipResponse(backupName("secrets"), async (zip) => {
      await addSecrets(zip, c, r.pass);
      await zip.add("README.txt", "﻿open-secrets.html ব্রাউজারে খুলুন, secrets.enc বেছে পাসওয়ার্ড দিন। ইন্টারনেট লাগে না।\r\n");
    }, wait(c));
  });
}
