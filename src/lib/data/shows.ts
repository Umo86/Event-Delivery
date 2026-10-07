import 'server-only';
import { listEvents, loadSchedule } from './load';
import { inWorkflow } from '@/lib/domain/engine';
import { daysBetween, fmtDate, londonDate } from '@/lib/dates';
import type { EventRow } from '@/lib/domain/types';

/** One show's headline numbers, for All shows and the Control centre. */
export interface ShowSummary {
  e: EventRow;
  total: number;
  signoff: number;
  attention: number;
  approved: number;
  overdue: number;
  cost: number;
  /** Sponsorship items sold and still for sale, and what the sold ones went for. */
  sold: number;
  forSale: number;
  sales: number;
  departments: string[];
  when: { label: string; tone: 'now' | 'soon' | 'future' | 'past' | 'none' };
}

function range(from: string | null, to: string | null): string | null {
  if (!from || !to) return from ? fmtDate(from, 'long') : to ? fmtDate(to, 'long') : null;
  if (from === to) return fmtDate(from, 'long');
  const [fy, fm] = from.split('-');
  const [ty, tm] = to.split('-');
  if (fy === ty && fm === tm) return `${Number(from.split('-')[2])}–${fmtDate(to, 'long')}`; // 28–30 Sep 2027
  if (fy === ty) return `${fmtDate(from, 'long').replace(/ \d{4}$/, '')} – ${fmtDate(to, 'long')}`; // 28 Sep – 1 Oct 2027
  return `${fmtDate(from, 'long')} – ${fmtDate(to, 'long')}`;
}

/** A show's run of dates on one line: build-up, open to close, and breakdown. */
export function showDates(e: Pick<EventRow, 'build_start' | 'show_open' | 'show_close' | 'breakdown_end'>): string {
  const open = range(e.show_open, e.show_close);
  const parts = [
    e.build_start ? `Build-up from ${fmtDate(e.build_start, 'long')}` : null,
    open ? `Open ${open}` : null,
    e.breakdown_end ? `Breakdown to ${fmtDate(e.breakdown_end, 'long')}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No dates set yet.';
}

function when(e: EventRow, today: string): ShowSummary['when'] {
  if (!e.show_open) return { label: 'Dates not set', tone: 'none' };
  const close = e.show_close ?? e.show_open;
  if (today > close) return { label: `Finished ${fmtDate(close, 'long')}`, tone: 'past' };
  if (today >= e.show_open) return { label: 'On now', tone: 'now' };
  const d = daysBetween(today, e.show_open);
  return { label: d === 0 ? 'Opens today' : `Opens in ${d} day${d === 1 ? '' : 's'}`, tone: d <= 30 ? 'soon' : 'future' };
}

export async function loadShowSummaries(): Promise<ShowSummary[]> {
  const events = await listEvents();
  const today = londonDate();
  return Promise.all(events.map(async (e) => {
    const sched = await loadSchedule(e.id);
    // Progress counts lines in sign-off and production; sponsorship items still for sale are counted as sales instead.
    const rows = (sched?.rows ?? []).filter((r) => inWorkflow(r.state.group));
    const sponsorship = (sched?.rows ?? []).filter((r) => r.item.category === 'sponsor_item' && r.state.group !== 'cancelled');
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
      sold: sponsorship.filter((r) => r.item.sponsor_id).length,
      forSale: sponsorship.filter((r) => !r.item.sponsor_id).length,
      sales: sponsorship.reduce((s, r) => s + (r.item.sponsor_id ? r.item.sale_price ?? 0 : 0), 0),
      when: when(e, today),
    };
  }));
}

export function showTotals(live: ShowSummary[]) {
  const lines = live.reduce((n, s) => n + s.total, 0);
  const approved = live.reduce((n, s) => n + s.approved, 0);
  return {
    shows: live.length,
    lines,
    overdue: live.reduce((n, s) => n + s.overdue, 0),
    attention: live.reduce((n, s) => n + s.attention, 0),
    approved,
    pct: lines ? Math.round((approved / lines) * 100) : 0,
    sales: live.reduce((n, s) => n + s.sales, 0),
  };
}

export const WHEN_TONE: Record<ShowSummary['when']['tone'], string> = {
  now: 'bg-green-600 text-white ring-green-700',
  soon: 'bg-signal text-ink ring-amber-300',
  future: 'bg-blue-50 text-blue-800 ring-blue-200',
  past: 'bg-slate-100 text-slate-600 ring-slate-200',
  none: 'bg-slate-50 text-slate-500 ring-slate-200',
};
