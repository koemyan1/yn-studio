(() => {
  const C = window.CONFIG;
  const E = new URLSearchParams(location.search).has("edit");
  const DF = { th: {}, env: {}, seal: { shape: "circle", icon: "lotus", size: 76, x: 50, y: 50 }, bf: { on: true, n: 14, size: 11, speed: 1, color: "#f0d890" }, snd: { music: C.music || "", open: "", vol: 0.7 }, o: {}, add: [], pages: [] };
  const mix = (a, b) => { for (const k in b) a[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? mix(a[k] || {}, b[k]) : b[k]; return a; };
  const D = mix(JSON.parse(JSON.stringify(DF)), window.DESIGN || {});
  if (E) try { mix(D, JSON.parse(localStorage.getItem("wd_draft") || "{}")); } catch {}
  const $ = (s) => document.querySelector(s);
  const set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
  const toKm = (n) => String(n).replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[d]);

  // ---- Fill content ----
  const guest = (window.GUEST || new URLSearchParams(location.search).get("to") || "").trim().slice(0, 60);
  set("#cardKm", `${C.groom.km} & ${C.bride.km}`);
  set("#cardEn", C.dateTextEn);
  set("#groomKm", C.groom.km); set("#brideKm", C.bride.km);
  set("#namesEn", `${C.groom.en} & ${C.bride.en}`);
  set("#dateKm", C.dateTextKm); set("#dateEn", C.dateTextEn);
  set("#venueKm", C.venueKm); set("#venueEn", C.venueEn);
  set("#footNames", `${C.groom.en} & ${C.bride.en}`);
  $("#mapBtn").href = C.mapUrl;
  const gn = guest || (E ? "Guest name" : "");
  if (gn) {
    set("#coverTo", `សូមគោរពអញ្ជើញ ${gn}`);
    set("#frontTo", gn);
  }
  if (guest) {
    set("#guestLine", `សូមស្វាគមន៍ ${guest}`);
    $("#guestLine").hidden = false;
    $("#rsvpForm [name=name]").value = guest;
    $("#wishForm [name=name]").value = guest;
  }
  document.title = `${C.groom.en} & ${C.bride.en} · Wedding Invitation`;

  $("#timeline").append(...C.schedule.map((s) => {
    const li = document.createElement("li");
    li.innerHTML = '<time></time><span class="km"></span><span class="latin"></span>';
    li.children[0].textContent = s.time;
    li.children[1].textContent = s.km;
    li.children[2].textContent = s.en;
    return li;
  }));

  // Gallery
  const g = $("#gallery");
  const fallbacks = ["linear-gradient(160deg,#1d6b66,#b3245f)", "linear-gradient(200deg,#d9b35f,#103638)", "linear-gradient(120deg,#b3245f,#0b2527)"];
  const photos = C.photos.length ? C.photos : fallbacks;
  photos.forEach((p) => {
    const d = document.createElement("div");
    d.style.setProperty("--g", C.photos.length ? `url("${p}")` : p);
    g.append(d);
  });

  // Gift QR
  if (C.khqrImage) {
    const img = $("#qrImg");
    img.onload = () => { img.hidden = false; };
    img.onerror = () => { img.hidden = true; };
    img.src = C.khqrImage;
  }
  set("#qrNote", C.khqrNote || "");
  if (!C.khqrImage && !C.khqrNote) $("#giftSec").hidden = true;

  // ---- Open envelope ----
  const audio = $("#bgm"), musicBtn = $("#musicBtn");
  function setMusic(on) {
    if (on) audio.play().then(() => musicBtn.classList.add("on")).catch(() => {});
    else { audio.pause(); musicBtn.classList.remove("on"); }
  }
  const sfx = new Audio();
  const open = () => {
    const env = $("#envelope"), card = env.querySelector(".env-card");
    if (D.snd.open) { sfx.src = D.snd.open; sfx.volume = D.snd.vol; sfx.play().catch(() => {}); }
    $("#cover").classList.add("opening");
    env.classList.add("peeled");                     // 1) the seal comes off
    setTimeout(() => env.classList.add("open"), 500);  // 2) four flaps open
    if (D.snd.music) {
      audio.src = D.snd.music; audio.volume = D.snd.vol;
      audio.addEventListener("error", () => { musicBtn.hidden = true; }, { once: true });
      musicBtn.hidden = false;
      setMusic(true);
    }
    setTimeout(() => {                               // 2) zoom into the card
      const r = card.getBoundingClientRect();
      env.style.setProperty("--dx", `${innerWidth / 2 - (r.left + r.width / 2)}px`);
      env.style.setProperty("--dy", `${innerHeight / 2 - (r.top + r.height / 2)}px`);
      env.style.setProperty("--z", Math.max(innerWidth, innerHeight) / r.width * 1.2);
      env.classList.add("zoom");
    }, 1600);
    setTimeout(() => {                               // 3) reveal the invitation
      $("#cover").classList.add("gone");
      $("#main").hidden = false;
      document.body.classList.remove("locked");
      document.body.classList.add("revealed");
      observe();
      window.scrollTo(0, 0);
    }, 2900);
  };
  const turn = () => { $("#envelope").classList.add("turned"); $("#cover").classList.add("turned"); };
  $("#front").addEventListener("click", () => { if (!E) turn(); });
  $("#seal").addEventListener("click", () => { if (!E) open(); });
  musicBtn.addEventListener("click", () => setMusic(audio.paused));

  function observe() {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  // ---- Countdown ----
  const target = new Date(C.date).getTime();
  const cd = $("#count");
  function tick() {
    let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    const parts = [[Math.floor(s / 86400), "ថ្ងៃ"], [Math.floor(s % 86400 / 3600), "ម៉ោង"], [Math.floor(s % 3600 / 60), "នាទី"], [s % 60, "វិនាទី"]];
    cd.innerHTML = "";
    parts.forEach(([n, l]) => {
      const d = document.createElement("div");
      d.innerHTML = "<strong></strong><span></span>";
      d.children[0].textContent = n;
      d.children[1].textContent = l;
      cd.append(d);
    });
  }
  tick(); setInterval(tick, 1000);

  // ---- Supabase (or demo mode) ----
  const live = C.supabaseUrl && !C.supabaseUrl.startsWith("YOUR") && window.supabase;
  const sb = live ? window.supabase.createClient(C.supabaseUrl, C.supabaseKey) : null;
  const demo = (k) => JSON.parse(localStorage.getItem("demo_" + k) || "[]");
  const demoAdd = (k, row) => localStorage.setItem("demo_" + k, JSON.stringify([row, ...demo(k)].slice(0, 50)));

  function renderWishes(rows) {
    const ul = $("#wishes");
    ul.innerHTML = "";
    rows.forEach((w) => {
      const li = document.createElement("li");
      li.innerHTML = "<b></b><p></p>";
      li.children[0].textContent = w.name;
      li.children[1].textContent = w.message;
      ul.append(li);
    });
  }
  async function loadWishes() {
    if (!sb) return renderWishes(demo("wishes"));
    const { data, error } = await sb.from("wishes").select("name,message").order("created_at", { ascending: false }).limit(50);
    if (!error) renderWishes(data);
  }
  loadWishes();

  async function save(table, row) {
    if (!sb) { demoAdd(table, row); return null; }
    const { error } = await sb.from(table).insert(row);
    return error;
  }
  function wire(formSel, statusSel, table, build, okMsg, after) {
    const f = $(formSel), st = $(statusSel);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button[type=submit]");
      btn.disabled = true; st.className = "status"; st.textContent = "…";
      const err = await save(table, build(new FormData(f)));
      btn.disabled = false;
      if (err) { st.className = "status err"; st.textContent = "មានបញ្ហា សូមព្យាយាមម្តងទៀត · Something went wrong, try again."; return; }
      st.textContent = okMsg;
      after && after(f);
    });
  }
  wire("#rsvpForm", "#rsvpStatus", "rsvps", (fd) => ({
    name: String(fd.get("name")).trim().slice(0, 60),
    attending: fd.get("attending") === "yes",
    guests: Number(fd.get("guests")) || 1
  }), "សូមអរគុណ! យើងបានទទួលការឆ្លើយតបរបស់អ្នក · Thank you!");
  wire("#wishForm", "#wishStatus", "wishes", (fd) => ({
    name: String(fd.get("name")).trim().slice(0, 60),
    message: String(fd.get("message")).trim().slice(0, 300)
  }), "សូមអរគុណសម្រាប់ពាក្យជូនពរ 💛", (f) => { f.message.value = ""; loadWishes(); });

  // ---- Everything editable: texts, seal, envelope, colours (see editor.js) ----
  if (D.bf.size === 20) D.bf.size = 11;
  const BUILT = ["#coverTo", ".cover-tap", ".cover-hint", "#frontTo", "#cardKm", "#cardEn", ".invite", "#groomKm", ".amp", "#brideKm", "#namesEn", "#dateKm", "#dateEn", "#guestLine", ".lotus-rule", "#count", "#hProg", "#timeline", "#hVenue", "#venueKm", "#venueEn", "#mapBtn", "#hGal", "#gallery", "#hRsvp", "#rsvpForm", "#hWish", "#wishForm", "#wishes", "#hGift", "#qr", ".foot"];
  const sealEl = $("#seal"), LOTUS = sealEl.innerHTML;
  $(".front-stamp").innerHTML = LOTUS;
  const HEART = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>';
  function apply() {
    const r = document.documentElement.style, V = (k, v) => (v ? r.setProperty(k, v) : r.removeProperty(k));
    ["ink", "deep", "jade", "gold", "gold-2", "silk", "pearl"].forEach((k) => V("--" + k, D.th[k]));
    const PT = { dots: '<circle cx="8" cy="8" r="1.6" fill="#fff" fill-opacity=".25"/>', lines: '<path d="M0 8h16" stroke="#fff" stroke-opacity=".2"/>', diamonds: '<path d="M8 1l7 7-7 7-7-7z" fill="none" stroke="#fff" stroke-opacity=".28"/>' }, pt = D.env.pat;
    $("#envelope").classList.toggle("fit-f", pt === "fit" && !!D.env.img);
    $("#envelope").classList.toggle("fit-b", pt === "fit" && !!(D.env.back || D.env.img));
    V("--epb", pt === "fit" && (D.env.back || D.env.img) ? `url("${D.env.back || D.env.img}")` : "");
    V("--ep", (pt === "img" || pt === "fit") && D.env.img ? `url("${D.env.img}")` : PT[pt] ? `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' + PT[pt] + "</svg>")}")` : "");
    V("--eps", pt === "img" ? "90px 90px" : PT[pt] ? "16px 16px" : ""); V("--ew", D.env.w ? D.env.w + "px" : "");
    V("--eb", D.env.body); V("--ef", D.env.flap); V("--el", D.env.line);
    const S = D.seal, z = S.size || 76;
    sealEl.style.setProperty("--sc", S.color || "");
    Object.assign(sealEl.style, { width: z + "px", height: z + "px", margin: `${-z / 2}px 0 0 ${-z / 2}px`, left: (S.x ?? 50) + "%", top: (S.y ?? 50) + "%", padding: S.icon === "image" ? "0" : "", overflow: "hidden",
      borderRadius: S.shape === "rounded" ? "22%" : S.shape === "square" ? "3px" : "50%", clipPath: S.shape === "diamond" ? "polygon(50% 0,100% 50%,50% 100%,0 50%)" : "" });
    sealEl.innerHTML = S.icon === "heart" ? HEART : S.icon === "text" ? "" : S.icon === "image" && S.img ? "" : S.icon === "none" ? "" : LOTUS;
    if (S.icon === "text") sealEl.append(Object.assign(document.createElement("span"), { className: "stxt", textContent: S.text || "♥" }));
    if (S.icon === "image" && S.img) sealEl.append(Object.assign(document.createElement("img"), { src: S.img, alt: "" }));
    document.querySelectorAll(".pg").forEach((n) => { if (!D.pages.some((p) => p.id === n.dataset.pg)) n.remove(); });
    D.pages.forEach((p) => {
      let n = document.querySelector(`.pg[data-pg="${p.id}"]`);
      if (!n) { n = document.createElement("section"); n.className = "pg"; n.dataset.pg = p.id; $("main").append(n); }
      n.dataset.n = D.pages.indexOf(p) + 2;
      Object.assign(n.style, { minHeight: (p.h || 700) + "px", backgroundColor: p.bg || "transparent", backgroundImage: p.img ? `url("${p.img}")` : "" });
    });
    document.querySelectorAll(".fr").forEach((n) => { if (!D.add.some((x) => x.id === n.dataset.e)) n.remove(); });
    D.add.forEach((x) => {
      let n = document.querySelector(`.fr[data-e="${x.id}"]`);
      if (!n) { n = document.createElement(x.k === "img" ? "img" : "div"); n.className = x.k === "img" ? "fr fi" : "fr"; n.dataset.e = x.id; (document.querySelector(`.pg[data-pg="${x.pg}"]`) || $(x.pg === "cover" ? "#cover" : "main")).append(n); }
      if (x.k === "img" && n.getAttribute("src") !== x.src) n.src = x.src;
    });
    const items = [...BUILT.map((s) => [$(s), s]), ...[...document.querySelectorAll(".fr")].map((n) => [n, n.dataset.e])];
    items.forEach(([el, k]) => {
      if (!el) return;
      const o = D.o[k] || {};
      el.dataset.e = k;
      if (el.tagName !== "IMG" && (!el.children.length || k === ".cover-hint")) { el._h ??= el.innerHTML; if (o.t != null && k !== "#frontTo" && k !== "#coverTo") el.textContent = o.t; else el.innerHTML = el._h; }
      el.style.translate = o.x || o.y ? `${o.x || 0}px ${o.y || 0}px` : "";
      el.style.fontSize = o.s ? o.s + "px" : "";
      el.style.fontFamily = o.f ? `var(--${o.f})` : "";
      el.style.backgroundImage = o.c ? "none" : ""; el.style.color = o.c || "";
      el.style.display = o.h && !E ? "none" : "";
      el.classList.toggle("ed-off", !!o.h);
      if (el.classList.contains("fi")) { el.style.width = (o.w || 160) + "px"; el.style.borderRadius = (o.r || 0) + "%"; }
    });
  }

  // ---- Golden butterflies flying around the whole screen ----
  const cv = $("#petals"), ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  const size = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr; };
  size(); addEventListener("resize", size);
  const bs = [];
  const mk = () => ({ x: Math.random() * W, y: Math.random() * H, a: Math.random() * 6.28, v: 0.6 + Math.random() * 0.8, p: Math.random() * 6.28, f: 0.22 + Math.random() * 0.12, k: 0.7 + Math.random() * 0.6, w: Math.random() * 6.28 });
  function wing(s) {
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 0.2, -s, s * 1.3, -s * 0.9, s * 1.1, -s * 0.2); ctx.bezierCurveTo(s, s * 0.2, s * 0.3, s * 0.2, 0, 0);
    ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 0.9, s * 0.1, s, s * 0.9, s * 0.45, s * 0.85); ctx.bezierCurveTo(s * 0.2, s * 0.8, 0, s * 0.3, 0, 0);
    ctx.fill(); ctx.stroke();
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function loop() {
    ctx.clearRect(0, 0, W, H);
    const B = D.bf, n = reduce || !B.on ? 0 : B.n;
    while (bs.length < n) bs.push(mk());
    bs.length = Math.min(bs.length, n);
    const col = B.color || "#f0d890";
    bs.forEach((b) => {
      b.w += 0.03; b.a += Math.sin(b.w) * 0.05 + (Math.random() - 0.5) * 0.05; b.p += b.f;
      const sp = b.v * (B.speed || 1) * dpr * (1 + 0.5 * Math.sin(b.p * 0.5));
      b.x += Math.cos(b.a) * sp; b.y += Math.sin(b.a) * sp * 0.8 - 0.25 * dpr;
      const m = 60 * dpr;
      if (b.x < -m) b.x = W + m; if (b.x > W + m) b.x = -m; if (b.y < -m) b.y = H + m; if (b.y > H + m) b.y = -m;
      const s = (B.size || 20) * b.k * dpr, flap = 0.2 + 0.8 * Math.abs(Math.sin(b.p));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.3);
      g.addColorStop(0, "#fffbe0"); g.addColorStop(0.45, col); g.addColorStop(1, "#8a5f12");
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a + Math.PI / 2);
      ctx.fillStyle = g; ctx.strokeStyle = "rgba(110,72,10,.7)"; ctx.lineWidth = dpr * 0.8; ctx.shadowColor = col; ctx.shadowBlur = 10 * dpr;
      [1, -1].forEach((d) => { ctx.save(); ctx.scale(d * flap, 1); wing(s); ctx.restore(); });
      ctx.shadowBlur = 0; ctx.fillStyle = "#5a3a08"; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.07, s * 0.5, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = "#5a3a08"; ctx.beginPath(); ctx.moveTo(0, -s * 0.45); ctx.quadraticCurveTo(-s * 0.2, -s * 0.8, -s * 0.3, -s * 0.85); ctx.moveTo(0, -s * 0.45); ctx.quadraticCurveTo(s * 0.2, -s * 0.8, s * 0.3, -s * 0.85); ctx.stroke();
      ctx.restore();
    });
    requestAnimationFrame(loop);
  })();

  window.WD = { E, D, apply, open, turn, BUILT };
  apply();
  if (E) { document.body.classList.add("editing"); document.body.append(Object.assign(document.createElement("script"), { src: "editor.js?v=3" })); }
})();
