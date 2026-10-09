'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db, type Sql } from '@/lib/db';
import { bool, date, int, isUuid, num, required, run, str, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { actor } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity';
import { EVENT_COOKIE } from '@/lib/data/load';
import { DEFAULT_STAGES, suggestedDeadlines } from '@/lib/data/seed';

const refresh = () => revalidatePath('/', 'layout');
const LIST_KEYS = ['sign_type', 'item_type', 'distribution', 'material', 'position', 'zone', 'hall_nec', 'hall_excel', 'hall_other'];

async function userExists(id: string | null) {
  if (!id) return true;
  const sql = await db();
  return (await sql`select 1 from users where id = ${id}`).length > 0;
}

// ---- Event --------------------------------------------------------------------
export async function updateEvent(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const id = uuidOrNull(fd, 'event_id');
    if (!id) throw new UserError('Missing show. Reload the page.');
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
      art_due_si: date(fd, 'art_due_si', 'Sponsorship items artwork deadline'),
      print_due_si: date(fd, 'print_due_si', 'Sponsorship items order deadline'),
    };
    const venue = required(fd, 'venue', 'Venue', 80);
    const values = {
      name: required(fd, 'name', 'Show name', 120),
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
    await logActivity(sql, { eventId: id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: 'Updated the show details' });
    refresh();
    return { ok: true, message: suggest ? 'Suggested deadlines filled in and saved.' : 'Show details saved.' };
  });
}

export async function createEvent(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const name = required(fd, 'name', 'Show name', 120);
    const venue = required(fd, 'venue', 'Venue', 80);
    const buildStart = date(fd, 'build_start', 'Build-up start');
    const showOpen = date(fd, 'show_open', 'Opening day');
    const showClose = date(fd, 'show_close', 'Closing day');
    const breakdownEnd = date(fd, 'breakdown_end', 'Breakdown end');
    if (showOpen && showClose && showClose < showOpen) throw new UserError('The closing day must be on or after the opening day.');
    if (buildStart && showOpen && buildStart > showOpen) throw new UserError('Build-up must start on or before the opening day.');
    if (breakdownEnd && (showClose || showOpen) && breakdownEnd < (showClose ?? showOpen)!) throw new UserError('Breakdown must end on or after the closing day.');
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
        insert into events ${tx({ name, venue, build_start: buildStart, show_open: showOpen, show_close: showClose, breakdown_end: breakdownEnd, ...base, ...d } as never)} returning id`;
      if (copyFrom) {
        await tx`insert into stages (event_id, position, name, department_id, approver_id, uses_account_manager, applies_os, applies_ss, applies_si)
                 select ${ev.id}, position, name, department_id, approver_id, uses_account_manager, applies_os, applies_ss, applies_si
                 from stages where event_id = ${copyFrom} and not archived order by position`;
        // Carry over each stage's approvers, matching old and new stages by position.
        await tx`insert into stage_approvers (stage_id, user_id)
                 select ns.id, sa.user_id from stage_approvers sa
                   join stages os on os.id = sa.stage_id and os.event_id = ${copyFrom}
                   join stages ns on ns.event_id = ${ev.id} and ns.position = os.position
                 on conflict do nothing`;
        if (copySponsors) {
          await tx`insert into sponsors (event_id, name, package, account_manager_id, contact_name, contact_email, notes)
                   select ${ev.id}, name, package, account_manager_id, contact_name, contact_email, notes from sponsors where event_id = ${copyFrom}`;
        }
      }
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from stages where event_id = ${ev.id}`;
      if (n === 0) {
        const depts = await tx<{ id: string; name: string }[]>`select id, name from departments`;
        const deptId = (name: string | null) => (name ? depts.find((x) => x.name.toLowerCase() === name.toLowerCase())?.id ?? null : null);
        let pos = 1;
        for (const s of DEFAULT_STAGES) {
          await tx`insert into stages (event_id, position, name, department_id, uses_account_manager, applies_os, applies_ss, applies_si)
                   values (${ev.id}, ${pos++}, ${s.name}, ${deptId(s.department)}, ${s.uses_account_manager}, ${s.applies_os}, ${s.applies_ss}, ${s.applies_si})`;
        }
      }
      await tx`insert into event_departments (event_id, department_id)
               select distinct ${ev.id}::uuid, department_id from stages where event_id = ${ev.id} and department_id is not null
               on conflict do nothing`;
      return ev.id;
    });
    await logActivity(sql, { eventId: newId, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Created the show ${name}` });
    const jar = await cookies();
    jar.set(EVENT_COOKIE, newId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    refresh();
    // Straight on to the guided setup for the new show
    redirect(copyFrom ? '/shows/setup?created=1&copied=1' : '/shows/setup?created=1');
  });
}

// ---- Guided setup (Show › Set up) -------------------------------------------------

/** People who can sign off and own work: active, and not Users. */
async function teamCanSignOff(sql: Sql): Promise<Map<string, string>> {
  const rows = await sql<{ id: string; full_name: string }[]>`select id, full_name from users where active and role <> 'user'`;
  return new Map(rows.map((r) => [r.id, r.full_name]));
}

/** Every named-approver stage of a show at once: each stage's approvers are exactly the ones ticked. */
export async function saveShowApprovers(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing show. Reload the page.');
    const sql = await db();
    const eligible = await teamCanSignOff(sql);
    const stages = await sql<{ id: string; name: string }[]>`
      select id, name from stages where event_id = ${eventId} and not archived and not uses_account_manager order by position`;
    if (!stages.length) throw new UserError('This show has no stages with named approvers. Add them in Show setup › Sign-off stages.');
    const changed: string[] = [];
    await sql.begin(async (tx) => {
      for (const st of stages) {
        const want = [...new Set(fd.getAll(`approvers_${st.id}`).filter(isUuid))];
        if (want.some((id) => !eligible.has(id))) throw new UserError('Choose approvers from the team. Users and deactivated people can’t sign off.');
        const have = new Set((await tx<{ user_id: string }[]>`select user_id from stage_approvers where stage_id = ${st.id}`).map((r) => r.user_id));
        if (want.length === have.size && want.every((id) => have.has(id))) continue;
        await tx`delete from stage_approvers where stage_id = ${st.id}`;
        for (const uid of want) await tx`insert into stage_approvers (stage_id, user_id) values (${st.id}, ${uid}) on conflict do nothing`;
        // Keep the legacy single column pointing at an approver so older reads still see one.
        await tx`update stages set approver_id = ${want[0] ?? null} where id = ${st.id}`;
        changed.push(st.name);
      }
    });
    const [{ gaps }] = await sql<{ gaps: string[] }[]>`
      select coalesce(array_agg(s.name order by s.position), '{}') as gaps from stages s
      where s.event_id = ${eventId} and not s.archived and not s.uses_account_manager
        and not exists (select 1 from stage_approvers sa join users u on u.id = sa.user_id
                        where sa.stage_id = s.id and u.active and u.role <> 'user')`;
    if (changed.length) {
      await logActivity(sql, { eventId, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings',
        message: `Changed who approves ${changed.join(', ')}` });
    }
    refresh();
    const gapText = gaps.length ? ` ${gaps.join(', ')} still ${gaps.length === 1 ? 'has' : 'have'} no approver.` : '';
    return { ok: true, message: `${changed.length ? 'Saved.' : 'No changes to save.'}${gapText}` };
  });
}

/** Who looks after in-house artwork and who handles print and production for a show. */
export async function saveShowOwners(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing show. Reload the page.');
    const studio = uuidOrNull(fd, 'studio_owner_id');
    const prod = uuidOrNull(fd, 'production_owner_id');
    const sql = await db();
    const eligible = await teamCanSignOff(sql);
    if ((studio && !eligible.has(studio)) || (prod && !eligible.has(prod))) throw new UserError('Choose people from the team. Users can’t own work.');
    const [e] = await sql<{ name: string }[]>`
      update events set studio_owner_id = ${studio}, production_owner_id = ${prod} where id = ${eventId} returning name`;
    if (!e) throw new UserError('That show no longer exists. Reload the page.');
    await logActivity(sql, { eventId, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings',
      message: `Set who handles artwork (${studio ? eligible.get(studio) : 'nobody'}) and production (${prod ? eligible.get(prod) : 'nobody'})` });
    refresh();
    return { ok: true, message: 'Saved.' };
  });
}

export async function setEventArchived(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const id = uuidOrNull(fd, 'event_id');
    if (!id) throw new UserError('Missing show. Reload the page.');
    const archived = bool(fd, 'archived');
    const sql = await db();
    if (archived) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from events where not archived and id <> ${id}`;
      if (n === 0) throw new UserError('Keep at least one live show. Create the next one first.');
    }
    await sql`update events set archived = ${archived} where id = ${id}`;
    await logActivity(sql, { eventId: id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: archived ? 'Archived the show' : 'Restored the show' });
    refresh();
    return { ok: true, message: archived ? 'Show archived.' : 'Show restored.' };
  });
}

// ---- Stages -------------------------------------------------------------------
export async function saveStage(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const id = uuidOrNull(fd, 'stage_id');
    if (!id) throw new UserError('Missing stage.');
    const usesAm = bool(fd, 'uses_account_manager');
    const departmentId = usesAm ? null : uuidOrNull(fd, 'department_id');
    const approverIds = usesAm ? [] : [...new Set(fd.getAll('approver_ids').filter(isUuid))];
    const values = {
      name: required(fd, 'name', 'Stage name', 60),
      department_id: departmentId,
      approver_id: approverIds[0] ?? null, // keep the legacy single column pointing at the first
      uses_account_manager: usesAm,
      applies_os: bool(fd, 'applies_os'),
      applies_ss: bool(fd, 'applies_ss'),
      applies_si: bool(fd, 'applies_si'),
    };
    if (!values.applies_os && !values.applies_ss && !values.applies_si) throw new UserError('Tick at least one list this stage applies to, or remove the stage.');
    const sql = await db();
    if (departmentId && !(await sql`select 1 from departments where id = ${departmentId}`).length) throw new UserError('Choose a department from the list.');
    const [s] = await sql.begin(async (tx) => {
      const r = await tx<{ event_id: string }[]>`update stages set ${tx(values as never)} where id = ${id} returning event_id`;
      if (!r[0]) throw new UserError('That stage no longer exists.');
      await tx`delete from stage_approvers where stage_id = ${id}`;
      for (const uid of approverIds) await tx`insert into stage_approvers (stage_id, user_id) values (${id}, ${uid}) on conflict do nothing`;
      return r;
    });
    await logActivity(sql, { eventId: s.event_id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Updated sign-off stage ${values.name}` });
    refresh();
    return { ok: true, message: `${values.name} saved.` };
  });
}

export async function addStage(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing show. Reload the page.');
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
    await actor('manager');
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
    const me = await actor('manager');
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

// ---- Sections (the groups on the signage sheet) ---------------------------------------
async function sectionOf(sql: Sql, fd: FormData) {
  const id = uuidOrNull(fd, 'section_id');
  if (!id) throw new UserError('Missing section.');
  const [sec] = await sql<{ id: string; event_id: string; name: string }[]>`select id, event_id, name from sections where id = ${id}`;
  if (!sec) throw new UserError('That section no longer exists. Reload the page.');
  return sec;
}

export async function addSection(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing show. Reload the page.');
    const name = required(fd, 'name', 'Section name', 80);
    const sql = await db();
    if ((await sql`select 1 from sections where event_id = ${eventId} and lower(name) = lower(${name})`).length) throw new UserError(`${name} is already a section.`);
    const [{ p }] = await sql<{ p: number }[]>`select coalesce(max(position), 0)::int + 1 as p from sections where event_id = ${eventId}`;
    await sql`insert into sections (event_id, name, position) values (${eventId}, ${name}, ${p})`;
    await logActivity(sql, { eventId, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Added the section ${name}` });
    refresh();
    return { ok: true, message: `${name} added.` };
  });
}

export async function renameSection(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const sql = await db();
    const sec = await sectionOf(sql, fd);
    const name = required(fd, 'name', 'Section name', 80);
    if ((await sql`select 1 from sections where event_id = ${sec.event_id} and lower(name) = lower(${name}) and id <> ${sec.id}`).length) {
      throw new UserError(`${name} is already a section.`);
    }
    await sql`update sections set name = ${name} where id = ${sec.id}`;
    if (sec.name !== name) {
      await logActivity(sql, { eventId: sec.event_id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Renamed the section ${sec.name} to ${name}` });
    }
    refresh();
    return { ok: true, message: 'Saved.' };
  });
}

export async function moveSection(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('manager');
    const dir = fd.get('dir');
    if (dir !== 'up' && dir !== 'down') throw new UserError('Missing direction.');
    const sql = await db();
    const sec = await sectionOf(sql, fd);
    await sql.begin(async (tx) => {
      const list = await tx<{ id: string }[]>`select id from sections where event_id = ${sec.event_id} order by position, lower(name) for update`;
      const i = list.findIndex((x) => x.id === sec.id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      for (let k = 0; k < list.length; k++) await tx`update sections set position = ${k + 1} where id = ${list[k].id}`;
    });
    refresh();
    return { ok: true };
  });
}

/** Removes a section; its lines stay, under "No section". */
export async function removeSection(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const sql = await db();
    const sec = await sectionOf(sql, fd);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from items where section_id = ${sec.id}`;
    await sql`delete from sections where id = ${sec.id}`;
    await logActivity(sql, { eventId: sec.event_id, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings',
      message: `Removed the section ${sec.name}${n ? ` (${n} line${n === 1 ? '' : 's'} left without a section)` : ''}` });
    refresh();
    return { ok: true, message: n ? `${sec.name} removed. Its ${n} line${n === 1 ? ' is' : 's are'} now under “No section”.` : `${sec.name} removed.` };
  });
}

// ---- Suppliers ----------------------------------------------------------------
async function readSupplier(fd: FormData) {
  const email = str(fd, 'email', 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Enter a valid email address.');
  const scopeLink = str(fd, 'scope_link', 1000);
  if (scopeLink && !/^https?:\/\//i.test(scopeLink)) throw new UserError('The link to the scope of work must start with https://');
  const works = { works_on_os: bool(fd, 'works_on_os'), works_on_ss: bool(fd, 'works_on_ss'), works_on_si: bool(fd, 'works_on_si') };
  if (!works.works_on_os && !works.works_on_ss && !works.works_on_si) throw new UserError('Tick at least one list they work on.');
  return {
    name: required(fd, 'name', 'Supplier name', 120),
    contact_name: str(fd, 'contact_name', 120),
    email,
    phone: str(fd, 'phone', 40),
    scope_of_work: str(fd, 'scope_of_work', 4000),
    scope_link: scopeLink,
    ...works,
    notes: str(fd, 'notes', 1000),
  };
}

export async function saveSupplier(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const id = uuidOrNull(fd, 'supplier_id');
    const s = await readSupplier(fd);
    const sql = await db();
    const dup = await sql`select 1 from suppliers where lower(name) = lower(${s.name}) and id is distinct from ${id}`;
    if (dup.length) throw new UserError(`${s.name} is already on the list.`);
    let message: string;
    if (id) {
      const [before] = await sql<{ scope_of_work: string | null }[]>`select scope_of_work from suppliers where id = ${id}`;
      if (!before) throw new UserError('That supplier no longer exists. Reload the page.');
      await sql`update suppliers set ${sql(s as never)} where id = ${id}`;
      message = (before.scope_of_work ?? '') !== (s.scope_of_work ?? '') ? `Updated ${s.name}’s scope of work` : `Updated supplier ${s.name}`;
    } else {
      await sql`insert into suppliers ${sql(s as never)}`;
      message = `Added supplier ${s.name}${s.scope_of_work ? ' with a scope of work' : ''}`;
    }
    await logActivity(sql, { eventId: null, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message });
    refresh();
    return { ok: true, message: id ? 'Saved.' : `${s.name} added.` };
  });
}

export async function deleteSupplier(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const id = uuidOrNull(fd, 'supplier_id');
    if (!id) throw new UserError('Missing supplier.');
    const sql = await db();
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from items where supplier_id = ${id}`;
    if (n > 0) throw new UserError(`This supplier is on ${n} line${n === 1 ? '' : 's'}. Change those first.`);
    const [gone] = await sql<{ name: string }[]>`delete from suppliers where id = ${id} returning name`;
    if (gone) await logActivity(sql, { eventId: null, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Removed supplier ${gone.name}` });
    refresh();
    return { ok: true, message: 'Supplier removed.' };
  });
}

// ---- Lists --------------------------------------------------------------------
export async function saveList(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await actor('manager');
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

// ---- Platform (Admin › Platform) ---------------------------------------------
export async function setAppName(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('super_admin');
    const name = required(fd, 'app_name', 'Name', 40);
    const sql = await db();
    await sql`insert into app_settings (key, value) values ('app_name', ${name})
              on conflict (key) do update set value = excluded.value, updated_at = now()`;
    await logActivity(sql, { eventId: null, itemId: null, userId: me.id, actorName: me.full_name, kind: 'settings', message: `Renamed the platform to ${name}` });
    refresh();
    return { ok: true, message: 'Saved.' };
  });
}
