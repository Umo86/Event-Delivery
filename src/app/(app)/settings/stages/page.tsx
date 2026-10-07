import type { Metadata } from 'next';
import Link from 'next/link';
import { requireManager } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Field, inputCls, Intro, Panel } from '@/components/ui';
import { NoEvent } from '@/components/no-event';
import { addStage, moveStage, removeStage, saveStage } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'Sign-off stages' };

export default async function StagesPage() {
  await requireManager();
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const bundle = await loadBundle(event.id);
  if (!bundle) return <NoEvent />;
  const people = bundle.users.filter((u) => u.active && u.role !== 'user');
  const sql = await db();
  const memberships = await sql<{ user_id: string; department_id: string }[]>`select user_id, department_id from user_departments`;
  const inDept = new Map<string, Set<string>>();
  for (const m of memberships) (inDept.get(m.department_id) ?? inDept.set(m.department_id, new Set()).get(m.department_id)!).add(m.user_id);
  const check = 'h-4 w-4 accent-[#13233b]';

  return (
    <div className="space-y-4">
      <Intro>
        Every line in {event.name} goes through these stages in order. A stage opens once the one before it approves, and new
        artwork starts again from the first stage. Any one of a stage’s approvers can sign it off; choose them from{' '}
        <Link href="/settings/departments" className="font-semibold text-ink underline underline-offset-2">Departments</Link>.
      </Intro>
      {bundle.stages.map((s, i) => {
        const deptMembers = s.department_id ? inDept.get(s.department_id) ?? new Set<string>() : new Set<string>();
        // People in this stage's department first, then everyone else
        const ordered = [...people].sort((a, b) => (deptMembers.has(b.id) ? 1 : 0) - (deptMembers.has(a.id) ? 1 : 0));
        return (
          <Panel key={s.id} title={<span className="flex items-center gap-2"><span className="plate flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[14px] text-white">{i + 1}</span>{s.name}</span>}
            actions={
              <div className="flex items-center gap-1">
                {i > 0 && (
                  <ActionForm action={moveStage}><input type="hidden" name="stage_id" value={s.id} /><input type="hidden" name="dir" value="up" />
                    <SubmitButton variant="ghost" small pendingText="…">Move up</SubmitButton></ActionForm>
                )}
                {i < bundle.stages.length - 1 && (
                  <ActionForm action={moveStage}><input type="hidden" name="stage_id" value={s.id} /><input type="hidden" name="dir" value="down" />
                    <SubmitButton variant="ghost" small pendingText="…">Move down</SubmitButton></ActionForm>
                )}
                <ActionForm action={removeStage} confirm={`Remove the ${s.name} stage? Lines will no longer need it.`}>
                  <input type="hidden" name="stage_id" value={s.id} />
                  <SubmitButton variant="ghost" small pendingText="…">Remove</SubmitButton>
                </ActionForm>
              </div>
            }>
            <ActionForm action={saveStage} className="space-y-4">
              <input type="hidden" name="stage_id" value={s.id} />
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Stage name" htmlFor={`n-${s.id}`}><input id={`n-${s.id}`} name="name" required defaultValue={s.name} className={inputCls} /></Field>
                <Field label="Department" htmlFor={`d-${s.id}`} help={s.uses_account_manager ? 'Ignored: the sponsor’s account manager approves.' : 'Approvers are chosen from this department.'}>
                  <select id={`d-${s.id}`} name="department_id" defaultValue={s.department_id ?? ''} className={inputCls}>
                    <option value="">No department</option>
                    {bundle.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <div>
                  <span className="mb-1 block text-[13.5px] font-semibold text-ink-2">Used for</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[14px]">
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="applies_os" defaultChecked={s.applies_os} className={check} /> Organiser signage</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="applies_ss" defaultChecked={s.applies_ss} className={check} /> Sponsor signage</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" name="applies_si" defaultChecked={s.applies_si} className={check} /> Sponsorship items</label>
                  </div>
                </div>
              </div>

              {!s.uses_account_manager && (
                <fieldset>
                  <legend className="mb-1 text-[13.5px] font-semibold text-ink-2">Approvers (any one can sign off)</legend>
                  {ordered.length === 0 ? <p className="text-[13px] text-muted">Nobody to choose yet. Add people on the <Link href="/team" className="font-semibold text-ink underline">Team</Link> page.</p> : (
                    <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                      {ordered.map((u) => (
                        <li key={u.id}>
                          <label className="flex items-center gap-2 text-[14.5px] text-ink">
                            <input type="checkbox" name="approver_ids" value={u.id} defaultChecked={s.approver_ids.includes(u.id)} className={check} />
                            {u.full_name}
                            {deptMembers.has(u.id) && <span className="rounded-full bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-800 ring-1 ring-inset ring-blue-200">in dept</span>}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </fieldset>
              )}

              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" name="uses_account_manager" defaultChecked={s.uses_account_manager} className={check} />
                The sponsor’s account manager approves this stage (and can send the sponsor an approval link)
              </label>
              <SubmitButton variant="dark" small>Save stage</SubmitButton>
            </ActionForm>
          </Panel>
        );
      })}
      <Panel title="Add a stage">
        <ActionForm action={addStage} resetOnSuccess className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="event_id" value={event.id} />
          <Field label="Stage name" htmlFor="new-stage" className="min-w-[240px]"><input id="new-stage" name="name" required placeholder="e.g. Health and safety" className={inputCls} /></Field>
          <SubmitButton variant="secondary">Add stage</SubmitButton>
        </ActionForm>
      </Panel>
    </div>
  );
}
