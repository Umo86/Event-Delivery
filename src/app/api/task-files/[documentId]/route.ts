import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { readBlob } from '@/lib/storage';

// Serves a task's attached file, but only to the person who owns that task.
export async function GET(request: Request, ctx: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await ctx.params;
  const notFound = () => new Response('Not found', { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return notFound();
  const me = await getCurrentUser();
  if (!me) return notFound();

  const sql = await db();
  const [doc] = await sql<{ url: string; name: string }[]>`
    select d.url, d.name from task_documents d
    join tasks t on t.id = d.task_id
    where d.id = ${documentId} and t.user_id = ${me.id}`;
  if (!doc) return notFound();

  const blob = await readBlob(doc.url);
  if (!blob) return notFound();

  const url = new URL(request.url);
  const ascii = doc.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  const disp = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const headers = new Headers({
    'content-type': blob.contentType,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-disposition': `${disp}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
  });
  if (blob.size) headers.set('content-length', String(blob.size));
  return new Response(blob.stream, { headers });
}
