import 'server-only';
import { db, ensureDemoReady } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { maintenanceOn } from '@/lib/settings';
import { demoSettings } from '@/lib/demo-settings';

/** The demo login to show on the sign-in page, or null when there isn't one or an admin has deactivated it. */
export async function getDemoLogin(): Promise<{ email: string; password: string } | null> {
  const d = demoSettings(process.env);
  if (!d) return null;
  await ensureDemoReady();
  const sql = await db();
  const [u] = await sql<{ active: boolean; is_demo: boolean }[]>`select active, is_demo from users where lower(email) = ${d.email}`;
  return u?.active && u.is_demo ? { email: d.email, password: d.password } : null;
}

/**
 * For the health check: whether the demo login is set up, switched on, and would let someone sign in right now.
 * Says nothing secret: the demo password is shown on the sign-in page anyway.
 */
export async function demoStatus(): Promise<{ configured: boolean; account?: 'missing' | 'not_demo' | 'on' | 'off'; signInWorks?: boolean }> {
  const d = demoSettings(process.env);
  if (!d) return { configured: false };
  await ensureDemoReady();
  const sql = await db();
  const [u] = await sql<{ active: boolean; is_demo: boolean; password_hash: string; must_change_password: boolean; is_super_admin: boolean }[]>`
    select active, is_demo, password_hash, must_change_password, is_super_admin from users where lower(email) = ${d.email}`;
  if (!u) return { configured: true, account: 'missing', signInWorks: false };
  if (!u.is_demo) return { configured: true, account: 'not_demo', signInWorks: false };
  const passwordOk = await verifyPassword(d.password, u.password_hash);
  const blocked = (await maintenanceOn()) && !u.is_super_admin;
  return { configured: true, account: u.active ? 'on' : 'off', signInWorks: u.active && passwordOk && !u.must_change_password && !blocked };
}
