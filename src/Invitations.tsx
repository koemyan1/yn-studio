import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Copy, ExternalLink, Save, ArrowLeft, Music2, Upload, X, Heart,
  Link2, Eye, EyeOff, RefreshCw, ImagePlus, MapPin, CalendarDays, Sparkles, Volume2, VolumeX, SkipForward,
} from 'lucide-react';
import { supabase } from './supabase';
import { optimizeImage } from './imageTools';
import './invitations.css';

/* =====================================================================================================
   Wedding e-invitation
   - Admin: /admin/invitations  (list + editor with live phone preview)
   - Guests: /i/<slug>          (public, no login, opens straight to the invitation)
   ===================================================================================================== */

export type OpenStyle = 'envelope' | 'curtains' | 'doors' | 'cover';
export type Lang = 'en' | 'km' | 'both';
export type KhFont = 'moul' | 'moulpali' | 'body';
type Song = { title: string; url: string };
type CeremonyItem = { name: string; date: string; time: string };
export type InviteData = {
  /* 1. Bride & groom */
  groom: string; bride: string; groomParents: string; brideParents: string;
  /* 2. Wedding details */
  date: string; weekday: string; time: string; receptionTime: string; venue: string; address: string; mapUrl: string;
  message: string; headline: string;
  /* 3. Ceremony schedule */
  schedule: CeremonyItem[];
  /* 4. Design */
  template: string; groomPhoto: string; bridePhoto: string; gallery: string[];
  lang: Lang;
  khFonts: { names: KhFont; title: KhFont; body: KhFont };
  look: { palette: string; accent: string; font: string };
  opening: { style: OpenStyle; image: string; title: string; button: string };
  butterflies: { enabled: boolean; count: number; size: number; color: string; mix: boolean };
  songs: Song[];
  /* 5. Contact (shown to guests as buttons) */
  phone: string; telegram: string;
};
/* Never shown to guests: kept in a separate admin-only table. */
type Private = { completionDate: string; requests: string; designerNotes: string };
const PRIVATE_DEFAULTS: Private = { completionDate: '', requests: '', designerNotes: '' };

/* Texts the admin has not changed follow the guest's language; texts the admin typed are shown as typed. */
const TXT = {
  km: { headline: 'យើងនឹងរៀបមង្គលការ', message: 'ជាមួយក្រុមគ្រួសារទាំងសងខាង យើងខ្ញុំមានសេចក្តីសោមនស្សរីករាយ សូមអញ្ជើញលោក លោកស្រី អ្នកនាង ចូលរួមជាភ្ញៀវកិត្តិយសក្នុងពិធីមង្គលការរបស់យើងខ្ញុំ។', otitle: 'សូមអញ្ជើញ', obtn: 'បើកសំបុត្រអញ្ជើញ' },
  en: { headline: 'We are getting married', message: 'Together with our families, we joyfully invite you to celebrate our wedding day.', otitle: 'You are invited', obtn: 'Open invitation' },
};
const loc = (value: string, key: 'headline' | 'message' | 'otitle' | 'obtn', lang: Lang) => {
  if (value && value !== TXT.km[key] && value !== TXT.en[key]) return value;
  if (lang === 'both') return key === 'message' ? `${TXT.km[key]}\n\n${TXT.en[key]}` : `${TXT.km[key]} · ${TXT.en[key]}`;
  return TXT[lang][key];
};

const DEFAULTS: InviteData = {
  groom: '', bride: '', groomParents: '', brideParents: '',
  date: '', weekday: '', time: '', receptionTime: '', venue: '', address: '', mapUrl: '',
  message: TXT.km.message, headline: TXT.km.headline,
  schedule: [],
  template: 'blush-garden', groomPhoto: '', bridePhoto: '', gallery: [],
  lang: 'km',
  khFonts: { names: 'moul', title: 'moulpali', body: 'body' },
  look: { palette: 'blush', accent: '', font: 'elegant' },
  opening: { style: 'envelope', image: '', title: TXT.km.otitle, button: TXT.km.obtn },
  butterflies: { enabled: true, count: 8, size: 34, color: '#f4a6c0', mix: true },
  songs: [],
  phone: '', telegram: '',
};

const PALETTES: Record<string, { name: string; bg: string; card: string; accent: string; text: string; soft: string }> = {
  blush: { name: 'Blush rose', bg: '#fff5f7', card: '#ffffff', accent: '#c25b7a', text: '#4a2b36', soft: '#f9dde5' },
  sage: { name: 'Sage garden', bg: '#f4f7f1', card: '#ffffff', accent: '#6f8f6b', text: '#2f3d2e', soft: '#dfe9da' },
  gold: { name: 'Ivory & gold', bg: '#fbf7ee', card: '#fffdf8', accent: '#b8893b', text: '#3d3220', soft: '#f1e6cc' },
  burgundy: { name: 'Burgundy', bg: '#fbf3f3', card: '#ffffff', accent: '#8a1f3d', text: '#3b1620', soft: '#f1d5da' },
  navy: { name: 'Midnight navy', bg: '#14213d', card: '#1d2d52', accent: '#e5c07b', text: '#f5efe0', soft: '#2a3b66' },
  lilac: { name: 'Lilac dream', bg: '#f7f3ff', card: '#ffffff', accent: '#7c3aed', text: '#2d2147', soft: '#e7dcfb' },
};
const FONTS: Record<string, { name: string; head: string; hg: string; script: string }> = {
  elegant: { name: 'Elegant', head: "'Playfair Display'", hg: 'serif', script: "'Great Vibes'" },
  romantic: { name: 'Romantic', head: "'Cormorant Garamond'", hg: 'serif', script: "'Parisienne'" },
  modern: { name: 'Modern', head: "'Outfit'", hg: 'sans-serif', script: "'Dancing Script'" },
};
/* Khmer letters use these. "Khmer OS Muol Light / Muol Pali" are used when the guest's device has them;
   otherwise Google's Moul / Moulpali (the same Muol style) are loaded from the web. */
const KH_FONTS: Record<KhFont, { name: string; sample: string; stack: string }> = {
  moul: { name: 'Khmer OS Muol Light', sample: 'សូមអញ្ជើញ', stack: "'Khmer OS Muol Light','Moul'" },
  moulpali: { name: 'Khmer OS Muol Pali', sample: 'កម្មវិធីមង្គលការ', stack: "'Khmer OS Muol Pali','Moulpali'" },
  body: { name: 'Khmer body text (easy to read)', sample: 'ជាមួយក្រុមគ្រួសារទាំងសងខាង', stack: "'Kantumruy Pro','Noto Serif Khmer'" },
};
const HAS_KHMER = /[\u1780-\u17FF]/;
const MIX_COLORS = ['#f4a6c0', '#f7c873', '#a9d6f5', '#c3a6f0', '#ffb3a1', '#9fe0c2'];

type Bf = InviteData['butterflies'];
/* One tap applies a whole look: colours, font, opening style and butterflies. The admin can still change each part after. */
const TEMPLATES: { id: string; name: string; hint: string; palette: string; font: string; style: OpenStyle; bf: Bf }[] = [
  { id: 'classic-gold', name: 'Classic Gold', hint: 'Ivory & gold, grand doors', palette: 'gold', font: 'elegant', style: 'doors', bf: { enabled: true, count: 6, size: 32, color: '#d8a94a', mix: false } },
  { id: 'blush-garden', name: 'Blush Garden', hint: 'Soft pink, envelope, many butterflies', palette: 'blush', font: 'romantic', style: 'envelope', bf: { enabled: true, count: 10, size: 34, color: '#f4a6c0', mix: true } },
  { id: 'royal-burgundy', name: 'Royal Burgundy', hint: 'Deep red, stage curtains', palette: 'burgundy', font: 'elegant', style: 'curtains', bf: { enabled: true, count: 5, size: 30, color: '#e8b4bc', mix: false } },
  { id: 'sage-garden', name: 'Sage Garden', hint: 'Fresh green, tap cover', palette: 'sage', font: 'romantic', style: 'cover', bf: { enabled: true, count: 12, size: 30, color: '#a9d6f5', mix: true } },
  { id: 'midnight', name: 'Midnight Navy', hint: 'Navy & gold, envelope', palette: 'navy', font: 'modern', style: 'envelope', bf: { enabled: true, count: 8, size: 30, color: '#e5c07b', mix: false } },
  { id: 'lilac-dream', name: 'Lilac Dream', hint: 'Lavender, tap cover', palette: 'lilac', font: 'modern', style: 'cover', bf: { enabled: true, count: 9, size: 34, color: '#c3a6f0', mix: true } },
];

const OPEN_STYLES: { id: OpenStyle; name: string; hint: string }[] = [
  { id: 'envelope', name: 'Envelope', hint: 'A sealed envelope opens and the card rises out.' },
  { id: 'curtains', name: 'Curtains', hint: 'Stage curtains slide apart over your picture.' },
  { id: 'doors', name: 'Grand doors', hint: 'Your picture splits in two like double doors.' },
  { id: 'cover', name: 'Tap cover', hint: 'A full-screen picture with a button; zooms into the invitation.' },
];

const CEREMONY_SUGGESTIONS = ['ពិធីសូត្រមន្ត', 'ពិធីជាវខាន់ស្លា', 'ពិធីហែជំនូន', 'ពិធីចងដៃ', 'ពិធីកាត់សក់', 'ពិធីពិសាភោជនាហារ'];

const L_KM = { save: 'កក់ថ្ងៃទុក', when: 'ពេលវេលា', where: 'ទីកន្លែង', map: 'បើកផែនទី', call: 'ទូរស័ព្ទមក', telegram: 'Telegram', program: 'កម្មវិធីមង្គលការ', gallery: 'ពេលវេលារបស់យើង', days: 'ថ្ងៃ', hours: 'ម៉ោង', mins: 'នាទី', secs: 'វិនាទី', thanks: 'យើងរង់ចាំអបអរសាទរជាមួយអ្នក', soon: 'ថ្ងៃសំខាន់បានមកដល់ហើយ!', ph: 'ដំណើរការដោយ YN Studio', reception: 'ពិសាភោជនាហារ', groomSide: 'កូនកំលោះ', brideSide: 'កូនក្រមុំ', sonOf: 'កូនប្រុសរបស់', daughterOf: 'កូនស្រីរបស់', groomWord: 'កូនកំលោះ', brideWord: 'កូនក្រមុំ', music: 'តន្ត្រី' };
const L_EN = { save: 'Save the date', when: 'When', where: 'Where', map: 'Open map', call: 'Call us', telegram: 'Telegram', program: 'Wedding programme', gallery: 'Our moments', days: 'Days', hours: 'Hours', mins: 'Mins', secs: 'Secs', thanks: 'We can’t wait to celebrate with you', soon: 'The big day is here!', ph: 'Powered by YN Studio', reception: 'Reception', groomSide: 'The groom', brideSide: 'The bride', sonOf: 'Son of', daughterOf: 'Daughter of', groomWord: 'Groom', brideWord: 'Bride', music: 'Music' };
type Labels = typeof L_KM;
function labelsFor(lang: Lang): Labels {
  if (lang === 'km') return L_KM;
  if (lang === 'en') return L_EN;
  const out: any = {};
  (Object.keys(L_KM) as (keyof Labels)[]).forEach(k => { out[k] = k === 'telegram' ? 'Telegram' : `${L_KM[k]} · ${L_EN[k]}`; });
  return out;
}

/* ---- dates & times written by hand (does not depend on the phone's Khmer locale data) ---- */
const KH_DIGITS = '០១២៣៤៥៦៧៨៩';
const khNum = (n: number | string) => String(n).replace(/\d/g, c => KH_DIGITS[+c]);
const KH_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const KH_WD = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
const EN_WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const parseDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const wd = new Date(y, mo - 1, d).getDay();
  return Number.isNaN(wd) ? null : { y, mo, d, wd };
};
const autoWeekday = (date: string) => { const p = parseDate(date); return p ? 'ថ្ងៃ' + KH_WD[p.wd] : ''; };
const isAutoWeekday = (v: string) => !v || KH_WD.some(w => 'ថ្ងៃ' + w === v) || EN_WD.includes(v);
const weekdayText = (date: string, custom: string, lang: 'km' | 'en') => {
  const p = parseDate(date);
  if (custom && !isAutoWeekday(custom)) return custom;
  if (!p) return custom && isAutoWeekday(custom) ? custom : '';
  return lang === 'km' ? 'ថ្ងៃ' + KH_WD[p.wd] : EN_WD[p.wd];
};
function fmtDate(date: string, custom: string, lang: Lang): string {
  const p = parseDate(date); if (!p) return date || '';
  const one = (l: 'km' | 'en') => {
    const wd = weekdayText(date, custom, l);
    return l === 'km' ? `${wd ? wd + ' ' : ''}ទី${khNum(p.d)} ខែ${KH_MONTHS[p.mo - 1]} ឆ្នាំ${khNum(p.y)}` : `${wd ? wd + ', ' : ''}${EN_MONTHS[p.mo - 1]} ${p.d}, ${p.y}`;
  };
  return lang === 'both' ? `${one('km')}\n${one('en')}` : one(lang);
}
function fmtShort(date: string, lang: Lang): string {
  const p = parseDate(date); if (!p) return '';
  const km = `ទី${khNum(p.d)} ខែ${KH_MONTHS[p.mo - 1]}`, en = `${EN_MONTHS[p.mo - 1].slice(0, 3)} ${p.d}`;
  return lang === 'km' ? km : lang === 'en' ? en : `${km} · ${en}`;
}
function fmtTime(t: string, lang: Lang): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h)) return t;
  const hh = `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')}`;
  const km = `${khNum(hh)} ${h < 12 ? 'ព្រឹក' : h < 17 ? 'រសៀល' : h < 20 ? 'ល្ងាច' : 'យប់'}`;
  const en = `${hh} ${h >= 12 ? 'PM' : 'AM'}`;
  return lang === 'km' ? km : lang === 'en' ? en : `${km} · ${en}`;
}

const merge = (raw: any): InviteData => ({
  ...DEFAULTS, ...(raw || {}),
  look: { ...DEFAULTS.look, ...(raw?.look || {}) },
  khFonts: { ...DEFAULTS.khFonts, ...(raw?.khFonts || {}) },
  opening: { ...DEFAULTS.opening, ...(raw?.opening || {}) },
  butterflies: { ...DEFAULTS.butterflies, ...(raw?.butterflies || {}) },
  songs: Array.isArray(raw?.songs) ? raw.songs : [],
  gallery: Array.isArray(raw?.gallery) ? raw.gallery : [],
  /* older invitations stored {time,label}; keep them working */
  schedule: Array.isArray(raw?.schedule) ? raw.schedule.map((x: any) => ({ name: x?.name ?? x?.label ?? '', date: x?.date ?? '', time: x?.time ?? '' })) : [],
});

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const randomTail = () => Math.random().toString(36).slice(2, 6);
const inviteUrl = (slug: string) => `${window.location.origin}/i/${slug}`;
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);

let fontsLoaded = false;
function useInviteFonts() {
  useEffect(() => {
    if (fontsLoaded) return;
    fontsLoaded = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Great+Vibes&family=Cormorant+Garamond:wght@400;600;700&family=Parisienne&family=Dancing+Script:wght@500;700&family=Kantumruy+Pro:wght@400;600;700&family=Moul&family=Moulpali&family=Noto+Serif+Khmer:wght@400;600&display=swap';
    document.head.appendChild(l);
  }, []);
}

function themeVars(d: InviteData): React.CSSProperties {
  const p = PALETTES[d.look.palette] || PALETTES.blush;
  const f = FONTS[d.look.font] || FONTS.elegant;
  const accent = /^#[0-9a-f]{6}$/i.test(d.look.accent) ? d.look.accent : p.accent;
  const kf = { ...DEFAULTS.khFonts, ...(d.khFonts || {}) };
  /* Latin font first, then the chosen Khmer font for Khmer letters, then a generic family */
  return {
    ['--iv-bg' as any]: p.bg, ['--iv-card' as any]: p.card, ['--iv-text' as any]: p.text, ['--iv-soft' as any]: p.soft,
    ['--iv-accent' as any]: accent,
    ['--iv-head' as any]: `${f.head},${KH_FONTS[kf.body].stack},${f.hg}`,
    ['--iv-names' as any]: `${f.script},${KH_FONTS[kf.names].stack},cursive`,
    ['--iv-title' as any]: `${f.script},${KH_FONTS[kf.title].stack},cursive`,
  };
}

/* ------------------------------------------------------------------ Butterflies ------------------------------------------------------------------ */

function Butterfly({ color, size, seed }: { color: string; size: number; seed: number }) {
  const style = useMemo(() => {
    const r = (n: number) => { const x = Math.sin(seed * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
    const pts: Record<string, string> = {};
    for (let i = 0; i < 5; i++) { pts[`--x${i}`] = String(Math.round(r(i * 2 + 1) * 100)); pts[`--y${i}`] = String(Math.round(r(i * 2 + 2) * 100)); }
    return {
      ...pts, width: size, height: size * 0.85,
      ['--dur' as any]: `${22 + Math.round(r(11) * 22)}s`,
      ['--delay' as any]: `-${Math.round(r(12) * 30)}s`,
      ['--flap' as any]: `${0.22 + r(13) * 0.2}s`,
      ['--tilt' as any]: `${Math.round(r(14) * 30 - 15)}deg`,
    } as React.CSSProperties;
  }, [seed, size]);
  return (
    <div className="ivBfPath" style={style} aria-hidden="true">
      <div className="ivBfBob">
        <svg viewBox="0 0 80 64" width="100%" height="100%">
          <g className="ivWing ivWingL"><path d="M40 30 C22 2 3 6 6 24 C8 38 24 42 40 34 Z" fill={color} /><path d="M40 36 C28 36 14 44 20 56 C26 66 38 50 40 38 Z" fill={color} opacity=".85" /><circle cx="19" cy="22" r="5" fill="#fff" opacity=".45" /></g>
          <g className="ivWing ivWingR"><path d="M40 30 C58 2 77 6 74 24 C72 38 56 42 40 34 Z" fill={color} /><path d="M40 36 C52 36 66 44 60 56 C54 66 42 50 40 38 Z" fill={color} opacity=".85" /><circle cx="61" cy="22" r="5" fill="#fff" opacity=".45" /></g>
          <ellipse cx="40" cy="34" rx="2.6" ry="13" fill="#3b2a33" />
          <path d="M39 22 C36 12 32 10 30 8 M41 22 C44 12 48 10 50 8" stroke="#3b2a33" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function Butterflies({ cfg }: { cfg: InviteData['butterflies'] }) {
  if (!cfg.enabled || cfg.count < 1) return null;
  const n = Math.max(1, Math.min(24, Math.round(cfg.count)));
  return (
    <div className="ivButterflies" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <Butterfly key={i} seed={i + 1} size={Math.max(18, Math.min(80, cfg.size)) * (0.75 + ((i * 37) % 10) / 20)} color={cfg.mix ? MIX_COLORS[i % MIX_COLORS.length] : cfg.color} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Opening scene ------------------------------------------------------------------ */

function OpeningScene({ d, onOpen, onGone }: { d: InviteData; onOpen: () => void; onGone: () => void }) {
  const [phase, setPhase] = useState<'closed' | 'opening' | 'gone'>('closed');
  const L = labelsFor(d.lang);
  const img = d.opening.image;
  const names = [d.groom, d.bride].filter(Boolean).join(' & ') || (d.lang === 'en' ? 'Groom & Bride' : 'កូនកំលោះ & កូនក្រមុំ');
  const open = () => {
    if (phase !== 'closed') return;
    setPhase('opening');
    onOpen();
    window.setTimeout(() => { setPhase('gone'); onGone(); }, d.opening.style === 'envelope' ? 2600 : 2100);
  };
  if (phase === 'gone') return null;
  const st = d.opening.style;
  const bg: React.CSSProperties = img ? { backgroundImage: `url("${img}")` } : {};
  const btn = loc(d.opening.button, 'obtn', d.lang);
  const otitle = loc(d.opening.title, 'otitle', d.lang);
  return (
    <div className={`ivOpen ivOpen-${st} ${phase === 'opening' ? 'go' : ''}`} role="dialog" aria-label="Invitation cover">
      <div className="ivOpenBg" style={bg} />
      <div className="ivOpenShade" />

      {st === 'curtains' && <><div className="ivCurtain ivCurtainL" /><div className="ivCurtain ivCurtainR" /></>}
      {st === 'doors' && <><div className="ivDoor ivDoorL" style={bg}><i /></div><div className="ivDoor ivDoorR" style={bg}><i /></div></>}

      {st === 'envelope' ? (
        <div className="ivEnvStage">
          <p className="ivOpenKicker">{otitle}</p>
          <div className="ivEnv" onClick={open} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && open()}>
            <div className="ivEnvCard"><small>{L.save.split(' · ')[0]}</small><b>{names}</b></div>
            <div className="ivEnvBack" />
            <div className="ivEnvFront" />
            <div className="ivEnvFlap" />
            <button type="button" className="ivSeal" aria-label={btn}><Heart fill="currentColor" /></button>
          </div>
          <button type="button" className="ivOpenBtn" onClick={open}>{btn}</button>
        </div>
      ) : (
        <div className="ivOpenCenter">
          <p className="ivOpenKicker">{otitle}</p>
          <h2 className={'ivOpenNames' + (HAS_KHMER.test(names) || (!d.groom && !d.bride && d.lang !== 'en') ? ' ivKh' : '')}>{names}</h2>
          <button type="button" className="ivOpenBtn" onClick={open}><Heart /> {btn}</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Invitation page ------------------------------------------------------------------ */

function useCountdown(target: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!target) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [target]);
  if (!target) return null;
  const s = Math.max(0, Math.floor((target - now) / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), mins: Math.floor((s % 3600) / 60), secs: s % 60, over: s === 0 };
}

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!('IntersectionObserver' in window)) { setOn(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`ivReveal ${on ? 'on' : ''} ${className}`}>{children}</div>;
}

export function InvitationView({ data, preview = false, replayKey = 0, onViewed }: { data: InviteData; preview?: boolean; replayKey?: number; onViewed?: () => void }) {
  useInviteFonts();
  /* Guests start in the invitation's language (Khmer by default) and can switch, unless it is set to bilingual. */
  const [lang, setLang] = useState<Lang>(data.lang);
  useEffect(() => { setLang(data.lang); }, [data.lang]);
  const d = useMemo(() => ({ ...data, lang }), [data, lang]);
  const L = labelsFor(lang);
  const [opened, setOpened] = useState(false);
  const [gone, setGone] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const songs = d.songs.filter(s => s.url);

  /* a new "replay" resets the scene (used by the admin preview) */
  useEffect(() => { setOpened(false); setGone(false); setPlaying(false); setTrack(0); audio.current?.pause(); }, [replayKey, d.opening.style]);
  useEffect(() => { if (onViewed) onViewed(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* keep the audio element in step with the playlist */
  useEffect(() => {
    const a = audio.current; if (!a || !songs.length) return;
    const url = songs[Math.min(track, songs.length - 1)].url;
    if (a.src !== url) { a.src = url; if (playing) a.play().catch(() => setPlaying(false)); }
  }, [track, songs.map(s => s.url).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { audio.current?.pause(); }, []);

  const startMusic = useCallback(() => {
    const a = audio.current; if (!a || !songs.length) return;
    a.src = songs[0].url; a.volume = 0.85;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [songs.map(s => s.url).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMusic = () => {
    const a = audio.current; if (!a) return;
    if (a.paused) { if (!a.src) a.src = songs[0].url; a.play().then(() => setPlaying(true)).catch(() => {}); } else { a.pause(); setPlaying(false); }
  };
  const nextSong = () => { if (songs.length > 1) setTrack(t => (t + 1) % songs.length); };
  const onEnded = () => { if (songs.length > 1) { setTrack(t => (t + 1) % songs.length); setPlaying(true); } else { const a = audio.current; if (a) { a.currentTime = 0; a.play().catch(() => {}); } } };
  useEffect(() => { const a = audio.current; if (a && playing && a.paused && a.src) a.play().catch(() => {}); }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = useMemo(() => {
    if (!d.date) return null;
    const t = new Date(`${d.date}T${d.time || '09:00'}:00`).getTime();
    return Number.isFinite(t) ? t : null;
  }, [d.date, d.time]);
  const cd = useCountdown(target);

  const dateCard = fmtDate(d.date, d.weekday, lang);
  const dateHero = fmtDate(d.date, d.weekday, lang === 'both' ? 'km' : lang);
  const timeText = fmtTime(d.time, lang);
  const recText = fmtTime(d.receptionTime, lang);
  const venueText = [d.venue, d.address].filter(Boolean);
  const names = [d.groom, d.bride];
  const heroImg = d.gallery[0] || d.opening.image;
  const hasCouple = !!(d.groomPhoto || d.bridePhoto || d.groomParents || d.brideParents);
  const tg = d.telegram.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
  const events = d.schedule.filter(e => e.name);

  return (
    <div className={`ivRoot ${preview ? 'ivPreview' : ''}`} data-kh={lang !== 'en' ? '1' : '0'} style={themeVars(d)}>
      <div className={`ivScroll ${gone ? '' : 'ivLocked'}`}>
        <section className="ivHero" style={heroImg ? { backgroundImage: `url("${heroImg}")` } : undefined}>
          <div className="ivHeroShade" />
          <div className="ivHeroIn">
            <p className="ivKicker">{loc(d.headline, 'headline', lang)}</p>
            <h1 className={'ivNames' + (HAS_KHMER.test(names.join('')) || (!names[0] && !names[1] && lang !== 'en') ? ' ivKh' : '')}>
              <span>{names[0] || L.groomWord.split(' · ')[0]}</span>
              <em>&amp;</em>
              <span>{names[1] || L.brideWord.split(' · ')[0]}</span>
            </h1>
            {dateHero && <p className="ivHeroDate"><CalendarDays /> {dateHero}{timeText ? ` · ${lang === 'both' ? fmtTime(d.time, 'km') : timeText}` : ''}</p>}
          </div>
          <div className="ivScrollHint" aria-hidden="true"><i /></div>
        </section>

        {hasCouple && (
          <Reveal className="ivSec ivCouple">
            {([['groom', d.groomPhoto, d.groom, d.groomParents, L.sonOf, L.groomSide], ['bride', d.bridePhoto, d.bride, d.brideParents, L.daughterOf, L.brideSide]] as const).map(([k, photo, nm, par, rel, side]) => (
              <div className="ivPerson" key={k}>
                <div className={'ivAvatar' + (photo ? '' : ' empty')} style={photo ? { backgroundImage: `url("${photo}")` } : undefined}>{!photo && <Heart />}</div>
                <b>{nm || side}</b>
                {par && <small>{rel}<br />{par}</small>}
              </div>
            ))}
          </Reveal>
        )}

        <Reveal className="ivSec"><p className="ivMessage">{loc(d.message, 'message', lang)}</p></Reveal>

        {cd && !cd.over && (
          <Reveal className="ivSec ivCount">
            <h3>{L.save}</h3>
            <div className="ivCountRow">
              {([['days', cd.days], ['hours', cd.hours], ['mins', cd.mins], ['secs', cd.secs]] as const).map(([k, v]) => <div key={k}><b>{lang === 'km' ? khNum(String(v).padStart(2, '0')) : String(v).padStart(2, '0')}</b><small>{(L as any)[k]}</small></div>)}
            </div>
          </Reveal>
        )}
        {cd?.over && <Reveal className="ivSec"><h3 className="ivBig">{L.soon}</h3></Reveal>}

        {(dateCard || venueText.length > 0 || recText) && (
          <Reveal className="ivSec ivDetails">
            {(dateCard || timeText) && <div className="ivCard"><CalendarDays /><small>{L.when}</small><b>{dateCard}</b>{timeText && <span>{timeText}</span>}</div>}
            {recText && <div className="ivCard"><Heart /><small>{L.reception}</small><b>{recText}</b></div>}
            {venueText.length > 0 && (
              <div className="ivCard"><MapPin /><small>{L.where}</small><b>{venueText[0]}</b>{venueText[1] && <span>{venueText[1]}</span>}
                <div className="ivBtnRow">
                  {d.mapUrl && <a className="ivLink" href={d.mapUrl} target="_blank" rel="noopener noreferrer">{L.map}</a>}
                </div>
              </div>
            )}
          </Reveal>
        )}

        {events.length > 0 && (
          <Reveal className="ivSec">
            <h3>{L.program}</h3>
            <ol className="ivTimeline">{events.map((e, i) => (
              <li key={i}><div className="ivWhen"><b>{fmtTime(e.time, lang)}</b><small>{fmtShort(e.date, lang)}</small></div><span>{e.name}</span></li>
            ))}</ol>
          </Reveal>
        )}

        {d.gallery.length > 1 && (
          <Reveal className="ivSec">
            <h3>{L.gallery}</h3>
            <div className="ivGallery">{d.gallery.slice(1).map((u, i) => <img key={u + i} src={u} alt="" loading="lazy" />)}</div>
          </Reveal>
        )}

        {(d.phone || tg) && (
          <Reveal className="ivSec"><div className="ivBtnRow">
            {d.phone && <a className="ivLink" href={`tel:${d.phone.replace(/[^+\d]/g, '')}`}>{L.call}</a>}
            {tg && <a className="ivLink ivGhost" href={`https://t.me/${tg}`} target="_blank" rel="noopener noreferrer">Telegram</a>}
          </div></Reveal>
        )}

        <Reveal className="ivSec ivEnd"><Heart fill="currentColor" /><p>{L.thanks}</p><small>{L.ph}</small></Reveal>
      </div>

      <Butterflies cfg={d.butterflies} />
      {data.lang !== 'both' && (
        <button type="button" className="ivLang" onClick={() => setLang(lang === 'km' ? 'en' : 'km')} aria-label="Change language">
          <b className={lang === 'km' ? 'on' : ''}>ខ្មែរ</b><b className={lang === 'en' ? 'on' : ''}>EN</b>
        </button>
      )}

      {songs.length > 0 && opened && (
        <div className="ivMusic">
          <button type="button" onClick={toggleMusic} aria-label={playing ? 'Pause music' : 'Play music'}>{playing ? <Volume2 /> : <VolumeX />}</button>
          <span title={songs[Math.min(track, songs.length - 1)]?.title}><Music2 /> {songs[Math.min(track, songs.length - 1)]?.title || L.music.split(' · ')[0]}</span>
          {songs.length > 1 && <button type="button" onClick={nextSong} aria-label="Next song"><SkipForward /></button>}
        </div>
      )}
      <audio ref={audio} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded} playsInline />

      {!gone && <OpeningScene key={replayKey + d.opening.style} d={d} onOpen={() => { setOpened(true); startMusic(); }} onGone={() => setGone(true)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Public page (no login) ------------------------------------------------------------------ */

export function InvitePublic() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [data, setData] = useState<InviteData>(DEFAULTS);
  const [title, setTitle] = useState('Wedding invitation');

  useEffect(() => {
    document.body.classList.add('ivPublicBody');
    return () => document.body.classList.remove('ivPublicBody');
  }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      const r = await supabase.from('wedding_invitations').select('title,data,published').eq('slug', slug.toLowerCase()).eq('published', true).maybeSingle();
      if (!live) return;
      if (r.error || !r.data) { setState('missing'); return; }
      const merged = merge(r.data.data);
      setData(merged); setTitle(r.data.title || 'Wedding invitation'); setState('ok');
      const names = [merged.groom, merged.bride].filter(Boolean).join(' & ');
      document.title = names ? `${names} · Wedding invitation` : r.data.title || 'Wedding invitation';
    })();
    return () => { live = false; };
  }, [slug]);

  const countView = useCallback(() => {
    try {
      const k = 'yn-inv-seen-' + slug;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
      supabase.rpc('invitation_count_view', { p_slug: slug }).then(() => {}, () => {});
    } catch { /* ignore */ }
  }, [slug]);

  if (state === 'loading') return <div className="ivMissing"><Heart /><p>Loading your invitation…</p></div>;
  if (state === 'missing') return <div className="ivMissing"><Heart /><h2>Invitation not found</h2><p>This link may be wrong or the invitation is not published yet.</p><small>{title}</small></div>;
  return <InvitationView data={data} onViewed={countView} />;
}

/* ------------------------------------------------------------------ Admin ------------------------------------------------------------------ */

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Row = { id: string; slug: string; title: string; published: boolean; data: any; views: number; created_at: string; updated_at: string };

async function uploadAsset(file: File, folder: string, kind: 'image' | 'audio'): Promise<string> {
  let f = file;
  if (kind === 'image') f = await optimizeImage(file, 1600);
  else if (f.size > 15 * 1024 * 1024) throw new Error('That song is over 15 MB. Please use a smaller MP3.');
  const path = `${folder}/${crypto.randomUUID()}-${safeName(f.name)}`;
  const up = await supabase.storage.from('invitation-assets').upload(path, f, { upsert: false, contentType: f.type || undefined, cacheControl: '31536000' });
  if (up.error) throw new Error(/not found|bucket/i.test(up.error.message) ? 'Run supabase-wedding-invitations.sql first (storage bucket missing).' : up.error.message);
  return supabase.storage.from('invitation-assets').getPublicUrl(path).data.publicUrl;
}

export function AdminInvitations({ Shell }: { Shell: Shell }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);

  const load = useCallback(async () => {
    const r = await supabase.from('wedding_invitations').select('*').order('created_at', { ascending: false });
    if (r.error) { setErr(/wedding_invitations|schema cache|relation/i.test(r.error.message) ? 'Run supabase/sql/supabase-wedding-invitations.sql in Supabase → SQL Editor first.' : r.error.message); setRows([]); return; }
    setErr(''); setRows((r.data || []) as Row[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(x: Row) {
    if (!confirm(`Delete “${x.title}”? Its link will stop working.`)) return;
    const r = await supabase.from('wedding_invitations').delete().eq('id', x.id);
    if (r.error) alert(r.error.message); else load();
  }
  async function togglePublish(x: Row) {
    const r = await supabase.from('wedding_invitations').update({ published: !x.published }).eq('id', x.id);
    if (r.error) alert(r.error.message); else load();
  }
  const copy = async (slug: string) => { try { await navigator.clipboard.writeText(inviteUrl(slug)); alert('Link copied:\n' + inviteUrl(slug)); } catch { prompt('Copy this link', inviteUrl(slug)); } };

  if (editing) return <Shell title="Wedding invitation"><InviteEditor row={editing === 'new' ? null : editing} onClose={() => { setEditing(null); load(); }} /></Shell>;

  return (
    <Shell title="Wedding Invitations">
      <div className="toolbar"><button onClick={() => setEditing('new')}><Plus /> New invitation</button></div>
      {err && <p className="notice">{err}</p>}
      <div className="table">
        {(rows || []).map(x => (
          <div className="tr ivRow" key={x.id}>
            <div className="ivRowThumb" style={x.data?.opening?.image ? { backgroundImage: `url("${x.data.opening.image}")` } : undefined}><Heart /></div>
            <div className="grow"><b>{x.title}</b><small>/i/{x.slug} · {x.views} opens</small></div>
            <span className={'status ' + (x.published ? 'published' : 'unpublished')}>{x.published ? 'live' : 'draft'}</span>
            <button className="secondary" onClick={() => copy(x.slug)} title="Copy link"><Copy /><span>Copy link</span></button>
            {x.published && <a className="secondary button" href={inviteUrl(x.slug)} target="_blank" rel="noopener noreferrer" title="Open"><ExternalLink /></a>}
            <button className="secondary" onClick={() => togglePublish(x)}>{x.published ? <><EyeOff />Unpublish</> : <><Eye />Publish</>}</button>
            <button className="editProductButton" onClick={() => setEditing(x)}><Pencil /><span>Edit</span></button>
            <button className="icon danger" onClick={() => remove(x)} title="Delete"><Trash2 /></button>
          </div>
        ))}
        {rows && !rows.length && !err && <p className="muted" style={{ padding: 20 }}>No invitations yet. Press “New invitation” to design the first one.</p>}
      </div>
    </Shell>
  );
}

function Card({ title, icon, children, open = false }: { title: string; icon?: React.ReactNode; children: React.ReactNode; open?: boolean }) {
  return <details className="panel ivCardAdmin" open={open}><summary>{icon}<b>{title}</b></summary><div className="ivCardBody">{children}</div></details>;
}

function Sub({ children }: { children: React.ReactNode }) { return <h4 className="ivSubHead">{children}</h4>; }

function PhotoTile({ label, url, busy, onFile, onClear }: { label: string; url: string; busy: boolean; onFile: (f: File) => void; onClear: () => void }) {
  return (
    <div className="ivPhotoTile">
      <div className="ivPickThumb" style={url ? { backgroundImage: `url("${url}")` } : undefined}>{!url && <ImagePlus />}</div>
      <b>{label}</b>
      <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
        <label className="button secondary ivUpload"><Upload /> {busy ? '…' : 'Upload'}
          <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} /></label>
        {url && <button className="secondary" onClick={onClear} aria-label="Remove"><X /></button>}
      </div>
    </div>
  );
}

function InviteEditor({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const [id, setId] = useState<string | null>(row?.id || null);
  const [data, setData] = useState<InviteData>(() => merge(row?.data));
  const [priv, setPriv] = useState<Private>(PRIVATE_DEFAULTS);
  const [title, setTitle] = useState(row?.title || '');
  const [slug, setSlug] = useState(row?.slug || '');
  const [published, setPublished] = useState(row?.published ?? false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [replay, setReplay] = useState(0);
  const [qr, setQr] = useState('');
  const [dirty, setDirty] = useState(false);
  const slugTouched = useRef(!!row);

  const set = (patch: Partial<InviteData>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
  const setIn = <K extends 'look' | 'opening' | 'butterflies'>(k: K, patch: Partial<InviteData[K]>) => { setData(d => ({ ...d, [k]: { ...d[k], ...patch } })); setDirty(true); };
  const setP = (patch: Partial<Private>) => { setPriv(p => ({ ...p, ...patch })); setDirty(true); };

  /* the private part (completion date, requests, designer notes) lives in its own admin-only table */
  useEffect(() => {
    if (!row?.id) return;
    supabase.from('wedding_invitation_private').select('data').eq('invitation_id', row.id).maybeSingle()
      .then((r: any) => { if (r?.data?.data) setPriv({ ...PRIVATE_DEFAULTS, ...r.data.data }); }, () => {});
  }, [row?.id]);

  /* suggest a link from the names until the admin edits it themselves */
  useEffect(() => {
    if (slugTouched.current) return;
    const base = slugify([data.groom, data.bride].filter(Boolean).join('-'));
    if (base) setSlug(s => (s && s.startsWith(base) ? s : `${base}-${randomTail()}`));
  }, [data.groom, data.bride]);
  useEffect(() => { if (!title && (data.groom || data.bride)) setTitle(`${[data.groom, data.bride].filter(Boolean).join(' & ')} wedding`); }, [data.groom, data.bride]); // eslint-disable-line react-hooks/exhaustive-deps

  /* weekday follows the date automatically until the admin types their own */
  const onDate = (date: string) => { setData(d => ({ ...d, date, weekday: isAutoWeekday(d.weekday) ? autoWeekday(date) : d.weekday })); setDirty(true); };

  const link = slug ? inviteUrl(slug) : '';
  useEffect(() => {
    let live = true;
    if (!link || !id) { setQr(''); return; }
    import('qrcode').then(m => (m as any).toDataURL(link, { margin: 1, width: 360 })).then((u: string) => { if (live) setQr(u); }).catch(() => {});
    return () => { live = false; };
  }, [link, id]);

  async function pick(file: File | undefined, kind: 'image' | 'audio', onUrl: (u: string) => void, label: string) {
    if (!file) return;
    setBusy(label); setNote('');
    try { onUrl(await uploadAsset(file, kind === 'image' ? 'pictures' : 'songs', kind)); }
    catch (e: any) { setNote(e?.message || 'Upload failed.'); }
    setBusy('');
  }

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setData(d => ({ ...d, template: t.id, look: { ...d.look, palette: t.palette, font: t.font, accent: '' }, opening: { ...d.opening, style: t.style }, butterflies: { ...t.bf } }));
    setDirty(true); setReplay(n => n + 1);
  }

  async function save(nextPublished = published) {
    const clean = slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(clean)) { setNote('The link needs 3+ letters, numbers or dashes (no spaces).'); return; }
    setBusy('Saving…'); setNote('');
    const payload = { slug: clean, title: title.trim() || 'Wedding invitation', published: nextPublished, data };
    const r = id
      ? await supabase.from('wedding_invitations').update(payload).eq('id', id).select().single()
      : await supabase.from('wedding_invitations').insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id }).select().single();
    if (r.error) {
      setBusy('');
      setNote(r.error.code === '23505' ? 'That link is already used by another invitation. Change it a little.' : /wedding_invitations|schema cache/i.test(r.error.message) ? 'Run supabase-wedding-invitations.sql in Supabase first.' : r.error.message);
      return;
    }
    const newId = (r.data as any).id as string;
    const pr = await supabase.from('wedding_invitation_private').upsert({ invitation_id: newId, data: priv }, { onConflict: 'invitation_id' });
    setBusy('');
    setId(newId); setSlug(clean); setPublished(nextPublished); setDirty(false);
    setNote(pr.error ? 'Saved, but the private notes were not saved. Run the latest supabase-wedding-invitations.sql, then save again.' : nextPublished ? 'Saved. The link is live.' : 'Saved as draft.');
  }
  const copyLink = async () => { try { await navigator.clipboard.writeText(link); setNote('Link copied.'); } catch { prompt('Copy this link', link); } };
  const back = () => { if (!dirty || confirm('Leave without saving your changes?')) onClose(); };

  const updSong = (i: number, p: Partial<Song>) => set({ songs: data.songs.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const updEv = (i: number, p: Partial<CeremonyItem>) => set({ schedule: data.schedule.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const addEv = (name = '') => set({ schedule: [...data.schedule, { name, date: data.date, time: '' }] });

  return (
    <div className="ivEditor">
      <div className="ivForm">
        <div className="ivTopBar">
          <button className="secondary" onClick={back}><ArrowLeft /> Back</button>
          <div className="grow" />
          <button onClick={() => save()} disabled={!!busy}><Save /> {busy || 'Save'}</button>
        </div>
        {note && <p className="notice">{note}</p>}

        {/* 1 ----------------------------------------------------------- */}
        <Card title="1. Bride & Groom Information" icon={<Heart />} open>
          <div className="two">
            <label>Groom's full name (ឈ្មោះកូនកំលោះ)<input value={data.groom} onChange={e => set({ groom: e.target.value })} /></label>
            <label>Bride's full name (ឈ្មោះកូនក្រមុំ)<input value={data.bride} onChange={e => set({ bride: e.target.value })} /></label>
          </div>
          <div className="two">
            <label>Groom's parents' names (ឈ្មោះឪពុកម្តាយខាងកូនកំលោះ)<textarea rows={2} value={data.groomParents} onChange={e => set({ groomParents: e.target.value })} placeholder="លោក … និង លោកស្រី …" /></label>
            <label>Bride's parents' names (ឈ្មោះឪពុកម្តាយខាងកូនក្រមុំ)<textarea rows={2} value={data.brideParents} onChange={e => set({ brideParents: e.target.value })} placeholder="លោក … និង លោកស្រី …" /></label>
          </div>
        </Card>

        {/* 2 ----------------------------------------------------------- */}
        <Card title="2. Wedding Details" icon={<CalendarDays />} open>
          <div className="two">
            <label>Wedding date (ថ្ងៃខែឆ្នាំរៀបការ)<input type="date" value={data.date} onChange={e => onDate(e.target.value)} /></label>
            <label>Wedding day of the week (ថ្ងៃ)<input value={data.weekday} onChange={e => set({ weekday: e.target.value })} placeholder="auto from the date" /></label>
          </div>
          <div className="two">
            <label>Wedding time (ម៉ោង)<input type="time" value={data.time} onChange={e => set({ time: e.target.value })} /></label>
            <label>Wedding reception time (ម៉ោងពិសាភោជនាហារ)<input type="time" value={data.receptionTime} onChange={e => set({ receptionTime: e.target.value })} /></label>
          </div>
          <label>Wedding venue / house address (ទីតាំងរៀបការ)<textarea rows={2} value={data.venue} onChange={e => set({ venue: e.target.value })} /></label>
          <label>Google Maps location link<input value={data.mapUrl} onChange={e => set({ mapUrl: e.target.value })} placeholder="https://maps.google.com/…" /></label>
          <label>Wedding invitation wording or special message
            <textarea rows={5} value={data.message} onChange={e => set({ message: e.target.value })} /></label>
          <small className="muted">If you leave the wording as it is, it switches between Khmer and English for guests. If you type your own, guests see exactly what you wrote.</small>
          <label>Small line above the names<input value={data.headline} onChange={e => set({ headline: e.target.value })} /></label>
        </Card>

        {/* 3 ----------------------------------------------------------- */}
        <Card title="3. Ceremony Schedule (កម្មវិធីមង្គលការ)" icon={<CalendarDays />} open>
          <small className="muted">Add as many events as the wedding program needs. Tap a suggestion to add it, then set its date and time.</small>
          <div className="ivChips">{CEREMONY_SUGGESTIONS.map(n => <button key={n} type="button" className="ivChip" onClick={() => addEv(n)}><Plus /> {n}</button>)}</div>
          {data.schedule.map((ev, i) => (
            <div className="ivEvent" key={i}>
              <label>Ceremony name<input value={ev.name} onChange={e => updEv(i, { name: e.target.value })} placeholder="ពិធី…" /></label>
              <div className="ivEventRow">
                <label>Date<input type="date" value={ev.date} onChange={e => updEv(i, { date: e.target.value })} /></label>
                <label>Time<input type="time" value={ev.time} onChange={e => updEv(i, { time: e.target.value })} /></label>
                <button className="icon danger" onClick={() => set({ schedule: data.schedule.filter((_, j) => j !== i) })} aria-label="Remove event"><Trash2 /></button>
              </div>
            </div>))}
          <button className="secondary" onClick={() => addEv()}><Plus /> Add another event</button>
        </Card>

        {/* 4 ----------------------------------------------------------- */}
        <Card title="4. Invitation Design" icon={<Sparkles />} open>
          <Sub>Selected invitation template</Sub>
          <div className="ivTemplates">
            {TEMPLATES.map(t => {
              const pal = PALETTES[t.palette];
              return (
                <button key={t.id} type="button" className={'ivTpl ' + (data.template === t.id ? 'on' : '')} onClick={() => applyTemplate(t)}>
                  <span className="ivTplArt" style={{ background: `linear-gradient(135deg,${pal.bg} 0 45%,${pal.soft} 45% 70%,${pal.accent} 70%)` }} />
                  <b>{t.name}</b><small>{t.hint}</small>
                </button>);
            })}
          </div>

          <Sub>Bride and groom photos</Sub>
          <div className="ivPhotoPair">
            <PhotoTile label="Groom (កូនកំលោះ)" url={data.groomPhoto} busy={busy === 'groom'} onFile={f => pick(f, 'image', u => set({ groomPhoto: u }), 'groom')} onClear={() => set({ groomPhoto: '' })} />
            <PhotoTile label="Bride (កូនក្រមុំ)" url={data.bridePhoto} busy={busy === 'bride'} onFile={f => pick(f, 'image', u => set({ bridePhoto: u }), 'bride')} onClear={() => set({ bridePhoto: '' })} />
          </div>

          <Sub>Pre-wedding photo gallery</Sub>
          <small className="muted">The first photo is the big picture at the top of the invitation (if empty, the opening picture is used). The rest become a gallery.</small>
          <div className="ivGalleryAdmin">
            {data.gallery.map((u, i) => (
              <div key={u + i} className="ivGThumb" style={{ backgroundImage: `url("${u}")` }}>
                {i === 0 && <em>Top</em>}
                <button className="icon danger" onClick={() => set({ gallery: data.gallery.filter((_, j) => j !== i) })} aria-label="Remove photo"><X /></button>
              </div>))}
            <label className="ivGAdd"><Plus /><span>{busy === 'Uploading photos…' ? '…' : 'Add'}</span>
              <input type="file" accept="image/*" multiple hidden onChange={async e => {
                const fs = Array.from(e.target.files || []); e.target.value = ''; if (!fs.length) return;
                setBusy('Uploading photos…'); setNote('');
                const urls: string[] = [];
                try { for (const f of fs) urls.push(await uploadAsset(f, 'pictures', 'image')); } catch (er: any) { setNote(er?.message || 'Upload failed.'); }
                if (urls.length) { setData(d => ({ ...d, gallery: [...d.gallery, ...urls] })); setDirty(true); }
                setBusy('');
              }} /></label>
          </div>

          <Sub>Preferred colors</Sub>
          <div className="ivSwatches">
            {Object.entries(PALETTES).map(([k, p]) => (
              <button key={k} type="button" className={'ivSwatch ' + (data.look.palette === k ? 'on' : '')} onClick={() => setIn('look', { palette: k })} title={p.name}>
                <i style={{ background: p.bg }} /><i style={{ background: p.accent }} /><i style={{ background: p.soft }} /><small>{p.name}</small>
              </button>))}
          </div>
          <div className="two">
            <label>Font style<select value={data.look.font} onChange={e => setIn('look', { font: e.target.value })}>{Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}</select></label>
            <label>Your own main colour<div className="row"><input type="color" value={/^#[0-9a-f]{6}$/i.test(data.look.accent) ? data.look.accent : (PALETTES[data.look.palette] || PALETTES.blush).accent} onChange={e => setIn('look', { accent: e.target.value })} style={{ height: 46, padding: 4 }} />{data.look.accent && <button className="secondary" onClick={() => setIn('look', { accent: '' })}>Reset</button>}</div></label>
          </div>

          <Sub>Language</Sub>
          <div className="ivSeg">
            {([['km', 'ខ្មែរ', 'Khmer'], ['en', 'English', 'English'], ['both', 'ខ្មែរ + English', 'Bilingual']] as const).map(([v, a, b]) => (
              <button key={v} type="button" className={data.lang === v ? 'on' : ''} onClick={() => set({ lang: v })}><b>{a}</b><small>{b}</small></button>))}
          </div>
          <small className="muted">Khmer or English: guests start in that language and get a ខ្មែរ | EN switch. Bilingual shows both together (no switch).</small>

          <Sub>Khmer fonts</Sub>
          <small className="muted">Choose a font for each part. “Khmer OS Muol Light” and “Khmer OS Muol Pali” show the real font if the guest’s device has it, and the matching Moul / Moulpali web font otherwise.</small>
          {([['names', 'Names (couple, opening cover)'], ['title', 'Section titles (កម្មវិធីមង្គលការ, ពេលវេលា…)'], ['body', 'Message and other text']] as const).map(([k, label]) => (
            <div className="ivKhRow" key={k}>
              <label>{label}
                <select value={data.khFonts[k]} onChange={e => { setData(d => ({ ...d, khFonts: { ...d.khFonts, [k]: e.target.value as KhFont } })); setDirty(true); }}>
                  {(Object.keys(KH_FONTS) as KhFont[]).map(f => <option key={f} value={f}>{KH_FONTS[f].name}</option>)}
                </select></label>
              <div className="ivKhSample" style={{ fontFamily: KH_FONTS[data.khFonts[k]].stack + ',serif' }}>{KH_FONTS[data.khFonts[k]].sample}</div>
            </div>))}

          <Sub>Opening scene (click to open)</Sub>
          <div className="ivStyles">
            {OPEN_STYLES.map(o => (
              <button key={o.id} type="button" className={'ivStyle ' + (data.opening.style === o.id ? 'on' : '')} onClick={() => { setIn('opening', { style: o.id }); setReplay(n => n + 1); }}>
                <span className={'ivStyleArt art-' + o.id} /><b>{o.name}</b><small>{o.hint}</small>
              </button>))}
          </div>
          <div className="ivPickRow">
            <div className="ivPickThumb" style={data.opening.image ? { backgroundImage: `url("${data.opening.image}")` } : undefined}>{!data.opening.image && <ImagePlus />}</div>
            <div className="grow">
              <b>Opening picture</b><small>Shown behind the scene. A portrait photo of you both looks best.</small>
              <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <label className="button secondary ivUpload"><Upload /> {busy === 'Uploading picture…' ? 'Uploading…' : 'Choose picture'}
                  <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pick(f, 'image', u => { setIn('opening', { image: u }); setReplay(n => n + 1); }, 'Uploading picture…'); }} /></label>
                {data.opening.image && <button className="secondary" onClick={() => setIn('opening', { image: '' })}><X /> Remove</button>}
              </div>
            </div>
          </div>
          <div className="two"><label>Small title<input value={data.opening.title} onChange={e => setIn('opening', { title: e.target.value })} /></label>
            <label>Button text<input value={data.opening.button} onChange={e => setIn('opening', { button: e.target.value })} /></label></div>
          <button className="secondary" onClick={() => setReplay(n => n + 1)}><RefreshCw /> Replay opening in preview</button>

          <Sub>Flying butterflies 🦋</Sub>
          <label className="ivCheck"><input type="checkbox" checked={data.butterflies.enabled} onChange={e => setIn('butterflies', { enabled: e.target.checked })} /> Show butterflies flying around the screen</label>
          {data.butterflies.enabled && <>
            <label>How many: <b>{data.butterflies.count}</b><input type="range" min={1} max={24} value={data.butterflies.count} onChange={e => setIn('butterflies', { count: Number(e.target.value) })} /></label>
            <label>Size: <b>{data.butterflies.size}px</b><input type="range" min={18} max={80} value={data.butterflies.size} onChange={e => setIn('butterflies', { size: Number(e.target.value) })} /></label>
            <label className="ivCheck"><input type="checkbox" checked={data.butterflies.mix} onChange={e => setIn('butterflies', { mix: e.target.checked })} /> Mixed pastel colours</label>
            {!data.butterflies.mix && <label>Butterfly colour<input type="color" value={data.butterflies.color} onChange={e => setIn('butterflies', { color: e.target.value })} style={{ height: 44, padding: 4 }} /></label>}
          </>}

          <Sub>Music selection</Sub>
          <small className="muted">Music starts when the guest taps the opening button (phones only allow sound after a tap). Several songs play one after another.</small>
          {data.songs.map((s, i) => (
            <div className="ivSong" key={i}>
              <div className="ivMini"><input value={s.title} onChange={e => updSong(i, { title: e.target.value })} placeholder="Song name" />
                <button className="icon danger" onClick={() => set({ songs: data.songs.filter((_, j) => j !== i) })} aria-label="Remove song"><X /></button></div>
              {s.url ? <audio controls src={s.url} preload="none" /> : <small className="muted">No file yet</small>}
              <input value={s.url} onChange={e => updSong(i, { url: e.target.value })} placeholder="…or paste a direct .mp3 link" />
              <label className="button secondary ivUpload"><Upload /> Upload MP3
                <input type="file" accept="audio/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pick(f, 'audio', u => updSong(i, { url: u, title: s.title || (f?.name || '').replace(/\.[^.]+$/, '') }), 'Uploading song…'); }} /></label>
            </div>))}
          {busy === 'Uploading song…' && <p className="notice">Uploading song…</p>}
          <button className="secondary" onClick={() => set({ songs: [...data.songs, { title: '', url: '' }] })}><Music2 /> Add a song</button>

          <Sub>Additional text or special requests</Sub>
          <textarea rows={3} value={priv.requests} onChange={e => setP({ requests: e.target.value })} placeholder="Anything else the couple wants on the invitation (only you can see this)" />
        </Card>

        {/* 5 ----------------------------------------------------------- */}
        <Card title="5. Other Information" icon={<Link2 />} open>
          <div className="two">
            <label>Contact phone number (ទូរស័ព្ទ)<input value={data.phone} onChange={e => set({ phone: e.target.value })} placeholder="+855 …" /></label>
            <label>Telegram username (optional)<input value={data.telegram} onChange={e => set({ telegram: e.target.value })} placeholder="@username" /></label>
          </div>
          <small className="muted">The phone and Telegram become “Call us” and “Telegram” buttons for guests.</small>
          <label>Preferred completion date<input type="date" value={priv.completionDate} onChange={e => setP({ completionDate: e.target.value })} /></label>
          <label>Special instructions for the designer<textarea rows={3} value={priv.designerNotes} onChange={e => setP({ designerNotes: e.target.value })} placeholder="Only you can see this. It is never shown to guests." /></label>
        </Card>

        {/* publish ----------------------------------------------------- */}
        <Card title="Publish & share link" icon={<Link2 />} open>
          <label>Name for this invitation (only you see it)<input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} placeholder="Sokha & Dara wedding" /></label>
          <label>Link ending
            <div className="ivSlug"><span>{window.location.host}/i/</span><input value={slug} onChange={e => { slugTouched.current = true; setSlug(slugify(e.target.value)); setDirty(true); }} placeholder="sokha-dara" /></div></label>
          <label className="ivCheck"><input type="checkbox" checked={published} onChange={e => { setPublished(e.target.checked); setDirty(true); }} /> Published (anyone with the link can open it, no login)</label>
          {id && link ? (
            <div className="ivShare">
              <div className="ivLinkBox"><Link2 /><code>{link}</code></div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="secondary" onClick={copyLink}><Copy /> Copy link</button>
                {published && <a className="secondary button" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open</a>}
                {!published && <button onClick={() => save(true)} disabled={!!busy}><Eye /> Publish now</button>}
              </div>
              {qr && <div className="ivQr"><img src={qr} alt="QR code of the invitation link" /><small>QR code for printed cards. Right-click or long-press to save.</small></div>}
              {!published && <p className="notice">This is still a draft: the link shows “not found” until you publish.</p>}
            </div>
          ) : <p className="muted">Press Save to create the link.</p>}
        </Card>

        <div className="ivBottomSave"><button className="wide" onClick={() => save()} disabled={!!busy}><Save /> {busy || 'Save invitation'}</button></div>
      </div>

      <aside className="ivPhoneCol">
        <div className="ivPhone"><div className="ivPhoneScreen"><InvitationView data={data} preview replayKey={replay} /></div></div>
        <small className="muted">Live preview. Tap the opening to try it, including the music.</small>
      </aside>
    </div>
  );
}
