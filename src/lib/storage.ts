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

/**
 * Uploads from the browser need the store's read-write token. Vercel adds it when the store is created
 * from the project; connecting an existing store only adds BLOB_STORE_ID (OIDC), which isn't enough.
 */
export function blobSetupProblem(): string | null {
  if (blobToken()) return null;
  if (process.env.BLOB_STORE_ID) {
    return 'A Blob store is connected, but its read-write token is missing. In Vercel, open Storage, select the Blob store, copy BLOB_READ_WRITE_TOKEN from its .env.local tab into this project’s Environment Variables, then redeploy.';
  }
  return 'No Blob store is connected. In Vercel, open this project’s Storage tab, create a Blob store (Private access) for this project, then redeploy.';
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

/** Origin of the local Blob emulator, only when one is configured (development and tests). */
function emulatorOrigin(): string | null {
  const api = process.env.VERCEL_BLOB_API_URL;
  if (!api) return null;
  try {
    return new URL(api).origin;
  } catch {
    return null;
  }
}

/** True for addresses this app may store and read files from. */
export function isStoreUrl(url: string): boolean {
  if (isVercelBlobUrl(url)) return true;
  const local = emulatorOrigin();
  try {
    return !!local && new URL(url).origin === local;
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
  // Local development / tests only: the Blob emulator serves files at its own address.
  // Never send the token anywhere else.
  if (!isStoreUrl(url)) return null;
  const res = await fetch(url, { headers: { authorization: `Bearer ${blobToken()}` } });
  if (res.status === 404) return null;
  if (!res.ok || !res.body) throw new Error(`Could not read file (${res.status})`);
  return { stream: res.body, contentType: res.headers.get('content-type') ?? 'application/octet-stream', size: Number(res.headers.get('content-length') ?? 0) };
}

/** Looks a file up in the store. Returns the store's own record (including its canonical URL), or null. */
export async function blobExists(url: string): Promise<{ url: string; size: number; contentType: string; pathname: string } | null> {
  if (!isStoreUrl(url)) return null;
  try {
    const h = await head(url, { token: blobToken() });
    if (!isStoreUrl(h.url)) return null;
    return { url: h.url, size: h.size, contentType: h.contentType, pathname: h.pathname };
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
