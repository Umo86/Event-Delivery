import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ALLOWED_UPLOAD_TYPES, artworkPrefix, blobToken, MAX_DERIVED_BYTES, MAX_ORIGINAL_BYTES } from '@/lib/storage';

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
        if (!me || me.role === 'viewer') throw new Error('You need to be signed in as a member to upload.');
        const payload = JSON.parse(clientPayload ?? '{}') as { itemId?: string; kind?: string };
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
          tokenPayload: JSON.stringify({ userId: me.id, itemId: item.id }),
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
