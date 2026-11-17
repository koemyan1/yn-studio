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
export type VBox = { x: number; y: number; w: number; h: number };
export function iou(a: VBox, b: VBox): number;
export function cropGrid(W: number, H: number, opts?: { frac?: number; stride?: number; maxPerAxis?: number }): VBox[];
export function groupMatches(
  crops: { box: VBox; vec: Float32Array; full?: boolean }[],
  entries: { id: string; vec: Float32Array }[],
  opts?: { minScore?: number; showMin?: number; singleScore?: number; perGroup?: number; maxGroups?: number; overlap?: number },
): { box: VBox; score: number; hits: { id: string; score: number }[] }[];
