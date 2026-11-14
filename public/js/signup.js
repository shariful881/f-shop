/* সাইনআপ: দোকানের ঠিকানা খালি আছে কি না সাথে সাথে দেখানো */
(function () {
  var input = document.querySelector("[data-slug]");
  var msg = document.querySelector("[data-slug-msg]");
  var nameInput = document.querySelector("input[name=shop_name]");
  if (!input || !msg) return;
  var timer, touched = !!input.value;
  function clean(v) { return v.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-").slice(0, 30); }
  function check() {
    var v = clean(input.value);
    if (v !== input.value) input.value = v;
    clearTimeout(timer);
    if (v.length < 3) { msg.textContent = "কমপক্ষে ৩ অক্ষর"; msg.className = "muted"; return; }
    timer = setTimeout(function () {
      fetch("/signup/check?slug=" + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (d) {
        msg.textContent = d.message;
        msg.className = d.ok ? "ok-text" : "error";
      }).catch(function () {});
    }, 350);
  }
  input.addEventListener("input", function () { touched = true; check(); });
  if (nameInput) nameInput.addEventListener("input", function () {
    if (touched) return;
    var v = clean(nameInput.value.replace(/\s+/g, "-"));
    if (v) { input.value = v; check(); }
  });
  var form = document.querySelector("[data-signup]");
  if (form) form.addEventListener("submit", function () {
    var b = form.querySelector("[data-submit]");
    if (b) { b.disabled = true; b.textContent = "দোকান তৈরি হচ্ছে…"; }
  });
})();
