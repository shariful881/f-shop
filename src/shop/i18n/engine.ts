/**
 * অনুবাদের ইঞ্জিন — সার্ভার আর ব্রাউজার দুই জায়গাতেই একই কোড চলে
 * (ব্রাউজারে makeTranslator.toString() পাঠানো হয়, তাই ভেতরে বাইরের কিছু ব্যবহার করা যাবে না)।
 *
 * অভিধানের key = বাংলা লেখা, যেখানে:
 *   - সংখ্যা (বাংলা/ইংরেজি) → {n}
 *   - কোডের ভেতরের পরিবর্তনশীল অংশ (নাম ইত্যাদি) → {x}
 *   - ফাঁকা জায়গা একটাই, দুই পাশে ফাঁকা নেই
 * value = ইংরেজি; {n} ক্রমানুসারে; {x} ক্রমানুসারে, অথবা {x1} {x2}… দিয়ে ক্রম বদলানো যায়।
 *
 * খোঁজার ধাপ: হুবহু → টেমপ্লেট ({x}) → দুই পাশের চিহ্ন/ইমোজি বাদ দিয়ে → প্রতিটা বাংলা অংশ আলাদা করে।
 * কোনো ধাপে না মিললে লেখা যেমন আছে তেমনই থাকে (দোকানদারের নিজের লেখা এভাবেই বাঁচে)।
 */
export function makeTranslator(dict: Record<string, string>) {
  // বাংলা অক্ষর (৳ চিহ্ন বাদ — ওটা দামের সাথে দুই ভাষাতেই থাকে)
  var BN = /[ঀ-৲৴-৿]/;
  var NUM = /[0-9০-৯]+(?:[.,][0-9০-৯]+)*/g;
  var exact: Record<string, string> = Object.create(null);
  var tpls: { re: RegExp; chunk: string; lit: number; en: string }[] = [];
  function esc(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  for (var k in dict) {
    var en = dict[k]!;
    if (!en) continue;
    if (k.indexOf("{x}") < 0) { exact[k] = en; continue; }
    var parts = k.split("{x}");
    var lit = parts.join("");
    var chunk = parts.slice().sort(function (a, b) { return b.length - a.length; })[0]!;
    // খুব সাধারণ টেমপ্লেট দোকানদারের নিজের লেখা ভুল করে বদলে দিতে পারে — বাদ
    if (lit.replace(/[^ঀ-৲৴-৿]/g, "").length < 3) continue;
    tpls.push({ re: new RegExp("^" + parts.map(esc).join("([\\s\\S]*?)") + "$"), chunk: chunk, lit: lit.length, en: en });
  }
  // বেশি নির্দিষ্টটা (লম্বা লেখা) আগে
  tpls.sort(function (a, b) { return b.lit - a.lit; });
  function toEn(d: string) { return d.replace(/[০-৯]/g, function (c) { return String(c.charCodeAt(0) - 0x09e6); }); }

  function tpl(key: string, depth: number): string | null {
    for (var i = 0; i < tpls.length; i++) {
      var t = tpls[i]!;
      if (key.indexOf(t.chunk) < 0) continue;
      var m = t.re.exec(key);
      if (!m) continue;
      var caps = m.slice(1), out: string[] = [], ok = true;
      for (var j = 0; j < caps.length; j++) {
        var c = caps[j] || "";
        if (!BN.test(c)) { out.push(c); continue; }
        // ভেতরের অংশ পরিচিত লেখা হলে সেটাও অনুবাদ (যেমন স্ট্যাটাসের নাম)
        var inner = depth < 2 ? lookup(c.trim(), depth + 1) ?? runs(c) : null;
        if (inner != null) { out.push(inner); continue; }
        // অচেনা বাংলা (নাম ইত্যাদি) — টেমপ্লেটের নিজের লেখা যথেষ্ট বড় হলে তবেই
        if (t.lit < c.length) { ok = false; break; }
        out.push(c);
      }
      if (!ok) continue;
      var seq = 0;
      return t.en.replace(/\{x(\d*)\}/g, function (_, d) { return d ? out[Number(d) - 1] ?? "" : out[seq++] ?? ""; });
    }
    return null;
  }

  function lookup(key: string, depth: number): string | null {
    var hit = exact[key];
    if (hit != null) return hit;
    var t = tpl(key, depth);
    if (t != null) return t;
    // দুই পাশের চিহ্ন/ইমোজি/বন্ধনী বাদ দিয়ে (যেমন "📞 কল করুন", "(সেট করা নেই)", "নাম:")
    var m = /^([^ঀ-৲৴-৿{]*)([\s\S]*?)([^ঀ-৲৴-৿}]*)$/.exec(key);
    if (m && (m[1] || m[3]) && m[2] && BN.test(m[2].replace(/\{[nx]\}/g, ""))) {
      var mid = m[2];
      var inner = exact[mid] ?? (depth < 2 ? tpl(mid, depth + 1) : null);
      if (inner != null) return m[1] + inner + m[3];
    }
    return null;
  }

  /** লেখার ভেতরের প্রতিটা বাংলা অংশ আলাদা করে — সবগুলো মিললে তবেই */
  var RUN = /[ঀ-৲৴-৿](?:[ঀ-৲৴-৿\s,'"’\-/]|\{[nx]\})*[ঀ-৲৴-৿।?!]|[ঀ-৲৴-৿]/g;
  function runs(key: string): string | null {
    var ok = true, any = false;
    var out = key.replace(RUN, function (r) {
      if (!ok) return r;
      var t = lookup(r.trim(), 1);
      if (t == null) { ok = false; return r; }
      any = true;
      return t;
    });
    return ok && any ? out : null;
  }

  /** একটা লেখা অনুবাদ; না পেলে null (তখন আগের লেখাই থাকে) */
  function tr(s: string): string | null {
    if (!s || !BN.test(s)) return null;
    var lead = (s.match(/^\s*/) || [""])[0]!, trail = s.length > lead.length ? (s.match(/\s*$/) || [""])[0]! : "";
    var body = s.slice(lead.length, s.length - trail.length).replace(/\s+/g, " ");
    var nums: string[] = [];
    var key = body.replace(NUM, function (m) { nums.push(m); return "{n}"; });
    var en = lookup(key, 0) ?? runs(key);
    if (en == null) return null;
    var i = 0;
    en = en.replace(/\{n\}/g, function () { var v = nums[i++]; return v == null ? "" : toEn(v); });
    // বাংলা দাঁড়ি → ইংরেজি পূর্ণচ্ছেদ
    return lead + en.replace(/\s*।/g, ".") + trail;
  }
  return { tr: tr, toEn: toEn };
}
