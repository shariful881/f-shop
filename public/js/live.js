/* লাইভ নোটিফিকেশন (অ্যাডমিন প্যানেল): নতুন অর্ডারে পপআপ + শব্দ, মেনুর সংখ্যা, ট্যাবের নাম,
 * 🔔 বেল (শেষ ৩০টা ঘটনা), অর্ডার লিস্ট আর ড্যাশবোর্ড পেজ রিফ্রেশ ছাড়াই নতুন হয়।
 * সংযোগ: WebSocket /admin/live (দোকানের সার্ভার থেকে সাথে সাথে খবর আসে)। */
(function () {
  "use strict";
  var bell = document.querySelector("[data-live-bell]");
  if (!bell || !window.WebSocket) return;

  var BN = "০১২৩৪৫৬৭৮৯";
  var isEn = document.documentElement.lang === "en";
  function bn(n) { var s = String(n); return isEn ? s : s.replace(/[0-9]/g, function (d) { return BN[+d]; }); }
  function taka(n) { return "৳" + bn(Math.round(n || 0).toLocaleString("en-IN")); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, String(v)); } catch (e) { return null; } }

  var btn = bell.querySelector(".lv-bell-btn"), panel = bell.querySelector(".lv-panel"), listEl = bell.querySelector(".lv-list"), countEl = bell.querySelector(".lv-count");
  var toneSel = bell.querySelector(".lv-tone"), popStatus = bell.querySelector(".lv-pop-status");
  var soundBtn = document.querySelector("[data-live-sound]");
  var toasts = document.querySelector("[data-live-toasts]");

  /* ---------- পছন্দ: দোকানের সেটিংস (ডিফল্ট), এই ব্রাউজারে কেউ বদলালে সেটা ---------- */
  var shopPopNew = bell.getAttribute("data-pop-new") !== "0";
  var shopRefresh = bell.getAttribute("data-refresh") !== "0";
  var tone = store("lv_tone") || bell.getAttribute("data-tone") || "ting";
  toneSel.value = tone;
  var ps = store("lv_pop_status");
  popStatus.checked = ps == null ? bell.getAttribute("data-pop-status") !== "0" : ps !== "0";
  toneSel.addEventListener("change", function () { tone = toneSel.value; store("lv_tone", tone); unlock(); if (tone !== "off") play(); showSoundBtn(); });
  popStatus.addEventListener("change", function () { store("lv_pop_status", popStatus.checked ? "1" : "0"); });

  /* ---------- শব্দ (ফাইল ছাড়া, ব্রাউজারেই বানানো) ---------- */
  var ctx = null;
  function unlock() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) { ctx = null; }
    showSoundBtn();
  }
  // ব্রাউজারের নিয়ম: পেজে একবার ক্লিক/টাইপ না করলে শব্দ বাজে না
  ["pointerdown", "keydown"].forEach(function (ev) { document.addEventListener(ev, unlock, { once: true, capture: true }); });
  function showSoundBtn() {
    if (!soundBtn) return;
    soundBtn.hidden = tone === "off" || !!(ctx && ctx.state === "running");
  }
  if (soundBtn) soundBtn.addEventListener("click", function () { unlock(); play(); setTimeout(showSoundBtn, 300); });
  showSoundBtn();

  function note(freq, start, dur, type, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + start;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function play() {
    if (tone === "off" || !ctx || ctx.state !== "running") return;
    if (tone === "cash") {
      // ক্যাশ মেশিন: ছোট "ক্যাচ" + উঁচু "চিং"
      note(1900, 0, 0.06, "square", 0.05);
      note(2637, 0.08, 0.5, "triangle", 0.18);
      note(3520, 0.08, 0.45, "sine", 0.1);
      note(2637, 0.22, 0.6, "triangle", 0.14);
    } else {
      // নরম "টুং"
      note(1318.5, 0, 0.9, "sine", 0.22);
      note(1760, 0.12, 1.1, "sine", 0.16);
    }
  }
  // কয়েকটা ট্যাব খোলা থাকলে শব্দ একটাতেই
  function playOnce(id) {
    var last = +(store("lv_snd") || 0);
    if (id <= last) return;
    store("lv_snd", id);
    play();
  }

  /* ---------- লেখা ---------- */
  var STATUS_DONE = { confirmed: "কনফার্ম করেছে", shipped: "শিপড করেছে", cancelled: "বাতিল করেছে", fake: "ফেক চিহ্ন দিয়েছে", "new": "নতুনে ফিরিয়েছে" };
  // লেবেল আর নাম আলাদা অংশে — ইংরেজি প্যানেলে লেবেল অনুবাদ হয়, নাম/টাকা যেমন আছে তেমন (translate="no")
  function parts(e) {
    if (e.kind === "order_new") return [["🛒 নতুন অর্ডার —"], [" "], [e.name + " · " + taka(e.total), 1]];
    var who = e.by_name ? [[" "], [e.by_name, 1]] : [];
    if (e.kind === "courier") return [["🚚 "], [e.order_no, 1], [" কুরিয়ারে পাঠিয়েছে"]].concat(who);
    var icon = e.status === "confirmed" ? "✓ " : e.status === "cancelled" || e.status === "fake" ? "✕ " : "↻ ";
    return [[icon], [e.order_no, 1], [" " + (STATUS_DONE[e.status] || "বদলেছে")]].concat(who);
  }
  function lineHtml(e) {
    return parts(e).map(function (p) { return p[1] ? '<span translate="no">' + esc(p[0]) + "</span>" : "<span>" + esc(p[0]) + "</span>"; }).join("");
  }
  function ago(utc) {
    var t = Date.parse(String(utc).replace(" ", "T") + "Z");
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return "এইমাত্র";
    if (m < 60) return bn(m) + " মিনিট আগে";
    var h = Math.round(m / 60);
    if (h < 24) return bn(h) + " ঘণ্টা আগে";
    return bn(Math.round(h / 24)) + " দিন আগে";
  }

  /* ---------- পপআপ ---------- */
  function toast(e) {
    if (!toasts) return;
    var el = document.createElement("div");
    el.className = "lv-toast" + (e.kind === "order_new" ? " lv-toast-new" : "");
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="lv-t-text">' + lineHtml(e) + '</span><a class="lv-t-go" href="/admin/orders/' + (+e.order_id) + '">দেখুন</a><button type="button" class="lv-t-x" aria-label="বন্ধ">✕</button>';
    el.querySelector(".lv-t-x").addEventListener("click", function () { el.remove(); });
    toasts.appendChild(el);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(function () { el.classList.add("lv-out"); setTimeout(function () { el.remove(); }, 400); }, e.kind === "order_new" ? 15000 : 7000);
  }

  /* ---------- মেনুর সংখ্যা আর ট্যাবের নাম ---------- */
  function setNewCount(n) {
    document.querySelectorAll("[data-live-new]").forEach(function (b) { b.textContent = bn(n); b.hidden = !n; });
  }
  var baseTitle = document.title, unseenNew = 0;
  function bumpTitle() {
    if (!document.hidden) return;
    unseenNew++;
    document.title = "(" + bn(unseenNew) + ") নতুন অর্ডার — " + baseTitle;
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && unseenNew) { unseenNew = 0; document.title = baseTitle; }
  });

  /* ---------- 🔔 বেল ---------- */
  var events = []; // নতুনটা আগে
  function seen() { return +(store("lv_seen") || 0); }
  function renderBell() {
    var s = seen(), unread = 0;
    listEl.innerHTML = "";
    if (!events.length) { listEl.innerHTML = '<li class="lv-empty">এখনো কিছু নেই</li>'; }
    events.slice(0, 30).forEach(function (e) {
      var isNew = e.id > s && !e.mine;
      if (isNew) unread++;
      var li = document.createElement("li");
      li.className = (isNew ? "lv-unread " : "") + "lv-k-" + e.kind;
      li.innerHTML = '<a href="/admin/orders/' + (+e.order_id) + '"><span>' + lineHtml(e) + "</span><small>" + esc(ago(e.created_at)) + "</small></a>";
      listEl.appendChild(li);
    });
    countEl.textContent = unread > 9 ? bn(9) + "+" : bn(unread);
    countEl.hidden = !unread;
  }
  function markRead() { if (events.length) store("lv_seen", events[0].id); renderBell(); }
  btn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    var open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) renderBell();
  });
  bell.querySelector(".lv-read").addEventListener("click", markRead);
  document.addEventListener("click", function (ev) { if (!panel.hidden && !bell.contains(ev.target)) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); markRead(); } });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !panel.hidden) { panel.hidden = true; markRead(); } });
  function addEvents(list) {
    var have = {};
    events.forEach(function (e) { have[e.id] = 1; });
    list.forEach(function (e) { if (!have[e.id]) events.push(e); });
    events.sort(function (a, b) { return b.id - a.id; });
    events = events.slice(0, 60);
    renderBell();
  }

  /* ---------- পেজ নতুন করা (অর্ডার লিস্ট, ড্যাশবোর্ড, অর্ডারের পেজ) ---------- */
  var refreshTimer = null, flashIds = {};
  function banner(text, who) {
    var main = document.querySelector(".admin-main");
    if (!main || main.querySelector(".lv-banner")) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "lv-banner";
    b.innerHTML = "<span>" + esc(text) + "</span>" + (who ? ' <span translate="no">(' + esc(who) + ")</span>" : "");
    b.addEventListener("click", function () { location.reload(); });
    main.insertBefore(b, main.firstChild);
  }
  function refreshPage() {
    if (!shopRefresh) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      var wrap = document.querySelector('[data-live-orders="1"]');
      var dash = document.querySelectorAll("[data-live-dash]");
      if (!wrap && !dash.length) return;
      // কেউ অর্ডার বাছাই করছে বা ডায়ালগ খোলা — তখন হঠাৎ বদলানো যাবে না
      if (wrap && (wrap.querySelector('input[type="checkbox"]:checked') || document.querySelector("dialog[open]"))) {
        banner("🛒 অর্ডার তালিকায় নতুন কিছু এসেছে — দেখতে চাপুন");
        return;
      }
      fetch(location.href, { credentials: "same-origin", headers: { "x-live": "1" } }).then(function (r) { return r.ok ? r.text() : null; }).then(function (html) {
        if (!html) return;
        var doc = new DOMParser().parseFromString(html, "text/html");
        if (wrap) {
          var fresh = doc.querySelector('[data-live-orders="1"]');
          if (fresh) wrap.innerHTML = fresh.innerHTML;
        }
        dash.forEach(function (el) {
          var f = doc.querySelector('[data-live-dash="' + el.getAttribute("data-live-dash") + '"]');
          if (f) el.innerHTML = f.innerHTML;
        });
        // নতুন অর্ডারগুলো কিছুক্ষণ হাইলাইট
        Object.keys(flashIds).forEach(function (id) {
          document.querySelectorAll('.admin-main a[href="/admin/orders/' + id + '"]').forEach(function (a) {
            var row = a.closest("tr, li, article, .ord, .order-card, [class*='card']") || a;
            row.classList.add("lv-flash");
            setTimeout(function () { row.classList.remove("lv-flash"); }, 6000);
          });
        });
        flashIds = {};
      }).catch(function () {});
    }, 700);
  }
  var detailId = (/^\/admin\/orders\/(\d+)\/?$/.exec(location.pathname) || [])[1];

  /* ---------- একটা ঘটনা এলে ---------- */
  function handle(e, live) {
    addEvents([e]);
    if (typeof e.new_count === "number") setNewCount(e.new_count);
    if (!live) return;
    if (e.kind === "order_new") flashIds[e.order_id] = 1;
    refreshPage();
    if (e.mine) return; // নিজের কাজের খবর নিজেকে দেওয়ার দরকার নেই
    if (e.kind === "order_new") { if (shopPopNew) toast(e); playOnce(e.id); bumpTitle(); }
    else if (popStatus.checked) toast(e);
    if (detailId && String(e.order_id) === detailId) banner("↻ এই অর্ডারটা অন্য কেউ বদলেছে — নতুন করে দেখতে চাপুন", e.by_name);
  }

  /* ---------- সংযোগ ---------- */
  var ws = null, lastId = 0, retry = 1000, pingT = null, first = true, waitT = null;
  function connect() {
    try { ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/admin/live"); } catch (e) { return later(); }
    ws.onmessage = function (m) {
      if (m.data === "pong") return;
      var d; try { d = JSON.parse(m.data); } catch (e) { return; }
      if (d.t === "hello") {
        retry = 1000;
        setNewCount(d.new_count || 0);
        // প্রথমবার: বেলের জন্য শেষ ৩০টা; পরে (লাইন ফিরলে): মাঝের বাদ পড়াগুলো
        ws.send(JSON.stringify({ t: "since", since: first ? 0 : lastId }));
      } else if (d.t === "events") {
        var list = (d.list || []).slice().sort(function (a, b) { return a.id - b.id; });
        list.forEach(function (e) { handle(e, !first && e.id > lastId); if (e.id > lastId) lastId = e.id; });
        if (typeof d.new_count === "number") setNewCount(d.new_count);
        first = false;
        renderBell();
      } else if (d.t === "ev" && d.ev) {
        if (d.ev.id > lastId) lastId = d.ev.id;
        handle(d.ev, true);
      }
    };
    ws.onopen = function () { clearInterval(pingT); pingT = setInterval(function () { try { ws.send("ping"); } catch (e) {} }, 25000); };
    ws.onclose = function () { clearInterval(pingT); later(); };
  }
  function later() {
    clearTimeout(waitT);
    waitT = setTimeout(connect, retry);
    retry = Math.min(retry * 2, 30000);
  }
  connect();
  // ঘুম থেকে উঠে/ইন্টারনেট ফিরলে সাথে সাথে
  window.addEventListener("online", function () { if (!ws || ws.readyState > 1) { clearTimeout(waitT); retry = 1000; connect(); } });
  setInterval(function () { renderBell(); }, 60000); // "৫ মিনিট আগে" হালনাগাদ
})();
