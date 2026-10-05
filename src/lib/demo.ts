import 'server-only';
import { db, ensureDemoReady } from '@/lib/db';
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
