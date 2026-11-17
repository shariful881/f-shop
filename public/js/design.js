/* থিম লাইভ এডিটর: বদলালেই খসড়া সেভ → প্রিভিউ নতুন; পাবলিশ / বাতিল; ডেস্কটপ-মোবাইল */
(function () {
  "use strict";
  var form = document.getElementById("de-form");
  var frame = document.getElementById("de-frame");
  if (!form || !frame) return;
  form.addEventListener("submit", function (e) { e.preventDefault(); }); // আগে inline onsubmit ছিল (CSP)
  var wrap = document.querySelector(".de-frame-wrap");
  var loading = document.querySelector(".de-loading");
  var status = document.querySelector(".de-status");
  var publish = document.querySelector(".de-publish");
  var discard = document.querySelector(".de-discard");

  function setStatus(kind, text) {
    status.dataset.status = kind;
    status.textContent = text;
  }
  function setDraft(has) {
    publish.disabled = !has;
    discard.hidden = !has;
    setStatus(has ? "draft" : "live", has ? "খসড়া — ক্রেতারা এখনো দেখছে না" : "সব পাবলিশ করা");
  }

  /* ---------- প্রিভিউ ---------- */
  var scrollY = 0;
  function reloadFrame() {
    try { scrollY = frame.contentWindow.scrollY || 0; } catch (e) { scrollY = 0; }
    loading.hidden = false;
    try { frame.contentWindow.location.reload(); } catch (e) { frame.src = frame.src; }
  }
  var pendingHash = "";
  frame.addEventListener("load", function () {
    loading.hidden = true;
    if (pendingHash) { var h = pendingHash; pendingHash = ""; scrollToPart(h); }
    else { try { frame.contentWindow.scrollTo(0, scrollY); } catch (e) { /* অন্য পেজ */ } }
    syncPageSelect();
  });
  function framePath() {
    try { return frame.contentWindow.location.pathname; } catch (e) { return ""; }
  }
  /* প্রিভিউর ভিতরের অংশে স্ক্রল করে একটু আলাদা করে দেখানো (যেমন #reviews) */
  function scrollToPart(hash) {
    try {
      var el = frame.contentWindow.document.getElementById(hash.replace("#", ""));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.transition = "box-shadow .3s";
      el.style.boxShadow = "0 0 0 3px #6366f1";
      el.style.borderRadius = "12px";
      setTimeout(function () { el.style.boxShadow = ""; }, 1600);
    } catch (e) { /* অন্য পেজ */ }
  }
  /* যে ভাগের সেটিং খোলা, প্রিভিউতে সেই পেজ */
  function openPage(url, stay) {
    if (!url) return;
    var hash = url.indexOf("#") >= 0 ? url.slice(url.indexOf("#")) : "";
    var base = hash ? url.slice(0, url.indexOf("#")) : url;
    var path = base.split("?")[0];
    var cur = framePath();
    // কার্ড হোমপেজ, ক্যাটাগরি আর সার্চ — তিন জায়গাতেই দেখা যায়
    if (stay && (cur === "/" || cur === "/search" || cur.indexOf("/c/") === 0)) return;
    if (cur === path) { if (hash) scrollToPart(hash); return; }
    pendingHash = hash;
    loading.hidden = false;
    frame.src = base + (base.indexOf("?") >= 0 ? "&" : "?") + "__preview=1";
  }
  function syncPageSelect() {
    var cur = framePath();
    if (!page || !cur) return;
    for (var i = 0; i < page.options.length; i++) {
      if (page.options[i].value.split("?")[0] === cur) { page.selectedIndex = i; return; }
    }
  }

  /* ---------- খসড়া সেভ ---------- */
  var timer = null, busy = false, again = false;
  function schedule(ms) {
    clearTimeout(timer);
    setStatus("saving", "বদল হচ্ছে…");
    timer = setTimeout(save, ms);
  }
  function save() {
    if (busy) { again = true; return; }
    busy = true;
    setStatus("saving", "সেভ হচ্ছে…");
    fetch("/admin/design/draft", { method: "POST", body: new FormData(form), credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { setStatus("error", d.message || "সেভ হয়নি"); return; }
        setDraft(d.changed);
        reloadFrame();
      })
      .catch(function () { setStatus("error", "সেভ হয়নি — ইন্টারনেট দেখুন"); })
      .finally(function () {
        busy = false;
        if (again) { again = false; save(); }
      });
  }
  form.addEventListener("input", function (e) {
    var t = e.target;
    if (t.type === "file") return;
    schedule(t.type === "text" || t.tagName === "TEXTAREA" || t.type === "url" ? 900 : 500);
  });
  /* মোবাইলের সেটিং বদলালে প্রিভিউ মোবাইল মাপে, কম্পিউটারের সেটিং বদলালে ডেস্কটপ মাপে */
  var DEVICE_OF = { per_row_mobile: "mobile", m1_style: "mobile", per_row_desktop: "desktop", pd_related_mobile: "mobile", pd_related_desktop: "desktop" };
  function showDevice(d) {
    var b = document.querySelector('.de-devices button[data-device="' + d + '"]');
    if (b && !b.classList.contains("active")) b.click();
  }
  form.addEventListener("change", function (e) {
    if (DEVICE_OF[e.target.name]) showDevice(DEVICE_OF[e.target.name]);
    if (e.target.type === "file") return; // ফাইল নয়, লাইব্রেরি/পিকারের key যায় (media.js)
    schedule(250);
  });

  /* ---------- পাবলিশ / বাতিল ---------- */
  publish.addEventListener("click", function () {
    clearTimeout(timer);
    publish.disabled = true;
    setStatus("saving", "পাবলিশ হচ্ছে…");
    var go = function () {
      fetch("/admin/design/publish", { method: "POST", credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function () { setDraft(false); setStatus("live", "পাবলিশ হয়েছে ✓ ক্রেতারা এখন নতুন ডিজাইন দেখছে"); })
        .catch(function () { publish.disabled = false; setStatus("error", "পাবলিশ হয়নি — আবার চেষ্টা করুন"); });
    };
    // অপেক্ষায় থাকা বদল আগে সেভ
    if (status.dataset.status === "saving") fetch("/admin/design/draft", { method: "POST", body: new FormData(form), credentials: "same-origin" }).then(go);
    else go();
  });
  discard.addEventListener("click", function () {
    if (!confirm("খসড়ার সব বদল বাতিল করে লাইভ ডিজাইনে ফিরবেন?")) return;
    fetch("/admin/design/discard", { method: "POST", credentials: "same-origin" }).then(function () { location.reload(); });
  });
  window.addEventListener("beforeunload", function (e) {
    if (busy || status.dataset.status === "saving") { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- আগের সংস্করণ ---------- */
  var verBtn = document.querySelector("[data-de-versions]");
  var verMenu = document.querySelector(".de-ver-menu");
  if (verBtn && verMenu) {
    verBtn.addEventListener("click", function (e) { e.stopPropagation(); verMenu.hidden = !verMenu.hidden; });
    document.addEventListener("click", function (e) { if (!verMenu.contains(e.target)) verMenu.hidden = true; });
    verMenu.addEventListener("click", function (e) {
      var b = e.target.closest("[data-de-restore]");
      if (!b) return;
      if (!confirm("এই সংস্করণটা খসড়ায় আনবেন? এখনকার খসড়ার বদল চলে যাবে। পাবলিশ না করা পর্যন্ত ক্রেতারা দেখবে না।")) return;
      var fd = new FormData();
      fd.append("i", b.getAttribute("data-de-restore"));
      fetch("/admin/design/restore", { method: "POST", body: fd, credentials: "same-origin" }).then(function () { location.reload(); });
    });
  }

  /* ---------- তৈরি রঙের জোড়া ---------- */
  document.querySelectorAll("[data-preset]").forEach(function (b) {
    b.addEventListener("click", function () {
      var c = {};
      try { c = JSON.parse(b.getAttribute("data-preset")); } catch (e) { return; }
      form.querySelectorAll("input[data-cz-color]").forEach(function (inp) {
        var on = form.querySelector('input[name="' + inp.name + '_on"]');
        if (c[inp.name]) { inp.value = c[inp.name]; if (on) on.checked = true; }
        else if (on && Object.keys(c).length === 0) on.checked = false; // থিমের নিজের রং
        else if (on && /^c_(brand|accent|header|btn|price|badge|topbar|footer)/.test(inp.name)) on.checked = false;
      });
      document.querySelectorAll("[data-preset]").forEach(function (x) { x.classList.toggle("active", x === b); });
      schedule(150);
    });
  });

  /* ---------- ভাগ, মাপ, পেজ, মোবাইলের ট্যাব ---------- */
  document.querySelectorAll(".de-groups button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".de-groups button").forEach(function (x) { x.classList.toggle("active", x === b); });
      document.querySelectorAll(".de-sec").forEach(function (s) { s.hidden = s.dataset.sec !== b.dataset.group; });
      document.querySelector(".de-panel").scrollTop = 0;
      openPage(b.dataset.page, b.dataset.stay === "1");
      setTab("settings");
    });
  });
  document.querySelectorAll(".de-devices button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".de-devices button").forEach(function (x) { x.classList.toggle("active", x === b); });
      wrap.dataset.device = b.dataset.device;
    });
  });
  var page = document.querySelector(".de-page");
  page.addEventListener("change", function () {
    var u = page.value;
    frame.src = u + (u.indexOf("?") >= 0 ? "&" : "?") + "__preview=1";
    loading.hidden = false;
  });
  function setTab(t) {
    document.body.dataset.tab = t;
    document.querySelectorAll(".de-mtabs button").forEach(function (x) { x.classList.toggle("active", x.dataset.tab === t); });
  }
  document.querySelectorAll(".de-mtabs button").forEach(function (b) { b.addEventListener("click", function () { setTab(b.dataset.tab); }); });
})();
