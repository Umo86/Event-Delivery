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

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sql = await db();
  const rows = await sql<CurrentUser[]>`
    select u.id, u.email, u.full_name, u.job_title, u.role, u.must_change_password
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now() and u.active
    limit 1`;
  return rows[0] ?? null;
});

/** For pages: returns the user or sends them to the login page. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.must_change_password && !opts.allowPasswordChange) redirect('/account?first=1');
  return user;
}

export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard?denied=1');
  return user;
}

export class AuthError extends Error {}

/** For server actions: throws instead of redirecting. */
export async function actor(level: 'viewer' | 'member' | 'admin' = 'member'): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Your session has ended. Please sign in again.');
  if (level === 'member' && user.role === 'viewer') throw new AuthError('Your account is read-only.');
  if (level === 'admin' && user.role !== 'admin') throw new AuthError('Only admins can do that.');
  return user;
}
