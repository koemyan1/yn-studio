export const SHEET_W: number;
export const SHEET_H: number;
export const MAX_COVERS: number;
export const MAX_ITEMS: number;
export const MAX_FIELDS: number;
export const DEFAULT_PRICE_PER_PAGE: number;
export const MIN_PRICE_PER_PAGE: number;
export const MAX_PRICE_PER_PAGE: number;
export const FONTS: string[];
export const ORDER_STATUSES: string[];

export type BcField = {
  key: string; label_en: string; label_km: string; hint_en: string; hint_km: string;
  required: boolean; per_subject: boolean;
  x: number; y: number; size: number; color: string; font: string; bold: boolean; max: number;
};
export type BcPos = { x: number; y: number; size: number };
export type BcCover = { values: Record<string, string>; pos: Record<string, BcPos> };
export type BcItem = { design_id: string | null; design_name: string; design_image: string; design_fields: BcField[]; price_per_page: number; covers: BcCover[] };
export type BcDesignSource = { id?: string | null; name: string; image: string; price_per_page: number; fields: unknown };
export type BcContact = { name: string; phone: string; address: string; notes: string; lat: number | null; lng: number | null };

export function oneLine(v: unknown, max: number): string;
export function cleanFields(raw: unknown): BcField[];
export function defaultSpot(index: number): { x: number; y: number };
export function hasSubjectFields(fields: BcField[] | null | undefined): boolean;
export function buildCovers(fields: BcField[], raw: unknown): { covers: BcCover[]; error?: undefined } | { error: string; covers?: undefined };
export function orderItems(o: any): BcItem[];
export function itemsPages(items: BcItem[] | null | undefined): number;
export function itemsTotal(items: BcItem[] | null | undefined): number;
export function designsLabel(items: BcItem[] | null | undefined): string;
export function buildOrder(rawItems: unknown, lookup: (id: string) => BcDesignSource | null | undefined): { items: BcItem[]; pages: number; total: number; error?: undefined; code?: undefined } | { error: string; code?: string; items?: undefined; pages?: undefined; total?: undefined };
export function orderTotal(pages: number, perPage: number): number;
export function cleanPricePerPage(v: unknown): number;
export function cleanLayout(fields: BcField[], raw: unknown, count: number): Record<string, BcPos>[];
export function validateContact(c: any): { ok: true; contact: BcContact } | { ok: false; code: string; error: string };
export function bcNo(id: string): string;
