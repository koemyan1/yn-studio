export const VISION_DIM: number;
export function normalize(v: ArrayLike<number>): Float32Array;
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number;
export function meanVector(vs: ArrayLike<number>[]): Float32Array;
export function rankSimilar(
  query: ArrayLike<number>,
  entries: { id: string; vec: Float32Array }[],
  opts?: { limit?: number; min?: number },
): { id: string; score: number }[];
export function matchPercent(score: number): number;
export function imageKey(id: string, url?: string | null): string;
export function vecToBase64(v: Float32Array): string;
export function base64ToVec(b64: string): Float32Array;
