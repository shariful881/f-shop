/**
 * লেখার এডিটর (Word-এর মতো) — <textarea data-rich-editor> কে টুলবারসহ এডিটরে বদলায়।
 * সেভ হয় সেই textarea-তেই (HTML), তাই সার্ভারে কিছু বদলাতে হয় না। জাভাস্ক্রিপ্ট না চললে সাধারণ textarea থাকে।
 * সার্ভার দেখানোর আগে sanitizeHtml দিয়ে নিরাপদ করে।
 */
(function () {
  "use strict";

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  /* বাইরে থেকে কপি করা HTML পরিষ্কার: রং/ফন্ট/class বাদ, শুধু কাঠামো থাকে */
  var KEEP = { P: 1, BR: 1, HR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1, H1: 1, H2: 1, H3: 1, H4: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, PRE: 1, CODE: 1, A: 1, IMG: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1 };
  function cleanHtml(html) {
    var box = document.createElement("div");
    box.innerHTML = html.replace(/<!--[\s\S]*?-->/g, "");
    box.querySelectorAll("script,style,meta,link,title,iframe,object,svg").forEach(function (n) { n.remove(); });
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType !== 1) return;
        walk(n);
        if (!KEEP[n.tagName]) {
          // div/section ইত্যাদি → অনুচ্ছেদ; span/font → শুধু ভেতরের লেখা
          if (/^(DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN)$/.test(n.tagName)) {
            var p = document.createElement("p");
            while (n.firstChild) p.appendChild(n.firstChild);
            n.replaceWith(p);
          } else {
            while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
            n.remove();
          }
          return;
        }
        Array.prototype.slice.call(n.attributes).forEach(function (a) {
          if (!((n.tagName === "A" && a.name === "href") || (n.tagName === "IMG" && (a.name === "src" || a.name === "alt")))) n.removeAttribute(a.name);
        });
      });
    })(box);
    return box.innerHTML;
  }

  function attach(ta) {
    if (ta.dataset.richReady) return;
    ta.dataset.richReady = "1";
    // <label>-এর ভেতরে থাকলে এডিটরে ক্লিক টুলবারের বোতামে চলে যায় — label-কে div বানাই
    var lb = ta.closest("label");
    if (lb) {
      var dv = document.createElement("div");
      dv.className = lb.className;
      while (lb.firstChild) dv.appendChild(lb.firstChild);
      lb.replaceWith(dv);
    }
    var area = el("div", { class: "re-area", contenteditable: "true", role: "textbox", "aria-multiline": "true", "data-ph": ta.getAttribute("placeholder") || "" });
    area.innerHTML = ta.value;
    var bar = el("div", { class: "re-bar", role: "toolbar", "aria-label": "লেখার ফরম্যাট" });
    var wrap = el("div", { class: "re" }, [bar, area]);
    ta.parentNode.insertBefore(wrap, ta);
    wrap.appendChild(ta);
    ta.classList.add("re-src");
    ta.hidden = true;
    var htmlMode = false;

    function empty() { return !area.textContent.trim() && !area.querySelector("img,hr,table"); }
    function sync() {
      ta.value = empty() ? "" : area.innerHTML;
      area.classList.toggle("empty", empty());
      state();
    }
    area.classList.toggle("empty", empty());

    area.addEventListener("focus", function () {
      try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
      try { document.execCommand("styleWithCSS", false, false); } catch (e) {}
      if (!area.innerHTML.trim()) {
        area.innerHTML = "<p><br></p>";
        // ভেতরের ঘর বদলালে কার্সর হারায় — প্রথম অনুচ্ছেদে বসাই
        var r = document.createRange(); r.setStart(area.firstChild, 0); r.collapse(true);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
    });
    area.addEventListener("input", sync);
    area.addEventListener("paste", function (e) {
      var cd = e.clipboardData || window.clipboardData;
      if (!cd) return;
      var h = cd.getData("text/html");
      var t = cd.getData("text/plain");
      e.preventDefault();
      if (h) document.execCommand("insertHTML", false, cleanHtml(h));
      else if (t != null) document.execCommand("insertText", false, t);
      sync();
    });
    document.addEventListener("selectionchange", function () { if (document.activeElement === area) state(); });
    var form = ta.form;
    if (form) form.addEventListener("submit", function () { if (htmlMode) area.innerHTML = ta.value; else sync(); });

    function cmd(name, val) {
      area.focus();
      document.execCommand(name, false, val == null ? null : val);
      // Chrome লিস্টকে <p>-এর ভেতরে বসায় — বাইরে আনি
      area.querySelectorAll("p > ul, p > ol").forEach(function (l) { var p = l.parentNode; if (p.childNodes.length === 1) p.parentNode.replaceChild(l, p); });
      sync();
    }
    function curBlock() { return (document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, ""); }
    function block(tag) { cmd("formatBlock", curBlock() === tag && tag !== "p" ? "p" : tag); }
    function list(name) {
      area.focus();
      if (/^(h[1-6]|pre|blockquote)$/.test(curBlock())) document.execCommand("formatBlock", false, "p");
      cmd(name);
    }
    function inlineCode() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !area.contains(sel.anchorNode)) return alert("আগে লেখা সিলেক্ট করুন");
      var t = sel.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      cmd("insertHTML", "<code>" + t + "</code>");
    }
    function link() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !area.contains(sel.anchorNode)) return alert("আগে যে লেখায় লিংক দেবেন সেটা সিলেক্ট করুন");
      var range = sel.getRangeAt(0);
      var url = prompt("লিংক দিন (যেমন https://... বা ফোনের জন্য tel:01...)", "https://");
      if (!url || url === "https://") return;
      sel.removeAllRanges(); sel.addRange(range);
      cmd("createLink", url.trim());
    }
    function image() {
      var sel = window.getSelection();
      var range = sel && sel.rangeCount && area.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
      function put(url) {
        if (!url) return;
        area.focus();
        if (range) { sel.removeAllRanges(); sel.addRange(range); }
        cmd("insertHTML", '<p><img src="' + url.replace(/"/g, "&quot;") + '" alt=""></p>');
      }
      if (window.SellxMedia) window.SellxMedia.choose({ folder: "product", ratio: "free" }, function (key, url) { put(url); });
      else put(prompt("ছবির লিংক দিন", "https://"));
    }
    function toggleHtml(btn) {
      htmlMode = !htmlMode;
      if (htmlMode) { sync(); ta.hidden = false; area.hidden = true; ta.focus(); }
      else { area.innerHTML = ta.value; ta.hidden = true; area.hidden = false; sync(); }
      btn.classList.toggle("on", htmlMode);
      bar.querySelectorAll(".re-btn").forEach(function (b) { if (b !== btn) b.disabled = htmlMode; });
    }

    var SEP = null;
    var TOOLS = [
      ["↶", "আগের অবস্থায় (Ctrl+Z)", function () { cmd("undo"); }],
      ["↷", "আবার করুন (Ctrl+Y)", function () { cmd("redo"); }],
      SEP,
      ["P", "সাধারণ লেখা", function () { block("p"); }, "re-txt", "p"],
      ["H1", "বড় শিরোনাম", function () { block("h1"); }, "re-txt", "h1"],
      ["H2", "শিরোনাম", function () { block("h2"); }, "re-txt", "h2"],
      ["H3", "ছোট শিরোনাম", function () { block("h3"); }, "re-txt", "h3"],
      SEP,
      ["B", "মোটা লেখা (Ctrl+B)", function () { cmd("bold"); }, "re-b", "bold"],
      ["I", "বাঁকা লেখা (Ctrl+I)", function () { cmd("italic"); }, "re-i", "italic"],
      ["U", "নিচে দাগ (Ctrl+U)", function () { cmd("underline"); }, "re-u", "underline"],
      ["S", "কেটে দেওয়া লেখা", function () { cmd("strikeThrough"); }, "re-s", "strikeThrough"],
      ["<>", "কোড (সিলেক্ট করা লেখা)", inlineCode, "re-mono"],
      SEP,
      ["• ☰", "বুলেট লিস্ট", function () { list("insertUnorderedList"); }, "", "insertUnorderedList"],
      ["1. ☰", "নম্বর দেওয়া লিস্ট", function () { list("insertOrderedList"); }, "", "insertOrderedList"],
      ["❝", "উদ্ধৃতি", function () { block("blockquote"); }, "", "blockquote"],
      ["{ }", "কোড ব্লক", function () { block("pre"); }, "re-mono", "pre"],
      ["—", "আড়াআড়ি দাগ", function () { cmd("insertHorizontalRule"); }],
      SEP,
      ["⇤", "বাঁয়ে", function () { cmd("justifyLeft"); }, "", "justifyLeft"],
      ["↔", "মাঝে", function () { cmd("justifyCenter"); }, "", "justifyCenter"],
      ["⇥", "ডানে", function () { cmd("justifyRight"); }, "", "justifyRight"],
      SEP,
      ["🔗", "লিংক (লেখা সিলেক্ট করে)", link],
      ["🖼", "ছবি বসান", image],
      SEP,
      ["⌫", "সিলেক্ট করা লেখার ফরম্যাট মুছুন", function () { cmd("removeFormat"); cmd("unlink"); }],
      SEP,
      ["HTML", "HTML কোড দেখুন/লিখুন", null, "re-txt re-html"],
    ];
    TOOLS.forEach(function (t) {
      if (!t) return bar.appendChild(el("span", { class: "re-sep", "aria-hidden": "true" }));
      var b = el("button", { type: "button", class: "re-btn " + (t[3] || ""), text: t[0], title: t[1], "aria-label": t[1] });
      if (t[4]) b.dataset.state = t[4];
      // mousedown-এ preventDefault: বাটন চাপলে সিলেকশন হারায় না
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.addEventListener("click", function () { t[2] ? t[2]() : toggleHtml(b); });
      bar.appendChild(b);
    });

    function state() {
      var blk = curBlock() || "p";
      bar.querySelectorAll("[data-state]").forEach(function (b) {
        var k = b.dataset.state, on = false;
        if (/^(p|h[1-6]|blockquote|pre)$/.test(k)) on = blk === k;
        else { try { on = document.queryCommandState(k); } catch (e) {} }
        b.classList.toggle("on", !!on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  }

  function init() { document.querySelectorAll("textarea[data-rich-editor]").forEach(attach); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
