/* F-Shop — সাধারণ JS (কোনো framework নয়) */
(function () {
  "use strict";
  var bnDigits = "০১২৩৪৫৬৭৮৯";
  function bn(s) { return String(s).replace(/[0-9]/g, function (d) { return bnDigits[d]; }); }
  function taka(n) { return "৳" + bn(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")); }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }
  window.fshopToast = toast;

  /* ---- কার্টে যোগ (AJAX) ---- */
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form.matches || !form.matches("[data-add-to-cart]")) return;
    e.preventDefault();
    var btn = form.querySelector("button");
    if (btn) btn.disabled = true;
    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        toast(d.message || "");
        if (d.count != null) {
          document.querySelectorAll("[data-cart-count]").forEach(function (el) { el.textContent = bn(d.count); });
        }
        if (d.ok && d.event_id && window.fshopTrack) {
          window.fshopTrack("AddToCart", d.fb_params || {}, d.event_id);
        }
      })
      .catch(function () { toast("সমস্যা হয়েছে, আবার চেষ্টা করুন"); })
      .finally(function () { if (btn) btn.disabled = false; });
  });

  /* ---- অর্ডার ফর্ম: মোট টাকা হিসাব + দুবার সাবমিট আটকানো ---- */
  document.querySelectorAll("[data-order-form]").forEach(function (form) {
    var subtotal = +form.dataset.subtotal || 0;
    var charges = { inside: +form.dataset.inside || 0, outside: +form.dataset.outside || 0 };
    function update() {
      var checked = form.querySelector("input[name=area]:checked");
      var d = charges[checked ? checked.value : "inside"];
      var dEl = form.querySelector("[data-delivery]");
      var tEl = form.querySelector("[data-total]");
      if (dEl) dEl.textContent = taka(d);
      if (tEl) tEl.textContent = taka(subtotal + d);
    }
    form.addEventListener("change", update);

    form.addEventListener("submit", function (e) {
      var phone = form.querySelector("input[name=phone]");
      var digits = (phone.value || "")
        .replace(/[০-৯]/g, function (d) { return String(bnDigits.indexOf(d)); })
        .replace(/\D/g, "")
        .replace(/^(00)?880?/, "0");
      if (digits.length === 10 && digits[0] === "1") digits = "0" + digits;
      if (!/^01[3-9]\d{8}$/.test(digits)) {
        e.preventDefault();
        toast("সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)");
        phone.focus();
        return;
      }
      var btn = form.querySelector("[data-submit]");
      if (btn) {
        if (btn.disabled) { e.preventDefault(); return; }
        btn.disabled = true;
        btn.textContent = "অপেক্ষা করুন…";
      }
    });
  });

  /* ---- YouTube: ক্লিক করলে তবেই ভিডিও লোড (পেজ দ্রুত খোলে) ---- */
  document.querySelectorAll("[data-yt]").forEach(function (box) {
    var btn = box.querySelector(".video-thumb");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + box.dataset.yt + "?autoplay=1&rel=0";
      f.allow = "autoplay; encrypted-media; picture-in-picture";
      f.allowFullscreen = true;
      f.title = "ভিডিও";
      box.innerHTML = "";
      box.appendChild(f);
    });
  });
})();
