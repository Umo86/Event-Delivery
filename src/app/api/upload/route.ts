import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import {
  ALLOWED_UPLOAD_TYPES, artworkPrefix, blobToken, MAX_DERIVED_BYTES, MAX_ORIGINAL_BYTES,
  TASK_DOC_TYPES, taskDocPrefix,
} from '@/lib/storage';

// Issues short-lived upload tokens so the browser can send artwork straight to Blob storage.
export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  try {
    const json = await handleUpload({
      body,
      request,
      token: blobToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const me = await getCurrentUser();
        if (!me) throw new Error('You need to be signed in to upload.');
        const payload = JSON.parse(clientPayload ?? '{}') as { itemId?: string; kind?: string; taskId?: string };

        // A file attached to one of the uploader's own private tasks.
        if (payload.kind === 'task') {
          if (!payload.taskId || !/^[0-9a-f-]{36}$/i.test(payload.taskId)) throw new Error('Missing task.');
          const sql = await db();
          const [task] = await sql<{ id: string }[]>`select id from tasks where id = ${payload.taskId} and user_id = ${me.id}`;
          if (!task) throw new Error('That task no longer exists.');
          if (!pathname.startsWith(taskDocPrefix(me.id, task.id))) throw new Error('Upload path does not match the task.');
          return {
            allowedContentTypes: TASK_DOC_TYPES,
            maximumSizeInBytes: MAX_ORIGINAL_BYTES,
            addRandomSuffix: true,
            cacheControlMaxAge: 60 * 60 * 24 * 365,
            tokenPayload: JSON.stringify({ userId: me.id, taskId: task.id }),
          };
        }

        if (me.role === 'user') throw new Error('You need to be a Manager or Super Admin to upload.');
        if (!payload.itemId || !/^[0-9a-f-]{36}$/i.test(payload.itemId)) throw new Error('Missing line.');
        const sql = await db();
        const [item] = await sql<{ id: string; event_id: string; cancelled: boolean }[]>`
          select id, event_id, cancelled from items where id = ${payload.itemId}`;
        if (!item) throw new Error('That line no longer exists.');
        if (item.cancelled) throw new Error('This line is cancelled.');
        if (!pathname.startsWith(artworkPrefix(item.event_id, item.id))) throw new Error('Upload path does not match the line.');
        const original = payload.kind === 'original';
        return {
          allowedContentTypes: original ? ALLOWED_UPLOAD_TYPES : ['image/jpeg'],
          maximumSizeInBytes: original ? MAX_ORIGINAL_BYTES : MAX_DERIVED_BYTES,
          addRandomSuffix: true,
          // Paths are unique and never overwritten, so let Vercel's cache keep them for a year (fewer billed reads).
          cacheControlMaxAge: 60 * 60 * 24 * 365,
          tokenPayload: JSON.stringify({ userId: me.id, itemId: item.id }),
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
