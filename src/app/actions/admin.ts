'use server';

import { revalidatePath } from 'next/cache';
import type postgres from 'postgres';
import { db, type Sql } from '@/lib/db';
import { bool, isUuid, required, run, str, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { actor, type CurrentUser } from '@/lib/auth/session';
import { hashPassword, tempPassword } from '@/lib/auth/password';
import { logActivity } from '@/lib/activity';
import { getAppName } from '@/lib/data/load';
import { ACCESS_LEVELS, accessLevel, personStatus, TEMP_PASSWORD_DAYS } from '@/lib/domain/access';
import type { Role } from '@/lib/domain/types';
import { firstName, inviteMessage, teamNote, type InviteKind } from '@/lib/invite-message';
import { SETTING, writeSetting } from '@/lib/settings';
import { listText } from '@/lib/text';
import { appOrigin } from '@/lib/url';

// People: invitations, access levels and sign-off responsibilities (Admin › People and Show › Team), plus the
// sponsor links switch on Admin › Platform. Managers can add people as Managers or Users, handle invites nobody
// has used yet, and choose departments and approvers; everything else here is for super admins.
// Every change is written to the access log. The platform doesn't send email: an invite or reset gives the admin
// a ready-made message with the temporary password to send from their own mailbox.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const refresh = () => revalidatePath('/', 'layout');

interface Person {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  last_login_at: Date | null;
  temp_password_expires_at: Date | null;
  is_demo: boolean;
  is_super_admin: boolean;
}

async function audit(sql: Sql, me: CurrentUser, message: string, eventId: string | null = null) {
  await logActivity(sql, { eventId, itemId: null, userId: me.id, actorName: me.full_name, kind: 'access', message });
}

function readRole(fd: FormData): Role {
  const r = str(fd, 'role', 20);
  const lvl = ACCESS_LEVELS.find((a) => a.key === r);
  if (!lvl) throw new UserError('Choose an access level.');
  return lvl.key;
}

function readEmail(fd: FormData): string {
  const email = required(fd, 'email', 'Email', 200).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new UserError('Enter a valid email address.');
  return email;
}

async function findPerson(sql: Sql, fd: FormData): Promise<Person> {
  const id = uuidOrNull(fd, 'user_id');
  if (!id) throw new UserError('Missing person.');
  const [p] = await sql<Person[]>`
    select id, email, full_name, role, active, must_change_password, last_login_at, temp_password_expires_at, is_demo, (role = 'super_admin') as is_super_admin
    from users where id = ${id}`;
  if (!p) throw new UserError('That person no longer exists. Reload the page.');
  return p;
}

/** Super admins can only be changed by other super admins (never by the demo login), so nobody can be locked out by an admin. */
function guardSuperAdmin(me: CurrentUser, p: Person) {
  if (!p.is_super_admin || p.id === me.id) return;
  if (!me.is_super_admin) throw new UserError('Only a super admin can change a super admin.');
  if (me.is_demo) throw new UserError('The demo login can’t change a super admin.');
}

/**
 * Who can add people and change their access: super admins, and managers for Managers and Users.
 * Never the shared demo login, which anyone with the link can use.
 */
async function teamActor(): Promise<CurrentUser> {
  const me = await actor('manager');
  if (me.is_demo) throw new UserError('The demo login can’t add people or change their access. Sign in with your own account.');
  return me;
}

async function otherActiveSuperAdmins(sql: Sql, id: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users where role = 'super_admin' and active and id <> ${id}`;
  return n;
}

/** The stages and sponsors (in events that aren't archived) that wait on this person. */
async function responsibilitiesOf(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ label: string }[]>`
    select s.name || ' stage' as label from stage_approvers sa
      join stages s on s.id = sa.stage_id join events e on e.id = s.event_id
      where sa.user_id = ${userId} and not s.archived and not s.uses_account_manager and not e.archived
    union all
    select sp.name as label from sponsors sp join events e on e.id = sp.event_id
      where sp.account_manager_id = ${userId} and not e.archived`;
  return [...new Set(rows.map((r) => r.label))];
}

/** What would be left with nobody to sign off without this person: stages only they approve, and sponsors they manage. */
async function soleResponsibilitiesOf(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ label: string }[]>`
    select s.name || ' stage' as label from stage_approvers sa
      join stages s on s.id = sa.stage_id join events e on e.id = s.event_id
      where sa.user_id = ${userId} and not s.archived and not s.uses_account_manager and not e.archived
        and not exists (select 1 from stage_approvers o where o.stage_id = sa.stage_id and o.user_id <> ${userId})
    union all
    select sp.name as label from sponsors sp join events e on e.id = sp.event_id
      where sp.account_manager_id = ${userId} and not e.archived`;
  return [...new Set(rows.map((r) => r.label))];
}

async function newTempPassword() {
  const password = tempPassword();
  return { password, hash: await hashPassword(password), expiresAt: new Date(Date.now() + TEMP_PASSWORD_DAYS * 86400000) };
}

/** For an invite: the departments someone is in and the stages they sign off, in shows that aren't archived. */
async function teamNoteFor(sql: Sql, userId: string): Promise<string> {
  const [depts, approvals] = await Promise.all([
    sql<{ name: string }[]>`
      select d.name from user_departments ud join departments d on d.id = ud.department_id
      where ud.user_id = ${userId} and not d.archived order by d.position, lower(d.name)`,
    sql<{ show: string; stage: string }[]>`
      select e.name as show, s.name as stage from stage_approvers sa
        join stages s on s.id = sa.stage_id join events e on e.id = s.event_id
      where sa.user_id = ${userId} and not s.archived and not s.uses_account_manager and not e.archived
      order by e.show_open nulls last, lower(e.name), s.position`,
  ]);
  return teamNote(depts.map((d) => d.name), approvals);
}

/** The message the admin sends, with the temporary password. The password is only ever shown this once. */
async function messageFor(sql: Sql, me: CurrentUser, p: Pick<Person, 'id' | 'email' | 'full_name' | 'role'>, kind: InviteKind, password: string, expiresAt: Date) {
  const lvl = accessLevel(p.role);
  const msg = inviteMessage({
    kind, appName: await getAppName(), name: p.full_name, email: p.email, tempPassword: password, senderName: me.full_name,
    roleLabel: lvl.label, roleHelp: lvl.email, signInUrl: `${await appOrigin()}/login`, expiresAt,
    teamNote: kind === 'invite' ? await teamNoteFor(sql, p.id) : undefined,
  });
  return { invite: { ...msg, name: p.full_name } };
}

type Tx = postgres.TransactionSql<Record<string, never>>;

/**
 * Makes someone an approver for exactly the stages in `want` (in one show), leaving other approvers in place.
 * `cantAdd` is the reason they can't take on a stage (for example, they're a User); removing still works.
 */
async function applyApprovals(tx: Tx, eventId: string, userId: string, want: Set<string>, cantAdd: string | null) {
  const stages = await tx<{ id: string; name: string }[]>`
    select id, name from stages where event_id = ${eventId} and not archived and not uses_account_manager order by position`;
  const mine = new Set((await tx<{ stage_id: string }[]>`
    select sa.stage_id from stage_approvers sa join stages s on s.id = sa.stage_id
    where sa.user_id = ${userId} and s.event_id = ${eventId}`).map((r) => r.stage_id));
  const added: string[] = [];
  const removed: string[] = [];
  for (const s of stages) {
    const has = mine.has(s.id);
    if (want.has(s.id) && !has) {
      if (cantAdd) throw new UserError(cantAdd);
      await tx`insert into stage_approvers (stage_id, user_id) values (${s.id}, ${userId}) on conflict do nothing`;
      // Keep the legacy single column pointing at an approver so older reads still see one.
      await tx`update stages set approver_id = coalesce(approver_id, ${userId}) where id = ${s.id}`;
      added.push(s.name);
    } else if (!want.has(s.id) && has) {
      await tx`delete from stage_approvers where stage_id = ${s.id} and user_id = ${userId}`;
      await tx`update stages set approver_id = (select user_id from stage_approvers where stage_id = ${s.id} limit 1) where id = ${s.id}`;
      removed.push(s.name);
    }
  }
  return { added, removed };
}

const USERS_CANT_SIGN_OFF = 'Users can’t sign off. Give them Manager access first.';

// ---- Invitations --------------------------------------------------------------------

/**
 * Adds someone to the platform (Admin › People or Show › Team): their account, departments and the stages they
 * approve in the current show, plus the invite email to send them. Managers can add Managers and Users.
 */
export async function invitePerson(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await teamActor();
    const name = required(fd, 'full_name', 'Name', 120);
    const email = readEmail(fd);
    const role = readRole(fd);
    if (role === 'super_admin' && !me.is_super_admin) throw new UserError('Only a super admin can add a Super Admin.');
    const title = str(fd, 'job_title', 120);
    const wantDepts = new Set(fd.getAll('department_ids').filter(isUuid));
    const wantStages = new Set(fd.getAll('stage_ids').filter(isUuid));
    const eventId = uuidOrNull(fd, 'event_id');
    if (wantStages.size && role === 'user') throw new UserError('Users can’t sign off. Choose Manager to make them an approver.');
    if (wantStages.size && !eventId) throw new UserError('Missing show. Reload the page.');
    const sql = await db();
    const [existing] = await sql<{ active: boolean }[]>`select active from users where lower(email) = ${email}`;
    if (existing) {
      throw new UserError(existing.active
        ? `${email} already has an account.`
        : `${email} has a deactivated account. ${me.is_super_admin ? 'Reactivate it from the people list instead.' : 'Ask a super admin to reactivate it.'}`);
    }
    const { password, hash, expiresAt } = await newTempPassword();
    const { p, depts, approves, show } = await sql.begin(async (tx) => {
      const [p] = await tx<Person[]>`
        insert into users (email, full_name, job_title, role, password_hash, must_change_password, temp_password_expires_at, invited_by, invited_at)
        values (${email}, ${name}, ${title}, ${role}, ${hash}, true, ${expiresAt}, ${me.id}, now())
        returning id, email, full_name, role, active, must_change_password, last_login_at, temp_password_expires_at, is_demo, (role = 'super_admin') as is_super_admin`;
      const depts = (await tx<{ id: string; name: string }[]>`
        select id, name from departments where not archived order by position, lower(name)`).filter((d) => wantDepts.has(d.id));
      for (const d of depts) await tx`insert into user_departments (user_id, department_id) values (${p.id}, ${d.id}) on conflict do nothing`;
      let approves: string[] = [];
      let show: string | null = null;
      if (eventId && wantStages.size) {
        const [e] = await tx<{ name: string }[]>`select name from events where id = ${eventId}`;
        if (!e) throw new UserError('That show no longer exists. Reload the page.');
        show = e.name;
        approves = (await applyApprovals(tx, eventId, p.id, wantStages, null)).added;
      }
      return { p, depts: depts.map((d) => d.name), approves, show };
    });
    const team = [
      depts.length ? `in ${listText(depts)}` : null,
      approves.length ? `approving ${listText(approves)} in ${show}` : null,
    ].filter(Boolean);
    await audit(sql, me, `Invited ${name} (${email}) as ${accessLevel(role).label}${team.length ? `, ${team.join(', ')}` : ''}`, approves.length ? eventId : null);
    refresh();
    const first = firstName(name);
    const saved = [
      depts.length ? `${first} is in ${listText(depts)}` : null,
      approves.length ? `${depts.length ? 'approves' : `${first} approves`} ${listText(approves)} in ${show}` : null,
    ].filter(Boolean);
    return {
      ok: true,
      message: `${name}’s account is ready. Now send them the invite below from your own email.${saved.length ? `\n${saved.join(' and ')}.` : ''}`,
      data: await messageFor(sql, me, p, 'invite', password, expiresAt),
    };
  });
}

/**
 * A new invite for someone who hasn't signed in yet, or a password reset for someone who has.
 * Managers can only make new invites (for Managers and Users); resets are for super admins.
 */
export async function sendNewPassword(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await teamActor();
    const sql = await db();
    const p = await findPerson(sql, fd);
    if (p.id === me.id) throw new UserError('Change your own password on the Your account page.');
    if (p.is_demo) throw new UserError('The demo login’s password comes from the deployment settings and is shown on the sign-in page.');
    guardSuperAdmin(me, p);
    if (p.last_login_at && !me.is_super_admin) throw new UserError(`${p.full_name} has already signed in, so only a super admin can reset their password.`);
    if (!p.active) throw new UserError(`Reactivate ${p.full_name} first.`);
    const kind: InviteKind = p.last_login_at ? 'reset' : 'invite';
    const { password, hash, expiresAt } = await newTempPassword();
    await sql`update users set password_hash = ${hash}, must_change_password = true, temp_password_expires_at = ${expiresAt},
                failed_logins = 0, locked_until = null where id = ${p.id}`;
    await sql`delete from sessions where user_id = ${p.id}`;
    await audit(sql, me, `${kind === 'invite' ? 'Made a new invite for' : 'Reset the password for'} ${p.full_name}`);
    refresh();
    return {
      ok: true,
      message: kind === 'invite'
        ? `New invite for ${p.full_name}. The old temporary password no longer works. Send them the new invite below.`
        : `${p.full_name}’s password has been reset and they’ve been signed out. Send them the new temporary password below.`,
      data: await messageFor(sql, me, p, kind, password, expiresAt),
    };
  });
}

/** Removes an account nobody has signed in to yet. Managers can cancel invites for Managers and Users. */
export async function cancelInvite(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await teamActor();
    const sql = await db();
    const p = await findPerson(sql, fd);
    if (p.is_demo) throw new UserError('Deactivate the demo login instead. That also takes it off the sign-in page.');
    guardSuperAdmin(me, p);
    if (p.last_login_at) {
      throw new UserError(`${p.full_name} has already signed in, so ${me.is_super_admin ? 'deactivate their account instead' : 'a super admin needs to deactivate their account instead'}.`);
    }
    const held = await soleResponsibilitiesOf(sql, p.id);
    const gone = await sql`delete from users where id = ${p.id} and last_login_at is null returning id`;
    if (!gone.length) throw new UserError(`${p.full_name} has just signed in, so deactivate their account instead.`);
    await audit(sql, me, `Cancelled the invite for ${p.full_name} (${p.email})`);
    refresh();
    return {
      ok: true,
      message: `Invite for ${p.full_name} cancelled.${held.length ? ` ${listText(held)} now ${held.length === 1 ? 'needs' : 'need'} someone else to sign off.` : ''}`,
    };
  });
}

// ---- People -----------------------------------------------------------------------------

/** Super admins can give any access level. Managers can switch other people between Manager and User. */
export async function changeAccess(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await teamActor();
    const sql = await db();
    const p = await findPerson(sql, fd);
    const role = readRole(fd);
    if (p.id === me.id) throw new UserError(`You can’t change your own access level. Ask ${me.is_super_admin ? 'another' : 'a'} super admin.`);
    if (p.is_demo && role === 'super_admin') throw new UserError('The demo login can’t be a Super Admin, because anyone can use it.');
    if (role === 'super_admin' && !me.is_super_admin) throw new UserError('Only a super admin can make someone a Super Admin.');
    if (p.is_demo && !me.is_super_admin) throw new UserError('Only a super admin can change the demo login’s access.');
    guardSuperAdmin(me, p);
    if (p.role === role) return { ok: true, message: `${p.full_name} is already a ${accessLevel(role).label}.` };
    if (p.role === 'super_admin' && p.active && (await otherActiveSuperAdmins(sql, p.id)) === 0) {
      throw new UserError('There must always be at least one active Super Admin.');
    }
    await sql`update users set role = ${role} where id = ${p.id}`;
    await audit(sql, me, `Changed ${p.full_name} from ${accessLevel(p.role).label} to ${accessLevel(role).label}`);
    let note = '';
    if (role === 'user') {
      const held = await responsibilitiesOf(sql, p.id);
      if (held.length) note = ` They still look after ${listText(held)}, but users can’t sign off, so choose someone else.`;
    }
    refresh();
    return { ok: true, message: `${p.full_name} is now a ${accessLevel(role).label}.${note}` };
  });
}

export async function updatePersonDetails(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('super_admin');
    const sql = await db();
    const p = await findPerson(sql, fd);
    const name = required(fd, 'full_name', 'Name', 120);
    const email = readEmail(fd);
    const title = str(fd, 'job_title', 120);
    if (p.is_demo && email !== p.email.toLowerCase()) throw new UserError('The demo login’s email comes from the deployment settings.');
    guardSuperAdmin(me, p);
    if ((await sql`select 1 from users where lower(email) = ${email} and id <> ${p.id}`).length) {
      throw new UserError(`${email} is used by another account.`);
    }
    await sql`update users set full_name = ${name}, email = ${email}, job_title = ${title} where id = ${p.id}`;
    await audit(sql, me, email !== p.email.toLowerCase()
      ? `Changed ${name}’s sign-in email from ${p.email} to ${email}`
      : `Updated ${name}’s details`);
    refresh();
    return { ok: true, message: 'Saved.' };
  });
}

export async function setPersonActive(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('super_admin');
    const sql = await db();
    const p = await findPerson(sql, fd);
    const active = bool(fd, 'active');
    if (p.active === active) return { ok: true };
    guardSuperAdmin(me, p);
    if (!active) {
      if (p.id === me.id) throw new UserError('You can’t deactivate your own account. Ask another super admin.');
      if (p.role === 'super_admin' && (await otherActiveSuperAdmins(sql, p.id)) === 0) throw new UserError('There must always be at least one active Super Admin.');
    }
    await sql`update users set active = ${active} where id = ${p.id}`;
    if (!active) await sql`delete from sessions where user_id = ${p.id}`;
    await audit(sql, me, `${active ? 'Reactivated' : 'Deactivated'} ${p.full_name}`);
    refresh();
    if (p.is_demo) {
      return { ok: true, message: active ? 'The demo login is back on the sign-in page.' : 'The demo login is off the sign-in page and no longer works.' };
    }
    if (!active) {
      const held = await responsibilitiesOf(sql, p.id);
      return {
        ok: true,
        message: `${p.full_name} can no longer sign in and has been signed out.${held.length ? ` They still look after ${listText(held)}: choose someone else.` : ''}`,
      };
    }
    const status = personStatus({ ...p, active: true });
    const expired = status === 'invite_expired' || status === 'temp_expired';
    return { ok: true, message: `${p.full_name} can sign in again.${expired ? ' Their temporary password has expired, so send a new one.' : ''}` };
  });
}

// ---- Sign-off responsibilities -----------------------------------------------------

export async function saveSignoffDuties(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('super_admin');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing show. Reload the page.');
    const sql = await db();
    const p = await findPerson(sql, fd);
    if (!p.active) throw new UserError(`Reactivate ${p.full_name} first.`);
    if (p.role === 'user') throw new UserError('Users can’t sign off. Change their access level to Manager first.');
    const wantStages = new Set(fd.getAll('stage_ids').filter(isUuid));
    const wantSponsors = new Set(fd.getAll('sponsor_ids').filter(isUuid));
    const changes = await sql.begin(async (tx) => {
      const { added, removed } = await applyApprovals(tx, eventId, p.id, wantStages, null);
      const out = [...added.map((n) => `approver for ${n}`), ...removed.map((n) => `no longer approver for ${n}`)];
      const sponsors = await tx<{ id: string; name: string; account_manager_id: string | null }[]>`
        select id, name, account_manager_id from sponsors where event_id = ${eventId} order by lower(name) for update`;
      for (const s of sponsors) {
        const has = s.account_manager_id === p.id;
        if (wantSponsors.has(s.id) && !has) {
          await tx`update sponsors set account_manager_id = ${p.id} where id = ${s.id}`;
          out.push(`account manager for ${s.name}`);
        } else if (!wantSponsors.has(s.id) && has) {
          await tx`update sponsors set account_manager_id = null where id = ${s.id}`;
          out.push(`no longer account manager for ${s.name}`);
        }
      }
      return out;
    });
    if (!changes.length) return { ok: true, message: 'No changes to save.' };
    await audit(sql, me, `Made ${p.full_name} ${listText(changes)}`, eventId);
    refresh();
    return { ok: true, message: `Saved. ${firstName(p.full_name)} is now ${listText(changes)}.` };
  });
}

/**
 * Which stages someone approves in a show (Show › Team). Managers can do this, as they can on Show setup › Sign-off
 * stages. Users and deactivated people can be taken off stages but not given new ones.
 */
export async function saveApprovals(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('manager');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing show. Reload the page.');
    const sql = await db();
    const p = await findPerson(sql, fd);
    const [show] = await sql<{ name: string }[]>`select name from events where id = ${eventId}`;
    if (!show) throw new UserError('That show no longer exists. Reload the page.');
    const want = new Set(fd.getAll('stage_ids').filter(isUuid));
    const cantAdd = !p.active ? `${p.full_name} is deactivated, so they can’t sign off.` : p.role === 'user' ? USERS_CANT_SIGN_OFF : null;
    const { added, removed } = await sql.begin((tx) => applyApprovals(tx, eventId, p.id, want, cantAdd));
    if (!added.length && !removed.length) return { ok: true, message: 'No changes to save.' };
    const said = [
      added.length ? `now approves ${listText(added)}` : null,
      removed.length ? `no longer approves ${listText(removed)}` : null,
    ].filter(Boolean).join(' and ');
    await audit(sql, me, `${p.full_name} ${said} in ${show.name}`, eventId);
    refresh();
    return { ok: true, message: `Saved. ${firstName(p.full_name)} ${said}.` };
  });
}

// ---- Platform switches ---------------------------------------------------------------

export async function setSponsorLinks(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('super_admin');
    const on = bool(fd, 'enabled');
    const sql = await db();
    await writeSetting(sql, SETTING.sponsorLinks, on ? 'on' : 'off');
    await audit(sql, me, `Turned sponsor approval links ${on ? 'on' : 'off'}`);
    refresh();
    return {
      ok: true,
      message: on
        ? 'Sponsor approval links are on. Links that haven’t expired work again.'
        : 'Sponsor approval links are off. Every existing link has stopped working.',
    };
  });
}
