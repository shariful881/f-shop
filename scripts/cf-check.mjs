// শুধু GET — টোকেন, R2, Workers প্ল্যান কী অবস্থায় আছে
import { readFileSync } from "node:fs";
const cfg = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const account = /"account_id":\s*"([^"]+)"/.exec(cfg)[1];
const domain = /"PLATFORM_DOMAIN":\s*"([^"]+)"/.exec(cfg)[1];
const t = process.env.CLOUDFLARE_API_TOKEN;
const api = async (p) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${p}`, { headers: { Authorization: `Bearer ${t}` } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: !!j.success, result: j.result, errors: (j.errors || []).map((e) => `${e.code}: ${e.message}`) };
};
const show = (name, r, pick = (x) => x) => console.log(`== ${name}: HTTP ${r.status} ${r.ok ? "OK" : "FAIL"} ${r.ok ? JSON.stringify(pick(r.result)) : JSON.stringify(r.errors)}`);
show("token verify", await api("/user/tokens/verify"), (x) => x.status);
show("R2 buckets", await api(`/accounts/${account}/r2/buckets`), (x) => (x.buckets || []).map((b) => b.name));
show("Workers subscription", await api(`/accounts/${account}/workers/subscription`), (x) => x);
show("Account subscriptions", await api(`/accounts/${account}/subscriptions`), (x) => (x || []).map((s) => ({ product: s.rate_plan?.id || s.product?.name, price: s.price, state: s.state })));
const zones = await api(`/zones?name=${domain}`);
show("Zone", zones, (x) => x.map((z) => ({ name: z.name, plan: z.plan?.name })));
if (zones.ok && zones.result[0]) show("Worker routes", await api(`/zones/${zones.result[0].id}/workers/routes`), (x) => x.map((r) => `${r.pattern} -> ${r.script || "(none)"}`));
show("Workers scripts", await api(`/accounts/${account}/workers/scripts`), (x) => x.map((s) => s.id));
show("Account settings (usage model)", await api(`/accounts/${account}/workers/account-settings`), (x) => x);
