import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/session';
import { listEvents, loadSchedule } from '@/lib/data/load';
import { daysBetween, fmtDate, londonDate } from '@/lib/dates';
import type { EventRow } from '@/lib/domain/types';
import { cx, money, PageHeader, Panel } from '@/components/ui';
import { switchEvent } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'All shows' };

interface Summary {
  e: EventRow;
  total: number;
  signoff: number;
  attention: number;
  approved: number;
  overdue: number;
  cost: number;
  departments: string[];
  when: { label: string; tone: 'now' | 'soon' | 'future' | 'past' | 'none' };
}

function when(e: EventRow, today: string): Summary['when'] {
  if (!e.show_open) return { label: 'Dates not set', tone: 'none' };
  const close = e.show_close ?? e.show_open;
  if (today > close) return { label: `Finished ${fmtDate(close, 'long')}`, tone: 'past' };
  if (today >= e.show_open) return { label: 'On now', tone: 'now' };
  const d = daysBetween(today, e.show_open);
  return { label: d === 0 ? 'Opens today' : `Opens in ${d} day${d === 1 ? '' : 's'}`, tone: d <= 30 ? 'soon' : 'future' };
}

export default async function ShowsPage() {
  await requireAdminPage();
  const events = await listEvents();
  const today = londonDate();
  const summaries: Summary[] = await Promise.all(events.map(async (e) => {
    const sched = await loadSchedule(e.id);
    const rows = (sched?.rows ?? []).filter((r) => r.state.group !== 'cancelled');
    const b = sched?.bundle;
    const departments = b ? b.departments.filter((d) => b.eventDepartmentIds.includes(d.id)).map((d) => d.name) : [];
    return {
      e,
      departments,
      total: rows.length,
      signoff: rows.filter((r) => r.state.phase === 2).length,
      attention: rows.filter((r) => r.state.phase === 3).length,
      approved: rows.filter((r) => r.state.phase >= 4).length,
      overdue: rows.filter((r) => r.state.flag === 'overdue' || r.state.flag === 'not_signed_off').length,
      cost: rows.reduce((s, r) => s + (r.item.unit_cost ? r.item.unit_cost * Math.max(r.item.qty ?? 1, 1) : 0), 0),
      when: when(e, today),
    };
  }));
  const live = summaries.filter((s) => !s.e.archived);
  const archived = summaries.filter((s) => s.e.archived);
  const totals = {
    shows: live.length,
    lines: live.reduce((n, s) => n + s.total, 0),
    overdue: live.reduce((n, s) => n + s.overdue, 0),
    attention: live.reduce((n, s) => n + s.attention, 0),
    approved: live.reduce((n, s) => n + s.approved, 0),
  };
  const pct = totals.lines ? Math.round((totals.approved / totals.lines) * 100) : 0;

  const tile = (label: string, value: string | number, danger?: boolean) => (
    <div className="rounded-[10px] border border-line bg-white p-4">
      <span className={cx('block font-display text-[30px] font-semibold leading-none', danger && Number(value) > 0 ? 'text-red-700' : 'text-ink')}>{value}</span>
      <span className="mt-1.5 block text-[13.5px] font-semibold text-ink-2">{label}</span>
    </div>
  );

  const toneClass: Record<Summary['when']['tone'], string> = {
    now: 'bg-green-600 text-white ring-green-700',
    soon: 'bg-signal text-ink ring-amber-300',
    future: 'bg-blue-50 text-blue-800 ring-blue-200',
    past: 'bg-slate-100 text-slate-600 ring-slate-200',
    none: 'bg-slate-50 text-slate-500 ring-slate-200',
  };

  const Row = ({ s }: { s: Summary }) => (
    <form action={switchEvent} className="border-b border-line last:border-0">
      <input type="hidden" name="event_id" value={s.e.id} />
      <input type="hidden" name="back" value="/dashboard" />
      <button type="submit" className="block w-full px-4 py-3.5 text-left hover:bg-paper focus-visible:bg-paper">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[220px] flex-1">
          <p className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            {s.e.name}
            <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset', toneClass[s.when.tone])}>{s.when.label}</span>
          </p>
          <p className="text-[13px] text-muted">{s.e.venue}{s.e.show_open ? ` · ${fmtDate(s.e.show_open, 'long')}` : ''}</p>
          {s.departments.length > 0 && <p className="mt-0.5 text-[12.5px] text-muted">Departments: {s.departments.join(', ')}</p>}
        </div>
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13.5px]">
          <Stat label="Lines" value={s.total} />
          <Stat label="In sign-off" value={s.signoff} />
          <Stat label="Attention" value={s.attention} danger={s.attention > 0} />
          <Stat label="Overdue" value={s.overdue} danger={s.overdue > 0} />
          <Stat label="Approved" value={s.total ? `${Math.round((s.approved / s.total) * 100)}%` : '—'} />
          <Stat label="Cost" value={s.cost ? money(s.cost) : '—'} />
        </dl>
        <ArrowRight size={18} className="ml-auto shrink-0 text-muted" aria-hidden />
      </div>
      </button>
    </form>
  );

  return (
    <>
      <PageHeader title="All shows" subtitle="Every show at a glance. Open one to work in it." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tile('Live shows', totals.shows)}
        {tile('Lines across all', totals.lines)}
        {tile('Needs attention', totals.attention, true)}
        {tile('Overdue', totals.overdue, true)}
        {tile('Approved', `${pct}%`)}
      </div>

      <Panel title="Shows" padded={false}>
        {live.length === 0
          ? <p className="p-6 text-[14.5px] text-muted">No live shows. Create one in Settings › Events.</p>
          : live.map((s) => <Row key={s.e.id} s={s} />)}
      </Panel>

      {archived.length > 0 && (
        <Panel title={`Archived (${archived.length})`} className="mt-6" padded={false}>
          {archived.map((s) => <Row key={s.e.id} s={s} />)}
        </Panel>
      )}
    </>
  );
}

function Stat({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="min-w-[56px]">
      <dt className="text-[11.5px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cx('font-display text-[18px] font-semibold leading-tight', danger && Number(value) > 0 ? 'text-red-700' : 'text-ink')}>{value}</dd>
    </div>
  );
}
