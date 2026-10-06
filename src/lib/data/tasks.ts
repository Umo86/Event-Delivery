import 'server-only';
import { db } from '@/lib/db';
import type { TaskRow } from '@/lib/domain/types';

/** A person's tasks for a show, and the lines in that show they have moved to "in progress". */
export async function loadBoardData(eventId: string, userId: string): Promise<{ tasks: TaskRow[]; started: Set<string> }> {
  const sql = await db();
  const [tasks, started] = await Promise.all([
    sql<TaskRow[]>`select * from tasks where event_id = ${eventId} and user_id = ${userId} order by status, position, created_at`,
    sql<{ item_id: string }[]>`select p.item_id from item_progress p join items i on i.id = p.item_id
      where p.user_id = ${userId} and i.event_id = ${eventId}`,
  ]);
  return { tasks, started: new Set(started.map((s) => s.item_id)) };
}

/** Open tasks (to do or in progress) a person has for a show, for the count in the navigation. */
export async function countOpenTasks(eventId: string, userId: string): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from tasks
    where event_id = ${eventId} and user_id = ${userId} and status <> 'complete'`;
  return r?.n ?? 0;
}
