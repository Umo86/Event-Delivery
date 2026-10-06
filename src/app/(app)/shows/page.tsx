import type { Metadata } from 'next';
import { ArrowRight, Plus } from 'lucide-react';
import { requireManager } from '@/lib/auth/session';
import { getCurrentEvent } from '@/lib/data/load';
import { loadShowSummaries, showDates, showTotals, WHEN_TONE, type ShowSummary } from '@/lib/data/shows';
import { ActionForm, SubmitButton } from '@/components/forms';
import { ButtonLink, Chip, cx, money, PageHeader, Panel } from '@/components/ui';
import { switchEvent } from '@/app/actions/auth';
import { setEventArchived } from '@/app/actions/settings';

export const metadata: Metadata = { title: 'All shows' };

export default async function ShowsPage() {
  await requireManager();
  const [summaries, current] = await Promise.all([loadShowSummaries(), getCurrentEvent()]);
  const live = summaries.filter((s) => !s.e.archived);
  const archived = summaries.filter((s) => s.e.archived);
  const totals = showTotals(live);

  const tile = (label: string, value: string | number, danger?: boolean) => (
    <div className="rounded-[10px] border border-line bg-white p-4">
      <span className={cx('block font-display text-[30px] font-semibold leading-none', danger && Number(value) > 0 ? 'text-red-700' : 'text-ink')}>{value}</span>
      <span className="mt-1.5 block text-[13.5px] font-semibold text-ink-2">{label}</span>
    </div>
  );

  return (
    <>
      <PageHeader title="All shows" subtitle="Every show at a glance. Open one to work in it, or set up the next one."
        actions={<ButtonLink href="/shows/new" variant="primary"><Plus size={16} aria-hidden /> New show</ButtonLink>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tile('Live shows', totals.shows)}
        {tile('Lines across all', totals.lines)}
        {tile('Needs attention', totals.attention, true)}
        {tile('Overdue', totals.overdue, true)}
        {tile('Approved', `${totals.pct}%`)}
      </div>

      <Panel title="Shows" padded={false}>
        {live.length === 0 ? (
          <p className="p-6 text-[14.5px] text-muted">No live shows. Use New show to set one up.</p>
        ) : (
          <ul>
            {/* The last live show can't be archived: lines, sponsors and deadlines always need a show to belong to */}
            {live.map((s) => <Row key={s.e.id} s={s} here={s.e.id === current?.id} canArchive={live.length > 1} />)}
          </ul>
        )}
      </Panel>

      {archived.length > 0 && (
        <Panel title={`Archived (${archived.length})`} className="mt-6" padded={false}>
          <p className="border-b border-line px-4 py-2.5 text-[13.5px] text-muted">Archived shows stay readable and are marked as archived in the menu. Restore one to make it live again.</p>
          <ul>
            {archived.map((s) => <Row key={s.e.id} s={s} here={s.e.id === current?.id} canArchive />)}
          </ul>
        </Panel>
      )}
    </>
  );
}

function Row({ s, here, canArchive }: { s: ShowSummary; here: boolean; canArchive: boolean }) {
  return (
    <li className={cx('flex border-b border-line last:border-0', here && 'bg-signal-soft')}>
      <form action={switchEvent} className="min-w-0 flex-1">
        <input type="hidden" name="event_id" value={s.e.id} />
        <input type="hidden" name="back" value="/dashboard" />
        <button type="submit" className="block h-full w-full px-4 py-3.5 text-left hover:bg-paper focus-visible:bg-paper">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="block min-w-[220px] flex-1">
              <span className="flex flex-wrap items-center gap-2 text-[16px] font-semibold text-ink">
                {s.e.name}
                <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset', WHEN_TONE[s.when.tone])}>{s.when.label}</span>
                {s.e.archived && <Chip tone="grey">Archived</Chip>}
                {here && <span className="text-[12.5px] font-semibold text-ink-2">Working in</span>}
              </span>
              <span className="block text-[13px] text-muted">{s.e.venue}</span>
              <span className="block text-[13px] text-ink-2">{showDates(s.e)}</span>
              {s.departments.length > 0 && <span className="mt-0.5 block text-[12.5px] text-muted">Departments: {s.departments.join(', ')}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13.5px]">
              <Stat label="Lines" value={s.total} />
              <Stat label="In sign-off" value={s.signoff} />
              <Stat label="Attention" value={s.attention} danger={s.attention > 0} />
              <Stat label="Overdue" value={s.overdue} danger={s.overdue > 0} />
              <Stat label="Approved" value={s.total ? `${Math.round((s.approved / s.total) * 100)}%` : '–'} />
              <Stat label="Cost" value={s.cost ? money(s.cost) : '–'} />
            </span>
            <ArrowRight size={18} className="ml-auto shrink-0 text-muted" aria-hidden />
          </span>
        </button>
      </form>
      {canArchive && (
        <div className="flex shrink-0 items-center border-l border-line px-2 sm:px-3">
          <ActionForm action={setEventArchived}
            confirm={s.e.archived ? undefined : `Archive ${s.e.name}? It stays readable and moves to Archived at the bottom of this page.`}>
            <input type="hidden" name="event_id" value={s.e.id} />
            <input type="hidden" name="archived" value={s.e.archived ? '0' : '1'} />
            <SubmitButton variant="ghost" small pendingText="…">{s.e.archived ? 'Restore' : 'Archive'}</SubmitButton>
          </ActionForm>
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <span className="block min-w-[56px]">
      <span className="block text-[12px] text-muted">{label}</span>
      <span className={cx('block font-display text-[18px] font-semibold leading-tight', danger && Number(value) > 0 ? 'text-red-700' : 'text-ink')}>{value}</span>
    </span>
  );
}
