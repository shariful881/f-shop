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
  function text(obj, key, ph, max) {
    return el("input", { type: "text", value: obj[key] || "", placeholder: ph || "", maxlength: max || 300, oninput: function (e) { obj[key] = e.target.value; } });
  }
  function area(obj, key, ph, rows) {
    var t = el("textarea", { rows: rows || 3, placeholder: ph || "", oninput: function (e) { obj[key] = e.target.value; } });
    t.value = obj[key] || "";
    return t;
  }
  function upload(onDone) {
    var inp = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp" });
    inp.addEventListener("change", function () {
      if (!inp.files[0]) return;
      var fd = new FormData();
      fd.append("image", inp.files[0]);
      inp.disabled = true;
      fetch("/admin/upload-image", { method: "POST", body: fd, credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.key) onDone(d.key); else alert(d.message || "আপলোড হয়নি"); })
        .catch(function () { alert("আপলোড হয়নি"); })
        .finally(function () { inp.disabled = false; inp.value = ""; });
    });
    return inp;
  }
  function stringList(obj, key, ph) {
    obj[key] = obj[key] || [];
    var wrap = el("div", { class: "b-list" });
    function draw() {
      wrap.innerHTML = "";
      obj[key].forEach(function (v, i) {
        wrap.appendChild(el("div", { class: "b-row" }, [
          el("input", { type: "text", value: v, placeholder: ph, oninput: function (e) { obj[key][i] = e.target.value; } }),
          el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { obj[key].splice(i, 1); draw(); } }),
        ]));
      });
      wrap.appendChild(el("button", { type: "button", class: "btn btn-outline btn-sm", text: "+ যোগ করুন", onclick: function () { obj[key].push(""); draw(); } }));
    }
    draw();
    return wrap;
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
        var g = el("div", { class: "b-images" });
        var drawG = function () {
          g.innerHTML = "";
          d.images.forEach(function (k, i) {
            g.appendChild(el("div", { class: "b-img" }, [
              el("img", { src: "/img/" + k, alt: "" }),
              el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { d.images.splice(i, 1); drawG(); } }),
            ]));
          });
        };
        drawG();
        box.appendChild(g);
        if (!d.images.length) box.appendChild(el("p", { class: "muted small", text: "ফাঁকা থাকলে পণ্যের ছবি দেখাবে (পণ্য এডিট থেকে বদলান)।" }));
        box.appendChild(field("আলাদা ছবি যোগ করুন (ঐচ্ছিক)", upload(function (k) { d.images.push(k); drawG(); })));
        break;
      case "video":
        box.appendChild(field("YouTube লিংক", text(d, "youtube_url", "ফাঁকা থাকলে পণ্যের ভিডিও", 300)));
        break;
      case "text":
        box.appendChild(field("লেখা (HTML চলবে: <b>, <h3>, <ul><li> ...)", area(d, "html", "ফাঁকা থাকলে পণ্যের বিস্তারিত দেখাবে", 8)));
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
                el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { d.reviews.splice(i, 1); drawR(); } })]),
              area(r, "text", "রিভিউ", 2),
              r.image ? el("div", { class: "b-img" }, [el("img", { src: "/img/" + r.image, alt: "" }),
                el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { r.image = ""; drawR(); } })]) : null,
              field("স্ক্রিনশট (ঐচ্ছিক)", upload(function (k) { r.image = k; drawR(); })),
            ]);
            rw.appendChild(card);
          });
          rw.appendChild(el("button", { type: "button", class: "btn btn-outline btn-sm", text: "+ রিভিউ যোগ করুন", onclick: function () { d.reviews.push({ name: "", rating: 5, text: "", image: "" }); drawR(); } }));
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
                el("button", { type: "button", class: "btn-link danger", text: "✕", onclick: function () { d.faqs.splice(i, 1); drawF(); } })]),
              area(f, "a", "উত্তর", 2),
            ]));
          });
          fw.appendChild(el("button", { type: "button", class: "btn btn-outline btn-sm", text: "+ প্রশ্ন যোগ করুন", onclick: function () { d.faqs.push({ q: "", a: "" }); drawF(); } }));
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
    var hasBtn = ["hero", "order_form", "benefits", "countdown"].indexOf(sec.type) >= 0;
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
      el("div", { class: "b-body" }, [selectField(state.style, "font", "পেজের ফন্ট", fontOptions("থিমের ফন্ট"))]),
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
        el("strong", { text: (open ? "▾ " : "▸ ") + (i + 1) + ". " + LABEL[sec.type] }),
        el("span", { class: "b-actions" }, [
          isForm ? null : el("label", { class: "small-check", title: "চালু/বন্ধ" }, [el("input", { type: "checkbox", checked: sec.enabled !== false, onchange: function (e) { sec.enabled = e.target.checked; card.classList.toggle("off", !e.target.checked); changed(); } }), " চালু"]),
          el("button", { type: "button", class: "btn btn-outline btn-sm", text: "↑", title: "উপরে", onclick: function () { move(i, -1); } }),
          el("button", { type: "button", class: "btn btn-outline btn-sm", text: "↓", title: "নিচে", onclick: function () { move(i, 1); } }),
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

  /* ---------- লাইভ প্রিভিউ ---------- */
  var timer = null, seq = 0, pendingScroll = null;
  function changed() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(refresh, 400);
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
        if (statusEl) statusEl.textContent = dirty ? "সেভ হয়নি" : "";
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
    var sec = { id: Math.random().toString(36).slice(2, 10), type: type, enabled: true, data: {} };
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
