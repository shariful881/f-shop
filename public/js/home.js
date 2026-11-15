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
