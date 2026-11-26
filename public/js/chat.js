/* sellxbd.com — ভিজিটর লাইভ চ্যাট (কোণের বাটন)। সার্ভার: src/platform/visitor-chat.tsx
 * পেজ cache হয় বলে সব অবস্থা /chat/state থেকে আসে। খোলা থাকলে ৪ সেকেন্ডে, বন্ধ থাকলে ৬০ সেকেন্ডে খোঁজ। */
(function () {
  "use strict";
  if (window.__sxChat) return;
  window.__sxChat = 1;

  var BN = "০১২৩৪৫৬৭৮৯";
  function bn(s) { return String(s).replace(/\d/g, function (d) { return BN[d]; }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function api(path, body) {
    var o = { credentials: "same-origin", headers: { Accept: "application/json" } };
    if (body) { o.method = "POST"; o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "সমস্যা হয়েছে, আবার চেষ্টা করুন"); e.data = j; throw e; } return j; });
    });
  }
  function time(utc) {
    var d = new Date((utc || "").replace(" ", "T") + "Z");
    if (isNaN(d)) return "";
    var h = d.getHours(), m = d.getMinutes();
    return bn(((h % 12) || 12) + ":" + (m < 10 ? "0" : "") + m) + (h < 12 ? " AM" : " PM");
  }

  var state = null, last = 0, open = false, timer = null, unread = 0, sending = false, hasChat = false;

  /* ---------- কাঠামো ---------- */
  var fab = el("button", "vx-fab");
  fab.type = "button";
  fab.setAttribute("aria-label", "SellxBD টিমকে মেসেজ দিন");
  fab.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg><span class="vx-fab-text">মেসেজ দিন</span>';
  var badge = el("span", "vx-badge"); badge.hidden = true; fab.appendChild(badge);

  var panel = el("section", "vx-panel");
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "SellxBD লাইভ চ্যাট");
  panel.innerHTML =
    '<header class="vx-head"><div class="vx-avatar" aria-hidden="true"><img src="/favicon.svg" alt="" width="30" height="30"><i class="vx-avatar-dot"></i></div><div class="vx-head-text"><b>SellxBD টিম</b><small class="vx-status"><i class="vx-dot"></i><span>লোড হচ্ছে…</span></small></div>' +
    '<button type="button" class="vx-close" aria-label="বন্ধ করুন">✕</button></header>' +
    '<div class="vx-body"></div>' +
    '<form class="vx-start" hidden novalidate>' +
    '<p class="vx-intro">আসসালামু আলাইকুম! দোকান খোলা, দাম বা যেকোনো প্রশ্ন — লিখুন, আমরা উত্তর দেব।</p>' +
    '<label>আপনার নাম<input name="name" maxlength="60" autocomplete="name" required></label>' +
    '<label>মোবাইল নম্বর <small>(চলে গেলেও যেন উত্তর দিতে পারি)</small><input name="phone" type="tel" inputmode="tel" maxlength="14" autocomplete="tel" placeholder="017XXXXXXXX" required></label>' +
    '<label>আপনার প্রশ্ন<textarea name="body" rows="2" maxlength="1000" required placeholder="কী জানতে চান?"></textarea></label>' +
    '<input name="website" class="vx-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '<p class="vx-err" hidden></p>' +
    '<button class="vx-btn" type="submit">মেসেজ পাঠান</button></form>' +
    '<form class="vx-send" hidden><textarea name="body" rows="1" maxlength="1000" placeholder="মেসেজ লিখুন…" aria-label="মেসেজ"></textarea>' +
    '<button type="submit" class="vx-send-btn" aria-label="পাঠান"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></button></form>' +
    '<p class="vx-foot"></p>';

  var greet = el("div", "vx-greet");
  greet.hidden = true;
  greet.innerHTML = '<button type="button" class="vx-greet-x" aria-label="বন্ধ করুন">✕</button><img src="/favicon.svg" alt="" width="34" height="34"><div><b>SellxBD টিম</b><p>আসসালামু আলাইকুম! দোকান খোলা বা দাম নিয়ে কিছু জানতে চান? এখানে লিখুন 👋</p></div>';

  /* ছোট "টুং" শব্দ — ব্রাউজার আগে কোনো ক্লিক/ট্যাপ না পেলে শব্দ আটকে দেয়, তখন চুপচাপ খোলে */
  var actx;
  function ding() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      if (actx.state !== "running") return;
      [880, 1320].forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.14;
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.4);
      });
    } catch (e) {}
  }

  var body = panel.querySelector(".vx-body");
  var startF = panel.querySelector(".vx-start");
  var sendF = panel.querySelector(".vx-send");
  var statusT = panel.querySelector(".vx-status span");
  var dot = panel.querySelector(".vx-dot");
  var foot = panel.querySelector(".vx-foot");
  var err = panel.querySelector(".vx-err");

  function nearEnd() { return body.scrollHeight - body.scrollTop - body.clientHeight < 80; }
  function toEnd() { body.scrollTop = body.scrollHeight; }
  function setBadge() { badge.hidden = !unread; badge.textContent = bn(unread); }

  function add(m) {
    if (!m || m.id <= last) return false;
    last = m.id;
    if (m.sender === "system") { body.appendChild(el("div", "vx-sys", m.body)); return true; }
    var row = el("div", "vx-msg " + (m.sender === "visitor" ? "mine" : "theirs"));
    row.appendChild(el("div", "vx-bubble", m.body));
    row.appendChild(el("div", "vx-meta", (m.sender === "team" ? (m.author || "SellxBD") + " · " : "") + time(m.at)));
    body.appendChild(row);
    return true;
  }

  function render() {
    if (!state) return;
    dot.className = "vx-dot" + (state.online ? " on" : "");
    statusT.textContent = state.online ? "টিম এখন অনলাইনে — সাধারণত কয়েক মিনিটে উত্তর" : state.within ? "সাধারণত কিছুক্ষণের মধ্যে উত্তর দিই" : "এখন অফিসের বাইরে · সময় " + state.hours;
    foot.innerHTML = "";
    if (state.phone) {
      foot.appendChild(document.createTextNode("তাড়া থাকলে "));
      var a = el("a", null, "WhatsApp"); a.href = "https://wa.me/88" + state.phone; a.target = "_blank"; a.rel = "noopener";
      foot.appendChild(a);
      foot.appendChild(document.createTextNode(" বা ফোন: "));
      var t = el("a", null, String(state.phone)); t.href = "tel:" + state.phone;
      foot.appendChild(t);
    }
    var has = !!state.chat;
    startF.hidden = has;
    sendF.hidden = !has;
    body.hidden = !has;
  }

  function load() {
    return api("/chat/state").then(function (s) {
      if (!s.enabled) { fab.remove(); panel.remove(); stop(); return; }
      state = s;
      if (s.chat) hasChat = true;
      body.innerHTML = ""; last = 0;
      (s.messages || []).forEach(add);
      render();
      toEnd();
    });
  }

  function poll() {
    if (!open) {
      if (!hasChat && !(state && state.chat)) return;
      api("/chat/unread").then(function (r) { if (r.unread && r.unread !== unread) { unread = r.unread; setBadge(); } }).catch(function () {});
      return;
    }
    if (!state || !state.chat) return;
    api("/chat/messages?after=" + last).then(function (r) {
      var end = nearEnd(), got = false;
      (r.messages || []).forEach(function (m) { if (add(m)) got = true; });
      if (got && end) toEnd();
    }).catch(function () {});
  }
  function schedule() { stop(); timer = setInterval(function () { if (!document.hidden) poll(); }, open ? 4000 : 60000); }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  function show(auto) {
    open = true; panel.hidden = false; fab.classList.add("is-open"); greet.hidden = true;
    unread = 0; setBadge();
    var p = state ? Promise.resolve() : load();
    p.then(function () {
      if (auto) { if (state && state.chat) toEnd(); return; } // নিজে খুললে কিবোর্ড/ফোকাস টানে না
      if (state && state.chat) { poll(); toEnd(); sendF.querySelector("textarea").focus(); }
      else if (state) startF.querySelector("input[name=name]").focus();
    }).catch(function () { statusT.textContent = "লোড হয়নি — ইন্টারনেট দেখে আবার খুলুন"; });
    schedule();
  }
  function hide() { open = false; panel.hidden = true; fab.classList.remove("is-open"); schedule(); fab.focus(); dismiss(); }

  /* ---------- ৫ সেকেন্ড পরে নিজে থেকে খোলা ---------- */
  var DISMISS = "sx_vc_dismiss", AUTO = "sx_vc_auto";
  function store(kind) { try { return kind === "s" ? window.sessionStorage : window.localStorage; } catch (e) { return null; } }
  function dismiss() { var l = store("l"); if (l) try { l.setItem(DISMISS, String(Date.now())); } catch (e) {} }
  function autoAllowed() {
    if (open || hasChat) return false;
    var l = store("l"), ss = store("s");
    var d = l && +l.getItem(DISMISS);
    if (d && Date.now() - d < 24 * 3600e3) return false; // বন্ধ করলে ২৪ ঘণ্টা আর নিজে খুলবে না
    if (ss && ss.getItem(AUTO)) return false;              // একবার খোলার পর এই ভিজিটে আর না
    var a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return false; // ফর্ম পূরণ করছে — বিরক্ত না করা
    return true;
  }
  function autoOpen() {
    if (!autoAllowed()) return;
    var ss = store("s"); if (ss) try { ss.setItem(AUTO, "1"); } catch (e) {}
    ding();
    if (window.matchMedia("(max-width: 639px)").matches) {
      // মোবাইলে পুরো স্ক্রিন ঢেকে দিলে পেজ পড়া যায় না (Google-ও এটা পছন্দ করে না) — তাই বাটনের পাশে ছোট বার্তা
      greet.hidden = false; fab.classList.add("has-greet");
    } else show(true);
  }
  greet.addEventListener("click", function (e) {
    if (e.target.closest(".vx-greet-x")) { greet.hidden = true; fab.classList.remove("has-greet"); dismiss(); return; }
    show();
  });

  fab.addEventListener("click", function () { open ? hide() : show(); fab.classList.remove("has-greet"); });
  panel.querySelector(".vx-close").addEventListener("click", hide);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) hide(); });

  startF.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    var f = startF.elements;
    err.hidden = true;
    function bad(msg, field) { err.textContent = msg; err.hidden = false; field.focus(); }
    var ph = f.phone.value.replace(/[\s\-]/g, "").replace(/^\+?88/, "").replace(/[০-৯]/g, function (d) { return BN.indexOf(d); });
    if (!f.name.value.trim()) return bad("আপনার নাম লিখুন", f.name);
    if (!ph) return bad("মোবাইল নম্বর লিখুন", f.phone);
    if (!/^01[3-9]\d{8}$/.test(ph)) return bad("মোবাইল নম্বর ঠিক নেই (যেমন 017XXXXXXXX)", f.phone);
    if (!f.body.value.trim()) return bad("আপনার প্রশ্ন লিখুন", f.body);
    sending = true;
    var btn = startF.querySelector("button"); btn.disabled = true; btn.textContent = "পাঠানো হচ্ছে…";
    api("/chat/start", { name: f.name.value, phone: ph, body: f.body.value, website: f.website.value, page: location.pathname })
      .then(function () { startF.reset(); return load(); })
      .then(function () { schedule(); sendF.querySelector("textarea").focus(); })
      .catch(function (x) { err.textContent = x.message; err.hidden = false; })
      .then(function () { sending = false; btn.disabled = false; btn.textContent = "মেসেজ পাঠান"; });
  });

  var ta = sendF.querySelector("textarea");
  ta.addEventListener("input", function () { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; });
  ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendF.requestSubmit ? sendF.requestSubmit() : sendF.dispatchEvent(new Event("submit")); } });
  sendF.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = ta.value.trim();
    if (!text || sending) return;
    sending = true;
    api("/chat/send", { body: text })
      .then(function (r) { ta.value = ""; ta.style.height = ""; add(r.message); toEnd(); })
      .catch(function (x) {
        if (x.data && x.data.restart) { state = null; return load(); }
        body.appendChild(el("div", "vx-sys vx-sys-err", x.message)); toEnd();
      })
      .then(function () { sending = false; ta.focus(); });
  });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(greet);
    document.body.appendChild(fab);
    // ৫ সেকেন্ড পরে নিজে থেকে (আগে চ্যাট থাকলে, বন্ধ করে থাকলে বা এই ভিজিটে একবার খুলে থাকলে নয়)
    setTimeout(autoOpen, 5000);
    // আগে কথা হয়ে থাকলে (sx_vc_on কুকি) তবেই সার্ভারে খোঁজ — নতুন ভিজিটরের জন্য পেজ খুললে কোনো অনুরোধ যায় না
    if (/(?:^|; )sx_vc_on=1/.test(document.cookie)) {
      hasChat = true;
      api("/chat/unread").then(function (r) { if (r.unread) { unread = r.unread; setBadge(); } }).catch(function () {});
      schedule();
    }
    if (location.hash === "#chat") show();
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('[data-open-chat], a[href="#chat"]');
      if (a) { e.preventDefault(); show(); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
