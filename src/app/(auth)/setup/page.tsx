import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db, isDatabaseConfigured } from '@/lib/db';
import { setupFirstAdmin } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/forms';
import { PasswordInput } from '@/components/password-input';
import { Field, inputCls, Notice } from '@/components/ui';

export const metadata: Metadata = { title: 'Set up' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (!isDatabaseConfigured()) {
    return <Notice tone="warn">Connect a Neon database in Vercel first (Storage tab), then redeploy.</Notice>;
  }
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  if (n > 0) redirect('/login');
  return (
    <>
      <h1 className="text-[30px] font-semibold text-ink">Create the admin account</h1>
      <p className="mt-1 text-muted">This is a one-off step. You’ll add the rest of the team afterwards.</p>
      <ActionForm action={setupFirstAdmin} className="mt-6 space-y-4">
        <Field label="Setup code" htmlFor="code" help="The code you were given with this app, like ED-XXXX-XXXX-XXXX.">
          <input id="code" name="code" required autoComplete="off" className={inputCls + ' uppercase'} />
        </Field>
        <Field label="Your name" htmlFor="full_name">
          <input id="full_name" name="full_name" required autoComplete="name" className={inputCls} />
        </Field>
        <Field label="Job title (optional)" htmlFor="job_title">
          <input id="job_title" name="job_title" className={inputCls} />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" required autoComplete="username" className={inputCls} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" help="At least 8 characters.">
            <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" htmlFor="confirm">
            <PasswordInput id="confirm" name="confirm" required minLength={8} autoComplete="new-password" />
          </Field>
        </div>
        <SubmitButton className="w-full" pendingText="Creating…">Create admin account</SubmitButton>
      </ActionForm>
    </>
  );
}
