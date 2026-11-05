(() => {
  const C = window.CONFIG;
  const $ = (s) => document.querySelector(s);
  const set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
  const toKm = (n) => String(n).replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[d]);

  // ---- Fill content ----
  const guest = (new URLSearchParams(location.search).get("to") || "").trim().slice(0, 60);
  set("#cardKm", `${C.groom.km} & ${C.bride.km}`);
  set("#cardEn", C.dateTextEn);
  set("#groomKm", C.groom.km); set("#brideKm", C.bride.km);
  set("#namesEn", `${C.groom.en} & ${C.bride.en}`);
  set("#dateKm", C.dateTextKm); set("#dateEn", C.dateTextEn);
  set("#venueKm", C.venueKm); set("#venueEn", C.venueEn);
  set("#footNames", `${C.groom.en} & ${C.bride.en}`);
  $("#mapBtn").href = C.mapUrl;
  if (guest) {
    set("#coverTo", `សូមគោរពអញ្ជើញ ${guest}`);
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
  $("#seal").addEventListener("click", () => {
    const env = $("#envelope"), card = env.querySelector(".env-card");
    $("#cover").classList.add("opening");
    env.classList.add("open");                       // 1) four flaps open
    if (C.music) {
      audio.src = C.music;
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
    }, 1100);
    setTimeout(() => {                               // 3) reveal the invitation
      $("#cover").classList.add("gone");
      $("#main").hidden = false;
      document.body.classList.remove("locked");
      document.body.classList.add("revealed");
      observe();
      window.scrollTo(0, 0);
    }, 2400);
  });
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

  // ---- Falling petals ----
  const cv = $("#petals"), ctx = cv.getContext("2d");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let W, H, dpr;
    const size = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr; };
    size(); addEventListener("resize", size);
    const cols = ["rgba(217,179,95,", "rgba(179,36,95,", "rgba(243,236,224,"];
    const mk = (y) => ({ x: Math.random() * W, y: y ?? Math.random() * H, r: (4 + Math.random() * 7) * dpr, v: (0.4 + Math.random() * 0.9) * dpr, s: Math.random() * 6, a: 0.25 + Math.random() * 0.4, c: cols[Math.floor(Math.random() * 3)] });
    const ps = Array.from({ length: 26 }, () => mk());
    (function loop() {
      ctx.clearRect(0, 0, W, H);
      ps.forEach((p, i) => {
        p.y += p.v; p.s += 0.02; p.x += Math.sin(p.s) * 0.6 * dpr;
        if (p.y > H + 20) ps[i] = mk(-20);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.s);
        ctx.fillStyle = p.c + p.a + ")";
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r / 2.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      requestAnimationFrame(loop);
    })();
  }
})();
