import type { Metadata } from 'next';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { requireManager } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { levelsFor } from '@/lib/domain/access';
import { listText } from '@/lib/text';
import { ActionForm, SubmitButton } from '@/components/forms';
import { ButtonLink, cx, Field, inputCls, Notice, PageHeader, textareaCls } from '@/components/ui';
import { NoEvent } from '@/components/no-event';
import { InviteForm } from '@/components/team/invite-form';
import { ContinueButton, GoToStep, Reveal, SaveAndContinue, SetupGuide, StepForm, type GuideStep } from '@/components/setup/guide';
import { saveShowApprovers, saveShowOwners, saveSupplier } from '@/app/actions/settings';
import { setEventDepartments } from '@/app/actions/departments';
import { createSponsor } from '@/app/actions/sponsors';

export const metadata: Metadata = { title: 'Set up the show' };

const check = 'h-4 w-4 shrink-0 accent-[#13233b]';
const link = 'font-semibold text-ink underline underline-offset-2';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Ask({ children, tip }: { children: React.ReactNode; tip?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[15px] font-semibold text-ink">{children}</p>
      {tip && <p className="mt-0.5 flex gap-1.5 text-[13.5px] text-ink-2"><Info size={15} aria-hidden className="mt-[3px] shrink-0 text-muted" />{tip}</p>}
    </div>
  );
}

/**
 * Show › Set up: the steps after creating a show, for the show you're working in. Each step is done when the
 * show has what it needs (often copied from a past show), so the guide opens on the first thing still to do.
 */
export default async function ShowSetupGuide(props: { searchParams: Promise<{ created?: string; copied?: string; step?: string }> }) {
  const me = await requireManager();
  const sp = await props.searchParams;
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const bundle = await loadBundle(event.id);
  if (!bundle) return <NoEvent />;
  const sql = await db();
  const memberships = await sql<{ user_id: string; department_id: string }[]>`select user_id, department_id from user_departments`;

  const active = bundle.users.filter((u) => u.active);
  const team = active.filter((u) => u.role !== 'user'); // can sign off and own work
  const name = (id: string | null) => (id ? bundle.users.find((u) => u.id === id)?.full_name ?? 'someone' : null);
  const inDept = new Map<string, Set<string>>();
  for (const m of memberships) (inDept.get(m.department_id) ?? inDept.set(m.department_id, new Set()).get(m.department_id)!).add(m.user_id);
  const involved = new Set(bundle.eventDepartmentIds);
  const stages = bundle.stages.filter((s) => !s.uses_account_manager);
  const amStage = bundle.stages.find((s) => s.uses_account_manager) ?? null;
  const canSign = (id: string) => team.some((u) => u.id === id);
  const gaps = stages.filter((s) => !s.approver_ids.some(canSign));
  const { sponsors, suppliers, departments } = bundle;
  const noAm = sponsors.filter((s) => !s.account_manager_id).length;

  const steps: GuideStep[] = [
    {
      key: 'team', title: 'Who’s working on it', done: involved.size > 0,
      summary: involved.size ? listText(departments.filter((d) => involved.has(d.id)).map((d) => d.name)) : 'No departments chosen yet',
    },
    {
      key: 'approvers', title: 'Who signs off', done: stages.length > 0 && gaps.length === 0,
      summary: !stages.length ? 'No stages with named approvers'
        : gaps.length ? `${listText(gaps.map((s) => s.name))} ${gaps.length === 1 ? 'has' : 'have'} no approver yet`
          : `Every stage has an approver (${plural(stages.length, 'stage')})`,
    },
    {
      key: 'owners', title: 'Artwork and production', done: !!(event.studio_owner_id && event.production_owner_id),
      summary: `Artwork: ${name(event.studio_owner_id) ?? 'not chosen'}. Production: ${name(event.production_owner_id) ?? 'not chosen'}.`,
    },
    {
      key: 'sponsors', title: 'Sponsors', done: sponsors.length > 0,
      summary: sponsors.length ? `${plural(sponsors.length, 'sponsor')}${noAm ? `, ${noAm} without an account manager` : ''}` : 'None yet',
    },
    {
      key: 'suppliers', title: 'Suppliers', done: suppliers.length > 0,
      summary: suppliers.length ? `${plural(suppliers.length, 'supplier')}: ${listText(suppliers.map((s) => s.name))}` : 'None yet',
    },
  ];
  const left = steps.filter((s) => !s.done);
  steps.push({ key: 'ready', title: 'Ready to go', done: left.length === 0, summary: left.length ? `${plural(left.length, 'step')} still to do` : 'Everything’s in place' });
  const start = steps.some((s) => s.key === sp.step) ? sp.step! : left[0]?.key ?? 'ready';

  const bodies: Record<string, React.ReactNode> = {
    team: (
      <>
        <Ask tip="Approvers and owners are chosen from these people in the next steps.">Tick the departments working on {event.name}.</Ask>
        {departments.length === 0 ? (
          <p className="text-[14px] text-ink-2">No departments yet. Add them in <Link href="/settings/departments" className={link}>Show setup › Departments</Link>, then come back.</p>
        ) : (
          <StepForm action={setEventDepartments} className="space-y-4">
            <input type="hidden" name="event_id" value={event.id} />
            <ul className="grid gap-3 sm:grid-cols-2">
              {departments.map((d) => {
                const members = active.filter((u) => inDept.get(d.id)?.has(u.id));
                return (
                  <li key={d.id} className="rounded-md border border-line bg-white p-3">
                    <label className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                      <input type="checkbox" name="department_ids" value={d.id} defaultChecked={involved.has(d.id)} className={check} />
                      {d.name}
                    </label>
                    <p className="mt-1 pl-6 text-[13px] text-ink-2">{members.length ? members.map((u) => u.full_name).join(', ') : 'Nobody in it yet'}</p>
                  </li>
                );
              })}
            </ul>
            <SaveAndContinue />
          </StepForm>
        )}
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-[14.5px] font-semibold text-ink">Someone missing?</p>
          {me.is_demo ? <p className="text-[13.5px] text-ink-2">The demo login can’t add people. Sign in with your own account to add someone.</p> : (
            <Reveal label="Add someone to the team">
              <InviteForm
                levels={levelsFor(me.is_super_admin).map(({ key, label, summary }) => ({ key, label, summary }))}
                departments={departments.map(({ id, name: n, external }) => ({ id, name: n, external }))}
                event={{ id: event.id, name: event.name }}
                stages={stages.map((s) => ({ id: s.id, name: s.name, approvers: s.approver_ids.map((id) => name(id) ?? 'someone') }))} />
            </Reveal>
          )}
          <p className="mt-2 text-[13px] text-muted">Everyone is on the <Link href="/team" className={link}>Team</Link> page, where you can change their details later.</p>
        </div>
      </>
    ),

    approvers: stages.length === 0 ? (
      <>
        <p className="mb-4 text-[14px] text-ink-2">This show has no stages with named approvers. Add them in <Link href="/settings/stages" className={link}>Show setup › Sign-off stages</Link>.</p>
        <ContinueButton />
      </>
    ) : (
      <>
        <Ask tip="Any one of a stage’s approvers can sign it off. People in the stage’s department come first.">
          Choose who approves each sign-off stage.
        </Ask>
        <StepForm action={saveShowApprovers} className="space-y-4">
          <input type="hidden" name="event_id" value={event.id} />
          {stages.map((s) => {
            const members = s.department_id ? inDept.get(s.department_id) ?? new Set<string>() : new Set<string>();
            const dept = departments.find((d) => d.id === s.department_id)?.name;
            const ordered = [...team].sort((a, b) => Number(members.has(b.id)) - Number(members.has(a.id)) || a.full_name.localeCompare(b.full_name));
            const cantSign = s.approver_ids.filter((id) => !canSign(id));
            return (
              <fieldset key={s.id} className="rounded-md border border-line bg-white px-3 pt-1 pb-3">
                <legend className="px-1 text-[15px] font-semibold text-ink">{s.name}{dept ? ` (${dept} department)` : ''}</legend>
                {ordered.length === 0 ? <p className="text-[13.5px] text-ink-2">Nobody to choose yet. Add someone in the first step.</p> : (
                  <ul className="grid gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {ordered.map((u) => (
                      <li key={u.id}>
                        <label className="flex items-center gap-2 text-[14.5px] text-ink">
                          <input type="checkbox" name={`approvers_${s.id}`} value={u.id} defaultChecked={s.approver_ids.includes(u.id)} className={check} />
                          {u.full_name}
                          {members.has(u.id) && <span className="rounded-full bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-800 ring-1 ring-inset ring-blue-200">in dept</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {cantSign.length > 0 && (
                  <p className="mt-2 text-[13px] font-semibold text-red-700">
                    {listText(cantSign.map((id) => name(id) ?? 'someone'))} can’t sign off any more (a User or deactivated), so they come off when you save.
                  </p>
                )}
              </fieldset>
            );
          })}
          {amStage && <p className="text-[13.5px] text-ink-2"><b className="text-ink">{amStage.name}:</b> each sponsor’s account manager signs this stage off. You’ll see them in the sponsors step.</p>}
          <SaveAndContinue />
        </StepForm>
      </>
    ),

    owners: (
      <>
        <Ask tip="Lines go to them on their own: in-house artwork to the first, approved lines to the second to order and deliver.">
          Choose who looks after in-house artwork, and who handles print and production.
        </Ask>
        <StepForm action={saveShowOwners} className="space-y-4">
          <input type="hidden" name="event_id" value={event.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="In-house artwork" htmlFor="gs-studio" help="Gets lines whose artwork comes from your own design team.">
              <select id="gs-studio" name="studio_owner_id" defaultValue={event.studio_owner_id ?? ''} className={inputCls}>
                <option value="">Not chosen yet</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
            <Field label="Print and production" htmlFor="gs-production" help="Gets approved lines to order, chase and deliver.">
              <select id="gs-production" name="production_owner_id" defaultValue={event.production_owner_id ?? ''} className={inputCls}>
                <option value="">Not chosen yet</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
          </div>
          <SaveAndContinue />
        </StepForm>
      </>
    ),

    sponsors: (
      <>
        <Ask tip={me.is_super_admin
          ? 'Each sponsor’s account manager signs off for them, and can send them a link to approve their own artwork.'
          : 'A super admin gives each sponsor an account manager, who signs off for them.'}>
          Add the sponsors for {event.name}. You can add more at any time from Sponsors.
        </Ask>
        {sponsors.length > 0 ? (
          <ul className="mb-4 divide-y divide-line rounded-md border border-line bg-white" aria-label="Sponsors so far">
            {sponsors.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-[14.5px]">
                <span className="font-semibold text-ink">{s.name}{s.package && <span className="font-normal text-muted">, {s.package}</span>}</span>
                <span className={cx('text-[13.5px]', s.account_manager_id ? 'text-ink-2' : 'text-muted')}>
                  {s.account_manager_id ? `Account manager: ${name(s.account_manager_id)}` : 'No account manager yet'}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="mb-4 text-[14px] text-ink-2">No sponsors yet.</p>}
        <ActionForm action={createSponsor} resetOnSuccess className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="event_id" value={event.id} />
          <Field label="Sponsor name" htmlFor="gs-sponsor" className="min-w-[220px] flex-1">
            <input id="gs-sponsor" name="name" required autoComplete="off" className={inputCls} />
          </Field>
          <Field label="Package (optional)" htmlFor="gs-package" className="min-w-[180px] flex-1">
            <input id="gs-package" name="package" placeholder="e.g. Headline partner" className={inputCls} />
          </Field>
          {me.is_super_admin && (
            <Field label="Account manager" htmlFor="gs-am" className="min-w-[180px] flex-1">
              <select id="gs-am" name="account_manager_id" defaultValue="" className={inputCls}>
                <option value="">Choose later</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
          )}
          <SubmitButton variant="secondary" pendingText="Adding…">Add sponsor</SubmitButton>
        </ActionForm>
        <div className="mt-5"><ContinueButton>{sponsors.length ? 'Continue' : 'Skip for now'}</ContinueButton></div>
      </>
    ),

    suppliers: (
      <>
        <Ask tip="Suppliers are shared by every show, so they may already be here.">Check the suppliers who print and make things, and add anyone new.</Ask>
        {suppliers.length > 0 ? (
          <ul className="mb-4 divide-y divide-line rounded-md border border-line bg-white" aria-label="Suppliers so far">
            {suppliers.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2 text-[14.5px]">
                <span className="font-semibold text-ink">{s.name}</span>
                <span className="text-[13.5px] text-ink-2">
                  Works on {listText([s.works_on_os && 'organiser signage', s.works_on_ss && 'sponsor signage', s.works_on_si && 'sponsorship items'].filter(Boolean) as string[])}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="mb-4 text-[14px] text-ink-2">No suppliers yet.</p>}
        <ActionForm action={saveSupplier} resetOnSuccess className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier name" htmlFor="gs-supplier"><input id="gs-supplier" name="name" required autoComplete="off" className={inputCls} /></Field>
            <Field label="Email (optional)" htmlFor="gs-supplier-email"><input id="gs-supplier-email" name="email" type="email" className={inputCls} /></Field>
          </div>
          <fieldset>
            <legend className="mb-1 text-[13.5px] font-semibold text-ink-2">Works on</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[14.5px]">
              <label className="flex items-center gap-2"><input type="checkbox" name="works_on_os" defaultChecked className={check} /> Organiser signage</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="works_on_ss" defaultChecked className={check} /> Sponsor signage</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="works_on_si" defaultChecked className={check} /> Sponsorship items</label>
            </div>
          </fieldset>
          <Field label="Scope of work (optional)" htmlFor="gs-scope" help="What they’ve agreed to do. Add the signed document on the Suppliers page.">
            <textarea id="gs-scope" name="scope_of_work" rows={2} className={textareaCls} />
          </Field>
          <SubmitButton variant="secondary" pendingText="Adding…">Add supplier</SubmitButton>
        </ActionForm>
        <div className="mt-5"><ContinueButton>{suppliers.length ? 'Continue' : 'Skip for now'}</ContinueButton></div>
      </>
    ),

    ready: (
      <>
        {left.length === 0 ? (
          <Ask>{event.name} is ready for signage. Add the first lines, or see how the show is doing.</Ask>
        ) : (
          <>
            <Ask>Nearly there. You can start adding lines now and finish these later:</Ask>
            <ul className="mb-4 space-y-1.5 text-[14.5px]">
              {left.map((s) => (
                <li key={s.key} className="flex flex-wrap gap-x-2">
                  <span className="font-semibold text-ink">{s.title}:</span>
                  <span className="text-ink-2">{s.summary}.</span>
                  <GoToStep step={s.key}>Do it now</GoToStep>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/schedule/os/new" variant="primary">Add organiser signage</ButtonLink>
          <ButtonLink href="/schedule/ss/new">Add sponsor signage</ButtonLink>
          <ButtonLink href="/schedule/si/new">Add a sponsorship item</ButtonLink>
          <ButtonLink href="/dashboard" variant="ghost">Go to the dashboard</ButtonLink>
        </div>
        <p className="mt-3 text-[13.5px] text-muted">
          Dates, budget and deadlines are in <Link href="/settings" className={link}>Show setup</Link>. You can come back to these steps from there.
        </p>
      </>
    ),
  };

  return (
    <>
      <PageHeader title={`Set up ${event.name}`}
        subtitle="Who’s working on it, who signs off, who handles artwork and production, then sponsors and suppliers." />
      {sp.created && (
        <div className="mb-5 max-w-[980px]">
          <Notice tone="ok">
            {event.name} is created.{' '}
            {left.length === 0
              ? `${sp.copied ? 'Everything came across from the show you started from, so it’s' : 'It’s'} ready to go. Check any step below if you like.`
              : `${left.length === 1 ? 'One thing is' : `${left.length} things are`} left to set up. Each step saves as you go.`}
          </Notice>
        </div>
      )}
      <div className="max-w-[980px]">
        <SetupGuide steps={steps} bodies={bodies} start={start} />
      </div>
    </>
  );
}
