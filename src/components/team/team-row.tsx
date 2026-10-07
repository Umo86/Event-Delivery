import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { fmtDateTime } from '@/lib/dates';
import { accessLevel, levelsFor, personStatus, ROLE_TONE, STATUS_INFO } from '@/lib/domain/access';
import type { DepartmentRow, Role, SponsorRow, StageRow } from '@/lib/domain/types';
import { listText } from '@/lib/text';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, inputCls } from '@/components/ui';
import { DetailsForm } from '@/components/admin/details-form';
import { cancelInvite, changeAccess, saveApprovals, sendNewPassword } from '@/app/actions/admin';
import { setPersonDepartments } from '@/app/actions/departments';

export interface TeamPerson {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  last_login_at: Date | null;
  temp_password_expires_at: Date | null;
  is_demo: boolean;
}

export interface TeamViewer {
  id: string;
  superAdmin: boolean;
  /** The shared demo login, which can't add people or change access. */
  demo: boolean;
}

const h3 = 'mb-2 text-[15px] font-semibold text-ink';
const help = 'text-[13px] text-muted';
const check = 'h-4 w-4 shrink-0 accent-[#13233b]';

export const memberHref = (id: string) => `/team?person=${id}#member-${id}`;

/** One person on Show › Team: what they're in and approve at a glance, and the forms to change it. */
export function TeamRow({ u, me, event, stages, sponsors, departments, deptIds, names, open }: {
  u: TeamPerson;
  me: TeamViewer;
  event: { id: string; name: string } | null;
  /** The current show's stages that have named approvers (not the sponsor's account manager stage). */
  stages: StageRow[];
  sponsors: SponsorRow[];
  departments: DepartmentRow[];
  deptIds: string[];
  names: Map<string, string>;
  open?: boolean;
}) {
  const isMe = u.id === me.id;
  const first = u.full_name.trim().split(/\s+/)[0];
  const status = personStatus(u);
  const info = STATUS_INFO[status];
  const inDepts = departments.filter((d) => deptIds.includes(d.id));
  const approves = stages.filter((s) => s.approver_ids.includes(u.id));
  const manages = sponsors.filter((s) => s.account_manager_id === u.id);
  const canSignOff = u.role !== 'user';
  const pending = !u.last_login_at && !u.is_demo;

  // Mirrors the server: super admins and the demo login are only changed by super admins, and the demo login changes nobody
  const accessBlocked = isMe ? `You can’t change your own access level. Ask ${me.superAdmin ? 'another' : 'a'} super admin.`
    : me.demo ? 'The demo login can’t change anyone’s access.'
      : u.role === 'super_admin' && !me.superAdmin ? 'Only a super admin can change a super admin’s access.'
        : u.is_demo && !me.superAdmin ? 'Only a super admin can change the demo login’s access.'
          : null;
  const inviteAllowed = pending && !isMe && !me.demo && (me.superAdmin || u.role !== 'super_admin');
  const levels = levelsFor(me.superAdmin).filter((a) => !u.is_demo || a.key !== 'super_admin');

  return (
    <li id={`member-${u.id}`} className="scroll-mt-4 border-b border-line last:border-0">
      <details className="group" open={open}>
        <summary className="grid cursor-pointer list-none grid-cols-[16px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 hover:bg-paper lg:grid-cols-[16px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)] [&::-webkit-details-marker]:hidden">
          <ChevronRight size={16} aria-hidden className="mt-1 text-muted transition-transform group-open:rotate-90" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[16px] font-semibold text-ink">{u.full_name}{isMe ? ' (you)' : ''}</span>
              <Chip tone={ROLE_TONE[u.role]}>{accessLevel(u.role).label}</Chip>
              {u.is_demo && <Chip tone="yellow">Demo login</Chip>}
              {status !== 'active' && <Chip tone={info.tone}>{info.label}</Chip>}
            </span>
            <span className="block break-all text-[13.5px] text-muted">{u.email}{u.job_title ? `, ${u.job_title}` : ''}</span>
          </span>
          <span className="col-start-2 min-w-0 text-[14px] text-ink-2 lg:col-start-auto lg:pt-0.5">
            <span className="text-muted lg:sr-only">Departments: </span>
            {inDepts.length ? inDepts.map((d) => d.name).join(', ') : <span className="text-muted">No department</span>}
          </span>
          {event && (
            <span className="col-start-2 min-w-0 text-[14px] text-ink-2 lg:col-start-auto lg:pt-0.5">
              <span className="text-muted lg:sr-only">Sign-off: </span>
              {approves.length ? (
                <>
                  {approves.map((s) => s.name).join(', ')}
                  {!canSignOff && <span className="font-semibold text-red-700"> (can’t sign off as a User)</span>}
                </>
              ) : <span className="text-muted">{u.role === 'super_admin' ? 'Can sign off any stage' : 'Not an approver'}</span>}
              {manages.length > 0 && <span className="block text-[13px] text-muted">Account manager for {listText(manages.map((s) => s.name))}</span>}
            </span>
          )}
        </summary>

        <div className="grid gap-x-8 gap-y-6 border-t border-line bg-paper/50 px-4 py-4 lg:grid-cols-2">
          {/* Departments */}
          <section aria-label={`Departments for ${u.full_name}`} className="min-w-0">
            <h3 className={h3}>Departments</h3>
            {departments.length === 0 ? (
              <p className={help}>No departments yet. Add them in <Link href="/settings/departments" className="font-semibold text-ink underline">Show setup › Departments</Link>.</p>
            ) : (
              <ActionForm action={setPersonDepartments} className="space-y-2">
                <input type="hidden" name="user_id" value={u.id} />
                <ul className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                  {departments.map((d) => (
                    <li key={d.id}>
                      <label className="flex items-start gap-2 text-[14.5px] text-ink">
                        <input key={String(deptIds.includes(d.id))} type="checkbox" name="department_ids" value={d.id} defaultChecked={deptIds.includes(d.id)} className={`${check} mt-[3px]`} />
                        <span>
                          {d.name}
                          {d.external && <span className="block text-[12.5px] text-muted">Outside the company</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <SubmitButton variant="secondary" small>Save departments</SubmitButton>
              </ActionForm>
            )}
          </section>

          {/* What they approve in this show */}
          {event && (
            <section aria-label={`Approver in ${event.name} for ${u.full_name}`} className="min-w-0">
              <h3 className={h3}>Approver in {event.name}</h3>
              {!canSignOff ? (
                // Stays mounted once the stages are cleared, so its message stays on screen (keyed apart from the approver form)
                <ActionForm key="user" action={saveApprovals}>
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="event_id" value={event.id} />
                  <p className={help}>Users can’t sign off. Give {first} Manager access to make them an approver.</p>
                  {approves.length > 0 && (
                    <>
                      <p className="mt-2 mb-2 text-[13.5px] font-semibold text-red-700">Still named as approver for {listText(approves.map((s) => s.name))}.</p>
                      <SubmitButton variant="secondary" small pendingText="Removing…">Take {first} off {approves.length === 1 ? 'that stage' : 'those stages'}</SubmitButton>
                    </>
                  )}
                </ActionForm>
              ) : stages.length === 0 ? (
                <p className={help}>This show has no stages with a named approver. Add them in <Link href="/settings/stages" className="font-semibold text-ink underline">Show setup › Sign-off stages</Link>.</p>
              ) : (
                <ActionForm key="approver" action={saveApprovals} className="space-y-2">
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="event_id" value={event.id} />
                  <ul className="space-y-1">
                    {stages.map((s) => {
                      const mine = s.approver_ids.includes(u.id);
                      const others = s.approver_ids.filter((id) => id !== u.id).map((id) => names.get(id) ?? 'someone');
                      return (
                        <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                          <label className="flex items-center gap-2 text-[14.5px] text-ink">
                            {/* Keyed by the saved state so the box follows changes made elsewhere */}
                            <input key={String(mine)} type="checkbox" name="stage_ids" value={s.id} defaultChecked={mine} className={check} />
                            {s.name}
                          </label>
                          <span className="text-[12.5px] text-muted">{others.length ? `alongside ${others.join(', ')}` : mine ? '' : 'No approver yet'}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <SubmitButton variant="secondary" small>Save approvals</SubmitButton>
                </ActionForm>
              )}
              {manages.length > 0 && (
                <p className={`${help} mt-2`}>
                  {first} also signs off for {listText(manages.map((s) => s.name))} as account manager. A super admin chooses account managers.
                </p>
              )}
            </section>
          )}

          {/* Access level */}
          <section aria-label={`Access level for ${u.full_name}`} className="min-w-0">
            <h3 className={h3}>Access level</h3>
            {accessBlocked ? <p className={help}>{accessBlocked}</p> : (
              <ActionForm action={changeAccess} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="user_id" value={u.id} />
                <div className="min-w-[200px] flex-1">
                  <label htmlFor={`ta-${u.id}`} className="sr-only">Access level</label>
                  <select key={u.role} id={`ta-${u.id}`} name="role" defaultValue={u.role} className={inputCls}>
                    {levels.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </div>
                <SubmitButton variant="dark" small>Save access</SubmitButton>
              </ActionForm>
            )}
            <p className={`${help} mt-1.5`}>{accessLevel(u.role).summary}</p>
          </section>

          {/* An invite nobody has used yet */}
          {pending && (
            <section aria-label={`Invite for ${u.full_name}`} className="min-w-0">
              <h3 className={h3}>Invite</h3>
              <p className="text-[14px] text-ink-2">
                {!u.temp_password_expires_at ? `${first} hasn’t signed in yet.`
                  : new Date(u.temp_password_expires_at) < new Date()
                    ? <span className="font-semibold text-red-700">{first}’s invite expired on {fmtDateTime(u.temp_password_expires_at)}. Make a new one to send them.</span>
                    : `${first} hasn’t signed in yet. Their invite works until ${fmtDateTime(u.temp_password_expires_at)}.`}
              </p>
              {inviteAllowed ? (
                <div className="mt-3 space-y-3">
                  <DetailsForm action={sendNewPassword}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <SubmitButton variant="secondary" small pendingText="Working…">New invite</SubmitButton>
                      <span className={help}>Gives you a new invite email with a new temporary password. The old one stops working.</span>
                    </div>
                  </DetailsForm>
                  <ActionForm action={cancelInvite} confirm={`Cancel the invite for ${u.full_name}? Their account will be removed.`}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <SubmitButton variant="danger" small pendingText="Cancelling…">Cancel invite</SubmitButton>
                      <span className={help}>Removes the account. You can add them again later.</span>
                    </div>
                  </ActionForm>
                </div>
              ) : !isMe && (
                <p className={`${help} mt-1.5`}>{me.demo ? 'The demo login can’t make invites.' : 'Only a super admin can change a super admin’s invite.'}</p>
              )}
            </section>
          )}

          {me.superAdmin && (
            <p className="text-[13.5px] text-ink-2 lg:col-span-2">
              Sign-in, passwords and details are in{' '}
              <Link href={`/admin?person=${u.id}#person-${u.id}`} className="font-semibold text-ink underline underline-offset-2">Admin › People</Link>.
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
