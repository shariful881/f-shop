/**
 * সুপার অ্যাডমিন → ডোমেইন বিক্রি: চালু/বন্ধ, ডলার রেট, লাভ, TLD, সর্বোচ্চ দাম; Porkbun সংযোগ যাচাই;
 * বিক্রি করা ডোমেইনের তালিকা আর লাভ।
 */
import type { Hono } from "hono";
import { bn } from "../shop/lib/format";
import { str, toInt } from "../shop/lib/http";
import { clearSettingsCache, platformSettings } from "./billing";
import { bdtPrice, saleConfig, type RegRow } from "./domain-sale";
import type { PCtx, PEnv } from "./lib";
import { pbError, porkbunFromEnv } from "./porkbun";
import { Card } from "./super-views";

type Helpers = {
  page: (c: PCtx, title: string, active: string, body: unknown, status?: 200 | 404 | 422, actions?: unknown) => Promise<Response>;
  allowed: (c: PCtx, perm: string) => boolean;
  forbidden: (c: PCtx) => Response;
  flash: (c: PCtx, type: "ok" | "error", text: string) => void;
  audit: (c: PCtx, action: string, targetType: string | null, targetId: string | null, detail?: string) => Promise<void>;
};

type Row = RegRow & { shop_name: string | null; shop_slug: string | null };

const STATUS: Record<string, string> = { registering: "কেনা হচ্ছে", active: "সক্রিয়", failed: "ব্যর্থ", expired: "মেয়াদ শেষ", transferred: "ট্রান্সফার হয়েছে" };

const DomainSalePage = (p: {
  s: Record<string, string>; configured: boolean; sandbox: boolean; ping?: { ok: boolean; account?: string; message?: string };
  rows: Row[]; sold: number; revenue: number; costUsd: number;
}) => {
  const cfg = saleConfig(p.s);
  const example = bdtPrice(11.08, cfg);
  return (
    <div class="sa-grid-2">
      <Card title="Porkbun সংযোগ">
        {!p.configured ? (
          <div class="sa-form">
            <p class="sa-muted">চাবি বসানো নেই। Cloudflare-এ Worker-এর secret হিসেবে দুটো বসাতে হবে:</p>
            <pre class="sa-pre">npx wrangler secret put PORKBUN_API_KEY{"\n"}npx wrangler secret put PORKBUN_SECRET_KEY</pre>
            <p class="sa-muted">পরীক্ষার জন্য আগে sandbox চাবি (pk1_sb_… / sk1_sb_…) — আসল টাকা কাটে না। ঠিক থাকলে আসল চাবি।</p>
          </div>
        ) : (
          <div class="sa-form">
            <p>{p.ping?.ok ? <>✅ সংযোগ ঠিক আছে{p.ping.account ? <> — অ্যাকাউন্ট <b>{p.ping.account}</b></> : null}</> : <>❌ সংযোগ হয়নি: {p.ping?.message}</>}</p>
            {p.sandbox && <p class="sa-badge sa-badge-warn">Sandbox চাবি — নকল ক্রেডিট, আসল ডোমেইন কেনা হয় না</p>}
            <p class="sa-muted">Porkbun অ্যাকাউন্টে: ক্রেডিট জমা রাখুন (Account → Billing), API Settings-এ মাসিক খরচের সীমা ঠিক করুন (ডিফল্ট $১০০), চাবির "purchase" অনুমতি চালু রাখুন, আর কম ব্যালেন্সের ইমেইল সতর্কবার্তা চালু করুন।</p>
          </div>
        )}
      </Card>

      <Card title="দাম আর চালু/বন্ধ">
        <form method="post" action="/super/domain-sale" class="sa-form">
          <label class="sa-check"><input type="checkbox" name="domain_sale" value="1" checked={cfg.enabled} /> দোকানদারের প্যানেলে "নতুন ডোমেইন কিনুন" দেখাবে</label>
          <label>১ ডলার = কত টাকা (কার্ডের ফি সহ)</label><input type="number" min="80" max="300" name="domain_usd_rate" value={String(cfg.rate)} required />
          <label>প্রতি ডোমেইনে লাভ (৳, প্রতি বছর)</label><input type="number" min="0" max="5000" name="domain_markup" value={String(cfg.markup)} required />
          <label>যেসব TLD বিক্রি হবে (কমা দিয়ে)</label><input type="text" name="domain_tlds" value={cfg.tlds.join(", ")} required />
          <label>সর্বোচ্চ Porkbun দাম ($, প্রথম বছর বা রিনিউ)</label><input type="number" min="1" max="100" name="domain_max_usd" value={String(cfg.maxUsd)} required />
          <small class="sa-muted">দোকানদারের দাম = Porkbun-এর দাম × রেট + লাভ, ১০ টাকায় উপরে গোল। যেমন $১১.০৮ → ৳{bn(example)}। .com.bd বিক্রি করা যায় না (BTCL-এর API নেই); premium ডোমেইন API-তে কেনা যায় না।</small>
          <button class="sa-btn sa-btn-primary">সেভ করুন</button>
        </form>
      </Card>

      <Card title={`বিক্রি করা ডোমেইন (${bn(p.rows.length)})`} class="sa-span-2">
        <p class="sa-muted">মোট সক্রিয় {bn(p.sold)}টা · দোকানদারের কাছ থেকে মোট ৳{bn(p.revenue)} · Porkbun-কে ${(p.costUsd).toFixed(2)} (≈ ৳{bn(Math.round(p.costUsd * cfg.rate))}) · লাভ ≈ ৳{bn(p.revenue - Math.round(p.costUsd * cfg.rate))}</p>
        {p.rows.length === 0 ? <p class="sa-muted">এখনো কোনো ডোমেইন বিক্রি হয়নি।</p> : (
          <div class="sa-table-wrap">
            <table class="sa-table">
              <thead><tr><th>ডোমেইন</th><th>দোকান</th><th>অবস্থা</th><th>মেয়াদ</th><th>নেমসার্ভার</th><th class="num">দাম</th><th class="num">খরচ</th><th>অটো-রিনিউ</th></tr></thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr>
                    <td><b>{r.domain}</b>{r.error && <small class="sa-muted" style="display:block;color:#b91c1c">{r.error}</small>}</td>
                    <td>{r.shop_slug ? <a href={`/super/shops/${r.shop_id}`}>{r.shop_name || r.shop_slug}</a> : r.shop_id}</td>
                    <td>{STATUS[r.status] ?? r.status}</td>
                    <td>{r.expires_at ?? "—"}</td>
                    <td>{r.ns_ok ? "বসেছে" : "বাকি"}</td>
                    <td class="num">৳{bn(r.price_bdt ?? 0)}</td>
                    <td class="num">${((r.cost_cents ?? 0) / 100).toFixed(2)}</td>
                    <td>{r.auto_renew ? "চালু" : "বন্ধ"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p class="sa-muted">ট্রান্সফার চাইলে: Porkbun-এ ডোমেইন আনলক করে auth code দোকানদারকে দিন, তারপর এখানে অবস্থা হাতে বদলানোর দরকার নেই — রিনিউ আর হবে না কারণ ডোমেইন আর আমাদের অ্যাকাউন্টে থাকবে না (cron ব্যর্থ হলে সুপার অ্যাডমিনে এরর দেখাবে)।</p>
      </Card>
    </div>
  );
};

export function registerSuperDomainSale(app: Hono<PEnv>, h: Helpers) {
  app.get("/domain-sale", async (c) => {
    if (!h.allowed(c, "settings")) return h.forbidden(c);
    const db = c.env.PLATFORM_DB;
    const pb = porkbunFromEnv(c.env);
    const [s, rows, ping] = await Promise.all([
      platformSettings(db, true),
      db.prepare(`SELECT r.*, s.name AS shop_name, s.slug AS shop_slug FROM domain_regs r LEFT JOIN shops s ON s.id = r.shop_id ORDER BY r.created_at DESC LIMIT 300`).all<Row>(),
      pb.configured ? pb.ping() : Promise.resolve(null),
    ]);
    const list = rows.results;
    const paid = list.filter((r) => r.status === "active" || r.status === "expired" || r.status === "transferred");
    const tot = await db.prepare("SELECT -COALESCE(SUM(amount), 0) n FROM ledger WHERE applied = 1 AND type IN ('domain_buy', 'domain_renew', 'domain_refund')").first<{ n: number }>();
    return h.page(c, "ডোমেইন বিক্রি", "domain-sale",
      <DomainSalePage s={s} configured={pb.configured} sandbox={pb.sandbox}
        ping={ping ? { ok: ping.ok, account: ping.data.account, message: ping.ok ? undefined : pbError(ping.code, ping.message) } : undefined}
        rows={list} sold={paid.filter((r) => r.status === "active").length} revenue={tot?.n ?? 0}
        costUsd={paid.reduce((n, r) => n + (r.cost_cents ?? 0), 0) / 100} />);
  });

  app.post("/domain-sale", async (c) => {
    if (!h.allowed(c, "settings")) return h.forbidden(c);
    const b = await c.req.parseBody();
    const db = c.env.PLATFORM_DB;
    const tlds = str(b.domain_tlds, 200).toLowerCase().split(/[\s,]+/).map((t) => t.replace(/^\./, "")).filter((t) => /^[a-z]{2,24}$/.test(t)).slice(0, 12);
    const values: [string, string][] = [
      ["domain_sale", b.domain_sale === "1" ? "1" : "0"],
      ["domain_usd_rate", String(Math.min(300, Math.max(80, toInt(b.domain_usd_rate, 130))))],
      ["domain_markup", String(Math.min(5000, Math.max(0, toInt(b.domain_markup, 300))))],
      ["domain_tlds", (tlds.length ? tlds : ["com"]).join(",")],
      ["domain_max_usd", String(Math.min(100, Math.max(1, toInt(b.domain_max_usd, 30))))],
    ];
    await db.batch(values.map(([k, v]) => db.prepare("INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v)));
    clearSettingsCache();
    await h.audit(c, "domain_sale.settings", "settings", null, values.map(([k, v]) => `${k}=${v}`).join(", "));
    h.flash(c, "ok", "ডোমেইন বিক্রির সেটিংস সেভ হয়েছে।");
    return c.redirect("/super/domain-sale", 303);
  });
}
