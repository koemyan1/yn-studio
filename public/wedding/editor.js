// Visual editor: open /wedding/?edit=1. Tap any text to select it, drag to move. Nothing is public until you save design.js.
(() => {
  const W = window.WD, D = W.D, $ = (s) => document.querySelector(s);
  const h = (t, a = {}, ...k) => { const e = Object.assign(document.createElement(t), a); e.append(...k); return e; };
  const P = (p) => (Array.isArray(p) ? p : p.split("."));
  const get = (p) => P(p).reduce((o, k) => o?.[k], D);
  const put = (p, v) => { const a = P(p), l = a.pop(); a.reduce((o, k) => (o[k] ??= {}), D)[l] = v; };
  let sel = null, tab = "text", cur = "cover";

  document.head.append(h("style", { textContent: `
  body.editing [data-e]{cursor:grab;touch-action:none;user-select:none;outline:1px dashed rgba(240,216,144,.4);outline-offset:3px}
  body.editing [data-e].sel{outline:2px solid #f0d890}
  body.editing{padding-bottom:50vh}
  #wdt{position:fixed;z-index:60;right:8px;top:8px;width:40px;height:40px;border-radius:50%;border:2px solid #d9b35f;background:#0a1d1e;color:#f0d890;font-size:18px;cursor:pointer}
  #wdp{position:fixed;z-index:50;left:0;right:0;bottom:0;max-height:46vh;overflow:auto;background:#0a1d1e;color:#f3ece0;font:14px/1.4 system-ui,sans-serif;border-top:2px solid #d9b35f;padding:8px 10px}
  #wdp label{display:grid;gap:2px;margin:6px 0;font-size:12px;color:#a9c4bf} #wdp input,#wdp select,#wdp textarea{font:inherit;color:#fff;background:#173a3c;border:1px solid #3a6;border-radius:6px;padding:6px;width:100%}
  #wdp input[type=color]{height:34px;padding:2px} #wdp input[type=checkbox]{width:auto} #wdp button{font:inherit;background:#d9b35f;color:#0b2527;border:0;border-radius:6px;padding:7px 10px;margin:3px 3px 3px 0;cursor:pointer}
  #wdp button.g{background:#173a3c;color:#f3ece0;border:1px solid #3a6} #wdp .row{display:flex;flex-wrap:wrap;gap:2px} #wdp p{margin:6px 0;color:#a9c4bf;font-size:12px}
  @media(min-width:900px){#wdt{right:340px}#wdp{left:auto;top:0;width:330px;max-height:none;border-top:0;border-left:2px solid #d9b35f}body.editing{padding-bottom:0;margin-right:330px}}` }));
  document.body.append(h("div", { id: "wdp" }));
  document.body.append(h("button", { id: "wdt", textContent: "▾", title: "Hide / show editor", onclick: () => { const p = $("#wdp"), s = p.style.display === "none"; p.style.display = s ? "" : "none"; $("#wdt").textContent = s ? "▾" : "✎"; } }));

  const commit = () => { localStorage.setItem("wd_draft", JSON.stringify(D)); W.apply(); };
  const btn = (t, f, g) => h("button", { textContent: t, onclick: f, className: g ? "g" : "" });
  const fld = (label, type, path, def, o = {}) => {
    let i;
    if (type === "select") { i = h("select"); o.opt.forEach(([v, t]) => i.append(h("option", { value: v, textContent: t }))); i.value = get(path) ?? def; }
    else if (type === "area") { i = h("textarea", { rows: 3 }); i.value = get(path) ?? def ?? ""; }
    else { i = h("input", { type, ...o }); if (type === "checkbox") i.checked = !!(get(path) ?? def); else i.value = get(path) ?? def ?? ""; }
    i.oninput = () => { put(path, type === "checkbox" ? i.checked : type === "range" || type === "number" ? +i.value : i.value); commit(); };
    return h("label", {}, label, i);
  };

  function view(v) {
    const c = $("#cover"), env = $("#envelope");
    if (v === "cover") { c.classList.remove("opening", "gone"); env.classList.remove("open", "zoom"); $("#main").hidden = true; document.body.classList.add("locked"); document.body.classList.remove("revealed"); scrollTo(0, 0); }
    else { c.classList.add("gone"); $("#main").hidden = false; document.body.classList.remove("locked"); document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in")); }
    cur = v; sel = null; mark(); render();
  }
  const mark = () => document.querySelectorAll("[data-e]").forEach((e) => e.classList.toggle("sel", e.dataset.e === sel));

  // drag to move, tap to select
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    const t = e.target.closest("[data-e]"); if (!t || e.target.closest("#wdp")) return;
    e.preventDefault(); sel = t.dataset.e; const o = (D.o[sel] ??= {});
    drag = { x: e.clientX, y: e.clientY, ox: o.x || 0, oy: o.y || 0, moved: false }; mark(); render();
  });
  document.addEventListener("pointermove", (e) => { if (!drag) return; const o = D.o[sel]; o.x = Math.round(drag.ox + e.clientX - drag.x); o.y = Math.round(drag.oy + e.clientY - drag.y); drag.moved = true; W.apply(); });
  document.addEventListener("pointerup", () => { if (drag?.moved) commit(); drag = null; });
  document.addEventListener("click", (e) => { if (e.target.closest("a,button,form") && !e.target.closest("#wdp")) e.preventDefault(); }, true);
  document.addEventListener("submit", (e) => e.preventDefault(), true);

  const tabs = [["text", "Text"], ["seal", "Seal"], ["env", "Envelope"], ["col", "Colours"], ["bf", "Butterflies"], ["snd", "Sound"], ["save", "Save"]];
  function render() {
    const p = $("#wdp"), y = p.scrollTop; p.innerHTML = "";
    p.append(h("div", { className: "row" }, btn("Cover", () => view("cover"), cur !== "cover"), btn("Inside", () => view("main"), cur !== "main"), btn("▶ Test opening", () => { view("cover"); setTimeout(W.open, 60); }, true)));
    p.append(h("div", { className: "row" }, ...tabs.map(([k, t]) => btn(t, () => { tab = k; render(); }, tab !== k))));
    const B = {
      text() {
        const k = sel, o = k && (D.o[k] ??= {}), free = k && D.add.some((a) => a.id === k);
        const out = [btn("+ Add text", () => { const id = "t" + Date.now().toString(36); D.add.push({ id, pg: cur }); D.o[id] = { t: "New text", y: cur === "cover" ? 140 : Math.round(scrollY + 160) }; sel = id; commit(); mark(); render(); })];
        if (!k) return [...out, h("p", {}, "Tap any text or block on the page to select it. Drag to move it. Tap + Add text for new text on the current view (Cover / Inside).")];
        const el = document.querySelector(`[data-e="${CSS.escape(k)}"]`), editable = el && (!el.children.length || k === ".cover-hint");
        if (editable) out.push(fld("Text", "area", ["o", k, "t"], el.textContent));
        out.push(fld("Size (px)", "number", ["o", k, "s"], parseFloat(el && getComputedStyle(el).fontSize) || 20, { min: 8, max: 120 }));
        out.push(fld("Colour", "color", ["o", k, "c"], "#f0d890"));
        out.push(fld("Font", "select", ["o", k, "f"], "", { opt: [["", "Default"], ["km", "Khmer body"], ["moul", "Khmer Moul"], ["latin", "English script"]] }));
        out.push(h("div", { className: "row" }, btn(o.h ? "Show" : "Hide (remove)", () => { o.h = !o.h; commit(); render(); }), btn("Reset", () => { delete D.o[k]; commit(); render(); }, true),
          ...(free ? [btn("Delete", () => { D.add = D.add.filter((a) => a.id !== k); delete D.o[k]; sel = null; commit(); render(); }, true)] : [])));
        return out;
      },
      seal: () => [
        fld("Shape", "select", "seal.shape", "circle", { opt: [["circle", "Circle"], ["rounded", "Rounded square"], ["square", "Square"], ["diamond", "Diamond"]] }),
        fld("Picture on seal", "select", "seal.icon", "lotus", { opt: [["lotus", "Lotus"], ["heart", "Heart"], ["text", "Letters / emoji"], ["image", "My image"], ["none", "Empty"]] }),
        fld("Letters / emoji", "text", "seal.text", "", { maxLength: 6 }), fld("Image link (e.g. images/seal.png)", "text", "seal.img", ""),
        fld("Colour", "color", "seal.color", "#b3245f"), fld("Size", "range", "seal.size", 76, { min: 40, max: 150 }),
        fld("Left–right position", "range", "seal.x", 50, { min: 0, max: 100 }), fld("Up–down position", "range", "seal.y", 50, { min: 0, max: 100 }),
        h("p", {}, "Tap “Cover” above to see the seal. Re-select the picture after typing letters or a link."),
      ],
      env: () => [fld("Envelope body", "color", "env.body", "#0c2f30"), fld("Flaps", "color", "env.flap", "#236f6b"), fld("Edge line", "color", "env.line", "#d9b35f"), fld("Card paper (inside the envelope)", "color", "th.pearl", "#f3ece0")],
      col: () => [fld("Background dark", "color", "th.ink", "#0b2527"), fld("Background light", "color", "th.deep", "#103638"), fld("Gold (titles)", "color", "th.gold", "#d9b35f"), fld("Gold light (text)", "color", "th.gold-2", "#f0d890"), fld("Accent", "color", "th.silk", "#b3245f"), fld("Paper / main text", "color", "th.pearl", "#f3ece0")],
      bf: () => [fld("Show golden butterflies", "checkbox", "bf.on", true), fld("How many", "range", "bf.n", 14, { min: 0, max: 40 }), fld("Size", "range", "bf.size", 20, { min: 8, max: 50 }), fld("Speed", "range", "bf.speed", 1, { min: 0.2, max: 3, step: 0.1 }), fld("Colour", "color", "bf.color", "#f0d890")],
      snd: () => {
        const play = (src) => { if (!src) return; const a = new Audio(src); a.volume = D.snd.vol; a.play().catch(() => alert("Could not play that file.")); setTimeout(() => a.pause(), 6000); };
        return [fld("Background music (file name or link)", "text", "snd.music", ""), fld("Sound when the seal is tapped", "text", "snd.open", ""), fld("Volume", "range", "snd.vol", 0.7, { min: 0, max: 1, step: 0.05 }),
          h("div", { className: "row" }, btn("Test music", () => play(D.snd.music), true), btn("Test seal sound", () => play(D.snd.open), true)),
          h("p", {}, "Put your .mp3 files in public/wedding/ and type the file name (e.g. music.mp3, pop.mp3). Phones only play sound after a tap, which the seal tap provides.")];
      },
      save: () => [
        btn("⬇ Download design.js", () => { const a = h("a", { href: URL.createObjectURL(new Blob(["window.DESIGN = " + JSON.stringify(D, null, 2) + ";\n"], { type: "text/javascript" })), download: "design.js" }); document.body.append(a); a.click(); a.remove(); }),
        btn("Reset everything", () => { if (confirm("Throw away all your edits?")) { localStorage.removeItem("wd_draft"); location.href = "?edit=1"; } }, true),
        h("p", {}, "Your edits are kept in this browser while you work. To publish: download design.js, replace public/wedding/design.js with it, push to GitHub. Pictures and music go in public/wedding/."),
      ],
    };
    const r = B[tab](); p.append(...(Array.isArray(r) ? r : [r])); p.scrollTop = y;
  }
  W.view = view; render();
})();
