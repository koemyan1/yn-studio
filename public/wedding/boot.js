// Loads app.js. For a saved/sent invitation (?i=<invite>&g=<guest>) it first fetches that invitation + guest name from Supabase.
(async () => {
  const q = new URLSearchParams(location.search), C = window.CONFIG || {};
  const stop = (msg) => { document.body.classList.remove("locked"); document.body.innerHTML = '<p style="font:16px/1.5 system-ui,sans-serif;color:#f3ece0;background:#0b2527;min-height:100vh;margin:0;padding:40px 20px;text-align:center">' + msg + "</p>"; };
  if (q.get("i")) {
    if (!(C.supabaseUrl && !C.supabaseUrl.startsWith("YOUR") && window.supabase)) return stop("This invitation needs Supabase.<br><small>Set supabaseUrl and supabaseKey in public/wedding/config.js.</small>");
    try {
      const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
      const { data, error } = await sb.rpc("wedding_open", { p_invite: q.get("i"), p_guest: q.get("g") || null });
      if (error) return stop("This invitation could not be opened.<br><small>" + error.message + "</small>");
      if (!data) return stop("Invitation not found.");
      window.CONFIG = Object.assign({}, C, data.config, { supabaseUrl: C.supabaseUrl, supabaseKey: C.supabaseKey }); window.DESIGN = data.design || {}; window.GUEST = data.guest || "";
    } catch (e) { return stop("This invitation could not be opened.<br><small>" + (e && e.message || e) + "</small>"); }
  }
  document.body.append(Object.assign(document.createElement("script"), { src: "app.js?v=6" }));
})();
