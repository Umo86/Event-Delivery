import 'server-only';
import type { Sql } from '@/lib/db';
import { createDefaultEvent } from '@/lib/data/seed';
import { logActivity } from '@/lib/activity';
import { TEMP_PASSWORD_DAYS } from '@/lib/domain/access';

const SCRYPT_HASH = /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/;

/**
 * Creates the first admin from the deployment's environment variables, so the owner's account exists
 * without anyone opening the setup page:
 *   BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD_HASH (a scrypt hash, never the password),
 *   BOOTSTRAP_ADMIN_TITLE (optional).
 * Only runs while the platform has no accounts at all, so it can never add a second admin or change a password.
 */
export async function bootstrapAdmin(sql: Sql): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const hash = process.env.BOOTSTRAP_ADMIN_PASSWORD_HASH?.trim();
  if (!email || !hash) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !SCRYPT_HASH.test(hash)) {
    if (hash !== 'used') console.error('Bootstrap admin skipped: BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD_HASH is not valid.');
    return;
  }
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  if (n > 0) return;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim().slice(0, 120) || email.split('@')[0];
  const title = process.env.BOOTSTRAP_ADMIN_TITLE?.trim().slice(0, 120) || null;
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4242002)`;
    const [{ c }] = await tx<{ c: number }[]>`select count(*)::int as c from users`;
    if (c > 0) return; // another server instance got there first
    const [u] = await tx<{ id: string }[]>`
      insert into users (email, full_name, job_title, role, password_hash, must_change_password)
      values (${email}, ${name}, ${title}, 'admin', ${hash}, false) returning id`;
    const t = tx as unknown as Sql;
    const [{ e }] = await t<{ e: number }[]>`select count(*)::int as e from events`;
    if (e === 0) await createDefaultEvent(t, u.id);
    await logActivity(t, { eventId: null, itemId: null, userId: u.id, actorName: 'Deployment settings', kind: 'access',
      message: `Created the first admin account for ${name} (${email})` });
  });
  console.log('Bootstrap admin created');
}

const ROLES = ['admin', 'member', 'viewer'] as const;

/**
 * Creates one extra account from the deployment settings, such as a demo login for trying the platform:
 *   DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_PASSWORD_HASH (a scrypt hash), DEMO_ACCOUNT_NAME, DEMO_ACCOUNT_ROLE (member by default).
 * It works like an invite: the password is temporary, has to be changed at first sign-in and stops working after
 * TEMP_PASSWORD_DAYS. It runs once per address (so a removed demo account doesn't come back), only once the platform
 * has its first admin, and it never changes an account that already exists.
 */
export async function ensureDemoAccount(sql: Sql): Promise<void> {
  const email = process.env.DEMO_ACCOUNT_EMAIL?.trim().toLowerCase();
  const hash = process.env.DEMO_ACCOUNT_PASSWORD_HASH?.trim();
  if (!email || !hash) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !SCRYPT_HASH.test(hash)) {
    if (hash !== 'used') console.error('Demo account skipped: DEMO_ACCOUNT_EMAIL or DEMO_ACCOUNT_PASSWORD_HASH is not valid.');
    return;
  }
  const flag = `demo_account:${email}`;
  if ((await sql`select 1 from app_settings where key = ${flag}`).length) return;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  if (n === 0) return; // not before the platform has been set up
  const wanted = process.env.DEMO_ACCOUNT_ROLE?.trim().toLowerCase();
  const role = ROLES.find((r) => r === wanted) ?? 'member';
  const name = process.env.DEMO_ACCOUNT_NAME?.trim().slice(0, 120) || 'Demo User';
  const expires = new Date(Date.now() + TEMP_PASSWORD_DAYS * 86400000);
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4242003)`;
    if ((await tx`select 1 from app_settings where key = ${flag}`).length) return; // another server instance did it
    const exists = (await tx`select 1 from users where lower(email) = ${email}`).length > 0;
    if (!exists) {
      const [u] = await tx<{ id: string }[]>`
        insert into users (email, full_name, job_title, role, password_hash, must_change_password, temp_password_expires_at, invited_at)
        values (${email}, ${name}, 'Demo account', ${role}, ${hash}, true, ${expires}, now()) returning id`;
      await logActivity(tx as unknown as Sql, { eventId: null, itemId: null, userId: u.id, actorName: 'Deployment settings', kind: 'access',
        message: `Created the demo account ${name} (${email}) as ${role[0].toUpperCase()}${role.slice(1)}` });
    }
    await tx`insert into app_settings (key, value) values (${flag}, ${exists ? 'account already existed' : 'created'})`;
  });
}
