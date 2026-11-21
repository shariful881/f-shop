import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "hono";
import { makeTranslator } from "./engine";
import EN from "./en.json";
import EN_CLIENT from "./en-client.json";
import EN_SITE from "./en-site.json";

/**
 * দুই ভাষা (বাংলা/ইংরেজি)।
 * - দোকানের ওয়েবসাইট: সেটিং site_lang, অ্যাডমিন প্যানেল: admin_lang — ডিফল্ট বাংলা
 * - কোড বাংলাতেই লেখা থাকে; ইংরেজি হলে পেজ তৈরির পর অভিধান দেখে বাংলা লেখা ইংরেজি হয়
 *   (দোকানদারের নিজের লেখা অভিধানে থাকে না, তাই যেমন আছে তেমনই থাকে)
 */
export type Lang = "bn" | "en";
export const LANGS: Record<Lang, string> = { bn: "বাংলা", en: "English" };

const als = new AsyncLocalStorage<{ lang: Lang }>();
export const getLang = (): Lang => als.getStore()?.lang ?? "bn";
export const runWithLang = <T>(lang: Lang, fn: () => T): T => als.run({ lang }, fn);

export const langOf = (v: string | undefined): Lang => (v === "en" ? "en" : "bn");
/** দোকানের ওয়েবসাইটের ভাষা (SMS, ইনভয়েসও এই ভাষায়) */
export const siteLang = (s: Record<string, string>): Lang => langOf(s.site_lang);
export const adminLang = (s: Record<string, string>): Lang => langOf(s.admin_lang);

let engine: ReturnType<typeof makeTranslator> | null = null;
const eng = () => (engine ??= makeTranslator(EN as Record<string, string>));

/** একটা লেখা চলতি ভাষায় (বাংলা হলে যেমন আছে) */
export function t(s: string, lang: Lang = getLang()): string {
  if (lang === "bn" || !s) return s;
  return eng().tr(s) ?? s;
}

/** কয়েক লাইনের লেখা (SMS, WhatsApp) — প্রতিটা লাইন আলাদা অনুবাদ, লাইন ভাঙা ঠিক থাকে */
export function tLines(s: string, lang: Lang = getLang()): string {
  if (lang === "bn" || !s) return s;
  return s.split("\n").map((l) => digits(t(l, lang), lang)).join("\n");
}

/** ইংরেজি মোডে বাংলা অঙ্ক → ইংরেজি অঙ্ক (দাম, সংখ্যা) */
export function digits(s: string, lang: Lang = getLang()): string {
  return lang === "en" ? eng().toEn(s) : s;
}

const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " } as Record<string, string>)[e]!);
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BN = /[\u0980-\u09F2\u09F4-\u09FF]/;
const BN_DIGIT = /[০-৯]/;
/** যেসব attribute-এ দেখানো লেখা থাকে */
const ATTRS = ["placeholder", "title", "aria-label", "alt", "data-confirm", "data-ph", "label", "content"];

/** HTML পেজের বাংলা লেখা ইংরেজি করা (শুধু ইংরেজি মোডে) */
export function translateHtml(res: Response, scope: "admin" | "site" = "site"): Response {
  let skip = 0;
  let buf = "";
  const rw = new HTMLRewriter()
    .on("html", { element(e) { e.setAttribute("lang", "en"); } })
    .on("head", { element(e) { e.prepend(`<script src="/i18n/${scope === "admin" ? "en" : "en-site"}.js?v=${I18N_VERSION}" defer></script>`, { html: true }); } })
    .on("*", {
      element(e) {
        if (skip) return;
        for (const a of ATTRS) {
          const v = e.getAttribute(a);
          if (!v) continue;
          if (a === "content" && e.tagName !== "meta") continue;
          const out = t(decode(v), "en");
          if (out !== decode(v)) e.setAttribute(a, out);
          else if (BN_DIGIT.test(v) && !BN.test(v.replace(/[০-৯]/g, ""))) e.setAttribute(a, digits(decode(v), "en"));
        }
        // বাটনের লেখা value-তে
        if (e.tagName === "input" && /^(submit|button|reset)$/i.test(e.getAttribute("type") || "")) {
          const v = e.getAttribute("value");
          if (v) e.setAttribute("value", t(decode(v), "en"));
        }
      },
      text(chunk) {
        if (skip) return;
        buf += chunk.text;
        if (!chunk.lastInTextNode) { chunk.remove(); return; }
        const raw = buf;
        buf = "";
        if (!BN.test(raw)) { chunk.replace(raw, { html: true }); return; }
        const plain = decode(raw);
        let out = t(plain, "en");
        // অনুবাদ নেই কিন্তু শুধু অঙ্ক (দাম ইত্যাদি) → ইংরেজি অঙ্ক
        if (out === plain && !BN.test(plain.replace(/[০-৯]/g, ""))) out = digits(plain, "en");
        chunk.replace(out === plain ? raw : encode(out), { html: true });
      },
    })
    // দোকানদারের নিজের লেখা, কোড, ফর্মের ভেতরের লেখা — বদলানো হয় না
    .on("script, style, textarea, [translate=no]", {
      element(e) { skip++; e.onEndTag(() => { skip--; }); },
    });
  return rw.transform(res);
}

/** ব্রাউজারে JavaScript-এর বানানো লেখা আর alert/confirm অনুবাদ */
export const I18N_VERSION = "1";
const scripts: Record<string, string> = {};
/** scope: admin = প্যানেলের সব লেখা, site = দোকানের ওয়েবসাইটের জন্য ছোট অভিধান */
export function clientScript(scope: "admin" | "site"): string {
  return (scripts[scope] ??= buildClient(scope === "admin" ? EN_CLIENT : EN_SITE));
}
function buildClient(dict: Record<string, string>): string {
  return `(function(){if(window.__i18n)return;var T=(${makeTranslator.toString()})(${JSON.stringify(dict)});
var tr=function(s){var o=conv(String(s));return o==null?s:o};window.__i18n=tr;
["alert","confirm","prompt"].forEach(function(f){var o=window[f];window[f]=function(m){var a=[].slice.call(arguments);if(a.length)a[0]=tr(m);return o.apply(window,a)}});
var BN=/[\\u0980-\\u09FF]/,SK={SCRIPT:1,STYLE:1,TEXTAREA:1},AT=${JSON.stringify(ATTRS.filter((a) => a !== "content"))};
function skip(n){for(var e=n.nodeType===1?n:n.parentNode;e&&e.nodeType===1;e=e.parentNode){if(SK[e.tagName]||e.getAttribute("translate")==="no"||e.isContentEditable)return true}return false}
function conv(s){var o=T.tr(s);if(o!=null)return o;if(/[\u09E6-\u09EF]/.test(s)&&!/[\u0980-\u09E5\u09F0-\u09F2\u09F4-\u09FF]/.test(s))return T.toEn(s);return null}
function txt(n){if(!/[\u0980-\u09FF]/.test(n.nodeValue)||skip(n))return;var o=conv(n.nodeValue);if(o!=null&&o!==n.nodeValue)n.nodeValue=o}
function el(e){if(skip(e))return;for(var i=0;i<AT.length;i++){var v=e.getAttribute(AT[i]);if(v&&BN.test(v)){var o=T.tr(v);if(o!=null&&o!==v)e.setAttribute(AT[i],o)}}
if(e.tagName==="INPUT"&&/^(submit|button)$/i.test(e.type)&&BN.test(e.value)){var w=T.tr(e.value);if(w!=null)e.value=w}}
function walk(r){if(r.nodeType===3)return txt(r);if(r.nodeType!==1)return;el(r);var it=document.createTreeWalker(r,5);var n;while((n=it.nextNode())){if(n.nodeType===3)txt(n);else el(n)}}
new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var m=ms[i];if(m.type==="characterData")txt(m.target);else if(m.type==="attributes")el(m.target);else for(var j=0;j<m.addedNodes.length;j++)walk(m.addedNodes[j])}}).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:AT});
document.addEventListener("DOMContentLoaded",function(){walk(document.body)});})();`;
}

const SITE_LANG_PATHS = /^\/admin\/(orders\/(\d+\/invoice|invoices)|products\/\d+\/landing\/preview)\/?$/;

/** রিকোয়েস্টের ভাষা ঠিক করা + ইংরেজি হলে HTML অনুবাদ */
export const i18n: MiddlewareHandler<any> = async (c, next) => {
  const s = (c.var.settings || {}) as Record<string, string>;
  // ইনভয়েস আর ল্যান্ডিং পেজের প্রিভিউ কাস্টমারের জিনিস — অ্যাডমিন থেকে খুললেও ওয়েবসাইটের ভাষায়
  const isAdmin = c.req.path.startsWith("/admin") && !SITE_LANG_PATHS.test(c.req.path);
  const lang = isAdmin ? adminLang(s) : siteLang(s);
  await runWithLang(lang, () => next());
  if (lang !== "en") return;
  if (!(c.res.headers.get("content-type") || "").includes("text/html")) return;
  c.res = translateHtml(c.res, isAdmin ? "admin" : "site");
};
