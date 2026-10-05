'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { required, run, str, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { actor } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';

async function readSponsor(fd: FormData) {
  const am = uuidOrNull(fd, 'account_manager_id');
  if (am) {
    const sql = await db();
    if (!(await sql`select 1 from users where id = ${am}`).length) throw new UserError('Choose an account manager from the team.');
  }
  const email = str(fd, 'contact_email', 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Enter a valid contact email.');
  return {
    name: required(fd, 'name', 'Sponsor name', 120),
    package: str(fd, 'package', 120),
    account_manager_id: am,
    contact_name: str(fd, 'contact_name', 120),
    contact_email: email,
    notes: str(fd, 'notes', 2000),
  };
}

export async function createSponsor(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('member');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing event.');
    const s = await readSponsor(fd);
    const sql = await db();
    const dup = await sql`select 1 from sponsors where event_id = ${eventId} and lower(name) = lower(${s.name})`;
    if (dup.length) throw new UserError(`${s.name} is already on the list.`);
    await sql`insert into sponsors ${sql({ ...s, event_id: eventId } as never)}`;
    await logActivity(sql, { eventId, itemId: null, userId: me.id, actorName: me.full_name, kind: 'sponsor', message: `Added sponsor ${s.name}` });
    revalidatePath('/', 'layout');
    return { ok: true, message: `${s.name} added.` };
  });
}

export async function updateSponsor(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('member');
    const id = uuidOrNull(fd, 'sponsor_id');
    if (!id) throw new UserError('Missing sponsor.');
    const s = await readSponsor(fd);
    const sql = await db();
    const [cur] = await sql<{ event_id: string }[]>`select event_id from sponsors where id = ${id}`;
    if (!cur) throw new UserError('That sponsor no longer exists.');
    const dup = await sql`select 1 from sponsors where event_id = ${cur.event_id} and lower(name) = lower(${s.name}) and id <> ${id}`;
    if (dup.length) throw new UserError(`Another sponsor is already called ${s.name}.`);
    await sql`update sponsors set ${sql(s as never)} where id = ${id}`;
    await logActivity(sql, { eventId: cur.event_id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'sponsor', message: `Updated sponsor ${s.name}` });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Saved.' };
  });
}

export async function deleteSponsor(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const id = uuidOrNull(fd, 'sponsor_id');
    if (!id) throw new UserError('Missing sponsor.');
    const sql = await db();
    const [s] = await sql<{ event_id: string; name: string }[]>`select event_id, name from sponsors where id = ${id}`;
    if (!s) throw new UserError('That sponsor no longer exists.');
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from items where sponsor_id = ${id}`;
    if (n > 0) throw new UserError(`${s.name} still has ${n} line${n === 1 ? '' : 's'}. Move or delete them first.`);
    await sql`delete from sponsors where id = ${id}`;
    await logActivity(sql, { eventId: s.event_id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'sponsor', message: `Removed sponsor ${s.name}` });
    revalidatePath('/', 'layout');
    redirect('/sponsors');
  });
}
