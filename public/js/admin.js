/* অ্যাডমিন: বাতিল/ফেক/মোছার আগে নিশ্চিত হওয়া */
document.addEventListener("submit", function (e) {
  var msg = e.target.getAttribute && e.target.getAttribute("data-confirm");
  if (msg && !window.confirm(msg)) e.preventDefault();
});
