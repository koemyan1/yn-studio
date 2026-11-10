export const COIN_TOKEN_RE: RegExp;
export type CoinUrlResult =
  | { ok: true; url: string; host: string; token: string; masked: string; sameOrigin: boolean }
  | { ok: false; error: string };
export function parseCoinUrl(input: unknown, origin?: string): CoinUrlResult;
export function normalizeCoinUrl(input: unknown): string;
export function maskCoinText(text: unknown): string;
