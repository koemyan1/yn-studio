import type { FoilName } from './art';

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
  gallery: string[]; story: { photo: string; caption: string }[]; qrs: { label: string; url: string }[];
  schedule: { time: string; name: string; date: string }[];
  /* extras */
  guestName: string; shareUrl: string; shareTitle: string;
  palette: { paper: string; cream: string; night: string; foil: FoilName; wax?: string };
  preview: boolean;                         // admin preview: dim placeholders for empty fields
};
export type CineHooks = { onOpen?: () => void; onOpened?: () => void };
export type CineHandle = { update(cfg: CineCfg): void; replay(): void; destroy(): void; open(): void };
