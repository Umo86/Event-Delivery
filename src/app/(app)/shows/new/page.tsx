import type { Metadata } from 'next';
import Link from 'next/link';
import { requireManager } from '@/lib/auth/session';
import { getCurrentEvent, listEvents } from '@/lib/data/load';
import { VENUES } from '@/lib/domain/labels';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Field, inputCls, PageHeader, Panel } from '@/components/ui';
import { createEvent } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'New show' };

export default async function NewShowPage() {
  await requireManager();
  const [events, current] = await Promise.all([listEvents(), getCurrentEvent()]);
  return (
    <>
      <PageHeader title="New show" subtitle="Name it and set its dates. Everything can be changed later in Show setup." />
      <Panel>
        <ActionForm action={createEvent} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Show name" htmlFor="ne-name"><input id="ne-name" name="name" required placeholder="UKCW Birmingham 2027" className={inputCls} /></Field>
            <Field label="Venue" htmlFor="ne-venue" help="Sets which hall list appears.">
              <select id="ne-venue" name="venue" defaultValue="NEC Birmingham" className={inputCls}>{VENUES.map((v) => <option key={v}>{v}</option>)}</select>
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-[13.5px] font-semibold text-ink-2">Dates</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Build-up starts" htmlFor="ne-build"><input id="ne-build" name="build_start" type="date" className={inputCls} /></Field>
              <Field label="Opening day" htmlFor="ne-open"><input id="ne-open" name="show_open" type="date" className={inputCls} /></Field>
              <Field label="Closing day" htmlFor="ne-close"><input id="ne-close" name="show_close" type="date" className={inputCls} /></Field>
              <Field label="Breakdown ends" htmlFor="ne-breakdown"><input id="ne-breakdown" name="breakdown_end" type="date" className={inputCls} /></Field>
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Copy sign-off stages, approvers, budget and owners from" htmlFor="ne-copy">
              <select id="ne-copy" name="copy_from" defaultValue={current?.id ?? ''} className={inputCls}>
                <option value="">Nothing: start with the default stages</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-[14px] sm:pt-6">
              <input type="checkbox" name="copy_sponsors" className="h-4 w-4 accent-[#13233b]" /> Also copy the sponsor list
            </label>
          </div>
          <p className="text-[13.5px] text-muted">Artwork and print deadlines are suggested from the opening day; you can change them after. Lines aren’t copied.</p>
          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton pendingText="Creating…">Create show</SubmitButton>
            <Link href="/shows" className="text-[14px] font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">Cancel</Link>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}
