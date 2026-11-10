import { normalizeCoinUrl, maskCoinText } from '../../shared/coinUrl.js';

// Web NFC helpers shared by the one-time reveal screen and the Write coin page. Web NFC exists only in Android Chrome.
// Nothing here stores or sends the address; it only hands it to the phone's NFC chip.
export const nfcSupported = () => typeof window !== 'undefined' && 'NDEFReader' in window && window.isSecureContext;

export function nfcErrorText(e: any): string {
  if (e?.name === 'AbortError') return 'Cancelled.';
  if (e?.name === 'NotAllowedError') return 'NFC was not allowed. Turn NFC on in your phone settings, allow it for this site, then try again.';
  if (e?.name === 'NotSupportedError') return 'This phone has no usable NFC, or NFC is switched off.';
  if (e?.name === 'NetworkError') return 'The sticker moved away or could not be written. Hold it still against the back of the phone and try again.';
  return 'Could not use NFC: ' + (e?.message || 'unknown error');
}

/** An AbortController that also aborts itself after `ms`; `timedOut()` tells the two apart. */
export function nfcTimer(ms = 30000) {
  const ac = new AbortController(); let t = false;
  const id = window.setTimeout(() => { t = true; ac.abort(); }, ms);
  return { signal: ac.signal, abort: () => ac.abort(), timedOut: () => t, done: () => window.clearTimeout(id) };
}

export async function writeUrl(url: string, signal: AbortSignal): Promise<void> {
  const reader = new (window as any).NDEFReader();
  await reader.write({ records: [{ recordType: 'url', data: url }] }, { overwrite: true, signal });
}

/** Resolves with the text of the first url/text record of the next sticker held to the phone ('' when it has none). */
export function readTag(signal: AbortSignal, onUnreadable?: () => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new (window as any).NDEFReader();
    const stop = new AbortController();
    const onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    signal.addEventListener('abort', onAbort);
    reader.onreadingerror = () => onUnreadable?.();
    reader.onreading = (ev: any) => {
      let found = '';
      for (const rec of ev.message?.records || []) {
        if (rec.recordType !== 'url' && rec.recordType !== 'text') continue;
        try { found = new TextDecoder(rec.encoding || 'utf-8').decode(rec.data); } catch { found = ''; }
        if (found) break;
      }
      signal.removeEventListener('abort', onAbort); resolve(found); stop.abort();
    };
    reader.scan({ signal: stop.signal }).catch((e: any) => { signal.removeEventListener('abort', onAbort); reject(e); });
    signal.addEventListener('abort', () => stop.abort());
  });
}

/** Write, then read the sticker back and compare. Reports progress through `say`. Throws on failure; returns normally only when it matches. */
export async function writeAndVerify(url: string, say: (s: 'writing' | 'verifying', msg: string) => void, signal: AbortSignal): Promise<void> {
  say('writing', 'Hold a blank sticker against the back of your phone and keep it still…');
  await writeUrl(url, signal);
  say('verifying', 'Written. Keep the sticker there: checking it…');
  const found = await readTag(signal);
  if (normalizeCoinUrl(found) !== normalizeCoinUrl(url)) throw Object.assign(new Error(found ? 'The sticker holds a different address: ' + maskCoinText(found) : 'The sticker reads back empty.'), { name: 'VerifyError' });
}
