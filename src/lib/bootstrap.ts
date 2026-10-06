import 'server-only';
import type { Sql } from '@/lib/db';
import { createDefaultEvent } from '@/lib/data/seed';
import { logActivity } from '@/lib/activity';
import { hashPassword, sha256, verifyPassword } from '@/lib/auth/password';
import { demoSettings } from '@/lib/demo-settings';

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
      values (${email}, ${name}, ${title}, 'super_admin', ${hash}, false) returning id`;
    const t = tx as unknown as Sql;
    const [{ e }] = await t<{ e: number }[]>`select count(*)::int as e from events`;
    if (e === 0) await createDefaultEvent(t, u.id);
    await logActivity(t, { eventId: null, itemId: null, userId: u.id, actorName: 'Deployment settings', kind: 'access',
      message: `Created the first admin account for ${name} (${email})` });
  });
  console.log('Bootstrap admin created');
}

/**
 * Makes sure the shared demo login exists and matches the deployment settings (see demo-settings.ts):
 * DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_PASSWORD, and optionally DEMO_ACCOUNT_NAME and DEMO_ACCOUNT_ROLE.
 * - The settings decide whether there is a demo login: while they're set, the account exists (it's recreated if missing).
 * - Its password always matches the one shown on the sign-in page, never has to be changed, and it can't be locked.
 * - It's switched on the first time these settings are used. After that an admin controls it: deactivating it takes
 *   the login off the sign-in page.
 * - It never takes over an account that belongs to a real person.
 * Returns false while the platform isn't set up yet, so the caller can try again later.
 */
/**
 * One-time password reset from the deployment settings, for recovering an account without database access:
 *   RESET_ADMIN_EMAIL and RESET_ADMIN_PASSWORD (plaintext — used once, then safe to remove).
 * It applies each distinct email+password combination exactly once (recorded in app_settings), so it never
 * overrides a password the person later changes in the app, and a redeploy won't keep resetting it.
 */
export async function ensureAdminPassword(sql: Sql): Promise<void> {
  const email = process.env.RESET_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.RESET_ADMIN_PASSWORD?.trim();
  if (!email || !password || password.length < 8) return;
  const key = `admin_pwd_reset:${email}`;
  const stamp = sha256(password);
  const [done] = await sql<{ value: string }[]>`select value from app_settings where key = ${key}`;
  if (done?.value === stamp) return; // this exact reset has already been applied
  const [u] = await sql<{ id: string; full_name: string }[]>`select id, full_name from users where lower(email) = ${email}`;
  if (!u) return; // nothing to reset yet
  const hash = await hashPassword(password);
  await sql`update users set password_hash = ${hash}, must_change_password = false, failed_logins = 0, locked_until = null, active = true where id = ${u.id}`;
  await sql`delete from sessions where user_id = ${u.id}`; // force a fresh sign-in with the new password
  await sql`insert into app_settings (key, value) values (${key}, ${stamp})
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
  await logActivity(sql, { eventId: null, itemId: null, userId: u.id, actorName: 'Deployment settings', kind: 'access',
    message: `Reset the password for ${u.full_name} (${email}) from the deployment settings` });
  console.log('Admin password reset applied');
}

export async function ensureDemoAccount(sql: Sql): Promise<boolean> {
  const d = demoSettings(process.env);
  if (!d) return true;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  if (n === 0) return false;
  const madeHere = `demo_account:${d.email}`;
  const switchedOn = `demo_login_on:${d.email}`;
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4242003)`;
    const [f] = await tx<{ value: string }[]>`select value from app_settings where key = ${madeHere}`;
    const [u] = await tx<{ id: string; is_demo: boolean; password_hash: string; must_change_password: boolean }[]>`
      select id, is_demo, password_hash, must_change_password from users where lower(email) = ${d.email}`;
    let id: string;
    if (!u) {
      const [created] = await tx<{ id: string }[]>`
        insert into users (email, full_name, job_title, role, password_hash, must_change_password, is_demo, invited_at)
        values (${d.email}, ${d.name}, 'Demo account', ${d.role}, ${await hashPassword(d.password)}, false, true, now()) returning id`;
      await tx`insert into app_settings (key, value) values (${madeHere}, 'created')
               on conflict (key) do update set value = excluded.value, updated_at = now()`;
      await logActivity(tx as unknown as Sql, { eventId: null, itemId: null, userId: created.id, actorName: 'Deployment settings', kind: 'access',
        message: `Created the shared demo login ${d.name} (${d.email}) as ${d.role === 'user' ? 'User' : 'Manager'}` });
      id = created.id;
    } else {
      if (!u.is_demo) {
        // Only adopt an account this mechanism made itself, never a real person's
        if (f?.value !== 'created') {
          console.error(`Demo account skipped: ${d.email} belongs to an existing account.`);
          return;
        }
        await tx`update users set is_demo = true where id = ${u.id}`;
      }
      if (u.must_change_password || !(await verifyPassword(d.password, u.password_hash))) {
        await tx`update users set password_hash = ${await hashPassword(d.password)}, must_change_password = false,
                   temp_password_expires_at = null where id = ${u.id}`;
      }
      id = u.id;
    }
    // The first time these settings are used, switch the demo login on and clear any old lock, so the details shown work
    const [on] = await tx`select 1 from app_settings where key = ${switchedOn}`;
    if (!on) {
      await tx`update users set active = true, failed_logins = 0, locked_until = null where id = ${id}`;
      await tx`insert into app_settings (key, value) values (${switchedOn}, 'yes') on conflict (key) do nothing`;
    }
  });
  return true;
}
