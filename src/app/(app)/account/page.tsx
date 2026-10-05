import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { changePassword, updateProfile } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Field, inputCls, Notice, PageHeader, Panel } from '@/components/ui';

export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage(props: { searchParams: Promise<{ first?: string }> }) {
  const user = await requireUser({ allowPasswordChange: true });
  const sp = await props.searchParams;
  const forced = user.must_change_password;
  return (
    <>
      <PageHeader title="Your account" subtitle={user.email} />
      {(forced || sp.first) && (
        <div className="mb-5"><Notice tone="warn">Welcome. Choose your own password before you carry on. Enter the temporary password from your email, then your new one.</Notice></div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Change password">
          <ActionForm action={changePassword} resetOnSuccess className="space-y-3">
            <Field label={forced ? 'Temporary password' : 'Current password'} htmlFor="current">
              <input id="current" name="current" type="password" required autoComplete="current-password" className={inputCls} />
            </Field>
            <Field label="New password" htmlFor="password" help="At least 8 characters.">
              <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
            </Field>
            <Field label="New password again" htmlFor="confirm">
              <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
            </Field>
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Panel>
        {!forced && (
          <Panel title="Your details">
            <ActionForm action={updateProfile} className="space-y-3">
              <Field label="Name" htmlFor="full_name"><input id="full_name" name="full_name" required defaultValue={user.full_name} className={inputCls} /></Field>
              <Field label="Job title" htmlFor="job_title"><input id="job_title" name="job_title" defaultValue={user.job_title ?? ''} className={inputCls} /></Field>
              <SubmitButton variant="dark">Save</SubmitButton>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
