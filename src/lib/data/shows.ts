import 'server-only';
import { listEvents, loadSchedule } from './load';
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
  departments: string[];
  when: { label: string; tone: 'now' | 'soon' | 'future' | 'past' | 'none' };
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
  };
}

export const WHEN_TONE: Record<ShowSummary['when']['tone'], string> = {
  now: 'bg-green-600 text-white ring-green-700',
  soon: 'bg-signal text-ink ring-amber-300',
  future: 'bg-blue-50 text-blue-800 ring-blue-200',
  past: 'bg-slate-100 text-slate-600 ring-slate-200',
  none: 'bg-slate-50 text-slate-500 ring-slate-200',
};
