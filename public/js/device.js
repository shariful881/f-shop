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
  });
})();
