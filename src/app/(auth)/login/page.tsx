import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { db, isDatabaseConfigured } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { login } from '@/app/actions/auth';
import { getDemoLogin } from '@/lib/demo';
import { maintenanceOn } from '@/lib/settings';
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
  const [demo, maintenance] = await Promise.all([getDemoLogin(), maintenanceOn()]);
  return (
    <>
      {maintenance && (
        <div className="mb-5"><Notice tone="warn">Event Delivery is closed for maintenance. Only super admins can sign in right now.</Notice></div>
      )}
      <h1 className="text-[30px] font-semibold text-ink">Sign in</h1>
      <p className="mt-1 text-muted">For invited people only. Use the email address your invite was sent to.</p>
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
      <p className="mt-6 text-[13.5px] text-muted">Forgotten your password, or your invite has expired? Ask an admin to send you a new one.</p>
      {demo && (
        <section aria-labelledby="demo-title" className="mt-8 rounded-[10px] border-2 border-signal bg-white p-4">
          <h2 id="demo-title" className="text-[18px] font-semibold text-ink">Trying it out?</h2>
          <p className="mt-0.5 text-[13.5px] text-ink-2">Sign in with the shared demo account.</p>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[14.5px]">
            <dt className="text-muted">Email</dt>
            <dd className="break-all font-semibold text-ink">{demo.email}</dd>
            <dt className="text-muted">Password</dt>
            <dd className="break-all font-semibold text-ink">{demo.password}</dd>
          </dl>
          <ActionForm action={login} className="mt-3">
            <input type="hidden" name="email" value={demo.email} />
            <input type="hidden" name="password" value={demo.password} />
            <input type="hidden" name="next" value={sp.next ?? ''} />
            <SubmitButton variant="dark" className="w-full" pendingText="Signing in…">Sign in with the demo account</SubmitButton>
          </ActionForm>
        </section>
      )}
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
