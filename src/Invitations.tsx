import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Copy, ExternalLink, Save, ArrowLeft, Music2, Upload, X, Heart,
  Link2, Eye, EyeOff, RefreshCw, ImagePlus, MapPin, CalendarDays, Sparkles, Volume2, VolumeX, SkipForward,
  Type, Image as ImageIcon, Timer, List, LayoutGrid, Minus, ArrowUpDown, ChevronUp, ChevronDown, Phone, Send,
} from 'lucide-react';
import { supabase } from './supabase';
import { optimizeImage } from './imageTools';
import './invitations.css';

/* =====================================================================================================
   Wedding e-invitation
   - Admin: /admin/invitations  (list + editor with live phone preview)
   - Guests: /i/<slug>          (public, no login, opens straight to the invitation)
   ===================================================================================================== */

export type OpenStyle = 'envelope' | 'curtains' | 'doors' | 'cover' | 'none';
export type BlockType = 'cover' | 'text' | 'image' | 'button' | 'countdown' | 'schedule' | 'gallery' | 'divider' | 'spacer';
export type BlockStyle = {
  bg: string; bgImage: string; overlay: number; padTop: number; padBottom: number; minHeight: number;
  align: 'left' | 'center' | 'right'; color: string; anim: 'rise' | 'fade' | 'zoom' | 'none';
};
export type Block = { id: string; type: BlockType; hidden?: boolean; s: BlockStyle; p: Record<string, any> };
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
  /* 6. Free builder: when layout is 'custom' the page is just this list of blocks (everything editable, starts empty) */
  layout: 'classic' | 'custom'; blocks: Block[]; page: { bg: string; bgImage: string; text: string };
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
  layout: 'classic', blocks: [], page: { bg: '', bgImage: '', text: '' },
};

/* A brand-new free-builder invitation: white page, no opening scene, no butterflies, no blocks. */
const blankData = (): InviteData => ({
  ...DEFAULTS, layout: 'custom', template: '', message: '', headline: '', blocks: [],
  look: { ...DEFAULTS.look, palette: 'white' }, opening: { ...DEFAULTS.opening, style: 'none' }, butterflies: { ...DEFAULTS.butterflies, enabled: false },
});

const PALETTES: Record<string, { name: string; bg: string; card: string; accent: string; text: string; soft: string }> = {
  blush: { name: 'Blush rose', bg: '#fff5f7', card: '#ffffff', accent: '#c25b7a', text: '#4a2b36', soft: '#f9dde5' },
  sage: { name: 'Sage garden', bg: '#f4f7f1', card: '#ffffff', accent: '#6f8f6b', text: '#2f3d2e', soft: '#dfe9da' },
  gold: { name: 'Ivory & gold', bg: '#fbf7ee', card: '#fffdf8', accent: '#b8893b', text: '#3d3220', soft: '#f1e6cc' },
  burgundy: { name: 'Burgundy', bg: '#fbf3f3', card: '#ffffff', accent: '#8a1f3d', text: '#3b1620', soft: '#f1d5da' },
  navy: { name: 'Midnight navy', bg: '#14213d', card: '#1d2d52', accent: '#e5c07b', text: '#f5efe0', soft: '#2a3b66' },
  white: { name: 'Clean white', bg: '#ffffff', card: '#ffffff', accent: '#c25b7a', text: '#2b2b2b', soft: '#f1f1f1' },
  ink: { name: 'Black', bg: '#0b0b0f', card: '#16161d', accent: '#e5c07b', text: '#f5f5f5', soft: '#23232d' },
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
  { id: 'none', name: 'No opening', hint: 'The page shows straight away, nothing to tap.' },
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
  layout: raw?.layout === 'custom' ? 'custom' : 'classic',
  blocks: Array.isArray(raw?.blocks) ? (raw.blocks.map(normBlock).filter(Boolean) as Block[]) : [],
  page: { ...DEFAULTS.page, ...(raw?.page && typeof raw.page === 'object' ? raw.page : {}) },
  /* older invitations stored {time,label}; keep them working */
  schedule: Array.isArray(raw?.schedule) ? raw.schedule.map((x: any) => ({ name: x?.name ?? x?.label ?? '', date: x?.date ?? '', time: x?.time ?? '' })) : [],
});

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const randomTail = () => Math.random().toString(36).slice(2, 6);
/* Guests always get the custom-domain link, whichever address the admin is using. Change it with VITE_PUBLIC_SITE_URL if the domain ever moves. */
const PUBLIC_ORIGIN = String((import.meta as any).env?.VITE_PUBLIC_SITE_URL || 'https://ynstudio.site').replace(/\/+$/, '');
const PUBLIC_HOST = PUBLIC_ORIGIN.replace(/^https?:\/\//, '');
const inviteUrl = (slug: string) => `${PUBLIC_ORIGIN}/i/${slug}`;
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);

let fontsLoaded = false;
function useInviteFonts() {
  useEffect(() => {
    if (fontsLoaded) return;
    fontsLoaded = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Great+Vibes&family=Cormorant+Garamond:wght@400;600;700&family=Parisienne&family=Dancing+Script:wght@500;700&family=Kantumruy+Pro:wght@400;600;700&family=Moul&family=Moulpali&family=Noto+Serif+Khmer:wght@400;600&family=Outfit:wght@400;600;700&display=swap';
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
    ['--iv-bg' as any]: okColor(d.page?.bg) || p.bg, ['--iv-card' as any]: p.card, ['--iv-text' as any]: okColor(d.page?.text) || p.text, ['--iv-soft' as any]: p.soft,
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

/* ------------------------------------------------------------------ Free builder: blocks ------------------------------------------------------------------ */
/* In "free builder" mode the page is a list of blocks the admin adds, edits, reorders and deletes. Nothing is fixed. */

const uid = () => Math.random().toString(36).slice(2, 9);
const okColor = (c: any): string => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '');
const num = (v: any, def: number, min: number, max: number): number => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
/* Only https pictures (or this site's own files) are used, and characters that could break out of url("…") are escaped. */
const safeImg = (u: any): string => {
  const v = typeof u === 'string' ? u.trim() : '';
  if (!(/^https:\/\//i.test(v) || /^\/(?!\/)/.test(v))) return '';
  return v.replace(/["'()\\\s<>]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
};
/* Text with an optional English version: follows the guest's language switch. */
const pick = (t: any, en: any, lang: Lang): string => {
  const a = typeof t === 'string' ? t : '', e = typeof en === 'string' ? en : '';
  if (!e) return a;
  if (lang === 'en') return e;
  if (lang === 'both') return a ? `${a}\n${e}` : e;
  return a || e;
};

type LinkKind = 'url' | 'call' | 'telegram' | 'whatsapp' | 'email' | 'block';
const LINK_KINDS: [LinkKind, string, string][] = [
  ['url', 'Website / any link', 'https://…'],
  ['call', 'Phone call', '+855 12 345 678'],
  ['telegram', 'Telegram', '@username'],
  ['whatsapp', 'WhatsApp', '+855 12 345 678'],
  ['email', 'Email', 'name@example.com'],
  ['block', 'Jump to a block on this page', ''],
];
/* Turns what the admin typed into a safe link. javascript: and other odd schemes are never produced. */
function blockHref(kind: string, value: any): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return '';
  switch (kind) {
    case 'call': { const n = v.replace(/[^+\d]/g, ''); return n ? `tel:${n}` : ''; }
    case 'telegram': { const u = v.replace(/^@/, '').replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/[^\w]/g, ''); return u ? `https://t.me/${u}` : ''; }
    case 'whatsapp': { const n = v.replace(/\D/g, ''); return n ? `https://wa.me/${n}` : ''; }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}` : '';
    case 'block': return '#' + v.replace(/[^\w-]/g, '');
    default:
      if (/^https?:\/\//i.test(v)) return v;
      if (/^(tel:|mailto:|sms:)[^\s]+$/i.test(v)) return v;
      if (/^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(v)) return 'https://' + v;
      return '';
  }
}
function scrollToBlock(id: string) {
  const el = document.getElementById('ivb-' + id);
  const sc = el?.closest('.ivScroll') as HTMLElement | null;
  if (!el || !sc) return;
  sc.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 12), behavior: 'smooth' });
}

const BLOCK_STYLE: BlockStyle = { bg: '', bgImage: '', overlay: 0, padTop: 28, padBottom: 8, minHeight: 0, align: 'center', color: '', anim: 'rise' };
type BlockDef = { name: string; hint: string; icon: React.ElementType; make: () => Record<string, any>; style?: Partial<BlockStyle> };
const BLOCK_DEFS: Record<BlockType, BlockDef> = {
  cover: { name: 'Cover photo', hint: 'Big photo with names and date', icon: Sparkles,
    make: () => ({ kicker: '', kickerEn: '', names: 'Groom & Bride', namesEn: '', sub: '', subEn: '', size: 64, arrow: true }),
    style: { overlay: 40, padTop: 40, padBottom: 40, minHeight: 100, color: '#ffffff' } },
  text: { name: 'Text', hint: 'Any words, in any font and size', icon: Type,
    make: () => ({ text: 'Your text here', en: '', font: 'head', size: 20, weight: 400, italic: false, upper: false, accent: false, spacing: 0, line: 1.7 }) },
  image: { name: 'Picture', hint: 'A photo, logo or sticker', icon: ImageIcon,
    make: () => ({ url: '', width: 100, shape: 'orig', radius: 16, shadow: true, alt: '', kind: 'url', value: '' }) },
  button: { name: 'Button', hint: 'Links to a website, map, phone, Telegram…', icon: ExternalLink,
    make: () => ({ label: 'Open map', en: '', kind: 'url', value: '', variant: 'solid', btn: '', txt: '', radius: 999, size: 'md', full: false, icon: 'none' }) },
  countdown: { name: 'Countdown', hint: 'Days, hours, minutes to the big day', icon: Timer,
    make: () => ({ title: 'Save the date', en: '', date: '', time: '09:00' }) },
  schedule: { name: 'Programme', hint: 'List of ceremonies with date and time', icon: List,
    make: () => ({ title: 'Wedding programme', en: '', items: [{ name: '', date: '', time: '' }] }) },
  gallery: { name: 'Photo gallery', hint: 'Several photos in a grid', icon: LayoutGrid,
    make: () => ({ images: [], cols: 2, radius: 16, gap: 10 }) },
  divider: { name: 'Divider', hint: 'A small decorative line', icon: Minus,
    make: () => ({ style: 'heart', color: '' }) },
  spacer: { name: 'Space', hint: 'Empty room between blocks', icon: ArrowUpDown,
    make: () => ({ height: 40 }) },
};
const BLOCK_TYPES = Object.keys(BLOCK_DEFS) as BlockType[];

function newBlock(type: BlockType, patch?: { p?: Record<string, any>; s?: Partial<BlockStyle> }): Block {
  const def = BLOCK_DEFS[type];
  return { id: uid(), type, s: { ...BLOCK_STYLE, ...(def.style || {}), ...(patch?.s || {}) }, p: { ...def.make(), ...(patch?.p || {}) } };
}
/* Anything read back from the database is checked, so a bad row can never break the page. */
function normBlock(raw: any): Block | null {
  if (!raw || typeof raw !== 'object' || !BLOCK_TYPES.includes(raw.type)) return null;
  const base = newBlock(raw.type as BlockType);
  const s = { ...base.s, ...(raw.s && typeof raw.s === 'object' ? raw.s : {}) } as BlockStyle;
  const p = { ...base.p, ...(raw.p && typeof raw.p === 'object' ? raw.p : {}) };
  return { id: typeof raw.id === 'string' && /^[\w-]{1,24}$/.test(raw.id) ? raw.id : base.id, type: raw.type, hidden: !!raw.hidden, s, p };
}

const BLOCK_FONTS: Record<string, { name: string; css: string }> = {
  head: { name: 'Main font', css: 'var(--iv-head)' },
  names: { name: 'Script / names', css: 'var(--iv-names)' },
  title: { name: 'Title font', css: 'var(--iv-title)' },
  body: { name: 'Khmer easy-read', css: `${KH_FONTS.body.stack},'Playfair Display',serif` },
  moul: { name: 'Khmer OS Muol Light', css: `${KH_FONTS.moul.stack},serif` },
  moulpali: { name: 'Khmer OS Muol Pali', css: `${KH_FONTS.moulpali.stack},serif` },
  sans: { name: 'Clean sans-serif', css: "'Outfit','Kantumruy Pro',sans-serif" },
};
const BTN_ICONS: Record<string, React.ElementType> = { heart: Heart, pin: MapPin, phone: Phone, send: Send, calendar: CalendarDays, link: ExternalLink };

const blockSummary = (b: Block): string => {
  const p = b.p;
  switch (b.type) {
    case 'cover': return String(p.names || '');
    case 'text': return String(p.text || '').split('\n')[0];
    case 'button': return String(p.label || '');
    case 'image': return p.url ? 'Picture' : 'No picture yet';
    case 'countdown': return String(p.date || 'Pick a date');
    case 'schedule': return `${(p.items || []).length} events`;
    case 'gallery': return `${(p.images || []).length} photos`;
    case 'divider': return String(p.style || '');
    case 'spacer': return `${p.height}px`;
    default: return '';
  }
};

function BlockCountdown({ p, lang, preview }: { p: Record<string, any>; lang: Lang; preview: boolean }) {
  const target = useMemo(() => {
    if (!p.date) return null;
    const t = new Date(`${p.date}T${p.time || '09:00'}:00`).getTime();
    return Number.isFinite(t) ? t : null;
  }, [p.date, p.time]);
  const cd = useCountdown(target);
  const L = labelsFor(lang);
  const title = pick(p.title, p.en, lang);
  if (!cd) return preview ? <div className="ivImgEmpty">Pick a date for the countdown</div> : null;
  return (
    <>
      {title && <h3 className="ivBH3">{title}</h3>}
      {cd.over ? <h3 className="ivBH3">{L.soon}</h3> : (
        <div className="ivCountRow">
          {([['days', cd.days], ['hours', cd.hours], ['mins', cd.mins], ['secs', cd.secs]] as const).map(([k, v]) => (
            <div key={k}><b>{lang === 'km' ? khNum(String(v).padStart(2, '0')) : String(v).padStart(2, '0')}</b><small>{(L as any)[k]}</small></div>
          ))}
        </div>
      )}
    </>
  );
}

function BlockButton({ p, lang, preview }: { p: Record<string, any>; lang: Lang; preview: boolean }) {
  const label = pick(p.label, p.en, lang);
  if (!label) return null;
  const href = blockHref(p.kind, p.value);
  const Icon = BTN_ICONS[p.icon];
  const col = okColor(p.btn), txt = okColor(p.txt);
  const st: React.CSSProperties = { borderRadius: num(p.radius, 999, 0, 999) };
  if (p.variant === 'outline') { st.background = 'transparent'; st.color = txt || col || 'var(--iv-accent)'; st.border = `2px solid ${col || 'var(--iv-accent)'}`; }
  else if (p.variant === 'soft') { st.background = 'var(--iv-soft)'; st.color = txt || col || 'var(--iv-accent)'; }
  else { st.background = col || 'var(--iv-accent)'; st.color = txt || '#ffffff'; }
  const ext = p.kind === 'url' || p.kind === 'telegram' || p.kind === 'whatsapp';
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (preview) { e.preventDefault(); return; }
    if (p.kind === 'block') { e.preventDefault(); scrollToBlock(String(p.value)); }
  };
  return (
    <a className={`ivBtnX ivBtnX-${p.size === 'sm' || p.size === 'lg' ? p.size : 'md'}${p.full ? ' full' : ''}`} style={st} href={href || undefined}
      target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined} onClick={onClick}>
      {Icon && <Icon />}{label}
    </a>
  );
}

function BlockBody({ b, lang, preview }: { b: Block; lang: Lang; preview: boolean }) {
  const p = b.p;
  const align = b.s.align;
  const margin = align === 'left' ? '0' : align === 'right' ? '0 0 0 auto' : '0 auto';
  switch (b.type) {
    case 'cover': {
      const kick = pick(p.kicker, p.kickerEn, lang), nm = pick(p.names, p.namesEn, lang), sub = pick(p.sub, p.subEn, lang);
      const sz = num(p.size, 64, 28, 140);
      return (
        <>
          {kick && <p className="ivKicker">{kick}</p>}
          <h1 className="ivBNames" style={{ fontSize: `clamp(${Math.round(sz * 0.6)}px, ${(sz / 3.9).toFixed(2)}cqw, ${sz}px)` }}>{nm}</h1>
          {sub && <p className="ivHeroDate"><CalendarDays /> {sub}</p>}
        </>
      );
    }
    case 'text': {
      const t = pick(p.text, p.en, lang);
      if (!t) return preview ? <div className="ivImgEmpty">Empty text: type something</div> : null;
      const sz = num(p.size, 20, 10, 140);
      return (
        <p className="ivBText" style={{
          fontFamily: (BLOCK_FONTS[p.font] || BLOCK_FONTS.head).css,
          fontSize: `clamp(${Math.round(sz * 0.6)}px, ${(sz / 3.9).toFixed(2)}cqw, ${sz}px)`,
          fontWeight: p.weight === 700 ? 700 : 400, fontStyle: p.italic ? 'italic' : 'normal',
          letterSpacing: `${num(p.spacing, 0, 0, 40) / 100}em`, lineHeight: num(p.line, 1.7, 1, 3),
          textTransform: p.upper ? 'uppercase' : undefined, color: p.accent ? 'var(--iv-accent)' : undefined,
        }}>{t}</p>
      );
    }
    case 'image': {
      const u = safeImg(p.url);
      if (!u) return preview ? <div className="ivImgEmpty">Choose a picture</div> : null;
      const ratio: Record<string, string> = { sq: '1 / 1', pt: '4 / 5', wd: '16 / 9', round: '1 / 1' };
      const img = (
        <img src={u} alt={String(p.alt || '')} loading="lazy" style={{
          display: 'block', width: `${num(p.width, 100, 10, 100)}%`, margin,
          aspectRatio: ratio[p.shape] || undefined, objectFit: ratio[p.shape] ? 'cover' : undefined,
          borderRadius: p.shape === 'round' ? '50%' : num(p.radius, 16, 0, 60),
          boxShadow: p.shadow ? '0 12px 34px rgba(0,0,0,.18)' : undefined,
        }} />
      );
      const href = blockHref(p.kind, p.value);
      if (!href) return img;
      const ext = p.kind === 'url' || p.kind === 'telegram' || p.kind === 'whatsapp';
      return <a href={href} target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined} onClick={e => { if (preview) e.preventDefault(); else if (p.kind === 'block') { e.preventDefault(); scrollToBlock(String(p.value)); } }}>{img}</a>;
    }
    case 'button': return <BlockButton p={p} lang={lang} preview={preview} />;
    case 'countdown': return <BlockCountdown p={p} lang={lang} preview={preview} />;
    case 'schedule': {
      const items: CeremonyItem[] = (Array.isArray(p.items) ? p.items : []).filter((e: any) => e && e.name);
      const title = pick(p.title, p.en, lang);
      if (!items.length) return preview ? <div className="ivImgEmpty">Add events to the programme</div> : null;
      return (
        <>
          {title && <h3 className="ivBH3">{title}</h3>}
          <ol className="ivTimeline">{items.map((e, i) => (
            <li key={i}><div className="ivWhen"><b>{fmtTime(e.time, lang)}</b><small>{fmtShort(e.date, lang)}</small></div><span>{e.name}</span></li>
          ))}</ol>
        </>
      );
    }
    case 'gallery': {
      const imgs = (Array.isArray(p.images) ? p.images : []).map(safeImg).filter(Boolean) as string[];
      if (!imgs.length) return preview ? <div className="ivImgEmpty">Add photos to the gallery</div> : null;
      const gap = num(p.gap, 10, 0, 30);
      return (
        <div className="ivBGallery" style={{ gridTemplateColumns: `repeat(${num(p.cols, 2, 1, 3)},1fr)`, gap }}>
          {imgs.map((u, i) => <img key={u + i} src={u} alt="" loading="lazy" style={{ borderRadius: num(p.radius, 16, 0, 40) }} />)}
        </div>
      );
    }
    case 'divider': {
      const c = okColor(p.color);
      return <div className={`ivDiv ivDiv-${p.style === 'line' || p.style === 'dots' || p.style === 'sparkle' ? p.style : 'heart'}`} style={c ? { color: c } : undefined} aria-hidden="true"><i /><span /><i /></div>;
    }
    case 'spacer': return <div style={{ height: num(p.height, 40, 4, 300) }} aria-hidden="true" />;
    default: return null;
  }
}

function BlockView({ b, lang, preview, selected, onSelect }: { b: Block; lang: Lang; preview: boolean; selected: boolean; onSelect?: (id: string) => void }) {
  const s = b.s;
  const bgi = safeImg(s.bgImage);
  const bg = okColor(s.bg), col = okColor(s.color);
  const style: React.CSSProperties = {
    ...(bg ? { background: bg } : {}), ...(col ? { color: col } : {}),
    minHeight: num(s.minHeight, 0, 0, 100) > 0 ? `${num(s.minHeight, 0, 0, 100)}cqh` : undefined,
    paddingTop: num(s.padTop, 28, 0, 200), paddingBottom: num(s.padBottom, 8, 0, 200), textAlign: s.align === 'left' || s.align === 'right' ? s.align : 'center',
  };
  const anim = s.anim === 'fade' || s.anim === 'zoom' || s.anim === 'none' ? s.anim : 'rise';
  const body = (
    <section id={`ivb-${b.id}`} className={`ivBlk ivBlk-${b.type}${b.type === 'cover' && !bgi ? ' noimg' : ''}${selected ? ' sel' : ''}`} style={style}
      onClick={onSelect ? (e: React.MouseEvent) => { e.stopPropagation(); onSelect(b.id); } : undefined}>
      {bgi && <div className="ivBlkBg" style={{ backgroundImage: `url("${bgi}")` }} />}
      {(bgi || b.type === 'cover') && s.overlay > 0 && <div className="ivBlkShade" style={{ opacity: num(s.overlay, 0, 0, 90) / 100 }} />}
      <div className="ivBlkIn"><BlockBody b={b} lang={lang} preview={preview} /></div>
      {b.type === 'cover' && b.p.arrow && <div className="ivScrollHint" aria-hidden="true"><i /></div>}
    </section>
  );
  return anim === 'none' ? body : <Reveal className={`ivA-${anim}`}>{body}</Reveal>;
}

/* "Fill the builder with what is already typed in the guided form": names, date, place, photos, buttons. Everything stays editable. */
function blocksFromClassic(d: InviteData): Block[] {
  const out: Block[] = [];
  const T = (p: Record<string, any>, s: Partial<BlockStyle> = {}) => { out.push(newBlock('text', { p, s })); };
  const isDef = (v: string, key: 'headline' | 'message') => !v || v === TXT.km[key] || v === TXT.en[key];
  const nm = [d.groom, d.bride].filter(Boolean).join(' & ');
  const dateKm = fmtDate(d.date, d.weekday, 'km'), dateEn = fmtDate(d.date, d.weekday, 'en');
  const timeKm = fmtTime(d.time, 'km'), timeEn = fmtTime(d.time, 'en');

  const cover = newBlock('cover', { s: { bgImage: d.gallery[0] || d.opening.image || '' } });
  cover.p = { ...cover.p,
    kicker: isDef(d.headline, 'headline') ? TXT.km.headline : d.headline, kickerEn: isDef(d.headline, 'headline') ? TXT.en.headline : '',
    names: nm || 'Groom & Bride',
    sub: [dateKm, timeKm].filter(Boolean).join(' · '), subEn: [dateEn, timeEn].filter(Boolean).join(' · ') };
  out.push(cover);

  const people: [string, string, string, string][] = [
    [d.groomPhoto, d.groom || L_KM.groomSide, d.groomParents, 'groom'],
    [d.bridePhoto, d.bride || L_KM.brideSide, d.brideParents, 'bride'],
  ];
  people.forEach(([photo, name, parents, who]) => {
    if (!photo && !parents) return;
    if (photo) out.push(newBlock('image', { p: { url: photo, width: 46, shape: 'round' }, s: { padTop: 36 } }));
    T({ text: name, font: 'names', size: 26, line: 1.8 }, { padTop: photo ? 12 : 30 });
    if (parents) T({ text: `${who === 'groom' ? L_KM.sonOf : L_KM.daughterOf}\n${parents}`, en: `${who === 'groom' ? L_EN.sonOf : L_EN.daughterOf}\n${parents}`, font: 'body', size: 15, line: 1.9 }, { padTop: 4 });
  });

  T({ text: isDef(d.message, 'message') ? TXT.km.message : d.message, en: isDef(d.message, 'message') ? TXT.en.message : '', font: 'body', size: 18, line: 1.95 }, { padTop: 46 });
  if (d.date) out.push(newBlock('countdown', { p: { title: L_KM.save, en: L_EN.save, date: d.date, time: d.time || '09:00' }, s: { padTop: 46 } }));

  if (d.date || d.time) {
    T({ text: L_KM.when, en: L_EN.when, size: 13, upper: true, spacing: 18, accent: true }, { padTop: 46, padBottom: 0 });
    T({ text: [dateKm, timeKm].filter(Boolean).join('\n'), en: [dateEn, timeEn].filter(Boolean).join('\n'), font: 'body', size: 22, weight: 700, line: 1.8 }, { padTop: 6 });
  }
  if (d.receptionTime) {
    T({ text: L_KM.reception, en: L_EN.reception, size: 13, upper: true, spacing: 18, accent: true }, { padTop: 30, padBottom: 0 });
    T({ text: fmtTime(d.receptionTime, 'km'), en: fmtTime(d.receptionTime, 'en'), font: 'body', size: 22, weight: 700 }, { padTop: 6 });
  }
  if (d.venue || d.address) {
    T({ text: L_KM.where, en: L_EN.where, size: 13, upper: true, spacing: 18, accent: true }, { padTop: 30, padBottom: 0 });
    T({ text: [d.venue, d.address].filter(Boolean).join('\n'), font: 'body', size: 20, weight: 700, line: 1.8 }, { padTop: 6 });
    if (d.mapUrl) out.push(newBlock('button', { p: { label: L_KM.map, en: L_EN.map, kind: 'url', value: d.mapUrl, icon: 'pin' }, s: { padTop: 14 } }));
  }
  const items = d.schedule.filter(e => e.name);
  if (items.length) out.push(newBlock('schedule', { p: { title: L_KM.program, en: L_EN.program, items: items.map(e => ({ ...e })) }, s: { padTop: 50 } }));
  if (d.gallery.length > 1) out.push(newBlock('gallery', { p: { images: d.gallery.slice(1) }, s: { padTop: 50 } }));
  if (d.phone.trim()) out.push(newBlock('button', { p: { label: L_KM.call, en: L_EN.call, kind: 'call', value: d.phone, icon: 'phone' }, s: { padTop: 40 } }));
  if (d.telegram.trim()) out.push(newBlock('button', { p: { label: 'Telegram', kind: 'telegram', value: d.telegram, variant: 'outline', icon: 'send' }, s: { padTop: 12 } }));
  out.push(newBlock('divider', { s: { padTop: 50 } }));
  T({ text: L_KM.thanks, en: L_EN.thanks, font: 'body', size: 17, line: 1.9 }, { padTop: 10 });
  T({ text: L_KM.ph, en: L_EN.ph, size: 12, line: 1.5 }, { padTop: 6, padBottom: 30 });
  return out;
}

export function InvitationView({ data, preview = false, replayKey = 0, onViewed, selectedId = '', onSelectBlock }: { data: InviteData; preview?: boolean; replayKey?: number; onViewed?: () => void; selectedId?: string; onSelectBlock?: (id: string) => void }) {
  useInviteFonts();
  /* Guests start in the invitation's language (Khmer by default) and can switch, unless it is set to bilingual. */
  const [lang, setLang] = useState<Lang>(data.lang);
  useEffect(() => { setLang(data.lang); }, [data.lang]);
  const d = useMemo(() => ({ ...data, lang }), [data, lang]);
  const L = labelsFor(lang);
  const noOpen = data.opening.style === 'none';
  const [opened, setOpened] = useState(noOpen);
  const [gone, setGone] = useState(noOpen);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const songs = d.songs.filter(s => s.url);

  /* a new "replay" resets the scene (used by the admin preview) */
  useEffect(() => { setOpened(noOpen); setGone(noOpen); setPlaying(false); setTrack(0); audio.current?.pause(); }, [replayKey, d.opening.style]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const custom = d.layout === 'custom';
  const shown = custom ? d.blocks.filter(b => !b.hidden) : [];
  const hasEn = custom && d.blocks.some(b => ['en', 'kickerEn', 'namesEn', 'subEn'].some(k => typeof b.p[k] === 'string' && b.p[k].trim()));
  const pageBg = safeImg(d.page?.bgImage);

  return (
    <div className={`ivRoot ${preview ? 'ivPreview' : ''} ${onSelectBlock ? 'ivPick' : ''}`} data-kh={lang !== 'en' ? '1' : '0'} style={themeVars(d)}>
      {pageBg && <div className="ivPageBg" style={{ backgroundImage: `url("${pageBg}")` }} />}
      <div className={`ivScroll ${gone ? '' : 'ivLocked'}`}>
        {custom ? (
          <>
            {shown.map(b => <BlockView key={b.id} b={b} lang={lang} preview={preview} selected={b.id === selectedId} onSelect={onSelectBlock} />)}
            {!shown.length && preview && <div className="ivEmptyPage"><Heart /><b>Blank page</b><small>Add your first block from the list next to this preview.</small></div>}
            <div style={{ height: 'max(32px, env(safe-area-inset-bottom))' }} />
          </>
        ) : (
        <>
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
        </>
        )}
      </div>

      <Butterflies cfg={d.butterflies} />
      {data.lang !== 'both' && (!custom || hasEn) && (
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
  const [editing, setEditing] = useState<Row | 'new' | 'blank' | null>(null);

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

  if (editing) return <Shell title="Wedding invitation"><InviteEditor row={typeof editing === 'object' ? editing : null} blank={editing === 'blank'} onClose={() => { setEditing(null); load(); }} /></Shell>;

  return (
    <Shell title="Wedding Invitations">
      <div className="toolbar"><button onClick={() => setEditing('blank')}><Plus /> New blank page</button><button className="secondary" onClick={() => setEditing('new')}><Plus /> New from guided form</button></div>
      {err && <p className="notice">{err}</p>}
      <div className="table">
        {(rows || []).map(x => (
          <div className="tr ivRow" key={x.id}>
            <div className="ivRowThumb" style={safeImg(x.data?.opening?.image || (Array.isArray(x.data?.blocks) ? x.data.blocks.find((bk: any) => bk?.s?.bgImage)?.s?.bgImage : '')) ? { backgroundImage: `url("${safeImg(x.data?.opening?.image || x.data.blocks.find((bk: any) => bk?.s?.bgImage)?.s?.bgImage)}")` } : undefined}><Heart /></div>
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

/* ------------------------------------------------------------------ Free builder: admin panel ------------------------------------------------------------------ */

function ColorField({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <label>{label}
      <div className="row">
        <input type="color" value={okColor(value) || fallback} onChange={e => onChange(e.target.value)} style={{ height: 44, padding: 4 }} />
        {value && <button type="button" className="secondary" onClick={() => onChange('')}>Reset</button>}
      </div>
    </label>
  );
}
function Range({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return <label>{label}: <b>{value}{unit}</b><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="ivSegX">{options.map(([v, t]) => <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{t}</button>)}</div>;
}

type Upload = (f: File, label: string, cb: (u: string) => void) => Promise<void>;
type PatchP = Record<string, any> | ((p: Record<string, any>) => Record<string, any>);

function BlockEditor({ b, blocks, onP, onS, upload, busy, setNote }: {
  b: Block; blocks: Block[]; onP: (patch: PatchP) => void; onS: (patch: Partial<BlockStyle>) => void;
  upload: Upload; busy: string; setNote: (m: string) => void;
}) {
  const p = b.p, s = b.s;
  const items: CeremonyItem[] = Array.isArray(p.items) ? p.items : [];
  const images: string[] = Array.isArray(p.images) ? p.images : [];
  const kindInfo = LINK_KINDS.find(k => k[0] === p.kind) || LINK_KINDS[0];

  const linkFields = (
    <>
      <label>Link type
        <select value={p.kind} onChange={e => onP({ kind: e.target.value, value: '' })}>{LINK_KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      {p.kind === 'block'
        ? <label>Jump to
            <select value={p.value} onChange={e => onP({ value: e.target.value })}>
              <option value="">Choose a block…</option>
              {blocks.filter(x => x.id !== b.id).map(x => <option key={x.id} value={x.id}>{BLOCK_DEFS[x.type].name}: {blockSummary(x).slice(0, 28)}</option>)}
            </select></label>
        : <label>Where it goes<input value={p.value} onChange={e => onP({ value: e.target.value })} placeholder={kindInfo[2]} /></label>}
    </>
  );

  return (
    <div className="ivBFields">
      {b.type === 'cover' && <>
        <PhotoTile label="Cover picture" url={s.bgImage} busy={busy === 'bg'} onFile={f => upload(f, 'bg', u => onS({ bgImage: u }))} onClear={() => onS({ bgImage: '' })} />
        <label>Small line above the names<input value={p.kicker} onChange={e => onP({ kicker: e.target.value })} placeholder="យើងនឹងរៀបមង្គលការ" /></label>
        <label>…in English (optional)<input value={p.kickerEn} onChange={e => onP({ kickerEn: e.target.value })} placeholder="We are getting married" /></label>
        <label>Names (press Enter for a new line)<textarea rows={2} value={p.names} onChange={e => onP({ names: e.target.value })} /></label>
        <label>Names in English (optional)<textarea rows={2} value={p.namesEn} onChange={e => onP({ namesEn: e.target.value })} /></label>
        <label>Date line<input value={p.sub} onChange={e => onP({ sub: e.target.value })} placeholder="ថ្ងៃសៅរ៍ ទី១២ ខែមករា ឆ្នាំ២០២៧" /></label>
        <label>…in English (optional)<input value={p.subEn} onChange={e => onP({ subEn: e.target.value })} placeholder="Saturday, January 12, 2027" /></label>
        <Range label="Names size" value={num(p.size, 64, 28, 140)} min={28} max={140} onChange={v => onP({ size: v })} />
        <label className="ivCheck"><input type="checkbox" checked={!!p.arrow} onChange={e => onP({ arrow: e.target.checked })} /> Show the little “scroll down” hint</label>
      </>}

      {b.type === 'text' && <>
        <label>Text<textarea rows={4} value={p.text} onChange={e => onP({ text: e.target.value })} /></label>
        <label>English version (optional)<textarea rows={3} value={p.en || ''} onChange={e => onP({ en: e.target.value })} placeholder="Shown when the guest taps EN" /></label>
        <div className="two">
          <label>Font<select value={p.font} onChange={e => onP({ font: e.target.value })}>{Object.entries(BLOCK_FONTS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}</select></label>
          <label>Weight<select value={p.weight === 700 ? 700 : 400} onChange={e => onP({ weight: Number(e.target.value) })}><option value={400}>Normal</option><option value={700}>Bold</option></select></label>
        </div>
        <div className="ivFontSample" style={{ fontFamily: (BLOCK_FONTS[p.font] || BLOCK_FONTS.head).css }}>Aa សួស្តី Wedding</div>
        <Range label="Size" value={num(p.size, 20, 10, 140)} min={10} max={140} unit="px" onChange={v => onP({ size: v })} />
        <Range label="Letter spacing" value={num(p.spacing, 0, 0, 40)} min={0} max={40} onChange={v => onP({ spacing: v })} />
        <Range label="Line height" value={num(p.line, 1.7, 1, 3)} min={1} max={3} step={0.1} onChange={v => onP({ line: Math.round(v * 10) / 10 })} />
        <label className="ivCheck"><input type="checkbox" checked={!!p.italic} onChange={e => onP({ italic: e.target.checked })} /> Italic</label>
        <label className="ivCheck"><input type="checkbox" checked={!!p.upper} onChange={e => onP({ upper: e.target.checked })} /> CAPITAL LETTERS</label>
        <label className="ivCheck"><input type="checkbox" checked={!!p.accent} onChange={e => onP({ accent: e.target.checked })} /> Use the main (accent) colour</label>
      </>}

      {b.type === 'image' && <>
        <PhotoTile label="Picture" url={p.url} busy={busy === 'img'} onFile={f => upload(f, 'img', u => onP({ url: u }))} onClear={() => onP({ url: '' })} />
        <Range label="Width" value={num(p.width, 100, 10, 100)} min={10} max={100} unit="%" onChange={v => onP({ width: v })} />
        <label>Shape
          <select value={p.shape} onChange={e => onP({ shape: e.target.value })}>
            <option value="orig">Original shape</option><option value="sq">Square</option><option value="pt">Portrait</option><option value="wd">Wide</option><option value="round">Circle</option>
          </select></label>
        {p.shape !== 'round' && <Range label="Rounded corners" value={num(p.radius, 16, 0, 60)} min={0} max={60} unit="px" onChange={v => onP({ radius: v })} />}
        <label className="ivCheck"><input type="checkbox" checked={!!p.shadow} onChange={e => onP({ shadow: e.target.checked })} /> Soft shadow</label>
        <label>Picture description (for screen readers)<input value={p.alt} onChange={e => onP({ alt: e.target.value })} /></label>
        <Sub>Make the picture a link (optional)</Sub>
        {linkFields}
      </>}

      {b.type === 'button' && <>
        <label>Button text<input value={p.label} onChange={e => onP({ label: e.target.value })} /></label>
        <label>…in English (optional)<input value={p.en} onChange={e => onP({ en: e.target.value })} /></label>
        {linkFields}
        <div className="ivField"><span>Style</span><Seg value={p.variant as 'solid' | 'outline' | 'soft'} options={[['solid', 'Filled'], ['outline', 'Outline'], ['soft', 'Soft']]} onChange={v => onP({ variant: v })} /></div>
        <div className="ivField"><span>Size</span><Seg value={(p.size === 'sm' || p.size === 'lg' ? p.size : 'md') as 'sm' | 'md' | 'lg'} options={[['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]} onChange={v => onP({ size: v })} /></div>
        <div className="two">
          <label>Corners<select value={p.radius} onChange={e => onP({ radius: Number(e.target.value) })}><option value={999}>Round (pill)</option><option value={14}>Soft</option><option value={4}>Square</option></select></label>
          <label>Icon<select value={p.icon} onChange={e => onP({ icon: e.target.value })}>
            <option value="none">No icon</option><option value="heart">Heart</option><option value="pin">Map pin</option><option value="phone">Phone</option><option value="send">Send / Telegram</option><option value="calendar">Calendar</option><option value="link">Link</option></select></label>
        </div>
        <div className="two">
          <ColorField label="Button colour" value={p.btn} fallback="#c25b7a" onChange={v => onP({ btn: v })} />
          <ColorField label="Text colour" value={p.txt} fallback="#ffffff" onChange={v => onP({ txt: v })} />
        </div>
        <label className="ivCheck"><input type="checkbox" checked={!!p.full} onChange={e => onP({ full: e.target.checked })} /> Full width</label>
      </>}

      {b.type === 'countdown' && <>
        <label>Title<input value={p.title} onChange={e => onP({ title: e.target.value })} /></label>
        <label>…in English (optional)<input value={p.en} onChange={e => onP({ en: e.target.value })} /></label>
        <div className="two">
          <label>Date<input type="date" value={p.date} onChange={e => onP({ date: e.target.value })} /></label>
          <label>Time<input type="time" value={p.time} onChange={e => onP({ time: e.target.value })} /></label>
        </div>
      </>}

      {b.type === 'schedule' && <>
        <label>Title<input value={p.title} onChange={e => onP({ title: e.target.value })} /></label>
        <label>…in English (optional)<input value={p.en} onChange={e => onP({ en: e.target.value })} /></label>
        <div className="ivChips">{CEREMONY_SUGGESTIONS.map(n => <button key={n} type="button" className="ivChip" onClick={() => onP({ items: [...items, { name: n, date: '', time: '' }] })}><Plus /> {n}</button>)}</div>
        {items.map((ev, i) => (
          <div className="ivEvent" key={i}>
            <label>Ceremony name<input value={ev.name} onChange={e => onP({ items: items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="ពិធី…" /></label>
            <div className="ivEventRow">
              <label>Date<input type="date" value={ev.date} onChange={e => onP({ items: items.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} /></label>
              <label>Time<input type="time" value={ev.time} onChange={e => onP({ items: items.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)) })} /></label>
              <button type="button" className="icon danger" onClick={() => onP({ items: items.filter((_, j) => j !== i) })} aria-label="Remove event"><Trash2 /></button>
            </div>
          </div>))}
        <button type="button" className="secondary" onClick={() => onP({ items: [...items, { name: '', date: '', time: '' }] })}><Plus /> Add an event</button>
      </>}

      {b.type === 'gallery' && <>
        <div className="ivGalleryAdmin">
          {images.map((u, i) => (
            <div key={u + i} className="ivGThumb" style={{ backgroundImage: `url("${safeImg(u)}")` }}>
              <button type="button" className="icon danger" onClick={() => onP({ images: images.filter((_, j) => j !== i) })} aria-label="Remove photo"><X /></button>
            </div>))}
          <label className="ivGAdd"><Plus /><span>{busy === 'gal' ? '…' : 'Add'}</span>
            <input type="file" accept="image/*" multiple hidden onChange={async e => {
              const fs = Array.from(e.target.files || []); e.target.value = ''; if (!fs.length) return;
              setNote('');
              for (const f of fs) await upload(f, 'gal', u => onP(cur => ({ images: [...(Array.isArray(cur.images) ? cur.images : []), u] })));
            }} /></label>
        </div>
        <Range label="Photos per row" value={num(p.cols, 2, 1, 3)} min={1} max={3} onChange={v => onP({ cols: v })} />
        <Range label="Rounded corners" value={num(p.radius, 16, 0, 40)} min={0} max={40} unit="px" onChange={v => onP({ radius: v })} />
        <Range label="Gap" value={num(p.gap, 10, 0, 30)} min={0} max={30} unit="px" onChange={v => onP({ gap: v })} />
      </>}

      {b.type === 'divider' && <>
        <div className="ivField"><span>Style</span><Seg value={(['line', 'dots', 'sparkle'].includes(p.style) ? p.style : 'heart') as 'line' | 'dots' | 'heart' | 'sparkle'} options={[['heart', '♥'], ['sparkle', '✦'], ['dots', '• • •'], ['line', '—']]} onChange={v => onP({ style: v })} /></div>
        <ColorField label="Colour (default: accent)" value={p.color} fallback="#c25b7a" onChange={v => onP({ color: v })} />
      </>}

      {b.type === 'spacer' && <Range label="Height" value={num(p.height, 40, 4, 300)} min={4} max={300} unit="px" onChange={v => onP({ height: v })} />}

      <details className="ivStyleBox">
        <summary>Section look: background, spacing, animation</summary>
        <div className="ivBFields">
          <ColorField label="Background colour" value={s.bg} fallback="#ffffff" onChange={v => onS({ bg: v })} />
          {b.type !== 'cover' && <PhotoTile label="Background picture" url={s.bgImage} busy={busy === 'bg'} onFile={f => upload(f, 'bg', u => onS({ bgImage: u }))} onClear={() => onS({ bgImage: '' })} />}
          {(s.bgImage || b.type === 'cover') && <Range label="Dark overlay on the picture" value={num(s.overlay, 0, 0, 90)} min={0} max={90} unit="%" onChange={v => onS({ overlay: v })} />}
          <Range label="Minimum height (% of the screen)" value={num(s.minHeight, 0, 0, 100)} min={0} max={100} unit="%" onChange={v => onS({ minHeight: v })} />
          <div className="two">
            <Range label="Space above" value={num(s.padTop, 28, 0, 200)} min={0} max={200} unit="px" onChange={v => onS({ padTop: v })} />
            <Range label="Space below" value={num(s.padBottom, 8, 0, 200)} min={0} max={200} unit="px" onChange={v => onS({ padBottom: v })} />
          </div>
          <div className="ivField"><span>Alignment</span><Seg value={s.align} options={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]} onChange={v => onS({ align: v })} /></div>
          <ColorField label="Text colour in this section" value={s.color} fallback="#333333" onChange={v => onS({ color: v })} />
          <label>When it appears
            <select value={s.anim} onChange={e => onS({ anim: e.target.value as BlockStyle['anim'] })}>
              <option value="rise">Rises up</option><option value="fade">Fades in</option><option value="zoom">Zooms in</option><option value="none">No animation</option>
            </select></label>
        </div>
      </details>
    </div>
  );
}

const ADD_MENU: { key: string; type: BlockType; label: string; icon: React.ElementType; patch?: { p?: Record<string, any>; s?: Partial<BlockStyle> } }[] = [
  { key: 'cover', type: 'cover', label: 'Cover photo', icon: Sparkles },
  { key: 'title', type: 'text', label: 'Big title', icon: Type, patch: { p: { text: 'Big title', font: 'title', size: 40, line: 1.5, accent: true }, s: { padTop: 40 } } },
  { key: 'text', type: 'text', label: 'Text', icon: Type },
  { key: 'image', type: 'image', label: 'Picture', icon: ImageIcon },
  { key: 'button', type: 'button', label: 'Button', icon: ExternalLink },
  { key: 'countdown', type: 'countdown', label: 'Countdown', icon: Timer },
  { key: 'schedule', type: 'schedule', label: 'Programme', icon: List },
  { key: 'gallery', type: 'gallery', label: 'Gallery', icon: LayoutGrid },
  { key: 'divider', type: 'divider', label: 'Divider', icon: Minus },
  { key: 'spacer', type: 'spacer', label: 'Space', icon: ArrowUpDown },
];

function BuilderPanel({ blocks, update, selected, onSelect, setNote }: {
  blocks: Block[]; update: (fn: (bs: Block[]) => Block[]) => void; selected: string; onSelect: (id: string) => void; setNote: (m: string) => void;
}) {
  const [busy, setBusy] = useState('');
  const idx = blocks.findIndex(b => b.id === selected);

  const add = (type: BlockType, patch?: { p?: Record<string, any>; s?: Partial<BlockStyle> }) => {
    const nb = newBlock(type, patch);
    update(bs => { const at = idx >= 0 ? Math.min(idx + 1, bs.length) : bs.length; return [...bs.slice(0, at), nb, ...bs.slice(at)]; });
    onSelect(nb.id);
  };
  const patchBlock = (id: string, fn: (b: Block) => Block) => update(bs => bs.map(x => (x.id === id ? fn(x) : x)));
  const applyP = (x: Block, patch: PatchP): Block => ({ ...x, p: { ...x.p, ...(typeof patch === 'function' ? patch(x.p) : patch) } });
  const move = (id: string, dir: -1 | 1) => update(bs => {
    const i = bs.findIndex(x => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= bs.length) return bs;
    const c = bs.slice(); [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const dup = (id: string) => {
    const nid = uid();
    update(bs => { const i = bs.findIndex(x => x.id === id); if (i < 0) return bs; const copy: Block = JSON.parse(JSON.stringify(bs[i])); copy.id = nid; return [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)]; });
    onSelect(nid);
  };
  const del = (id: string) => { if (!confirm('Delete this block?')) return; update(bs => bs.filter(x => x.id !== id)); if (id === selected) onSelect(''); };

  /* uploads add their result with an update function, so editing something else while a picture uploads is safe */
  const upload: Upload = async (f, label, cb) => {
    setBusy(label); setNote('');
    try { cb(await uploadAsset(f, 'pictures', 'image')); }
    catch (e: any) { setNote(e?.message || 'Upload failed.'); }
    setBusy('');
  };

  return (
    <div className="ivBld">
      <Sub>Add a block{idx >= 0 ? ' (it goes under the selected one)' : ''}</Sub>
      <div className="ivAddGrid">
        {ADD_MENU.map(m => { const Icon = m.icon; return <button type="button" key={m.key} className="ivAddBtn" onClick={() => add(m.type, m.patch)}><Icon /><span>{m.label}</span></button>; })}
      </div>

      <Sub>Your page ({blocks.length} {blocks.length === 1 ? 'block' : 'blocks'})</Sub>
      {!blocks.length && <p className="muted">The page is empty. Add a cover photo, some text, a button… you can also tap anything in the phone preview to edit it.</p>}
      {blocks.map((b, i) => {
        const Icon = BLOCK_DEFS[b.type].icon;
        const open = b.id === selected;
        return (
          <div id={`ivbe-${b.id}`} key={b.id} className={'ivBItem' + (open ? ' open' : '') + (b.hidden ? ' off' : '')}>
            <div className="ivBHead" onClick={() => onSelect(open ? '' : b.id)} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(open ? '' : b.id)}>
              <Icon />
              <div className="grow"><b>{BLOCK_DEFS[b.type].name}</b><small>{blockSummary(b).slice(0, 44)}</small></div>
              <div className="ivBBtns" onClick={e => e.stopPropagation()}>
                <button type="button" className="icon" disabled={i === 0} onClick={() => move(b.id, -1)} aria-label="Move up"><ChevronUp /></button>
                <button type="button" className="icon" disabled={i === blocks.length - 1} onClick={() => move(b.id, 1)} aria-label="Move down"><ChevronDown /></button>
                <button type="button" className="icon" onClick={() => patchBlock(b.id, x => ({ ...x, hidden: !x.hidden }))} aria-label={b.hidden ? 'Show block' : 'Hide block'} title={b.hidden ? 'Hidden: tap to show' : 'Hide from the page'}>{b.hidden ? <EyeOff /> : <Eye />}</button>
                <button type="button" className="icon" onClick={() => dup(b.id)} aria-label="Duplicate block"><Copy /></button>
                <button type="button" className="icon danger" onClick={() => del(b.id)} aria-label="Delete block"><Trash2 /></button>
              </div>
            </div>
            {open && (
              <div className="ivBBody">
                <BlockEditor b={b} blocks={blocks} busy={busy} setNote={setNote} upload={upload}
                  onP={patch => patchBlock(b.id, x => applyP(x, patch))}
                  onS={patch => patchBlock(b.id, x => ({ ...x, s: { ...x.s, ...patch } }))} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InviteEditor({ row, blank = false, onClose }: { row: Row | null; blank?: boolean; onClose: () => void }) {
  const [id, setId] = useState<string | null>(row?.id || null);
  const [data, setData] = useState<InviteData>(() => (blank && !row ? blankData() : merge(row?.data)));
  const [priv, setPriv] = useState<Private>(PRIVATE_DEFAULTS);
  const [title, setTitle] = useState(row?.title || '');
  const [slug, setSlug] = useState(row?.slug || (blank ? `invite-${randomTail()}${randomTail()}` : ''));
  const [published, setPublished] = useState(row?.published ?? false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [replay, setReplay] = useState(0);
  const [qr, setQr] = useState('');
  const [dirty, setDirty] = useState(false);
  const slugTouched = useRef(!!row || blank);
  const [selected, setSelected] = useState('');
  const pickFrom = useRef<'list' | 'preview'>('list');
  const custom = data.layout === 'custom';

  const set = (patch: Partial<InviteData>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
  const setIn = <K extends 'look' | 'opening' | 'butterflies'>(k: K, patch: Partial<InviteData[K]>) => { setData(d => ({ ...d, [k]: { ...d[k], ...patch } })); setDirty(true); };
  const setP = (patch: Partial<Private>) => { setPriv(p => ({ ...p, ...patch })); setDirty(true); };
  const updateBlocks = (fn: (bs: Block[]) => Block[]) => { setData(d => ({ ...d, blocks: fn(d.blocks) })); setDirty(true); };
  const setPage = (patch: Partial<InviteData['page']>) => { setData(d => ({ ...d, page: { ...d.page, ...patch } })); setDirty(true); };
  const selectBlock = (id: string, from: 'list' | 'preview' = 'list') => { pickFrom.current = from; setSelected(id); };
  /* picking a block in the list scrolls the phone preview to it; tapping it in the preview scrolls the list to it */
  useEffect(() => {
    if (!selected) return;
    const t = window.setTimeout(() => {
      if (pickFrom.current === 'list') scrollToBlock(selected);
      else document.getElementById('ivbe-' + selected)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [selected]);
  function switchLayout(next: 'classic' | 'custom') {
    if (next === data.layout) return;
    const hasInfo = !!(data.groom || data.bride || data.date || data.venue || data.gallery.length || data.groomPhoto || data.bridePhoto);
    if (next === 'custom' && !data.blocks.length && hasInfo && confirm('Fill the free builder with what you already typed (names, date, place, photos…)?\n\nOK = fill it, you can then change everything.\nCancel = start with an empty page.')) {
      set({ layout: 'custom', blocks: blocksFromClassic(data) });
      return;
    }
    set({ layout: next });
  }

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
  useEffect(() => { if (custom && !slugTouched.current) { const base = slugify(title); if (base.length >= 3) setSlug(s => (s && s.startsWith(base) ? s : `${base}-${randomTail()}`)); } }, [title]); // eslint-disable-line react-hooks/exhaustive-deps
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

        <div className="panel ivModeBox">
          <b>How do you want to edit this invitation?</b>
          <div className="ivSegX">
            <button type="button" className={custom ? 'on' : ''} onClick={() => switchLayout('custom')}>Free builder (edit everything)</button>
            <button type="button" className={!custom ? 'on' : ''} onClick={() => switchLayout('classic')}>Guided form</button>
          </div>
          <small className="muted">{custom ? 'Start from a blank page and add any text, picture, button or countdown you like, in any order. Tap things in the phone preview to edit them.' : 'Fill in the form and the invitation is laid out for you. Switch to the free builder any time to change every detail.'}</small>
        </div>

        {custom && (
          <>
            <Card title="Page builder" icon={<Sparkles />} open>
              <BuilderPanel blocks={data.blocks} update={updateBlocks} selected={selected} onSelect={id => selectBlock(id, 'list')} setNote={setNote} />
            </Card>
            <Card title="Page background" icon={<ImagePlus />}>
              <ColorField label="Background colour" value={data.page.bg} fallback={(PALETTES[data.look.palette] || PALETTES.white).bg} onChange={v => setPage({ bg: v })} />
              <ColorField label="Default text colour" value={data.page.text} fallback={(PALETTES[data.look.palette] || PALETTES.white).text} onChange={v => setPage({ text: v })} />
              <PhotoTile label="Background picture (optional)" url={data.page.bgImage} busy={busy === 'Uploading background…'} onFile={f => pick(f, 'image', u => setPage({ bgImage: u }), 'Uploading background…')} onClear={() => setPage({ bgImage: '' })} />
              <small className="muted">Each block can also have its own background in its “Section look”.</small>
            </Card>
          </>
        )}

        {!custom && <>
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
        </>}

        {/* 4 ----------------------------------------------------------- */}
        <Card title={custom ? 'Look, language, opening, butterflies & music' : '4. Invitation Design'} icon={<Sparkles />} open={!custom}>
          {!custom && <>
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

          </>}

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
        <Card title={custom ? 'Private notes (only you)' : '5. Other Information'} icon={<Link2 />} open={!custom}>
          {!custom && <>
          <div className="two">
            <label>Contact phone number (ទូរស័ព្ទ)<input value={data.phone} onChange={e => set({ phone: e.target.value })} placeholder="+855 …" /></label>
            <label>Telegram username (optional)<input value={data.telegram} onChange={e => set({ telegram: e.target.value })} placeholder="@username" /></label>
          </div>
          <small className="muted">The phone and Telegram become “Call us” and “Telegram” buttons for guests.</small>
          </>}
          <label>Preferred completion date<input type="date" value={priv.completionDate} onChange={e => setP({ completionDate: e.target.value })} /></label>
          <label>Special instructions for the designer<textarea rows={3} value={priv.designerNotes} onChange={e => setP({ designerNotes: e.target.value })} placeholder="Only you can see this. It is never shown to guests." /></label>
        </Card>

        {/* publish ----------------------------------------------------- */}
        <Card title="Publish & share link" icon={<Link2 />} open>
          <label>Name for this invitation (only you see it)<input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} placeholder="Sokha & Dara wedding" /></label>
          <label>Link ending
            <div className="ivSlug"><span>{PUBLIC_HOST}/i/</span><input value={slug} onChange={e => { slugTouched.current = true; setSlug(slugify(e.target.value)); setDirty(true); }} placeholder="sokha-dara" /></div></label>
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
        <div className="ivPhone"><div className="ivPhoneScreen"><InvitationView data={data} preview replayKey={replay} selectedId={selected} onSelectBlock={custom ? id => selectBlock(id, 'preview') : undefined} /></div></div>
        <small className="muted">{custom ? 'Live preview. Tap any part of the page to edit it.' : 'Live preview. Tap the opening to try it, including the music.'}</small>
      </aside>
    </div>
  );
}
