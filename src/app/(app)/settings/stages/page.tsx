import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/session';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Field, inputCls, Panel } from '@/components/ui';
import { NoEvent } from '@/components/no-event';
import { addStage, moveStage, removeStage, saveStage } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'Sign-off stages' };

export default async function StagesPage() {
  await requireAdminPage();
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const bundle = await loadBundle(event.id);
  if (!bundle) return <NoEvent />;
  const people = bundle.users.filter((u) => u.active && u.role !== 'viewer');
  const check = 'h-4 w-4 accent-[#13233b]';

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-[14.5px] text-ink-2">
        Every line goes through these stages in order for {event.name}. A stage opens only once the one before it has approved the
        current artwork, and any new artwork version starts again from the first stage.
      </p>
      {bundle.stages.map((s, i) => (
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
          <ActionForm action={saveStage} className="space-y-3">
            <input type="hidden" name="stage_id" value={s.id} />
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Stage name" htmlFor={`n-${s.id}`}><input id={`n-${s.id}`} name="name" required defaultValue={s.name} className={inputCls} /></Field>
              <Field label="Approver" htmlFor={`a-${s.id}`} help={s.uses_account_manager ? 'Ignored: each sponsor’s account manager approves.' : undefined}>
                <select id={`a-${s.id}`} name="approver_id" defaultValue={s.approver_id ?? ''} className={inputCls}>
                  <option value="">Not set</option>
                  {people.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </Field>
              <div>
                <span className="mb-1 block text-[13.5px] font-semibold text-ink-2">Used for</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[14px]">
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="applies_os" defaultChecked={s.applies_os} className={check} /> Organiser signage</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="applies_ss" defaultChecked={s.applies_ss} className={check} /> Sponsor signage</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="applies_si" defaultChecked={s.applies_si} className={check} /> Sponsor items</label>
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="uses_account_manager" defaultChecked={s.uses_account_manager} className={check} />
              The sponsor’s account manager approves this stage (and can send the sponsor an approval link)
            </label>
            <SubmitButton variant="dark" small>Save stage</SubmitButton>
          </ActionForm>
        </Panel>
      ))}
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
