/* ইনভয়েস/স্টিকার: প্রিন্ট বাটন আর নিজে প্রিন্ট (inline script ছাড়া — CSP, security/step-7) */
(function () {
  "use strict";
  var btn = document.querySelector("[data-print]");
  if (btn) btn.addEventListener("click", function () { window.print(); });
  if (document.body && document.body.hasAttribute("data-autoprint")) {
    window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });
  }
})();
