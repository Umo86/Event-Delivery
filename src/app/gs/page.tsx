import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, isDatabaseConfigured } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { getAppName } from '@/lib/data/load';
import { Mark } from '@/components/brand';
import { ActionForm, SubmitButton } from '@/components/forms';
import { PasswordInput } from '@/components/password-input';
import { Field, inputCls, Notice } from '@/components/ui';
import { superAdminLogin } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

// The super admin sign-in. It works even while maintenance mode shuts everyone else out.
// Once signed in, super admins use the normal app: the Control centre and the Admin pages.

export default async function SuperAdminSignInPage() {
  if (!isDatabaseConfigured()) {
    return <div className="p-6"><Notice tone="warn">No database is connected yet.</Notice></div>;
  }
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  if (n === 0) redirect('/setup');
  const [me, appName] = await Promise.all([getCurrentUser(), getAppName()]);
  if (me?.is_super_admin) redirect('/dashboard');
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3 text-white">
          <Mark />
          <span className="font-display text-[22px] font-semibold">{appName}</span>
        </div>
        <div className="rounded-[12px] bg-white p-6">
          <h1 className="text-[28px] font-semibold text-ink">Super admin</h1>
          <p className="mt-1 text-[14.5px] text-muted">
            For super admins only. Everyone else signs in on the <Link href="/login" className="font-semibold text-ink underline">normal sign-in page</Link>.
          </p>
          {me && (
            <div className="mt-4"><Notice tone="info">You’re signed in as {me.full_name}, who isn’t a super admin.</Notice></div>
          )}
          <ActionForm action={superAdminLogin} className="mt-5 space-y-4">
            <Field label="Email" htmlFor="gs-email">
              <input id="gs-email" name="email" type="email" autoComplete="username" required className={inputCls} />
            </Field>
            <Field label="Password" htmlFor="gs-password">
              <PasswordInput id="gs-password" name="password" autoComplete="current-password" required />
            </Field>
            <SubmitButton variant="dark" className="w-full" pendingText="Signing in…">Sign in as super admin</SubmitButton>
          </ActionForm>
        </div>
        <div className="hazard mt-6 h-2 w-full rounded-[2px]" aria-hidden />
      </div>
    </div>
  );
}
