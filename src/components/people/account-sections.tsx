import Link from 'next/link';
import { fmtDateTime } from '@/lib/dates';
import { canCancelInvite } from '@/lib/domain/access';
import type { Role } from '@/lib/domain/types';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Field, inputCls } from '@/components/ui';
import { SetPassword } from './set-password';
import { DetailsForm } from '@/components/admin/details-form';
import { cancelInvite, sendNewPassword, setPersonActive, updatePersonDetails } from '@/app/actions/admin';

// A person's sign-in (invites, passwords, deactivating) and details (name, job title, email), shared by
// Admin › People and Show › Team. Managers can do all of it, except for super admins and the shared demo login.

export interface AccountPerson {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  last_login_at: Date | null;
  temp_password_expires_at: Date | null;
  locked_until: Date | null;
  invited_at: Date | null;
  invited_by_name: string | null;
  is_demo: boolean;
}

/** Who is looking: their id, whether they're a super admin, and whether it's the shared demo login. */
export interface Viewer { id: string; superAdmin: boolean; demo: boolean }

const h3 = 'mb-2 text-[15px] font-semibold text-ink';
const help = 'text-[13px] text-muted';

/** Why this viewer can't change this person's sign-in or details (mirrors the server), or null if they can. */
export function accountBlock(viewer: Viewer, u: Pick<AccountPerson, 'id' | 'role' | 'is_demo' | 'full_name'>): string | null {
  if (u.id === viewer.id) return null;
  if (viewer.demo) return 'The demo login can’t change anyone’s sign-in or details.';
  if (u.role === 'super_admin' && !viewer.superAdmin) {
    return `${u.full_name.trim().split(/\s+/)[0]} is a super admin, so only a super admin can change their sign-in or details.`;
  }
  if (u.is_demo && !viewer.superAdmin) return 'Only a super admin can change the demo login.';
  return null;
}

export function SignInSection({ u, viewer }: { u: AccountPerson; viewer: Viewer }) {
  const isMe = u.id === viewer.id;
  const first = u.full_name.trim().split(/\s+/)[0];
  const locked = !!u.locked_until && new Date(u.locked_until) > new Date();
  const neverSignedIn = !u.last_login_at;
  const blocked = accountBlock(viewer, u);

  return (
    <section aria-label={`Sign-in for ${u.full_name}`} className="min-w-0">
      <h3 className={h3}>Sign-in</h3>
      <div className="space-y-1 text-[14px] text-ink-2">
        {u.is_demo && (
          <p className="font-semibold text-ink">
            {u.active
              ? 'The shared demo login. Its email and password are shown on the sign-in page, so anyone with the link can sign in with it. Deactivate it to take it off.'
              : 'The shared demo login. It’s deactivated, so it isn’t on the sign-in page and doesn’t work.'}
          </p>
        )}
        {u.invited_at && !u.is_demo && (
          <p>Invited by {u.invited_by_name ?? 'an admin'} on {fmtDateTime(u.invited_at)}.</p>
        )}
        {u.last_login_at && <p>Last signed in {fmtDateTime(u.last_login_at)}.</p>}
        {u.must_change_password && u.temp_password_expires_at && (
          new Date(u.temp_password_expires_at) < new Date()
            ? <p className="font-semibold text-red-700">Their temporary password expired on {fmtDateTime(u.temp_password_expires_at)}. Make a new one below.</p>
            : <p>Their temporary password works until {fmtDateTime(u.temp_password_expires_at)}. They choose their own when they sign in.</p>
        )}
        {locked && <p className="font-semibold text-red-700">Locked out after too many wrong passwords. A new password unlocks the account.</p>}
        {!u.active && <p>Deactivated: {first} can’t sign in.</p>}
        {isMe && <p>This is you. Change your own password on <Link href="/account" className="font-semibold text-ink underline">Your account</Link>.</p>}
        {blocked && <p>{blocked}</p>}
      </div>

      {!isMe && !blocked && (
        <div className="mt-3 space-y-3">
          {u.active && !u.is_demo && (
            <DetailsForm action={sendNewPassword}
              confirm={neverSignedIn ? undefined : `Reset ${u.full_name}’s password? They’ll be signed out, and you’ll get a temporary password to send them.`}>
              <input type="hidden" name="user_id" value={u.id} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <SubmitButton variant="secondary" small pendingText="Working…">{neverSignedIn ? 'New invite' : 'Reset password'}</SubmitButton>
                <span className={help}>{neverSignedIn
                  ? 'Gives you a new invite email with a new temporary password. The old one stops working.'
                  : 'Signs them out and gives you an email with a temporary password to send them.'}</span>
              </div>
            </DetailsForm>
          )}
          {u.active && !u.is_demo && <SetPassword userId={u.id} first={first} />}
          {/* One form for both directions, so its message stays on screen when the button flips */}
          {(u.is_demo || !neverSignedIn || !u.active) && (
            <ActionForm action={setPersonActive}
              confirm={u.active
                ? u.is_demo
                  ? 'Deactivate the demo login? It comes off the sign-in page and anyone using it is signed out.'
                  : `Deactivate ${u.full_name}? They’ll be signed out straight away and can’t sign back in.`
                : undefined}>
              <input type="hidden" name="user_id" value={u.id} />
              <input type="hidden" name="active" value={u.active ? '0' : '1'} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <SubmitButton variant={u.active ? 'danger' : 'secondary'} small pendingText="Saving…">{u.active ? 'Deactivate' : 'Reactivate'}</SubmitButton>
                <span className={help}>{u.is_demo
                  ? (u.active ? 'Takes the demo login off the sign-in page.' : 'Puts the demo login back on the sign-in page.')
                  : (u.active ? 'Their name stays on everything they did.' : 'Lets them sign in again with their current password.')}</span>
              </div>
            </ActionForm>
          )}
          {canCancelInvite(u) && !u.is_demo && (
            <ActionForm action={cancelInvite} confirm={`Cancel the invite for ${u.full_name}? Their account will be removed.`}>
              <input type="hidden" name="user_id" value={u.id} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <SubmitButton variant="danger" small pendingText="Cancelling…">Cancel invite</SubmitButton>
                <span className={help}>Removes the account. You can invite them again later.</span>
              </div>
            </ActionForm>
          )}
        </div>
      )}
    </section>
  );
}

export function DetailsSection({ u, viewer }: { u: AccountPerson; viewer: Viewer }) {
  const blocked = accountBlock(viewer, u);
  return (
    <section aria-label={`Details for ${u.full_name}`} className="min-w-0">
      <h3 className={h3}>Details</h3>
      {blocked ? <p className={help}>{u.role === 'super_admin' && !u.is_demo ? 'Only a super admin can change these.' : blocked}</p> : (
        <ActionForm action={updatePersonDetails} className="grid items-end gap-3 sm:grid-cols-2">
          <input type="hidden" name="user_id" value={u.id} />
          <Field label="Name" htmlFor={`pn-${u.id}`}><input id={`pn-${u.id}`} name="full_name" required defaultValue={u.full_name} className={inputCls} /></Field>
          <Field label="Job title" htmlFor={`pt-${u.id}`}><input id={`pt-${u.id}`} name="job_title" defaultValue={u.job_title ?? ''} className={inputCls} /></Field>
          <Field label="Email (used to sign in)" htmlFor={`pe-${u.id}`} className="sm:col-span-2"
            help={u.is_demo ? 'Set in the deployment settings.' : undefined}>
            <input id={`pe-${u.id}`} name="email" type="email" required defaultValue={u.email} readOnly={u.is_demo} className={inputCls} />
          </Field>
          <div><SubmitButton variant="secondary" small>Save details</SubmitButton></div>
        </ActionForm>
      )}
    </section>
  );
}
