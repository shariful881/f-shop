/* SellxBD সাপোর্ট — দোকানের চ্যাট উইজেট আর সুপার অ্যাডমিনের রিয়েল-টাইম ইনবক্স।
 * WebSocket দিয়ে সাথে সাথে আপডেট; সংযোগ না থাকলে পোলিং। সব লেখা textContent দিয়ে বসানো (XSS নিরাপদ)। */
(function () {
  "use strict";
  var me = document.currentScript;
  var AGENT = !!(me && me.hasAttribute("data-sx-agent"));
  var BASE = AGENT ? "/super/support" : "/admin/support";
  var VIEWER = AGENT ? "team" : "shop";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- ছোট সাহায্যকারী ---------- */
  var BN = "০১২৩৪৫৬৭৮৯";
  function bn(x) { return String(x).replace(/\d/g, function (d) { return BN[d]; }); }
  function time(utc) {
    try {
      var d = new Date(String(utc).replace(" ", "T") + (/Z$/.test(utc) ? "" : "Z"));
      return d.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", hour12: true });
    } catch (e) { return ""; }
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function json(url, opts) {
    opts = opts || {};
    opts.credentials = "same-origin";
    opts.headers = Object.assign({ "x-sx-ajax": "1", Accept: "application/json" }, opts.headers || {});
    return fetch(url, opts).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "সমস্যা হয়েছে"); return j; }); });
  }

  /** একটা মেসেজের DOM — সার্ভারের Bubble-এর মতোই */
  function bubble(m) {
    if (m.sender === "system") { var s = el("div", "sx-sys", m.body); s.dataset.id = m.id; return s; }
    var mine = m.sender === VIEWER;
    var w = el("div", "sx-msg " + (mine ? "mine" : "theirs") + (m.internal ? " internal" : ""));
    w.dataset.id = m.id;
    var b = el("div", "sx-bubble");
    if (m.internal) b.appendChild(el("div", "sx-internal-tag", "🔒 ভিতরের নোট — দোকান দেখবে না"));
    if (m.body) b.appendChild(el("div", "sx-body", m.body));
    if (m.attachment && /^https?:\/\//.test(m.attachment)) {
      var a = el("a", "sx-att"); a.href = m.attachment; a.target = "_blank"; a.rel = "noopener";
      var img = el("img"); img.src = m.attachment; img.alt = "স্ক্রিনশট"; img.loading = "lazy"; a.appendChild(img); b.appendChild(a);
    }
    w.appendChild(b);
    var who = m.sender === "team" ? (VIEWER === "shop" ? (m.author || "SellxBD") + " · সাপোর্ট টিম" : m.author) : m.author;
    w.appendChild(el("div", "sx-meta", (who || "") + " · " + time(m.created_at)));
    return w;
  }
  /** তালিকায় যোগ (একই id দুবার না), শেষ id মনে রাখা */
  function append(box, m, before) {
    if (!box || box.querySelector('[data-id="' + m.id + '"]')) return false;
    var node = bubble(m);
    if (before && before.parentNode === box) box.insertBefore(node, before); else box.appendChild(node);
    if (+m.id > +(box.dataset.last || 0)) box.dataset.last = m.id;
    return true;
  }
  function scrollEnd(box) { if (box) box.scrollTop = box.scrollHeight; }
  function nearEnd(box) { return box.scrollHeight - box.scrollTop - box.clientHeight < 120; }

  /* ---------- টোস্ট আর শব্দ ---------- */
  var toastBox;
  function toast(title, text, href) {
    if (!toastBox) { toastBox = el("div", "sx-toasts"); document.body.appendChild(toastBox); }
    var t = el(href ? "a" : "div", "sx-toast");
    if (href) t.href = href;
    t.appendChild(el("b", null, title));
    if (text) t.appendChild(el("span", null, text));
    toastBox.appendChild(t);
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 400); }, 7000);
  }
  var actx;
  function ding() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.06;
      o.connect(g); g.connect(actx.destination); o.start();
      o.frequency.setValueAtTime(660, actx.currentTime + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.35); o.stop(actx.currentTime + 0.36);
    } catch (e) {}
  }
  var baseTitle = document.title, flashT;
  function titleFlash(msg) {
    if (!document.hidden) return;
    clearInterval(flashT);
    var on = false;
    flashT = setInterval(function () { document.title = (on = !on) ? msg : baseTitle; }, 1200);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { clearInterval(flashT); document.title = baseTitle; } });

  /* ---------- WebSocket (না চললে পোলিং) ---------- */
  var ws, wsOk = false, retry = 0, handlers = [], pingT;
  function connect() {
    if (!("WebSocket" in window)) return;
    try { ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + BASE + "/ws"); } catch (e) { return; }
    ws.onopen = function () { wsOk = true; retry = 0; clearInterval(pingT); pingT = setInterval(function () { send({ type: "ping" }); }, 25000); };
    ws.onmessage = function (e) { var d; try { d = JSON.parse(e.data); } catch (x) { return; } handlers.forEach(function (h) { h(d); }); };
    ws.onclose = function () {
      wsOk = false; clearInterval(pingT);
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 1000 * Math.pow(2, retry)); // ২, ৪, ৮ … ৬৪ সেকেন্ড
    };
  }
  function send(o) { if (wsOk && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function on(h) { handlers.push(h); }

  /* ---------- টাইপিং ---------- */
  function typingSender(input, ticketId, shopId) {
    var last = 0;
    input.addEventListener("input", function () {
      var id = typeof ticketId === "function" ? ticketId() : ticketId;
      if (!id || Date.now() - last < 2500) return;
      last = Date.now();
      send({ type: "typing", ticketId: +id, shopId: shopId });
    });
  }
  function typingShow(ind, box) {
    if (!ind) return;
    ind.hidden = false;
    if (box && nearEnd(box)) scrollEnd(box);
    clearTimeout(ind._t);
    ind._t = setTimeout(function () { ind.hidden = true; }, 4000);
  }

  /* ---------- পেজের কথোপকথন (টিকেট পেজ — দুই দিকেই) ---------- */
  var thread = $("#sx-thread");
  var threadId = thread ? +thread.dataset.ticket : 0;
  var threadTyping = $("#sx-typing");
  if (thread) {
    scrollEnd(thread);
    var replyForm = $("[data-sx-reply]");
    var shopIdOfThread = (replyForm && replyForm.dataset.shopId) || undefined;
    if (replyForm) {
      var ta = $("textarea", replyForm);
      typingSender(ta, threadId, shopIdOfThread);
      ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); replyForm.requestSubmit ? replyForm.requestSubmit() : replyForm.submit(); } });
      var canned = $("[data-sx-canned]", replyForm);
      if (canned) canned.addEventListener("change", function () {
        if (!canned.value) return;
        ta.value = ta.value ? ta.value.replace(/\s*$/, "\n\n") + canned.value : canned.value;
        canned.value = ""; ta.focus();
      });
      $$('input[name="internal"]', replyForm).forEach(function (r) {
        r.addEventListener("change", function () { replyForm.classList.toggle("is-internal", r.value === "1" && r.checked); });
      });
      replyForm.addEventListener("submit", function (e) {
        var next = $('select[name="next_status"]', replyForm);
        if (next && next.value === "resolved") return; // সমাধান করলে ইনবক্সে ফিরে যাওয়া — সাধারণ সাবমিট
        e.preventDefault();
        var btn = $("button:not([type=button])", replyForm);
        var fd = new FormData(replyForm);
        if (!String(fd.get("body") || "").trim() && !(fd.get("attachment") && fd.get("attachment").size)) return;
        btn.disabled = true;
        json(replyForm.action, { method: "POST", body: fd }).then(function (r) {
          append(thread, r.message, threadTyping); scrollEnd(thread);
          ta.value = ""; var f = $('input[type="file"]', replyForm); if (f) f.value = "";
        }).catch(function (err) { toast("পাঠানো যায়নি", err.message); }).then(function () { btn.disabled = false; ta.focus(); });
      });
    }
    on(function (d) {
      if (d.ticketId !== threadId) return;
      if (d.type === "message" && d.message) { var end = nearEnd(thread); if (append(thread, d.message, threadTyping)) { if (threadTyping) threadTyping.hidden = true; if (end) scrollEnd(thread); markRead(threadId); } }
      if (d.type === "status" && d.message) { append(thread, d.message, threadTyping); scrollEnd(thread); }
      if (d.type === "typing" && d.from !== VIEWER) typingShow(threadTyping, thread);
    });
    // পোলিং (WebSocket বন্ধ থাকলে)
    setInterval(function () {
      if (wsOk || document.hidden) return;
      json(BASE + "/" + threadId + "/messages?after=" + (thread.dataset.last || 0)).then(function (r) {
        var end = nearEnd(thread), added = false;
        (r.messages || []).forEach(function (m) { added = append(thread, m, threadTyping) || added; });
        if (added && end) scrollEnd(thread);
      }).catch(function () {});
    }, 10000);
  }
  function markRead(id) {
    if (AGENT) json(BASE + "/" + id + "/messages?after=999999999").catch(function () {});
    else json(BASE + "/" + id + "/read", { method: "POST" }).catch(function () {});
  }

  /* ================= দোকানদার ================= */
  if (!AGENT) {
    var wg = $("#sx-widget");
    if (!wg) return;
    var panel = $(".sx-panel", wg), log = $("[data-sx-log]", wg), form = $("[data-sx-chat-form]", wg);
    var input = $("textarea", form), fabBadge = $(".sx-fab-badge", wg), navBadge = $("[data-sx-nav-badge]");
    var wTyping = $("[data-sx-typing-ind]", wg);
    var bChat = $("[data-sx-badge-chat]", wg), bTicket = $("[data-sx-badge-ticket]", wg);
    var tkList = $("[data-sx-tk-list]", wg), tkItems = $("[data-sx-tk-items]", wg), tkForm = $("[data-sx-tk-form]", wg), tkErr = $("[data-sx-tk-err]", wg);
    var chatId = null, unread = 0, chatUnread = 0, ticketUnread = 0, loaded = false, tab = "chat";
    var state = { online: false, within: true, hours: "" };

    function setPresence() {
      var onl = state.online;
      $$("[data-sx-presence]").forEach(function (d) { d.classList.toggle("on", onl); d.classList.toggle("off", !onl); });
      $$("[data-sx-presence-text]").forEach(function (t) {
        t.textContent = onl ? "টিম অনলাইনে — সাধারণত কয়েক মিনিটে উত্তর" : (state.within ? "টিম এই মুহূর্তে ব্যস্ত — মেসেজ রেখে যান" : "অফলাইন · সাপোর্ট: " + state.hours);
      });
    }
    function badge(node, n) { if (node) { node.hidden = !n; node.textContent = bn(n); } }
    function setBadges() {
      badge(fabBadge, chatUnread + ticketUnread);
      badge(navBadge, unread);
      badge(bChat, chatUnread);
      badge(bTicket, ticketUnread);
    }
    function load() {
      return json(BASE + "/chat").then(function (r) {
        state.online = r.online && r.within; state.within = r.within; state.hours = r.hours;
        chatId = r.ticketId; unread = r.unread || 0; chatUnread = r.chatUnread || 0; ticketUnread = r.ticketUnread || 0;
        (r.messages || []).forEach(function (m) { append(log, m); });
        loaded = true; setPresence(); setBadges();
      }).catch(function () {});
    }

    /* ---- দুই ভাগ: ট্যাব ---- */
    function showTab(name) {
      tab = name;
      $$("[data-sx-tab]", wg).forEach(function (b) { var on = b.dataset.sxTab === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
      $$("[data-sx-pane]", wg).forEach(function (p) { p.hidden = p.dataset.sxPane !== name; });
      if (name === "chat") {
        scrollEnd(log); input.focus();
        if (chatId && chatUnread) { unread = Math.max(0, unread - chatUnread); chatUnread = 0; setBadges(); markRead(chatId); }
      } else { showList(); loadTickets(); }
    }
    $$("[data-sx-tab]", wg).forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.sxTab); }); });

    /* ---- টিকেট ভাগ ---- */
    function showList() { tkForm.hidden = true; tkList.hidden = false; }
    function showForm() { tkList.hidden = true; tkForm.hidden = false; tkErr.hidden = true; $('input[name="subject"]', tkForm).focus(); }
    $("[data-sx-tk-new]", wg).addEventListener("click", showForm);
    $("[data-sx-tk-back]", wg).addEventListener("click", showList);
    function loadTickets() {
      json(BASE + "/tickets.json").then(function (r) {
        tkItems.textContent = "";
        if (!r.tickets || !r.tickets.length) { tkItems.appendChild(el("div", "sx-muted sx-tk-empty", "এখনো কোনো টিকেট নেই।")); return; }
        r.tickets.forEach(function (t) {
          var a = el("a", "sx-tk-item" + (t.shop_unread ? " unread" : "")); a.href = BASE + "/" + t.id;
          var top = el("div", "sx-tk-top");
          top.appendChild(el("b", null, t.subject));
          top.appendChild(el("span", "sx-st sx-st-" + t.status, t.status_label));
          a.appendChild(top);
          a.appendChild(el("div", "sx-tk-prev", (t.last_sender === "team" ? "সাপোর্ট: " : "") + (t.last_preview || "")));
          a.appendChild(el("small", null, "#" + bn(t.id) + " · " + time(t.last_message_at) + (t.shop_unread ? " · " + bn(t.shop_unread) + "টা নতুন উত্তর" : "")));
          tkItems.appendChild(a);
        });
      }).catch(function () {});
    }
    tkForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $("button.sa-btn", tkForm); btn.disabled = true; tkErr.hidden = true;
      json(BASE + "/new", { method: "POST", body: new FormData(tkForm) }).then(function (r) {
        tkForm.reset(); showList(); loadTickets();
        toast("টিকেট #" + bn(r.id) + " জমা হয়েছে", "উত্তর এলে এখানে আর মেনুতে দেখাবে", r.url);
      }).catch(function (err) { tkErr.textContent = err.message; tkErr.hidden = false; }).then(function () { btn.disabled = false; });
    });

    /* ---- খোলা/বন্ধ ---- */
    function open(which) {
      panel.hidden = false; wg.classList.add("open");
      var go = function () { showTab(which || (ticketUnread && !chatUnread ? "ticket" : tab)); };
      loaded ? go() : load().then(go);
    }
    function close() { panel.hidden = true; wg.classList.remove("open"); }
    $$("[data-sx-open]").forEach(function (b) { b.addEventListener("click", function () { panel.hidden ? open(b.dataset.sxOpen || null) : close(); }); });
    $$("[data-sx-close]", wg).forEach(function (b) { b.addEventListener("click", close); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });

    /* ---- চ্যাট ভাগ ---- */
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit")); } });
    input.addEventListener("input", function () { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });
    typingSender(input, function () { return chatId; });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var body = input.value.trim();
      if (!body) return;
      var btn = $("button", form); btn.disabled = true;
      json(BASE + "/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: body }) }).then(function (r) {
        chatId = r.ticketId; append(log, r.message, wTyping); scrollEnd(log);
        input.value = ""; input.style.height = "auto";
        if (!wsOk) setTimeout(poll, 1500);
      }).catch(function (err) { toast("পাঠানো যায়নি", err.message); }).then(function () { btn.disabled = false; input.focus(); });
    });

    var chatVisible = function () { return !panel.hidden && tab === "chat" && !document.hidden; };
    on(function (d) {
      if (d.type === "hello" || d.type === "presence") { state.online = d.agentsOnline > 0 && state.within; setPresence(); return; }
      if (d.type === "typing" && d.from === "agent" && d.ticketId === chatId) { typingShow(wTyping, log); return; }
      if ((d.type === "message" || d.type === "status") && d.message) {
        var m = d.message;
        if (d.ticketId === chatId) {
          var end = nearEnd(log);
          if (append(log, m, wTyping)) {
            if (wTyping) wTyping.hidden = true;
            if (end) scrollEnd(log);
            if (m.sender === "team") {
              if (!chatVisible()) { chatUnread++; unread++; setBadges(); ding(); titleFlash("💬 সাপোর্টের উত্তর"); if (panel.hidden) toast("💬 লাইভ চ্যাটে উত্তর", m.body.slice(0, 90)); }
              else markRead(chatId);
            }
          }
        } else if (m.sender === "team" && d.ticketId !== threadId) {
          ticketUnread++; unread++; setBadges(); ding(); titleFlash("🎫 টিকেটের উত্তর");
          toast("🎫 টিকেট #" + bn(d.ticketId) + "-এ উত্তর এসেছে", m.body.slice(0, 90), BASE + "/" + d.ticketId);
          if (!panel.hidden && tab === "ticket") loadTickets();
        }
      }
    });

    function poll() {
      if (wsOk || !chatId) return;
      json(BASE + "/" + chatId + "/messages?after=" + (log.dataset.last || 0)).then(function (r) {
        var end = nearEnd(log);
        (r.messages || []).forEach(function (m) {
          if (append(log, m, wTyping) && m.sender === "team" && !chatVisible()) { chatUnread++; unread++; ding(); }
        });
        setBadges(); if (end) scrollEnd(log);
      }).catch(function () {});
    }
    setInterval(function () { if (!document.hidden) poll(); }, 15000);
    // প্রতি ২ মিনিটে উপস্থিতি/না-পড়া (WebSocket না থাকলে)
    setInterval(function () { if (!wsOk && !document.hidden) load(); }, 120000);

    load();
    connect();
    if (location.hash === "#chat") open("chat");
    if (location.hash === "#ticket") open("ticket");
    return;
  }

  /* ================= সুপার অ্যাডমিন (এজেন্ট) ================= */
  var nav = $("[data-sx-nav-badge]");
  var pageEl = $("[data-sx-agent-page]");
  var pageKind = pageEl ? pageEl.dataset.sxAgentPage : null;
  var lastId = 0;
  function pulse() {
    return json(BASE + "/pulse").then(function (r) {
      if (nav) { nav.hidden = !r.open; nav.textContent = bn(r.open); }
      if (lastId && r.last > lastId) { ding(); toast("নতুন কথোপকথন", "ইনবক্সে দেখুন", BASE); titleFlash("🛟 নতুন সাপোর্ট"); if (pageKind === "inbox") softReload(); }
      lastId = r.last;
    }).catch(function () {});
  }
  function softReload() {
    var a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    location.reload();
  }
  var reloadT;
  on(function (d) {
    if (d.type === "ticket") {
      ding(); titleFlash("🛟 নতুন " + (d.channel === "chat" ? "চ্যাট" : "টিকেট"));
      toast((d.channel === "chat" ? "💬 নতুন লাইভ চ্যাট" : "🎫 নতুন টিকেট") + " — " + (d.shopName || ""), d.subject || "", BASE + "/" + d.ticketId);
      pulse();
      if (pageKind === "inbox") { clearTimeout(reloadT); reloadT = setTimeout(softReload, 1500); }
      return;
    }
    if (d.type === "message" && d.message && d.message.sender === "shop") {
      if (d.ticketId === threadId) { if (document.hidden) { ding(); titleFlash("💬 নতুন মেসেজ"); } return; }
      ding(); titleFlash("💬 নতুন মেসেজ");
      toast("💬 " + (d.shopName || "দোকান") + " · #" + bn(d.ticketId), d.message.body ? d.message.body.slice(0, 100) : "📎 ছবি", BASE + "/" + d.ticketId);
      pulse();
      if (pageKind === "inbox") {
        var row = $('[data-ticket="' + d.ticketId + '"]');
        if (row) { row.classList.add("unread", "sx-flash"); var pv = $(".sx-row-prev", row); if (pv && d.message.body) pv.textContent = d.message.body.slice(0, 140); }
        else { clearTimeout(reloadT); reloadT = setTimeout(softReload, 1500); }
      }
    }
  });
  pulse();
  setInterval(function () { if (!wsOk && !document.hidden) pulse(); }, 30000);
  connect();
})();
