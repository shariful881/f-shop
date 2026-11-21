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
    '<header class="vx-head"><div class="vx-avatar" aria-hidden="true">S</div><div class="vx-head-text"><b>SellxBD টিম</b><small class="vx-status"><i class="vx-dot"></i><span>লোড হচ্ছে…</span></small></div>' +
    '<button type="button" class="vx-close" aria-label="বন্ধ করুন">✕</button></header>' +
    '<div class="vx-body"></div>' +
    '<form class="vx-start" hidden novalidate>' +
    '<p class="vx-intro">আসসালামু আলাইকুম! দোকান খোলা, দাম বা যেকোনো প্রশ্ন — লিখুন, আমরা উত্তর দেব।</p>' +
    '<label>আপনার নাম<input name="name" maxlength="60" autocomplete="name" required></label>' +
    '<label>মোবাইল নম্বর <small>(ঐচ্ছিক — চলে গেলেও যেন উত্তর দিতে পারি)</small><input name="phone" inputmode="tel" maxlength="14" autocomplete="tel" placeholder="017XXXXXXXX"></label>' +
    '<label>মেসেজ<textarea name="body" rows="3" maxlength="1000" required placeholder="কী জানতে চান?"></textarea></label>' +
    '<input name="website" class="vx-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '<p class="vx-err" hidden></p>' +
    '<button class="vx-btn" type="submit">মেসেজ পাঠান</button></form>' +
    '<form class="vx-send" hidden><textarea name="body" rows="1" maxlength="1000" placeholder="মেসেজ লিখুন…" aria-label="মেসেজ"></textarea>' +
    '<button type="submit" class="vx-send-btn" aria-label="পাঠান"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></button></form>' +
    '<p class="vx-foot"></p>';

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
      var t = el("a", null, bn(state.phone)); t.href = "tel:" + state.phone;
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

  function show() {
    open = true; panel.hidden = false; fab.classList.add("is-open");
    unread = 0; setBadge();
    var p = state ? Promise.resolve() : load();
    p.then(function () {
      if (state && state.chat) { poll(); toEnd(); sendF.querySelector("textarea").focus(); }
      else if (state) startF.querySelector("input[name=name]").focus();
    }).catch(function () { statusT.textContent = "লোড হয়নি — ইন্টারনেট দেখে আবার খুলুন"; });
    schedule();
  }
  function hide() { open = false; panel.hidden = true; fab.classList.remove("is-open"); schedule(); fab.focus(); }

  fab.addEventListener("click", function () { open ? hide() : show(); });
  panel.querySelector(".vx-close").addEventListener("click", hide);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) hide(); });

  startF.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    var f = startF.elements;
    err.hidden = true;
    if (!f.name.value.trim()) { err.textContent = "আপনার নাম লিখুন"; err.hidden = false; f.name.focus(); return; }
    if (!f.body.value.trim()) { err.textContent = "মেসেজ লিখুন"; err.hidden = false; f.body.focus(); return; }
    sending = true;
    var btn = startF.querySelector("button"); btn.disabled = true; btn.textContent = "পাঠানো হচ্ছে…";
    api("/chat/start", { name: f.name.value, phone: f.phone.value, body: f.body.value, website: f.website.value, page: location.pathname })
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
    document.body.appendChild(fab);
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
