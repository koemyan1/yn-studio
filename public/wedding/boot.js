// Loads app.js. For a sent invitation (?i=<invite>&g=<guest>) it first fetches that invitation + guest name from Supabase.
(async () => {
  const q = new URLSearchParams(location.search), C = window.CONFIG || {};
  if (q.get("i") && C.supabaseUrl && !C.supabaseUrl.startsWith("YOUR") && window.supabase) {
    try {
      const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
      const { data } = await sb.rpc("wedding_open", { p_invite: q.get("i"), p_guest: q.get("g") || null });
      if (data) { window.CONFIG = Object.assign({}, C, data.config, { supabaseUrl: C.supabaseUrl, supabaseKey: C.supabaseKey }); window.DESIGN = data.design || {}; window.GUEST = data.guest || ""; }
    } catch (e) { /* fall back to the default invitation */ }
  }
  document.body.append(Object.assign(document.createElement("script"), { src: "app.js?v=4" }));
})();
