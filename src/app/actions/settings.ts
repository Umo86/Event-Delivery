'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { bool, date, int, num, required, run, str, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { actor } from '@/lib/auth/session';
import { hashPassword, tempPassword } from '@/lib/auth/password';
import { logActivity } from '@/lib/activity';
import { EVENT_COOKIE } from '@/lib/data/load';
import { DEFAULT_STAGES, suggestedDeadlines } from '@/lib/data/seed';
import type { Role } from '@/lib/domain/types';

const refresh = () => revalidatePath('/', 'layout');
const ROLES: Role[] = ['admin', 'member', 'viewer'];
const LIST_KEYS = ['sign_type', 'item_type', 'material', 'position', 'zone', 'hall_nec', 'hall_excel', 'hall_other'];

async function userExists(id: string | null) {
  if (!id) return true;
  const sql = await db();
  return (await sql`select 1 from users where id = ${id}`).length > 0;
}

// ---- Event --------------------------------------------------------------------
export async function updateEvent(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const id = uuidOrNull(fd, 'event_id');
    if (!id) throw new UserError('Missing event.');
    const studio = uuidOrNull(fd, 'studio_owner_id');
    const prod = uuidOrNull(fd, 'production_owner_id');
    if (!(await userExists(studio)) || !(await userExists(prod))) throw new UserError('Choose people from the team list.');
    const showOpen = date(fd, 'show_open', 'Opening day');
    const showClose = date(fd, 'show_close', 'Closing day');
    if (showOpen && showClose && showClose < showOpen) throw new UserError('The closing day must be on or after the opening day.');
    const suggest = fd.get('suggest') === '1';
    if (suggest && !showOpen) throw new UserError('Add the opening day first, then suggest deadlines.');
    const d = suggest ? suggestedDeadlines(showOpen) : {
      art_due_os: date(fd, 'art_due_os', 'Organiser signage artwork deadline'),
      print_due_os: date(fd, 'print_due_os', 'Organiser signage print deadline'),
      art_due_ss: date(fd, 'art_due_ss', 'Sponsor signage artwork deadline'),
      print_due_ss: date(fd, 'print_due_ss', 'Sponsor signage print deadline'),
      art_due_si: date(fd, 'art_due_si', 'Sponsor items artwork deadline'),
      print_due_si: date(fd, 'print_due_si', 'Sponsor items order deadline'),
    };
    const venue = required(fd, 'venue', 'Venue', 80);
    const values = {
      name: required(fd, 'name', 'Event name', 120),
      venue,
      build_start: date(fd, 'build_start', 'Build-up start'),
      show_open: showOpen,
      show_close: showClose,
      breakdown_end: date(fd, 'breakdown_end', 'Breakdown end'),
      budget: num(fd, 'budget', 'Budget'),
      warn_days: int(fd, 'warn_days', '“Due soon” warning', { min: 0, max: 365 }) ?? 7,
      turnaround_days: int(fd, 'turnaround_days', 'Sign-off target', { min: 0, max: 365 }) ?? 3,
      studio_owner_id: studio,
      production_owner_id: prod,
      ...d,
    };
    const sql = await db();
    await sql`update events set ${sql(values as never)} where id = ${id}`;
    await logActivity(sql, { eventId: id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: 'Updated event settings' });
    refresh();
    return { ok: true, message: suggest ? 'Suggested deadlines filled in and saved.' : 'Event settings saved.' };
  });
}

export async function createEvent(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const name = required(fd, 'name', 'Event name', 120);
    const venue = required(fd, 'venue', 'Venue', 80);
    const showOpen = date(fd, 'show_open', 'Opening day');
    const showClose = date(fd, 'show_close', 'Closing day');
    const copyFrom = uuidOrNull(fd, 'copy_from');
    const copySponsors = bool(fd, 'copy_sponsors');
    const sql = await db();
    const d = suggestedDeadlines(showOpen);
    const newId = await sql.begin(async (tx) => {
      let base: Record<string, unknown> = {};
      if (copyFrom) {
        const [src] = await tx<Record<string, unknown>[]>`select budget, warn_days, turnaround_days, studio_owner_id, production_owner_id from events where id = ${copyFrom}`;
        if (src) base = src;
      }
      const [ev] = await tx<{ id: string }[]>`
        insert into events ${tx({ name, venue, show_open: showOpen, show_close: showClose, ...base, ...d } as never)} returning id`;
      if (copyFrom) {
        await tx`insert into stages (event_id, position, name, approver_id, uses_account_manager, applies_os, applies_ss, applies_si)
                 select ${ev.id}, position, name, approver_id, uses_account_manager, applies_os, applies_ss, applies_si
                 from stages where event_id = ${copyFrom} and not archived order by position`;
        if (copySponsors) {
          await tx`insert into sponsors (event_id, name, package, account_manager_id, contact_name, contact_email, notes)
                   select ${ev.id}, name, package, account_manager_id, contact_name, contact_email, notes from sponsors where event_id = ${copyFrom}`;
        }
      }
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from stages where event_id = ${ev.id}`;
      if (n === 0) {
        let pos = 1;
        for (const s of DEFAULT_STAGES) {
          await tx`insert into stages (event_id, position, name, uses_account_manager, applies_os, applies_ss, applies_si)
                   values (${ev.id}, ${pos++}, ${s.name}, ${s.uses_account_manager}, ${s.applies_os}, ${s.applies_ss}, ${s.applies_si})`;
        }
      }
      return ev.id;
    });
    await logActivity(sql, { eventId: newId, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Created event ${name}` });
    const jar = await cookies();
    jar.set(EVENT_COOKIE, newId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    refresh();
    redirect('/settings?created=1');
  });
}

export async function setEventArchived(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const id = uuidOrNull(fd, 'event_id');
    if (!id) throw new UserError('Missing event.');
    const archived = bool(fd, 'archived');
    const sql = await db();
    if (archived) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from events where not archived and id <> ${id}`;
      if (n === 0) throw new UserError('Keep at least one active event. Create the next one first.');
    }
    await sql`update events set archived = ${archived} where id = ${id}`;
    await logActivity(sql, { eventId: id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: archived ? 'Archived the event' : 'Restored the event' });
    refresh();
    return { ok: true, message: archived ? 'Event archived.' : 'Event restored.' };
  });
}

// ---- Stages -------------------------------------------------------------------
export async function saveStage(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const id = uuidOrNull(fd, 'stage_id');
    if (!id) throw new UserError('Missing stage.');
    const approver = uuidOrNull(fd, 'approver_id');
    if (!(await userExists(approver))) throw new UserError('Choose an approver from the team.');
    const values = {
      name: required(fd, 'name', 'Stage name', 60),
      approver_id: approver,
      uses_account_manager: bool(fd, 'uses_account_manager'),
      applies_os: bool(fd, 'applies_os'),
      applies_ss: bool(fd, 'applies_ss'),
      applies_si: bool(fd, 'applies_si'),
    };
    if (!values.applies_os && !values.applies_ss && !values.applies_si) throw new UserError('Tick at least one list this stage applies to, or remove the stage.');
    const sql = await db();
    const [s] = await sql<{ event_id: string }[]>`update stages set ${sql(values as never)} where id = ${id} returning event_id`;
    if (!s) throw new UserError('That stage no longer exists.');
    await logActivity(sql, { eventId: s.event_id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Updated sign-off stage ${values.name}` });
    refresh();
    return { ok: true, message: `${values.name} saved.` };
  });
}

export async function addStage(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing event.');
    const name = required(fd, 'name', 'Stage name', 60);
    const sql = await db();
    const [{ p }] = await sql<{ p: number }[]>`select coalesce(max(position), 0)::int + 1 as p from stages where event_id = ${eventId} and not archived`;
    await sql`insert into stages (event_id, position, name) values (${eventId}, ${p}, ${name})`;
    await logActivity(sql, { eventId, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Added sign-off stage ${name}` });
    refresh();
    return { ok: true, message: `${name} added at the end. Choose its approver.` };
  });
}

export async function moveStage(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('admin');
    const id = uuidOrNull(fd, 'stage_id');
    const dir = str(fd, 'dir', 4);
    if (!id || (dir !== 'up' && dir !== 'down')) throw new UserError('Missing stage.');
    const sql = await db();
    await sql.begin(async (tx) => {
      const [s] = await tx<{ event_id: string }[]>`select event_id from stages where id = ${id}`;
      if (!s) throw new UserError('That stage no longer exists.');
      const list = await tx<{ id: string }[]>`select id from stages where event_id = ${s.event_id} and not archived order by position, created_at`;
      const i = list.findIndex((x) => x.id === id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      for (let k = 0; k < list.length; k++) await tx`update stages set position = ${k + 1} where id = ${list[k].id}`;
    });
    refresh();
    return { ok: true };
  });
}

export async function removeStage(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const id = uuidOrNull(fd, 'stage_id');
    if (!id) throw new UserError('Missing stage.');
    const sql = await db();
    const [s] = await sql<{ event_id: string; name: string }[]>`select event_id, name from stages where id = ${id}`;
    if (!s) throw new UserError('That stage no longer exists.');
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from stages where event_id = ${s.event_id} and not archived`;
    if (n <= 1) throw new UserError('Keep at least one sign-off stage.');
    await sql`update stages set archived = true where id = ${id}`;
    await logActivity(sql, { eventId: s.event_id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Removed sign-off stage ${s.name}` });
    refresh();
    return { ok: true, message: `${s.name} removed. Its past decisions stay in each line’s history.` };
  });
}

// ---- Team ---------------------------------------------------------------------
export async function createUser(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('admin');
    const name = required(fd, 'full_name', 'Name', 120);
    const email = required(fd, 'email', 'Email', 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Enter a valid email address.');
    const role = (str(fd, 'role', 10) ?? 'member') as Role;
    if (!ROLES.includes(role)) throw new UserError('Choose a role.');
    const sql = await db();
    if ((await sql`select 1 from users where lower(email) = ${email}`).length) throw new UserError(`${email} already has an account.`);
    const pw = tempPassword();
    await sql`insert into users (email, full_name, job_title, role, password_hash, must_change_password)
              values (${email}, ${name}, ${str(fd, 'job_title', 120)}, ${role}, ${await hashPassword(pw)}, true)`;
    refresh();
    return { ok: true, message: `Account created for ${name}. Their temporary password is ${pw}. They’ll choose their own when they first sign in.`, data: { password: pw } };
  });
}

export async function updateUser(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const id = uuidOrNull(fd, 'user_id');
    if (!id) throw new UserError('Missing person.');
    const role = (str(fd, 'role', 10) ?? 'member') as Role;
    if (!ROLES.includes(role)) throw new UserError('Choose a role.');
    const active = bool(fd, 'active');
    const email = required(fd, 'email', 'Email', 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Enter a valid email address.');
    const sql = await db();
    if (id === me.id && (role !== 'admin' || !active)) throw new UserError('You can’t remove your own admin access. Ask another admin.');
    if (role !== 'admin' || !active) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users where role = 'admin' and active and id <> ${id}`;
      if (n === 0) throw new UserError('There must always be at least one active admin.');
    }
    if ((await sql`select 1 from users where lower(email) = ${email} and id <> ${id}`).length) throw new UserError(`${email} is used by another account.`);
    await sql`update users set full_name = ${required(fd, 'full_name', 'Name', 120)}, job_title = ${str(fd, 'job_title', 120)},
              email = ${email}, role = ${role}, active = ${active} where id = ${id}`;
    if (!active) await sql`delete from sessions where user_id = ${id}`;
    refresh();
    return { ok: true, message: 'Saved.' };
  });
}

export async function resetPassword(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('admin');
    const id = uuidOrNull(fd, 'user_id');
    if (!id) throw new UserError('Missing person.');
    const pw = tempPassword();
    const sql = await db();
    const [u] = await sql<{ full_name: string }[]>`
      update users set password_hash = ${await hashPassword(pw)}, must_change_password = true, failed_logins = 0, locked_until = null
      where id = ${id} returning full_name`;
    if (!u) throw new UserError('That person no longer exists.');
    await sql`delete from sessions where user_id = ${id}`;
    return { ok: true, message: `New temporary password for ${u.full_name}: ${pw}`, data: { password: pw } };
  });
}

// ---- Suppliers ----------------------------------------------------------------
async function readSupplier(fd: FormData) {
  const email = str(fd, 'email', 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Enter a valid email address.');
  return { name: required(fd, 'name', 'Supplier name', 120), contact_name: str(fd, 'contact_name', 120), email, phone: str(fd, 'phone', 40), notes: str(fd, 'notes', 1000) };
}

export async function saveSupplier(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('member');
    const id = uuidOrNull(fd, 'supplier_id');
    const s = await readSupplier(fd);
    const sql = await db();
    const dup = await sql`select 1 from suppliers where lower(name) = lower(${s.name}) and id is distinct from ${id}`;
    if (dup.length) throw new UserError(`${s.name} is already on the list.`);
    if (id) await sql`update suppliers set ${sql(s as never)} where id = ${id}`;
    else await sql`insert into suppliers ${sql(s as never)}`;
    refresh();
    return { ok: true, message: id ? 'Saved.' : `${s.name} added.` };
  });
}

export async function deleteSupplier(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('admin');
    const id = uuidOrNull(fd, 'supplier_id');
    if (!id) throw new UserError('Missing supplier.');
    const sql = await db();
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from items where supplier_id = ${id}`;
    if (n > 0) throw new UserError(`This supplier is on ${n} line${n === 1 ? '' : 's'}. Change those first.`);
    await sql`delete from suppliers where id = ${id}`;
    refresh();
    return { ok: true, message: 'Supplier removed.' };
  });
}

// ---- Lists --------------------------------------------------------------------
export async function saveList(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('member');
    const key = str(fd, 'list_key', 30);
    if (!key || !LIST_KEYS.includes(key)) throw new UserError('Unknown list.');
    const raw = String(fd.get('values') ?? '');
    const seen = new Set<string>();
    const values = raw.split('\n').map((v) => v.trim()).filter((v) => {
      if (!v || v.length > 120 || seen.has(v.toLowerCase())) return false;
      seen.add(v.toLowerCase());
      return true;
    }).slice(0, 300);
    const sql = await db();
    await sql.begin(async (tx) => {
      await tx`delete from list_options where list_key = ${key}`;
      for (let i = 0; i < values.length; i++) await tx`insert into list_options (list_key, value, sort) values (${key}, ${values[i]}, ${i})`;
    });
    refresh();
    return { ok: true, message: `Saved ${values.length} option${values.length === 1 ? '' : 's'}.` };
  });
}

// ---- System -------------------------------------------------------------------
export async function setAppName(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('admin');
    const name = required(fd, 'app_name', 'Name', 40);
    const sql = await db();
    await sql`insert into app_settings (key, value) values ('app_name', ${name})
              on conflict (key) do update set value = excluded.value, updated_at = now()`;
    refresh();
    return { ok: true, message: 'Saved.' };
  });
}
