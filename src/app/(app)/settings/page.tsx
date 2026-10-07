import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { requireManager } from '@/lib/auth/session';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { VENUES } from '@/lib/domain/labels';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Field, Intro, inputCls, Notice, Panel, cx } from '@/components/ui';
import { NoEvent } from '@/components/no-event';
import { updateEvent } from '@/app/actions/settings';
import { setEventDepartments } from '@/app/actions/departments';

export const metadata: Metadata = { title: 'Show setup' };

export default async function EventSettingsPage(props: { searchParams: Promise<{ welcome?: string; created?: string }> }) {
  const user = await requireManager();
  const sp = await props.searchParams;
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const bundle = await loadBundle(event.id);
  if (!bundle) return <NoEvent />;
  const people = bundle.users.filter((u) => u.active && u.role !== 'user');
  const e = event;
  const isSuper = user.role === 'super_admin';

  // Steps a manager can't do themselves say who does them instead of linking to a page they can't open.
  const steps: { done: boolean; text: string; href: string | null }[] = [
    { done: bundle.users.length > 1, text: isSuper ? 'Invite your team' : 'Invite your team (a super admin does this)', href: isSuper ? '/admin' : null },
    { done: bundle.stages.every((s) => s.uses_account_manager || s.approver_ids.length > 0), text: 'Choose an approver for each sign-off stage', href: '/settings/stages' },
    { done: !!(e.studio_owner_id && e.production_owner_id), text: 'Choose who handles in-house artwork and production (below)', href: '#owners' },
    { done: bundle.sponsors.length > 0, text: isSuper ? 'Add sponsors and their account managers' : 'Add sponsors', href: '/sponsors' },
    { done: bundle.suppliers.length > 0, text: 'Add your suppliers', href: '/suppliers' },
  ];
  const showSteps = !!sp.welcome || steps.some((s) => !s.done);

  const date = (name: keyof typeof e, label: string) => (
    <Field label={label} htmlFor={name}>
      <input id={name} name={name} type="date" defaultValue={(e[name] as string | null) ?? ''} className={inputCls} />
    </Field>
  );

  return (
    <div className="space-y-6">
      <Intro>Name, venue, dates and deadlines for {e.name}. To set up a different show, switch to it from the menu.</Intro>
      {sp.created && <Notice tone="ok">Show created. Check its dates and deadlines below.</Notice>}
      {showSteps && (
        <Panel title={sp.welcome ? 'Welcome. Here’s how to get set up' : 'Still to set up'}>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.text} className="flex items-center gap-3 text-[15px]">
                <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                  s.done ? 'bg-green-600 text-white' : 'bg-signal text-ink')}>
                  {s.done ? <Check size={14} strokeWidth={3} aria-label="Done" /> : i + 1}
                </span>
                {s.href
                  ? <Link href={s.href} className={cx('font-semibold underline-offset-2 hover:underline', s.done ? 'text-muted line-through' : 'text-ink')}>{s.text}</Link>
                  : <span className={cx('font-semibold', s.done ? 'text-muted line-through' : 'text-ink-2')}>{s.text}</span>}
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <ActionForm action={updateEvent} className="space-y-6">
        <input type="hidden" name="event_id" value={e.id} />
        <Panel title="Show details">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Show name" htmlFor="name"><input id="name" name="name" required defaultValue={e.name} className={inputCls} /></Field>
            <Field label="Venue" htmlFor="venue" help="Sets which hall list appears.">
              <select id="venue" name="venue" defaultValue={e.venue} className={inputCls}>
                {VENUES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Budget for signage and items (£)" htmlFor="budget">
              <input id="budget" name="budget" inputMode="decimal" defaultValue={e.budget ?? ''} className={inputCls} />
            </Field>
            {date('build_start', 'Build-up starts')}
            {date('show_open', 'Opening day')}
            {date('show_close', 'Closing day')}
            {date('breakdown_end', 'Breakdown ends')}
            <Field label="“Due soon” warning (days)" htmlFor="warn_days" help="Lines are flagged this many days before a deadline.">
              <input id="warn_days" name="warn_days" type="number" min={0} max={365} defaultValue={e.warn_days} className={inputCls} />
            </Field>
            <Field label="Sign-off target (days)" htmlFor="turnaround_days" help="Waiting longer than this is flagged as slow.">
              <input id="turnaround_days" name="turnaround_days" type="number" min={0} max={365} defaultValue={e.turnaround_days} className={inputCls} />
            </Field>
          </div>
        </Panel>

        <Panel title="Who handles artwork and production" id="owners">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="In-house artwork" htmlFor="studio_owner_id" help="Gets lines whose artwork comes from your own design team.">
              <select id="studio_owner_id" name="studio_owner_id" defaultValue={e.studio_owner_id ?? ''} className={inputCls}>
                <option value="">Not assigned</option>
                {people.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
            <Field label="Print and production" htmlFor="production_owner_id" help="Gets approved lines to order, chase and deliver, and supplier artwork.">
              <select id="production_owner_id" name="production_owner_id" defaultValue={e.production_owner_id ?? ''} className={inputCls}>
                <option value="">Not assigned</option>
                {people.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="Default deadlines" actions={<SubmitButton name="suggest" value="1" variant="secondary" small>Suggest from opening day</SubmitButton>}>
          <p className="mb-4 text-[14px] text-muted">Used when a line has no date of its own. Suggestions count back from the opening day: artwork 6, 8 and 10 weeks before; print 3 weeks; items ordered 8 weeks before.</p>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] text-[14px]">
              <thead>
                <tr className="text-left text-[13px] text-muted">
                  <th className="pb-2 font-semibold">List</th><th className="pb-2 font-semibold">Artwork due</th><th className="pb-2 font-semibold">Print / order deadline</th>
                </tr>
              </thead>
              <tbody>
                {([['os', 'Organiser signage'], ['ss', 'Sponsor signage'], ['si', 'Sponsorship items']] as const).map(([k, label]) => (
                  <tr key={k}>
                    <td className="py-1.5 pr-3 font-semibold text-ink">{label}</td>
                    {/* Keyed by the saved date so "Suggest" replaces what's shown */}
                    <td className="py-1.5 pr-3"><input key={e[`art_due_${k}`] ?? ''} aria-label={`${label} artwork due`} type="date" name={`art_due_${k}`} defaultValue={e[`art_due_${k}`] ?? ''} className={inputCls} /></td>
                    <td className="py-1.5"><input key={e[`print_due_${k}`] ?? ''} aria-label={`${label} print deadline`} type="date" name={`print_due_${k}`} defaultValue={e[`print_due_${k}`] ?? ''} className={inputCls} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <SubmitButton>Save show details</SubmitButton>
      </ActionForm>

      <Panel title="Departments involved">
        <p className="mb-3 text-[14px] text-muted">
          Which teams are working on {e.name}. This is who the show involves; set up the teams and their people in{' '}
          <Link href="/settings/departments" className="font-semibold text-ink underline underline-offset-2">Departments</Link>.
        </p>
        {bundle.departments.length === 0 ? (
          <p className="text-[14px] text-muted">No departments yet. Add them in Show setup › Departments.</p>
        ) : (
          <ActionForm action={setEventDepartments} className="space-y-3">
            <input type="hidden" name="event_id" value={e.id} />
            <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {bundle.departments.map((d) => (
                <li key={d.id}>
                  <label className="flex items-center gap-2 text-[14.5px] text-ink">
                    <input type="checkbox" name="department_ids" value={d.id} defaultChecked={bundle.eventDepartmentIds.includes(d.id)} className="h-4 w-4 accent-[#13233b]" />
                    {d.name}
                  </label>
                </li>
              ))}
            </ul>
            <SubmitButton variant="dark" small>Save departments</SubmitButton>
          </ActionForm>
        )}
      </Panel>
    </div>
  );
}
