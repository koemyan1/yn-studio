import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Copy, ExternalLink, Save, ArrowLeft, Music2, Upload, X, Heart,
  Link2, Eye, EyeOff, RefreshCw, ImagePlus, MapPin, CalendarDays, Sparkles, Volume2, VolumeX, SkipForward,
  Move, Users, Share2, Search, UserPlus, Check, Send, MousePointerClick, Play,
} from 'lucide-react';
import { supabase } from './supabase';
import { tr, useLang } from './lang';
import { CinematicView, type CineViewHandle } from './Cinematic';
import type { CineCfg, EditHit, CineEl, Tweak } from './cinematic/types';
import { blankEl, TWEAK_DEFAULT } from './cinematic/extras';
import { TEXT } from './cinematic/text';
import { optimizeImage } from './imageTools';
import { CanvasBuilder, CanvasPages, emptyCanvas, type Canvas } from './InviteCanvas';
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
  /* 'form' = guided form, 'canvas' = free-form blank canvas */
  mode: 'form' | 'canvas' | 'cinematic'; canvas?: Canvas; cine: CineData;
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
  opening: { style: OpenStyle; image: string; title: string; button: string; doorImage: string; bottomImage: string; buttonImage: string;
    /* where the open button and the guest-name space sit on the opening page, in % of the screen (null = default spot) */
    btnPos: { x: number; y: number } | null; nameEnabled: boolean; namePos: { x: number; y: number } | null; nameSize: number; nameColor: string };
  butterflies: { enabled: boolean; count: number; size: number; color: string; mix: boolean };
  songs: Song[];
  /* 5. Contact (shown to guests as buttons) */
  phone: string; telegram: string;
};
/* Never shown to guests: kept in a separate admin-only table. */
type Private = { completionDate: string; requests: string; designerNotes: string };
const PRIVATE_DEFAULTS: Private = { completionDate: '', requests: '', designerNotes: '' };

/* Cinematic mode: the extra details it needs (everything else reuses the fields the guided form already has). */
export type CineData = {
  groomEn: string; brideEn: string; groomShort: string; brideShort: string;
  groomFather: string; groomMother: string; brideFather: string; brideMother: string;
  lunar: string; lat: string; lng: string; words: string; blessing: string; thanks: string;
  archPhoto: string; groomPhoto: string; bridePhoto: string; candlePhoto: string;
  story: { photo: string; caption: string }[]; qrs: { label: string; url: string }[];
  palette: 'jade' | 'silk' | 'olive' | 'rose' | 'navy' | 'custom'; paper: string; cream: string; night: string; foil: 'gold' | 'rose' | 'silver'; wax: string; ogImage: string;
  /* wording the admin changed by clicking it on the preview, per language (anything not here keeps the standard wording) */
  texts: { km: Record<string, string>; en: Record<string, string> };
  /* free elements added on the preview, and move / size / turn / photo-focus tweaks of the built-in parts */
  extras: CineEl[]; tweaks: Record<string, Partial<Tweak>>;
};
type CinePalette = { name: string; paper: string; cream: string; night: string; foil: 'gold' | 'rose' | 'silver'; wax: string };
/* Each palette is five colours that belong together: envelope paper, card cream, dark background, foil, and a wax that contrasts with the paper. */
const CINE_PALETTES: Record<string, CinePalette> = {
  jade: { name: 'Jade + ruby wax', paper: '#2e6b5c', cream: '#f8f1de', night: '#0a1f1b', foil: 'gold', wax: '#a3202f' },
  silk: { name: 'Silk magenta + jade wax', paper: '#9b2a63', cream: '#fbf0e2', night: '#25091a', foil: 'gold', wax: '#1f6a57' },
  rose: { name: 'Blush + wine wax', paper: '#e8c7b8', cream: '#fdf7f0', night: '#2b1824', foil: 'rose', wax: '#7d2c3b' },
  navy: { name: 'Indigo + pearl wax', paper: '#2c4a86', cream: '#eef2f7', night: '#0a1226', foil: 'silver', wax: '#e6e1d4' },
};
CINE_PALETTES.olive = CINE_PALETTES.jade; // invitations saved with the old green palette now get the new green
const CINE_DEFAULTS: CineData = {
  groomEn: '', brideEn: '', groomShort: '', brideShort: '', groomFather: '', groomMother: '', brideFather: '', brideMother: '',
  lunar: '', lat: '', lng: '', words: '', blessing: '', thanks: '', archPhoto: '', groomPhoto: '', bridePhoto: '', candlePhoto: '',
  story: [], qrs: [], palette: 'jade', paper: CINE_PALETTES.jade.paper, cream: CINE_PALETTES.jade.cream, night: CINE_PALETTES.jade.night, foil: 'gold', wax: CINE_PALETTES.jade.wax, ogImage: '', texts: { km: {}, en: {} }, extras: [], tweaks: {},
};
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
  mode: 'form', cine: CINE_DEFAULTS,
  groom: '', bride: '', groomParents: '', brideParents: '',
  date: '', weekday: '', time: '', receptionTime: '', venue: '', address: '', mapUrl: '',
  message: TXT.km.message, headline: TXT.km.headline,
  schedule: [],
  template: 'blush-garden', groomPhoto: '', bridePhoto: '', gallery: [],
  lang: 'km',
  khFonts: { names: 'moul', title: 'moulpali', body: 'body' },
  look: { palette: 'blush', accent: '', font: 'elegant' },
  opening: { style: 'envelope', image: '', title: TXT.km.otitle, button: TXT.km.obtn, doorImage: '', bottomImage: '', buttonImage: '', btnPos: null, nameEnabled: false, namePos: null, nameSize: 22, nameColor: '#ffffff' },
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
  cine: { ...CINE_DEFAULTS, ...(raw?.cine || {}), story: Array.isArray(raw?.cine?.story) ? raw.cine.story : [], qrs: Array.isArray(raw?.cine?.qrs) ? raw.cine.qrs : [],
    texts: { km: { ...(raw?.cine?.texts?.km || {}) }, en: { ...(raw?.cine?.texts?.en || {}) } },
    extras: Array.isArray(raw?.cine?.extras) ? raw.cine.extras : [], tweaks: raw?.cine?.tweaks && typeof raw.cine.tweaks === 'object' ? raw.cine.tweaks : {} },
  opening: { ...DEFAULTS.opening, ...(raw?.opening || {}) },
  butterflies: { ...DEFAULTS.butterflies, ...(raw?.butterflies || {}) },
  songs: Array.isArray(raw?.songs) ? raw.songs : [],
  gallery: Array.isArray(raw?.gallery) ? raw.gallery : [],
  /* older invitations stored {time,label}; keep them working */
  schedule: Array.isArray(raw?.schedule) ? raw.schedule.map((x: any) => ({ name: x?.name ?? x?.label ?? '', date: x?.date ?? '', time: x?.time ?? '' })) : [],
});

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const randomTail = () => Math.random().toString(36).slice(2, 6);
const inviteUrl = (slug: string, code?: string) => `${window.location.origin}/i/${slug}${code ? '/' + code : ''}`;
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);

let fontsLoaded = false;
function useInviteFonts() {
  useEffect(() => {
    if (fontsLoaded) return;
    fontsLoaded = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Great+Vibes&family=Cormorant+Garamond:wght@400;600;700&family=Parisienne&family=Dancing+Script:wght@500;700&family=Kantumruy+Pro:wght@400;600;700&family=Moul&family=Moulpali&family=Noto+Serif+Khmer:wght@400;600&family=Pinyon+Script&display=swap';
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

type Pos = { x: number; y: number };
const pct = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10;

function OpeningScene({ d, guestName, preview, layoutEdit, onLayout, onOpen, onGone }: {
  d: InviteData; guestName: string; preview: boolean; layoutEdit: boolean;
  onLayout?: (patch: { btnPos?: Pos; namePos?: Pos }) => void; onOpen: () => void; onGone: () => void;
}) {
  const [phase, setPhase] = useState<'closed' | 'opening' | 'gone'>('closed');
  const root = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<'btn' | 'name' | null>(null);

  /* admin: drag the button / name straight on the preview */
  useEffect(() => {
    if (!layoutEdit) return;
    const move = (e: PointerEvent) => {
      const k = dragging.current, el = root.current; if (!k || !el || !onLayout) return;
      const r = el.getBoundingClientRect();
      const pos = { x: pct(((e.clientX - r.left) / r.width) * 100, 4, 96), y: pct(((e.clientY - r.top) / r.height) * 100, 3, 97) };
      onLayout(k === 'btn' ? { btnPos: pos } : { namePos: pos });
    };
    const up = () => { dragging.current = null; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  });

  const L = labelsFor(d.lang);
  const img = d.opening.image;
  const names = [d.groom, d.bride].filter(Boolean).join(' & ') || (d.lang === 'en' ? 'Groom & Bride' : 'កូនកំលោះ & កូនក្រមុំ');
  const open = () => {
    if (phase !== 'closed' || layoutEdit) return;
    setPhase('opening');
    onOpen();
    window.setTimeout(() => { setPhase('gone'); onGone(); }, d.opening.style === 'envelope' ? 2600 : 2100);
  };
  if (phase === 'gone') return null;
  const st = d.opening.style;
  const bg: React.CSSProperties = img ? { backgroundImage: `url("${img}")` } : {};
  const doorImg = d.opening.doorImage || img;
  const doorBg: React.CSSProperties = doorImg ? { backgroundImage: `url("${doorImg}")` } : {};
  const btnImg = d.opening.buttonImage;
  const btnStyle: React.CSSProperties | undefined = btnImg ? { backgroundImage: `url("${btnImg}")` } : undefined;
  const btnCls = 'ivOpenBtn' + (btnImg ? ' ivBtnImg' : '');
  const btn = loc(d.opening.button, 'obtn', d.lang);
  const otitle = loc(d.opening.title, 'otitle', d.lang);

  const btnPos = d.opening.btnPos || { x: 50, y: st === 'envelope' ? 86 : 78 };
  const namePos = d.opening.namePos || { x: 50, y: st === 'envelope' ? 18 : 64 };
  const shownName = d.opening.nameEnabled ? (guestName || (preview ? 'ឈ្មោះភ្ញៀវ' : '')) : '';
  const grab = (k: 'btn' | 'name') => layoutEdit ? { onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); dragging.current = k; } } : {};

  return (
    <div ref={root} className={`ivOpen ivOpen-${st} ${phase === 'opening' ? 'go' : ''}`} role="dialog" aria-label="Invitation cover">
      <div className="ivOpenBg" style={bg} />
      <div className="ivOpenShade" />

      {st === 'curtains' && <><div className="ivCurtain ivCurtainL" /><div className="ivCurtain ivCurtainR" /></>}
      {st === 'doors' && <><div className="ivDoor ivDoorL" style={doorBg}>{!d.opening.doorImage && <i />}</div><div className="ivDoor ivDoorR" style={doorBg}>{!d.opening.doorImage && <i />}</div></>}

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
        </div>
      ) : (
        <div className="ivOpenCenter">
          <p className="ivOpenKicker">{otitle}</p>
          <h2 className={'ivOpenNames' + (HAS_KHMER.test(names) || (!d.groom && !d.bride && d.lang !== 'en') ? ' ivKh' : '')}>{names}</h2>
        </div>
      )}

      {/* the guest-name space (optional) and the open button can sit anywhere on the page */}
      {(shownName || (layoutEdit && d.opening.nameEnabled)) && (
        <div className={'ivPos ivPosName' + (layoutEdit ? ' edit' : '')} data-label="Guest name" style={{ left: `${namePos.x}%`, top: `${namePos.y}%` }} {...grab('name')}>
          <span className="ivGuestName" style={{ fontSize: d.opening.nameSize || 22, color: d.opening.nameColor || '#ffffff', fontFamily: KH_FONTS.moul.stack + ',serif' }}>{shownName}</span>
        </div>
      )}
      <div className={'ivPos ivPosBtn' + (layoutEdit ? ' edit' : '')} data-label="Open button" style={{ left: `${btnPos.x}%`, top: `${btnPos.y}%` }} {...grab('btn')}>
        <button type="button" className={btnCls} style={btnStyle} onClick={open} aria-label={btn}>{btnImg ? '' : <><Heart /> {btn}</>}</button>
      </div>

      {d.opening.bottomImage && <img className="ivOpenBottom" src={d.opening.bottomImage} alt="" />}
    </div>
  );
}

/* ------------------------------------------------------------------ cinematic config ------------------------------------------------------------------ */
function buildCineCfg(d: InviteData, lang: Lang, guestName: string, preview: boolean, shareUrl: string): CineCfg {
  const L: 'km' | 'en' = lang === 'en' ? 'en' : 'km';
  const c = d.cine, p = parseDate(d.date);
  const pal: { paper: string; cream: string; night: string; foil: 'gold' | 'rose' | 'silver'; wax?: string } = c.palette === 'custom' ? { paper: c.paper, cream: c.cream, night: c.night, foil: c.foil, wax: c.wax || undefined } : CINE_PALETTES[c.palette] || CINE_PALETTES.jade;
  const when = d.date ? new Date(`${d.date}T${d.time || '09:00'}:00`) : null;
  const ok = when && Number.isFinite(when.getTime()) ? when : null;
  const iso = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:00`;
  const names = [d.groom || c.groomEn, d.bride || c.brideEn].filter(Boolean).join(' & ');
  return {
    lang: L,
    groomShort: c.groomShort, brideShort: c.brideShort, groomKh: d.groom, brideKh: d.bride, groomEn: c.groomEn, brideEn: c.brideEn,
    groomFather: c.groomFather, groomMother: c.groomMother, brideFather: c.brideFather, brideMother: c.brideMother,
    dateParts: p ? { wd: L === 'km' ? KH_WD[p.wd] : EN_WD[p.wd], d: L === 'km' ? khNum(p.d) : String(p.d), m: L === 'km' ? KH_MONTHS[p.mo - 1] : EN_MONTHS[p.mo - 1], y: L === 'km' ? khNum(p.y) : String(p.y) } : null,
    dateLong: [fmtDate(d.date, d.weekday, L), fmtTime(d.time, L)].filter(Boolean).join(' · '),
    lunar: c.lunar, venue: d.venue, lat: c.lat.trim(), lng: c.lng.trim(), mapUrl: d.mapUrl,
    target: ok ? ok.getTime() : null,
    ics: ok ? { title: names || 'Wedding', start: iso(ok), end: iso(new Date(ok.getTime() + 4 * 3600 * 1000)), location: d.venue.replace(/\n/g, ', ') } : null,
    words: c.words, blessing: c.blessing, thanks: c.thanks,
    photo: d.opening.image || d.gallery[0] || '', archPhoto: c.archPhoto || d.gallery[0] || '', groomPhoto: c.groomPhoto, bridePhoto: c.bridePhoto, candlePhoto: c.candlePhoto,
    gallery: d.gallery, story: c.story.map((x, i) => ({ ...x, i })), qrs: c.qrs.map((q, i) => ({ ...q, i })).filter(q => q.url),
    schedule: d.schedule.map((e, i) => ({ e, i })).filter(({ e }) => e.name).map(({ e, i }) => ({ time: fmtTime(e.time, L), name: e.name, date: fmtShort(e.date, L), i })),
    texts: c.texts?.[L], extras: c.extras, tweaks: c.tweaks,
    guestName: d.opening.nameEnabled ? guestName : '', shareUrl, shareTitle: names ? `${names} · ${L === 'km' ? 'សិរីសួស្តីអាពាហ៍ពិពាហ៍' : 'Wedding invitation'}` : '',
    palette: { paper: pal.paper, cream: pal.cream, night: pal.night, foil: pal.foil, wax: pal.wax }, preview,
  };
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

export function InvitationView({ data, preview = false, replayKey = 0, onViewed, guestName = '', layoutEdit = false, onLayout, shareUrl = '', cineEdit = false, cineSelected = '', onCineEdit, onCineXform, cineApi }: {
  data: InviteData; preview?: boolean; replayKey?: number; onViewed?: () => void; guestName?: string; layoutEdit?: boolean; onLayout?: (patch: { btnPos?: Pos; namePos?: Pos }) => void; shareUrl?: string;
  /* cinematic click-to-edit (admin preview only) */
  cineEdit?: boolean; cineSelected?: string; onCineEdit?: (hit: EditHit) => void; onCineXform?: (key: string, patch: Record<string, number | boolean>) => void; cineApi?: React.MutableRefObject<CineViewHandle | null>;
}) {
  useInviteFonts();
  /* Guests start in the invitation's language (Khmer by default) and can switch, unless it is set to bilingual. */
  const [lang, setLang] = useState<Lang>(data.lang);
  useEffect(() => { setLang(data.lang); }, [data.lang]);
  const d = useMemo(() => ({ ...data, lang }), [data, lang]);
  const cinematic = data.mode === 'cinematic';
  const cineCfg = useMemo(() => (cinematic ? buildCineCfg(data, lang, guestName, preview, shareUrl) : null), [cinematic, data, lang, guestName, preview, shareUrl]);
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
      {cinematic && cineCfg ? <CinematicView cfg={cineCfg} replayKey={replayKey} onOpen={() => { setOpened(true); startMusic(); }} edit={cineEdit} selected={cineSelected} onEdit={onCineEdit} onXform={onCineXform} apiRef={cineApi} /> : (
      <div className={`ivScroll ${gone ? '' : 'ivLocked'}`}>
        {data.mode === 'canvas' && data.canvas ? <CanvasPages canvas={data.canvas} date={d.date} time={d.time} labels={L} /> : <>
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
        </>}
      </div>)}

      {!cinematic && <Butterflies cfg={d.butterflies} />}
      {data.lang !== 'both' && data.mode !== 'canvas' && (
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
      <audio ref={audio} preload="auto" loop={songs.length === 1} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded} playsInline />

      {!gone && !cinematic && <OpeningScene key={replayKey + d.opening.style} d={d} guestName={guestName} preview={preview} layoutEdit={layoutEdit} onLayout={onLayout} onOpen={() => { setOpened(true); startMusic(); }} onGone={() => setGone(true)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Public page (no login) ------------------------------------------------------------------ */

export function InvitePublic() {
  const { slug = '', code = '' } = useParams();
  const [guestName, setGuestName] = useState('');
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
      let who = '';
      if (code) {
        /* a personal link: ask for the name that belongs to it (counts one open per visit) */
        let first = true;
        try { const k = 'yn-inv-guest-' + code; first = !sessionStorage.getItem(k); sessionStorage.setItem(k, '1'); } catch { /* ignore */ }
        const g = await supabase.rpc('invitation_guest_name', { p_slug: slug.toLowerCase(), p_code: code.toLowerCase(), p_count: first });
        if (typeof g.data === 'string') who = g.data;
        if (!live) return;
      }
      setGuestName(who);
      const merged = merge(r.data.data);
      setData(merged); setTitle(r.data.title || 'Wedding invitation'); setState('ok');
      const names = [merged.groom, merged.bride].filter(Boolean).join(' & ');
      document.title = names ? `${names} · Wedding invitation` : r.data.title || 'Wedding invitation';
    })();
    return () => { live = false; };
  }, [slug, code]);

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
  return <InvitationView data={data} guestName={guestName} onViewed={countView} shareUrl={inviteUrl(slug.toLowerCase())} />;
}

/* ------------------------------------------------------------------ Admin ------------------------------------------------------------------ */

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Row = { id: string; slug: string; title: string; published: boolean; data: any; views: number; customer_id?: string | null; created_at: string; updated_at: string };

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
  const [editing, setEditing] = useState<Row | 'new' | 'new-canvas' | null>(null);

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

  if (editing) return <Shell title="Wedding invitation"><InviteEditor row={typeof editing === 'string' ? null : editing} startCanvas={editing === 'new-canvas'} onClose={() => { setEditing(null); load(); }} /></Shell>;

  return (
    <Shell title="Wedding Invitations">
      <div className="toolbar"><button onClick={() => setEditing('new')}><Plus /> New invitation (guided form)</button><button className="secondary" onClick={() => setEditing('new-canvas')}><Plus /> New blank canvas</button></div>
      {err && <p className="notice">{err}</p>}
      <div className="table">
        {(rows || []).map(x => (
          <div className="tr ivRow" key={x.id}>
            <div className="ivRowThumb" style={x.data?.opening?.image ? { backgroundImage: `url("${x.data.opening.image}")` } : undefined}><Heart /></div>
            <div className="grow"><b>{x.title}</b><small>/i/{x.slug} · {x.views} opens{x.customer_id ? ' · sent to a customer' : ''}</small></div>
            <span className={'status ' + (x.published ? 'published' : 'unpublished')}>{x.published ? 'live' : 'draft'}</span>
            <button className="secondary" onClick={() => copy(x.slug)} title="Copy link"><Copy /><span>Copy link</span></button>
            {x.published && <a className="secondary button" href={inviteUrl(x.slug)} target="_blank" rel="noopener noreferrer" title="Open"><ExternalLink /></a>}
            <button className="secondary" onClick={() => togglePublish(x)}>{x.published ? <><EyeOff />Unpublish</> : <><Eye />Publish</>}</button>
            <button className="editProductButton" onClick={() => setEditing(x)}><Pencil /><span>Edit</span></button>
            <button className="icon danger" onClick={() => remove(x)} title="Delete"><Trash2 /></button>
          </div>
        ))}
        {rows && !rows.length && !err && <p className="muted" style={{ padding: 20 }}>No invitations yet. Start with the guided form, or a blank canvas to design every piece yourself.</p>}
      </div>
    </Shell>
  );
}

function Card({ title, icon, children, open = false, hide = false }: { title: string; icon?: React.ReactNode; children: React.ReactNode; open?: boolean; hide?: boolean }) {
  if (hide) return null;
  return <details className="panel ivCardAdmin" open={open}><summary>{icon}<b>{title}</b></summary><div className="ivCardBody">{children}</div></details>;
}

/* ------------------------------------------------------------------ guest names & personal links ------------------------------------------------------------------ */

type Guest = { id: string; code: string; name: string; opens: number; created_at: string };
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const newCode = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return Array.from(a, x => CODE_CHARS[x % CODE_CHARS.length]).join(''); };
const cleanName = (n: string) => n.replace(/\s+/g, ' ').trim().slice(0, 80);

/* Used by the admin (for a customer) and by the customer on their Services page. */
export function GuestLinks({ invId, slug, published }: { invId: string; slug: string; published: boolean }) {
  useLang();
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [name, setName] = useState('');
  const [many, setMany] = useState(false);
  const [bulk, setBulk] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await supabase.from('wedding_invitation_guests').select('id,code,name,opens,created_at').eq('invitation_id', invId).order('created_at', { ascending: false }).limit(5000);
    if (r.error) { setMsg(/wedding_invitation_guests|schema cache|relation/i.test(r.error.message) ? 'Run the latest supabase-wedding-invitations.sql in Supabase first.' : r.error.message); setGuests([]); return; }
    setGuests((r.data || []) as Guest[]);
  }, [invId]);
  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setMsg(t); window.setTimeout(() => setMsg(''), 2600); };
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); flash(tr('Link copied', 'បានចម្លងតំណ')); } catch { prompt(tr('Copy this link', 'ចម្លងតំណនេះ'), url); } };
  const share = async (g: Guest) => {
    const url = inviteUrl(slug, g.code);
    if ((navigator as any).share) { try { await (navigator as any).share({ title: g.name, text: g.name, url }); return; } catch { /* cancelled */ } }
    copy(url);
  };

  async function add(names: string[]) {
    const list = Array.from(new Set(names.map(cleanName).filter(Boolean)));
    if (!list.length) return;
    setBusy(true);
    let rows = list.map(n => ({ invitation_id: invId, name: n, code: newCode() }));
    let err: any = null;
    for (let t = 0; t < 4; t++) {
      const r = await supabase.from('wedding_invitation_guests').insert(rows);
      err = r.error;
      if (!err || err.code !== '23505') break;
      rows = rows.map(x => ({ ...x, code: newCode() })); // a code collided (very rare): draw new ones
    }
    setBusy(false);
    if (err) { flash(err.message); return; }
    setName(''); setBulk(''); flash(tr(`${list.length} added`, `បានបន្ថែម ${list.length}`));
    load();
  }
  async function rename(g: Guest) {
    const n = prompt(tr('Guest name', 'ឈ្មោះភ្ញៀវ'), g.name); if (n === null) return;
    const v = cleanName(n); if (!v) return;
    const r = await supabase.from('wedding_invitation_guests').update({ name: v }).eq('id', g.id);
    if (r.error) flash(r.error.message); else load();
  }
  async function remove(g: Guest) {
    if (!confirm(tr(`Remove “${g.name}”? Their personal link will then open the invitation without a name.`, `លុប “${g.name}” ? តំណផ្ទាល់ខ្លួនរបស់គាត់នឹងបើកធៀបអញ្ជើញដោយគ្មានឈ្មោះ។`))) return;
    const r = await supabase.from('wedding_invitation_guests').delete().eq('id', g.id);
    if (r.error) flash(r.error.message); else setGuests(gs => (gs || []).filter(x => x.id !== g.id));
  }

  const shown = (guests || []).filter(g => !q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="gl">
      <div className="glOrig">
        <b>{tr('Original link (no name)', 'តំណដើម (គ្មានឈ្មោះ)')}</b>
        <div className="glRow"><code>{inviteUrl(slug)}</code>
          <button type="button" className="secondary" onClick={() => copy(inviteUrl(slug))}><Copy /> {tr('Copy', 'ចម្លង')}</button>
          {published && <a className="secondary button" href={inviteUrl(slug)} target="_blank" rel="noopener noreferrer" aria-label="Open"><ExternalLink /></a>}
        </div>
      </div>
      {!published && <p className="notice">{tr('The invitation is not published yet. These links start working as soon as it is.', 'ធៀបអញ្ជើញមិនទាន់បានផ្សាយនៅឡើយទេ។ តំណទាំងនេះនឹងដំណើរការភ្លាមៗនៅពេលផ្សាយ។')}</p>}

      <b className="glHead"><UserPlus /> {tr('Add a guest name', 'បន្ថែមឈ្មោះភ្ញៀវ')}</b>
      {!many ? (
        <div className="glRow">
          <input value={name} maxLength={80} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add([name]); }} placeholder={tr('e.g. Uncle Sokha', 'ឧ. លោកពូ សុខា')} />
          <button type="button" onClick={() => add([name])} disabled={busy || !cleanName(name)}><Plus /> {tr('Add', 'បន្ថែម')}</button>
        </div>
      ) : (
        <div className="glBulk">
          <textarea rows={5} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={tr('One name per line', 'ឈ្មោះមួយក្នុងមួយបន្ទាត់')} />
          <button type="button" onClick={() => add(bulk.split('\n'))} disabled={busy || !bulk.trim()}><Plus /> {tr('Add all', 'បន្ថែមទាំងអស់')}</button>
        </div>
      )}
      <button type="button" className="glLink" onClick={() => setMany(m => !m)}>{many ? tr('Add one name', 'បន្ថែមមួយឈ្មោះ') : tr('Add many names at once', 'បន្ថែមច្រើនឈ្មោះក្នុងពេលតែមួយ')}</button>
      {msg && <p className="notice">{msg}</p>}

      <b className="glHead"><Users /> {tr('Guest links', 'តំណភ្ញៀវ')} {guests ? `(${guests.length})` : ''}</b>
      {(guests?.length || 0) > 8 && <div className="glSearch"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder={tr('Search names', 'ស្វែងរកឈ្មោះ')} /></div>}
      <ul className="glList">
        {shown.map(g => (
          <li key={g.id}>
            <div className="glName"><b>{g.name}</b><small>{g.opens ? tr(`opened ${g.opens}×`, `បានបើក ${g.opens} ដង`) : tr('not opened yet', 'មិនទាន់បានបើក')} · …/{g.code}</small></div>
            <button type="button" className="secondary" onClick={() => copy(inviteUrl(slug, g.code))}><Copy /><span>{tr('Copy link', 'ចម្លងតំណ')}</span></button>
            <button type="button" className="secondary icon" onClick={() => share(g)} aria-label="Share"><Share2 /></button>
            <button type="button" className="secondary icon" onClick={() => rename(g)} aria-label="Rename"><Pencil /></button>
            <button type="button" className="icon danger" onClick={() => remove(g)} aria-label="Remove"><Trash2 /></button>
          </li>))}
      </ul>
      {guests && !guests.length && <p className="muted">{tr('No names yet. Add a name and it gets its own link.', 'មិនទាន់មានឈ្មោះនៅឡើយទេ។ បន្ថែមឈ្មោះ ហើយវានឹងមានតំណផ្ទាល់ខ្លួន។')}</p>}
    </div>
  );
}

/* The finished invitation the admin sent to this customer, shown on the Services page.
   Tap it to open a sheet where the customer adds guest names (each gets a personal link). */
export function MyInvitations() {
  useLang();
  const [rows, setRows] = useState<Row[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const u = (await supabase.auth.getUser()).data.user?.id; if (!u) return;
      const r = await supabase.from('wedding_invitations').select('id,slug,title,published,data,views,customer_id,created_at,updated_at').eq('customer_id', u).order('created_at', { ascending: false });
      if (live && !r.error) setRows((r.data || []) as Row[]);
    })();
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!openId) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [openId]);
  if (!rows.length) return null;
  const cur = rows.find(x => x.id === openId);
  return (
    <section className="myInv" aria-label={tr('Your wedding invitation', 'ធៀបអញ្ជើញរបស់អ្នក')}>
      <h2 className="svcGroup">{tr('Your wedding invitation', 'ធៀបអញ្ជើញមង្គលការរបស់អ្នក')}</h2>
      {rows.map(x => (
        <button type="button" className="myInvCard" key={x.id} onClick={() => setOpenId(x.id)}>
          <span className="myInvIcon"><Heart /></span>
          <span className="myInvTitle"><b>{x.title}</b><small>{x.published ? tr('Tap to add your guests’ names', 'ចុចដើម្បីបន្ថែមឈ្មោះភ្ញៀវ') : tr('We are still preparing it', 'យើងកំពុងរៀបចំ')}</small></span>
          <span className={'status ' + (x.published ? 'published' : 'unpublished')}>{x.published ? tr('Ready', 'រួចរាល់') : tr('Draft', 'ព្រាង')}</span>
        </button>))}
      {cur && (
        <div className="myInvOverlay" onClick={() => setOpenId(null)}>
          <div className="myInvSheet" role="dialog" aria-label={cur.title} onClick={e => e.stopPropagation()}>
            <div className="myInvHead">
              <span className="myInvIcon"><Heart /></span>
              <span className="myInvTitle"><b>{cur.title}</b><small>{cur.published ? tr(`${cur.views} opens`, `បានបើក ${cur.views} ដង`) : tr('Not published yet', 'មិនទាន់ផ្សាយ')}</small></span>
              <button type="button" className="icon" onClick={() => setOpenId(null)} aria-label="Close"><X /></button>
            </div>
            <p className="muted">{tr('Add a guest’s name and they get their own link. When they open it, their name appears on the opening page. You can also share the original link with no name.', 'បន្ថែមឈ្មោះភ្ញៀវ ហើយគាត់នឹងមានតំណផ្ទាល់ខ្លួន។ ពេលគាត់បើក ឈ្មោះរបស់គាត់នឹងបង្ហាញលើទំព័របើក។ អ្នកក៏អាចចែករំលែកតំណដើមដែលគ្មានឈ្មោះបានដែរ។')}</p>
            <GuestLinks invId={cur.id} slug={cur.slug} published={cur.published} />
          </div>
        </div>)}
    </section>
  );
}

function CustomerPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [list, setList] = useState<{ user_id: string; name: string | null; email: string | null }[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { supabase.from('profiles').select('user_id,name,email').order('name').limit(1000).then((r: any) => { if (r?.data) setList(r.data); }, () => {}); }, []);
  const cur = list.find(x => x.user_id === value);
  const hits = q.trim() ? list.filter(x => `${x.name || ''} ${x.email || ''}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  return (
    <div className="cpick">
      {value && <div className="cpickCur"><Check /> <span>{cur ? `${cur.name || 'Customer'} · ${cur.email || ''}` : 'Customer selected'}</span><button type="button" className="secondary" onClick={() => onChange(null)}><X /> Remove</button></div>}
      <div className="glSearch"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a customer by name or email" /></div>
      {hits.map(x => <button type="button" key={x.user_id} className="cpickHit" onClick={() => { onChange(x.user_id); setQ(''); }}><b>{x.name || '(no name)'}</b><small>{x.email}</small></button>)}
    </div>
  );
}

/* link-preview picture (1200x630) for Telegram / Messenger / Facebook: the cover photo, the names, a gold frame */
async function buildOgBlob(photo: string, khNames: string, enNames: string): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
  const x = c.getContext('2d')!;
  x.fillStyle = '#14160c'; x.fillRect(0, 0, 1200, 630);
  if (photo) {
    const img = await new Promise<HTMLImageElement | null>(res => { const i = new window.Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = photo; });
    if (img) { const k = Math.max(1200 / img.naturalWidth, 630 / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k; x.drawImage(img, (1200 - w) / 2, (630 - h) / 2, w, h); }
  }
  const g = x.createLinearGradient(0, 0, 0, 630); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.5, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,.72)');
  x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
  try { await Promise.all([document.fonts.load('60px Moulpali'), document.fonts.load('56px "Pinyon Script"')]); } catch { /* use fallbacks */ }
  const foil = x.createLinearGradient(300, 0, 900, 0); ['#a8761f', '#f3dc94', '#c9a24b', '#fbf0c4', '#a8761f'].forEach((c2, i, a) => foil.addColorStop(i / (a.length - 1), c2));
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = foil;
  x.font = '38px Moulpali, "Kantumruy Pro", serif'; x.fillText('សិរីសួស្តីអាពាហ៍ពិពាហ៍', 600, 170);
  let size = 82; const fit = (t: string, font: (s: number) => string, max: number) => { size = 82; do { x.font = font(size); size -= 3; } while (x.measureText(t).width > max && size > 28); };
  if (khNames) { fit(khNames, s2 => `${s2}px Moulpali, "Kantumruy Pro", serif`, 1020); x.fillText(khNames, 600, 310); }
  if (enNames) { x.fillStyle = '#f6efe0'; fit(enNames, s2 => `${Math.round(s2 * .8)}px "Pinyon Script", "Playfair Display", serif`, 1020); x.fillText(enNames, 600, khNames ? 430 : 330); }
  x.strokeStyle = foil; x.lineWidth = 3; x.strokeRect(30, 30, 1140, 570); x.lineWidth = 1; x.strokeRect(42, 42, 1116, 546);
  return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not create the picture'))), 'image/jpeg', 0.86));
}

function CinematicCard({ data, set, setCine, pick, busy, uploadBlob, uploadFile, setNote, onDate, setIn, setReplay }: {
  data: InviteData; set: (p: Partial<InviteData>) => void; setCine: (p: Partial<CineData>) => void;
  pick: (f: File | undefined, kind: 'image' | 'audio', onUrl: (u: string) => void, label: string) => void; busy: string;
  uploadBlob: (b: Blob) => Promise<string>; uploadFile: (f: File) => Promise<string>; setNote: (t: string) => void; onDate: (d: string) => void;
  setIn: <K extends 'look' | 'opening' | 'butterflies'>(k: K, patch: Partial<InviteData[K]>) => void; setReplay: () => void;
}) {
  const c = data.cine;
  const img = (label: string, key: 'archPhoto' | 'groomPhoto' | 'bridePhoto' | 'candlePhoto', busyKey: string) =>
    <PhotoTile wide label={label} url={c[key]} busy={busy === busyKey} onFile={f => pick(f, 'image', u => setCine({ [key]: u } as Partial<CineData>), busyKey)} onClear={() => setCine({ [key]: '' } as Partial<CineData>)} />;
  const applyPalette = (id: 'jade' | 'silk' | 'rose' | 'navy') => { const q = CINE_PALETTES[id]; setCine({ palette: id, paper: q.paper, cream: q.cream, night: q.night, foil: q.foil, wax: q.wax }); setReplay(); };
  async function makeOg() {
    setNote('Creating the link-preview picture…');
    try {
      const blob = await buildOgBlob(data.opening.image || data.gallery[0] || '', [data.groom, data.bride].filter(Boolean).join('  &  '), [c.groomEn, c.brideEn].filter(Boolean).join('  &  '));
      setCine({ ogImage: await uploadBlob(blob) }); setNote('Link-preview picture created. Save to keep it.');
    } catch (e: any) { setNote(/tainted|security/i.test(e?.message || '') ? 'The photo could not be read for the picture (storage CORS). Try uploading the cover photo again.' : e?.message || 'Could not create the picture.'); }
  }
  return (
    <>
      <Card title="Cinematic invitation" icon={<Sparkles />} open>
        <p className="notice">Envelope with a wax seal → cover → words → couple → countdown → programme → love story → candlelight → gallery → venue → gift → thank you. A section only appears when it has something in it. Nothing is invented: empty fields stay empty.</p>
        <Sub>Names</Sub>
        <div className="two">
          <label>Groom, Khmer (ឈ្មោះកូនកំលោះ)<input value={data.groom} onChange={e => set({ groom: e.target.value })} /></label>
          <label>Bride, Khmer (ឈ្មោះកូនក្រមុំ)<input value={data.bride} onChange={e => set({ bride: e.target.value })} /></label>
        </div>
        <div className="two">
          <label>Groom, English<input value={c.groomEn} onChange={e => setCine({ groomEn: e.target.value })} /></label>
          <label>Bride, English<input value={c.brideEn} onChange={e => setCine({ brideEn: e.target.value })} /></label>
        </div>
        <div className="two">
          <label>Name-logo: groom’s short name<input value={c.groomShort} onChange={e => setCine({ groomShort: e.target.value })} placeholder="first name only" /></label>
          <label>Name-logo: bride’s short name<input value={c.brideShort} onChange={e => setCine({ brideShort: e.target.value })} placeholder="first name only" /></label>
        </div>
        <Sub>Parents (written “លោក …” and “និងលោកស្រី …”)</Sub>
        <div className="two">
          <label>Groom’s father<input value={c.groomFather} onChange={e => setCine({ groomFather: e.target.value })} /></label>
          <label>Groom’s mother<input value={c.groomMother} onChange={e => setCine({ groomMother: e.target.value })} /></label>
          <label>Bride’s father<input value={c.brideFather} onChange={e => setCine({ brideFather: e.target.value })} /></label>
          <label>Bride’s mother<input value={c.brideMother} onChange={e => setCine({ brideMother: e.target.value })} /></label>
        </div>
        <Sub>Date, place and map</Sub>
        <div className="two">
          <label>Wedding date<input type="date" value={data.date} onChange={e => onDate(e.target.value)} /></label>
          <label>Wedding time<input type="time" value={data.time} onChange={e => set({ time: e.target.value })} /></label>
        </div>
        <label>Khmer lunar date (ត្រូវនឹង…)<input value={c.lunar} onChange={e => setCine({ lunar: e.target.value })} /></label>
        <label>Venue / address<textarea rows={2} value={data.venue} onChange={e => set({ venue: e.target.value })} /></label>
        <div className="two">
          <label>Map pin: latitude<input value={c.lat} onChange={e => setCine({ lat: e.target.value })} inputMode="decimal" placeholder="e.g. 11.5564" /></label>
          <label>Map pin: longitude<input value={c.lng} onChange={e => setCine({ lng: e.target.value })} inputMode="decimal" placeholder="e.g. 104.9282" /></label>
        </div>
        <label>Google Maps link (optional)<input value={data.mapUrl} onChange={e => set({ mapUrl: e.target.value })} placeholder="https://maps.google.com/…" /></label>
        <Sub>Wording</Sub>
        <label>Formal invitation words (one line per row; leave empty for the standard words)<textarea rows={5} value={c.words} onChange={e => setCine({ words: e.target.value })} /></label>
        <div className="two">
          <label>Blessing line behind the countdown<input value={c.blessing} onChange={e => setCine({ blessing: e.target.value })} placeholder="optional" /></label>
          <label>Thank-you message<input value={c.thanks} onChange={e => setCine({ thanks: e.target.value })} placeholder="optional" /></label>
        </div>
      </Card>

      <Card title="Photos, love story & gift QR" icon={<ImagePlus />} open>
        <Sub>Cover photo (envelope background and cover)</Sub>
        <div className="ivPhotoPair three">
          <PhotoTile wide label="Cover photo" url={data.opening.image} busy={busy === 'cover'} onFile={f => pick(f, 'image', u => { setIn('opening', { image: u }); setReplay(); }, 'cover')} onClear={() => setIn('opening', { image: '' })} />
          {img('Arch photo (words section)', 'archPhoto', 'arch')}
          {img('Groom photo', 'groomPhoto', 'gph')}
          {img('Bride photo', 'bridePhoto', 'bph')}
          {img('Candlelight photo', 'candlePhoto', 'cph')}
        </div>
        <Sub>Gallery (masonry + swipe viewer)</Sub>
        <div className="ivGalleryAdmin">
          {data.gallery.map((u, i) => (
            <div key={u + i} className="ivGThumb" style={{ backgroundImage: `url("${u}")` }}>
              <button className="icon danger" onClick={() => set({ gallery: data.gallery.filter((_, j) => j !== i) })} aria-label="Remove photo"><X /></button>
            </div>))}
          <label className="ivGAdd"><Plus /><span>{busy === 'gal' ? '…' : 'Add'}</span>
            <input type="file" accept="image/*" multiple hidden onChange={async e => {
              const fs = Array.from(e.target.files || []); e.target.value = ''; if (!fs.length) return;
              setNote('Uploading photos…'); const urls: string[] = [];
              for (const f of fs) { try { urls.push(await uploadFile(f)); } catch (er: any) { setNote(er?.message || 'Upload failed.'); } }
              if (urls.length) { set({ gallery: [...data.gallery, ...urls] }); setNote(''); }
            }} /></label>
        </div>
        <Sub>Love story (photo + a short caption each)</Sub>
        {c.story.map((st, i) => (
          <div className="ivSong" key={i}>
            <div className="ivMini"><div className="ivPickThumb" style={{ width: 52, height: 52, ...(st.photo ? { backgroundImage: `url("${st.photo}")` } : {}) }}>{!st.photo && <ImagePlus />}</div>
              <input value={st.caption} onChange={e => setCine({ story: c.story.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) })} placeholder="Caption" />
              <button className="icon danger" onClick={() => setCine({ story: c.story.filter((_, j) => j !== i) })} aria-label="Remove"><X /></button></div>
            <label className="button secondary ivUpload"><Upload /> {st.photo ? 'Replace photo' : 'Photo'}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pick(f, 'image', u => setCine({ story: c.story.map((x, j) => (j === i ? { ...x, photo: u } : x)) }), 'story'); }} /></label>
          </div>))}
        <button className="secondary" onClick={() => setCine({ story: [...c.story, { photo: '', caption: '' }] })}><Plus /> Add a love-story moment</button>
        <Sub>Wedding gift QR codes (KHQR / ABA images)</Sub>
        {c.qrs.map((q, i) => (
          <div className="ivSong" key={i}>
            <div className="ivMini"><div className="ivPickThumb" style={{ width: 52, height: 52, ...(q.url ? { backgroundImage: `url("${q.url}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' } : {}) }}>{!q.url && <ImagePlus />}</div>
              <input value={q.label} onChange={e => setCine({ qrs: c.qrs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Account name / bank" />
              <button className="icon danger" onClick={() => setCine({ qrs: c.qrs.filter((_, j) => j !== i) })} aria-label="Remove"><X /></button></div>
            <label className="button secondary ivUpload"><Upload /> {q.url ? 'Replace QR image' : 'QR image'}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pick(f, 'image', u => setCine({ qrs: c.qrs.map((x, j) => (j === i ? { ...x, url: u } : x)) }), 'qr'); }} /></label>
          </div>))}
        <button className="secondary" onClick={() => setCine({ qrs: [...c.qrs, { label: '', url: '' }] })}><Plus /> Add a QR code</button>
      </Card>

      <Card title="Look, language & link preview" icon={<Sparkles />} open>
        <Sub>Colours (pick a set, or change any one)</Sub>
        <div className="ivSwatches" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
          {(['jade', 'silk', 'rose', 'navy'] as const).map(id => { const q = CINE_PALETTES[id]; return (
            <button key={id} type="button" className={'ivSwatch ivSwatch4 ' + (c.palette === id || (id === 'jade' && c.palette === 'olive') ? 'on' : '')} onClick={() => applyPalette(id)}><i style={{ background: q.paper }} /><i style={{ background: q.cream }} /><i style={{ background: q.night }} /><i style={{ background: q.wax }} /><small>{q.name}</small></button>); })}
        </div>
        <div className="two">
          <label>Paper (envelope)<input type="color" value={c.paper} onChange={e => { setCine({ palette: 'custom', paper: e.target.value }); }} style={{ height: 44, padding: 4 }} /></label>
          <label>Card cream<input type="color" value={c.cream} onChange={e => setCine({ palette: 'custom', cream: e.target.value })} style={{ height: 44, padding: 4 }} /></label>
          <label>Night (photo sections)<input type="color" value={c.night} onChange={e => setCine({ palette: 'custom', night: e.target.value })} style={{ height: 44, padding: 4 }} /></label>
          <label>Wax seal<input type="color" value={/^#[0-9a-f]{6}$/i.test(c.wax) ? c.wax : '#8d1f2d'} onChange={e => setCine({ palette: 'custom', wax: e.target.value })} style={{ height: 44, padding: 4 }} /></label>
          <label>Metallic foil<select value={c.foil} onChange={e => setCine({ palette: 'custom', foil: e.target.value as CineData['foil'] })}><option value="gold">Gold</option><option value="rose">Rose gold</option><option value="silver">Silver</option></select></label>
        </div>
        <Sub>Language</Sub>
        <div className="ivSeg">
          {([['km', 'ខ្មែរ', 'Khmer first'], ['en', 'English', 'English first'], ['both', 'ខ្មែរ + EN', 'Khmer, with switch']] as const).map(([v, a, b]) => (
            <button key={v} type="button" className={data.lang === v ? 'on' : ''} onClick={() => set({ lang: v === 'both' ? 'km' : v })}><b>{a}</b><small>{b}</small></button>))}
        </div>
        <small className="muted">Guests always get the ខ្មែរ | EN switch in the corner. Khmer numerals are used in Khmer.</small>
        <label className="ivCheck"><input type="checkbox" checked={data.opening.nameEnabled} onChange={e => { setIn('opening', { nameEnabled: e.target.checked }); setReplay(); }} /> Write the guest’s name on the envelope (from their personal link)</label>
        <Sub>Link preview (Telegram, Messenger, Facebook)</Sub>
        <small className="muted">The picture and title people see when the link is shared. It uses the cover photo and the names.</small>
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="secondary" onClick={makeOg} disabled={!data.opening.image && !data.gallery[0]}><RefreshCw /> {c.ogImage ? 'Recreate preview picture' : 'Create preview picture'}</button>
          {c.ogImage && <img src={c.ogImage} alt="" style={{ height: 64, borderRadius: 8, border: '1px solid var(--line)' }} />}
        </div>
      </Card>
    </>
  );
}

/* stable (top-level) pieces of the inspector: defining them inside CineInspector would remount them on every keystroke and drop the focus */
function InsTxt({ label, value, onChange, rows = 1, ph, auto = false }: { label: string; value: string; onChange: (v: string) => void; rows?: number; ph?: string; auto?: boolean }) {
  return <label>{label}{rows > 1 ? <textarea rows={rows} value={value} autoFocus={auto} placeholder={ph} onChange={e => onChange(e.target.value)} /> : <input value={value} autoFocus={auto} placeholder={ph} onChange={e => onChange(e.target.value)} />}</label>;
}
function InsRange({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return <label>{label}: <b>{Math.round(value * 10) / 10}{unit}</b><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
function InsColor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label>{label}<input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ height: 44, padding: 4 }} /></label>;
}
function InsPhoto({ label, url, k, onUrl, onClear, busy, pick }: { label: string; url: string; k: string; onUrl: (u: string) => void; onClear: () => void; busy: string; pick: (f: File | undefined, kind: 'image' | 'audio', onUrl: (u: string) => void, label: string) => void }) {
  return <PhotoTile wide label={label} url={url} busy={busy === k} onFile={f => pick(f, 'image', onUrl, k)} onClear={onClear} />;
}

/* ------------------------------------------------------------------ click-to-edit on the cinematic preview ------------------------------------------------------------------
   With "Edit on preview" on, every part of the invitation can be clicked. The preview reports which part (a key such as "f:groom",
   "f:step:2" or "t:wordsHead") and this panel shows exactly the fields behind it. Changes go to the same data as the form on the left,
   so the form, the preview and the saved invitation always agree. */
type InspectorProps = {
  updCine: (fn: (c: CineData) => Partial<CineData>) => void;
  hit: EditHit; data: InviteData; busy: string; close: () => void; go: (key: string) => void;
  set: (p: Partial<InviteData>) => void; setCine: (p: Partial<CineData>) => void; setIn: <K extends 'look' | 'opening' | 'butterflies'>(k: K, patch: Partial<InviteData[K]>) => void;
  onDate: (d: string) => void; pick: (f: File | undefined, kind: 'image' | 'audio', onUrl: (u: string) => void, label: string) => void;
  uploadFile: (f: File) => Promise<string>; setNote: (t: string) => void;
};
const EL_NAME: Record<CineEl['type'], string> = { text: 'Text', image: 'Picture', button: 'Button', shape: 'Shape' };
function CineInspector({ updCine, hit, data, busy, close, go, set, setCine, setIn, onDate, pick, uploadFile, setNote }: InspectorProps) {
  const c = data.cine, L = hit.lang, [kind, a, b] = hit.key.split(':');
  const idx = Number(b);
  const ov = c.texts[L] || {};
  const dict = TEXT[L] as unknown as Record<string, string>;
  const setText = (k: string, v: string) => setCine({ texts: { ...c.texts, [L]: { ...ov, [k]: v } } });
  const resetText = (k: string) => { const next = { ...ov }; delete next[k]; setCine({ texts: { ...c.texts, [L]: next } }); };
  const pal = (patch: Partial<CineData>) => setCine({ palette: 'custom', ...patch });
  const applyPalette = (id: 'jade' | 'silk' | 'rose' | 'navy') => { const q = CINE_PALETTES[id]; setCine({ palette: id, paper: q.paper, cream: q.cream, night: q.night, foil: q.foil, wax: q.wax }); };
  const hex = (v: string, fb: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fb);

  /* a list item that no longer exists (deleted) closes the panel */
  const missing = (kind === 'f' && a === 'step' && b !== 'new' && !data.schedule[idx]) || (kind === 'f' && a === 'story' && b !== 'new' && !c.story[idx]) || (kind === 'f' && a === 'gallery' && b !== 'new' && !data.gallery[idx]) || (kind === 'f' && a === 'qr' && b !== 'new' && !c.qrs[idx]) || (kind === 'x' && !c.extras.some(z => z.id === a));
  useEffect(() => { if (missing) close(); }, [missing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [close]);
  if (missing) return null;

  const presets = () => (
    <div className="ivSwatches" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
      {(['jade', 'silk', 'rose', 'navy'] as const).map(id => { const q = CINE_PALETTES[id]; return (
        <button key={id} type="button" className={'ivSwatch ivSwatch4 ' + (c.palette === id ? 'on' : '')} onClick={() => applyPalette(id)}><i style={{ background: q.paper }} /><i style={{ background: q.cream }} /><i style={{ background: q.night }} /><i style={{ background: q.wax }} /><small>{q.name}</small></button>); })}
    </div>);
  const names = (who: 'groom' | 'bride') => {
    const g = who === 'groom';
    return (<>
      <InsTxt label={g ? 'Groom, Khmer' : 'Bride, Khmer'} value={g ? data.groom : data.bride} onChange={v => set(g ? { groom: v } : { bride: v })} />
      <InsTxt label={g ? 'Groom, English' : 'Bride, English'} value={g ? c.groomEn : c.brideEn} onChange={v => setCine(g ? { groomEn: v } : { brideEn: v })} />
      <InsTxt label={g ? 'Name-logo: short name' : 'Name-logo: short name'} value={g ? c.groomShort : c.brideShort} onChange={v => setCine(g ? { groomShort: v } : { brideShort: v })} ph="first name only" />
    </>);
  };
  const photoKey = (key: 'archPhoto' | 'groomPhoto' | 'bridePhoto' | 'candlePhoto', label: string, bk: string) => <InsPhoto busy={busy} pick={pick} label={label} url={c[key]} k={bk} onUrl={u => setCine({ [key]: u } as Partial<CineData>)} onClear={() => setCine({ [key]: '' } as Partial<CineData>)} />;
  const updEv = (i: number, p: Partial<CeremonyItem>) => set({ schedule: data.schedule.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const updStory = (i: number, p: Partial<{ photo: string; caption: string }>) => setCine({ story: c.story.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const updQr = (i: number, p: Partial<{ label: string; url: string }>) => setCine({ qrs: c.qrs.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  async function addGallery(files: File[]) {
    if (!files.length) return; setNote('Uploading photos…'); const urls: string[] = [];
    for (const f of files) { try { urls.push(await uploadFile(f)); } catch (er: any) { setNote(er?.message || 'Upload failed.'); } }
    if (urls.length) { set({ gallery: [...data.gallery, ...urls] }); setNote(''); if (a === 'gallery' && b === 'new') go('f:gallery:' + data.gallery.length); }
  }
  const galleryAdd = () => (<label className="button secondary ivUpload"><Upload /> {busy === 'gal' ? '…' : 'Add photos'}<input type="file" accept="image/*" multiple hidden onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; addGallery(fs); }} /></label>);

  let title = hit.label, body: React.ReactNode = null;
  if (kind === 't') {
    const val = ov[a] ?? dict[a] ?? '';
    body = (<>
      <InsTxt auto rows={dict[a] && dict[a].length > 40 ? 3 : 1} label={`Text (${L === 'km' ? 'Khmer' : 'English'} version)`} value={val} onChange={v => setText(a, v)} />
      <div className="row" style={{ flexWrap: 'wrap' }}>{ov[a] !== undefined && <button className="secondary" onClick={() => resetText(a)}><RefreshCw /> Standard wording</button>}</div>
      <small className="muted">Guests who read the invitation in {L === 'km' ? 'Khmer' : 'English'} see this. Switch the ខ្មែរ | EN button on the preview to edit the other language.</small>
    </>);
  } else if (kind === 'x') {
    const el = c.extras.find(z => z.id === a);
    if (el) {
      title = EL_NAME[el.type];
      const upd = (p: Partial<CineEl>) => updCine(cc => ({ extras: cc.extras.map(z => (z.id === el.id ? { ...z, ...p } : z)) }));
      const ratio = (
        <label>Shape of the picture<select value={String(el.ar)} onChange={e => upd({ ar: Number(e.target.value) })}><option value="0">Natural</option><option value="1">Square</option><option value="1.25">Portrait 4:5</option><option value="1.333">Portrait 3:4</option><option value="0.5625">Wide 16:9</option></select></label>);
      const ownBody = el.type === 'text' ? (<>
        <InsTxt auto rows={3} label="Text" value={el.text} onChange={v => upd({ text: v })} />
        <div className="two"><label>Font<select value={el.font} onChange={e => upd({ font: e.target.value as CineEl['font'] })}><option value="body">Normal</option><option value="title">Khmer title (Moulpali)</option><option value="serif">Serif</option><option value="script">Script</option></select></label>
          <label>Weight<select value={el.weight} onChange={e => upd({ weight: Number(e.target.value) })}><option value={400}>Light</option><option value={600}>Medium</option><option value={800}>Bold</option></select></label></div>
        <InsRange label="Text size" value={el.fs} min={1.5} max={30} step={0.5} onChange={v => upd({ fs: v })} />
        <label className="ivCheck"><input type="checkbox" checked={el.foil} onChange={e => upd({ foil: e.target.checked })} /> Gold foil text</label>
        {!el.foil && <div className="row" style={{ alignItems: 'end' }}><InsColor label="Colour" value={hex(el.color, '#ffffff')} onChange={v => upd({ color: v })} />{el.color && <button className="secondary" onClick={() => upd({ color: '' })}>Match section</button>}</div>}
        <div className="ivSeg">{(['left', 'center', 'right'] as const).map(al => <button key={al} type="button" className={el.align === al ? 'on' : ''} onClick={() => upd({ align: al })}><b>{al}</b></button>)}</div></>)
        : el.type === 'image' ? (<>
          <InsPhoto busy={busy} pick={pick} label="Picture (PNG with a clear background works best)" url={el.image} k="ximg" onUrl={u => upd({ image: u })} onClear={() => upd({ image: '' })} />
          {ratio}<label>Fit<select value={el.fit} onChange={e => upd({ fit: e.target.value as CineEl['fit'] })}><option value="cover">Fill (crop)</option><option value="contain">Whole picture</option></select></label>
          <InsRange label="Rounded corners" value={el.radius} min={0} max={50} unit="%" onChange={v => upd({ radius: v })} /></>)
        : el.type === 'button' ? (<>
          <InsTxt auto label="Button text" value={el.text} onChange={v => upd({ text: v })} />
          <InsTxt label="Opens (link, @telegram or phone number)" value={el.url} onChange={v => upd({ url: v })} ph="https://… or @name or +855…" />
          <div className="two"><InsColor label="Button colour" value={hex(el.bg, '#d4af37')} onChange={v => upd({ bg: v })} /><InsColor label="Text colour" value={hex(el.color, '#2a1c06')} onChange={v => upd({ color: v })} /></div>
          <div className="row">{el.bg && <button className="secondary" onClick={() => upd({ bg: '' })}>Gold foil button</button>}</div>
          <InsRange label="Text size" value={el.fs} min={2} max={12} step={0.5} onChange={v => upd({ fs: v })} />
          <InsRange label="Roundness" value={Math.min(el.radius, 60)} min={0} max={60} onChange={v => upd({ radius: v })} /></>)
        : (<>
          <label>Shape<select value={el.shape} onChange={e => upd({ shape: e.target.value as CineEl['shape'] })}><option value="circle">Circle</option><option value="rect">Box</option><option value="line">Line</option><option value="heart">Heart</option><option value="diamond">Diamond</option></select></label>
          <div className="two"><InsColor label="Fill" value={hex(el.bg, '#d4af37')} onChange={v => upd({ bg: v })} /><InsColor label="Outline" value={hex(el.bcolor, '#ffffff')} onChange={v => upd({ bcolor: v })} /></div>
          <InsRange label="Outline" value={el.border} min={0} max={10} unit="px" onChange={v => upd({ border: v })} />
          {el.shape === 'rect' && <><InsRange label="Height" value={el.ar || 1} min={0.1} max={3} step={0.05} onChange={v => upd({ ar: v })} /><InsRange label="Rounded corners" value={el.radius} min={0} max={50} unit="%" onChange={v => upd({ radius: v })} /></>}</>);
      const dup = () => { const nid = 'x' + Math.random().toString(36).slice(2, 9); updCine(cc => ({ extras: [...cc.extras, { ...el, id: nid, x: Math.min(95, el.x + 4), y: Math.min(95, el.y + 4), z: el.z + 1 }] })); go('x:' + nid); };
      body = (<>
        <small className="muted">Drag it on the preview. Corner dot = resize, top dot = turn, arrow keys = nudge, Delete = remove.</small>
        {ownBody}
        <InsRange label="Width" value={el.w} min={4} max={100} unit="%" onChange={v => upd({ w: v })} />
        <InsRange label="Turn" value={el.rot} min={-180} max={180} unit="°" onChange={v => upd({ rot: v })} />
        <InsRange label="See-through" value={el.op} min={10} max={100} unit="%" onChange={v => upd({ op: v })} />
        <label>Movement<select value={el.anim} onChange={e => upd({ anim: e.target.value as CineEl['anim'] })}><option value="none">Still</option><option value="float">Float</option><option value="pulse">Pulse</option><option value="wiggle">Wiggle</option><option value="sway">Sway</option><option value="spin">Spin</option></select></label>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="secondary" onClick={() => upd({ z: el.z + 1 })}>Bring forward</button><button className="secondary" onClick={() => upd({ z: Math.max(0, el.z - 1) })}>Send back</button>
          <button className="secondary" onClick={dup}><Copy /> Duplicate</button><button className="secondary danger" onClick={() => { updCine(cc => ({ extras: cc.extras.filter(z => z.id !== el.id) })); close(); }}><Trash2 /> Delete</button></div></>);
    }
  } else if (kind === 'bg') {
    title = a === 'light' ? 'Light sections' : 'Dark sections';
    body = (<>{presets()}{a === 'light' ? <InsColor label="Card cream (light sections)" value={hex(c.cream, '#f8f1de')} onChange={v => pal({ cream: v })} /> : <InsColor label="Night (dark sections)" value={hex(c.night, '#0a1f1b')} onChange={v => pal({ night: v })} />}</>);
  } else if (kind === 'f') {
    switch (a) {
      case 'coverPhoto': title = 'Cover photo'; body = (<><InsPhoto busy={busy} pick={pick} label="Cover photo (envelope background & cover)" url={data.opening.image} k="cover" onUrl={u => setIn('opening', { image: u })} onClear={() => setIn('opening', { image: '' })} /><InsColor label="Night colour" value={hex(c.night, '#0a1f1b')} onChange={v => pal({ night: v })} /></>); break;
      case 'archPhoto': body = photoKey('archPhoto', 'Arch photo (empty uses the cover photo)', 'arch'); break;
      case 'candle': body = photoKey('candlePhoto', 'Candlelight photo (empty uses the cover photo)', 'cph'); break;
      case 'groom': case 'bride': {
        const g = a === 'groom'; title = g ? 'Groom' : 'Bride';
        body = (<>{photoKey(g ? 'groomPhoto' : 'bridePhoto', g ? 'Groom photo' : 'Bride photo', g ? 'gph' : 'bph')}{names(a as 'groom' | 'bride')}</>); break;
      }
      case 'names': body = (<><div className="two"><div className="ivInsCol"><b>Groom</b>{names('groom')}</div><div className="ivInsCol"><b>Bride</b>{names('bride')}</div></div></>); break;
      case 'namesEn': body = (<div className="two"><InsTxt auto label="Groom, English" value={c.groomEn} onChange={v => setCine({ groomEn: v })} /><InsTxt label="Bride, English" value={c.brideEn} onChange={v => setCine({ brideEn: v })} /></div>); break;
      case 'date': body = (<><div className="two"><label>Wedding date<input type="date" value={data.date} onChange={e => onDate(e.target.value)} /></label><label>Wedding time<input type="time" value={data.time} onChange={e => set({ time: e.target.value })} /></label></div><small className="muted">The weekday, Khmer numerals, countdown and calendar button all follow this date.</small></>); break;
      case 'lunar': title = 'Khmer lunar date'; body = <InsTxt auto label="Khmer lunar date (ត្រូវនឹង…)" value={c.lunar} onChange={v => setCine({ lunar: v })} />; break;
      case 'venue': body = <InsTxt auto rows={3} label="Venue / address" value={data.venue} onChange={v => set({ venue: v })} />; break;
      case 'map': title = 'Map location'; body = (<><div className="two"><InsTxt auto label="Latitude" value={c.lat} onChange={v => setCine({ lat: v })} ph="e.g. 11.5564" /><InsTxt label="Longitude" value={c.lng} onChange={v => setCine({ lng: v })} ph="e.g. 104.9282" /></div><InsTxt label="Google Maps link (optional)" value={data.mapUrl} onChange={v => set({ mapUrl: v })} ph="https://maps.google.com/…" /></>); break;
      case 'mapbtn': title = 'Map button'; body = (<><InsTxt auto label="Button text" value={ov.openMap ?? dict.openMap} onChange={v => setText('openMap', v)} /><InsTxt label="Google Maps link (empty uses the pin above)" value={data.mapUrl} onChange={v => set({ mapUrl: v })} ph="https://maps.google.com/…" /></>); break;
      case 'words': title = 'Invitation words'; body = (<><InsTxt auto rows={6} label="One line per row (empty = the standard words)" value={c.words} onChange={v => setCine({ words: v })} ph={dict.wordsDefault} /></>); break;
      case 'groomParents': case 'brideParents': {
        const g = a === 'groomParents'; title = g ? 'Groom’s parents' : 'Bride’s parents';
        body = (<div className="two"><InsTxt auto label="Father" value={g ? c.groomFather : c.brideFather} onChange={v => setCine(g ? { groomFather: v } : { brideFather: v })} /><InsTxt label="Mother" value={g ? c.groomMother : c.brideMother} onChange={v => setCine(g ? { groomMother: v } : { brideMother: v })} /></div>); break;
      }
      case 'countdown': title = 'Countdown & blessing'; body = (<><div className="two"><label>Wedding date<input type="date" value={data.date} onChange={e => onDate(e.target.value)} /></label><label>Wedding time<input type="time" value={data.time} onChange={e => set({ time: e.target.value })} /></label></div><InsTxt label="Blessing line behind the countdown" value={c.blessing} onChange={v => setCine({ blessing: v })} ph={dict.blessingDefault} /></>); break;
      case 'step': {
        if (b === 'new') { title = 'Programme'; body = (<><small className="muted">No programme items yet.</small><button onClick={() => { set({ schedule: [...data.schedule, { name: '', date: data.date, time: '' }] }); go('f:step:' + data.schedule.length); }}><Plus /> Add a programme item</button></>); break; }
        const ev = data.schedule[idx]; if (!ev) break; title = `Programme item ${idx + 1}`;
        body = (<><InsTxt auto label="Ceremony name" value={ev.name} onChange={v => updEv(idx, { name: v })} ph="ពិធី…" /><div className="two"><label>Date<input type="date" value={ev.date} onChange={e => updEv(idx, { date: e.target.value })} /></label><label>Time<input type="time" value={ev.time} onChange={e => updEv(idx, { time: e.target.value })} /></label></div>
          <div className="row" style={{ flexWrap: 'wrap' }}><button className="secondary" onClick={() => { set({ schedule: [...data.schedule, { name: '', date: data.date, time: '' }] }); go('f:step:' + data.schedule.length); }}><Plus /> Add another</button><button className="secondary danger" onClick={() => { set({ schedule: data.schedule.filter((_, j) => j !== idx) }); close(); }}><Trash2 /> Delete</button></div><small className="muted">An item without a name is not shown to guests.</small></>); break;
      }
      case 'story': {
        if (b === 'new') { title = 'Love story'; body = (<><small className="muted">The love story is a pinned strip of photos with captions.</small><button onClick={() => { setCine({ story: [...c.story, { photo: '', caption: '' }] }); go('f:story:' + c.story.length); }}><Plus /> Add a love-story moment</button></>); break; }
        const st = c.story[idx]; if (!st) break; title = `Love-story moment ${idx + 1}`;
        body = (<><InsPhoto busy={busy} pick={pick} label="Photo" url={st.photo} k="story" onUrl={u => updStory(idx, { photo: u })} onClear={() => updStory(idx, { photo: '' })} /><InsTxt auto rows={2} label="Caption" value={st.caption} onChange={v => updStory(idx, { caption: v })} />
          <div className="row" style={{ flexWrap: 'wrap' }}><button className="secondary" onClick={() => { setCine({ story: [...c.story, { photo: '', caption: '' }] }); go('f:story:' + c.story.length); }}><Plus /> Add another</button><button className="secondary danger" onClick={() => { setCine({ story: c.story.filter((_, j) => j !== idx) }); close(); }}><Trash2 /> Delete</button></div><small className="muted">A moment with no photo and no caption is not shown to guests.</small></>); break;
      }
      case 'gallery': {
        if (b === 'new') { title = 'Gallery'; body = (<><small className="muted">Photos become a masonry grid with a full-screen swipe viewer.</small>{galleryAdd()}</>); break; }
        const u = data.gallery[idx]; if (!u) break; title = `Gallery photo ${idx + 1}`;
        body = (<><div className="ivInsThumb" style={{ backgroundImage: `url("${u}")` }} />
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="button secondary ivUpload"><Upload /> {busy === 'galr' ? '…' : 'Replace'}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pick(f, 'image', nu => set({ gallery: data.gallery.map((x, j) => (j === idx ? nu : x)) }), 'galr'); }} /></label>
            <button className="secondary" disabled={idx === 0} onClick={() => { const g = [...data.gallery]; [g[idx - 1], g[idx]] = [g[idx], g[idx - 1]]; set({ gallery: g }); go('f:gallery:' + (idx - 1)); }}>← Earlier</button>
            <button className="secondary" disabled={idx >= data.gallery.length - 1} onClick={() => { const g = [...data.gallery]; [g[idx + 1], g[idx]] = [g[idx], g[idx + 1]]; set({ gallery: g }); go('f:gallery:' + (idx + 1)); }}>Later →</button>
            <button className="secondary danger" onClick={() => { set({ gallery: data.gallery.filter((_, j) => j !== idx) }); close(); }}><Trash2 /> Remove</button></div>
          {galleryAdd()}{idx === 0 && !data.opening.image && <small className="muted">The first photo is also used as the cover when there is no cover photo.</small>}</>); break;
      }
      case 'qr': {
        if (b === 'new') { title = 'Wedding gift'; body = (<><small className="muted">KHQR / ABA images guests can save.</small><button onClick={() => { setCine({ qrs: [...c.qrs, { label: '', url: '' }] }); go('f:qr:' + c.qrs.length); }}><Plus /> Add a QR code</button></>); break; }
        const q = c.qrs[idx]; if (!q) break; title = `Gift QR code ${idx + 1}`;
        body = (<><InsPhoto busy={busy} pick={pick} label="QR image" url={q.url} k="qr" onUrl={u => updQr(idx, { url: u })} onClear={() => updQr(idx, { url: '' })} /><InsTxt auto label="Account name / bank" value={q.label} onChange={v => updQr(idx, { label: v })} />
          <div className="row" style={{ flexWrap: 'wrap' }}><button className="secondary" onClick={() => { setCine({ qrs: [...c.qrs, { label: '', url: '' }] }); go('f:qr:' + c.qrs.length); }}><Plus /> Add another</button><button className="secondary danger" onClick={() => { setCine({ qrs: c.qrs.filter((_, j) => j !== idx) }); close(); }}><Trash2 /> Delete</button></div><small className="muted">A QR code without an image is not shown to guests.</small></>); break;
      }
      case 'thanks': title = 'Thank-you message'; body = <InsTxt auto rows={3} label="Message under “Thank you” (optional)" value={c.thanks} onChange={v => setCine({ thanks: v })} />; break;
      case 'paper': title = 'Envelope colour'; body = (<>{presets()}<InsColor label="Paper (envelope)" value={hex(c.paper, '#2e6b5c')} onChange={v => pal({ paper: v })} /></>); break;
      case 'seal': title = 'Wax seal'; body = (<><InsColor label="Wax seal" value={hex(c.wax, '#8d1f2d')} onChange={v => pal({ wax: v })} /><label>Metallic foil<select value={c.foil} onChange={e => pal({ foil: e.target.value as CineData['foil'] })}><option value="gold">Gold</option><option value="rose">Rose gold</option><option value="silver">Silver</option></select></label></>); break;
      case 'foil': title = 'Gold style'; body = (<><label>Metallic foil (titles, ornaments, numbers)<select value={c.foil} onChange={e => pal({ foil: e.target.value as CineData['foil'] })}><option value="gold">Gold</option><option value="rose">Rose gold</option><option value="silver">Silver</option></select></label>{presets()}</>); break;
      case 'guest': title = 'Guest name'; body = (<><label className="ivCheck"><input type="checkbox" checked={data.opening.nameEnabled} onChange={e => setIn('opening', { nameEnabled: e.target.checked })} /> Write the guest’s name on the envelope</label>
        {data.opening.nameEnabled && <div className="two"><label>Size: <b>{data.opening.nameSize}px</b><input type="range" min={12} max={48} value={data.opening.nameSize} onChange={e => setIn('opening', { nameSize: Number(e.target.value) })} /></label><InsColor label="Colour" value={hex(data.opening.nameColor, '#ffffff')} onChange={v => setIn('opening', { nameColor: v })} /></div>}</>); break;
    }
  }
  if (hit.tw && body) {
    const id = hit.tw, tw = { ...TWEAK_DEFAULT, ...(c.tweaks[id] || {}) };
    const setTw = (p: Partial<Tweak>) => updCine(cc => ({ tweaks: { ...cc.tweaks, [id]: { ...(cc.tweaks[id] || {}), ...p } } }));
    body = (<>{body}<div className="ivInsSep" />
      <b>Position & size</b>
      <small className="muted">Or drag it on the preview: corner dot = resize, top dot = turn.</small>
      <div className="two"><InsRange label="Left / right" value={tw.dx} min={-60} max={60} step={0.5} onChange={v => setTw({ dx: v })} /><InsRange label="Up / down" value={tw.dy} min={-60} max={60} step={0.5} onChange={v => setTw({ dy: v })} /></div>
      <div className="two"><InsRange label="Size" value={Math.round(tw.s * 100)} min={30} max={300} unit="%" onChange={v => setTw({ s: v / 100 })} /><InsRange label="Turn" value={tw.r} min={-180} max={180} unit="°" onChange={v => setTw({ r: v })} /></div>
      {hit.photo && <div className="two"><InsRange label="Photo focus ←→" value={tw.fx} min={0} max={100} unit="%" onChange={v => setTw({ fx: v })} /><InsRange label="Photo focus ↑↓" value={tw.fy} min={0} max={100} unit="%" onChange={v => setTw({ fy: v })} /></div>}
      {c.tweaks[id] && <button className="secondary" onClick={() => updCine(cc => { const t = { ...cc.tweaks }; delete t[id]; return { tweaks: t }; })}><RefreshCw /> Reset position & size</button>}</>);
  }
  if (!body) return null;
  return (
    <div className="ivInspector" role="dialog" aria-label={`Edit: ${title}`}>
      <div className="ivInsHead"><div><small>Editing</small><b>{title}</b></div><button type="button" className="icon" onClick={close} aria-label="Close"><X /></button></div>
      <div className="ivInsBody">{body}</div>
      <small className="muted ivInsFoot">Changes show on the preview straight away. Press Save to keep them.</small>
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) { return <h4 className="ivSubHead">{children}</h4>; }

function PhotoTile({ label, url, busy, onFile, onClear, wide = false }: { label: string; url: string; busy: boolean; onFile: (f: File) => void; onClear: () => void; wide?: boolean }) {
  return (
    <div className={'ivPhotoTile' + (wide ? ' wide' : '')}>
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

function InviteEditor({ row, onClose, startCanvas = false }: { row: Row | null; onClose: () => void; startCanvas?: boolean }) {
  const [id, setId] = useState<string | null>(row?.id || null);
  const [data, setData] = useState<InviteData>(() => { const m = merge(row?.data); return startCanvas && !row ? { ...m, mode: 'canvas', canvas: emptyCanvas() } : m; });
  const [builder, setBuilder] = useState(false);
  const [layout, setLayout] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(row?.customer_id || null);
  const [sentTo, setSentTo] = useState<string | null>(row?.customer_id || null);
  const canvasMode = data.mode === 'canvas';
  const cineMode = data.mode === 'cinematic';
  const [priv, setPriv] = useState<Private>(PRIVATE_DEFAULTS);
  const [title, setTitle] = useState(row?.title || '');
  const [slug, setSlug] = useState(row?.slug || '');
  const [published, setPublished] = useState(row?.published ?? false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [replay, setReplay] = useState(0);
  const [editOn, setEditOn] = useState(false);          // cinematic: click anything on the preview to edit it
  const [hit, setHit] = useState<EditHit | null>(null);  // the element being edited
  const cineApi = useRef<CineViewHandle | null>(null);
  const closeHit = useCallback(() => setHit(null), []);
  const [addOpen, setAddOpen] = useState(false);
  const updCine = (fn: (c: CineData) => Partial<CineData>) => { setData(d => ({ ...d, cine: { ...d.cine, ...fn(d.cine) } })); setDirty(true); };
  /* the preview reports a finished drag / resize / turn / delete */
  const onXform = (key: string, patch: Record<string, number | boolean>) => {
    if (key.startsWith('x:')) {
      const id = key.slice(2);
      if (patch.del) { updCine(c => ({ extras: c.extras.filter(e => e.id !== id) })); setHit(null); return; }
      updCine(c => ({ extras: c.extras.map(e => (e.id === id ? { ...e, ...(patch as Partial<CineEl>) } : e)) }));
    } else if (key.startsWith('tw:')) {
      const id = key.slice(3);
      updCine(c => ({ tweaks: { ...c.tweaks, [id]: { ...(c.tweaks[id] || {}), ...(patch as Partial<Tweak>) } } }));
    }
  };
  /* add a free element where the reader is looking on the preview */
  function addEl(type: CineEl['type'], o: Partial<CineEl> = {}) {
    const at = cineApi.current?.place();
    if (!at) { setNote('Press “Open envelope” first, then scroll the preview to where you want the new element.'); return; }
    const el = blankEl(type, at.sec, at.y, o);
    updCine(c => ({ extras: [...c.extras, { ...el, z: 5 + c.extras.length }] }));
    setAddOpen(false); setNote('');
    setHit({ key: 'x:' + el.id, label: '', lang: data.lang === 'en' ? 'en' : 'km', rect: { x: 0, y: 120, w: 0, h: 0, rw: 0, rh: 0 } });
  }
  const [qr, setQr] = useState('');
  const [dirty, setDirty] = useState(false);
  const slugTouched = useRef(!!row);

  const set = (patch: Partial<InviteData>) => { setData(d => ({ ...d, ...patch })); setDirty(true); };
  const setIn = <K extends 'look' | 'opening' | 'butterflies'>(k: K, patch: Partial<InviteData[K]>) => { setData(d => ({ ...d, [k]: { ...d[k], ...patch } })); setDirty(true); };
  const setCine = (patch: Partial<CineData>) => { setData(d => ({ ...d, cine: { ...d.cine, ...patch } })); setDirty(true); };
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

  useEffect(() => { if (!cineMode) { setEditOn(false); setHit(null); } }, [cineMode]);

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

  async function save(nextPublished = published, nextCustomer: string | null | undefined = undefined) {
    const cust = nextCustomer === undefined ? customerId : nextCustomer;
    const clean = slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(clean)) { setNote('The link needs 3+ letters, numbers or dashes (no spaces).'); return; }
    setBusy('Saving…'); setNote('');
    const payload = { slug: clean, title: title.trim() || 'Wedding invitation', published: nextPublished, data, customer_id: cust };
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
    setId(newId); setSlug(clean); setPublished(nextPublished); setCustomerId(cust); setSentTo(cust); setDirty(false);
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

        <div className="ivModeSeg ivModeSeg3">
          <button type="button" className={!canvasMode && !cineMode ? 'on' : ''} onClick={() => set({ mode: 'form' })}><b>Guided form</b><small>Fill in names, date, schedule… and pick a template.</small></button>
          <button type="button" className={cineMode ? 'on' : ''} onClick={() => set({ mode: 'cinematic' })}><b>Cinematic ✨</b><small>Envelope, wax seal, cover, scroll story, candlelight.</small></button>
          <button type="button" className={canvasMode ? 'on' : ''} onClick={() => set({ mode: 'canvas', canvas: data.canvas || emptyCanvas() })}><b>Blank canvas</b><small>Start empty. Place and draw everything yourself.</small></button>
        </div>

        {cineMode && <CinematicCard data={data} set={set} setCine={setCine} pick={pick} busy={busy} uploadBlob={b => uploadAsset(new File([b], 'preview.jpg', { type: 'image/jpeg' }), 'pictures', 'image')} uploadFile={f => uploadAsset(f, 'pictures', 'image')} setNote={setNote} onDate={onDate} setIn={setIn} setReplay={() => setReplay(n => n + 1)} />}

        {canvasMode && (
          <>
            <Card title="Blank canvas" icon={<Sparkles />} open>
              <div className="ivCanvasCta">
                <small className="muted">Add text, pictures, buttons, shapes and freehand drawings, then drag, resize and rotate them right on the page. {data.canvas ? `${data.canvas.pages.length} page(s), ${data.canvas.pages.reduce((n, p) => n + p.els.length, 0)} item(s).` : ''}</small>
                <button className="wide" onClick={() => setBuilder(true)}><Pencil /> Open the canvas builder</button>
              </div>
            </Card>
            <Card title="Names & date (for the opening scene and countdown)" icon={<CalendarDays />} open>
              <div className="two">
                <label>Groom (ឈ្មោះកូនកំលោះ)<input value={data.groom} onChange={e => set({ groom: e.target.value })} /></label>
                <label>Bride (ឈ្មោះកូនក្រមុំ)<input value={data.bride} onChange={e => set({ bride: e.target.value })} /></label>
              </div>
              <div className="two">
                <label>Wedding date<input type="date" value={data.date} onChange={e => onDate(e.target.value)} /></label>
                <label>Wedding time<input type="time" value={data.time} onChange={e => set({ time: e.target.value })} /></label>
              </div>
            </Card>
          </>
        )}

        {/* 1 ----------------------------------------------------------- */}
        <Card title="1. Bride & Groom Information" icon={<Heart />} open hide={canvasMode || cineMode}>
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
        <Card title="2. Wedding Details" icon={<CalendarDays />} open hide={canvasMode || cineMode}>
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
        <Card title="Programme: ceremony schedule (កម្មវិធី)" icon={<CalendarDays />} open hide={canvasMode}>
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
        <Card title={cineMode ? 'Music' : canvasMode ? 'Opening scene, butterflies & music' : '4. Invitation Design'} icon={<Sparkles />} open>
          {!canvasMode && !cineMode && <>
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

          </>}

          {!cineMode && <>
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
          <div className="ivPhotoPair three">
            {data.opening.style === 'doors' && <PhotoTile wide label="Door picture (both doors, closed)" url={data.opening.doorImage} busy={busy === 'door'} onFile={f => pick(f, 'image', u => { setIn('opening', { doorImage: u }); setReplay(n => n + 1); }, 'door')} onClear={() => setIn('opening', { doorImage: '' })} />}
            <PhotoTile wide label="Bottom picture (flowers / decoration at the bottom)" url={data.opening.bottomImage} busy={busy === 'bottom'} onFile={f => pick(f, 'image', u => { setIn('opening', { bottomImage: u }); setReplay(n => n + 1); }, 'bottom')} onClear={() => setIn('opening', { bottomImage: '' })} />
            <PhotoTile wide label="Button picture (replaces the open button)" url={data.opening.buttonImage} busy={busy === 'btn'} onFile={f => pick(f, 'image', u => { setIn('opening', { buttonImage: u }); setReplay(n => n + 1); }, 'btn')} onClear={() => setIn('opening', { buttonImage: '' })} />
          </div>
          <small className="muted">PNG with a transparent background works best for the bottom and button pictures. If you add no door picture, the opening picture is split into two doors.</small>
          <div className="two"><label>Small title<input value={data.opening.title} onChange={e => setIn('opening', { title: e.target.value })} /></label>
            <label>Button text<input value={data.opening.button} onChange={e => setIn('opening', { button: e.target.value })} /></label></div>
          <button className="secondary" onClick={() => setReplay(n => n + 1)}><RefreshCw /> Replay opening in preview</button>

          <Sub>Open button & guest name position</Sub>
          <label className="ivCheck"><input type="checkbox" checked={data.opening.nameEnabled} onChange={e => { setIn('opening', { nameEnabled: e.target.checked }); setReplay(n => n + 1); }} /> Add a blank space for the guest’s name (optional)</label>
          <small className="muted">When a customer adds a guest name, it appears in this space on the opening page in Khmer OS Muol Light, and that guest gets their own link. With no name, the space stays empty.</small>
          {data.opening.nameEnabled && (
            <div className="two">
              <label>Name size: <b>{data.opening.nameSize}px</b><input type="range" min={12} max={48} value={data.opening.nameSize} onChange={e => setIn('opening', { nameSize: Number(e.target.value) })} /></label>
              <label>Name colour<input type="color" value={data.opening.nameColor} onChange={e => setIn('opening', { nameColor: e.target.value })} style={{ height: 44, padding: 4 }} /></label>
            </div>)}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className={layout ? '' : 'secondary'} onClick={() => { setLayout(l => !l); setReplay(n => n + 1); }}><Move /> {layout ? 'Done moving' : 'Move them on the preview'}</button>
            {(data.opening.btnPos || data.opening.namePos) && <button className="secondary" onClick={() => setIn('opening', { btnPos: null, namePos: null })}><RefreshCw /> Reset positions</button>}
          </div>
          {layout && <p className="notice">Drag the “Open button” {data.opening.nameEnabled ? 'and the “Guest name” box ' : ''}anywhere on the phone preview, then press “Done moving”.</p>}

          <Sub>Flying butterflies 🦋</Sub>
          <label className="ivCheck"><input type="checkbox" checked={data.butterflies.enabled} onChange={e => setIn('butterflies', { enabled: e.target.checked })} /> Show butterflies flying around the screen</label>
          {data.butterflies.enabled && <>
            <label>How many: <b>{data.butterflies.count}</b><input type="range" min={1} max={24} value={data.butterflies.count} onChange={e => setIn('butterflies', { count: Number(e.target.value) })} /></label>
            <label>Size: <b>{data.butterflies.size}px</b><input type="range" min={18} max={80} value={data.butterflies.size} onChange={e => setIn('butterflies', { size: Number(e.target.value) })} /></label>
            <label className="ivCheck"><input type="checkbox" checked={data.butterflies.mix} onChange={e => setIn('butterflies', { mix: e.target.checked })} /> Mixed pastel colours</label>
            {!data.butterflies.mix && <label>Butterfly colour<input type="color" value={data.butterflies.color} onChange={e => setIn('butterflies', { color: e.target.value })} style={{ height: 44, padding: 4 }} /></label>}
          </>}

          </>}

          <Sub>Music selection</Sub>
          <small className="muted">The song starts the moment the guest opens the invitation (phones only allow sound after a tap) and keeps looping: one song repeats forever, several songs play in order and start over.</small>
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

          <Sub>Private notes: special requests (only you see this)</Sub>
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

        <Card title="Send to a customer & guest links" icon={<Users />} open>
          <small className="muted">Pick the customer this invitation is for. It then shows on their Services page, where they can use the original link or add guest names (each name gets its own link).</small>
          <CustomerPicker value={customerId} onChange={v => { setCustomerId(v); setDirty(true); }} />
          <div className="ivSendBox">
            <span className={'ivSendState ' + (sentTo ? 'sent' : '')}>{sentTo ? <><Check /> Sent: it is on the customer’s Services page</> : 'Not sent yet'}</span>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button disabled={!customerId || !!busy || (!!sentTo && sentTo === customerId && published)} onClick={() => { if (!published && !confirm('Publish this invitation now so the customer’s links work?')) return; save(true, customerId); }}><Send /> {sentTo && sentTo === customerId ? 'Send again' : 'Send to customer'}</button>
              {sentTo && <button className="secondary" disabled={!!busy} onClick={() => { if (confirm('Take it back? It disappears from the customer’s Services page (their guest links stay saved).')) save(published, null); }}>Take back</button>}
            </div>
            <small className="muted">Sending publishes the invitation (if it is not live yet) and puts it on the customer’s Services page. You can keep editing it afterwards; changes show instantly.</small>
          </div>
          {id ? <GuestLinks invId={id} slug={slug} published={published} /> : <p className="muted">Press Save first, then you can add guest names here too.</p>}
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
        {cineMode && (
          <div className="ivEditBar">
            <button type="button" className={editOn ? '' : 'secondary'} onClick={() => { setEditOn(v => !v); setHit(null); }} aria-pressed={editOn}><MousePointerClick /> {editOn ? 'Editing on preview' : 'Edit on preview'}</button>
            {editOn && <button type="button" className="secondary" onClick={() => cineApi.current?.open()} title="Play the envelope opening"><Play /> Open envelope</button>}
            {editOn && <button type="button" className={addOpen ? '' : 'secondary'} onClick={() => setAddOpen(v => !v)} aria-expanded={addOpen}><Plus /> Add</button>}
            <button type="button" className="secondary" onClick={() => { setHit(null); setReplay(n => n + 1); }} title="Back to the closed envelope"><RefreshCw /> Replay</button>
            {editOn && addOpen && (
              <div className="ivAddMenu">
                <b>Add to the section you are looking at</b>
                <div className="ivAddGrid">
                  <button type="button" className="secondary" onClick={() => addEl('text')}>Aa Text</button>
                  <label className="button secondary ivUpload"><ImagePlus /> {busy === 'xadd' ? '…' : 'Picture'}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; pick(f, 'image', u => addEl('image', { image: u }), 'xadd'); }} /></label>
                  <button type="button" className="secondary" onClick={() => addEl('button')}>Button</button>
                  {(['circle', 'rect', 'line', 'heart', 'diamond'] as const).map(sh => <button key={sh} type="button" className="secondary" onClick={() => addEl('shape', { shape: sh, ...(sh === 'line' ? { w: 40 } : {}) })}>{({ circle: '● Circle', rect: '▬ Box', line: '— Line', heart: '♥ Heart', diamond: '◆ Diamond' })[sh]}</button>)}
                </div>
                <div className="ivAddEmoji">{['🦋', '🌸', '💍', '🕊️', '✨', '💖', '🌿', '🕯️', '🎉', '🪷', '🥂', '🌹'].map(em => <button key={em} type="button" onClick={() => addEl('text', { text: em, fs: 12, w: 22 })} aria-label={em}>{em}</button>)}</div>
              </div>)}
          </div>)}
        <div className="ivPhoneWrap">
          <div className="ivPhone"><div className="ivPhoneScreen"><InvitationView data={data} preview replayKey={replay} shareUrl={slug ? inviteUrl(slug) : ''} layoutEdit={layout} onLayout={p => setIn('opening', p)}
            cineEdit={cineMode && editOn} cineSelected={hit?.key || ''} onCineEdit={h => { setHit(h.key ? h : null); if (h.key) setAddOpen(false); }} onCineXform={onXform} cineApi={cineApi} /></div></div>
          {cineMode && editOn && hit && (
            <div className="ivInsWrap" style={{ top: Math.round(Math.min(Math.max(hit.rect.y - 14, 0), 330)) }}>
              <CineInspector hit={hit} data={data} busy={busy} close={closeHit} updCine={updCine} go={key => setHit(h => (h ? { ...h, key, label: '' } : h))}
                set={set} setCine={setCine} setIn={setIn} onDate={onDate} pick={pick} uploadFile={f => uploadAsset(f, 'pictures', 'image')} setNote={setNote} />
            </div>)}
        </div>
        <small className="muted">{cineMode && editOn ? 'Click anything on the invitation to edit it. Scroll the preview to reach every section.' : cineMode ? 'Live preview. Turn on “Edit on preview” to click and change anything.' : 'Live preview. Tap the opening to try it, including the music.'}</small>
      </aside>
      {builder && data.canvas && (
        <CanvasBuilder canvas={data.canvas} onChange={c => set({ canvas: c })} onClose={() => setBuilder(false)} onSave={() => save()} saving={!!busy}
          upload={f => uploadAsset(f, 'pictures', 'image')} date={data.date} time={data.time} labels={labelsFor(data.lang)} />
      )}
    </div>
  );
}
