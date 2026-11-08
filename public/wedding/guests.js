// Customer page: add the names of the people you invite; each gets a personal link that shows their name on the envelope.
(() => {
  const C = window.CONFIG, app = document.querySelector("#app");
  const h = (t, a = {}, ...k) => { const e = Object.assign(document.createElement(t), a); e.append(...k); return e; };
  if (!window.supabase || !C.supabaseUrl || C.supabaseUrl.startsWith("YOUR")) { app.textContent = "Supabase is not set up in config.js yet."; return; }
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  const base = location.origin + location.pathname.replace(/guests\.html$/, "");
  const link = (i, g) => `${base}?i=${i}&g=${g}`;
  const toast = (m) => alert(m);

  function login() {
    const em = h("input", { type: "email", placeholder: "Email", autocomplete: "email" }), pw = h("input", { type: "password", placeholder: "Password", autocomplete: "current-password" });
    const go = h("button", { textContent: "Log in", onclick: async () => { const { error } = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value }); error ? toast(error.message) : main(); } });
    app.replaceChildren(h("h1", {}, "My wedding guests"), h("div", { className: "card" }, h("p", { className: "muted" }, "Log in with the same account you use on our website."), em, pw, go));
  }

  async function main() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return login();
    const { data: invites, error } = await sb.from("wedding_invites").select("id,title").eq("owner_id", session.user.id).order("created_at", { ascending: false });
    app.replaceChildren(h("h1", {}, "My wedding guests"), h("button", { className: "g", textContent: "Log out", onclick: async () => { await sb.auth.signOut(); login(); } }));
    if (error) return app.append(h("p", {}, error.message));
    if (!invites.length) return app.append(h("p", { className: "muted" }, "No invitation has been sent to your account yet. Please contact us."));
    for (const inv of invites) app.append(await panel(inv));
  }

  async function panel(inv) {
    const box = h("div", { className: "card" }), list = h("div"), ta = h("textarea", { rows: 4, placeholder: "Type names, one per line\nពូ សុខា\nAunt Dara\nMy friend Vanna" });
    const { data: gs } = await sb.from("wedding_guests").select("id,name,opened_at").eq("invite_id", inv.id).order("created_at");
    const draw = (rows) => list.replaceChildren(...rows.map((g) => h("div", { className: "row" }, h("b", {}, g.name), g.opened_at ? h("span", { className: "ok" }, "Opened ✓") : "",
      h("button", { textContent: "Copy link", onclick: () => navigator.clipboard.writeText(link(inv.id, g.id)).then(() => toast("Link copied")) }),
      navigator.share ? h("button", { className: "g", textContent: "Share", onclick: () => navigator.share({ title: inv.title, text: `${g.name}, you are invited 💌`, url: link(inv.id, g.id) }).catch(() => {}) }) : "",
      h("button", { className: "g", textContent: "✕", title: "Remove", onclick: async () => { if (!confirm(`Remove ${g.name}?`)) return; await sb.from("wedding_guests").delete().eq("id", g.id); main(); } }))));
    draw(gs || []);
    box.append(h("h2", {}, inv.title || "Wedding invitation"), h("a", { className: "b", href: `${base}?i=${inv.id}`, target: "_blank", textContent: "Preview invitation" }),
      h("p", { className: "muted" }, "Add the people you want to invite. Each one gets their own link, and their name appears on the front of the envelope."), ta,
      h("button", { textContent: "＋ Add guests", onclick: async () => {
        const names = ta.value.split(/\n|,/).map((s) => s.trim().slice(0, 60)).filter(Boolean); if (!names.length) return;
        const { error } = await sb.from("wedding_guests").insert(names.map((name) => ({ invite_id: inv.id, name }))); error ? toast(error.message) : main(); } }),
      (gs || []).length ? h("button", { className: "g", textContent: "Copy all links", onclick: () => navigator.clipboard.writeText(gs.map((g) => `${g.name}: ${link(inv.id, g.id)}`).join("\n")).then(() => toast("All links copied")) }) : "",
      h("p", { className: "muted" }, `${(gs || []).length} guest(s)`), list);
    return box;
  }
  main();
})();
