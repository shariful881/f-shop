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
