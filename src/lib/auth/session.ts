import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import type { Role } from '@/lib/domain/types';
import { randomToken, sha256 } from './password';

export const SESSION_COOKIE = 'ed_session';
const SESSION_DAYS = 30;

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  role: Role;
  must_change_password: boolean;
  /** The shared demo login: its password and details can't be changed. */
  is_demo: boolean;
  /** Derived: role === 'super_admin'. Full control, including the Admin pages and the super admin sign-in (/gs). */
  is_super_admin: boolean;
}

function cookieSecure() {
  return process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1';
}

export async function createSession(userId: string): Promise<void> {
  const sql = await db();
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await sql`insert into sessions (user_id, token_hash, expires_at) values (${userId}, ${sha256(token)}, ${expires})`;
  await sql`delete from sessions where user_id = ${userId} and expires_at < now()`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: cookieSecure(), sameSite: 'lax', path: '/', expires });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const sql = await db();
    await sql`delete from sessions where token_hash = ${sha256(token)}`;
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * The signed-in user for this request, or null. Cached per request.
 * While maintenance mode is on, only super admins count as signed in.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sql = await db();
  const rows = await sql<(Omit<CurrentUser, 'is_super_admin'> & { maintenance: string | null })[]>`
    select u.id, u.email, u.full_name, u.job_title, u.role, u.must_change_password, u.is_demo,
           (select value from app_settings where key = 'maintenance') as maintenance
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now() and u.active
    limit 1`;
  const r = rows[0];
  if (!r) return null;
  const { maintenance, ...rest } = r;
  const user: CurrentUser = { ...rest, is_super_admin: rest.role === 'super_admin' };
  if (maintenance === 'on' && !user.is_super_admin) return null;
  return user;
});

/** For pages: returns the user or sends them to the login page. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.must_change_password && !opts.allowPasswordChange) redirect('/account?first=1');
  return user;
}

/** For pages managers can open (signage, events, settings). Users are sent away. */
export async function requireManager(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role === 'user') redirect('/dashboard?denied=1');
  return user;
}

/** For pages only super admins can open (the Admin pages: people, platform, activity). */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'super_admin') redirect('/dashboard?denied=1');
  return user;
}

/** For server actions only super admins can run (platform switches, signing people out). */
export async function superActor(): Promise<CurrentUser> {
  return actor('super_admin');
}

export class AuthError extends Error {}

const RANK: Record<string, number> = { user: 1, manager: 2, super_admin: 3 };

/** For server actions: throws instead of redirecting. */
export async function actor(level: 'user' | 'manager' | 'super_admin' = 'manager', opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Your session has ended. Please sign in again.');
  if (user.must_change_password && !opts.allowPasswordChange) throw new AuthError('Choose your own password first, on the Your account page.');
  if (RANK[user.role] < RANK[level]) {
    throw new AuthError(level === 'super_admin' ? 'Only super admins can do that.' : 'Your account is read-only.');
  }
  return user;
}
