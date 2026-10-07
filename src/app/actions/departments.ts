'use server';

import { revalidatePath } from 'next/cache';
import { db, type Sql } from '@/lib/db';
import { isUuid, required, run, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { actor, type CurrentUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { listText } from '@/lib/text';

// Departments: the teams people belong to. A shared catalogue, managed by admins.

const refresh = () => revalidatePath('/', 'layout');
const log = (sql: Sql, me: CurrentUser, message: string) =>
  logActivity(sql, { eventId: null, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message });

export async function addDepartment(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const name = required(fd, 'name', 'Department name', 60);
    const sql = await db();
    if ((await sql`select 1 from departments where lower(name) = lower(${name})`).length) throw new UserError(`${name} is already a department.`);
    const [{ p }] = await sql<{ p: number }[]>`select coalesce(max(position), 0)::int + 1 as p from departments`;
    await sql`insert into departments (name, position) values (${name}, ${p})`;
    await log(sql, me, `Added department ${name}`);
    refresh();
    return { ok: true, message: `${name} added.` };
  });
}

export async function renameDepartment(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const id = uuidOrNull(fd, 'department_id');
    if (!id) throw new UserError('Missing department.');
    const name = required(fd, 'name', 'Department name', 60);
    const sql = await db();
    if ((await sql`select 1 from departments where lower(name) = lower(${name}) and id <> ${id}`).length) throw new UserError(`${name} is already a department.`);
    const [d] = await sql<{ name: string }[]>`select name from departments where id = ${id}`;
    if (!d) throw new UserError('That department no longer exists.');
    await sql`update departments set name = ${name} where id = ${id}`;
    if (d.name !== name) await log(sql, me, `Renamed department ${d.name} to ${name}`);
    refresh();
    return { ok: true, message: 'Saved.' };
  });
}

/** People in an external department (agencies, contractors) can't mark sponsorship items sold. */
export async function setDepartmentExternal(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const id = uuidOrNull(fd, 'department_id');
    if (!id) throw new UserError('Missing department.');
    const external = fd.get('external') === '1';
    const sql = await db();
    const [d] = await sql<{ name: string }[]>`update departments set external = ${external} where id = ${id} returning name`;
    if (!d) throw new UserError('That department no longer exists.');
    await log(sql, me, `Marked ${d.name} as ${external ? 'outside' : 'inside'} the company`);
    refresh();
    return { ok: true, message: external ? `${d.name} is outside the company.` : `${d.name} is inside the company.` };
  });
}

export async function moveDepartment(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('manager');
    const id = uuidOrNull(fd, 'department_id');
    const dir = fd.get('dir');
    if (!id || (dir !== 'up' && dir !== 'down')) throw new UserError('Missing department.');
    const sql = await db();
    await sql.begin(async (tx) => {
      const list = await tx<{ id: string }[]>`select id from departments where not archived order by position, lower(name) for update`;
      const i = list.findIndex((x) => x.id === id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      for (let k = 0; k < list.length; k++) await tx`update departments set position = ${k + 1} where id = ${list[k].id}`;
    });
    refresh();
    return { ok: true };
  });
}

export async function setDepartmentArchived(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const id = uuidOrNull(fd, 'department_id');
    if (!id) throw new UserError('Missing department.');
    const archived = fd.get('archived') === '1';
    const sql = await db();
    const [d] = await sql<{ name: string }[]>`select name from departments where id = ${id}`;
    if (!d) throw new UserError('That department no longer exists.');
    await sql`update departments set archived = ${archived} where id = ${id}`;
    await log(sql, me, `${archived ? 'Archived' : 'Restored'} department ${d.name}`);
    refresh();
    return { ok: true, message: archived ? `${d.name} archived.` : `${d.name} restored.` };
  });
}

/** Sets exactly who is in a department (from the Departments page). */
export async function setDepartmentMembers(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const id = uuidOrNull(fd, 'department_id');
    if (!id) throw new UserError('Missing department.');
    const want = new Set(fd.getAll('user_ids').filter(isUuid));
    const sql = await db();
    const [d] = await sql<{ name: string }[]>`select name from departments where id = ${id}`;
    if (!d) throw new UserError('That department no longer exists.');
    const added = await sql.begin(async (tx) => {
      const have = new Set((await tx<{ user_id: string }[]>`select user_id from user_departments where department_id = ${id}`).map((r) => r.user_id));
      let changed = 0;
      for (const uid of want) if (!have.has(uid)) { await tx`insert into user_departments (user_id, department_id) values (${uid}, ${id}) on conflict do nothing`; changed++; }
      for (const uid of have) if (!want.has(uid)) { await tx`delete from user_departments where user_id = ${uid} and department_id = ${id}`; changed++; }
      return changed;
    });
    if (added) await log(sql, me, `Changed who is in ${d.name} (${want.size} ${want.size === 1 ? 'person' : 'people'})`);
    refresh();
    return { ok: true, message: added ? `Saved. ${d.name} has ${want.size} ${want.size === 1 ? 'person' : 'people'}.` : 'No changes to save.' };
  });
}

/**
 * Sets which departments a person is in (Admin › People, Show › Team). Only departments in use are offered there,
 * so memberships of archived departments are left alone.
 */
export async function setPersonDepartments(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const userId = uuidOrNull(fd, 'user_id');
    if (!userId) throw new UserError('Missing person.');
    const asked = new Set(fd.getAll('department_ids').filter(isUuid));
    const sql = await db();
    const [u] = await sql<{ full_name: string }[]>`select full_name from users where id = ${userId}`;
    if (!u) throw new UserError('That person no longer exists.');
    const { changed, names } = await sql.begin(async (tx) => {
      const live = await tx<{ id: string; name: string }[]>`select id, name from departments where not archived order by position, lower(name)`;
      const want = new Set(live.filter((d) => asked.has(d.id)).map((d) => d.id));
      const have = new Set((await tx<{ department_id: string }[]>`
        select ud.department_id from user_departments ud join departments d on d.id = ud.department_id
        where ud.user_id = ${userId} and not d.archived`).map((r) => r.department_id));
      let n = 0;
      for (const did of want) if (!have.has(did)) { await tx`insert into user_departments (user_id, department_id) values (${userId}, ${did}) on conflict do nothing`; n++; }
      for (const did of have) if (!want.has(did)) { await tx`delete from user_departments where user_id = ${userId} and department_id = ${did}`; n++; }
      return { changed: n, names: live.filter((d) => want.has(d.id)).map((d) => d.name) };
    });
    if (!changed) return { ok: true, message: 'No changes to save.' };
    await log(sql, me, `Changed ${u.full_name}’s departments`);
    refresh();
    const first = u.full_name.trim().split(/\s+/)[0];
    return { ok: true, message: `Saved. ${names.length ? `${first} is in ${listText(names)}.` : `${first} isn’t in a department now.`}` };
  });
}

/** Sets which departments a show involves (from the Event settings page). */
export async function setEventDepartments(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing show. Reload the page.');
    const want = new Set(fd.getAll('department_ids').filter(isUuid));
    const sql = await db();
    const [e] = await sql<{ name: string }[]>`select name from events where id = ${eventId}`;
    if (!e) throw new UserError('That event no longer exists.');
    const changed = await sql.begin(async (tx) => {
      const have = new Set((await tx<{ department_id: string }[]>`select department_id from event_departments where event_id = ${eventId}`).map((r) => r.department_id));
      let n = 0;
      for (const did of want) if (!have.has(did)) { await tx`insert into event_departments (event_id, department_id) values (${eventId}, ${did}) on conflict do nothing`; n++; }
      for (const did of have) if (!want.has(did)) { await tx`delete from event_departments where event_id = ${eventId} and department_id = ${did}`; n++; }
      return n;
    });
    if (changed) await log(sql, me, `Changed the departments involved in ${e.name}`);
    refresh();
    return { ok: true, message: changed ? 'Saved.' : 'No changes to save.' };
  });
}
