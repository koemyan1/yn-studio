// Visual editor v4: open /wedding/?edit=1
//  - tap/click any item to select it, DRAG it to move
//  - drag a gold CORNER HANDLE to resize (pictures = width, seal = size, everything else = scale)
//  - arrow keys / the arrow buttons nudge (Shift = x10)
//  - "Details" tab edits names, date, venue, programme, photos, QR. These are stored in the design, so config.js is not needed.
(() => {
  const W = window.WD, D = W.D, C0 = W.C0, $ = (s) => document.querySelector(s);
  const h = (t, a = {}, ...k) => { const e = Object.assign(document.createElement(t), a); e.append(...k); return e; };
  const P = (p) => (Array.isArray(p) ? p : p.split("."));
  const get = (p) => P(p).reduce((o, k) => o?.[k], D);
  const put = (p, v) => { const a = P(p).slice(), l = a.pop(); a.reduce((o, k) => (o[k] ??= {}), D)[l] = v; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let sel = null, tab = "text", cur = "cover";

  document.head.append(h("style", { textContent: `
  body.editing [data-e]{cursor:grab;user-select:none;-webkit-user-select:none;outline:1px dashed rgba(240,216,144,.45);outline-offset:3px}
  body.editing [data-e].sel{outline:2px solid #f0d890;touch-action:none}
  body.editing{padding-bottom:50vh}
  #wdt{position:fixed;z-index:60;right:8px;top:8px;width:40px;height:40px;border-radius:50%;border:2px solid #d9b35f;background:#0a1d1e;color:#f0d890;font-size:18px;cursor:pointer}
  #wdp{position:fixed;z-index:50;left:0;right:0;bottom:0;max-height:46vh;overflow:auto;background:#0a1d1e;color:#f3ece0;font:14px/1.4 system-ui,sans-serif;border-top:2px solid #d9b35f;padding:8px 10px}
  #wdp label{display:grid;gap:2px;margin:6px 0;font-size:12px;color:#a9c4bf} #wdp input,#wdp select,#wdp textarea{font:inherit;color:#fff;background:#173a3c;border:1px solid #3a6;border-radius:6px;padding:6px;width:100%}
  #wdp input[type=color]{height:34px;padding:2px} #wdp input[type=checkbox]{width:auto} #wdp input[type=range]{padding:0}
  #wdp button{font:inherit;background:#d9b35f;color:#0b2527;border:0;border-radius:6px;padding:7px 10px;margin:3px 3px 3px 0;cursor:pointer}
  #wdp button.g{background:#173a3c;color:#f3ece0;border:1px solid #3a6} #wdp .row{display:flex;flex-wrap:wrap;gap:2px} #wdp p{margin:6px 0;color:#a9c4bf;font-size:12px}
  #wdp hr{border:0;border-top:1px solid #265;margin:8px 0}
  #wdp .pad{display:grid;grid-template-columns:repeat(3,44px);gap:2px;margin:4px 0} #wdp .pad button{margin:0;padding:8px 0;font-size:16px}
  #wdbox{position:fixed;z-index:45;display:none;pointer-events:none;border:2px solid #f0d890;box-shadow:0 0 0 1px rgba(0,0,0,.45);box-sizing:border-box}
  #wdbox .wdh{position:absolute;width:20px;height:20px;background:#f0d890;border:2px solid #0b2527;border-radius:50%;pointer-events:auto;touch-action:none;cursor:nwse-resize}
  #wdbox .wdh::after{content:"";position:absolute;inset:-14px}
  #wdbox .nw{left:-11px;top:-11px} #wdbox .ne{right:-11px;top:-11px;cursor:nesw-resize} #wdbox .sw{left:-11px;bottom:-11px;cursor:nesw-resize} #wdbox .se{right:-11px;bottom:-11px}
  @media(min-width:900px){#wdt{right:340px}#wdp{left:auto;top:0;width:330px;max-height:none;border-top:0;border-left:2px solid #d9b35f}body.editing{padding-bottom:0;margin-right:330px}}` }));
  document.body.append(h("div", { id: "wdp" }));
  document.body.append(h("button", { id: "wdt", textContent: "▾", title: "Hide / show editor", onclick: () => { const p = $("#wdp"), s = p.style.display === "none"; p.style.display = s ? "" : "none"; $("#wdt").textContent = s ? "▾" : "✎"; } }));
  const box = h("div", { id: "wdbox" }, ...["nw", "ne", "sw", "se"].map((c) => h("i", { className: "wdh " + c })));
  document.body.append(box);

  const say = (m) => { const t = h("div", { textContent: m }); t.style.cssText = "position:fixed;z-index:70;left:50%;top:14px;transform:translateX(-50%);background:#f0d890;color:#0b2527;padding:8px 14px;border-radius:20px;font:600 13px system-ui"; document.body.append(t); setTimeout(() => t.remove(), 2200); };
  const commit = () => { try { localStorage.setItem(W.DK, JSON.stringify(D)); } catch { if (!W.fullWarned) { W.fullWarned = 1; say("Browser backup is full (big pictures). Tap Save draft so nothing is lost."); } } W.dirty(); W.apply(); };
  const pick = (max0, cb, sq, png) => {
    const max = Math.min(max0, png ? 500 : 800);
    const i = h("input", { type: "file", accept: "image/*" }); i.style.cssText = "position:fixed;left:-999px;opacity:0"; document.body.append(i);
    i.onchange = () => { const f = i.files[0]; if (!f) return i.remove(); const r = new FileReader();
      r.onerror = () => { say("Could not read that picture"); i.remove(); };
      r.onload = () => { const im = new Image(); im.onerror = () => { say("Could not open that picture"); i.remove(); };
        im.onload = () => { try { const s = sq ? Math.min(im.width, im.height) : 0, k = Math.min(1, max / (sq ? s : Math.max(im.width, im.height))), c = h("canvas", { width: Math.max(1, Math.round((sq ? s : im.width) * k)), height: Math.max(1, Math.round((sq ? s : im.height) * k)) }); if (sq) c.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, c.width, c.height); else c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL(png ? "image/png" : "image/jpeg", 0.72)); say("Picture added ✓"); } catch (x) { say("Picture failed: " + x.message); } i.remove(); };
        im.src = r.result; };
      r.readAsDataURL(f); };
    i.click();
  };
  const yNew = () => (cur === "cover" || cur === "back" ? 140 : Math.max(40, Math.round(scrollY + 160 - (document.querySelector(`.pg[data-pg="${cur}"]`)?.offsetTop || 0))));
  const addItem = (x, o) => { const id = "t" + Date.now().toString(36); D.add.push({ id, pg: cur === "back" ? "cover" : cur, ...x }); D.o[id] = { y: yNew(), ...o }; sel = id; commit(); mark(); render(); };
  const btn = (t, f, g) => h("button", { textContent: t, onclick: () => { try { f(); } catch (x) { say("Error: " + x.message); } }, className: g ? "g" : "" });
  const fld = (label, type, path, def, o = {}) => {
    let i;
    if (type === "select") { i = h("select"); o.opt.forEach(([v, t]) => i.append(h("option", { value: v, textContent: t }))); i.value = get(path) ?? def; }
    else if (type === "area") { i = h("textarea", { rows: 3 }); i.value = get(path) ?? def ?? ""; }
    else { i = h("input", { type, ...o }); if (type === "checkbox") i.checked = !!(get(path) ?? def); else i.value = get(path) ?? def ?? ""; }
    i.oninput = () => { put(path, type === "checkbox" ? i.checked : type === "range" || type === "number" ? +i.value : i.value); commit(); };
    return h("label", {}, label, i);
  };

  // ---------- selection helpers ----------
  const selEl = () => (sel ? document.querySelector(`[data-e="${CSS.escape(sel)}"]`) : null);
  const kindOf = (k) => (k === "#seal" ? "seal" : D.add.find((a) => a.id === k)?.k === "img" ? "img" : "el");
  const mark = () => document.querySelectorAll("[data-e]").forEach((e) => e.classList.toggle("sel", e.dataset.e === sel));
  const select = (k) => { sel = k; mark(); render(); };
  const shown = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0; };

  // Which item is under the pointer? Uses the items' own rectangles (not the browser's hit-test), so it also works on the flipping
  // 3D envelope and when items overlap. The smallest item under the finger wins.
  function hit(x, y) {
    const turned = $("#cover").classList.contains("turned"), cover = !$("#cover").classList.contains("gone");
    let best = null, area = Infinity;
    document.querySelectorAll("[data-e]").forEach((el) => {
      if (el.closest("#wdp,#wdt,#wdbox")) return;
      if (cover && el.closest(".env-front") && turned) return;       // front side hidden after the flip
      if (cover && el.closest(".env-rear") && !turned) return;       // back side hidden before the flip
      if (el.id === "seal" && el.classList.contains("peeled")) return;
      if (!shown(el)) return;
      const r = el.getBoundingClientRect(), pad = 4;
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return;
      const a = r.width * r.height;
      if (a <= area) { area = a; best = el.dataset.e; }
    });
    return best;
  }

  // gold box + corner handles follow the selected item
  (function track() {
    const el = selEl();
    if (!el || !shown(el)) box.style.display = "none";
    else { const r = el.getBoundingClientRect(); Object.assign(box.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }); }
    requestAnimationFrame(track);
  })();

  // ---------- drag to move / corner to resize ----------
  let g = null;
  const sealRect = () => $(".env-rear").getBoundingClientRect();
  document.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || e.target.closest("#wdp,#wdt")) return;
    const hd = e.target.closest(".wdh");
    if (hd && sel) {                                         // start RESIZE
      e.preventDefault();
      const el = selEl(), r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, k = kindOf(sel), o = (D.o[sel] ??= {});
      g = { mode: "size", k, cx, cy, d0: Math.max(10, Math.hypot(e.clientX - cx, e.clientY - cy)), s0: k === "seal" ? D.seal.size || 76 : k === "img" ? o.w || 160 : o.k || 1, moved: false };
      return;
    }
    const k = hit(e.clientX, e.clientY);
    if (!k) { if (sel) select(null); return; }
    if (e.pointerType === "touch" && k !== sel) { g = { mode: "tap", k, x: e.clientX, y: e.clientY }; return; }  // touch: first tap selects, then drag moves
    e.preventDefault();
    if (k !== sel) select(k);
    const o = (D.o[k] ??= {});
    g = { mode: "move", k, x: e.clientX, y: e.clientY, ox: o.x || 0, oy: o.y || 0, sx: D.seal.x ?? 50, sy: D.seal.y ?? 50, moved: false };
  }, true);
  document.addEventListener("pointermove", (e) => {
    if (!g) return;
    if (g.mode === "tap") { if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) g = null; return; }
    if (g.mode === "size") {
      const f = Math.hypot(e.clientX - g.cx, e.clientY - g.cy) / g.d0, o = (D.o[sel] ??= {});
      if (g.k === "seal") D.seal.size = clamp(Math.round(g.s0 * f), 30, 300);
      else if (g.k === "img") o.w = clamp(Math.round(g.s0 * f), 30, 1200);
      else o.k = clamp(+(g.s0 * f).toFixed(3), 0.2, 5);
      g.moved = true; W.apply(); return;
    }
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 3) return;
    g.moved = true;
    if (g.k === "#seal") { const r = sealRect(); D.seal.x = clamp(+(g.sx + (dx / r.width) * 100).toFixed(1), 0, 100); D.seal.y = clamp(+(g.sy + (dy / r.height) * 100).toFixed(1), 0, 100); }
    else { const o = D.o[g.k]; o.x = Math.round(g.ox + dx); o.y = Math.round(g.oy + dy); }
    W.apply();
  }, true);
  const end = (e) => {
    if (!g) return;
    const m = g.mode, moved = g.moved, k = g.k; g = null;
    if (m === "tap" && e.type === "pointerup") select(k);
    else if (moved) { commit(); render(); }
  };
  document.addEventListener("pointerup", end, true);
  document.addEventListener("pointercancel", end, true);
  document.addEventListener("click", (e) => { if (e.target.closest("a,button,form") && !e.target.closest("#wdp,#wdt")) e.preventDefault(); }, true);
  document.addEventListener("submit", (e) => e.preventDefault(), true);

  // nudge with buttons or arrow keys
  const nudge = (dx, dy) => {
    if (!sel) return;
    if (sel === "#seal") { D.seal.x = clamp(+((D.seal.x ?? 50) + dx * 0.3).toFixed(1), 0, 100); D.seal.y = clamp(+((D.seal.y ?? 50) + dy * 0.3).toFixed(1), 0, 100); }
    else { const o = (D.o[sel] ??= {}); o.x = (o.x || 0) + dx; o.y = (o.y || 0) + dy; }
    commit();
  };
  document.addEventListener("keydown", (e) => {
    if (!sel || e.target.closest("input,textarea,select,[contenteditable]")) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
    e.preventDefault(); const s = e.shiftKey ? 10 : 1; nudge(d[0] * s, d[1] * s);
  });

  function view(v) {
    const c = $("#cover"), env = $("#envelope");
    if (v === "cover" || v === "back") { c.classList.remove("opening", "gone", "turned"); env.classList.remove("open", "zoom", "peeled", "turned"); $("#main").hidden = true; document.body.classList.add("locked"); document.body.classList.remove("revealed"); scrollTo(0, 0); if (v === "back") W.turn(); }
    else { c.classList.add("gone"); $("#main").hidden = false; document.body.classList.remove("locked"); document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in")); }
    cur = v; sel = null; mark(); render();
    if (v !== "cover" && v !== "main") setTimeout(() => document.querySelector(`.pg[data-pg="${v}"]`)?.scrollIntoView(), 50);
  }

  // ---------- Details (names, date, venue ...) ----------
  const cf = (label, path, type = "text", o = {}) => fld(label, type, ["cfg", ...path], path.reduce((a, k) => a?.[k], C0) ?? "", o);
  const toLocal = (iso) => String(iso || "").slice(0, 16);
  const schedText = () => (W.getC().schedule || []).map((s) => [s.time, s.km, s.en].join(" | ")).join("\n");

  const tabs = [["text", "Items"], ["det", "Details"], ["pages", "Pages"], ["seal", "Seal"], ["env", "Envelope"], ["col", "Colours"], ["bf", "Butterflies"], ["snd", "Sound"], ["save", "Save"]];
  function render() {
    const p = $("#wdp"), y = p.scrollTop; p.innerHTML = "";
    p.append(h("div", { className: "row" }, btn("Front", () => view("cover"), cur !== "cover"), btn("Back + seal", () => view("back"), cur !== "back"), btn("Inside", () => view("main"), cur !== "main"), btn("▶ Test", () => { view("cover"); setTimeout(() => { W.turn(); setTimeout(W.open, 1000); }, 60); }, true)));
    p.append(h("div", { className: "row" }, ...tabs.map(([k, t]) => btn(t, () => { tab = k; if (k === "seal" && cur !== "back") view("back"); else render(); }, tab !== k))));
    const B = {
      text() {
        const k = sel, kind = k && kindOf(k), o = k && (D.o[k] ??= {}), free = k && D.add.some((a) => a.id === k);
        const out = [btn("+ Add text", () => addItem({}, { t: "New text" })), btn("+ Add image", () => pick(900, (d) => addItem({ k: "img", src: d }, { w: 180 })))];
        out.push(btn("👤 Guest name (front)", () => { view("cover"); select("#frontTo"); }, true), btn("👤 Guest name (back)", () => { view("back"); select("#coverTo"); }, true));
        if (!k) return [...out, h("p", {}, "Tap any text or block to select it. Drag it to move. Drag a gold corner dot to resize. On a phone: tap once to select, then drag. Change names, date and venue in the Details tab.")];
        const move = h("div", { className: "pad" }, h("span"), btn("▲", () => nudge(0, -5), true), h("span"), btn("◀", () => nudge(-5, 0), true), btn("●", () => { if (k === "#seal") { D.seal.x = 50; D.seal.y = 50; } else { o.x = 0; o.y = 0; } commit(); }, true), btn("▶", () => nudge(5, 0), true), h("span"), btn("▼", () => nudge(0, 5), true), h("span"));
        if (kind === "seal") return [...out, h("p", {}, "Seal: drag to move, drag a corner dot to resize. More options in the Seal tab."), move, fld("Size", "range", "seal.size", 76, { min: 30, max: 300 })];
        if (kind === "img") return [...out, move, fld("Width (px)", "range", ["o", k, "w"], 180, { min: 30, max: 900 }), fld("Roundness (50 = circle)", "range", ["o", k, "r"], 0, { min: 0, max: 50 }),
          h("div", { className: "row" }, btn("Replace picture", () => pick(900, (d) => { D.add.find((a) => a.id === k).src = d; commit(); })), btn(o.h ? "Show" : "Hide", () => { o.h = !o.h; commit(); render(); }, true), btn("Delete", () => { D.add = D.add.filter((a) => a.id !== k); delete D.o[k]; sel = null; commit(); render(); }, true))];
        const el = selEl(), editable = el && (!el.children.length || k === ".cover-hint");
        const dyn = k === "#frontTo" || k === "#coverTo", W0 = $("#envelope").offsetWidth || 300;
        out.push(move);
        if (dyn) out.push(h("p", {}, "Guest name: each guest's own name fills in here automatically. Drag it, or use the buttons:"),
          h("div", { className: "row" }, ...[["Top", 0, -0.3], ["Middle", 0, 0], ["Bottom", 0, 0.3], ["Left", -0.16, null], ["Centre", 0, null], ["Right", 0.16, null]].map(([t, dx, dy]) => btn(t, () => { if (dy !== null) o.y = Math.round(dy * W0); else o.x = Math.round(dx * W0); commit(); }, true))));
        if (editable && !dyn) out.push(fld("Text (or change it in Details)", "area", ["o", k, "t"], el.textContent));
        out.push(fld("Size (drag a corner, or slide)", "range", ["o", k, "k"], 1, { min: 0.2, max: 4, step: 0.05 }));
        if (dyn) out.push(fld("Name size (px)", "range", ["o", k, "s"], parseFloat(el && getComputedStyle(el).fontSize) || 18, { min: 10, max: 90 }));
        else if (editable) out.push(fld("Text size (px)", "number", ["o", k, "s"], parseFloat(el && getComputedStyle(el).fontSize) || 20, { min: 8, max: 120 }));
        out.push(fld("Colour", "color", ["o", k, "c"], "#f0d890"));
        out.push(fld("Font", "select", ["o", k, "f"], "", { opt: [["", "Default"], ["km", "Khmer body"], ["moul", "Khmer Moul"], ["latin", "English script"]] }));
        out.push(h("div", { className: "row" }, btn(o.h ? "Show" : "Hide (remove)", () => { o.h = !o.h; commit(); render(); }), btn("Reset", () => { delete D.o[k]; commit(); render(); }, true),
          ...(free ? [btn("Delete", () => { D.add = D.add.filter((a) => a.id !== k); delete D.o[k]; sel = null; commit(); render(); }, true)] : [])));
        return out;
      },
      det() {
        const sc = h("textarea", { rows: 6, value: schedText() });
        sc.oninput = () => { D.cfg.schedule = sc.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [time = "", km = "", en = ""] = l.split("|").map((s) => s.trim()); return { time, km, en }; }); commit(); };
        const dt = h("input", { type: "datetime-local", value: toLocal(D.cfg.date ?? C0.date) });
        dt.oninput = () => { if (dt.value) { D.cfg.date = dt.value + ":00+07:00"; commit(); } };
        return [h("p", {}, "These override config.js. Change them here, then Save draft."),
          h("p", {}, "Groom"), cf("Name (Khmer)", ["groom", "km"]), cf("Name (English)", ["groom", "en"]),
          h("p", {}, "Bride"), cf("Name (Khmer)", ["bride", "km"]), cf("Name (English)", ["bride", "en"]),
          h("hr"), h("label", {}, "Wedding date & time (Cambodia time)", dt), cf("Date text (Khmer)", ["dateTextKm"]), cf("Date text (English)", ["dateTextEn"]),
          h("hr"), cf("Venue (Khmer)", ["venueKm"]), cf("Venue (English)", ["venueEn"]), cf("Map link", ["mapUrl"]),
          h("hr"), h("label", {}, "Programme: one per line  →  time | Khmer | English", sc),
          h("hr"), btn("⬆ Add gallery photo", () => pick(900, (d) => { D.cfg.photos = [...(D.cfg.photos ?? W.getC().photos ?? []), d]; commit(); render(); })),
          btn("Clear gallery photos", () => { D.cfg.photos = []; commit(); render(); }, true), h("p", {}, (W.getC().photos || []).length + " photo(s) in the gallery"),
          h("hr"), btn("⬆ Gift QR picture", () => pick(500, (d) => { D.cfg.khqrImage = d; commit(); render(); }, false, true)), btn("Remove QR", () => { D.cfg.khqrImage = ""; commit(); render(); }, true), cf("Gift note", ["khqrNote"]),
          btn("Reset all details to config.js", () => { if (confirm("Go back to the names/date/venue in config.js?")) { D.cfg = {}; commit(); render(); } }, true)];
      },
      pages() {
        const out = [btn("+ Add page", () => { const id = "p" + Date.now().toString(36); D.pages.push({ id, h: 700, bg: "#1f5a5d" }); commit(); view(id); say("Page added ✓"); }), h("p", {}, "Extra pages appear below the footer, in order. Use + Add text / + Add image on the Items tab while a page is open.")];
        D.pages.forEach((p, i) => out.push(h("p", {}, "Page " + (i + 2)), fld("Background colour", "color", ["pages", i, "bg"], "#1f5a5d"), fld("Height (px)", "range", ["pages", i, "h"], 700, { min: 300, max: 1600, step: 50 }),
          h("div", { className: "row" }, btn("Open", () => view(p.id), true), btn("Background picture", () => pick(1000, (d) => { p.img = d; commit(); })), btn("Remove picture", () => { delete p.img; commit(); }, true),
            btn("Delete page", () => { if (!confirm("Delete this page and everything on it?")) return; D.pages.splice(i, 1); D.add = D.add.filter((a) => a.pg !== p.id); commit(); view("main"); }, true))));
        return out;
      },
      seal: () => [btn("⬆ Upload seal image", () => pick(400, (d) => { D.seal.img = d; D.seal.icon = "image"; commit(); render(); }, false, true)), fld("Keep the round seal behind my picture", "checkbox", "seal.bg", false), h("p", {}, "Use a PNG with a see-through background: only your picture shows, with nothing around it. You can also drag the seal on the page and resize it with a corner dot."),
        fld("Shape", "select", "seal.shape", "circle", { opt: [["circle", "Circle"], ["rounded", "Rounded square"], ["square", "Square"], ["diamond", "Diamond"]] }),
        fld("Picture on seal", "select", "seal.icon", "lotus", { opt: [["lotus", "Lotus"], ["heart", "Heart"], ["text", "Letters / emoji"], ["image", "My image"], ["none", "Empty"]] }),
        fld("Letters / emoji", "text", "seal.text", "", { maxLength: 6 }),
        fld("Colour", "color", "seal.color", "#b3245f"), fld("Size", "range", "seal.size", 76, { min: 30, max: 300 }),
        fld("Left–right position", "range", "seal.x", 50, { min: 0, max: 100 }), fld("Up–down position", "range", "seal.y", 50, { min: 0, max: 100 }),
      ],
      env: () => [fld("Pattern on the flaps", "select", "env.pat", "", { opt: [["", "Plain"], ["dots", "Dots"], ["lines", "Lines"], ["diamonds", "Diamonds"], ["fit", "My photo (fits the envelope)"], ["img", "Small picture (tiled)"]] }), btn("⬆ Front photo (auto-fit)", () => pick(900, (d) => { D.env.img = d; D.env.pat = "fit"; commit(); render(); }, true)), btn("⬆ Back photo (flaps, auto-fit)", () => pick(900, (d) => { D.env.back = d; D.env.pat = "fit"; commit(); render(); }, true)), btn("Back = same as front", () => { delete D.env.back; commit(); }, true), btn("⬆ Tiled pattern picture", () => pick(200, (d) => { D.env.img = d; D.env.pat = "img"; commit(); render(); })), fld("Envelope size (px)", "range", "env.w", 340, { min: 200, max: 520 }), fld("Envelope body", "color", "env.body", "#0c2f30"), fld("Flaps", "color", "env.flap", "#236f6b"), fld("Edge line", "color", "env.line", "#d9b35f"), fld("Card paper (inside the envelope)", "color", "th.pearl", "#f3ece0")],
      col: () => [fld("Background dark", "color", "th.ink", "#0b2527"), fld("Background light", "color", "th.deep", "#103638"), fld("Gold (titles)", "color", "th.gold", "#d9b35f"), fld("Gold light (text)", "color", "th.gold-2", "#f0d890"), fld("Accent", "color", "th.silk", "#b3245f"), fld("Paper / main text", "color", "th.pearl", "#f3ece0")],
      bf: () => [fld("Show golden butterflies", "checkbox", "bf.on", true), fld("How many", "range", "bf.n", 14, { min: 0, max: 40 }), fld("Size", "range", "bf.size", 11, { min: 4, max: 30 }), fld("Speed", "range", "bf.speed", 1, { min: 0.2, max: 3, step: 0.1 }), fld("Colour", "color", "bf.color", "#f0d890")],
      snd: () => {
        const play = (src) => { if (!src) return; const a = new Audio(src); a.volume = D.snd.vol; a.play().catch(() => alert("Could not play that file.")); setTimeout(() => a.pause(), 6000); };
        return [fld("Background music (file name or link)", "text", "snd.music", ""), fld("Sound when the seal is tapped", "text", "snd.open", ""), fld("Volume", "range", "snd.vol", 0.7, { min: 0, max: 1, step: 0.05 }),
          h("div", { className: "row" }, btn("Test music", () => play(D.snd.music), true), btn("Test seal sound", () => play(D.snd.open), true)),
          h("p", {}, "Put your .mp3 files in public/wedding/ and type the file name (e.g. music.mp3, pop.mp3). Phones only play sound after a tap, which the seal tap provides.")];
      },
      save: () => {
        const C = W.getC(), inv = W.inv, isSent = inv?.status === "sent";
        const ti = h("input", { placeholder: "Title (e.g. Sokha & Dara)", value: W.title ?? inv?.title ?? "", oninput: () => { W.title = ti.value; } });
        const em = h("input", { type: "email", placeholder: "customer@email.com", value: W.email || "", oninput: () => { W.email = em.value; } });
        const ready = () => { if (window.supabase && C0.supabaseUrl && !C0.supabaseUrl.startsWith("YOUR")) return (W.sb ??= window.supabase.createClient(C0.supabaseUrl, C0.supabaseKey)); say("Set supabaseUrl / supabaseKey in public/wedding/config.js first"); return null; };
        const cfgOut = () => { const c = JSON.parse(JSON.stringify(W.getC())); delete c.supabaseUrl; delete c.supabaseKey; return c; };
        const COLS = "id,title,status,owner_id";
        const saveDraft = async (asNew) => {
          const sb = ready(); if (!sb) return false;
          const { data: au } = await sb.auth.getUser(); if (!au?.user) { say("Log in as admin in this browser first"); return false; }
          const row = { title: ti.value.trim() || `${C.groom.en} & ${C.bride.en}`, design: D, config: cfgOut() };
          const r = inv?.id && !asNew
            ? await sb.from("wedding_invites").update({ ...row, updated_at: new Date().toISOString() }).eq("id", inv.id).select(COLS).single()
            : await sb.from("wedding_invites").insert({ ...row, owner_id: au.user.id, status: "draft" }).select(COLS).single();
          if (r.error) { say(r.error.code === "PGRST116" ? "Not saved: log in as admin in this browser" : r.error.message); return false; }
          W.inv = r.data; W.title = r.data.title;
          const k = "wd_draft_" + r.data.id; try { localStorage.setItem(k, JSON.stringify(D)); } catch {} W.DK = k;
          const u = new URL(location.href); u.searchParams.set("i", r.data.id); history.replaceState(null, "", u);
          return true;
        };
        const sendIt = async () => {
          const sb = ready(); if (!sb) return; if (!inv?.id) return say("Save the draft first");
          const email = em.value.trim(); if (!email) return say("Type the customer's email");
          const { data: u, error: e1 } = await sb.from("profiles").select("user_id").ilike("email", email.replace(/[\\%_]/g, "\\$&")).limit(1);
          if (e1 || !u?.length) return say(e1 ? e1.message : "No customer with that email");
          if (!confirm(`Send this invitation to ${email}? It will appear on their Services page.`)) return;
          if (!(await saveDraft(false))) return;
          const { error } = await sb.from("wedding_invites").update({ owner_id: u[0].user_id, status: "sent", sent_at: new Date().toISOString() }).eq("id", W.inv.id);
          if (error) return say(error.message);
          W.inv = { ...W.inv, status: "sent", owner_id: u[0].user_id }; say("Sent to customer ✓"); render();
        };
        const base = location.origin + location.pathname;
        return [
          h("p", {}, inv?.id ? (isSent ? "Status: SENT to the customer. Saving updates what they see." : "Status: DRAFT. Only you can see it, the customer cannot yet.") : "Not saved yet. Save a draft first, preview it, then send it."),
          h("label", {}, "Title", ti),
          h("div", { className: "row" }, btn(inv?.id ? (isSent ? "💾 Save changes" : "💾 Save draft") : "💾 Save draft", async () => { if (await saveDraft(false)) { say("Saved ✓"); render(); } }),
            ...(inv?.id ? [btn("＋ Save as new copy", async () => { if (await saveDraft(true)) { say("Saved as new draft ✓"); render(); } }, true)] : [])),
          ...(inv?.id ? [h("div", { className: "row" }, btn("👁 Preview (as the customer sees it)", () => window.open(`${base}?i=${inv.id}`, "_blank")), btn("Copy preview link", () => navigator.clipboard.writeText(`${base}?i=${inv.id}`).then(() => say("Link copied")), true)),
            h("p", {}, "Preview shows the SAVED version. Save again after more edits, then refresh the preview.")] : []),
          h("hr"),
          h("p", {}, isSent ? "Already sent. To send it to a different customer, type their email:" : "When the preview looks right, send it. It appears on the customer's Services page, where they add their guests."),
          h("label", {}, "Customer email", em), btn("📨 Send to customer", sendIt, !inv?.id), h("hr"),
          btn("⬇ Download design.js", () => { const a = h("a", { href: URL.createObjectURL(new Blob(["window.DESIGN = " + JSON.stringify(D, null, 2) + ";\n"], { type: "text/javascript" })), download: "design.js" }); document.body.append(a); a.click(); a.remove(); }, true),
          btn("Reset everything", () => { if (confirm("Throw away all your unsaved edits?")) { localStorage.removeItem(W.DK); location.reload(); } }, true),
          h("p", {}, "Unsaved edits are kept in this browser while you work. Save draft stores them in the database."),
        ];
      },
    };
    const r = B[tab](); p.append(...(Array.isArray(r) ? r : [r])); p.scrollTop = y;
  }
  W.view = view;
  const qi = new URLSearchParams(location.search).get("i");
  if (qi && window.supabase && C0.supabaseUrl && !C0.supabaseUrl.startsWith("YOUR")) {
    (W.sb ??= window.supabase.createClient(C0.supabaseUrl, C0.supabaseKey)).from("wedding_invites").select("id,title,status,owner_id").eq("id", qi).maybeSingle().then((r) => { if (r.data) { W.inv = r.data; render(); } });
  }
  mark(); render();
})();
