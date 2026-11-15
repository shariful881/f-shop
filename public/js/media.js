/* SellxBD মিডিয়া: ছবি ছোট করা, লাইব্রেরি থেকে বাছাই, ক্রপ, রেডি ব্যাকগ্রাউন্ড।
   ব্যবহার: [data-media-field] (views/media-field.tsx) নিজে থেকে চলে;
   অন্য স্ক্রিপ্ট থেকে: SellxMedia.choose({ folder, ratio }, function (key, url) {}) */
(function () {
  "use strict";
  var MAX_SIDE = 1600;
  var QUALITY = 0.82;
  var FOLDERS = [["", "সব"], ["product", "পণ্য"], ["banner", "ব্যানার"], ["logo", "লোগো"], ["landing", "ল্যান্ডিং"], ["theme", "থিম"]];
  var RATIOS = [["free", "ইচ্ছেমতো"], ["1:1", "১:১"], ["4:5", "৪:৫"], ["16:9", "১৬:৯"], ["8:3", "ব্যানার ৮:৩"]];
  var GRADIENTS = [
    ["#0f766e", "#14b8a6"], ["#7c3aed", "#ec4899"], ["#ea580c", "#facc15"], ["#0f172a", "#334155"],
    ["#be123c", "#fb7185"], ["#1d4ed8", "#06b6d4"], ["#166534", "#84cc16"], ["#78350f", "#d6a35c"],
    ["#fdf2f8", "#fce7f3"], ["#f0fdfa", "#ccfbf1"], ["#fff7ed", "#fed7aa"], ["#f8fafc", "#e2e8f0"],
  ];
  var bnDigits = "০১২৩৪৫৬৭৮৯";
  function bn(n) { return String(n).replace(/[0-9]/g, function (d) { return bnDigits[d]; }); }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function ratioNum(r) {
    if (!r || r === "free") return 0;
    var p = String(r).split(":");
    return parseFloat(p[0]) / parseFloat(p[1] || 1);
  }

  /* ---------------- ছবি ছোট করা (C3) ---------------- */
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = rej;
      img.src = src;
    });
  }
  function canvasBlob(canvas) {
    return new Promise(function (res) {
      canvas.toBlob(function (b) {
        if (b && b.type === "image/webp") return res(b);
        canvas.toBlob(function (j) { res(j); }, "image/jpeg", QUALITY); // পুরনো Safari: WebP না পারলে JPG
      }, "image/webp", QUALITY);
    });
  }
  function stem(name) { return String(name || "image").replace(/\.[a-z0-9]+$/i, ""); }
  function asFile(blob, name) {
    var ext = blob.type === "image/webp" ? "webp" : "jpg";
    try { return new File([blob], stem(name) + "." + ext, { type: blob.type }); }
    catch (e) { blob.name = stem(name) + "." + ext; return blob; }
  }
  /** বড় ছবি ছোট করে WebP; ছোট ছবি যেমন আছে তেমন। ফেরত: { file, w, h } */
  function compress(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.resolve({ file: file, w: 0, h: 0 });
    var url = URL.createObjectURL(file);
    return loadImage(url).then(function (img) {
      URL.revokeObjectURL(url);
      var w = img.naturalWidth, h = img.naturalHeight;
      var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      if (scale === 1 && file.size < 300 * 1024) return { file: file, w: w, h: h };
      var c = document.createElement("canvas");
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return canvasBlob(c).then(function (b) {
        if (!b || b.size >= file.size) return { file: file, w: w, h: h };
        return { file: asFile(b, file.name), w: c.width, h: c.height };
      });
    }).catch(function () { URL.revokeObjectURL(url); return { file: file, w: 0, h: 0 }; });
  }
  function setFiles(input, files) {
    try {
      var dt = new DataTransfer();
      files.forEach(function (f) { dt.items.add(f); });
      input.files = dt.files;
      return true;
    } catch (e) { return false; }
  }
  // অ্যাডমিনের সব ছবির ফাইল ইনপুট: বাছার সাথে সাথে ছোট করা
  document.addEventListener("change", function (e) {
    var input = e.target;
    if (!input || input.type !== "file" || input.dataset.compressed === "1" || input.hasAttribute("data-no-compress")) return;
    if (!/image/.test(input.getAttribute("accept") || "")) return;
    var list = Array.prototype.slice.call(input.files || []);
    if (!list.length) return;
    e.stopImmediatePropagation();
    var form = input.form;
    var btns = form ? form.querySelectorAll("button") : [];
    Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
    Promise.all(list.map(compress)).then(function (out) {
      setFiles(input, out.map(function (o) { return o.file; })); // না পারলে আসল ফাইলই যাবে
      input.dataset.compressed = "1";
      Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
      input.dispatchEvent(new Event("change", { bubbles: true })); // অন্য লিসেনার (প্রিভিউ, অটো-সাবমিট)
      input.dataset.compressed = "";
    });
  }, true);

  // মিডিয়া পেজ: ফাইল বাছলেই আপলোড
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.hasAttribute && t.hasAttribute("data-autosubmit") && t.files && t.files.length && t.dataset.compressed === "1") {
      var f = t.form;
      var lbl = f.querySelector("label.btn");
      if (lbl) lbl.classList.add("is-busy");
      f.submit();
    }
  });
  // লিংক কপি
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-copy]");
    if (!b) return;
    var url = location.origin + b.getAttribute("data-copy");
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
      var old = b.innerHTML; b.textContent = "কপি হয়েছে ✓"; setTimeout(function () { b.innerHTML = old; }, 1400);
    }).catch(function () { prompt("লিংক কপি করুন:", url); });
  });

  /* ---------------- আপলোড ---------------- */
  function upload(file, folder, w, h) {
    var fd = new FormData();
    fd.append("image", file, file.name || "image.webp");
    fd.append("folder", folder || "product");
    fd.append("name", stem(file.name));
    if (w) fd.append("w", String(w));
    if (h) fd.append("h", String(h));
    return fetch("/admin/upload-image", { method: "POST", body: fd, credentials: "same-origin" })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.key) throw new Error(d.message || "আপলোড হয়নি"); return d; }); });
  }

  /* ---------------- মডাল ---------------- */
  var modal = null;
  function closeModal() { if (modal) { modal.remove(); modal = null; document.body.classList.remove("mm-open"); } }
  function openModal(title, body, footer) {
    closeModal();
    modal = el("div", { class: "mm", role: "dialog", "aria-modal": "true", "aria-label": title }, [
      el("div", { class: "mm-box" }, [
        el("header", { class: "mm-head" }, [el("strong", { text: title }), el("button", { type: "button", class: "mm-x", "aria-label": "বন্ধ", text: "✕", onclick: closeModal })]),
        el("div", { class: "mm-body" }, [body]),
        footer ? el("footer", { class: "mm-foot" }, [footer]) : null,
      ]),
    ]);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);
    document.body.classList.add("mm-open");
    return modal;
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(); closeMenu(); } });

  /* ---------------- বাছাইয়ের জানালা: লাইব্রেরি / আপলোড / ব্যাকগ্রাউন্ড ---------------- */
  /** opts: { folder, ratio, tab: "library"|"upload"|"backgrounds", filter } ; done(key, url) */
  function choose(opts, done) {
    opts = opts || {};
    var tabs = el("nav", { class: "mm-tabs" });
    var pane = el("div", { class: "mm-pane" });
    var body = el("div", {}, [tabs, pane]);
    openModal("ছবি বাছুন", body);
    var TABS = [["library", "আমার লাইব্রেরি"], ["upload", "নতুন আপলোড"], ["backgrounds", "রেডি ব্যাকগ্রাউন্ড"]];
    function show(t) {
      Array.prototype.forEach.call(tabs.children, function (b) { b.classList.toggle("active", b.dataset.t === t); });
      pane.innerHTML = "";
      if (t === "library") library(pane, opts, done);
      else if (t === "upload") uploader(pane, opts, done);
      else backgrounds(pane, opts, done);
    }
    TABS.forEach(function (t) { tabs.appendChild(el("button", { type: "button", "data-t": t[0], text: t[1], onclick: function () { show(t[0]); } })); });
    show(opts.tab || "library");
  }

  function library(pane, opts, done) {
    var state = { folder: opts.filter != null ? opts.filter : "", q: "", offset: 0 };
    var chips = el("div", { class: "mm-chips" });
    var search = el("input", { type: "search", placeholder: "নাম দিয়ে খুঁজুন", class: "input" });
    var grid = el("div", { class: "mm-grid" });
    var more = el("button", { type: "button", class: "btn btn-sm btn-outline", text: "আরও দেখুন", hidden: true });
    FOLDERS.forEach(function (f) {
      chips.appendChild(el("button", { type: "button", "data-f": f[0], class: f[0] === state.folder ? "active" : "", text: f[1], onclick: function () {
        state.folder = f[0]; state.offset = 0;
        Array.prototype.forEach.call(chips.children, function (c) { c.classList.toggle("active", c.dataset.f === f[0]); });
        load(true);
      } }));
    });
    var t;
    search.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { state.q = search.value; state.offset = 0; load(true); }, 300); });
    more.addEventListener("click", function () { load(false); });
    pane.appendChild(el("div", { class: "mm-tools" }, [chips, search]));
    pane.appendChild(grid);
    pane.appendChild(el("div", { class: "mm-more" }, [more]));
    function load(reset) {
      if (reset) grid.innerHTML = '<p class="muted mm-msg">লোড হচ্ছে…</p>';
      var u = "/admin/media.json?folder=" + encodeURIComponent(state.folder) + "&q=" + encodeURIComponent(state.q) + "&offset=" + state.offset;
      fetch(u, { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (d) {
        if (reset) grid.innerHTML = "";
        if (!d.items.length && reset) {
          grid.appendChild(el("p", { class: "muted mm-msg", text: "কোনো ছবি নেই। \"নতুন আপলোড\" থেকে যোগ করুন।" }));
        }
        d.items.forEach(function (it) {
          grid.appendChild(el("button", { type: "button", class: "mm-item", title: it.name || "", onclick: function () { closeModal(); done(it.key, it.url); } }, [
            el("img", { src: it.url, alt: "", loading: "lazy" }),
            el("span", { text: it.name || "" }),
          ]));
        });
        state.offset += d.items.length;
        more.hidden = !d.hasMore;
      }).catch(function () { grid.innerHTML = '<p class="muted mm-msg">লোড হয়নি — আবার চেষ্টা করুন।</p>'; });
    }
    load(true);
  }

  function uploader(pane, opts, done) {
    var input = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", "data-no-compress": "1", hidden: true });
    var drop = el("label", { class: "mm-drop" }, [
      el("span", { class: "mm-drop-ico", text: "⬆" }),
      el("strong", { text: "ফোন বা কম্পিউটার থেকে ছবি বাছুন" }),
      el("small", { class: "muted", text: "JPG, PNG বা WebP — বড় ছবি নিজে থেকে ছোট হয়ে যাবে" }),
      input,
    ]);
    pane.appendChild(drop);
    function take(file) { if (file) crop(file, opts, done); }
    input.addEventListener("change", function () { take(input.files[0]); });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("over"); take(e.dataTransfer.files[0]); });
    if (opts.autoPick) input.click();
  }

  /* ---------------- ক্রপ (C5) ---------------- */
  function crop(file, opts, done) {
    var url = URL.createObjectURL(file);
    loadImage(url).then(function (img) {
      var iw = img.naturalWidth, ih = img.naturalHeight;
      var ratio = opts.ratio || "free";
      var vw = Math.min(560, window.innerWidth - 48), vh = Math.round(vw * 0.72);
      var view = el("div", { class: "cr-view", style: "width:" + vw + "px;height:" + vh + "px" });
      var pic = el("img", { src: url, alt: "", draggable: "false" });
      var frame = el("div", { class: "cr-frame" });
      view.appendChild(pic); view.appendChild(frame);
      var zoom = el("input", { type: "range", min: "1", max: "3", step: "0.01", value: "1", "aria-label": "জুম" });
      var ratioBar = el("div", { class: "mm-chips" });
      var st = { fx: 0, fy: 0, fw: 0, fh: 0, base: 1, z: 1, x: 0, y: 0 };
      function layout() {
        var r = ratioNum(ratio) || iw / ih;
        var pad = 16, mw = vw - pad * 2, mh = vh - pad * 2;
        st.fw = Math.min(mw, mh * r); st.fh = st.fw / r;
        st.fx = (vw - st.fw) / 2; st.fy = (vh - st.fh) / 2;
        st.base = Math.max(st.fw / iw, st.fh / ih);
        st.z = 1; zoom.value = "1";
        st.x = st.fx + (st.fw - iw * st.base) / 2; st.y = st.fy + (st.fh - ih * st.base) / 2;
        frame.style.cssText = "left:" + st.fx + "px;top:" + st.fy + "px;width:" + st.fw + "px;height:" + st.fh + "px";
        draw();
      }
      function clamp() {
        var s = st.base * st.z, w = iw * s, h = ih * s;
        st.x = Math.min(st.fx, Math.max(st.fx + st.fw - w, st.x));
        st.y = Math.min(st.fy, Math.max(st.fy + st.fh - h, st.y));
      }
      function draw() {
        clamp();
        var s = st.base * st.z;
        pic.style.cssText = "width:" + iw * s + "px;height:" + ih * s + "px;transform:translate(" + st.x + "px," + st.y + "px)";
      }
      zoom.addEventListener("input", function () {
        var cx = st.fx + st.fw / 2, cy = st.fy + st.fh / 2;
        var old = st.base * st.z, nz = parseFloat(zoom.value), ns = st.base * nz;
        st.x = cx - (cx - st.x) * ns / old; st.y = cy - (cy - st.y) * ns / old; st.z = nz;
        draw();
      });
      var drag = null;
      view.addEventListener("pointerdown", function (e) { drag = { px: e.clientX, py: e.clientY, x: st.x, y: st.y }; view.setPointerCapture(e.pointerId); });
      view.addEventListener("pointermove", function (e) { if (!drag) return; st.x = drag.x + e.clientX - drag.px; st.y = drag.y + e.clientY - drag.py; draw(); });
      view.addEventListener("pointerup", function () { drag = null; });
      view.addEventListener("wheel", function (e) { e.preventDefault(); zoom.value = String(Math.min(3, Math.max(1, st.z - e.deltaY / 500))); zoom.dispatchEvent(new Event("input")); }, { passive: false });
      RATIOS.forEach(function (r) {
        ratioBar.appendChild(el("button", { type: "button", "data-r": r[0], class: r[0] === ratio ? "active" : "", text: r[1], onclick: function () {
          ratio = r[0];
          Array.prototype.forEach.call(ratioBar.children, function (c) { c.classList.toggle("active", c.dataset.r === ratio); });
          layout();
        } }));
      });
      var status = el("small", { class: "muted" });
      var save = el("button", { type: "button", class: "btn btn-primary", text: "বসিয়ে দিন" });
      var skip = el("button", { type: "button", class: "btn", text: "ক্রপ ছাড়া" });
      function finish(doCrop) {
        save.disabled = skip.disabled = true;
        status.textContent = "আপলোড হচ্ছে…";
        var s = st.base * st.z;
        var sx = doCrop ? (st.fx - st.x) / s : 0, sy = doCrop ? (st.fy - st.y) / s : 0;
        var sw = doCrop ? st.fw / s : iw, sh = doCrop ? st.fh / s : ih;
        var out = Math.min(1, MAX_SIDE / Math.max(sw, sh));
        var c = document.createElement("canvas");
        c.width = Math.round(sw * out); c.height = Math.round(sh * out);
        c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        canvasBlob(c).then(function (b) {
          return upload(asFile(b, file.name), opts.folder, c.width, c.height);
        }).then(function (d) {
          URL.revokeObjectURL(url);
          closeModal();
          done(d.key, d.url);
        }).catch(function (err) {
          status.textContent = err.message || "আপলোড হয়নি";
          save.disabled = skip.disabled = false;
        });
      }
      save.addEventListener("click", function () { finish(true); });
      skip.addEventListener("click", function () { finish(false); });
      openModal("ছবি ঠিক করুন", el("div", { class: "cr" }, [
        ratioBar, view,
        el("label", { class: "cr-zoom" }, [el("span", { text: "জুম" }), zoom]),
        el("small", { class: "muted", text: "ছবি টেনে সরান, জুম দিয়ে বড়-ছোট করুন। দাগের ভেতরের অংশটুকু থাকবে।" }),
      ]), el("div", { class: "mm-foot-row" }, [status, el("span", { class: "bulk-gap" }), skip, save]));
      layout();
    }).catch(function () { alert("ছবিটা খোলা গেল না"); });
  }

  /* ---------------- রেডি ব্যাকগ্রাউন্ড ---------------- */
  function bgCanvas(g, ratio) {
    var r = ratioNum(ratio) || 8 / 3;
    var w = r >= 1 ? 1600 : Math.round(1600 * r), h = Math.round(w / r);
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var x = c.getContext("2d");
    var grad = x.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, g[0]); grad.addColorStop(1, g[1]);
    x.fillStyle = grad; x.fillRect(0, 0, w, h);
    // হালকা বৃত্তের নকশা
    x.globalAlpha = 0.12; x.fillStyle = "#ffffff";
    [[0.85, 0.2, 0.35], [0.95, 0.9, 0.25], [0.1, 1.0, 0.3]].forEach(function (p) {
      x.beginPath(); x.arc(w * p[0], h * p[1], Math.max(w, h) * p[2], 0, Math.PI * 2); x.fill();
    });
    return c;
  }
  function backgrounds(pane, opts, done) {
    var grid = el("div", { class: "mm-grid mm-bg" });
    var status = el("small", { class: "muted", text: "রং বেছে নিন — ব্যানার বা সেকশনের পেছনে লেখা বসানোর জন্য।" });
    GRADIENTS.forEach(function (g, i) {
      var prev = bgCanvas(g, opts.ratio === "free" ? "8:3" : opts.ratio);
      grid.appendChild(el("button", { type: "button", class: "mm-item", onclick: function () {
        status.textContent = "তৈরি হচ্ছে…";
        canvasBlob(prev).then(function (b) { return upload(asFile(b, "background-" + (i + 1)), opts.folder === "product" ? "banner" : opts.folder, prev.width, prev.height); })
          .then(function (d) { closeModal(); done(d.key, d.url); })
          .catch(function (err) { status.textContent = err.message || "হয়নি"; });
      } }, [el("img", { src: prev.toDataURL("image/jpeg", 0.6), alt: "" })]));
    });
    pane.appendChild(status);
    pane.appendChild(grid);
  }

  /* ---------------- ছবির ঘরের ড্রপডাউন (C4) ---------------- */
  var menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  document.addEventListener("click", function (e) {
    if (menu && !menu.contains(e.target)) closeMenu();
  });
  function applyPick(field, key, url) {
    var pick = field.querySelector("[data-mf-pick]");
    var file = field.querySelector(".mf-file");
    var rm = field.querySelector("[data-mf-remove]");
    var note = field.querySelector("[data-mf-note]");
    var prev = field.querySelector(".mf-preview");
    pick.value = key;
    if (file) file.value = "";
    if (rm) rm.checked = false;
    prev.innerHTML = "";
    prev.appendChild(el("img", { src: url, alt: "" }));
    if (note) { note.hidden = false; note.textContent = "নতুন ছবি বাছা হয়েছে — নিচে সেভ করুন।"; }
    field.classList.add("mf-changed");
    pick.dispatchEvent(new Event("change", { bubbles: true })); // থিম এডিটর সাথে সাথে সেভ করে
  }
  function openMenu(field, anchor) {
    closeMenu();
    var folder = field.dataset.folder || "product", ratio = field.dataset.ratio || "free";
    var opts = { folder: folder, ratio: ratio };
    var done = function (k, u) { applyPick(field, k, u); };
    var items = [
      ["পণ্যের ছবি", "দোকানের পণ্যগুলোর ছবি থেকে", function () { choose({ folder: folder, ratio: ratio, filter: "product" }, done); }],
      ["আমার লাইব্রেরি", "আগে আপলোড করা সব ছবি", function () { choose({ folder: folder, ratio: ratio, filter: "" }, done); }],
      ["নতুন আপলোড", "ফোন বা কম্পিউটার থেকে, ক্রপ করে", function () { choose({ folder: folder, ratio: ratio, tab: "upload", autoPick: true }, done); }],
      ["রেডি ব্যাকগ্রাউন্ড", "রঙিন ব্যাকগ্রাউন্ড, এক ক্লিকে", function () { choose({ folder: folder, ratio: ratio, tab: "backgrounds" }, done); }],
    ];
    menu = el("div", { class: "mf-menu", role: "menu" });
    items.forEach(function (it) {
      menu.appendChild(el("button", { type: "button", role: "menuitem", onclick: function () { closeMenu(); it[2](); } }, [el("strong", { text: it[0] }), el("small", { text: it[1] })]));
    });
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect();
    var left = Math.min(window.innerWidth - menu.offsetWidth - 8, Math.max(8, r.left));
    var top = r.bottom + 6;
    if (top + menu.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - menu.offsetHeight - 6);
    menu.style.left = left + window.scrollX + "px";
    menu.style.top = top + window.scrollY + "px";
    void opts;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-mf-open]");
    if (!b) return;
    var field = b.closest("[data-media-field]");
    if (!field) return;
    e.preventDefault();
    e.stopPropagation();
    if (menu) { closeMenu(); return; }
    openMenu(field, b);
  });
  // সাধারণ ফাইল বাছলে প্রিভিউ (জাভাস্ক্রিপ্ট আছে কিন্তু কেউ লুকানো ফাইল ইনপুট চালালে)
  document.documentElement.classList.add("js-media");

  window.SellxMedia = { choose: choose, compress: compress, upload: upload };
})();
