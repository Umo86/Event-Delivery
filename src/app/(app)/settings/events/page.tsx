import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCurrentEvent, listEvents } from '@/lib/data/load';
import { fmtDate } from '@/lib/dates';
import { VENUES } from '@/lib/domain/labels';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Chip, Field, inputCls, Panel } from '@/components/ui';
import { createEvent, setEventArchived } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'Events' };

export default async function EventsPage() {
  await requireAdminPage();
  const [events, current] = await Promise.all([listEvents(), getCurrentEvent()]);
  const sql = await db();
  const counts = await sql<{ event_id: string; n: number }[]>`select event_id, count(*)::int as n from items group by event_id`;
  const n = new Map(counts.map((c) => [c.event_id, c.n]));
  return (
    <div className="space-y-6">
      <Panel title="Events" padded={false}>
        <ul>
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
              <div>
                <p className="text-[16px] font-semibold text-ink">
                  {e.name} {current?.id === e.id && <Chip tone="amber" className="ml-1">Open now</Chip>} {e.archived && <Chip tone="grey" className="ml-1">Archived</Chip>}
                </p>
                <p className="text-[14px] text-muted">{e.venue}{e.show_open ? `, opens ${fmtDate(e.show_open, 'long')}` : ''}. {n.get(e.id) ?? 0} lines.</p>
              </div>
              <ActionForm action={setEventArchived} confirm={e.archived ? undefined : `Archive ${e.name}? It stays readable but drops to the bottom of the event list.`}>
                <input type="hidden" name="event_id" value={e.id} />
                <input type="hidden" name="archived" value={e.archived ? '0' : '1'} />
                <SubmitButton variant="ghost" small pendingText="…">{e.archived ? 'Restore' : 'Archive'}</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Create the next event">
        <ActionForm action={createEvent} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Event name" htmlFor="ne-name"><input id="ne-name" name="name" required placeholder="UKCW Birmingham 2027" className={inputCls} /></Field>
            <Field label="Venue" htmlFor="ne-venue">
              <select id="ne-venue" name="venue" defaultValue="NEC Birmingham" className={inputCls}>{VENUES.map((v) => <option key={v}>{v}</option>)}</select>
            </Field>
            <Field label="Opening day" htmlFor="ne-open"><input id="ne-open" name="show_open" type="date" className={inputCls} /></Field>
            <Field label="Closing day" htmlFor="ne-close"><input id="ne-close" name="show_close" type="date" className={inputCls} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Copy sign-off stages, approvers, budget and owners from" htmlFor="ne-copy">
              <select id="ne-copy" name="copy_from" defaultValue={current?.id ?? ''} className={inputCls}>
                <option value="">Nothing: start with the default stages</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 pt-6 text-[14px]">
              <input type="checkbox" name="copy_sponsors" className="h-4 w-4 accent-[#13233b]" /> Also copy the sponsor list
            </label>
          </div>
          <p className="text-[13.5px] text-muted">Default deadlines are suggested from the opening day. Lines aren’t copied.</p>
          <SubmitButton>Create event</SubmitButton>
        </ActionForm>
      </Panel>
    </div>
  );
}
