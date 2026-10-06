'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { run, required, str, UserError, type ActionResult } from '@/lib/action';
import { hashPassword, sha256, verifyPassword, PASSWORD_MIN } from '@/lib/auth/password';
import { actor, createSession, destroySession, getCurrentUser, SESSION_COOKIE } from '@/lib/auth/session';
import { checkSetupCode } from '@/lib/setup';
import { EVENT_COOKIE } from '@/lib/data/load';
import { createDefaultEvent } from '@/lib/data/seed';
import { logActivity } from '@/lib/activity';
import { maintenanceOn } from '@/lib/settings';

const MAX_FAILED_LOGINS = 8;
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

/** Only same-site paths such as "/items/…", never "//host" or "/\host". */
function isLocalPath(s: string): boolean {
  return /^\/(?![/\\])/.test(s) && !/[\s\\]/.test(s);
}

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === 'string' ? v : '';
  return isLocalPath(s) && !s.startsWith('/login') ? s : '/dashboard';
}

/**
 * Checks an email and password (with lockout and expiry rules) and returns the account, or throws a message to show.
 * With superOnly, only super admins get through: used by the super admin sign-in at /gs.
 */
async function authenticate(fd: FormData, opts: { superOnly?: boolean } = {}) {
  const email = required(fd, 'email', 'Email', 200).toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (!password) throw new UserError('Password is required.');
  const sql = await db();
  const rows = await sql<{
    id: string; full_name: string; password_hash: string; active: boolean; failed_logins: number; locked_until: Date | null;
    must_change_password: boolean; temp_password_expires_at: Date | null; is_demo: boolean; is_super_admin: boolean;
  }[]>`
    select id, full_name, password_hash, active, failed_logins, locked_until, must_change_password, temp_password_expires_at,
           is_demo, (role = 'super_admin') as is_super_admin
    from users where lower(email) = ${email}`;
  const u = rows[0];
  if (!u || !u.active) {
    await verifyPassword(password, DUMMY_HASH); // keep timing similar
    throw new UserError('That email and password don’t match an account.');
  }
  // The demo login can't be locked: its password is public, so locking it would only shut everyone out
  if (!u.is_demo && u.locked_until && new Date(u.locked_until) > new Date()) {
    throw new UserError('Too many attempts. Try again in 15 minutes, or ask an admin to reset your password.');
  }
  if (!(await verifyPassword(password, u.password_hash))) {
    // The demo login's password is public, so guessing it is pointless; not counting stops anyone locking it for everyone.
    if (u.is_demo) throw new UserError('That email and password don’t match an account.');
    // Counted in one statement so guesses sent at the same time are all counted, and a lock is never undone here.
    const [f] = await sql<{ failed_logins: number }[]>`update users set failed_logins = failed_logins + 1,
                locked_until = case when failed_logins + 1 >= ${MAX_FAILED_LOGINS} then now() + interval '15 minutes' else locked_until end
              where id = ${u.id} returning failed_logins`;
    if (f && f.failed_logins >= MAX_FAILED_LOGINS) {
      await logActivity(sql, { eventId: null, itemId: null, userId: u.id, actorName: 'Sign-in protection', kind: 'access',
        message: `Locked ${u.full_name}’s account for 15 minutes after ${f.failed_logins} wrong passwords` });
    }
    throw new UserError('That email and password don’t match an account.');
  }
  // Checked only after the password matches, so they say nothing about the account to anyone else.
  if (u.must_change_password && u.temp_password_expires_at && new Date(u.temp_password_expires_at) < new Date()) {
    throw new UserError('That temporary password has expired. Ask an admin to send you a new invite.');
  }
  if (opts.superOnly && !u.is_super_admin) {
    throw new UserError('That account isn’t a super admin. Use the normal sign-in page instead.');
  }
  if (!u.is_super_admin && (await maintenanceOn())) {
    throw new UserError('Event Delivery is closed for maintenance, so only super admins can sign in right now. Try again later.');
  }
  await sql`update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = ${u.id}`;
  return u;
}

export async function login(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await authenticate(fd);
    await createSession(u.id);
    redirect(safeNext(fd.get('next')));
  });
}

/** The super admin sign-in (/gs): super admins only, and it works during maintenance. They land on the Control centre. */
export async function superAdminLogin(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await authenticate(fd, { superOnly: true });
    await destroySession(); // replaces whoever was signed in on this browser
    await createSession(u.id);
    const sql = await db();
    await logActivity(sql, { eventId: null, itemId: null, userId: u.id, actorName: u.full_name, kind: 'access', message: 'Signed in on the super admin sign-in' });
    redirect('/dashboard');
  });
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect('/login');
}

export async function setupFirstAdmin(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const sql = await db();
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
    if (n > 0) throw new UserError('Setup is already complete. Sign in instead.');
    const code = required(fd, 'code', 'Setup code', 100);
    if (!(await checkSetupCode(code))) throw new UserError('That setup code isn’t right. Check it and try again.');
    const name = required(fd, 'full_name', 'Your name', 120);
    const email = required(fd, 'email', 'Email', 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('Enter a valid email address.');
    const password = String(fd.get('password') ?? '');
    if (password.length < PASSWORD_MIN) throw new UserError(`Choose a password of at least ${PASSWORD_MIN} characters.`);
    if (password !== String(fd.get('confirm') ?? '')) throw new UserError('The two passwords don’t match.');
    const hash = await hashPassword(password);
    const id = await sql.begin(async (tx) => {
      const [{ c }] = await tx<{ c: number }[]>`select count(*)::int as c from users`;
      if (c > 0) throw new UserError('Setup is already complete. Sign in instead.');
      const [u] = await tx<{ id: string }[]>`
        insert into users (email, full_name, job_title, role, password_hash)
        values (${email}, ${name}, ${str(fd, 'job_title', 120)}, 'super_admin', ${hash}) returning id`;
      return u.id;
    });
    const [{ e }] = await sql<{ e: number }[]>`select count(*)::int as e from events`;
    if (e === 0) await createDefaultEvent(sql, id);
    await logActivity(sql, { eventId: null, itemId: null, userId: id, actorName: name, kind: 'access', message: 'Created the first admin account (a super admin) with the setup code' });
    await createSession(id);
    redirect('/settings?welcome=1');
  });
}

export async function changePassword(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('user', { allowPasswordChange: true });
    if (me.is_demo) throw new UserError('The demo account’s password can’t be changed.');
    const current = String(fd.get('current') ?? '');
    const next = String(fd.get('password') ?? '');
    if (next.length < PASSWORD_MIN) throw new UserError(`Choose a password of at least ${PASSWORD_MIN} characters.`);
    if (next !== String(fd.get('confirm') ?? '')) throw new UserError('The two new passwords don’t match.');
    const sql = await db();
    const [u] = await sql<{ password_hash: string; must_change_password: boolean }[]>`select password_hash, must_change_password from users where id = ${me.id}`;
    if (!(await verifyPassword(current, u.password_hash))) throw new UserError('Your current password isn’t right.');
    if (current === next) throw new UserError('Choose a new password that is different from the current one.');
    await sql`update users set password_hash = ${await hashPassword(next)}, must_change_password = false, temp_password_expires_at = null
              where id = ${me.id}`;
    await logActivity(sql, { eventId: null, itemId: null, userId: me.id, actorName: me.full_name, kind: 'access',
      message: u.must_change_password ? 'Signed in and chose their own password' : 'Changed their password' });
    // Sign out everywhere else
    const jar = await cookies();
    const keep = jar.get(SESSION_COOKIE)?.value;
    await sql`delete from sessions where user_id = ${me.id} and token_hash <> ${keep ? sha256(keep) : ''}`;
    if (u.must_change_password) redirect('/dashboard');
    return { ok: true, message: 'Password changed.' };
  });
}

export async function updateProfile(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await actor('user');
    if (me.is_demo) throw new UserError('The demo account’s details can’t be changed.');
    const name = required(fd, 'full_name', 'Your name', 120);
    const sql = await db();
    await sql`update users set full_name = ${name}, job_title = ${str(fd, 'job_title', 120)} where id = ${me.id}`;
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Saved.' };
  });
}

export async function switchEvent(fd: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  const id = String(fd.get('event_id') ?? '');
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const jar = await cookies();
    jar.set(EVENT_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  const back = String(fd.get('back') ?? '/dashboard');
  revalidatePath('/', 'layout');
  // Item and sponsor pages belong to one event, so switching sends people to that event's dashboard.
  redirect(isLocalPath(back) && !/^\/(items|sponsors|proof)\//.test(back) ? back : '/dashboard');
}
