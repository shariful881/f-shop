/* ল্যান্ডিং পেজ বিল্ডার (অ্যাডমিন) — সাধারণ JS, কোনো framework নয় */
(function () {
  "use strict";
  var root = document.getElementById("builder");
  if (!root) return;
  var state = JSON.parse(root.dataset.landing);
  var LABEL = JSON.parse(root.dataset.labels);
  var list = document.getElementById("sections");
  var form = document.getElementById("builder-form");
  var hidden = document.getElementById("landing-json");

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
        box.appendChild(field("ছবি যোগ করুন", upload(function (k) { d.images.push(k); drawG(); })));
        break;
      case "video":
        box.appendChild(field("YouTube লিংক", text(d, "youtube_url", "https://youtu.be/...", 300)));
        break;
      case "text":
        box.appendChild(field("লেখা (HTML চলবে: <b>, <h3>, <ul><li> ...)", area(d, "html", "", 8)));
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

  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= state.sections.length) return;
    var t = state.sections[i]; state.sections[i] = state.sections[j]; state.sections[j] = t;
    drawSections();
  }

  function drawSections() {
    list.innerHTML = "";
    state.sections.forEach(function (sec, i) {
      var isForm = sec.type === "order_form";
      var head = el("div", { class: "b-head" }, [
        el("strong", { text: (i + 1) + ". " + LABEL[sec.type] }),
        el("span", { class: "b-actions" }, [
          isForm ? null : el("label", { class: "small-check" }, [el("input", { type: "checkbox", checked: sec.enabled !== false, onchange: function (e) { sec.enabled = e.target.checked; card.classList.toggle("off", !e.target.checked); } }), " চালু"]),
          el("button", { type: "button", class: "btn btn-outline btn-sm", text: "↑", title: "উপরে", onclick: function () { move(i, -1); } }),
          el("button", { type: "button", class: "btn btn-outline btn-sm", text: "↓", title: "নিচে", onclick: function () { move(i, 1); } }),
          isForm ? null : el("button", { type: "button", class: "btn-link danger", text: "মুছুন", onclick: function () { if (confirm("সেকশনটি মুছবেন?")) { state.sections.splice(i, 1); drawSections(); } } }),
        ]),
      ]);
      var card = el("div", { class: "b-section" + (sec.enabled === false ? " off" : "") }, [head, editor(sec)]);
      list.appendChild(card);
    });
  }

  document.getElementById("add-section").addEventListener("click", function () {
    var type = document.getElementById("new-type").value;
    var sec = { id: Math.random().toString(36).slice(2, 10), type: type, enabled: true, data: {} };
    var formIdx = state.sections.findIndex(function (s) { return s.type === "order_form"; });
    state.sections.splice(formIdx < 0 ? state.sections.length : formIdx, 0, sec);
    drawSections();
    list.children[formIdx < 0 ? list.children.length - 1 : formIdx].scrollIntoView({ behavior: "smooth", block: "center" });
  });

  form.addEventListener("submit", function () { hidden.value = JSON.stringify(state); });
  document.getElementById("preview-btn").addEventListener("click", function () {
    hidden.value = JSON.stringify(state);
    form.action = form.dataset.preview; form.target = "_blank"; form.submit();
    form.action = form.dataset.save; form.target = "";
  });

  drawSections();
})();
