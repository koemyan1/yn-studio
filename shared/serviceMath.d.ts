export const MAX_QTY: number;
export const MAX_UNITS: number;
export const MAX_TEXT: number;
export const MAX_DELIVERY_KM: number;
export const MAX_TOTAL_CENTS: number;
export const PHYSICAL_FULFILMENTS: string[];
export function isUuid(v: unknown): boolean;
export function toCents(n: number): number;
export function fromCents(c: number): number;
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;
export function calcDeliveryFee(cfg: any, store: { lat: number; lng: number }, to: { lat: number; lng: number }): { km: number; fee: number };
export function validCoord(lat: unknown, lng: unknown): boolean;
export function cleanPhone(v: unknown): string;
export function cleanText(v: unknown, max?: number): string;

export type SvcKind = 'physical' | 'digital';
export type SvcOption = { id: string; label_en: string; label_km: string; price_type: 'fixed' | 'per_unit' | 'percent'; price: number; enabled?: boolean; sort_order?: number };
export type SvcGroup = { id: string; label_en: string; label_km: string; type: 'single' | 'multi' | 'number' | 'text'; required: boolean; is_quantity?: boolean; min_value?: number; max_value?: number; enabled?: boolean; sort_order?: number; options?: SvcOption[] };
export type SvcPrice = { id: string; label_en: string; label_km: string; amount: number; unit: 'page' | 'copy' | 'item' | 'job'; enabled?: boolean; sort_order?: number };
export type SvcSelection = { price_id: string; quantity?: number; groups: Record<string, string | string[] | number> };
export type Quote = {
  service_key: string; price_id: string; price_label_en: string; price_label_km: string; unit: string; unit_price: number;
  quantity: number; base: number; extras: number; subtotal: number; fulfilment: 'pickup' | 'delivery' | 'digital';
  distance_km: number | null; delivery_fee: number; total: number; currency: 'USD'; choices: any[];
};
export type QuoteResult = { ok: true; quote: Quote } | { ok: false; code: string; error: string };
export function computeQuote(input: {
  service: { key: string; kind: SvcKind };
  prices: SvcPrice[]; groups: SvcGroup[]; selection: SvcSelection;
  fulfilment?: string; deliveryCfg?: any; deliveryPoint?: { lat: number; lng: number } | null;
}): QuoteResult;
