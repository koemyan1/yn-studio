/* File helpers shared by the Services page and the pay-first order sheet. */
import { supabase } from './supabase';

export const MAX_MB = 10;
export const MAX_FILES = 5;
export const FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,application/pdf';
const OK_TYPES = FILE_ACCEPT.split(',');

export const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'file';

/** Shrinks big phone photos before upload. Anything that is not an image (PDF, etc.) is sent unchanged. */
export async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d');
    if (!g) return file;
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Why a file cannot be attached, or '' when it is fine. (The server and the bucket check again.) */
export function fileProblem(f: File): 'type' | 'size' | '' {
  if (!OK_TYPES.includes(f.type)) return 'type';
  if (f.size > MAX_MB * 1024 * 1024) return 'size';
  return '';
}

/** Uploads to the PRIVATE bucket under <user id>/... and returns the storage path (not a public link). */
export async function uploadPrivate(userId: string, file: File): Promise<string> {
  const f = await prepareFile(file);
  if (fileProblem(f)) throw new Error('bad file');
  const path = `${userId}/${crypto.randomUUID()}-${safeName(f.name)}`;
  const up = await supabase.storage.from('service-private').upload(path, f, { upsert: false, contentType: f.type });
  if (up.error) throw up.error;
  return path;
}
