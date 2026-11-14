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
        if (d.redirect) { location.href = d.redirect; return; }
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
    var freeMin = +form.dataset.freeMin || 0;
    var coupon = null; // সার্ভার থেকে পাওয়া কুপনের নিয়ম
    function couponDiscount(sub, delivery) {
      if (!coupon || sub < (coupon.min_order || 0)) return 0;
      if (coupon.type === "fixed") return Math.min(coupon.value, sub);
      if (coupon.type === "percent") {
        var d = Math.floor(sub * Math.min(100, coupon.value) / 100);
        return coupon.max_discount ? Math.min(d, coupon.max_discount) : d;
      }
      return delivery;
    }
    function update() {
      var vr = form.querySelector("input[name=variant_id]:checked");
      if (vr && vr.dataset.price) subtotal = +vr.dataset.price;
      var sub = form.querySelector("[data-subtotal-text]");
      if (sub) sub.textContent = taka(subtotal);
      var checked = form.querySelector("input[name=area]:checked");
      var d = freeMin > 0 && subtotal >= freeMin ? 0 : charges[checked ? checked.value : "inside"];
      var dEl = form.querySelector("[data-delivery]");
      var tEl = form.querySelector("[data-total]");
      var disc = couponDiscount(subtotal, d);
      var row = form.querySelector("[data-discount-row]");
      if (row) { row.hidden = !disc; row.querySelector("[data-discount]").textContent = "-" + taka(disc); }
      if (dEl) dEl.textContent = taka(d);
      if (tEl) tEl.textContent = taka(subtotal + d - disc);
    }
    form.addEventListener("change", update);
    update();

    // কুপন প্রয়োগ
    var applyBtn = form.querySelector("[data-coupon-apply]");
    var codeInput = form.querySelector("[data-coupon]");
    var msg = form.querySelector("[data-coupon-msg]");
    function applyCoupon() {
      if (!codeInput.value.trim()) { coupon = null; update(); return; }
      var fd = new FormData(form);
      fetch("/coupon/check", { method: "POST", body: fd, credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          msg.textContent = d.message || "";
          msg.className = d.ok ? "ok-text" : "error";
          coupon = d.ok ? d : null;
          if (d.ok) codeInput.value = d.code;
          update();
        }).catch(function () {});
    }
    if (applyBtn && codeInput) {
      applyBtn.addEventListener("click", applyCoupon);
      codeInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } });
      codeInput.addEventListener("input", function () { if (coupon) { coupon = null; msg.textContent = ""; update(); } });
      if (codeInput.value.trim()) applyCoupon();
    }

    // InitiateCheckout: ল্যান্ডিং ফর্মে প্রথমবার ফোকাস করলে (ব্রাউজার + সার্ভার, একই event_id)
    // চেকআউট পেজে এটা পেজ খোলার সময়ই যায়
    if (form.dataset.source === "landing") {
      var icSent = false;
      form.addEventListener("focusin", function () {
        if (icSent) return;
        icSent = true;
        var id = "ic_" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
        if (window.fshopTrack) {
          window.fshopTrack("InitiateCheckout", {
            content_type: "product", content_ids: [form.dataset.productId],
            contents: [{ id: form.dataset.productId, quantity: 1, item_price: subtotal }],
            num_items: 1, value: subtotal, currency: "BDT",
          }, id);
        }
        var fd = new FormData();
        fd.append("event_id", id);
        fd.append("product_id", form.dataset.productId || "");
        fetch("/t/ic", { method: "POST", body: fd, credentials: "same-origin", keepalive: true }).catch(function () {});
      });
    }

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
      if (form.querySelector("input[name=variant_id]") && !form.querySelector("input[name=variant_id]:checked")) {
        e.preventDefault();
        toast("সাইজ/রং বাছাই করুন");
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

  /* ---- কাউন্টডাউন: নির্দিষ্ট সময় পর্যন্ত, অথবা প্রতিটা ভিজিটরের জন্য আলাদা ---- */
  document.querySelectorAll("[data-countdown]").forEach(function (box) {
    var end;
    if (box.dataset.countdown === "fixed" && box.dataset.ends) {
      end = new Date(box.dataset.ends + ":00+06:00").getTime(); // ঢাকার সময়
    } else {
      var key = box.dataset.key, mins = +box.dataset.minutes || 120;
      try { end = +localStorage.getItem(key); } catch (e) {}
      if (!end || end < Date.now()) {
        end = Date.now() + mins * 60000;
        try { localStorage.setItem(key, String(end)); } catch (e) {}
      }
    }
    function pad(n) { return bn(n < 10 ? "0" + n : String(n)); }
    function tick() {
      var left = Math.max(0, end - Date.now());
      var sec = Math.floor(left / 1000);
      var v = { d: Math.floor(sec / 86400), h: Math.floor(sec % 86400 / 3600), m: Math.floor(sec % 3600 / 60), s: sec % 60 };
      Object.keys(v).forEach(function (k) { var el = box.querySelector("[data-cd=" + k + "]"); if (el) el.textContent = pad(v[k]); });
      if (left <= 0) clearInterval(timer);
    }
    var timer = setInterval(tick, 1000);
    tick();
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

/* প্রো থিম: ব্যানার স্লাইডার (৫ সেকেন্ডে বদলায়, আঙুলে সরানো যায়) */
(function () {
  var slider = document.querySelector("[data-slider]");
  if (!slider) return;
  var track = slider.querySelector(".px-slides");
  var dots = slider.querySelectorAll("[data-dot]");
  var n = track.children.length;
  if (n < 2) return;
  function idx() { return Math.round(track.scrollLeft / track.clientWidth); }
  function go(i) { track.scrollTo({ left: ((i + n) % n) * track.clientWidth, behavior: "smooth" }); }
  track.addEventListener("scroll", function () {
    var i = idx();
    dots.forEach(function (d, k) { d.classList.toggle("on", k === i); });
  }, { passive: true });
  dots.forEach(function (d) { d.addEventListener("click", function () { go(+d.dataset.dot); }); });
  var t = setInterval(function () { go(idx() + 1); }, 5000);
  track.addEventListener("touchstart", function () { clearInterval(t); }, { passive: true });
})();
