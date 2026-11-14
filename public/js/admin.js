/* অ্যাডমিন: বাতিল/ফেক/মোছার আগে নিশ্চিত হওয়া (ফর্ম বা বাটনে data-confirm) */
document.addEventListener("submit", function (e) {
  var f = e.target;
  var btn = e.submitter;
  var msg = (btn && btn.getAttribute && btn.getAttribute("data-confirm")) || (f.getAttribute && f.getAttribute("data-confirm"));
  if (msg && !window.confirm(msg)) e.preventDefault();
});

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

/* দোকানের লিংক কপি */
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("[data-copy]");
  if (!b) return;
  var src = document.querySelector("[data-copy-src]");
  if (!src) return;
  src.select();
  (navigator.clipboard ? navigator.clipboard.writeText(src.value) : Promise.reject()).catch(function () { document.execCommand("copy"); });
  b.textContent = "কপি হয়েছে ✓";
  setTimeout(function () { b.textContent = "কপি"; }, 1600);
});

/* থিম কাস্টমাইজ: হোমপেজ সেকশনের ক্রম (↑↓), রং বাছলে "নিজের রং" টিক */
(function () {
  var list = document.querySelector("[data-cz-order]");
  if (list) {
    var input = document.querySelector("[data-cz-order-input]");
    var sync = function () { input.value = Array.prototype.map.call(list.children, function (li) { return li.dataset.key; }).join(","); };
    list.addEventListener("click", function (e) {
      var li = e.target.closest("li");
      if (!li) return;
      if (e.target.closest("[data-cz-up]") && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
      if (e.target.closest("[data-cz-down]") && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
      sync();
    });
  }
  document.querySelectorAll("[data-cz-color]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var cb = inp.parentNode.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = true;
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
})();
