/* অ্যাডমিন: বাতিল/ফেক/মোছার আগে নিশ্চিত হওয়া (ফর্ম বা বাটনে data-confirm) */
/* ব্রাউজারের সাদামাটা confirm-এর বদলে নিজেদের ডিজাইনের পপআপ (না চললে confirm-এ ফিরে যায়) */
function askConfirm(msg, onYes) {
  var dlg = document.createElement("dialog");
  if (!dlg.showModal) { if (window.confirm(msg)) onYes(); return; }
  dlg.className = "cfm";
  var danger = /মুছ|বাতিল|ফেক|ব্লক|স্থায়ী|ফিরিয়ে|ফেরানো|সরিয়ে/.test(msg);
  dlg.innerHTML = '<p class="cfm-msg"></p><div class="cfm-actions"><button type="button" class="btn" data-no>না</button><button type="button" class="btn ' + (danger ? 'btn-danger-solid' : 'btn-primary') + '" data-yes>হ্যাঁ, করুন</button></div>';
  dlg.querySelector(".cfm-msg").textContent = msg;
  document.body.appendChild(dlg);
  var close = function () { dlg.close(); dlg.remove(); };
  dlg.querySelector("[data-no]").onclick = close;
  dlg.querySelector("[data-yes]").onclick = function () { close(); onYes(); };
  dlg.addEventListener("cancel", function () { dlg.remove(); });
  dlg.showModal();
  dlg.querySelector("[data-no]").focus(); // ভুলে Enter চাপলে কিছু হবে না
}
document.addEventListener("submit", function (e) {
  var f = e.target;
  var btn = e.submitter;
  if (f.__confirmed) { f.__confirmed = false; return; }
  var msg = (btn && btn.getAttribute && btn.getAttribute("data-confirm")) || (f.getAttribute && f.getAttribute("data-confirm"));
  if (!msg) return;
  e.preventDefault();
  askConfirm(msg, function () {
    f.__confirmed = true;
    if (f.requestSubmit) f.requestSubmit(btn && btn.form === f ? btn : undefined); else f.submit();
  });
});

/* সেভ হলে ছোট টোস্ট — কয়েক সেকেন্ড পরে নিজে সরে যায় */
(function () {
  var t = document.querySelector("[data-toast]");
  if (t) setTimeout(function () { t.classList.add("toast-out"); setTimeout(function () { t.remove(); }, 400); }, 4000);
})();

/* অর্ডার তালিকা: সব বাছুন */
document.addEventListener("change", function (e) {
  if (!e.target.matches || !e.target.matches("[data-check-all]")) return;
  var form = e.target.closest("form");
  form.querySelectorAll('input[name="ids"]').forEach(function (cb) { cb.checked = e.target.checked; });
});

/* অর্ডার ডিটেইল: কুরিয়ার ফর্ম — Pathao শহর/জোন/এলাকা, RedX এলাকা */
(function () {
  var form = document.querySelector("[data-courier-form]");
  if (!form) return;
  var sel = form.querySelector("[data-courier-select]");
  var loaded = {};

  function fill(select, items, first) {
    select.innerHTML = "";
    var o = document.createElement("option");
    o.value = ""; o.textContent = first; select.appendChild(o);
    items.forEach(function (it) {
      var op = document.createElement("option");
      op.value = it.id; op.textContent = it.name; select.appendChild(op);
    });
  }
  function load(select, id) {
    var parts = select.getAttribute("data-loc").split(":");
    var url = "/admin/orders/courier-locations?courier=" + parts[0] + "&type=" + parts[1] + (id ? "&id=" + id : "");
    var first = select.options[0] ? select.options[0].textContent : "";
    select.disabled = true;
    fetch(url, { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (d) {
      fill(select, d.items || [], d.error ? "লোড হয়নি: " + d.error : first);
    }).catch(function () { fill(select, [], "লোড হয়নি"); }).finally(function () { select.disabled = false; });
  }
  function show() {
    var c = sel.value;
    form.querySelectorAll("[data-for]").forEach(function (b) { b.hidden = b.getAttribute("data-for") !== c; });
    if (c === "pathao" && !loaded.pathao) { loaded.pathao = 1; load(form.querySelector('[data-loc="pathao:cities"]')); }
    if (c === "redx" && !loaded.redx) { loaded.redx = 1; load(form.querySelector('[data-loc="redx:areas"]')); }
  }
  form.addEventListener("change", function (e) {
    var t = e.target;
    if (t === sel) return show();
    var next = t.getAttribute("data-next");
    if (next) {
      var n = form.querySelector('[name="' + next + '"]');
      // নিচের ধাপগুলো খালি
      var x = n;
      while (x) { fill(x, [], "—"); var nn = x.getAttribute("data-next"); x = nn ? form.querySelector('[name="' + nn + '"]') : null; }
      if (t.value) load(n, t.value);
    }
    if (t.name === "redx_area_id") {
      form.querySelector('[name="redx_area_name"]').value = t.value ? t.options[t.selectedIndex].textContent : "";
    }
  });
  show();
})();

/* SMS সেটিংস: গেটওয়ে বদলালে ঘর দেখানো/লুকানো */
(function () {
  var sel = document.querySelector("[data-sms-provider]");
  if (!sel) return;
  sel.addEventListener("change", function () {
    document.querySelectorAll("[data-sms-for]").forEach(function (el) {
      el.hidden = el.getAttribute("data-sms-for").split(" ").indexOf(sel.value) === -1;
    });
  });
})();

/* অক্ষর গোনা আর Google প্রিভিউ (SEO) */
(function () {
  document.querySelectorAll("[data-count]").forEach(function (el) {
    var ideal = +el.getAttribute("data-count");
    var out = document.querySelector('[data-count-for="' + el.name + '"]');
    function upd() {
      if (!out) return;
      var n = el.value.length;
      out.textContent = "(" + n + "/" + ideal + ")";
      out.className = n === 0 ? "" : n <= ideal ? "cnt-ok" : "cnt-warn";
    }
    el.addEventListener("input", upd); upd();
  });
  document.querySelectorAll("[data-serp]").forEach(function (box) {
    var scope = box.closest("form") || document;
    var t = scope.querySelector('[name="seo_title"], [name="meta_title"]');
    var d = scope.querySelector('[name="seo_description"], [name="meta_description"]');
    var nameEl = scope.querySelector('[name="name"]');
    var descFallback = scope.querySelector('[name="short_desc"]');
    function upd() {
      var title = (t && t.value) || (nameEl && nameEl.value) || box.getAttribute("data-fallback-title") || (t && t.placeholder) || "";
      var desc = (d && d.value) || (descFallback && descFallback.value) || "";
      var u = box.getAttribute("data-url") || "";
      box.querySelector(".serp-url").textContent = /^https?:\/\//.test(u) ? u.replace(/^https?:\/\//, "") : location.host + u;
      box.querySelector(".serp-title").textContent = title.length > 60 ? title.slice(0, 60) + "…" : title;
      box.querySelector(".serp-desc").textContent = desc.length > 155 ? desc.slice(0, 155) + "…" : (desc || "ডেসক্রিপশন লিখলে এখানে দেখাবে");
    }
    [t, d, nameEl, descFallback].forEach(function (x) { if (x) x.addEventListener("input", upd); });
    upd();
  });
})();

/* রিচার্জের নম্বর/অ্যাকাউন্ট — data-copy-text-এর লেখা কপি */
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("[data-copy-text]");
  if (!b) return;
  var text = b.getAttribute("data-copy-text");
  var fallback = function () {
    var t = document.createElement("textarea");
    t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); } catch (x) { /* পুরনো ব্রাউজার */ }
    document.body.removeChild(t);
  };
  (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(text) : Promise.reject()).catch(fallback);
  var label = b.querySelector("span");
  b.classList.add("copied");
  if (label) label.textContent = "কপি হয়েছে ✓";
  clearTimeout(b._t);
  b._t = setTimeout(function () { b.classList.remove("copied"); if (label) label.textContent = "কপি"; }, 1600);
});

/* দোকানের লিংক কপি */
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("[data-copy]");
  if (!b) return;
  var sel = b.getAttribute("data-copy");
  var src = sel && sel.charAt(0) === "#" ? document.querySelector(sel) : document.querySelector("[data-copy-src]");
  if (!src) return;
  src.select();
  (navigator.clipboard ? navigator.clipboard.writeText(src.value) : Promise.reject()).catch(function () { document.execCommand("copy"); });
  b.textContent = "কপি হয়েছে ✓";
  setTimeout(function () { b.textContent = "কপি"; }, 1600);
});

/* থিম: হোমপেজ সেকশনের তালিকা — টেনে ক্রম, ↑↓, লুকানো, ক্যাটাগরি ব্লক যোগ/বাদ; রং বাছলে "নিজের রং" টিক */
(function () {
  var list = document.querySelector("[data-cz-order]");
  if (list) {
    var input = document.querySelector("[data-cz-order-input]");
    var sync = function () {
      input.value = Array.prototype.map.call(list.children, function (li) { return li.dataset.key; }).join(",");
      input.dispatchEvent(new Event("change", { bubbles: true })); // থিম এডিটর সাথে সাথে সেভ করে
    };
    list.addEventListener("click", function (e) {
      var li = e.target.closest("li");
      if (!li) return;
      if (e.target.closest("[data-cz-up]") && li.previousElementSibling) { list.insertBefore(li, li.previousElementSibling); sync(); }
      if (e.target.closest("[data-cz-down]") && li.nextElementSibling) { list.insertBefore(li.nextElementSibling, li); sync(); }
      if (e.target.closest("[data-hs-remove]")) {
        var opt = document.querySelector('[data-hs-cat] option[value="' + li.dataset.key + '"]');
        if (opt) opt.disabled = false;
        li.remove();
        sync();
      }
    });
    // টেনে সরানো (মাউস ও টাচ) — ⋮⋮ ধরে
    var drag = null;
    list.addEventListener("pointerdown", function (e) {
      var h = e.target.closest(".hs-handle");
      if (!h) return;
      e.preventDefault();
      drag = h.closest("li");
      drag.classList.add("dragging");
      list.setPointerCapture(e.pointerId);
    });
    list.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var over = document.elementFromPoint(e.clientX, e.clientY);
      var li = over && over.closest && over.closest("[data-cz-order] > li");
      if (!li || li === drag) return;
      var r = li.getBoundingClientRect();
      list.insertBefore(drag, e.clientY > r.top + r.height / 2 ? li.nextElementSibling : li);
    });
    var end = function () { if (!drag) return; drag.classList.remove("dragging"); drag = null; sync(); };
    list.addEventListener("pointerup", end);
    list.addEventListener("pointercancel", end);
    // এক ক্যাটাগরির পণ্যের সেকশন যোগ
    var sel = document.querySelector("[data-hs-cat]");
    if (sel) sel.addEventListener("change", function (e) {
      e.stopPropagation(); // এই select নিজে ফর্মে কিছু পাঠায় না
      var o = sel.options[sel.selectedIndex];
      if (!sel.value || !o) return;
      var li = document.createElement("li");
      li.className = "hs-cat";
      li.dataset.key = sel.value;
      li.innerHTML = '<span class="hs-handle" aria-hidden="true" title="টেনে সরান">⋮⋮</span><span class="hs-name">ক্যাটাগরি: <b></b></span>'
        + '<button type="button" class="hs-x" data-hs-remove aria-label="সরিয়ে দিন" title="সরিয়ে দিন">✕</button>'
        + '<span class="hs-move"><button type="button" data-cz-up aria-label="উপরে">↑</button><button type="button" data-cz-down aria-label="নিচে">↓</button></span>';
      li.querySelector("b").textContent = o.getAttribute("data-name") || o.textContent;
      list.insertBefore(li, list.firstElementChild ? list.children[Math.min(2, list.children.length)] : null);
      o.disabled = true;
      sel.value = "";
      sync();
      li.scrollIntoView({ block: "nearest" });
    });
  }
  document.querySelectorAll("[data-cz-color]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var cb = inp.parentNode.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); }
    });
  });
})();

/* পণ্যের ফর্ম: ছবি বাছলে সাথে সাথে দেখানো */
(function () {
  document.querySelectorAll("[data-img-preview]").forEach(function (box) {
    var input = box.parentNode.querySelector('input[type="file"]');
    if (!input) return;
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var img = document.createElement("img");
      img.alt = "";
      img.src = URL.createObjectURL(f);
      box.innerHTML = "";
      box.appendChild(img);
    });
  });

  /* চেকবক্স টিক দিলে সংশ্লিষ্ট অংশ দেখানো (যেমন পণ্যের "স্টক গুনবে") */
  document.querySelectorAll("[data-toggle-target]").forEach(function (cb) {
    var box = document.querySelector(cb.getAttribute("data-toggle-target"));
    if (!box) return;
    cb.addEventListener("change", function () { box.hidden = !cb.checked; });
  });

  /* AI দিয়ে লেখা: চাপার পর বাটন বন্ধ (২০–৩০ সেকেন্ড লাগে) */
  document.querySelectorAll("[data-ai-form]").forEach(function (f) {
    f.addEventListener("submit", function () {
      var b = f.querySelector("[data-ai-submit]");
      if (b) { b.disabled = true; b.textContent = "লেখা হচ্ছে… (২০–৩০ সেকেন্ড)"; }
    });
  });

  /* ফোনের অ্যাপের মতো (PWA) আর নতুন অর্ডারের নোটিফিকেশন */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin" }).catch(function () {});
  }
  var pc = document.querySelector("[data-push]");
  if (pc) {
    var txt = pc.querySelector("[data-push-text]"), on = pc.querySelector("[data-push-on]"), off = pc.querySelector("[data-push-off]"), test = pc.querySelector("[data-push-test]");
    var ios = /iphone|ipad/i.test(navigator.userAgent) && !(window.navigator.standalone);
    var keyBytes = function (b64) {
      var pad = "=".repeat((4 - (b64.length % 4)) % 4), raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
      return Uint8Array.from(raw, function (ch) { return ch.charCodeAt(0); });
    };
    var post = function (url, body) {
      return fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json(); });
    };
    var show = function (state) {
      on.hidden = state !== "off"; off.hidden = state !== "on"; test.hidden = state !== "on";
      if (state === "on") txt.textContent = "এই ডিভাইসে চালু আছে — নতুন অর্ডার এলেই নোটিফিকেশন আসবে।";
      if (state === "denied") txt.textContent = "ব্রাউজারে নোটিফিকেশন বন্ধ করা আছে — ব্রাউজারের সাইট সেটিংস থেকে চালু করুন।";
      if (state === "unsupported") txt.textContent = "এই ব্রাউজারে নোটিফিকেশন চলে না। Chrome বা Edge-এ খুলুন।";
    };
    if (ios) pc.querySelector("[data-push-ios]").hidden = false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) show("unsupported");
    else if (Notification.permission === "denied") show("denied");
    else navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        show(sub ? "on" : "off");
        if (sub) post("/admin/push/subscribe", sub.toJSON());
      });
    });
    on.addEventListener("click", function () {
      on.disabled = true;
      Notification.requestPermission().then(function (perm) {
        if (perm !== "granted") { show("denied"); return; }
        return navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pc.dataset.key) });
        }).then(function (sub) { return post("/admin/push/subscribe", sub.toJSON()); }).then(function (r) {
          show(r && r.ok ? "on" : "off");
          if (window.toast) window.toast(r && r.ok ? "নোটিফিকেশন চালু হয়েছে" : "চালু করা যায়নি");
        });
      }).catch(function () { show("off"); }).finally(function () { on.disabled = false; });
    });
    off.addEventListener("click", function () {
      navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
        if (!sub) return show("off");
        var ep = sub.endpoint;
        return sub.unsubscribe().then(function () { return post("/admin/push/unsubscribe", { endpoint: ep }); }).then(function () { show("off"); });
      });
    });
    test.addEventListener("click", function () {
      test.disabled = true;
      post("/admin/push/test").then(function (r) {
        txt.textContent = r && r.ok ? "টেস্ট পাঠানো হয়েছে — কয়েক সেকেন্ডে আসবে।" : "পাঠানো যায়নি, একটু পরে চেষ্টা করুন।";
      }).finally(function () { test.disabled = false; });
    });
  }
})();

/* নতুন অর্ডার ফর্ম: খালি বাড়তি সারি লুকানো, "আরেকটা পণ্য", মোট টাকা */
(function () {
  var f = document.querySelector("[data-manual-order]");
  if (!f) return;
  var rows = Array.prototype.slice.call(f.querySelectorAll("[data-mo-row]"));
  var add = f.querySelector("[data-mo-add]");
  rows.forEach(function (r) { if (r.dataset.extra === "1") r.hidden = true; });
  var syncAdd = function () { add.hidden = !rows.some(function (r) { return r.hidden; }); };
  syncAdd();
  add.addEventListener("click", function () {
    var next = rows.find(function (r) { return r.hidden; });
    if (next) { next.hidden = false; next.querySelector("select").focus(); }
    syncAdd();
  });
  var box = f.querySelector("[data-mo-total]");
  var fmt = function (n) { return "৳" + Math.round(n).toLocaleString("bn-BD"); };
  var num = function (el) { var n = parseInt(el && el.value, 10); return isFinite(n) && n > 0 ? n : 0; };
  var calc = function () {
    var sub = 0;
    rows.forEach(function (r) {
      var o = r.querySelector("select").selectedOptions[0];
      if (o && o.value) sub += (parseFloat(o.dataset.price) || 0) * Math.max(1, num(r.querySelector("input")));
    });
    var area = (f.querySelector("input[name=area]:checked") || {}).value || "inside";
    var dIn = f.querySelector("input[name=delivery]");
    var free = parseInt(f.dataset.free, 10) || 0;
    var del = dIn.value.trim() !== "" ? num(dIn) : (free > 0 && sub >= free ? 0 : parseInt(f.dataset[area], 10) || 0);
    var dis = Math.min(sub + del, num(f.querySelector("input[name=discount]")));
    box.hidden = sub <= 0;
    box.querySelector("[data-mo-sub]").textContent = fmt(sub);
    box.querySelector("[data-mo-del]").textContent = fmt(del);
    box.querySelector("[data-mo-dis]").textContent = fmt(dis);
    box.querySelector("[data-mo-grand]").textContent = fmt(sub + del - dis);
  };
  f.addEventListener("input", calc);
  f.addEventListener("change", calc);
  calc();
})();

/* সুপার অ্যাডমিন: R2-এর ছবির ঠিকানা ব্রাউজার দিয়ে যাচাই (আগে inline onload/onerror — CSP, security/step-7) */
(function () {
  var img = document.querySelector("[data-r2-img]");
  if (!img) return;
  var form = img.closest("form");
  var ok = function () { form.submit(); };
  var bad = function () { var n = form.querySelector("[data-r2-msg]"); if (n) n.textContent = "ব্রাউজার থেকেও ছবি আসেনি — img ডোমেইন কয়েক মিনিট পরে আবার যাচাই করুন"; };
  if (img.complete) { if (img.naturalWidth > 0) ok(); else bad(); }
  else { img.addEventListener("load", ok); img.addEventListener("error", bad); }
})();

/* মূল সাইটের মোবাইল মেনু: লিংকে চাপলে বা বাইরে চাপলে বন্ধ */
(function () {
  var m = document.querySelector(".p-menu");
  if (!m) return;
  m.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a")) m.removeAttribute("open"); });
  document.addEventListener("click", function (e) { if (m.open && !m.contains(e.target)) m.removeAttribute("open"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") m.removeAttribute("open"); });
})();

/* কুরিয়ার রিপোর্ট / ফ্রড রিপোর্ট:
   - অর্ডার তালিকায় স্ক্রিনে আসা কার্ডগুলোর রিপোর্ট নিজে থেকে আনা (একই নম্বর একবার, একসাথে ৩টা)
   - কার্ডে চাপলে পুরো রিপোর্ট মোডালে */
(function () {
  var post = function (url, data) {
    var fd = new FormData();
    Object.keys(data || {}).forEach(function (k) { fd.append(k, data[k]); });
    return fetch(url, { method: "POST", body: fd, credentials: "same-origin" });
  };
  var cardsOf = function (phone) { return document.querySelectorAll('[data-cr-open="' + phone + '"].cr-card'); };
  var replaceCards = function (phone, html) {
    if (!html) return;
    cardsOf(phone).forEach(function (el) { el.outerHTML = html; });
  };

  /* নিজে থেকে আনা */
  var queue = [], seen = {}, running = 0;
  var pump = function () {
    while (running < 3 && queue.length) {
      var phone = queue.shift();
      running++;
      post("/admin/fraud-report/card", { phone: phone })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then((function (p) { return function (html) { replaceCards(p, html); }; })(phone))
        .catch(function () {})
        .then(function () { running--; pump(); });
    }
  };
  var want = function (el) {
    var phone = el.getAttribute("data-cr-auto");
    if (!phone || seen[phone]) return;
    seen[phone] = 1; queue.push(phone); pump();
  };
  var autos = document.querySelectorAll("[data-cr-auto]");
  if (autos.length) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); want(e.target); } });
      }, { rootMargin: "200px" });
      autos.forEach(function (el) { io.observe(el); });
    } else autos.forEach(want);
  }

  /* পুরো রিপোর্ট */
  var dlg = document.getElementById("fr-dlg");
  if (!dlg) return;
  var body = dlg.querySelector("[data-fr-body]");
  var title = dlg.querySelector("[data-fr-title-phone]");
  var load = function (phone, refresh) {
    body.innerHTML = '<p class="muted center">' + (refresh ? "কুরিয়ারে খুঁজছি…" : "লোড হচ্ছে…") + "</p>";
    var url = "/admin/fraud-report?phone=" + encodeURIComponent(phone);
    (refresh ? post(url, {}) : fetch(url, { credentials: "same-origin" }))
      .then(function (r) { return r.text(); })
      .then(function (html) {
        body.innerHTML = html;
        // নতুন খোঁজার পর তালিকার কার্ডও বদলানো
        if (refresh) post("/admin/fraud-report/card", { phone: phone }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (h) { replaceCards(phone, h); }).catch(function () {});
      })
      .catch(function () { body.innerHTML = '<p class="fr-alert">লোড হয়নি — ইন্টারনেট দেখে আবার চেষ্টা করুন</p>'; });
  };
  document.addEventListener("click", function (e) {
    var open = e.target.closest && e.target.closest("[data-cr-open]");
    if (open) {
      e.preventDefault();
      var phone = open.getAttribute("data-cr-open");
      title.textContent = phone;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      load(phone, false);
      return;
    }
    var re = e.target.closest && e.target.closest("[data-cr-refresh]");
    if (re) {
      if (dlg.contains(re)) { load(re.getAttribute("data-cr-refresh"), true); return; }
      // ফ্রড চেকার পেজে: রিপোর্টটাই বদলানো
      var box = re.closest(".fr");
      re.disabled = true; re.textContent = "কুরিয়ারে খুঁজছি…";
      post("/admin/fraud-report?phone=" + encodeURIComponent(re.getAttribute("data-cr-refresh")), {})
        .then(function (r) { return r.text(); })
        .then(function (html) { if (box) box.outerHTML = html; })
        .catch(function () { re.disabled = false; re.textContent = "আবার চেষ্টা করুন"; });
      return;
    }
    if (e.target.closest && e.target.closest("[data-fr-close]")) dlg.close();
  });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); }); // বাইরে চাপলে বন্ধ
})();
