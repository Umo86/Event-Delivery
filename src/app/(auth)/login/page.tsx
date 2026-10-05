import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db, isDatabaseConfigured } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { login } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Field, inputCls, Notice } from '@/components/ui';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const sp = await props.searchParams;
  if (!isDatabaseConfigured()) return <NotConnected />;
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  if (n === 0) redirect('/setup');
  if (await getCurrentUser()) redirect('/inbox');
  return (
    <>
      <h1 className="text-[30px] font-semibold text-ink">Sign in</h1>
      <p className="mt-1 text-muted">Use the email your admin set up for you.</p>
      <ActionForm action={login} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ''} />
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="username" required className={inputCls} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" name="password" type="password" autoComplete="current-password" required className={inputCls} />
        </Field>
        <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-[13.5px] text-muted">Forgotten your password? Ask an admin to reset it from Settings › Team.</p>
    </>
  );
}

function NotConnected() {
  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-semibold text-ink">Almost there</h1>
      <Notice tone="warn">
        No database is connected yet. In Vercel, open this project’s <b>Storage</b> tab and create a <b>Neon</b> database and
        a <b>Blob</b> store (Private access) for this project, then redeploy.
      </Notice>
    </div>
  );
}
