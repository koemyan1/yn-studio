import type { FoilName } from './art';
import type { CineEl, Tweak } from './extras';
export type { CineEl, Tweak } from './extras';

export type CineCfg = {
  lang: 'km' | 'en';
  /* names */
  groomShort: string; brideShort: string; groomKh: string; brideKh: string; groomEn: string; brideEn: string;
  groomFather: string; groomMother: string; brideFather: string; brideMother: string;
  /* when / where */
  dateParts: { wd: string; d: string; m: string; y: string } | null;
  dateLong: string;                         // e.g. the full written date for the venue / calendar blocks
  lunar: string; venue: string; lat: string; lng: string; mapUrl: string;
  target: number | null;                    // wedding date+time (ms) for the countdown
  ics: { title: string; start: string; end: string; location: string } | null;
  /* wording */
  words: string; blessing: string; thanks: string;
  /* pictures */
  photo: string; archPhoto: string; groomPhoto: string; bridePhoto: string; candlePhoto: string;
  gallery: string[]; story: { photo: string; caption: string; i?: number }[]; qrs: { label: string; url: string; i?: number }[];
  schedule: { time: string; name: string; date: string; i?: number }[];
  /* extras */
  guestName: string; shareUrl: string; shareTitle: string;
  palette: { paper: string; cream: string; night: string; foil: FoilName; wax?: string };
  preview: boolean;                         // admin preview: dim placeholders for empty fields
  extras?: CineEl[];                        // free elements added on the preview
  tweaks?: Record<string, Partial<Tweak>>;  // move / size / turn / photo focus of built-in parts, by part id
  texts?: Record<string, string>;           // overrides of the fixed wording (see text.ts), already for this language
};
/* Edit mode (admin preview): every marked element can be hovered and clicked; the click is reported and nothing else happens. */
export type EditHit = { key: string; label: string; lang: 'km' | 'en'; tw?: string; photo?: boolean; rect: { x: number; y: number; w: number; h: number; rw: number; rh: number } };
export type CineHooks = { onOpen?: () => void; onOpened?: () => void; onEdit?: (hit: EditHit) => void; onXform?: (key: string, patch: Record<string, number | boolean>) => void };
export type CineHandle = { update(cfg: CineCfg): void; replay(): void; destroy(): void; open(): void; setEdit(on: boolean): void; select(key: string | null): void; place(): { sec: string; x: number; y: number } | null };
