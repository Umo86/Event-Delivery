import 'server-only';
import type { Sql } from '@/lib/db';

export async function logActivity(
  sql: Sql,
  a: { eventId: string | null; itemId: string | null; userId: string | null; actorName: string; kind: string; message: string },
): Promise<void> {
  await sql`insert into activity (event_id, item_id, user_id, actor_name, kind, message)
            values (${a.eventId}, ${a.itemId}, ${a.userId}, ${a.actorName}, ${a.kind}, ${a.message})`;
}
