// "Braya" invitation theme: renders window.BRAYA_DEFAULT (or a saved invitation) and, with ?edit=1, an admin editor for every part.
(async () => {
  const C0 = window.CONFIG || {}, q = new URLSearchParams(location.search), EMBED = q.has("embed"), EDIT = q.has("edit") || EMBED, INV = q.get("i"), GID = q.get("g");
  const app = document.getElementById("app");
  const h = (t, a = {}, ...k) => { const e = Object.assign(document.createElement(t), a); e.append(...k.filter((x) => x != null && x !== false)); return e; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") merge(a[k], b[k]); else a[k] = b[k]; } return a; };
  const P = (p) => p.split("."), get = (p) => P(p).reduce((o, k) => o?.[k], D);
  const put = (p, v) => { const a = P(p), l = a.pop(); a.reduce((o, k) => (o[k] ??= {}), D)[l] = v; };
  const KD = "០១២៣៤៥៦៧៨៩", kd = (s) => String(s).replace(/\d/g, (d) => KD[d]);
  // Any YouTube link (watch?v=, youtu.be/, shorts/, live/, embed/) -> the /embed/ address YouTube allows inside a page. Returns {embed, watch} or null.
  const yt = (raw) => {
    try {
      const u = new URL(String(raw || "").trim().replace(/^(?!https?:)\/\//, "https://").replace(/^(?!https?:)(?=(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com))/, "https://"));
      const host = u.hostname.replace(/^(www\.|m\.)/, ""); let id = "";
      if (host === "youtu.be") id = u.pathname.split("/")[1] || "";
      else if (host === "youtube.com" || host === "youtube-nocookie.com") { const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/); id = m ? m[1] : u.searchParams.get("v") || ""; }
      else return null;
      if (!/^[\w-]{11}$/.test(id)) return null;
      let start = u.searchParams.get("start") || u.searchParams.get("t") || ""; const tm = start.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      start = tm ? (+(tm[1] || 0) * 3600 + +(tm[2] || 0) * 60 + +(tm[3] || 0)) : 0;
      return { embed: `https://www.youtube.com/embed/${id}?rel=0&playsinline=1${start ? "&start=" + start : ""}`, watch: `https://www.youtube.com/watch?v=${id}` };
    } catch { return null; }
  };
  const KM = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
  const EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const hasSb = !!(window.supabase && C0.supabaseUrl && !String(C0.supabaseUrl).startsWith("YOUR"));
  const sb = hasSb ? window.supabase.createClient(C0.supabaseUrl, C0.supabaseKey) : null;
  const DK = "braya-draft" + (INV ? "-" + INV : "");

  let D = clone(window.BRAYA_DEFAULT), GUEST = "", invId = INV || null;
  if (INV) {
    if (!sb) return msg("This invitation needs Supabase. Set supabaseUrl and supabaseKey in /wedding/config.js.");
    try {
      const { data, error } = await sb.rpc("wedding_open", { p_invite: INV, p_guest: GID || null });
      if (error) return msg("This invitation could not be opened. " + error.message);
      if (!data) return msg("Invitation not found.");
      if (data.config?.braya) merge(D, data.config.braya);
      GUEST = data.guest || "";
    } catch (e) { return msg("This invitation could not be opened. " + (e?.message || e)); }
  }
  if (EDIT) { try { const s = localStorage.getItem(DK); if (s) D = merge(clone(window.BRAYA_DEFAULT), JSON.parse(s)); } catch {} }
  if (!GUEST && q.get("to")) GUEST = q.get("to").slice(0, 60);

  // Invitations saved before the gold update still hold the old brown / grey text colours: swap them for the new gold ones.
  const OLDC = { text: "#3d3a2e", muted: "#6f6a58", card: "rgba(255,255,255,0.55)" };
  function fixOld(d) { const c = d.colors || (d.colors = {}), n = window.BRAYA_DEFAULT.colors || {}; for (const k in OLDC) if (c[k] === OLDC[k]) c[k] = n[k]; return d; }
  fixOld(D);

  function msg(t) { document.body.classList.remove("locked"); app.replaceChildren(h("p", { className: "msg", textContent: t })); }

  // ---------- RENDER ----------
  const audio = new Audio(); audio.loop = true; audio.preload = "none";
  let timer = 0, opened = EDIT;

  function parts(iso) { const t = new Date(iso); if (isNaN(t)) return null; const z = new Date(t.getTime() + 7 * 36e5); return { t, y: z.getUTCFullYear(), m: z.getUTCMonth(), d: z.getUTCDate() }; }

  function render() {
    const c = D.colors || {}, r = document.documentElement.style;
    for (const k of ["accent", "text", "muted", "card", "gold", "goldLight"]) if (c[k]) r.setProperty("--" + k, c[k]);
    const FONTS = { pali: '"Khmer OS Muol Pali","Moulpali","Moul",serif', light: '"Khmer OS Muol Light","Moul",serif', body: '"Kantumruy Pro",system-ui,sans-serif' };
    r.setProperty("--moul", FONTS[(D.fonts || {}).heading] || FONTS.pali);
    clearInterval(timer);
    const S = D.show || {};
    const head = (o) => [h("p", { className: "h-km reveal", textContent: o.km }), h("h2", { className: "h-en reveal", textContent: o.en })];

    // One fixed background (cover picture + moving-branches video) shared by the cover AND the inside of the invitation.
    // It never scrolls: the cover fades away on top of it and the page content scrolls over it.
    const vid = D.cover.video ? h("video", { src: D.cover.video, muted: true, autoplay: true, loop: true, playsInline: true, defaultMuted: true }) : null;
    if (vid) vid.setAttribute("muted", "");
    const fixedBg = h("div", { className: "fixed-bg", ariaHidden: "true", style: `background-image:url("${D.cover.bgImage}")` }, vid);
    const cover = h("section", { className: "cover" + (opened ? " gone" : ""), id: "cover" },
      h("div", { className: "cover-in" }, h("div", { className: "shade" }),
        D.cover.namesImage ? h("img", { className: "cover-names-img", src: D.cover.namesImage, alt: D.cover.names || "" }) : h("p", { className: "cover-names", textContent: D.cover.names }),
        h("p", { className: "cover-label", textContent: D.cover.guestLabel }),
        h("div", { className: "vine", ariaHidden: "true" }),
        h("p", { className: "cover-guest", textContent: GUEST || D.cover.guestDefault }),
        h("div", { className: "vine", ariaHidden: "true" }),
        h("button", { className: "open-btn", type: "button", onclick: openInvite, ariaLabel: D.cover.btnEn }, h("b", { textContent: D.cover.btnKm }), h("small", { textContent: D.cover.btnEn }))));

    const p = parts(D.date), sec = [];
    sec.push(h("section", { className: "sec" },
      h("h1", { className: "title reveal", textContent: D.intro.title }),
      h("p", { className: "line reveal", textContent: D.intro.line }),
      h("p", { className: "para reveal", textContent: D.intro.text }),
      S.couple !== false && h("div", { className: "couple reveal" }, person(D.groom), h("span", { className: "and", textContent: D.andText }), person(D.bride)),
      h("p", { className: "date reveal", textContent: D.dateKm }),
      h("p", { className: "date reveal", textContent: D.lunarKm }),
      h("div", { className: "chev", ariaHidden: "true" })));

    if (S.calendar !== false && p) {
      const first = new Date(Date.UTC(p.y, p.m, 1)).getUTCDay(), days = new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate();
      const g = h("div", { className: "grid7", role: "grid" }, ...["អា", "ច", "អ", "ព", "ព្រ", "សុ", "ស"].map((n) => h("span", { className: "dn", textContent: n })));
      for (let i = 0; i < first; i++) g.append(h("span"));
      for (let d = 1; d <= days; d++) g.append(h("span", { className: d === p.d ? "hit" : "", textContent: kd(d), ariaCurrent: d === p.d ? "date" : null }));
      sec.push(h("section", { className: "sec" }, ...head(D.calendar), h("div", { className: "card reveal" }, h("p", { className: "cal-m", textContent: `ខែ${KM[p.m]} ${kd(p.y)}` }), h("p", { className: "cal-e", textContent: `${EN[p.m]} ${p.y}` }), g)));
    }
    if (S.countdown !== false && p) {
      const cells = ["ថ្ងៃ", "ម៉ោង", "នាទី", "វិនាទី"].map((l) => { const b = h("b", { textContent: "០០" }); return [b, h("div", { className: "card" }, b, h("small", { textContent: l }))]; });
      const tick = () => { let s = Math.max(0, Math.floor((p.t - Date.now()) / 1000)); [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].forEach((v, i) => (cells[i][0].textContent = kd(String(v).padStart(2, "0")))); };
      tick(); timer = setInterval(tick, 1000);
      sec.push(h("section", { className: "sec" }, ...head(D.countdown), h("div", { className: "count reveal" }, ...cells.map((c) => c[1]))));
    }
    if (S.schedule !== false && D.schedule?.length) sec.push(h("section", { className: "sec" }, ...head(D.scheduleTitle),
      h("ol", { className: "sched card reveal" }, ...D.schedule.map((s) => h("li", {}, s.icon ? h("img", { src: s.icon, alt: "", loading: "lazy" }) : null, h("div", {}, h("p", { className: "t", textContent: s.time }), h("p", { className: "d", textContent: s.text })))))));
    if (S.venue !== false) sec.push(h("section", { className: "sec" }, ...head(D.venue),
      h("div", { className: "card reveal" }, h("p", { className: "vname", textContent: D.venue.nameKm }), h("p", { className: "ven", textContent: D.venue.nameEn }),
        D.venue.mapUrl ? h("a", { className: "map-btn", href: D.venue.mapUrl, target: "_blank", rel: "noopener", textContent: D.venue.mapBtn }) : null),
      ...(yt(D.venue.youtube) ? [h("iframe", { className: "yt reveal", src: yt(D.venue.youtube).embed, title: "Wedding video", loading: "lazy", referrerPolicy: "strict-origin-when-cross-origin", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share", allowFullscreen: true }),
        h("a", { className: "yt-link reveal", href: yt(D.venue.youtube).watch, target: "_blank", rel: "noopener noreferrer", textContent: "▶ Watch on YouTube" })] : [])));
    if (S.gallery !== false && D.gallery?.length) sec.push(h("section", { className: "sec" }, ...head(D.galleryTitle),
      h("div", { className: "gal" }, ...D.gallery.map((src, i) => h("button", { type: "button", className: "reveal", ariaLabel: `Open photo ${i + 1}`, onclick: () => lightbox(src) }, h("img", { src, alt: `Wedding photo ${i + 1}`, loading: "lazy" }))))));
    if (S.gift !== false) sec.push(h("section", { className: "sec" }, ...head(D.gift),
      h("div", { className: "card reveal" }, h("p", { className: "para", textContent: D.gift.introKm }), h("p", { className: "para", textContent: D.gift.introEn }),
        D.gift.qr ? h("img", { className: "qr", src: D.gift.qr, alt: "Bank QR code for wedding gift", loading: "lazy" }) : null,
        h("p", { className: "h-km", textContent: D.gift.holderLabel }), h("p", { className: "pkm", style: "font-family:var(--latin);font-size:16px;margin-top:4px", textContent: D.gift.holder }),
        D.gift.account ? h("p", { className: "para", textContent: D.gift.account }) : null)));
    if (S.thanks !== false) sec.push(h("section", { className: "sec" }, ...head(D.thanks),
      h("div", { className: "card reveal" }, h("p", { className: "line", textContent: D.thanks.km }), h("p", { className: "thanks", textContent: D.thanks.textKm }), h("p", { className: "line", style: "font-family:var(--latin)", textContent: D.thanks.en }), h("p", { className: "thanks en", textContent: D.thanks.textEn }))));
    if (S.ending !== false && (D.ending.video || D.ending.text)) {
      const ev = D.ending.video ? h("video", { src: D.ending.video, muted: true, autoplay: true, loop: true, playsInline: true }) : null; if (ev) ev.setAttribute("muted", "");
      sec.push(h("section", { className: "ending" }, ev, h("p", { textContent: D.ending.text })));
    }

    const mbtn = D.music ? h("button", { className: "music" + (audio.paused ? "" : " on"), type: "button", ariaLabel: "Play or pause music", onclick: toggleMusic }) : null;
    if (mbtn) mbtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    if (audio.src !== new URL(D.music || "", location.href).href && D.music) audio.src = D.music;

    const stage = h("div", { className: "stage" }, fixedBg, cover, h("main", { className: "main" }, ...sec), mbtn);
    app.replaceChildren(stage);
    document.body.classList.toggle("locked", !opened);
    observe();
  }
  function person(x) { return h("div", { className: "person" }, h("div", { className: "frame" }, x.photo ? h("img", { src: x.photo, alt: x.en || x.km }) : null), h("p", { className: "pkm", textContent: x.km }), h("p", { className: "pen", textContent: x.en }), h("p", { className: "prole", textContent: x.role })); }
  function observe() {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))), { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((e) => (EDIT ? e.classList.add("in") : io.observe(e)));
  }
  function openInvite() { opened = true; document.getElementById("cover")?.classList.add("gone"); document.body.classList.remove("locked"); if (D.music && !EDIT) audio.play().then(syncMusic).catch(() => {}); }
  function toggleMusic() { audio.paused ? audio.play().then(syncMusic).catch(() => {}) : (audio.pause(), syncMusic()); }
  function syncMusic() { document.querySelector(".music")?.classList.toggle("on", !audio.paused); }
  function lightbox(src) {
    const close = () => { lb.remove(); removeEventListener("keydown", esc); }, esc = (e) => e.key === "Escape" && close();
    const lb = h("div", { className: "lb", role: "dialog", ariaModal: "true", onclick: (e) => e.target === lb && close() }, h("img", { src, alt: "" }), h("button", { type: "button", ariaLabel: "Close", textContent: "✕", onclick: close }));
    document.body.append(lb); addEventListener("keydown", esc); lb.querySelector("button").focus();
  }

  render();
  if (EMBED) {
    // Embedded in the admin page: the parent sends the live content and we just re-render it.
    addEventListener("message", (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== "braya-content") return;
      D = fixOld(merge(clone(window.BRAYA_DEFAULT), e.data.content || {})); opened = e.data.opened !== false; render();
    });
    parent.postMessage({ type: "braya-ready" }, location.origin);
    return;
  }
  if (!EDIT) return;

  // ---------- ADMIN EDITOR (?edit=1) ----------
  document.head.append(h("style", { textContent: `
  body.ed{margin-right:0}
  #bp{position:fixed;z-index:60;left:0;right:0;bottom:0;max-height:48vh;overflow:auto;background:#141a1a;color:#eee;font:13px/1.5 "Kantumruy Pro",system-ui,sans-serif;border-top:2px solid #c9a96a;padding:10px 12px 40px}
  #bp h3{margin:14px 0 6px;font-size:13px;color:#c9a96a;text-transform:uppercase;letter-spacing:.06em}
  #bp label{display:grid;gap:3px;margin:7px 0;font-size:12px;color:#a7b0ad}
  #bp input,#bp textarea,#bp select{font:inherit;color:#fff;background:#20292a;border:1px solid #3b4a4b;border-radius:6px;padding:6px;width:100%}
  #bp input[type=color]{height:32px;padding:2px} #bp input[type=checkbox]{width:auto}
  #bp .ck{display:flex;flex-direction:row;align-items:center;gap:6px}
  #bp button{font:inherit;background:#c9a96a;color:#141a1a;border:0;border-radius:6px;padding:6px 10px;margin:3px 3px 3px 0;cursor:pointer}
  #bp button.g{background:#20292a;color:#eee;border:1px solid #3b4a4b}
  #bp .tabs{display:flex;flex-wrap:wrap;gap:2px;position:sticky;top:-10px;background:#141a1a;padding:6px 0;z-index:1}
  #bp .tabs button.on{outline:2px solid #fff}
  #bp .item{border:1px solid #3b4a4b;border-radius:8px;padding:6px 8px;margin:8px 0}
  #bp .thumb{width:54px;height:54px;object-fit:cover;border-radius:6px;background:#20292a}
  #bp .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  #bp p{color:#a7b0ad;font-size:12px;margin:6px 0}
  #bt{position:fixed;z-index:61;right:10px;top:10px;padding:8px 12px;border-radius:20px;border:2px solid #c9a96a;background:#141a1a;color:#c9a96a;font:600 13px system-ui;cursor:pointer}
  @media(min-width:900px){#bp{left:auto;top:0;width:360px;max-height:none;border-top:0;border-left:2px solid #c9a96a}body.ed .stage{margin-left:max(0px,calc((100vw - 360px - 480px)/2))}#bt{right:372px}}
  ` }));
  document.body.classList.add("ed");
  const panel = h("aside", { id: "bp", ariaLabel: "Invitation editor" });
  const tog = h("button", { id: "bt", type: "button", textContent: "Hide editor", onclick: () => { const hide = panel.style.display !== "none"; panel.style.display = hide ? "none" : ""; tog.textContent = hide ? "Edit" : "Hide editor"; } });
  document.body.append(panel, tog);

  const say = (m) => { const t = h("div", { textContent: m, role: "status" }); t.style.cssText = "position:fixed;z-index:80;left:50%;top:14px;transform:translateX(-50%);background:#c9a96a;color:#141a1a;padding:8px 14px;border-radius:20px;font:600 13px system-ui"; document.body.append(t); setTimeout(() => t.remove(), 2400); };
  let saveT = 0;
  const commit = (rerender = true) => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(DK, JSON.stringify(D)); } catch { say("Browser storage full: use Save to Supabase or Download"); } }, 300); if (rerender) render(); };

  const pickImage = (cb, max = 1200) => {
    const i = h("input", { type: "file", accept: "image/*" });
    i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader();
      r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = h("canvas", { width: Math.round(im.width * k), height: Math.round(im.height * k) }); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL(/png/.test(f.type) ? "image/png" : "image/jpeg", 0.8)); say("Picture added"); }; im.src = r.result; };
      r.readAsDataURL(f); };
    i.click();
  };
  const fld = (label, path, type = "text") => {
    let i; const v = get(path);
    if (type === "area") { i = h("textarea", { rows: 3, value: v ?? "" }); }
    else if (type === "check") { i = h("input", { type: "checkbox", checked: v !== false }); i.onchange = () => { put(path, i.checked); commit(); }; return h("label", { className: "ck" }, i, label); }
    else if (type === "datetime") { const z = parts(v); const t = new Date(v); const loc = z ? new Date(t.getTime() + 7 * 36e5).toISOString().slice(0, 16) : ""; i = h("input", { type: "datetime-local", value: loc }); i.oninput = () => { put(path, i.value + ":00+07:00"); commit(); }; return h("label", {}, label + " (Cambodia time)", i); }
    else i = h("input", { type: type === "color" ? "color" : "text", value: v ?? "" });
    i.oninput = () => { put(path, i.value); commit(); };
    if (type === "img") return h("label", {}, label, h("div", { className: "row" }, v ? h("img", { className: "thumb", src: v, alt: "" }) : null, h("button", { type: "button", textContent: "Upload", onclick: () => pickImage((u) => { put(path, u); commit(); draw(); }) }), v ? h("button", { type: "button", className: "g", textContent: "Remove", onclick: () => { put(path, ""); commit(); draw(); } }) : null), i);
    return h("label", {}, label, i);
  };
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

  const TABS = {
    Cover: () => [fld("Names picture (replaces the text names)", "cover.namesImage", "img"), fld("Names text (shown only when there is no names picture)", "cover.names", "area"), fld("Cover background video URL (.mp4)", "cover.video"), fld("Cover background image", "cover.bgImage", "img"),
      fld("Label above guest name", "cover.guestLabel"), fld("Guest name when no guest link", "cover.guestDefault"), fld("Button (Khmer)", "cover.btnKm"), fld("Button (English)", "cover.btnEn"),
      fld("Background music URL (.mp3)", "music"), h("p", { textContent: "Videos and music must be links (upload them to your storage, then paste the URL)." }),
      h("button", { type: "button", className: "g", textContent: "Preview cover", onclick: () => { opened = false; render(); } }), h("button", { type: "button", className: "g", textContent: "Show invitation", onclick: () => { opened = true; render(); } })],
    Couple: () => [fld("Title", "intro.title"), fld("Invite line", "intro.line"), fld("Invite text", "intro.text", "area"),
      h("h3", { textContent: "Groom" }), fld("Name (Khmer)", "groom.km"), fld("Name (English)", "groom.en"), fld("Role", "groom.role"), fld("Photo", "groom.photo", "img"),
      h("h3", { textContent: "Bride" }), fld("Name (Khmer)", "bride.km"), fld("Name (English)", "bride.en"), fld("Role", "bride.role"), fld("Photo", "bride.photo", "img"), fld("Word between names", "andText")],
    Date: () => [fld("Wedding date & time", "date", "datetime"), fld("Date text (Khmer)", "dateKm", "area"), fld("Lunar date text", "lunarKm", "area"),
      h("h3", { textContent: "Headings" }), fld("Calendar (Khmer)", "calendar.km"), fld("Calendar (English)", "calendar.en"), fld("Countdown (Khmer)", "countdown.km"), fld("Countdown (English)", "countdown.en")],
    Schedule: () => [fld("Heading (Khmer)", "scheduleTitle.km"), fld("Heading (English)", "scheduleTitle.en"),
      ...D.schedule.map((s, i) => h("div", { className: "item" }, fld("Time", `schedule.${i}.time`), fld("Description", `schedule.${i}.text`, "area"), fld("Icon", `schedule.${i}.icon`, "img"),
        h("div", { className: "row" }, h("button", { type: "button", className: "g", textContent: "Up", onclick: () => { move(D.schedule, i, -1); commit(); draw(); } }), h("button", { type: "button", className: "g", textContent: "Down", onclick: () => { move(D.schedule, i, 1); commit(); draw(); } }), h("button", { type: "button", className: "g", textContent: "Delete", onclick: () => { D.schedule.splice(i, 1); commit(); draw(); } })))),
      h("button", { type: "button", textContent: "+ Add row", onclick: () => { D.schedule.push({ time: "", text: "", icon: "" }); commit(); draw(); } })],
    Venue: () => [fld("Heading (Khmer)", "venue.km"), fld("Heading (English)", "venue.en"), fld("Venue name (Khmer)", "venue.nameKm", "area"), fld("Venue name (English)", "venue.nameEn"),
      fld("Google Maps link", "venue.mapUrl"), fld("Map button text", "venue.mapBtn"), fld("YouTube link (any YouTube link works, empty = hide)", "venue.youtube")],
    Gallery: () => [fld("Heading (Khmer)", "galleryTitle.km"), fld("Heading (English)", "galleryTitle.en"),
      h("button", { type: "button", textContent: "+ Upload photo", onclick: () => pickImage((u) => { D.gallery.push(u); commit(); draw(); }) }),
      h("button", { type: "button", className: "g", textContent: "+ Add by URL", onclick: () => { const u = prompt("Image URL"); if (u) { D.gallery.push(u.trim()); commit(); draw(); } } }),
      ...D.gallery.map((src, i) => h("div", { className: "item row" }, h("img", { className: "thumb", src, alt: "" }), h("span", { textContent: `#${i + 1}`, style: "flex:1" }),
        h("button", { type: "button", className: "g", textContent: "Up", onclick: () => { move(D.gallery, i, -1); commit(); draw(); } }), h("button", { type: "button", className: "g", textContent: "Down", onclick: () => { move(D.gallery, i, 1); commit(); draw(); } }),
        h("button", { type: "button", className: "g", textContent: "Delete", onclick: () => { D.gallery.splice(i, 1); commit(); draw(); } })))],
    Gift: () => [fld("Heading (Khmer)", "gift.km"), fld("Heading (English)", "gift.en"), fld("Intro (Khmer)", "gift.introKm"), fld("Intro (English)", "gift.introEn"),
      fld("QR code image", "gift.qr", "img"), fld("Holder label", "gift.holderLabel"), fld("Account holder", "gift.holder"), fld("Account number (optional)", "gift.account")],
    Thanks: () => [fld("Heading (Khmer)", "thanks.km"), fld("Heading (English)", "thanks.en"), fld("Text (Khmer)", "thanks.textKm", "area"), fld("Text (English)", "thanks.textEn", "area"),
      h("h3", { textContent: "Ending" }), fld("Ending video URL", "ending.video"), fld("Ending text", "ending.text")],
    Style: () => [fld("Accent (calendar day, buttons)", "colors.accent", "color"), fld("Text colour", "colors.text", "color"), fld("Soft text colour", "colors.muted", "color"), fld("Gold details", "colors.gold", "color"), fld("Light gold (names on the photo)", "colors.goldLight", "color"),
      h("label", {}, "Heading font (Khmer)", (() => { const sel = h("select", {}, ...[["pali", "Khmer OS Muol Pali"], ["light", "Khmer OS Muol Light"], ["body", "Easy-to-read (Kantumruy Pro)"]].map(([v, t]) => h("option", { value: v, textContent: t }))); sel.value = (D.fonts || {}).heading || "pali"; sel.onchange = () => { put("fonts.heading", sel.value); commit(); }; return sel; })()),
      h("p", { style: "font-size:12px;opacity:.75;margin:6px 0", textContent: "The inside of the invitation uses the cover background image + video (set them in the Cover tab). It stays fixed while the info scrolls." }), h("h3", { textContent: "Show sections" }),
      ...Object.keys(D.show).map((k) => fld(k[0].toUpperCase() + k.slice(1), "show." + k, "check"))],
    Save: () => {
      const title = h("input", { value: `${D.groom.km} & ${D.bride.km}`, ariaLabel: "Invitation title" });
      const out = h("div");
      const links = (id) => { const base = location.origin + location.pathname.replace(/braya\/(index\.html)?$/, ""); out.replaceChildren(h("p", { textContent: "Invitation link:" }), h("input", { readOnly: true, value: `${base}?i=${id}` }), h("p", {}, h("a", { href: `${base}guests.html`, target: "_blank", style: "color:#c9a96a", textContent: "Manage guests (personal links)" }))); };
      if (invId) links(invId);
      return [
        h("p", { textContent: "Changes are kept in this browser automatically. Publish them to Supabase so guests see them." }),
        h("label", {}, "Title", title),
        sb ? h("button", { type: "button", textContent: invId ? "Save changes to Supabase" : "Save as new invitation", onclick: async () => {
          const { data: au } = await sb.auth.getUser(); if (!au?.user) return say("Log in as admin in this browser first");
          const row = { title: title.value.trim() || "Wedding", design: {}, config: { theme: "braya", braya: D } };
          const r = invId ? await sb.from("wedding_invites").update({ ...row, updated_at: new Date().toISOString() }).eq("id", invId).select("id").single()
            : await sb.from("wedding_invites").insert({ ...row, owner_id: au.user.id, status: "draft" }).select("id").single();
          if (r.error) return say(r.error.message);
          invId = r.data.id; say("Saved"); links(invId);
          if (!INV) history.replaceState(null, "", `?edit=1&i=${invId}`);
        } }) : h("p", { textContent: "Supabase is not configured in /wedding/config.js, so use Download below." }),
        h("button", { type: "button", className: "g", textContent: "Download content.js", onclick: () => { const a = h("a", { href: URL.createObjectURL(new Blob(["window.BRAYA_DEFAULT = " + JSON.stringify(D, null, 2) + ";\n"], { type: "text/javascript" })), download: "content.js" }); document.body.append(a); a.click(); a.remove(); } }),
        h("button", { type: "button", className: "g", textContent: "Reset to original", onclick: () => { if (!confirm("Discard all edits in this browser?")) return; localStorage.removeItem(DK); D = clone(window.BRAYA_DEFAULT); render(); draw(); } }),
        out
      ];
    }
  };
  let tab = "Cover";
  function draw() {
    const top = panel.scrollTop;
    panel.replaceChildren(h("div", { className: "tabs", role: "tablist" }, ...Object.keys(TABS).map((t) => h("button", { type: "button", role: "tab", ariaSelected: String(t === tab), className: t === tab ? "on" : "g", textContent: t, onclick: () => { tab = t; draw(); panel.scrollTop = 0; } }))), ...TABS[tab]());
    panel.scrollTop = top;
  }
  draw();
})();
