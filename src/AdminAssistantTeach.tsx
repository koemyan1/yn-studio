import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bot, Copy, Download, Pencil, Play, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import {
  ADMIN_PAGES, SETTINGS_EVENT, SKILLS_EVENT, clearMissed, getMissed, getSettings, getSkills, refreshSkills, removeSkill, saveSettings, saveSkill, setSkillEnabled,
  type Skill, type SkillKind, type Step,
} from './assistantEngine';

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Draft = { id?: string; name: string; description: string; triggers: string; kind: SkillKind; reply: string; steps: Step[]; code: string; enabled: boolean };

const EMPTY: Draft = { name: '', description: '', triggers: '', kind: 'reply', reply: '', steps: [], code: '', enabled: true };
const STEP_TYPES: { t: Step['t']; label: string }[] = [
  { t: 'go', label: 'Go to page' }, { t: 'click', label: 'Click' }, { t: 'type', label: 'Type into' }, { t: 'say', label: 'Say' },
  { t: 'scroll', label: 'Scroll to' }, { t: 'wait', label: 'Wait' }, { t: 'mode', label: 'Dark / light' }, { t: 'refresh', label: 'Refresh data' },
];
const newStep = (t: Step['t']): Step => {
  switch (t) {
    case 'go': return { t, path: '/admin/orders' };
    case 'click': return { t, target: '' };
    case 'type': return { t, target: '', text: '' };
    case 'say': return { t, text: '' };
    case 'scroll': return { t, target: 'top' };
    case 'wait': return { t, ms: 800 };
    case 'mode': return { t, mode: 'dark' };
    default: return { t: 'refresh' };
  }
};
const CODE_EXAMPLES: { label: string; triggers: string; code: string }[] = [
  { label: 'Count unpaid orders', triggers: 'unpaid count', code: "const { count } = await ctx.supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'pending');\nctx.say(`There are ${count} orders waiting for payment.`);" },
  { label: 'Open a customer by name', triggers: 'customer {name}', code: "await ctx.go('/admin/customers');\nawait ctx.type('search', ctx.args.name);\nctx.say(`Showing customers matching ${ctx.args.name}.`);" },
  { label: 'Morning routine', triggers: 'start my day', code: "ctx.say('Checking the shop…');\nconst { count } = await ctx.supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString());\nctx.say(`${count} orders so far today.`);\nawait ctx.go('/admin/orders');" },
];

const toDraft = (s: Skill): Draft => ({ id: s.id, name: s.name, description: s.description || '', triggers: s.triggers.join('\n'), kind: s.kind, reply: s.reply || '', steps: s.steps || [], code: s.code || '', enabled: s.enabled });

export default function AdminAssistantTeach({ Shell }: { Shell: Shell }) {
  const [skills, setSkills] = useState<Skill[]>(getSkills());
  const [setup, setSetup] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [missed, setMissed] = useState<string[]>(getMissed());
  const [settings, setSettings] = useState(getSettings());
  const [, bump] = useState(0);
  const formRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const r = await refreshSkills();
    setSkills(r.skills);
    setSetup(r.missingTable ? 'missing' : r.error || null);
  };
  useEffect(() => {
    load();
    const f = () => { setSkills([...getSkills()]); setMissed(getMissed()); };
    const s = () => setSettings(getSettings());
    window.addEventListener(SKILLS_EVENT, f); window.addEventListener(SETTINGS_EVENT, s);
    return () => { window.removeEventListener(SKILLS_EVENT, f); window.removeEventListener(SETTINGS_EVENT, s); };
  }, []);

  const flash = (t: string) => { setMsg(t); window.setTimeout(() => setMsg(m => (m === t ? '' : m)), 3500); };
  const start = (d: Draft) => { setDraft(d); window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const patch = (p: Partial<Draft>) => setDraft(d => (d ? { ...d, ...p } : d));
  const setStep = (i: number, p: Partial<Step>) => patch({ steps: draft!.steps.map((s, j) => (j === i ? ({ ...s, ...p } as Step) : s)) });
  const moveStep = (i: number, d: number) => { const a = [...draft!.steps]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; patch({ steps: a }); };
  const test = (t: string) => window.dispatchEvent(new CustomEvent('yn-ai-run', { detail: t }));

  const triggerList = (d: Draft) => d.triggers.split('\n').map(x => x.trim()).filter(Boolean);
  const save = async () => {
    if (!draft) return;
    const trig = triggerList(draft);
    if (!draft.name.trim()) return flash('Give the command a name.');
    if (!trig.length) return flash('Add at least one phrase that should trigger it.');
    if (draft.kind === 'reply' && !draft.reply.trim()) return flash('Write what I should answer.');
    if (draft.kind === 'macro' && !draft.steps.length) return flash('Add at least one step.');
    if (draft.kind === 'code' && !draft.code.trim()) return flash('Write some code first.');
    if (draft.kind === 'code') { try { new (Object.getPrototypeOf(async function () { /* */ }).constructor)('ctx', 'args', 'text', draft.code); } catch (e: any) { return flash('Code mistake: ' + e.message); } }
    setBusy(true);
    const err = await saveSkill({ id: draft.id, name: draft.name, description: draft.description, triggers: trig, kind: draft.kind, reply: draft.reply, steps: draft.steps, code: draft.code, enabled: draft.enabled });
    setBusy(false);
    if (err) return flash(/assistant_skills|schema cache|does not exist/i.test(err) ? 'The database table is missing – run supabase-admin-assistant.sql first.' : err);
    flash('Saved. I know this command now.');
    if (trig.length) trig.forEach(t => clearMissed(t.toLowerCase()));
    setDraft(null);
  };
  const del = async (s: Skill) => { if (!window.confirm(`Delete “${s.name}”?`)) return; const e = await removeSkill(s.id); flash(e || 'Deleted.'); };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(skills.map(({ id, created_at, hits, ...r }) => r), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'assistant-commands.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      if (!Array.isArray(arr)) throw new Error('The file must contain a list of commands.');
      let n = 0;
      for (const r of arr) { if (r?.name && Array.isArray(r.triggers) && !(await saveSkill({ ...r, id: undefined }))) n++; }
      flash(`Imported ${n} command${n === 1 ? '' : 's'}.`);
    } catch (e: any) { flash('Import failed: ' + e.message); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? skills.filter(k => (k.name + ' ' + k.triggers.join(' ')).toLowerCase().includes(s)) : skills;
  }, [skills, q]);

  return (
    <Shell title="AI Assistant">
      <div className="aiT">
        <section>
          <div className="row"><Bot /><div className="grow"><span className="eyebrow">TEACH {settings.name.toUpperCase()}</span><h2>Teach the assistant new commands</h2></div>
            <button className="go" onClick={() => start({ ...EMPTY })}><Plus /> New command</button></div>
          <p className="muted">The assistant understands the phrases you give it. Add a phrase (English or Khmer) and tell it what to do: <b>reply</b> with text, run <b>steps</b> on the screen, or run your own <b>code</b>. Use <code>{'{name}'}</code> in a phrase to catch a word, e.g. “customer {'{name}'}”. Touch the screen at any time while it is working and it stops.</p>
          {setup === 'missing' && <div className="notice"><b>One-time setup:</b> run <code>supabase-admin-assistant.sql</code> in the Supabase SQL editor, then reload this page. Until then the assistant still works with its built-in commands, but cannot save new ones.</div>}
          {setup && setup !== 'missing' && <div className="notice">Could not load saved commands: {setup}</div>}
          {msg && <div className="chip" role="status">{msg}</div>}
          <div className="row">
            <button onClick={() => window.dispatchEvent(new Event('yn-ai-open'))}><Bot /> Open the assistant</button>
            <button onClick={() => test('help')}><Play /> Show what it can do</button>
          </div>
        </section>

        {missed.length > 0 && (
          <section>
            <div className="row"><div className="grow"><h3>Things it didn’t understand</h3><p className="muted">Tap one to turn it into a command.</p></div><button className="mini" onClick={() => clearMissed()}>Clear</button></div>
            <div className="row">{missed.slice(0, 12).map(m => <button key={m} className="mini" onClick={() => start({ ...EMPTY, name: m.slice(0, 40), triggers: m })}><Plus /> {m}</button>)}</div>
          </section>
        )}

        {draft && (
          <section ref={formRef}>
            <div className="row"><h3 className="grow">{draft.id ? 'Edit command' : 'New command'}</h3><button className="mini" onClick={() => setDraft(null)}><X /> Cancel</button></div>
            <label>Name<input value={draft.name} onChange={e => patch({ name: e.target.value })} placeholder="e.g. Start my day" /></label>
            <label>When I say… <span className="muted">(one phrase per line, e.g. “good morning shop”. <code>{'{name}'}</code> catches a word, <code>/regex/</code> is allowed)</span>
              <textarea value={draft.triggers} onChange={e => patch({ triggers: e.target.value })} placeholder={'start my day\nសួស្តីហាង\ncustomer {name}'} /></label>
            <div className="seg" role="tablist">
              {([['reply', 'Reply'], ['macro', 'Steps'], ['code', 'Code']] as [SkillKind, string][]).map(([k, l]) => <button key={k} className={draft.kind === k ? 'on' : ''} onClick={() => patch({ kind: k })}>{l}</button>)}
            </div>

            {draft.kind === 'reply' && <label>I answer<textarea value={draft.reply} onChange={e => patch({ reply: e.target.value })} placeholder="Opening hours are 8am to 8pm. Use {name} to repeat a word you caught." /></label>}

            {draft.kind === 'macro' && (
              <div style={{ display: 'grid', gap: 8 }}>
                {draft.steps.map((s, i) => (
                  <div className="step" key={i}>
                    <select value={s.t} onChange={e => patch({ steps: draft.steps.map((x, j) => (j === i ? newStep(e.target.value as Step['t']) : x)) })}>
                      {STEP_TYPES.map(o => <option key={o.t} value={o.t}>{o.label}</option>)}
                    </select>
                    <div className="fields">
                      {s.t === 'go' && <select value={ADMIN_PAGES.some(p => p.path === s.path) ? s.path : ''} onChange={e => setStep(i, { path: e.target.value })}>{ADMIN_PAGES.map(p => <option key={p.path} value={p.path}>{p.label}</option>)}</select>}
                      {(s.t === 'click' || s.t === 'scroll') && <input value={s.target} onChange={e => setStep(i, { target: e.target.value })} placeholder={s.t === 'click' ? 'Button text, e.g. Save' : 'top, bottom, or text on the page'} />}
                      {s.t === 'type' && <><input value={s.target} onChange={e => setStep(i, { target: e.target.value })} placeholder="Field name, e.g. search order" /><input value={s.text} onChange={e => setStep(i, { text: e.target.value })} placeholder="What to type (can use {name})" /></>}
                      {s.t === 'say' && <input value={s.text} onChange={e => setStep(i, { text: e.target.value })} placeholder="What to say" />}
                      {s.t === 'wait' && <input type="number" min={0} max={15000} step={100} value={s.ms} onChange={e => setStep(i, { ms: Number(e.target.value) })} />}
                      {s.t === 'mode' && <select value={s.mode} onChange={e => setStep(i, { mode: e.target.value as any })}><option value="dark">Dark mode</option><option value="light">Light mode</option></select>}
                      {s.t === 'refresh' && <span className="muted">Reloads the data on the current page.</span>}
                    </div>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button className="mini" onClick={() => moveStep(i, -1)} aria-label="Move up"><ArrowUp /></button>
                      <button className="mini" onClick={() => moveStep(i, 1)} aria-label="Move down"><ArrowDown /></button>
                      <button className="mini danger" onClick={() => patch({ steps: draft.steps.filter((_, j) => j !== i) })} aria-label="Remove step"><Trash2 /></button>
                    </div>
                  </div>
                ))}
                <div className="row"><button onClick={() => patch({ steps: [...draft.steps, newStep('go')] })}><Plus /> Add step</button></div>
              </div>
            )}

            {draft.kind === 'code' && (
              <>
                <label>JavaScript <span className="muted">(runs when the phrase matches; you are signed in as admin, so it can read and change store data)</span>
                  <textarea className="code" spellCheck={false} value={draft.code} onChange={e => patch({ code: e.target.value })} placeholder={"ctx.say('Hello!');"} /></label>
                <div className="row"><span className="muted">Examples:</span>{CODE_EXAMPLES.map(x => <button key={x.label} className="mini" onClick={() => patch({ code: x.code, triggers: draft.triggers.trim() ? draft.triggers : x.triggers, name: draft.name || x.label })}>{x.label}</button>)}</div>
                <details><summary>What can my code use?</summary>
                  <pre>{`ctx.say(text)            show a reply
ctx.go('/admin/orders')  open a page
ctx.click('Save')        click a button / link by its text
ctx.type('search', 'x')  type into a field (by placeholder / label)
ctx.scroll('top')        top, bottom, up, down or text on the page
ctx.wait(1000)           pause (milliseconds)
ctx.find('text')         get the element (or null)
ctx.mode('dark')         dark / light mode
ctx.refresh()            reload the page's data
ctx.fetchJSON(url)       download JSON from a public API
ctx.supabase             the database (your admin session)
ctx.args / ctx.text      words caught by {slots} / what was said
ctx.stopped()            true once the person touched the screen`}</pre>
                  <p className="muted" style={{ marginTop: 8 }}>Every <code>ctx.*</code> action stops by itself when you touch the screen. If you write long loops, call <code>ctx.check()</code> inside them.</p>
                </details>
              </>
            )}

            <label className="switch"><input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked })} /> Enabled</label>
            <div className="row"><button className="go" onClick={save} disabled={busy}><Save /> {busy ? 'Saving…' : 'Save command'}</button>
              {draft.id && triggerList(draft)[0] && !/[{}]|^\//.test(triggerList(draft)[0]) && <button onClick={() => test(triggerList(draft)[0])}><Play /> Test saved version</button>}</div>
          </section>
        )}

        <section>
          <div className="row"><h3 className="grow">Taught commands ({skills.length})</h3>
            <input style={{ maxWidth: 220 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" />
            <button className="mini" onClick={exportJson} disabled={!skills.length}><Download /> Export</button>
            <button className="mini" onClick={() => fileRef.current?.click()}><Upload /> Import</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={e => importJson(e.target.files?.[0])} /></div>
          {!shown.length && <p className="muted">{skills.length ? 'Nothing matches your search.' : 'No commands yet. Tap “New command” to teach the first one.'}</p>}
          {shown.map(s => (
            <article key={s.id} className={'skill' + (s.enabled ? '' : ' off')}>
              <header><b className="grow">{s.name}</b><span className="badge">{s.kind === 'macro' ? 'steps' : s.kind}</span><span className="muted">used {s.hits || 0}×</span></header>
              <div className="row">{s.triggers.map(t => <span className="chip" key={t}>{t}</span>)}</div>
              {s.kind === 'reply' && <p className="muted">“{(s.reply || '').slice(0, 140)}”</p>}
              {s.kind === 'macro' && <p className="muted">{(s.steps || []).length} step(s)</p>}
              <div className="row">
                {!/[{}]|^\//.test(s.triggers[0] || '/') && <button className="mini" onClick={() => test(s.triggers[0])}><Play /> Try</button>}
                <button className="mini" onClick={() => start(toDraft(s))}><Pencil /> Edit</button>
                <button className="mini" onClick={() => start({ ...toDraft(s), id: undefined, name: s.name + ' copy' })}><Copy /> Duplicate</button>
                <button className="mini" onClick={async () => { const e = await setSkillEnabled(s.id, !s.enabled); if (e) flash(e); }}>{s.enabled ? 'Turn off' : 'Turn on'}</button>
                <button className="mini danger" onClick={() => del(s)}><Trash2 /> Delete</button>
              </div>
            </article>
          ))}
        </section>

        <section>
          <h3>Assistant settings</h3>
          <label>Name <span className="muted">(also the hands-free wake word)</span><input value={settings.name} maxLength={20} onChange={e => saveSettings({ name: e.target.value })} /></label>
          <label className="switch"><input type="checkbox" checked={settings.speak} onChange={e => saveSettings({ speak: e.target.checked })} /> Speak replies out loud</label>
          <label className="switch"><input type="checkbox" checked={settings.showAvatar} onChange={e => saveSettings({ showAvatar: e.target.checked })} /> Show the floating bot on admin pages</label>
          <div className="row"><button onClick={() => { localStorage.removeItem('yn-ai-pos'); window.location.reload(); }}>Reset bot position</button>
            <button onClick={() => { for (const k of ['yn-ai-notes']) localStorage.removeItem(k); bump(x => x + 1); flash('Notes cleared.'); }}>Clear my notes</button></div>
          <p className="muted">Drag the bot anywhere on the screen. Tap it to open the chat. It only appears for admin accounts, on admin pages.</p>
        </section>
      </div>
    </Shell>
  );
}
