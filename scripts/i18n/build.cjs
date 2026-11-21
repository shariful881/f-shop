// অভিধান বানানো: node scripts/i18n/build.cjs (scripts/i18n ফোল্ডার থেকে tr/, extra.json, overrides.json পড়ে)
process.chdir(__dirname);
const fs = require("fs");
const keys = require("./keys.json");
const tr = {}; for (const f of fs.readdirSync("tr").sort()) Object.assign(tr, JSON.parse(fs.readFileSync("tr/" + f)));
const extra = fs.existsSync("extra.json") ? JSON.parse(fs.readFileSync("extra.json")) : {};
const ov = JSON.parse(fs.readFileSync("overrides.json"));
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
const nk = (k) => dec(k).replace(/\s+/g, " ").trim();
const all = {}, client = {}, site = {};
const ADMIN_ONLY = /^(public\/js\/(admin|builder|design|media|support|invoice|signup)\.js|src\/shop\/routes\/(admin|support)\.tsx)/;
const add = (k, en, isClient, isSite) => { k = nk(k); if (!k || !en) return; all[k] = en; if (isClient) client[k] = en; if (isSite) site[k] = en; };
for (const k of keys) {
  const cl = k.locs.some((l) => /^(public\/js|src\/shop\/(routes|lib|app))/.test(l));
  add(k.k, tr[k.id], cl, cl && k.locs.some((l) => !ADMIN_ONLY.test(l)));
}
for (const [k, en] of Object.entries(extra)) add(k, en, true);
// পাশাপাশি দুটো {x} আলাদা করা যায় না — একটা করা (ইংরেজিতেও পাশাপাশি থাকলে); না মিললে বাদ
for (const o of [all, client, site]) for (const k of Object.keys(o)) {
  if (!k.includes("{x}{x}")) continue;
  const v = o[k]; delete o[k];
  if ((v.match(/\{x\}\{x\}/g) || []).length !== (k.match(/\{x\}\{x\}/g) || []).length) continue;
  o[k.replace(/\{x\}\{x\}/g, "{x}")] = v.replace(/\{x\}\{x\}/g, "{x}");
}
// দুই পাশের চিহ্ন ছাড়া রূপও রাখা — লেখার মাঝে অংশ হিসেবে এলে মেলে ("— বাড়তি…", "(সেট করা নেই)")
const BNc = "\u0980-\u09F2\u09F4-\u09FF";
const wrapRe = new RegExp("^([^" + BNc + "{]*)([\\s\\S]*?)([^" + BNc + "}]*)$");
for (const o of [all, client, site]) for (const k of Object.keys(o)) {
  const m = wrapRe.exec(k);
  if (!m || !(m[1] || m[3]) || !m[2] || m[2] in o || !new RegExp("[" + BNc + "]").test(m[2].replace(/\{[nx]\}/g, ""))) continue;
  let v = o[k].replace(/^[\s—–\-·•:(\[✓✕+→←↩✍️🖼️⭐🛒]+/u, "").replace(/[\s:)\]।.→←]+$/u, "");
  if (v) o[m[2]] = v;
}
// হাতে ঠিক করা (key একক {x} রূপে)
for (const [k, en] of Object.entries(ov)) { const kk = nk(k); all[kk] = en; client[kk] = en; }
const D = require("path").join(__dirname, "../../src/shop/i18n/") + "/";
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(D + "en.json", JSON.stringify(sortObj(all), null, 1) + "\n");
fs.writeFileSync(D + "en-client.json", JSON.stringify(sortObj(client)) + "\n");
fs.writeFileSync(D + "en-site.json", JSON.stringify(sortObj(site)) + "\n");
console.log("site", Object.keys(site).length, JSON.stringify(site).length, "all", Object.keys(all).length, "client", Object.keys(client).length, "bytes", JSON.stringify(client).length);
