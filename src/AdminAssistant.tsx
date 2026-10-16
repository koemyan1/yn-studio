import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Mic, SendHorizontal, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { supabase } from './supabase';
import { isPreviewFrame } from './themeLive';
import { Engine, SETTINGS_EVENT, SKILLS_EVENT, getSettings, getSkills, refreshSkills, saveSettings } from './assistantEngine';
import './assistant.admin.css';

type Msg = { id: number; role: 'me' | 'bot' | 'act' | 'err'; text: string; t: number };
type BotState = 'idle' | 'working' | 'listening' | 'talking';

/* chat log + avatar position live outside React so they survive page changes inside the admin */
const LOG_KEY = 'yn-ai-log', POS_KEY = 'yn-ai-pos';
let LOG: Msg[] = (() => { try { return JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } })();
let seq = LOG.reduce((a, m) => Math.max(a, m.id), 0);
const loadPos = (): { fx: number; fy: number } | null => { try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch { return null; } };
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export function BotFace({ state }: { state: BotState }) {
  return (
    <svg className="aiBot" data-s={state} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="aiHead" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
      </defs>
      <line x1="32" y1="8" x2="32" y2="15" stroke="#6d28d9" strokeWidth="2.5" strokeLinecap="round" />
      <circle className="bulb" cx="32" cy="6" r="3.6" fill="#fbbf24" />
      <circle cx="9" cy="33" r="4" fill="#7c3aed" /><circle cx="55" cy="33" r="4" fill="#7c3aed" />
      <rect x="10" y="14" width="44" height="40" rx="16" fill="url(#aiHead)" />
      <rect x="15.5" y="20" width="33" height="27" rx="11" fill="#1b1030" />
      <ellipse className="eye" cx="25.5" cy="32" rx="3.4" ry="4.2" fill="#7df9ff" />
      <ellipse className="eye" cx="38.5" cy="32" rx="3.4" ry="4.2" fill="#7df9ff" />
      <circle cx="21" cy="40" r="2.6" fill="#f9a8d4" opacity=".55" /><circle cx="43" cy="40" r="2.6" fill="#f9a8d4" opacity=".55" />
      <path className="mouth" d="M28 40.5 Q32 44 36 40.5" fill="none" stroke="#7df9ff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const urlify = (t: string) => t.split(/(https?:\/\/[^\s]+)/g).map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : p));
const AVATAR = 62;

export default function AdminAssistantHost() {
  const nav = useNavigate();
  const loc = useLocation();
  const [admin, setAdmin] = useState(false);
  const [settings, setSettings] = useState(getSettings());
  const [log, setLog] = useState<Msg[]>(LOG);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [talking, setTalking] = useState(false);
  const [hands, setHands] = useState(false);
  const [text, setText] = useState('');
  const [toast, setToast] = useState<Msg | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [pos, setPos] = useState(loadPos);
  const [dragging, setDragging] = useState(false);
  const [, bump] = useState(0);
  const [forceShow, setForceShow] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const openRef = useRef(open); openRef.current = open;
  const pathRef = useRef(loc.pathname); pathRef.current = loc.pathname;
  const navRef = useRef(nav); navRef.current = nav;
  const toastTimer = useRef(0);

  /* ---------- only for signed-in admins ---------- */
  useEffect(() => {
    let live = true;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { if (live) setAdmin(false); return; }
      const p = await supabase.from('profiles').select('role').eq('user_id', data.session.user.id).maybeSingle();
      if (live) setAdmin(p.data?.role === 'admin');
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { check(); });
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);

  /* ---------- messages + speech ---------- */
  const speak = useCallback((t: string) => {
    if (!settingsRef.current.speak || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t.replace(/https?:\/\/\S+/g, 'link').replace(/[•→✋⏰]/g, ' ').slice(0, 300));
    u.onstart = () => setTalking(true); u.onend = u.onerror = () => setTalking(false);
    speechSynthesis.speak(u);
  }, []);
  const push = useCallback((role: Msg['role'], t: string) => {
    const m: Msg = { id: ++seq, role, text: t, t: Date.now() };
    LOG = [...LOG, m].slice(-80);
    try { sessionStorage.setItem(LOG_KEY, JSON.stringify(LOG)); } catch { /* ignore */ }
    setLog(LOG);
    if (role !== 'me' && !openRef.current) {
      setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), role === 'act' ? 2200 : 6000);
    }
    return m;
  }, []);

  const engine = useMemo(() => {
    const e = new Engine({
      say: (t, k) => { push(k === 'act' ? 'act' : k === 'err' ? 'err' : 'bot', t); if (!k || k === 'bot') speak(t); },
      navigate: p => navRef.current(p),
      path: () => pathRef.current,
      stopSpeaking: () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); setTalking(false); },
    });
    return e;
  }, [push, speak]);
  useEffect(() => engine.onChange(() => setBusy(engine.busy)), [engine]);
  useEffect(() => () => { engine.stop(); }, [engine]);

  const send = useCallback((t: string) => {
    const v = t.trim(); if (!v) return;
    push('me', v); engine.run(v);
  }, [engine, push]);

  useEffect(() => { if (admin) refreshSkills(); }, [admin]);
  useEffect(() => {
    const s = () => setSettings(getSettings()), k = () => bump(x => x + 1);
    const run = (e: Event) => { setForceShow(true); setOpen(true); window.setTimeout(() => send(String((e as CustomEvent).detail || '')), 150); };
    const op = () => { setForceShow(true); setOpen(true); };
    window.addEventListener(SETTINGS_EVENT, s); window.addEventListener(SKILLS_EVENT, k);
    window.addEventListener('yn-ai-run', run); window.addEventListener('yn-ai-open', op);
    return () => { window.removeEventListener(SETTINGS_EVENT, s); window.removeEventListener(SKILLS_EVENT, k); window.removeEventListener('yn-ai-run', run); window.removeEventListener('yn-ai-open', op); };
  }, [send]);
  useEffect(() => { const r = () => setVp({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useEffect(() => { if (open) { setToast(null); const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; } }, [log, open, busy]);
  useEffect(() => { if (open && !LOG.length) push('bot', `Online. I'm ${settings.name}. Ask me for numbers, tell me to open a page or click something — and touch the screen any time to stop me. Say “help” to see everything.`); }, [open]); // eslint-disable-line

  /* ---------- voice in ---------- */
  const once = useRef<any>(null);
  const wake = useRef<any>(null);
  const handsRef = useRef(false); handsRef.current = hands;
  const lang = navigator.language || 'en-US';
  const talk = () => {
    if (!SR) { push('err', 'Voice input is not supported in this browser (try Chrome, Edge or Safari).'); return; }
    engine.stop(); if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (!once.current) {
      const r = new SR(); r.lang = lang;
      r.onresult = (e: any) => send(e.results[0][0].transcript);
      r.onend = r.onerror = () => setListening(false);
      once.current = r;
    }
    setListening(true); try { once.current.start(); } catch { /* already started */ }
  };
  const toggleHands = () => {
    if (!SR) { push('err', 'Hands-free needs a browser with speech recognition (Chrome, Edge or Safari).'); return; }
    const on = !hands; setHands(on);
    if (!wake.current) {
      const r = new SR(); r.lang = lang; r.continuous = true;
      r.onresult = (e: any) => { const t: string = e.results[e.results.length - 1][0].transcript; if (t.toLowerCase().includes(settingsRef.current.name.toLowerCase())) { setOpen(true); send(t); } };
      r.onend = () => { if (handsRef.current) try { r.start(); } catch { /* ignore */ } };
      wake.current = r;
    }
    if (on) { try { wake.current.start(); } catch { /* ignore */ } push('bot', `Hands-free on. Start with “${settings.name}…”`); } else { try { wake.current.stop(); } catch { /* ignore */ } }
  };
  useEffect(() => () => { handsRef.current = false; try { wake.current?.stop(); } catch { /* ignore */ } }, []);

  /* ---------- drag the avatar anywhere ---------- */
  const px = useMemo(() => {
    const maxX = Math.max(0, vp.w - AVATAR), maxY = Math.max(0, vp.h - AVATAR);
    return pos ? { x: Math.min(maxX, Math.max(0, pos.fx * maxX)), y: Math.min(maxY, Math.max(0, pos.fy * maxY)) } : { x: maxX - 14, y: maxY - (vp.w < 900 ? 96 : 24) };
  }, [pos, vp]);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean; id: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: px.x, oy: px.y, moved: false, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 7) return;
    d.moved = true; setDragging(true);
    const maxX = Math.max(1, vp.w - AVATAR), maxY = Math.max(1, vp.h - AVATAR);
    setPos({ fx: Math.min(1, Math.max(0, (d.ox + dx) / maxX)), fy: Math.min(1, Math.max(0, (d.oy + dy) / maxY)) });
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; setDragging(false);
    if (!d) return;
    if (d.moved) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ } return; }
    if (performance.now() - engine.lastStopAt < 450) return; // this touch just stopped a task – don't also open/close the panel
    setOpen(o => !o);
  };

  /* ---------- panel placement: next to the avatar, always fully on screen; bottom sheet on phones ---------- */
  const narrow = vp.w < 560;
  const panelStyle: React.CSSProperties = useMemo(() => {
    if (narrow) return { left: 8, right: 8, bottom: 8, height: Math.min(vp.h * 0.78, 620) };
    const w = Math.min(400, vp.w - 24), h = Math.min(580, vp.h - 24);
    const above = px.y > h + 20 || px.y > vp.h - px.y - AVATAR;
    const top = above ? Math.max(12, px.y - h - 12) : Math.min(vp.h - h - 12, px.y + AVATAR + 12);
    const left = Math.min(vp.w - w - 12, Math.max(12, px.x + AVATAR / 2 - w / 2));
    return { left, top, width: w, height: Math.min(h, above ? px.y - 24 : vp.h - top - 12) };
  }, [narrow, px, vp]);

  const chips = useMemo(() => {
    const taught = getSkills().filter(s => s.enabled).map(s => s.triggers.find(t => !/[{}]/.test(t) && !/^\//.test(t))).filter(Boolean).slice(0, 3) as string[];
    return [...taught, 'pending orders', 'sales today', 'latest orders', 'open orders', 'dark mode', 'help'];
  }, [log, busy]); // eslint-disable-line

  if (!admin || isPreviewFrame() || !loc.pathname.startsWith('/admin')) return null;
  if (!settings.showAvatar && !forceShow) return null;

  const state: BotState = busy ? 'working' : listening ? 'listening' : talking ? 'talking' : 'idle';
  const statusText = busy ? 'Working… touch anywhere to stop' : listening ? 'Listening…' : talking ? 'Speaking…' : 'Ready';
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return createPortal(
    <div className={'aiRoot' + (open ? ' open' : '') + (busy ? ' busy' : '')}>
      {open && (
        <section className={'aiPanel' + (narrow ? ' sheet' : '')} style={panelStyle} role="dialog" aria-label="Assistant">
          <header className="aiHead">
            <span className="aiHeadBot"><BotFace state={state} /></span>
            <div className="aiHeadTxt"><b>{settings.name}</b><small className={busy ? 'work' : ''}>{statusText}</small></div>
            <button className={'aiIco' + (hands ? ' on' : '')} onClick={toggleHands} title={`Hands-free: say “${settings.name}…”`} aria-label="Hands-free">👂</button>
            <button className={'aiIco' + (settings.speak ? ' on' : '')} onClick={() => { const n = saveSettings({ speak: !settings.speak }); if (!n.speak && 'speechSynthesis' in window) speechSynthesis.cancel(); }} title="Speak replies" aria-label="Speak replies">{settings.speak ? <Volume2 /> : <VolumeX />}</button>
            <button className="aiIco" onClick={() => { LOG = []; sessionStorage.removeItem(LOG_KEY); setLog([]); }} title="Clear chat" aria-label="Clear chat"><Trash2 /></button>
            <button className="aiIco" onClick={() => { nav('/admin/assistant'); if (narrow) setOpen(false); }} title="Teach me new commands" aria-label="Teach"><GraduationCap /></button>
            <button className="aiIco" onClick={() => setOpen(false)} aria-label="Close"><X /></button>
          </header>
          <div className="aiLog" ref={logRef} aria-live="polite">
            {log.map(m => (
              <div key={m.id} className={'aiMsg ' + m.role} title={time(m.t)}>
                {m.role === 'act' ? <span>{m.text}</span> : urlify(m.text)}
                {(m.role === 'me' || m.role === 'bot') && <small>{time(m.t)}</small>}
              </div>
            ))}
            {busy && <div className="aiMsg bot typing"><i /><i /><i /></div>}
          </div>
          {busy && <div className="aiBusyBar"><span>Working — touch anywhere to stop</span><button onClick={() => engine.stop()}><Square /> Stop</button></div>}
          <div className="aiChips">{chips.map(c => <button key={c} onClick={() => send(c)}>{c}</button>)}</div>
          <form className="aiForm" onSubmit={e => { e.preventDefault(); const t = text; setText(''); send(t); }}>
            <button type="button" className={'aiMic' + (listening ? ' on' : '')} onClick={talk} aria-label="Talk"><Mic /></button>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Tell me what to do…" aria-label="Message" enterKeyHint="send" />
            {busy ? <button type="button" className="aiSend stop" onClick={() => engine.stop()} aria-label="Stop"><Square /></button> : <button className="aiSend" aria-label="Send" disabled={!text.trim()}><SendHorizontal /></button>}
          </form>
        </section>
      )}

      {!open && toast && (
        <div className="aiToast" style={{ left: Math.min(vp.w - 250, Math.max(8, px.x - 170)), top: px.y > 90 ? px.y - 8 : px.y + AVATAR + 8, transform: px.y > 90 ? 'translateY(-100%)' : 'none' }} onClick={() => setOpen(true)}>{toast.text.slice(0, 140)}</div>
      )}
      {!open && busy && <div className="aiPill" style={{ left: Math.max(8, Math.min(vp.w - 230, px.x - 80)), top: px.y > 40 ? px.y - 40 : px.y + AVATAR + 8 }}>Working… touch to stop</div>}

      <button
        className={'aiAvatar' + (dragging ? ' drag' : '') + ' s-' + state}
        style={{ transform: `translate3d(${px.x}px,${px.y}px,0)`, width: AVATAR, height: AVATAR }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        aria-label={open ? 'Close assistant' : 'Open assistant (drag to move)'}
      >
        <span className="aiFloat"><BotFace state={state} /></span>
      </button>
    </div>,
    document.body
  );
}
