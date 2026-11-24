/*
 * ডিভাইস চেনা (নিয়ম ৫)
 * ডিভাইস আইডি দুই জায়গায় থাকে: `did` কুকি আর localStorage।
 * - কুকি মুছে গেলে সার্ভার নতুন আইডি দেয় (সাথে did_new কুকি) → localStorage-এর পুরনো আইডি কুকিতে ফিরিয়ে আনা হয়
 * - localStorage মুছে গেলে কুকির আইডি localStorage-এ ফিরিয়ে আনা হয়
 * অর্ডার ফর্মে localStorage-এর আইডিও পাঠানো হয়, সার্ভার দুটোই চেক করে।
 */
(function () {
  "use strict";
  var KEY = "did";
  var RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var secure = location.protocol === "https:" ? "; secure" : "";

  function getCookie(name) {
    var m = document.cookie.match("(?:^|; )" + name + "=([^;]*)");
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(value) {
    document.cookie = KEY + "=" + value + "; path=/; max-age=63072000; samesite=lax" + secure;
  }

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}
  if (stored && !RE.test(stored)) stored = null;

  var cookie = getCookie(KEY);
  if (cookie && !RE.test(cookie)) cookie = null;
  var fresh = getCookie("did_new") === "1";

  if (stored && (!cookie || (fresh && cookie !== stored))) {
    setCookie(stored);          // কুকি মুছে গিয়েছিল → localStorage থেকে ফিরিয়ে আনা
    cookie = stored;
  } else if (cookie && cookie !== stored) {
    try { localStorage.setItem(KEY, cookie); } catch (e) {}  // localStorage মুছে গিয়েছিল
  }
  if (cookie) setCookie(cookie);  // প্রতি ভিজিটে মেয়াদ নবায়ন
  if (fresh) document.cookie = "did_new=; path=/; max-age=0" + secure;

  window.fshopDeviceId = cookie || stored || "";
  var original = stored || cookie || "";
  document.addEventListener("DOMContentLoaded", function () {
    var inputs = document.querySelectorAll("[data-did-ls]");
    for (var i = 0; i < inputs.length; i++) inputs[i].value = original;
    spamHints();
  });

  /*
   * স্প্যাম ফিল্টারের জন্য দুটো তথ্য (অর্ডার ফর্মে লুকানো ঘরে):
   * - fp: "ফোনের ছাপ" — স্ক্রিন, সময় অঞ্চল, ভাষা, প্রসেসর, গ্রাফিক্স মিলিয়ে একটা ছোট কোড।
   *   Incognito বা অন্য ব্রাউজারেও একই ফোনে সাধারণত একই থাকে। নাম/নম্বরের মতো কিছু নেই।
   * - ft: ফর্ম প্রথম দেখা থেকে সাবমিট পর্যন্ত সময় (মিলিসেকেন্ড)। ভুল ঘরের জন্য পেজ আবার এলেও
   *   প্রথম দেখার সময় থেকেই ধরা হয় (sessionStorage), যাতে আসল ক্রেতা "খুব দ্রুত" না দেখায়।
   */
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ((h2 >>> 0).toString(16) + (h1 >>> 0).toString(16)).slice(0, 16);
  }
  function gpu() {
    try {
      var cv = document.createElement("canvas");
      var gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
      if (!gl) return "";
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    } catch (e) { return ""; }
  }
  function print() {
    try {
      var cv = document.createElement("canvas");
      cv.width = 220; cv.height = 30;
      var x = cv.getContext("2d");
      x.textBaseline = "top"; x.font = "16px Arial"; x.fillStyle = "#f60"; x.fillRect(100, 1, 62, 20);
      x.fillStyle = "#069"; x.fillText("SellxBD অর্ডার ✓ 0123", 2, 4);
      return cv.toDataURL().slice(-60);
    } catch (e) { return ""; }
  }
  function fingerprint() {
    var n = navigator, sc = window.screen || {};
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    var w = Math.min(sc.width || 0, sc.height || 0), h = Math.max(sc.width || 0, sc.height || 0);
    return hash([w + "x" + h, sc.colorDepth, window.devicePixelRatio, tz, new Date().getTimezoneOffset(),
      (n.languages || [n.language]).join(","), n.hardwareConcurrency, n.deviceMemory, n.maxTouchPoints, n.platform, gpu(), print()].join("|"));
  }
  function spamHints() {
    var forms = document.querySelectorAll("[data-order-form]");
    if (!forms.length) return;
    var fp = "";
    try { fp = fingerprint(); } catch (e) {}
    var key = "fs_t0:" + location.pathname, t0 = 0;
    try { t0 = +sessionStorage.getItem(key) || 0; } catch (e) {}
    if (!t0) { t0 = Date.now(); try { sessionStorage.setItem(key, String(t0)); } catch (e) {} }
    for (var i = 0; i < forms.length; i++) {
      var f = forms[i], a = f.querySelector("[data-fp]"), b = f.querySelector("[data-ft]");
      if (a) a.value = fp;
      if (b) f.addEventListener("submit", (function (el) { return function () { el.value = String(Math.max(0, Date.now() - t0)); }; })(b), true);
    }
  }
  // ধন্যবাদ পেজে পরের অর্ডারের জন্য সময় নতুন করে শুরু
  if (/^\/thanks/.test(location.pathname)) {
    try { for (var k = sessionStorage.length - 1; k >= 0; k--) { var name = sessionStorage.key(k); if (name && name.indexOf("fs_t0:") === 0) sessionStorage.removeItem(name); } } catch (e) {}
  }
})();
