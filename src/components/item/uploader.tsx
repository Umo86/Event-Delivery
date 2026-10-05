'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Upload } from 'lucide-react';
import { commitArtwork } from '@/app/actions/items';
import { btn, cx } from '../ui';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_BYTES = 25 * 1024 * 1024;

type Derived = { preview: Blob | null; thumb: Blob | null; width: number | null; height: number | null; pages: number | null };

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

function drawScaled(src: CanvasImageSource, w: number, h: number, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

async function makeDerived(file: File): Promise<Derived> {
  if (file.type === 'application/pdf') {
    // The legacy build carries polyfills, so previews also work in older browsers (it's loaded only when a PDF is picked).
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1600 / Math.max(base.width, base.height), 6);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    const preview = await canvasToJpeg(canvas, 0.85);
    const thumb = await canvasToJpeg(drawScaled(canvas, canvas.width, canvas.height, 300), 0.8);
    // PDF points to millimetres for the record
    const result = { preview, thumb, width: Math.round(base.width), height: Math.round(base.height), pages: doc.numPages };
    await task.destroy();
    return result;
  }
  const bmp = await createImageBitmap(file);
  // A small image is its own preview, which saves an upload (Vercel's free plan counts uploads).
  const smallEnough = file.size <= 1.5 * 1024 * 1024 && Math.max(bmp.width, bmp.height) <= 2400;
  const preview = smallEnough ? null : await canvasToJpeg(drawScaled(bmp, bmp.width, bmp.height, 1600), 0.85);
  const thumb = await canvasToJpeg(drawScaled(bmp, bmp.width, bmp.height, 300), 0.8);
  const r = { preview, thumb, width: bmp.width, height: bmp.height, pages: null };
  bmp.close();
  return r;
}

export function ArtworkUploader({ itemId, eventId, access, nextVersion, hasArtwork, compact = false }: {
  itemId: string; eventId: string; access: 'public' | 'private'; nextVersion: number; hasArtwork: boolean; compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  function pick(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (!ALLOWED.includes(f.type)) return setError('Upload a PDF, PNG, JPG, WebP or GIF file.');
    if (f.size > MAX_BYTES) return setError('That file is over 25 MB. Upload a smaller proof and add a link to the full-size file in the line’s details.');
    setFile(f);
  }

  async function send() {
    if (!file) return;
    setError(null);
    try {
      setBusy('Preparing preview…');
      let derived: Derived = { preview: null, thumb: null, width: null, height: null, pages: null };
      try {
        derived = await makeDerived(file);
      } catch (e) {
        console.warn('Preview generation failed', e);
      }
      const base = `artwork/${eventId}/${itemId}/v${nextVersion}-${Date.now().toString(36)}`;
      const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '').slice(-80) || 'artwork';
      const opts = (kind: string) => ({ access, handleUploadUrl: '/api/upload', clientPayload: JSON.stringify({ itemId, kind }) });
      setBusy('Uploading…');
      // One request per file (files are at most 25 MB): multipart would count extra billed operations.
      // No upload-progress callback on purpose: with one, Chrome streams the request body, which needs
      // HTTP/2 end to end and fails behind proxies that only speak HTTP/1.1.
      const original = await upload(`${base}/original-${safeName}`, file, { ...opts('original'), contentType: file.type });
      const preview = derived.preview ? await upload(`${base}/preview.jpg`, derived.preview, { ...opts('preview'), contentType: 'image/jpeg' }) : null;
      const thumb = derived.thumb ? await upload(`${base}/thumb.jpg`, derived.thumb, { ...opts('thumb'), contentType: 'image/jpeg' }) : null;
      setBusy('Saving…');
      const f = (r: { url: string; pathname: string } | null, size: number, type: string) => (r ? { url: r.url, pathname: r.pathname, size, contentType: type } : null);
      const res = await commitArtwork({
        itemId,
        original: f(original, file.size, file.type)!,
        preview: f(preview, derived.preview?.size ?? 0, 'image/jpeg'),
        thumb: f(thumb, derived.thumb?.size ?? 0, 'image/jpeg'),
        fileName: file.name,
        widthPx: derived.width,
        heightPx: derived.height,
        pageCount: derived.pages,
        note: note.trim() || null,
      });
      if (!res.ok) throw new Error(res.error);
      setFile(null);
      setNote('');
      if (input.current) input.current.value = '';
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^Vercel Blob: /, '') || 'Upload failed. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
        className={cx('rounded-[10px] border-2 border-dashed px-4 text-center transition-colors',
          compact ? 'py-4' : 'py-7', drag ? 'border-ink bg-signal-soft' : 'border-line-strong bg-paper/60')}
      >
        <input ref={input} type="file" accept={ALLOWED.join(',')} className="sr-only" id={`upload-${itemId}`}
          onChange={(e) => pick(e.target.files?.[0])} />
        {!file ? (
          <>
            <Upload size={22} className="mx-auto text-muted" aria-hidden />
            <p className="mt-2 text-[14.5px] text-ink">
              {hasArtwork ? 'Upload a revised version' : 'Upload the artwork'}: drop a file here or{' '}
              <label htmlFor={`upload-${itemId}`} className="cursor-pointer font-semibold underline underline-offset-2">choose one</label>
            </p>
            <p className="mt-1 text-[12.5px] text-muted">PDF, PNG, JPG, WebP or GIF up to 25 MB.{hasArtwork ? ' A new version restarts sign-off.' : ''}</p>
          </>
        ) : (
          <div className="text-left">
            <p className="text-[14.5px] font-semibold text-ink">
              {file.name} <span className="font-normal text-muted">({(file.size / 1024 / 1024).toFixed(1)} MB) will become v{nextVersion}</span>
            </p>
            <label htmlFor={`note-${itemId}`} className="mt-3 block text-[13px] font-semibold text-ink-2">What changed? (optional)</label>
            <input id={`note-${itemId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
              placeholder="e.g. logo enlarged as requested"
              className="mt-1 h-9 w-full rounded-md border border-line-strong bg-white px-3 text-[14px] focus:border-ink focus:outline-none" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={send} disabled={!!busy} className={cx(btn.base, btn.primary)}>
                {busy ?? `Upload v${nextVersion}`}
              </button>
              <button type="button" disabled={!!busy} onClick={() => { setFile(null); if (input.current) input.current.value = ''; }}
                className={cx(btn.base, btn.ghost)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[14px] text-red-800">{error}</p>}
    </div>
  );
}
