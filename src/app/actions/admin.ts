'use server';

import { revalidatePath } from 'next/cache';
import { db, type Sql } from '@/lib/db';
import { bool, isUuid, required, run, str, UserError, uuidOrNull, type ActionResult } from '@/lib/action';
import { actor, type CurrentUser } from '@/lib/auth/session';
import { hashPassword, tempPassword } from '@/lib/auth/password';
import { logActivity } from '@/lib/activity';
import { getAppName } from '@/lib/data/load';
import { ACCESS_LEVELS, accessLevel, personStatus, TEMP_PASSWORD_DAYS } from '@/lib/domain/access';
import type { Role } from '@/lib/domain/types';
import { accessEmail, escapeHtml, firstName, type AccessEmailKind } from '@/lib/email/message';
import { sendEmail } from '@/lib/email/send';
import { SETTING, writeSetting } from '@/lib/settings';
import { appOrigin } from '@/lib/url';

// Everything on the Admin page: invitations, access levels, sign-off responsibilities and platform switches.
// Every change is written to the access log.

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
}

async function audit(sql: Sql, me: CurrentUser, message: string, eventId: string | null = null) {
  await logActivity(sql, { eventId, itemId: null, userId: me.id, actorName: me.full_name, kind: 'access', message });
}

function readRole(fd: FormData): Role {
  const r = str(fd, 'role', 10);
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
    select id, email, full_name, role, active, must_change_password, last_login_at, temp_password_expires_at from users where id = ${id}`;
  if (!p) throw new UserError('That person no longer exists. Reload the page.');
  return p;
}

async function otherActiveAdmins(sql: Sql, id: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users where role = 'admin' and active and id <> ${id}`;
  return n;
}

/** The stages and sponsors (in events that aren't archived) that wait on this person. */
async function responsibilitiesOf(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ label: string }[]>`
    select s.name || ' stage' as label from stages s join events e on e.id = s.event_id
      where s.approver_id = ${userId} and not s.archived and not s.uses_account_manager and not e.archived
    union all
    select sp.name as label from sponsors sp join events e on e.id = sp.event_id
      where sp.account_manager_id = ${userId} and not e.archived`;
  return [...new Set(rows.map((r) => r.label))];
}

function listText(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length <= 4) return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  return `${items.slice(0, 3).join(', ')} and ${items.length - 3} more`;
}

async function newTempPassword() {
  const password = tempPassword();
  return { password, hash: await hashPassword(password), expiresAt: new Date(Date.now() + TEMP_PASSWORD_DAYS * 86400000) };
}

/** Emails a temporary password and records whether it was sent. Returns the copy-ready message for the admin too. */
async function deliver(sql: Sql, me: CurrentUser, p: Pick<Person, 'id' | 'email' | 'full_name' | 'role'>, kind: AccessEmailKind,
  password: string, expiresAt: Date) {
  const appName = await getAppName();
  const lvl = accessLevel(p.role);
  const content = accessEmail({
    kind, appName, name: p.full_name, email: p.email, tempPassword: password, senderName: me.full_name,
    roleLabel: lvl.label, roleHelp: lvl.email, signInUrl: `${await appOrigin()}/login`, expiresAt,
  });
  const sent = await sendEmail(p.email, content, { fromName: appName, replyTo: me.email });
  await sql`update users set invite_email_status = ${sent.ok ? 'sent' : sent.status}, invite_email_error = ${sent.ok ? null : sent.error},
              invite_email_at = now() where id = ${p.id}`;
  return { sent, data: { emailed: sent.ok, manual: content.text, password, to: p.email } };
}

function notSentMessage(name: string, sent: { ok: false; status: 'not_set_up' | 'failed'; error: string }, what: string): string {
  return sent.status === 'not_set_up'
    ? `${what} Email isn’t set up yet, so copy the message below and send it to ${firstName(name)} yourself.`
    : `${what} The email wasn’t sent: ${sent.error} Copy the message below and send it to ${firstName(name)} yourself.`;
}

// ---- Invitations --------------------------------------------------------------------

export async function invitePerson(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const name = required(fd, 'full_name', 'Name', 120);
    const email = readEmail(fd);
    const role = readRole(fd);
    const title = str(fd, 'job_title', 120);
    const sql = await db();
    const [existing] = await sql<{ active: boolean }[]>`select active from users where lower(email) = ${email}`;
    if (existing) {
      throw new UserError(existing.active
        ? `${email} already has an account.`
        : `${email} has a deactivated account. Reactivate it from the people list instead.`);
    }
    const { password, hash, expiresAt } = await newTempPassword();
    const [p] = await sql<Person[]>`
      insert into users (email, full_name, job_title, role, password_hash, must_change_password, temp_password_expires_at, invited_by, invited_at)
      values (${email}, ${name}, ${title}, ${role}, ${hash}, true, ${expiresAt}, ${me.id}, now())
      returning id, email, full_name, role, active, must_change_password, last_login_at, temp_password_expires_at`;
    const { sent, data } = await deliver(sql, me, p, 'invite', password, expiresAt);
    await audit(sql, me, `Invited ${name} (${email}) as ${accessLevel(role).label}${sent.ok ? '' : ', email not sent'}`);
    refresh();
    return {
      ok: true,
      message: sent.ok
        ? `Invite sent to ${email}. ${firstName(name)} will choose their own password when they first sign in.`
        : notSentMessage(name, sent, `${name}’s account is ready.`),
      data,
    };
  });
}

/** Resends the invite to someone who hasn't signed in yet, or resets the password of someone who has. */
export async function sendNewPassword(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const sql = await db();
    const p = await findPerson(sql, fd);
    if (p.id === me.id) throw new UserError('Change your own password on the Your account page.');
    if (!p.active) throw new UserError(`Reactivate ${p.full_name} first.`);
    const kind: AccessEmailKind = p.last_login_at ? 'reset' : 'invite';
    const { password, hash, expiresAt } = await newTempPassword();
    await sql`update users set password_hash = ${hash}, must_change_password = true, temp_password_expires_at = ${expiresAt},
                failed_logins = 0, locked_until = null where id = ${p.id}`;
    await sql`delete from sessions where user_id = ${p.id}`;
    const { sent, data } = await deliver(sql, me, p, kind, password, expiresAt);
    await audit(sql, me, `${kind === 'invite' ? 'Resent the invite to' : 'Reset the password for'} ${p.full_name}${sent.ok ? '' : ', email not sent'}`);
    refresh();
    const done = kind === 'invite'
      ? `New invite for ${p.full_name}. The old temporary password no longer works.`
      : `${p.full_name}’s password has been reset and they’ve been signed out.`;
    return {
      ok: true,
      message: sent.ok ? `${done} The new temporary password has been emailed to ${p.email}.` : notSentMessage(p.full_name, sent, done),
      data,
    };
  });
}

export async function cancelInvite(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const sql = await db();
    const p = await findPerson(sql, fd);
    if (p.last_login_at) throw new UserError(`${p.full_name} has already signed in, so deactivate their account instead.`);
    const held = await responsibilitiesOf(sql, p.id);
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

export async function changeAccess(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const sql = await db();
    const p = await findPerson(sql, fd);
    const role = readRole(fd);
    if (p.id === me.id) throw new UserError('You can’t change your own access level. Ask another admin.');
    if (p.role === role) return { ok: true, message: `${p.full_name} is already ${role === 'admin' ? 'an' : 'a'} ${accessLevel(role).label}.` };
    if (p.role === 'admin' && p.active && (await otherActiveAdmins(sql, p.id)) === 0) {
      throw new UserError('There must always be at least one active admin.');
    }
    await sql`update users set role = ${role} where id = ${p.id}`;
    await audit(sql, me, `Changed ${p.full_name} from ${accessLevel(p.role).label} to ${accessLevel(role).label}`);
    let note = '';
    if (role === 'viewer') {
      const held = await responsibilitiesOf(sql, p.id);
      if (held.length) note = ` They still look after ${listText(held)}, but viewers can’t sign off: choose someone else below.`;
    }
    refresh();
    return { ok: true, message: `${p.full_name} is now ${role === 'admin' ? 'an' : 'a'} ${accessLevel(role).label}.${note}` };
  });
}

export async function updatePersonDetails(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const sql = await db();
    const p = await findPerson(sql, fd);
    const name = required(fd, 'full_name', 'Name', 120);
    const email = readEmail(fd);
    const title = str(fd, 'job_title', 120);
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
    const me = await actor('admin');
    const sql = await db();
    const p = await findPerson(sql, fd);
    const active = bool(fd, 'active');
    if (p.active === active) return { ok: true };
    if (!active) {
      if (p.id === me.id) throw new UserError('You can’t deactivate your own account. Ask another admin.');
      if (p.role === 'admin' && (await otherActiveAdmins(sql, p.id)) === 0) throw new UserError('There must always be at least one active admin.');
    }
    await sql`update users set active = ${active} where id = ${p.id}`;
    if (!active) await sql`delete from sessions where user_id = ${p.id}`;
    await audit(sql, me, `${active ? 'Reactivated' : 'Deactivated'} ${p.full_name}`);
    refresh();
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
    const me = await actor('admin');
    const eventId = uuidOrNull(fd, 'event_id');
    if (!eventId) throw new UserError('Missing event.');
    const sql = await db();
    const p = await findPerson(sql, fd);
    if (!p.active) throw new UserError(`Reactivate ${p.full_name} first.`);
    if (p.role === 'viewer') throw new UserError('Viewers can’t sign off. Change their access level to Member first.');
    const wantStages = new Set(fd.getAll('stage_ids').filter(isUuid));
    const wantSponsors = new Set(fd.getAll('sponsor_ids').filter(isUuid));
    const changes = await sql.begin(async (tx) => {
      const out: string[] = [];
      const stages = await tx<{ id: string; name: string; approver_id: string | null }[]>`
        select id, name, approver_id from stages where event_id = ${eventId} and not archived and not uses_account_manager
        order by position for update`;
      for (const s of stages) {
        const has = s.approver_id === p.id;
        if (wantStages.has(s.id) && !has) {
          await tx`update stages set approver_id = ${p.id} where id = ${s.id}`;
          out.push(`approver for ${s.name}`);
        } else if (!wantStages.has(s.id) && has) {
          await tx`update stages set approver_id = null where id = ${s.id}`;
          out.push(`no longer approver for ${s.name}`);
        }
      }
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

// ---- Platform switches ---------------------------------------------------------------

export async function setSponsorLinks(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
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

export async function sendTestEmail(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('admin');
    const appName = await getAppName();
    const text = `This is a test email from ${appName}, sent by ${me.full_name}. Invitations and password resets will arrive from the same address.`;
    const sent = await sendEmail(me.email, {
      subject: `${appName}: test email`,
      text,
      html: `<p style="font-family:Arial,sans-serif;font-size:15px;color:#13233b;">${escapeHtml(text)}</p>`,
    }, { fromName: appName });
    if (!sent.ok) throw new UserError(sent.error);
    return { ok: true, message: `Test email sent to ${me.email}. If it isn’t there in a few minutes, check the junk folder.` };
  });
}
