import 'server-only';
import type { Sql } from '@/lib/db';
import { createDefaultEvent } from '@/lib/data/seed';
import { logActivity } from '@/lib/activity';

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
