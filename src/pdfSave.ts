/* Save a CV sheet as a real PDF file (downloaded straight away, no print dialog, nothing but the CV in it).
   1. html-to-image draws ONLY the CV sheet (the browser's own renderer, so Khmer text, fonts and the auto-fit all look exactly like the preview)
   2. the picture is wrapped in a one-page A4 PDF by the small writer below (no PDF library needed). */

/** One-page A4 PDF whose single image fills the page. */
export async function canvasToPdfBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  const jpg: Blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not make the picture'))), 'image/jpeg', quality));
  const img = new Uint8Array(await jpg.arrayBuffer());
  const W = 595.28, H = 841.89;   // A4 in points
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offs: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
  const obj = (n: number, body: () => void) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('endobj\n'); };
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  push('%PDF-1.4\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>\n'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`));
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`);
    push(img); push('\nendstream\n');
  });
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`));
  const xref = len;
  push('xref\n0 6\n0000000000 65535 f \n');
  for (let n = 1; n <= 5; n++) push(String(offs[n]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Draws `sheet` (the 794 x 1123 CV element) and downloads it as "<name>.pdf". Throws if anything goes wrong. */
export async function saveSheetAsPdf(sheet: HTMLElement, name: string): Promise<void> {
  const { toCanvas } = await import('html-to-image');
  await (document as any).fonts?.ready;
  const opts = { width: 794, height: 1123, pixelRatio: 2.5, backgroundColor: '#ffffff' };
  await toCanvas(sheet, opts).catch(() => null);   // warm-up: Safari sometimes misses fonts/images on the first draw
  const canvas = await toCanvas(sheet, opts);
  const blob = await canvasToPdfBlob(canvas);
  const safe = (name || 'CV').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'CV';
  downloadBlob(blob, safe + '.pdf');
}
