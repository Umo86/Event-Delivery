import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { fmtDateTime } from '@/lib/dates';
import { ACCESS_LEVELS, accessLevel, canCancelInvite, personStatus, STATUS_INFO } from '@/lib/domain/access';
import type { Role, SponsorRow, StageRow } from '@/lib/domain/types';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, Field, inputCls } from '@/components/ui';
import { DetailsForm } from './details-form';
import {
  cancelInvite, changeAccess, saveSignoffDuties, sendNewPassword, setPersonActive, updatePersonDetails,
} from '@/app/actions/admin';

export interface AdminPerson {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  last_login_at: Date | null;
  created_at: Date;
  invited_at: Date | null;
  invited_by_name: string | null;
  temp_password_expires_at: Date | null;
  locked_until: Date | null;
  is_demo: boolean;
  is_super_admin: boolean;
}

const ROLE_TONE = { admin: 'blue', member: 'teal', viewer: 'grey' } as const;

const h3 = 'mb-2 text-[15px] font-semibold text-ink';
const help = 'text-[13px] text-muted';

export function PersonRow({ u, me, meSuper, meDemo, event, stages, sponsors, names, open }: {
  u: AdminPerson;
  me: string;
  /** Whether the admin looking at the page is a super admin, and whether they're using the demo login. */
  meSuper: boolean;
  meDemo: boolean;
  event: { id: string; name: string } | null;
  /** Stages of the current event that have a named approver (not the sponsor stage). */
  stages: StageRow[];
  sponsors: SponsorRow[];
  names: Map<string, string>;
  open?: boolean;
}) {
  const isMe = u.id === me;
  // Super admins can only be changed by other super admins, and never by the demo login
  const protectedSuper = u.is_super_admin && !isMe && (!meSuper || meDemo);
  const status = personStatus(u);
  const info = STATUS_INFO[status];
  const locked = !!u.locked_until && new Date(u.locked_until) > new Date();
  const neverSignedIn = !u.last_login_at;
  const myStages = stages.filter((s) => s.approver_id === u.id);
  const mySponsors = sponsors.filter((s) => s.account_manager_id === u.id);
  const duties = [...myStages.map((s) => s.name), ...mySponsors.map((s) => s.name)];
  const first = u.full_name.split(' ')[0];

  const right = !u.active ? 'Can’t sign in'
    : u.last_login_at ? `Last signed in ${fmtDateTime(u.last_login_at)}`
      : u.invited_at ? `Invited ${fmtDateTime(u.invited_at)}` : 'Hasn’t signed in yet';

  return (
    <li id={`person-${u.id}`} className="scroll-mt-4 border-b border-line last:border-0">
      <details className="group" open={open}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
          <ChevronRight size={16} aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-90" />
          <span className="text-[16px] font-semibold text-ink">{u.full_name}{isMe ? ' (you)' : ''}</span>
          <Chip tone={ROLE_TONE[u.role]}>{accessLevel(u.role).label}</Chip>
          {u.is_super_admin && <Chip tone="violet">Super admin</Chip>}
          {u.is_demo && <Chip tone="yellow">Demo login</Chip>}
          {status !== 'active' && <Chip tone={info.tone}>{info.label}</Chip>}
          {locked && <Chip tone="red">Locked out</Chip>}
          <span className="min-w-0 break-all text-[14px] text-muted">{u.email}{u.job_title ? `, ${u.job_title}` : ''}</span>
          <span className="ml-auto text-[13px] text-muted">{right}</span>
        </summary>

        <div className="grid gap-x-8 gap-y-6 border-t border-line bg-paper/50 px-4 py-4 lg:grid-cols-2">
          {/* Sign-in */}
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
              {u.must_change_password && u.temp_password_expires_at && (
                new Date(u.temp_password_expires_at) < new Date()
                  ? <p className="font-semibold text-red-700">Their temporary password expired on {fmtDateTime(u.temp_password_expires_at)}. Make a new one below.</p>
                  : <p>Their temporary password works until {fmtDateTime(u.temp_password_expires_at)}. They choose their own when they sign in.</p>
              )}
              {locked && <p className="font-semibold text-red-700">Locked out after too many wrong passwords. A new password unlocks the account.</p>}
              {!u.active && <p>Deactivated: {first} can’t sign in.</p>}
              {isMe && <p>This is you. Change your own password on <Link href="/account" className="font-semibold text-ink underline">Your account</Link>.</p>}
              {protectedSuper && <p>{first} is a super admin, so only another super admin can change their sign-in, access or details.</p>}
            </div>

            {!isMe && !protectedSuper && (
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

          {/* Access level */}
          <section aria-label={`Access level for ${u.full_name}`} className="min-w-0">
            <h3 className={h3}>Access level</h3>
            {isMe || protectedSuper || u.is_super_admin ? (
              <p className={help}>
                {isMe ? 'You’re an admin. Another admin would need to change your access level.'
                  : protectedSuper ? 'Only another super admin can change a super admin’s access.'
                    : `${first} is a super admin. To make them anything other than an admin, remove that on the super admin page first.`}
              </p>
            ) : (
              <ActionForm action={changeAccess} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="user_id" value={u.id} />
                <div className="min-w-[200px] flex-1">
                  <label htmlFor={`ar-${u.id}`} className="sr-only">Access level</label>
                  <select key={u.role} id={`ar-${u.id}`} name="role" defaultValue={u.role} className={inputCls}>
                    {ACCESS_LEVELS.filter((a) => !u.is_demo || a.key !== 'admin').map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </div>
                <SubmitButton variant="dark" small>Save access</SubmitButton>
              </ActionForm>
            )}
            <p className={`${help} mt-1.5`}>{accessLevel(u.role).summary}</p>
          </section>

          {/* Sign-off */}
          {event && (
            <section aria-label={`Sign-off for ${u.full_name}`} className="min-w-0">
              <h3 className={h3}>Signs off in {event.name}</h3>
              {!u.active || u.role === 'viewer' ? (
                <>
                  <p className={help}>
                    {!u.active ? 'Reactivate them to change what they sign off.' : 'Viewers can’t sign off. Give them Member access to choose their stages and sponsors.'}
                  </p>
                  {duties.length > 0 && (
                    <p className="mt-1.5 text-[13.5px] font-semibold text-red-700">
                      Still looks after {duties.join(', ')}. Choose someone else for {duties.length === 1 ? 'it' : 'them'}.
                    </p>
                  )}
                </>
              ) : (
                <ActionForm action={saveSignoffDuties} className="space-y-3">
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="event_id" value={event.id} />
                  <fieldset>
                    <legend className="mb-1 text-[13.5px] font-semibold text-ink-2">Approves these stages</legend>
                    {stages.length === 0 ? <p className={help}>No stages with a named approver.</p> : (
                      <ul className="space-y-1">
                        {stages.map((s) => (
                          <DutyOption key={s.id} uid={u.id} name="stage_ids" value={s.id} label={s.name} checked={s.approver_id === u.id}
                            holder={s.approver_id && s.approver_id !== u.id ? names.get(s.approver_id) ?? 'someone else' : null}
                            none="No approver yet" />
                        ))}
                      </ul>
                    )}
                  </fieldset>
                  <fieldset>
                    <legend className="mb-1 text-[13.5px] font-semibold text-ink-2">Account manager for these sponsors</legend>
                    {sponsors.length === 0 ? <p className={help}>No sponsors in this event yet.</p> : (
                      <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                        {sponsors.map((s) => (
                          <DutyOption key={s.id} uid={u.id} name="sponsor_ids" value={s.id} label={s.name} checked={s.account_manager_id === u.id}
                            holder={s.account_manager_id && s.account_manager_id !== u.id ? names.get(s.account_manager_id) ?? 'someone else' : null}
                            none="No account manager yet" />
                        ))}
                      </ul>
                    )}
                  </fieldset>
                  <p className={help}>Ticking something that belongs to someone else hands it to {first}.</p>
                  <SubmitButton variant="secondary" small>Save sign-off</SubmitButton>
                </ActionForm>
              )}
            </section>
          )}

          {/* Details */}
          <section aria-label={`Details for ${u.full_name}`} className="min-w-0">
            <h3 className={h3}>Details</h3>
            {protectedSuper ? <p className={help}>Only another super admin can change these.</p> : (
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
        </div>
      </details>
    </li>
  );
}

function DutyOption({ uid, name, value, label, checked, holder, none }: {
  uid: string; name: string; value: string; label: string; checked: boolean; holder: string | null; none: string;
}) {
  const id = `${uid}-${name}-${value}`;
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <label className="flex items-center gap-2 text-[14.5px] text-ink">
        {/* Keyed by the saved state so the box follows changes made in someone else's row */}
        <input key={String(checked)} type="checkbox" name={name} value={value} defaultChecked={checked} aria-describedby={`${id}-who`}
          className="h-4 w-4 accent-[#13233b]" />
        {label}
      </label>
      <span id={`${id}-who`} className="text-[12.5px] text-muted">
        {checked ? '' : holder ? `now ${holder}` : none}
      </span>
    </li>
  );
}
