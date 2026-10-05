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

function range(from: string | null, to: string | null): string | null {
  if (!from || !to) return from ? fmtDate(from, 'long') : to ? fmtDate(to, 'long') : null;
  if (from === to) return fmtDate(from, 'long');
  const [fy, fm] = from.split('-');
  const [ty, tm] = to.split('-');
  if (fy === ty && fm === tm) return `${Number(from.split('-')[2])}–${fmtDate(to, 'long')}`; // 28–30 Sep 2027
  if (fy === ty) return `${fmtDate(from, 'long').replace(/ \d{4}$/, '')} – ${fmtDate(to, 'long')}`; // 28 Sep – 1 Oct 2027
  return `${fmtDate(from, 'long')} – ${fmtDate(to, 'long')}`;
}

/** A one-line run of dates: build-up, show open/close and breakdown. */
function schedule(e: { build_start: string | null; show_open: string | null; show_close: string | null; breakdown_end: string | null }): string {
  const parts = [
    e.build_start ? `Build-up from ${fmtDate(e.build_start, 'long')}` : null,
    range(e.show_open, e.show_close) ? `Open ${range(e.show_open, e.show_close)}` : null,
    e.breakdown_end ? `Breakdown to ${fmtDate(e.breakdown_end, 'long')}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No dates set yet.';
}

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
                <p className="text-[14px] text-muted">{e.venue}. {n.get(e.id) ?? 0} lines.</p>
                <p className="text-[13.5px] text-ink-2">{schedule(e)}</p>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Event name" htmlFor="ne-name"><input id="ne-name" name="name" required placeholder="UKCW Birmingham 2027" className={inputCls} /></Field>
            <Field label="Venue" htmlFor="ne-venue">
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
            <label className="flex items-center gap-2 pt-6 text-[14px]">
              <input type="checkbox" name="copy_sponsors" className="h-4 w-4 accent-[#13233b]" /> Also copy the sponsor list
            </label>
          </div>
          <p className="text-[13.5px] text-muted">Artwork and print deadlines are suggested from the opening day; you can change them after. Lines aren’t copied.</p>
          <SubmitButton>Create event</SubmitButton>
        </ActionForm>
      </Panel>
    </div>
  );
}
