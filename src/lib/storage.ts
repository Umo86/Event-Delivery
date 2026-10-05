import 'server-only';
import { del, get, head } from '@vercel/blob';

/** Read-write token for the Blob store (Vercel may add a custom prefix to the variable name). */
export function blobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const hit = Object.entries(process.env).find(([k, v]) => /(^|_)BLOB_READ_WRITE_TOKEN$/.test(k) && v);
  return hit?.[1];
}

export function blobAccess(): 'public' | 'private' {
  return process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
}

export function isBlobConfigured(): boolean {
  return !!blobToken();
}

export const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024; // keeps the free 1 GB Blob allowance comfortable
export const MAX_DERIVED_BYTES = 5 * 1024 * 1024;

export function artworkPrefix(eventId: string, itemId: string): string {
  return `artwork/${eventId}/${itemId}/`;
}

function isVercelBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

/** Streams a stored file. Returns null when it no longer exists. */
export async function readBlob(url: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number } | null> {
  if (isVercelBlobUrl(url)) {
    const r = await get(url, { access: blobAccess(), token: blobToken() });
    if (!r || r.statusCode !== 200) return null;
    return { stream: r.stream, contentType: r.blob.contentType, size: r.blob.size };
  }
  // Local development / tests: the Blob emulator serves files at its own address.
  const res = await fetch(url, { headers: { authorization: `Bearer ${blobToken()}` } });
  if (res.status === 404) return null;
  if (!res.ok || !res.body) throw new Error(`Could not read file (${res.status})`);
  return { stream: res.body, contentType: res.headers.get('content-type') ?? 'application/octet-stream', size: Number(res.headers.get('content-length') ?? 0) };
}

export async function blobExists(url: string): Promise<{ size: number; contentType: string; pathname: string } | null> {
  try {
    const h = await head(url, { token: blobToken() });
    return { size: h.size, contentType: h.contentType, pathname: h.pathname };
  } catch {
    return null;
  }
}

export async function deleteBlobs(urls: (string | null | undefined)[]): Promise<void> {
  const list = urls.filter((u): u is string => !!u);
  if (!list.length) return;
  try {
    await del(list, { token: blobToken() });
  } catch (e) {
    console.error('Blob delete failed', e);
  }
}
