/* হোমপেজ: মাসে এত অর্ডারে কোন প্ল্যান সবচেয়ে সস্তা */
(function () {
  var box = document.querySelector(".h-calc");
  if (!box) return;
  var plans = [];
  try { plans = JSON.parse(box.getAttribute("data-plans") || "[]"); } catch (e) {}
  var range = box.querySelector("#h-orders");
  var bnDigits = "০১২৩৪৫৬৭৮৯";
  function bn(n) { return n.toLocaleString("en-IN").replace(/\d/g, function (d) { return bnDigits[d]; }); }
  function out(k, v) { var el = box.querySelector('[data-out="' + k + '"]'); if (el) el.textContent = v; }
  function update() {
    var n = Number(range.value), best = null;
    plans.forEach(function (p) {
      var c = p.p + Math.ceil(Math.round(Math.max(0, n - p.o) * p.e * 100) / 100);
      if (!best || c < best.c) best = { n: p.n, c: c };
    });
    out("orders", bn(n) + "টা");
    if (best) { out("plan", best.n); out("total", "৳" + bn(best.c)); }
  }
  range.addEventListener("input", update);
  update();
})();

/* হোমপেজ: ফিচারের ট্যাব (JS না থাকলে সব ভাগ নিচে নিচে দেখায়) */
(function () {
  var box = document.querySelector("[data-hp-tabs]");
  if (!box) return;
  box.classList.add("js");
  var tabs = box.querySelectorAll("[data-hp-tab]"), panels = box.querySelectorAll("[data-hp-panel]");
  function show(key) {
    tabs.forEach(function (t) { var on = t.getAttribute("data-hp-tab") === key; t.classList.toggle("active", on); t.setAttribute("aria-selected", on ? "true" : "false"); });
    panels.forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-hp-panel") === key); });
  }
  tabs.forEach(function (t) { t.addEventListener("click", function () { show(t.getAttribute("data-hp-tab")); }); });
  show(tabs[0].getAttribute("data-hp-tab"));
})();
