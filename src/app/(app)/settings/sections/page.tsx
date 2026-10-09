import type { Metadata } from 'next';
import Link from 'next/link';
import { requireManager } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentEvent, loadBundle } from '@/lib/data/load';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, Field, inputCls, Intro, money, Panel } from '@/components/ui';
import { NoEvent } from '@/components/no-event';
import { addSection, moveSection, removeSection, renameSection } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'Sections' };

/** The groups on the signage sheet for the show you're working in, in the order they appear. */
export default async function SectionsPage() {
  await requireManager();
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const bundle = await loadBundle(event.id);
  if (!bundle) return <NoEvent />;
  const sql = await db();
  const stats = await sql<{ section_id: string | null; n: number; cost: number }[]>`
    select section_id, count(*)::int as n, coalesce(sum(coalesce(unit_cost, 0) * greatest(coalesce(qty, 0), 1)), 0) as cost
    from items where event_id = ${event.id} and not cancelled group by section_id`;
  const byId = new Map(stats.map((s) => [s.section_id, s]));
  const loose = byId.get(null);

  return (
    <>
      <Intro>
        The sections lines are grouped under on the sheet for {event.name}, like F1 UKCW Main Stage or Hall 4 – Main Bar Branding.
        New ones can also be typed in when adding a line. Removing a section keeps its lines.
      </Intro>
      <div className="space-y-6">
        <Panel title="Add a section">
          <ActionForm action={addSection} resetOnSuccess className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="event_id" value={event.id} />
            <Field label="Section name" htmlFor="ns-name" className="min-w-[280px]">
              <input id="ns-name" name="name" required maxLength={80} placeholder="e.g. F1 UKCW Main Stage" className={inputCls} />
            </Field>
            <SubmitButton variant="secondary">Add section</SubmitButton>
          </ActionForm>
        </Panel>

        <Panel title={`Sections (${bundle.sections.length})`} padded={false}>
          {bundle.sections.length === 0 ? (
            <p className="p-4 text-[14.5px] text-muted">No sections yet. Add one above, or type one in when you add a line.</p>
          ) : (
            <ol>
              {bundle.sections.map((s, i) => {
                const st = byId.get(s.id);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5 last:border-0">
                    <span className="plate flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] text-white">{i + 1}</span>
                    <ActionForm action={renameSection} className="flex min-w-[260px] flex-1 items-center gap-2">
                      <input type="hidden" name="section_id" value={s.id} />
                      <label htmlFor={`sn-${s.id}`} className="sr-only">Name</label>
                      <input id={`sn-${s.id}`} name="name" required maxLength={80} defaultValue={s.name} className={inputCls} />
                      <SubmitButton variant="ghost" small>Rename</SubmitButton>
                    </ActionForm>
                    <span className="flex items-center gap-2 text-[13px] text-ink-2">
                      <Chip tone="grey">{st?.n ?? 0} line{st?.n === 1 ? '' : 's'}</Chip>
                      {st && st.cost > 0 && <span>{money(st.cost, 2)}</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      {i > 0 && <ActionForm action={moveSection}><input type="hidden" name="section_id" value={s.id} /><input type="hidden" name="dir" value="up" /><SubmitButton variant="ghost" small pendingText="…">Move up</SubmitButton></ActionForm>}
                      {i < bundle.sections.length - 1 && <ActionForm action={moveSection}><input type="hidden" name="section_id" value={s.id} /><input type="hidden" name="dir" value="down" /><SubmitButton variant="ghost" small pendingText="…">Move down</SubmitButton></ActionForm>}
                      <ActionForm action={removeSection} confirm={`Remove the section ${s.name}? Its lines stay, under “No section”.`}>
                        <input type="hidden" name="section_id" value={s.id} />
                        <SubmitButton variant="ghost" small pendingText="…">Remove</SubmitButton>
                      </ActionForm>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {loose && (
            <p className="border-t border-line px-4 py-2.5 text-[13.5px] text-muted">
              {loose.n} line{loose.n === 1 ? ' has' : 's have'} no section.{' '}
              <Link href="/schedule/all?section=none&view=sheet" className="font-semibold text-ink underline underline-offset-2">See them</Link>
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
