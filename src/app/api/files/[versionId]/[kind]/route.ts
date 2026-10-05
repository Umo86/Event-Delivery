import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { sha256 } from '@/lib/auth/password';
import { readBlob } from '@/lib/storage';
import { sponsorLinksEnabled } from '@/lib/settings';

// Serves artwork files to signed-in users, or to a sponsor holding a valid approval link (?s=token).
export async function GET(request: Request, ctx: { params: Promise<{ versionId: string; kind: string }> }) {
  const { versionId, kind } = await ctx.params;
  const notFound = () => new Response('Not found', { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(versionId) || !['original', 'preview', 'thumb'].includes(kind)) return notFound();
  const url = new URL(request.url);
  const sql = await db();
  const [v] = await sql<{ item_id: string; version: number; file_url: string; preview_url: string | null; thumb_url: string | null; file_name: string; mime_type: string }[]>`
    select item_id, version, file_url, preview_url, thumb_url, file_name, mime_type from artwork_versions where id = ${versionId}`;
  if (!v) return notFound();

  let allowed = !!(await getCurrentUser());
  const share = url.searchParams.get('s');
  if (!allowed && share && (await sponsorLinksEnabled())) {
    // A sponsor link opens only the artwork version it was sent for.
    const [l] = await sql<{ item_id: string; version: number }[]>`
      select item_id, version from share_links where token_hash = ${sha256(share.slice(0, 200))} and revoked_at is null and expires_at > now()`;
    allowed = !!l && l.item_id === v.item_id && l.version === v.version;
  }
  if (!allowed) return notFound();

  const isImage = v.mime_type.startsWith('image/');
  const blobUrl = kind === 'original' ? v.file_url
    : kind === 'preview' ? (v.preview_url ?? (isImage ? v.file_url : null))
      : (v.thumb_url ?? v.preview_url ?? (isImage ? v.file_url : null));
  if (!blobUrl) return notFound();
  const blob = await readBlob(blobUrl);
  if (!blob) return notFound();

  const headers = new Headers({
    'content-type': blob.contentType,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  if (blob.size) headers.set('content-length', String(blob.size));
  if (kind === 'original') {
    const ascii = v.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    const disp = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    headers.set('content-disposition', `${disp}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(v.file_name)}`);
  }
  return new Response(blob.stream, { headers });
}
