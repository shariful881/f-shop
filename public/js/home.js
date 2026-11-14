/* হোমপেজ: মাসিক খরচের হিসাব */
(function () {
  var box = document.querySelector(".h-calc");
  if (!box) return;
  var monthly = Number(box.getAttribute("data-monthly")) || 0;
  var per = Number(box.getAttribute("data-order")) || 0;
  var range = box.querySelector("#h-orders");
  var bnDigits = "০১২৩৪৫৬৭৮৯";
  function bn(n) { return n.toLocaleString("en-IN").replace(/\d/g, function (d) { return bnDigits[d]; }); }
  function out(k, v) { var el = box.querySelector('[data-out="' + k + '"]'); if (el) el.textContent = v; }
  function update() {
    var n = Number(range.value);
    out("orders", bn(n) + "টা");
    out("ordercost", "৳" + bn(n * per));
    out("total", "৳" + bn(monthly + n * per));
  }
  range.addEventListener("input", update);
  update();
})();
