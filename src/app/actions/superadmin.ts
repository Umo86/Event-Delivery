'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db, type Sql } from '@/lib/db';
import { bool, run, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { sha256 } from '@/lib/auth/password';
import { SESSION_COOKIE, superActor, type CurrentUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { SETTING, writeSetting } from '@/lib/settings';
import { EVENT_COOKIE } from '@/lib/data/load';
import { addSampleData, removeSampleData, SAMPLE_SHOW } from '@/lib/data/sample';

// Platform-wide controls on Admin › Platform that only super admins have. Every change goes in the access log.

const refresh = () => revalidatePath('/', 'layout');

async function audit(sql: Sql, me: CurrentUser, message: string) {
  await logActivity(sql, { eventId: null, itemId: null, userId: me.id, actorName: me.full_name, kind: 'access', message });
}

async function person(sql: Sql, fd: FormData) {
  const id = uuidOrNull(fd, 'user_id');
  if (!id) throw new UserError('Missing person.');
  const [p] = await sql<{ id: string; full_name: string; role: string; active: boolean; is_super_admin: boolean; is_demo: boolean }[]>`
    select id, full_name, role, active, (role = 'super_admin') as is_super_admin, is_demo from users where id = ${id}`;
  if (!p) throw new UserError('That person no longer exists. Reload the page.');
  return p;
}

export async function signOutPerson(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await superActor();
    const sql = await db();
    const p = await person(sql, fd);
    if (p.id === me.id) throw new UserError('Use Sign out to sign yourself out.');
    const gone = await sql`delete from sessions where user_id = ${p.id} returning id`;
    await audit(sql, me, `Signed ${p.full_name} out everywhere`);
    refresh();
    return { ok: true, message: `${p.full_name} has been signed out (${gone.length} session${gone.length === 1 ? '' : 's'}). They can sign in again.` };
  });
}

export async function signOutEveryoneElse(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await superActor();
    const sql = await db();
    const jar = await cookies();
    const mine = jar.get(SESSION_COOKIE)?.value;
    const gone = await sql`delete from sessions where token_hash <> ${mine ? sha256(mine) : ''} returning id`;
    await audit(sql, me, 'Signed everyone else out');
    refresh();
    return { ok: true, message: `Everyone else has been signed out (${gone.length} session${gone.length === 1 ? '' : 's'}).` };
  });
}

export async function setMaintenance(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await superActor();
    const on = bool(fd, 'on');
    const sql = await db();
    await writeSetting(sql, SETTING.maintenance, on ? 'on' : 'off');
    await audit(sql, me, `Turned maintenance mode ${on ? 'on' : 'off'}`);
    refresh();
    return {
      ok: true,
      message: on
        ? 'Maintenance mode is on. Only super admins can sign in or use the platform until you turn it off.'
        : 'Maintenance mode is off. Everyone can sign in again.',
    };
  });
}

export async function setDemoLogin(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await superActor();
    const on = bool(fd, 'on');
    const sql = await db();
    const [demo] = await sql<{ id: string; full_name: string }[]>`select id, full_name from users where is_demo order by created_at limit 1`;
    if (!demo) throw new UserError('There’s no demo login. It’s set up in the deployment settings.');
    await sql`update users set active = ${on} where id = ${demo.id}`;
    if (!on) await sql`delete from sessions where user_id = ${demo.id}`;
    await audit(sql, me, `${on ? 'Reactivated' : 'Deactivated'} the demo login (${demo.full_name})`);
    refresh();
    return { ok: true, message: on ? 'The demo login is back on the sign-in page.' : 'The demo login is off the sign-in page and no longer works.' };
  });
}

// ---- Sample data -------------------------------------------------------------------------

/** Adds the sample show, team, sponsors, suppliers and signage. The sample people's passwords are shown once, here. */
export async function addSample(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await superActor();
    if (me.is_demo) throw new UserError('The demo login can’t add sample data.');
    const sql = await db();
    let result: Awaited<ReturnType<typeof addSampleData>>;
    try {
      result = await addSampleData(sql, me);
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : 'The sample data couldn’t be added.');
    }
    const jar = await cookies();
    jar.set(EVENT_COOKIE, result.eventId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    refresh();
    return {
      ok: true,
      message: `${SAMPLE_SHOW} is ready with ${result.lines} lines. You’re now working in it. The sample team can sign in with these temporary passwords (shown only now; make a new invite from Team if you lose one).`,
      data: { people: result.people },
    };
  });
}

export async function removeSample(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await superActor();
    const sql = await db();
    const { removed } = await removeSampleData(sql, me);
    if (!removed) throw new UserError('There’s no sample data to remove.');
    const jar = await cookies();
    jar.delete(EVENT_COOKIE);
    refresh();
    return { ok: true, message: 'Sample data removed: the sample show and its lines, the sample people and the sample suppliers.' };
  });
}
