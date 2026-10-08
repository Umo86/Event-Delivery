import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { accessLevel, levelsFor, personStatus, ROLE_TONE, STATUS_INFO } from '@/lib/domain/access';
import type { DepartmentRow, SponsorRow, StageRow } from '@/lib/domain/types';
import { listText } from '@/lib/text';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, cx, inputCls } from '@/components/ui';
import { DetailsSection, SignInSection, type AccountPerson, type Viewer } from '@/components/people/account-sections';
import { changeAccess, saveApprovals } from '@/app/actions/admin';
import { setPersonDepartments } from '@/app/actions/departments';

export type TeamPerson = AccountPerson;
export type TeamViewer = Viewer;

const h3 = 'mb-2 text-[15px] font-semibold text-ink';
const help = 'text-[13px] text-muted';
const check = 'h-4 w-4 shrink-0 accent-[#13233b]';

export const memberHref = (id: string) => `/team?person=${id}#member-${id}`;

/** One person on Show › Team: what they're in and approve at a glance, and the forms to change it. */
export function TeamRow({ u, me, event, stages, sponsors, departments, deptIds, names, open, firstDeactivated }: {
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
  /** Starts the deactivated part of the list. */
  firstDeactivated?: boolean;
}) {
  const isMe = u.id === me.id;
  const first = u.full_name.trim().split(/\s+/)[0];
  const status = personStatus(u);
  const info = STATUS_INFO[status];
  const inDepts = departments.filter((d) => deptIds.includes(d.id));
  const approves = stages.filter((s) => s.approver_ids.includes(u.id));
  const manages = sponsors.filter((s) => s.account_manager_id === u.id);
  const canSignOff = u.role !== 'user';
  const locked = !!u.locked_until && new Date(u.locked_until) > new Date();

  // Mirrors the server: super admins and the demo login are only changed by super admins, and the demo login changes nobody
  const accessBlocked = isMe ? `You can’t change your own access level. Ask ${me.superAdmin ? 'another' : 'a'} super admin.`
    : me.demo ? 'The demo login can’t change anyone’s access.'
      : u.role === 'super_admin' && !me.superAdmin ? 'Only a super admin can change a super admin’s access.'
        : u.is_demo && !me.superAdmin ? 'Only a super admin can change the demo login’s access.'
          : null;
  const levels = levelsFor(me.superAdmin).filter((a) => !u.is_demo || a.key !== 'super_admin');

  return (
    <li id={`member-${u.id}`} className="scroll-mt-4 border-b border-line last:border-0">
      {firstDeactivated && (
        <p className="border-b border-line bg-paper px-4 py-2 text-[13px] font-semibold text-ink-2">Deactivated: they can’t sign in until they’re reactivated</p>
      )}
      <details className={cx('group', !u.active && 'bg-paper/60')} open={open}>
        <summary className="grid cursor-pointer list-none grid-cols-[16px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 hover:bg-paper lg:grid-cols-[16px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)] [&::-webkit-details-marker]:hidden">
          <ChevronRight size={16} aria-hidden className="mt-1 text-muted transition-transform group-open:rotate-90" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[16px] font-semibold text-ink">{u.full_name}{isMe ? ' (you)' : ''}</span>
              <Chip tone={ROLE_TONE[u.role]}>{accessLevel(u.role).label}</Chip>
              {u.is_demo && <Chip tone="yellow">Demo login</Chip>}
              {status !== 'active' && <Chip tone={info.tone}>{info.label}</Chip>}
              {locked && <Chip tone="red">Locked out</Chip>}
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
          {/* Who they are and what they do */}
          <div className="min-w-0 space-y-6">
            <DetailsSection u={u} viewer={me} />
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
          </div>
          {/* Their access: sign-in, password, deactivating, access level */}
          <div className="min-w-0 space-y-6">
            <SignInSection u={u} viewer={me} />
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
          </div>

          {me.superAdmin && (
            <p className="text-[13.5px] text-ink-2 lg:col-span-2">
              Account managers for sponsors and the access log are in{' '}
              <Link href={`/admin?person=${u.id}#person-${u.id}`} className="font-semibold text-ink underline underline-offset-2">Admin › People</Link>.
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
