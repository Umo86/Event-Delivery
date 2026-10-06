'use server';

import { revalidatePath } from 'next/cache';
import type { TransactionSql } from 'postgres';
import { db, type Sql } from '@/lib/db';
import { date, isUuid, required, run, str, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { actor, type CurrentUser } from '@/lib/auth/session';
import { loadSchedule } from '@/lib/data/load';
import { isTaskStatus } from '@/lib/domain/tasks';
import type { TaskRow, TaskStatus } from '@/lib/domain/types';

// A person's board on the My actions page. Tasks are personal, so anyone who can sign in (viewers included) can keep their own.

const refresh = () => revalidatePath('/', 'layout');

async function ownTask(sql: Sql, me: CurrentUser, id: string | null): Promise<TaskRow> {
  if (!id) throw new UserError('Missing task.');
  const [t] = await sql<TaskRow[]>`select * from tasks where id = ${id} and user_id = ${me.id}`;
  if (!t) throw new UserError('That task no longer exists.');
  return t;
}

/** A line the task points at must be in the same show. */
async function checkItem(sql: Sql, eventId: string, itemId: string | null) {
  if (!itemId) return;
  const [i] = await sql`select 1 from items where id = ${itemId} and event_id = ${eventId}`;
  if (!i) throw new UserError('That line isn’t in this show.');
}

/** Puts the tasks in a column in order, 1..n. Keeps the moved task's new status in step. */
async function renumber(tx: TransactionSql<Record<string, never>>, me: CurrentUser, eventId: string, status: TaskStatus, movedId: string | null, beforeId: string | null) {
  const rows = await tx<{ id: string }[]>`select id from tasks where user_id = ${me.id} and event_id = ${eventId} and status = ${status}
    and id is distinct from ${movedId} order by position, created_at`;
  const ids = rows.map((r) => r.id);
  if (movedId) {
    let at = beforeId ? ids.indexOf(beforeId) : -1;
    if (at < 0) at = ids.length;
    ids.splice(at, 0, movedId);
  }
  for (let k = 0; k < ids.length; k++) await tx`update tasks set position = ${k + 1} where id = ${ids[k]}`;
}

export async function addTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing show.');
    const status = fd.get('status');
    if (!isTaskStatus(status)) throw new UserError('Choose a column.');
    const title = required(fd, 'title', 'Task', 200);
    const notes = str(fd, 'notes', 2000);
    const due = date(fd, 'due', 'Due date');
    const itemId = uuidOrNull(fd, 'item_id');
    const sql = await db();
    if (!(await sql`select 1 from events where id = ${eventId}`).length) throw new UserError('That show no longer exists.');
    await checkItem(sql, eventId, itemId);
    const id = await sql.begin(async (tx) => {
      const [{ p }] = await tx<{ p: number }[]>`select coalesce(max(position), 0)::int + 1 as p from tasks
        where user_id = ${me.id} and event_id = ${eventId} and status = ${status}`;
      const [t] = await tx<{ id: string }[]>`insert into tasks (event_id, user_id, item_id, title, notes, due, status, position, completed_at)
        values (${eventId}, ${me.id}, ${itemId}, ${title}, ${notes}, ${due}, ${status}, ${p}, ${status === 'complete' ? new Date() : null})
        returning id`;
      return t.id;
    });
    refresh();
    return { ok: true, message: 'Task added.', data: { id } };
  });
}

export async function updateTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const sql = await db();
    const t = await ownTask(sql, me, uuidOrNull(fd, 'task_id'));
    const title = required(fd, 'title', 'Task', 200);
    const notes = str(fd, 'notes', 2000);
    const due = date(fd, 'due', 'Due date');
    const itemId = uuidOrNull(fd, 'item_id');
    await checkItem(sql, t.event_id, itemId);
    await sql`update tasks set title = ${title}, notes = ${notes}, due = ${due}, item_id = ${itemId}, updated_at = now() where id = ${t.id}`;
    refresh();
    return { ok: true, message: 'Saved.' };
  });
}

/** Moves a task to a column, placing it before another task there (or at the end). */
export async function moveTask(taskId: string, status: TaskStatus, beforeId: string | null): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    if (!isUuid(taskId) || !isTaskStatus(status) || (beforeId !== null && !isUuid(beforeId))) throw new UserError('Invalid move.');
    const sql = await db();
    const t = await ownTask(sql, me, taskId);
    await sql.begin(async (tx) => {
      await tx`update tasks set status = ${status},
        completed_at = case when ${status} = 'complete' then coalesce(completed_at, now()) else null end,
        updated_at = now() where id = ${t.id}`;
      await renumber(tx, me, t.event_id, status, t.id, beforeId === t.id ? null : beforeId);
      if (t.status !== status) await renumber(tx, me, t.event_id, t.status, null, null);
    });
    refresh();
    return { ok: true };
  });
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    if (!isUuid(taskId)) throw new UserError('Missing task.');
    const sql = await db();
    const t = await ownTask(sql, me, taskId);
    await sql`delete from tasks where id = ${t.id}`;
    refresh();
    return { ok: true, message: 'Task removed.' };
  });
}

/** Marks a schedule line as started (in progress) on this person's board, or puts it back to "to do". */
export async function setLineStarted(itemId: string, started: boolean): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    if (!isUuid(itemId)) throw new UserError('Missing line.');
    const sql = await db();
    if (!(await sql`select 1 from items where id = ${itemId}`).length) throw new UserError('That line no longer exists.');
    if (started) await sql`insert into item_progress (user_id, item_id) values (${me.id}, ${itemId}) on conflict do nothing`;
    else await sql`delete from item_progress where user_id = ${me.id} and item_id = ${itemId}`;
    refresh();
    return { ok: true };
  });
}

/** Empties the Complete column: finished tasks are deleted, and lines that no longer wait on the person are cleared. */
export async function clearCompleted(eventId: string): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    if (!isUuid(eventId)) throw new UserError('Missing show.');
    const sql = await db();
    const sched = await loadSchedule(eventId);
    if (!sched) throw new UserError('That show no longer exists.');
    const done = sched.rows.filter((r) => !r.state.waitingOnUserIds.includes(me.id)).map((r) => r.item.id);
    const n = await sql.begin(async (tx) => {
      const removed = await tx`delete from tasks where user_id = ${me.id} and event_id = ${eventId} and status = 'complete'`;
      if (done.length) await tx`delete from item_progress where user_id = ${me.id} and item_id in ${tx(done)}`;
      return removed.count;
    });
    refresh();
    return { ok: true, message: n ? `Cleared ${n} finished task${n === 1 ? '' : 's'}.` : 'Cleared.' };
  });
}
