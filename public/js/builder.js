/* ল্যান্ডিং পেজ বিল্ডার (অ্যাডমিন) — সাধারণ JS, কোনো framework নয় */
(function () {
  "use strict";
  // টেমপ্লেট গ্যালারি: ক্যাটাগরি ফিল্টার
  var filter = document.getElementById("tpl-filter");
  if (filter) {
    filter.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (!b) return;
      filter.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("active", x === b); });
      document.querySelectorAll(".tpl-card").forEach(function (card) {
        card.hidden = !!b.dataset.cat && card.dataset.cat !== b.dataset.cat;
      });
    });
  }

  var root = document.getElementById("builder");
  if (!root) return;
  // ফোনে এক লাইনের নোটিশ — চাপলে পুরোটা দেখায় (লিংকে চাপলে লিংকই খুলবে)
  document.querySelectorAll(".banner").forEach(function (b) {
    b.addEventListener("click", function (e) { if (!e.target.closest("a, button")) b.classList.toggle("open"); });
  });
  var state = JSON.parse(root.dataset.landing);
  var LABEL = JSON.parse(root.dataset.labels);
  var FONTS = JSON.parse(root.dataset.fonts || "{}");
  var list = document.getElementById("sections");
  var form = document.getElementById("builder-form");
  var hidden = document.getElementById("landing-json");
  var frame = document.getElementById("lb-frame");
  var panel = document.getElementById("lb-panel");
  var statusEl = document.getElementById("lb-status");
  var openId = null;
  var dirty = false;

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function field(label, input) { return el("label", { class: "field" }, [el("span", { text: label }), input]); }
  // বাটনওয়ালা কন্ট্রোলের জন্য: <label>-এর ভেতরে রাখলে কোথাও ক্লিক করলে প্রথম বাটনটাও চাপা পড়ে
  function group(label, input) { return el("div", { class: "field" }, [el("span", { text: label }), input]); }
  function text(obj, key, ph, max) {
    return el("input", { type: "text", value: obj[key] || "", placeholder: ph || "", maxlength: max || 300, oninput: function (e) { obj[key] = e.target.value; } });
  }
  function area(obj, key, ph, rows) {
    var t = el("textarea", { rows: rows || 3, placeholder: ph || "", oninput: function (e) { obj[key] = e.target.value; } });
    t.value = obj[key] || "";
    return t;
  }
  function upload(onDone, ratio) {
    // মিডিয়া পিকার (লাইব্রেরি / নতুন আপলোড + ক্রপ / রেডি ব্যাকগ্রাউন্ড) — না থাকলে সাধারণ ফাইল বাছাই
    var inp = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true });
    inp.addEventListener("change", function () {
      if (!inp.files[0]) return;
      var fd = new FormData();
      fd.append("image", inp.files[0]);
      fd.append("folder", "landing");
      fetch("/admin/upload-image", { method: "POST", body: fd, credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.key) { onDone(d.key); changed(); } else alert(d.message || "আপলোড হয়নি"); })
        .catch(function () { alert("আপলোড হয়নি"); })
        .finally(function () { inp.value = ""; });
    });
    var btn = el("button", { type: "button", class: "btn btn-sm btn-outline", text: "＋ ছবি বাছুন (লাইব্রেরি / আপলোড)", onclick: function () {
      if (window.SellxMedia) window.SellxMedia.choose({ folder: "landing", ratio: ratio || "free", filter: "" }, function (k) { onDone(k); changed(); });
      else inp.click();
    } });
    var wrap = el("div", { class: "b-upload" });
    wrap.appendChild(btn);
    wrap.appendChild(inp);
    return wrap;
  }
  function stringList(obj, key, ph) {
    obj[key] = obj[key] || [];
    var wrap = el("div", { class: "b-list" });
    function draw() {
      wrap.innerHTML = "";
      obj[key].forEach(function (v, i) {
        wrap.appendChild(el("div", { class: "b-row" }, [
          el("input", { type: "text", value: v, placeholder: ph, oninput: function (e) { obj[key][i] = e.target.value; } }),
          el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { obj[key].splice(i, 1); draw(); changed(); } }),
        ]));
      });
      wrap.appendChild(el("button", { type: "button", class: "btn btn-outline btn-sm", text: "+ যোগ করুন", onclick: function () { obj[key].push(""); draw(); changed(); } }));
    }
    draw();
    return wrap;
  }

  /* বোতামের সারি থেকে একটা বাছাই (যেমন বাম / মাঝে / ডান) */
  function choice(obj, key, options, def, after) {
    var wrap = el("div", { class: "b-seg", role: "group" });
    Object.keys(options).forEach(function (k) {
      wrap.appendChild(el("button", { type: "button", class: "b-seg-btn" + (String(obj[key] || def) === k ? " on" : ""), text: options[k], "aria-pressed": String(obj[key] || def) === k ? "true" : "false", onclick: function () {
        obj[key] = /^\d+$/.test(k) ? +k : k;
        wrap.querySelectorAll(".b-seg-btn").forEach(function (b) { var on = b === this; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); }, this);
        changed();
        if (after) after();
      } }));
    });
    return wrap;
  }

  /* Word-এর মতো ছোট লেখার এডিটর: B, I, শিরোনাম, লিস্ট, লিংক — HTML লিখতে হয় না */
  function richText(obj, key, ph) {
    var ed = el("div", { class: "rt-area", contenteditable: "true", role: "textbox", "aria-multiline": "true", "data-ph": ph || "" });
    ed.innerHTML = obj[key] || "";
    function sync() {
      var h = ed.innerHTML;
      // শুধু ফাঁকা লাইন থাকলে ফাঁকা ধরি (তাহলে পণ্যের বিস্তারিত দেখায়)
      obj[key] = ed.textContent.trim() || ed.querySelector("img") ? h : "";
      ed.classList.toggle("empty", !obj[key]);
      changed();
    }
    ed.classList.toggle("empty", !obj[key]);
    ed.addEventListener("input", sync);
    // Enter চাপলে নতুন <p> (div নয়); ফাঁকা হলে একটা অনুচ্ছেদ দিয়ে শুরু
    ed.addEventListener("focus", function () {
      try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
      if (!ed.innerHTML.trim()) ed.innerHTML = "<p><br></p>";
    });
    // অন্য জায়গা থেকে কপি করলে শুধু লেখা আসবে (অদ্ভুত রং/ফন্ট আসবে না)
    ed.addEventListener("paste", function (e) {
      var t = (e.clipboardData || window.clipboardData).getData("text/plain");
      if (t == null) return;
      e.preventDefault();
      document.execCommand("insertText", false, t);
    });
    function cmd(name, val) {
      ed.focus();
      document.execCommand(name, false, val);
      // Chrome লিস্টকে <p>-এর ভেতরে বসায় — বাইরে আনি
      ed.querySelectorAll("p > ul, p > ol").forEach(function (l) { var p = l.parentNode; if (p.childNodes.length === 1) p.parentNode.replaceChild(l, p); });
      sync();
    }
    function block(tag) {
      var cur = (document.queryCommandValue("formatBlock") || "").toLowerCase();
      cmd("formatBlock", cur === tag ? "p" : tag);
    }
    // শিরোনামের লাইনে লিস্ট দিলে আগে সেটা সাধারণ লেখা হয় (নইলে শিরোনামের ভেতর লিস্ট ঢোকে)
    function list(name) {
      ed.focus();
      if (/^h[1-6]$/.test((document.queryCommandValue("formatBlock") || "").toLowerCase())) document.execCommand("formatBlock", false, "p");
      cmd(name);
    }
    var tools = [
      ["B", "মোটা লেখা (Ctrl+B)", function () { cmd("bold"); }, "rt-b"],
      ["I", "বাঁকা লেখা (Ctrl+I)", function () { cmd("italic"); }, "rt-i"],
      ["শিরোনাম", "লাইনটাকে শিরোনাম বানান", function () { block("h3"); }],
      ["• লিস্ট", "বুলেট লিস্ট", function () { list("insertUnorderedList"); }],
      ["১. লিস্ট", "নম্বর দেওয়া লিস্ট", function () { list("insertOrderedList"); }],
      ["🔗 লিংক", "লেখা সিলেক্ট করে লিংক দিন", function () {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || !ed.contains(sel.anchorNode)) { alert("আগে যে লেখায় লিংক দেবেন সেটা সিলেক্ট করুন"); return; }
        var range = sel.getRangeAt(0);
        var url = prompt("লিংক দিন (যেমন https://... বা ফোন নম্বরের জন্য tel:01...)", "https://");
        if (!url || url === "https://") return;
        sel.removeAllRanges(); sel.addRange(range);
        cmd("createLink", url.trim());
      }],
      ["✕ ফরম্যাট", "সিলেক্ট করা লেখার ফরম্যাট মুছুন", function () { cmd("removeFormat"); cmd("unlink"); }],
    ];
    var bar = el("div", { class: "rt-bar", role: "toolbar", "aria-label": "লেখার ফরম্যাট" });
    tools.forEach(function (t) {
      // mousedown-এ preventDefault: বাটন চাপলে সিলেকশন হারাবে না
      bar.appendChild(el("button", { type: "button", class: "rt-btn " + (t[3] || ""), text: t[0], title: t[1], onmousedown: function (e) { e.preventDefault(); }, onclick: t[2] }));
    });
    return el("div", { class: "rt" }, [bar, ed]);
  }

  function editor(sec) {
    var d = sec.data;
    var box = el("div", { class: "b-body" });
    switch (sec.type) {
      case "hero":
        box.appendChild(field("বড় শিরোনাম", text(d, "headline", "ফাঁকা রাখলে পণ্যের শিরোনাম", 200)));
        box.appendChild(field("ছোট লেখা", area(d, "subheadline", "", 2)));
        box.appendChild(field("বাটনের লেখা", text(d, "button_text", "এখনই অর্ডার করুন", 60)));
        var cb = el("input", { type: "checkbox", checked: d.show_price !== false, onchange: function (e) { d.show_price = e.target.checked; } });
        box.appendChild(el("label", { class: "small-check" }, [cb, " দাম দেখাবে"]));
        break;
      case "gallery":
        d.images = d.images || [];
        d.captions = d.captions || [];
        box.appendChild(group("দেখানোর ধরন", choice(d, "layout", { slide: "↔ স্লাইড", grid: "▦ গ্রিড" }, "slide", function () { drawSections(); })));
        var isGrid = d.layout === "grid";
        if (isGrid) {
          box.appendChild(group("কলাম (ফোনে ৩ কলাম হলে ২টা দেখাবে)", choice(d, "cols", { 1: "১ কলাম", 2: "২ কলাম", 3: "৩ কলাম" }, "2")));
          box.appendChild(group("ছবির আকার", choice(d, "ratio", { square: "▢ বর্গ", original: "আসল মাপ", portrait: "▯ লম্বা" }, "square")));
        }
        var g = el("div", { class: isGrid ? "b-list" : "b-images" });
        var drawG = function () {
          g.innerHTML = "";
          d.images.forEach(function (k, i) {
            var rm = el("button", { type: "button", class: "btn-link danger", text: "✕", title: "ছবি সরান", onclick: function () { d.images.splice(i, 1); d.captions.splice(i, 1); drawG(); changed(); } });
            if (!isGrid) { g.appendChild(el("div", { class: "b-img" }, [el("img", { src: "/img/" + k, alt: "" }), rm])); return; }
            var cap = el("input", { type: "text", value: d.captions[i] || "", placeholder: "ছবির নিচের লেখা (ঐচ্ছিক)", maxlength: 120, oninput: function (e) { d.captions[i] = e.target.value; changed(); } });
            g.appendChild(el("div", { class: "b-row b-cap-row" }, [el("img", { class: "b-thumb", src: "/img/" + k, alt: "" }), cap, rm]));
          });
        };
        drawG();
        box.appendChild(g);
        if (!d.images.length) box.appendChild(el("p", { class: "muted small", text: "ফাঁকা থাকলে পণ্যের ছবি দেখাবে (পণ্য এডিট থেকে বদলান)।" }));
        box.appendChild(field(isGrid ? "ছবি যোগ করুন (সর্বোচ্চ ১২টা)" : "আলাদা ছবি যোগ করুন (ঐচ্ছিক)", upload(function (k) { if (d.images.length >= 12) { alert("সর্বোচ্চ ১২টা ছবি দেওয়া যায়"); return; } d.images.push(k); d.captions.push(""); drawG(); }, isGrid && d.ratio !== "original" ? (d.ratio === "portrait" ? "3:4" : "1:1") : "free")));
        break;
      case "heading":
        box.appendChild(field("শিরোনাম", text(d, "headline", "যেমন: কেন আমাদের পণ্য সেরা?", 200)));
        box.appendChild(field("নিচের ছোট লেখা (ঐচ্ছিক)", area(d, "subheadline", "", 2)));
        box.appendChild(group("সাইজ", choice(d, "hsize", { sm: "ছোট", md: "মাঝারি", lg: "বড়", xl: "খুব বড়" }, "md")));
        box.appendChild(group("সাজানো", choice(d, "align", { left: "⇤ বামে", center: "↔ মাঝে", right: "ডানে ⇥" }, "center")));
        break;
      case "image_text":
        d.images = d.images || [];
        var itb = el("div", { class: "b-images" });
        var drawIT = function () {
          itb.innerHTML = "";
          if (d.images[0]) itb.appendChild(el("div", { class: "b-img" }, [el("img", { src: "/img/" + d.images[0], alt: "" }),
            el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { d.images = []; drawIT(); changed(); } })]));
        };
        drawIT();
        box.appendChild(itb);
        box.appendChild(field("ছবি", upload(function (k) { d.images = [k]; drawIT(); }, "1:1")));
        box.appendChild(group("ছবি কোন পাশে (বড় স্ক্রিনে)", choice(d, "side", { left: "◧ বামে", right: "ডানে ◨" }, "left")));
        box.appendChild(group("মোবাইলে আগে কোনটা", choice(d, "mobile_first", { image: "ছবি উপরে", text: "লেখা উপরে" }, "image")));
        box.appendChild(field("শিরোনাম", text(d, "title", "যেমন: খাঁটি সেগুন কাঠে তৈরি", 200)));
        box.appendChild(group("লেখা", richText(d, "html", "এখানে পণ্যের কথা লিখুন…")));
        box.appendChild(field("বাটনের লেখা (ফাঁকা রাখলে বাটন থাকবে না)", text(d, "button_text", "যেমন: এখনই অর্ডার করুন", 60)));
        break;
      case "video":
        box.appendChild(field("YouTube লিংক", text(d, "youtube_url", "ফাঁকা থাকলে পণ্যের ভিডিও", 300)));
        break;
      case "text":
        box.appendChild(group("লেখা", richText(d, "html", "ফাঁকা থাকলে পণ্যের বিস্তারিত দেখাবে")));
        break;
      case "benefits":
      case "trust":
        box.appendChild(field("শিরোনাম (ঐচ্ছিক)", text(d, "title", "", 120)));
        box.appendChild(field("তালিকা", stringList(d, "items", sec.type === "trust" ? "যেমন ক্যাশ অন ডেলিভারি" : "যেমন ১০০% অরিজিনাল")));
        break;
      case "reviews":
        box.appendChild(field("শিরোনাম", text(d, "title", "কাস্টমারদের মতামত", 120)));
        d.reviews = d.reviews || [];
        var rw = el("div", { class: "b-list" });
        var drawR = function () {
          rw.innerHTML = "";
          d.reviews.forEach(function (r, i) {
            var stars = el("select", { onchange: function (e) { r.rating = +e.target.value; } });
            [5, 4, 3, 2, 1].forEach(function (n) { var o = el("option", { value: n, text: "★".repeat(n) }); if ((r.rating || 5) === n) o.selected = true; stars.appendChild(o); });
            var card = el("div", { class: "b-card" }, [
              el("div", { class: "b-row" }, [text(r, "name", "নাম", 60), stars,
                el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { d.reviews.splice(i, 1); drawR(); changed(); } })]),
              area(r, "text", "রিভিউ", 2),
              r.image ? el("div", { class: "b-img" }, [el("img", { src: "/img/" + r.image, alt: "" }),
                el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { r.image = ""; drawR(); changed(); } })]) : null,
              field("স্ক্রিনশট (ঐচ্ছিক)", upload(function (k) { r.image = k; drawR(); })),
            ]);
            rw.appendChild(card);
          });
          rw.appendChild(el("button", { type: "button", class: "btn btn-outline btn-sm", text: "+ রিভিউ যোগ করুন", onclick: function () { d.reviews.push({ name: "", rating: 5, text: "", image: "" }); drawR(); changed(); } }));
        };
        drawR();
        box.appendChild(rw);
        break;
      case "faq":
        box.appendChild(field("শিরোনাম", text(d, "title", "সাধারণ প্রশ্ন", 120)));
        d.faqs = d.faqs || [];
        var fw = el("div", { class: "b-list" });
        var drawF = function () {
          fw.innerHTML = "";
          d.faqs.forEach(function (f, i) {
            fw.appendChild(el("div", { class: "b-card" }, [
              el("div", { class: "b-row" }, [text(f, "q", "প্রশ্ন", 300),
                el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { d.faqs.splice(i, 1); drawF(); changed(); } })]),
              area(f, "a", "উত্তর", 2),
            ]));
          });
          fw.appendChild(el("button", { type: "button", class: "btn btn-outline btn-sm", text: "+ প্রশ্ন যোগ করুন", onclick: function () { d.faqs.push({ q: "", a: "" }); drawF(); changed(); } }));
        };
        drawF();
        box.appendChild(fw);
        break;
      case "countdown":
        box.appendChild(field("লেখা", text(d, "title", "অফার শেষ হতে বাকি", 120)));
        var mode = el("select", { onchange: function (e) { d.mode = e.target.value; drawSections(); } });
        [["evergreen", "প্রতিটা ভিজিটরের জন্য আলাদা"], ["fixed", "নির্দিষ্ট তারিখ পর্যন্ত"]].forEach(function (m) {
          var o = el("option", { value: m[0], text: m[1] }); if ((d.mode || "evergreen") === m[0]) o.selected = true; mode.appendChild(o);
        });
        box.appendChild(field("ধরন", mode));
        if ((d.mode || "evergreen") === "fixed") {
          box.appendChild(field("শেষ হবে (বাংলাদেশ সময়)", el("input", { type: "datetime-local", value: d.ends_at || "", oninput: function (e) { d.ends_at = e.target.value; } })));
        } else {
          box.appendChild(field("কত মিনিট", el("input", { type: "number", min: 1, value: d.minutes || 120, oninput: function (e) { d.minutes = +e.target.value; } })));
        }
        break;
      case "image":
        d.images = d.images || [];
        var ib = el("div", { class: "b-images" });
        var drawI = function () {
          ib.innerHTML = "";
          if (d.images[0]) ib.appendChild(el("div", { class: "b-img" }, [el("img", { src: "/img/" + d.images[0], alt: "" }),
            el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { d.images = []; drawI(); changed(); } })]));
        };
        drawI();
        box.appendChild(ib);
        box.appendChild(field("ছবি (চওড়া ব্যানার বা পোস্টার)", upload(function (k) { d.images = [k]; drawI(); changed(); }, "free")));
        box.appendChild(field("নিচের ছোট লেখা (ঐচ্ছিক)", text(d, "title", "", 200)));
        break;
      case "before_after":
        box.appendChild(field("শিরোনাম (ঐচ্ছিক)", text(d, "title", "যেমন: ব্যবহারের আগে ও পরে", 120)));
        d.images = d.images || []; d.labels = d.labels || ["আগে", "পরে"];
        [0, 1].forEach(function (i) {
          var slot = el("div", { class: "b-card" });
          var drawS = function () {
            slot.innerHTML = "";
            slot.appendChild(el("div", { class: "b-row" }, [el("strong", { text: i ? "পরের ছবি" : "আগের ছবি" }), text(d.labels, String(i), i ? "পরে" : "আগে", 40)]));
            if (d.images[i]) slot.appendChild(el("div", { class: "b-img" }, [el("img", { src: "/img/" + d.images[i], alt: "" }),
              el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { d.images[i] = ""; drawS(); changed(); } })]));
            slot.appendChild(upload(function (k) { d.images[i] = k; drawS(); changed(); }, "1:1"));
          };
          drawS();
          box.appendChild(slot);
        });
        break;
      case "steps":
        box.appendChild(field("শিরোনাম", text(d, "title", "কীভাবে অর্ডার করবেন", 120)));
        box.appendChild(field("ধাপগুলো (ক্রম অনুযায়ী)", stringList(d, "items", "যেমন: নিচের ফর্মে নাম-ঠিকানা দিন")));
        break;
      case "comparison":
        box.appendChild(field("শিরোনাম", text(d, "title", "কেন আমাদেরটা আলাদা", 120)));
        d.labels = d.labels || ["আমাদের পণ্য", "অন্যরা"];
        box.appendChild(el("div", { class: "b-row" }, [text(d.labels, "0", "আমাদের পণ্য", 40), text(d.labels, "1", "অন্যরা", 40)]));
        d.rows = d.rows || [];
        var cw = el("div", { class: "b-list" });
        var drawC = function () {
          cw.innerHTML = "";
          d.rows.forEach(function (r, i) {
            cw.appendChild(el("div", { class: "b-card" }, [
              el("div", { class: "b-row" }, [text(r, "label", "বিষয় (যেমন: কাপড়ের মান)", 120),
                el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { d.rows.splice(i, 1); drawC(); changed(); } })]),
              el("div", { class: "b-row" }, [text(r, "us", "আমাদের (ফাঁকা = ✓)", 120), text(r, "them", "অন্যরা (ফাঁকা = ✕)", 120)]),
            ]));
          });
          cw.appendChild(el("button", { type: "button", class: "btn btn-outline btn-sm", text: "+ সারি যোগ করুন", onclick: function () { d.rows.push({ label: "", us: "", them: "" }); drawC(); changed(); } }));
        };
        drawC();
        box.appendChild(cw);
        break;
      case "guarantee":
        box.appendChild(field("গ্যারান্টির লেখা", text(d, "title", "১০০% সন্তুষ্টির গ্যারান্টি", 160)));
        box.appendChild(field("বিস্তারিত", area(d, "subheadline", "যেমন: পণ্য পছন্দ না হলে ডেলিভারি ম্যানের সামনেই ফেরত দিন", 3)));
        break;
      case "cta":
        box.appendChild(field("লেখা (ঐচ্ছিক)", text(d, "headline", "যেমন: আজই অর্ডার করলে ফ্রি ডেলিভারি", 200)));
        box.appendChild(field("বাটনের লেখা", text(d, "button_text", "এখনই অর্ডার করুন", 60)));
        var cb2 = el("input", { type: "checkbox", checked: d.show_price !== false, onchange: function (e) { d.show_price = e.target.checked; } });
        box.appendChild(el("label", { class: "small-check" }, [cb2, " দাম দেখাবে"]));
        break;
      case "order_form":
        box.appendChild(field("ফর্মের উপরের লেখা", text(d, "title", "অর্ডার করতে নিচের ফর্মটি পূরণ করুন", 200)));
        box.appendChild(el("p", { class: "muted", text: "অর্ডার ফর্ম সবসময় থাকে, শুধু জায়গা বদলানো যায়।" }));
        break;
    }
    return box;
  }


  /* ---------- ডিজাইন: রং, ফন্ট, সাইজ ---------- */
  function colorField(obj, key, label) {
    var wrap = el("div", { class: "lb-color" });
    function draw() {
      wrap.innerHTML = "";
      var inp = el("input", { type: "color", value: obj[key] || "#ffffff", oninput: function (e) { obj[key] = e.target.value; changed(); drawLabel(); } });
      var lab = el("span", { class: "lb-color-val" });
      function drawLabel() { lab.textContent = obj[key] ? obj[key] : "ডিফল্ট"; }
      drawLabel();
      wrap.appendChild(el("span", { class: "lb-color-name", text: label }));
      wrap.appendChild(inp);
      wrap.appendChild(lab);
      wrap.appendChild(el("button", { type: "button", class: "btn-link small", text: "রিসেট", title: "থিমের রঙে ফিরুন", onclick: function () { delete obj[key]; draw(); changed(); } }));
    }
    draw();
    return wrap;
  }
  function selectField(obj, key, label, options) {
    var sel = el("select", { onchange: function (e) { if (e.target.value) obj[key] = e.target.value; else delete obj[key]; changed(); } });
    Object.keys(options).forEach(function (k) {
      var o = el("option", { value: k, text: options[k] });
      if ((obj[key] || "") === k) o.selected = true;
      sel.appendChild(o);
    });
    return field(label, sel);
  }
  function fontOptions(def) {
    var o = { "": def };
    Object.keys(FONTS).forEach(function (k) { o[k] = FONTS[k]; });
    return o;
  }
  function designBox(sec) {
    sec.style = sec.style || {};
    var st = sec.style;
    var hasBtn = ["hero", "order_form", "benefits", "countdown", "image_text"].indexOf(sec.type) >= 0;
    var box = el("details", { class: "lb-design" }, [el("summary", { text: "🎨 ডিজাইন — রং, ফন্ট, সাইজ" })]);
    var grid = el("div", { class: "lb-design-grid" });
    grid.appendChild(colorField(st, "bg", "ব্যাকগ্রাউন্ড"));
    grid.appendChild(colorField(st, "color", "লেখার রং"));
    if (hasBtn) {
      grid.appendChild(colorField(st, "btn_bg", sec.type === "benefits" ? "টিক চিহ্নের রং" : sec.type === "countdown" ? "টাইমারের রং" : "বাটনের রং"));
      grid.appendChild(colorField(st, "btn_color", sec.type === "countdown" ? "টাইমারের লেখা" : "বাটনের লেখা"));
    }
    grid.appendChild(selectField(st, "font", "ফন্ট", fontOptions("পেজের ফন্ট")));
    grid.appendChild(selectField(st, "size", "লেখার সাইজ", { "": "মাঝারি", sm: "ছোট", lg: "বড়" }));
    grid.appendChild(selectField(st, "align", "লেখা সাজানো", { "": "ডিফল্ট", left: "বাঁয়ে", center: "মাঝে" }));
    box.appendChild(grid);
    return box;
  }
  function drawPageStyle() {
    var host = document.getElementById("page-style");
    state.style = state.style || {};
    host.innerHTML = "";
    host.appendChild(el("div", { class: "b-section lb-page" }, [
      el("div", { class: "b-head" }, [el("strong", { text: "পুরো পেজ" })]),
      el("div", { class: "b-body" }, [
        selectField(state.style, "font", "পেজের ফন্ট", fontOptions("থিমের ফন্ট")),
        selectField(state.style, "header", "দোকানের হেডার (লোগো, মেনু, সার্চ)", { "": "দেখাবে", hide: "লুকাবে" }),
        selectField(state.style, "footer", "দোকানের ফুটার", { "": "দেখাবে", hide: "লুকাবে (শুধু ছোট কপিরাইট থাকবে)" }),
      ]),
    ]));
  }

  /* ---------- সেকশনের তালিকা (ড্রপডাউন/অ্যাকর্ডিয়ন) ---------- */
  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= state.sections.length) return;
    var t = state.sections[i]; state.sections[i] = state.sections[j]; state.sections[j] = t;
    drawSections();
    changed();
  }

  function drawSections() {
    list.innerHTML = "";
    state.sections.forEach(function (sec, i) {
      var isForm = sec.type === "order_form";
      var open = sec.id === openId;
      var head = el("div", { class: "b-head lb-head", onclick: function (e) {
        if (e.target.closest("button, input, label")) return;
        openSection(open ? null : sec.id, true);
      } }, [
        el("span", { class: "lb-handle", title: "টেনে ক্রম বদলান", text: "⋮⋮", "data-i": String(i) }),
        el("strong", { text: (open ? "▾ " : "▸ ") + (i + 1) + ". " + LABEL[sec.type] }),
        el("span", { class: "b-actions" }, [
          isForm ? null : el("label", { class: "small-check", title: "চালু/বন্ধ" }, [el("input", { type: "checkbox", checked: sec.enabled !== false, onchange: function (e) { sec.enabled = e.target.checked; card.classList.toggle("off", !e.target.checked); changed(); } }), " চালু"]),
          el("button", { type: "button", class: "btn btn-outline btn-sm", text: "↑", title: "উপরে", onclick: function () { move(i, -1); } }),
          el("button", { type: "button", class: "btn btn-outline btn-sm", text: "↓", title: "নিচে", onclick: function () { move(i, 1); } }),
          isForm ? null : el("button", { type: "button", class: "btn btn-outline btn-sm", text: "⧉", title: "কপি করুন", onclick: function () {
            var copy = JSON.parse(JSON.stringify(sec));
            copy.id = Math.random().toString(36).slice(2, 10);
            state.sections.splice(i + 1, 0, copy);
            openSection(copy.id, true);
            changed();
          } }),
          isForm ? null : el("button", { type: "button", class: "btn-link danger", text: "মুছুন", onclick: function () { if (confirm("সেকশনটি মুছবেন?")) { state.sections.splice(i, 1); drawSections(); changed(); } } }),
        ]),
      ]);
      var card = el("div", { class: "b-section" + (sec.enabled === false ? " off" : "") + (open ? " open" : ""), "data-id": sec.id }, [head]);
      if (open) {
        var body = editor(sec);
        body.appendChild(designBox(sec));
        card.appendChild(body);
      }
      list.appendChild(card);
    });
  }

  function openSection(id, fromPanel) {
    openId = id;
    drawSections();
    highlight();
    if (!id) return;
    var card = list.querySelector('[data-id="' + id + '"]');
    if (card && !fromPanel) card.scrollIntoView({ behavior: "smooth", block: "start" });
    if (fromPanel) scrollPreviewTo(id);
  }

  /* ---------- টেনে ক্রম বদল (⋮⋮) ---------- */
  var dragFrom = null;
  list.addEventListener("pointerdown", function (e) {
    var h = e.target.closest(".lb-handle");
    if (!h) return;
    e.preventDefault();
    dragFrom = h.closest(".b-section");
    dragFrom.classList.add("dragging");
    list.setPointerCapture(e.pointerId);
  });
  list.addEventListener("pointermove", function (e) {
    if (!dragFrom) return;
    var over = document.elementFromPoint(e.clientX, e.clientY);
    var card = over && over.closest && over.closest("#sections > .b-section");
    if (!card || card === dragFrom) return;
    var r = card.getBoundingClientRect();
    list.insertBefore(dragFrom, e.clientY > r.top + r.height / 2 ? card.nextElementSibling : card);
  });
  function dragEnd() {
    if (!dragFrom) return;
    dragFrom.classList.remove("dragging");
    dragFrom = null;
    var order = Array.prototype.map.call(list.children, function (c) { return c.getAttribute("data-id"); });
    state.sections.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
    drawSections();
    changed();
  }
  list.addEventListener("pointerup", dragEnd);
  list.addEventListener("pointercancel", dragEnd);

  /* ---------- আগের অবস্থা / পরের অবস্থা (Ctrl+Z / Ctrl+Y) ---------- */
  var history = [JSON.stringify(state)], hIdx = 0, restoring = false;
  var undoBtn = document.getElementById("lb-undo"), redoBtn = document.getElementById("lb-redo");
  function syncUndo() {
    if (undoBtn) undoBtn.disabled = hIdx <= 0;
    if (redoBtn) redoBtn.disabled = hIdx >= history.length - 1;
  }
  function snapshot() {
    if (restoring) return;
    var cur = JSON.stringify(state);
    if (cur === history[hIdx]) return;
    history = history.slice(0, hIdx + 1);
    history.push(cur);
    if (history.length > 60) history.shift();
    hIdx = history.length - 1;
    syncUndo();
  }
  function go(step) {
    var j = hIdx + step;
    if (j < 0 || j >= history.length) return;
    hIdx = j;
    restoring = true;
    state = JSON.parse(history[hIdx]);
    drawPageStyle();
    drawSections();
    changed();
    restoring = false;
    syncUndo();
  }
  if (undoBtn) undoBtn.addEventListener("click", function () { go(-1); });
  if (redoBtn) redoBtn.addEventListener("click", function () { go(1); });
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return; // লেখার ঘরে ব্রাউজারের নিজের undo
    var k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); go(-1); }
    else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); go(1); }
  });

  /* ---------- নিজে থেকে সেভ ---------- */
  var autoTimer = null;
  function autosave() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      if (!dirty) return;
      var sent = ver;
      var fd = new FormData();
      fd.append("landing_json", JSON.stringify(state));
      fd.append("ajax", "1");
      if (statusEl) statusEl.textContent = "সেভ হচ্ছে…";
      fetch(form.action, { method: "POST", body: fd, credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) throw new Error();
          if (ver !== sent) { autosave(); return; } // সেভের মাঝে আবার বদল — সেটাও সেভ হবে
          dirty = false;
          if (statusEl) statusEl.textContent = "নিজে থেকে সেভ হয়েছে ✓";
        })
        .catch(function () { if (statusEl) statusEl.textContent = "সেভ হয়নি — নিচের \"সেভ করুন\" চাপুন"; });
    }, 2500);
  }

  /* ---------- লাইভ প্রিভিউ ---------- */
  var timer = null, seq = 0, pendingScroll = null;
  var ver = 0; // প্রতিটা বদলে বাড়ে — সেভ চলার মাঝে নতুন বদল এলে সেটা হারাবে না
  function changed() {
    dirty = true;
    ver++;
    clearTimeout(timer);
    timer = setTimeout(function () { snapshot(); refresh(); autosave(); }, 400);
  }
  function refresh() {
    var my = ++seq;
    var fd = new FormData();
    fd.append("landing_json", JSON.stringify(state));
    fd.append("editor", "1");
    if (statusEl) statusEl.textContent = "আপডেট হচ্ছে…";
    fetch(root.dataset.preview, { method: "POST", body: fd, credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
      .then(function (html) {
        if (my !== seq) return;
        var doc = frame.contentDocument;
        pendingScroll = doc && doc.scrollingElement ? doc.scrollingElement.scrollTop : 0;
        frame.srcdoc = html;
        if (statusEl) statusEl.textContent = dirty ? "বদল হয়েছে…" : "";
      })
      .catch(function () { if (statusEl) statusEl.textContent = "প্রিভিউ আপডেট হয়নি"; });
  }
  frame.addEventListener("load", function () {
    var doc = frame.contentDocument;
    if (!doc) return;
    if (pendingScroll && doc.scrollingElement) doc.scrollingElement.scrollTop = pendingScroll;
    // প্রিভিউতে লিংক/ফর্ম কাজ করবে না — ক্লিক মানে সেকশন বাছাই
    doc.addEventListener("click", function (e) {
      e.preventDefault();
      var sec = e.target.closest && e.target.closest("[data-sec]");
      if (!sec) return;
      openSection(sec.getAttribute("data-sec"), false);
      root.classList.add("panel-open");
    }, true);
    doc.addEventListener("submit", function (e) { e.preventDefault(); }, true);
    highlight();
  });
  function highlight() {
    var doc = frame.contentDocument;
    if (!doc) return;
    doc.querySelectorAll("[data-sec]").forEach(function (x) { x.classList.toggle("lb-sel", x.getAttribute("data-sec") === openId); });
  }
  function scrollPreviewTo(id) {
    var doc = frame.contentDocument;
    var x = doc && doc.querySelector('[data-sec="' + id + '"]');
    if (x) x.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // প্যানেলের যেকোনো লেখা/বাছাই বদলালে প্রিভিউ আপডেট
  panel.addEventListener("input", changed);
  panel.addEventListener("change", changed);

  document.querySelectorAll("[data-device]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-device]").forEach(function (x) { x.classList.toggle("active", x === b); });
      document.getElementById("lb-frame-wrap").className = "lb-frame-wrap " + b.dataset.device;
    });
  });
  document.getElementById("lb-open").addEventListener("click", function () { root.classList.add("panel-open"); });
  document.getElementById("lb-close").addEventListener("click", function () { root.classList.remove("panel-open"); });

  document.getElementById("add-section").addEventListener("click", function () {
    var type = document.getElementById("new-type").value;
    var data = {};
    // "ছবির গ্রিড" আসলে গ্রিড মোডের গ্যালারি
    if (type === "gallery_grid") { type = "gallery"; data = { layout: "grid", cols: 2, ratio: "square", images: [], captions: [] }; }
    var sec = { id: Math.random().toString(36).slice(2, 10), type: type, enabled: true, data: data };
    var formIdx = state.sections.findIndex(function (s) { return s.type === "order_form"; });
    state.sections.splice(formIdx < 0 ? state.sections.length : formIdx, 0, sec);
    openSection(sec.id, true);
    changed();
  });

  /* ---------- সেভ, টেমপ্লেট, পণ্য বদল ---------- */
  form.addEventListener("submit", function () { hidden.value = JSON.stringify(state); dirty = false; });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  document.getElementById("save-template").addEventListener("click", function () {
    var name = prompt("টেমপ্লেটের নাম দিন (শুধু আপনার তালিকায় থাকবে):");
    if (!name || !name.trim()) return;
    var fd = new FormData();
    fd.append("name", name.trim());
    fd.append("landing_json", JSON.stringify(state));
    fetch(root.dataset.template, { method: "POST", body: fd, credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) { alert(d.message || "রাখা হয়েছে"); })
      .catch(function () { alert("রাখা যায়নি, আবার চেষ্টা করুন"); });
  });

  document.getElementById("copy-json").addEventListener("click", function () {
    var txt = JSON.stringify(state);
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { alert("JSON কপি হয়েছে"); }, function () { prompt("কপি করুন:", txt); });
    else prompt("কপি করুন:", txt);
  });

  var moveForm = document.getElementById("move-form");
  var productSel = document.getElementById("lb-product");
  var startProduct = productSel.value;
  productSel.addEventListener("change", function () {
    if (productSel.value === startProduct) return;
    if (!confirm(moveForm.dataset.msg)) { productSel.value = startProduct; return; }
    moveForm.querySelector('[name="landing_json"]').value = JSON.stringify(state);
    dirty = false;
    moveForm.submit();
  });

  drawPageStyle();
  drawSections();
  refresh();
  dirty = false;
})();
