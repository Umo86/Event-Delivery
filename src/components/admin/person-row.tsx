import { ChevronRight } from 'lucide-react';
import { fmtDateTime } from '@/lib/dates';
import { ACCESS_LEVELS, accessLevel, personStatus, ROLE_TONE, STATUS_INFO } from '@/lib/domain/access';
import type { DepartmentRow, Role, SponsorRow, StageRow } from '@/lib/domain/types';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, inputCls } from '@/components/ui';
import { DetailsSection, SignInSection } from '@/components/people/account-sections';
import {
  changeAccess, saveSignoffDuties,
} from '@/app/actions/admin';
import { setPersonDepartments } from '@/app/actions/departments';

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

const h3 = 'mb-2 text-[15px] font-semibold text-ink';
const help = 'text-[13px] text-muted';

export function PersonRow({ u, me, meSuper, meDemo, event, stages, sponsors, names, departments, deptIds, open }: {
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
  departments: DepartmentRow[];
  deptIds: string[];
  open?: boolean;
}) {
  const isMe = u.id === me;
  const viewer = { id: me, superAdmin: meSuper, demo: meDemo };
  // Super admins can only be changed by other super admins, and never by the demo login
  const protectedSuper = u.is_super_admin && !isMe && (!meSuper || meDemo);
  const status = personStatus(u);
  const info = STATUS_INFO[status];
  const locked = !!u.locked_until && new Date(u.locked_until) > new Date();
  const myStages = stages.filter((s) => s.approver_ids.includes(u.id));
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
          {u.is_demo && <Chip tone="yellow">Demo login</Chip>}
          {status !== 'active' && <Chip tone={info.tone}>{info.label}</Chip>}
          {locked && <Chip tone="red">Locked out</Chip>}
          <span className="min-w-0 break-all text-[14px] text-muted">{u.email}{u.job_title ? `, ${u.job_title}` : ''}</span>
          <span className="ml-auto text-[13px] text-muted">{right}</span>
        </summary>

        <div className="grid gap-x-8 gap-y-6 border-t border-line bg-paper/50 px-4 py-4 lg:grid-cols-2">
          <SignInSection u={u} viewer={viewer} />

          {/* Access level */}
          <section aria-label={`Access level for ${u.full_name}`} className="min-w-0">
            <h3 className={h3}>Access level</h3>
            {isMe || protectedSuper ? (
              <p className={help}>
                {isMe ? 'You can’t change your own access level. Another super admin would need to.'
                  : 'Only another super admin can change a super admin’s access.'}
              </p>
            ) : (
              <ActionForm action={changeAccess} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="user_id" value={u.id} />
                <div className="min-w-[200px] flex-1">
                  <label htmlFor={`ar-${u.id}`} className="sr-only">Access level</label>
                  <select key={u.role} id={`ar-${u.id}`} name="role" defaultValue={u.role} className={inputCls}>
                    {ACCESS_LEVELS.filter((a) => !u.is_demo || a.key !== 'super_admin').map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </div>
                <SubmitButton variant="dark" small>Save access</SubmitButton>
              </ActionForm>
            )}
            <p className={`${help} mt-1.5`}>{accessLevel(u.role).summary}</p>
          </section>

          {/* Departments */}
          <section aria-label={`Departments for ${u.full_name}`} className="min-w-0">
            <h3 className={h3}>Departments</h3>
            {departments.length === 0 ? (
              <p className={help}>No departments yet. Add them in Show setup › Departments.</p>
            ) : (
              <ActionForm action={setPersonDepartments} className="space-y-2">
                <input type="hidden" name="user_id" value={u.id} />
                <ul className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                  {departments.map((d) => (
                    <li key={d.id}>
                      <label className="flex items-center gap-2 text-[14.5px] text-ink">
                        <input type="checkbox" name="department_ids" value={d.id} defaultChecked={deptIds.includes(d.id)} className="h-4 w-4 accent-[#13233b]" />
                        {d.name}
                      </label>
                    </li>
                  ))}
                </ul>
                <SubmitButton variant="secondary" small>Save departments</SubmitButton>
              </ActionForm>
            )}
          </section>

          {/* Sign-off */}
          {event && (
            <section aria-label={`Sign-off for ${u.full_name}`} className="min-w-0">
              <h3 className={h3}>Signs off in {event.name}</h3>
              {!u.active || u.role === 'user' ? (
                <>
                  <p className={help}>
                    {!u.active ? 'Reactivate them to change what they sign off.' : 'Users can’t sign off. Give them Manager access to choose their stages and sponsors.'}
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
                          <DutyOption key={s.id} uid={u.id} name="stage_ids" value={s.id} label={s.name} checked={s.approver_ids.includes(u.id)}
                            hint={otherNames(s.approver_ids, u.id, names)} none="No approver yet" />
                        ))}
                      </ul>
                    )}
                  </fieldset>
                  <fieldset>
                    <legend className="mb-1 text-[13.5px] font-semibold text-ink-2">Account manager for these sponsors</legend>
                    {sponsors.length === 0 ? <p className={help}>No sponsors in this show yet.</p> : (
                      <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                        {sponsors.map((s) => (
                          <DutyOption key={s.id} uid={u.id} name="sponsor_ids" value={s.id} label={s.name} checked={s.account_manager_id === u.id}
                            hint={s.account_manager_id && s.account_manager_id !== u.id ? `now ${names.get(s.account_manager_id) ?? 'someone else'}` : null}
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

          <DetailsSection u={u} viewer={viewer} />
        </div>
      </details>
    </li>
  );
}

/** Names of the other approvers already on a stage, for the hint. */
function otherNames(ids: string[], selfId: string, names: Map<string, string>): string | null {
  const others = ids.filter((id) => id !== selfId).map((id) => names.get(id) ?? 'someone');
  return others.length ? `also ${others.join(', ')}` : null;
}

function DutyOption({ uid, name, value, label, checked, hint, none }: {
  uid: string; name: string; value: string; label: string; checked: boolean; hint: string | null; none: string;
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
        {hint ?? (checked ? '' : none)}
      </span>
    </li>
  );
}
