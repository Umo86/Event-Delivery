'use server';

import { revalidatePath } from 'next/cache';
import { db, type Sql } from '@/lib/db';
import { bool, date, required, run, str, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { actor, type CurrentUser } from '@/lib/auth/session';
import { getCurrentEvent } from '@/lib/data/load';
import { deleteBlobs, isStoreUrl } from '@/lib/storage';
import type { TaskStatus } from '@/lib/domain/types';

// A private kanban board, one per person per show. Everything here is scoped to the signed-in user —
// nobody can see or touch anybody else's tasks.

const STATUSES: TaskStatus[] = ['todo', 'in_process', 'complete'];
const refresh = () => revalidatePath('/inbox');

function readStatus(fd: FormData): TaskStatus {
  const v = fd.get('status');
  if (typeof v !== 'string' || !STATUSES.includes(v as TaskStatus)) throw new UserError('Pick a column.');
  return v as TaskStatus;
}

/** Loads a task the signed-in person owns, or throws. */
async function ownTask(sql: Sql, me: CurrentUser, taskId: string | null): Promise<{ id: string }> {
  if (!taskId) throw new UserError('Missing task.');
  const [t] = await sql<{ id: string }[]>`select id from tasks where id = ${taskId} and user_id = ${me.id}`;
  if (!t) throw new UserError('That task no longer exists.');
  return t;
}

export async function createTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const title = required(fd, 'title', 'Task', 200);
    const deadline = date(fd, 'deadline', 'Deadline');
    const status = fd.get('status') ? readStatus(fd) : 'todo';
    const event = await getCurrentEvent();
    if (!event) throw new UserError('Pick a show first.');
    const sql = await db();
    await sql`insert into tasks (user_id, event_id, title, deadline, status, completed_at)
      values (${me.id}, ${event.id}, ${title}, ${deadline}, ${status}, ${status === 'complete' ? sql`now()` : null})`;
    refresh();
    return { ok: true, message: 'Task added.' };
  });
}

export async function moveTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const status = readStatus(fd);
    const sql = await db();
    const task = await ownTask(sql, me, uuidOrNull(fd, 'task_id'));
    await sql`update tasks set status = ${status},
      completed_at = ${status === 'complete' ? sql`coalesce(completed_at, now())` : null}
      where id = ${task.id}`;
    refresh();
    return { ok: true };
  });
}

export async function updateTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const title = required(fd, 'title', 'Task', 200);
    const notes = str(fd, 'notes', 2000);
    const deadline = date(fd, 'deadline', 'Deadline');
    const sql = await db();
    const task = await ownTask(sql, me, uuidOrNull(fd, 'task_id'));
    await sql`update tasks set title = ${title}, notes = ${notes}, deadline = ${deadline} where id = ${task.id}`;
    refresh();
    return { ok: true, message: 'Saved.' };
  });
}

export async function deleteTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const sql = await db();
    const task = await ownTask(sql, me, uuidOrNull(fd, 'task_id'));
    const docs = await sql<{ url: string }[]>`select url from task_documents where task_id = ${task.id}`;
    await sql`delete from tasks where id = ${task.id}`; // subtasks and documents cascade
    await deleteBlobs(docs.map((d) => d.url));
    refresh();
    return { ok: true, message: 'Task deleted.' };
  });
}

export async function addSubtask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const title = required(fd, 'title', 'Sub-task', 200);
    const sql = await db();
    const task = await ownTask(sql, me, uuidOrNull(fd, 'task_id'));
    await sql`insert into task_subtasks (task_id, title) values (${task.id}, ${title})`;
    refresh();
    return { ok: true };
  });
}

export async function toggleSubtask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const id = uuidOrNull(fd, 'subtask_id');
    if (!id) throw new UserError('Missing sub-task.');
    const done = bool(fd, 'done');
    const sql = await db();
    const [row] = await sql<{ id: string }[]>`
      update task_subtasks s set done = ${done}
      from tasks t where s.task_id = t.id and s.id = ${id} and t.user_id = ${me.id}
      returning s.id`;
    if (!row) throw new UserError('That sub-task no longer exists.');
    refresh();
    return { ok: true };
  });
}

export async function deleteSubtask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const id = uuidOrNull(fd, 'subtask_id');
    if (!id) throw new UserError('Missing sub-task.');
    const sql = await db();
    const [row] = await sql<{ id: string }[]>`
      delete from task_subtasks s using tasks t
      where s.task_id = t.id and s.id = ${id} and t.user_id = ${me.id} returning s.id`;
    if (!row) throw new UserError('That sub-task no longer exists.');
    refresh();
    return { ok: true };
  });
}

/** Records a file the browser has already uploaded to Blob storage against a task. */
export async function attachDocument(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const url = str(fd, 'url', 1000);
    const name = required(fd, 'name', 'File name', 300);
    if (!url || !isStoreUrl(url)) throw new UserError('That file could not be saved.');
    const sizeStr = str(fd, 'size', 20);
    const size = sizeStr && /^\d+$/.test(sizeStr) ? Number(sizeStr) : null;
    const contentType = str(fd, 'content_type', 200);
    const sql = await db();
    const task = await ownTask(sql, me, uuidOrNull(fd, 'task_id'));
    await sql`insert into task_documents (task_id, name, url, size, content_type)
      values (${task.id}, ${name}, ${url}, ${size}, ${contentType})`;
    refresh();
    return { ok: true, message: 'File attached.' };
  });
}

export async function removeDocument(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('viewer');
    const id = uuidOrNull(fd, 'document_id');
    if (!id) throw new UserError('Missing file.');
    const sql = await db();
    const [row] = await sql<{ url: string }[]>`
      delete from task_documents d using tasks t
      where d.task_id = t.id and d.id = ${id} and t.user_id = ${me.id} returning d.url`;
    if (!row) throw new UserError('That file no longer exists.');
    await deleteBlobs([row.url]);
    refresh();
    return { ok: true, message: 'File removed.' };
  });
}
