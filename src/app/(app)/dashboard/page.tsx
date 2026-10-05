import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getCurrentEvent, loadSchedule, type ScheduleRow } from '@/lib/data/load';
import { db } from '@/lib/db';
import { addDays, daysBetween, fmtDateTime } from '@/lib/dates';
import { CATEGORIES, itemCode } from '@/lib/domain/labels';
import { cx, money, Notice, PageHeader, Panel } from '@/components/ui';
import { NoEvent } from '@/components/no-event';
import type { Category } from '@/lib/domain/types';

export const metadata: Metadata = { title: 'Dashboard' };

// Five phases, validated for colour-blind separation; always shown with labels and counts.
const PHASES = [
  { key: 1, label: 'Awaiting artwork', color: '#7c6fd6', status: 'awaiting_artwork' },
  { key: 2, label: 'In sign-off', color: '#e3a008', status: 'in_signoff' },
  { key: 3, label: 'Needs attention', color: '#dc2626', status: 'attention' },
  { key: 4, label: 'Approved or in production', color: '#0284c7', status: '' },
  { key: 5, label: 'Installed', color: '#15803d', status: 'installed' },
] as const;

function PhaseBar({ rows, href }: { rows: ScheduleRow[]; href: (status: string) => string }) {
  const total = rows.length;
  if (!total) return <div className="h-7 rounded-[4px] bg-paper" aria-label="No lines" />;
  return (
    <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img"
      aria-label={PHASES.map((p) => `${p.label} ${rows.filter((r) => r.state.phase === p.key).length}`).join(', ')}>
      {PHASES.map((p) => {
        const n = rows.filter((r) => r.state.phase === p.key).length;
        if (!n) return null;
        return (
          <Link key={p.key} href={href(p.status)} title={`${p.label}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: p.color }}
            className="flex min-w-[22px] items-center justify-center text-[12.5px] font-bold text-white hover:opacity-90">
            {n}
          </Link>
        );
      })}
    </div>
  );
}

function MiniBar({ value, max, tone = '#13233b' }: { value: number; max: number; tone?: string }) {
  return (
    <span className="inline-block h-2 w-24 rounded-full bg-paper align-middle">
      <span className="block h-2 rounded-full" style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, background: tone }} />
    </span>
  );
}

export default async function DashboardPage(props: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const sched = await loadSchedule(event.id);
  if (!sched) return <NoEvent />;
  const { bundle } = sched;
  const today = bundle.ctx.today;
  const active = sched.rows.filter((r) => r.state.group !== 'cancelled');
  const byCat = (c: Category) => active.filter((r) => r.item.category === c);

  const overdue = active.filter((r) => r.state.rank === 1);
  const dueWeek = active.filter((r) => r.state.due && r.state.due >= today && r.state.due <= addDays(today, 7) && r.state.group !== 'installed');
  const slow = active.filter((r) => (r.state.group === 'in_signoff' || r.state.group === 'on_hold') && (r.state.daysWaiting ?? 0) > event.turnaround_days);
  const approved = active.filter((r) => r.state.phase >= 4);
  const unassigned = active.filter((r) => r.state.waitingOnLabel && r.state.waitingOnUserIds.length === 0);
  const daysToOpen = event.show_open ? daysBetween(today, event.show_open) : null;

  // Sign-off by stage
  const stages = bundle.stages.map((s) => {
    const at = active.filter((r) => r.state.currentStage?.id === s.id);
    return {
      stage: s,
      waiting: at.filter((r) => r.state.group === 'in_signoff').length,
      slow: at.filter((r) => (r.state.group === 'in_signoff' || r.state.group === 'on_hold') && (r.state.daysWaiting ?? 0) > event.turnaround_days).length,
      hold: at.filter((r) => r.state.group === 'on_hold').length,
      changes: at.filter((r) => r.state.group === 'changes_requested').length,
      rejected: at.filter((r) => r.state.group === 'rejected').length,
      passed: active.filter((r) => r.state.stages.some((x) => x.stage.id === s.id && x.kind === 'approved')).length,
    };
  });
  const maxWaiting = Math.max(1, ...stages.map((s) => s.waiting));

  // Workload — a line counts for each person who can act on it now (a step may have several approvers)
  const names = bundle.ctx.userNames;
  const people = new Map<string, { label: string; id: string | null; n: number; urgent: number }>();
  for (const r of active) {
    if (!r.state.waitingOnLabel) continue;
    const buckets: { key: string; label: string; id: string | null }[] = r.state.waitingOnUserIds.length
      ? r.state.waitingOnUserIds.map((uid) => ({ key: uid, label: names.get(uid) ?? 'Someone', id: uid }))
      : [{ key: r.state.waitingOnLabel, label: r.state.waitingOnLabel, id: null }];
    for (const b of buckets) {
      const p = people.get(b.key) ?? { label: b.label, id: b.id, n: 0, urgent: 0 };
      p.n += 1;
      if (r.state.rank === 1) p.urgent += 1;
      people.set(b.key, p);
    }
  }
  const workload = [...people.values()].sort((a, b) => b.n - a.n);
  const maxLoad = Math.max(1, ...workload.map((w) => w.n));

  // Cost
  const cost = (rows: ScheduleRow[]) => rows.reduce((s, r) => s + (r.item.unit_cost ?? 0) * (r.item.qty && r.item.qty > 0 ? r.item.qty : 1), 0);
  const committed = cost(active);

  // Sponsors
  const sponsorRows = bundle.sponsors.map((s) => {
    const rows = active.filter((r) => r.item.sponsor_id === s.id && r.item.category !== 'organiser_signage');
    return { s, total: rows.length, done: rows.filter((r) => r.state.phase >= 4).length, urgent: rows.filter((r) => r.state.rank === 1).length, attention: rows.filter((r) => r.state.phase === 3).length };
  }).filter((x) => x.total > 0).sort((a, b) => b.urgent - a.urgent || (a.done / a.total) - (b.done / b.total));

  const sql = await db();
  const recent = await sql<{ id: string; item_id: string | null; actor_name: string; kind: string; message: string; created_at: Date; category: Category | null; ref_no: number | null }[]>`
    select a.id, a.item_id, a.actor_name, a.kind, a.message, a.created_at, i.category, i.ref_no
    from activity a left join items i on i.id = a.item_id
    where a.event_id = ${event.id} order by a.created_at desc limit 12`;

  const tile = (label: string, value: number | string, href: string, opts: { danger?: boolean; sub?: string } = {}) => (
    <Link href={href} className={cx('block rounded-[10px] border bg-white p-4 hover:border-ink', opts.danger && Number(value) > 0 ? 'border-red-300' : 'border-line')}>
      <span className={cx('block font-display text-[32px] font-semibold leading-none', opts.danger && Number(value) > 0 ? 'text-red-700' : 'text-ink')}>{value}</span>
      <span className="mt-1.5 block text-[14px] font-semibold text-ink-2">{label}</span>
      {opts.sub && <span className="block text-[12.5px] text-muted">{opts.sub}</span>}
    </Link>
  );

  return (
    <>
      <PageHeader title="Dashboard"
        subtitle={<>{event.name}, {event.venue}.{daysToOpen !== null && daysToOpen >= 0 ? ` ${daysToOpen} days until doors open.` : ''}</>} />
      {sp.denied && <div className="mb-4"><Notice tone="warn">That page is for admins only.</Notice></div>}
      {unassigned.length > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            {unassigned.length} line{unassigned.length === 1 ? ' is' : 's are'} waiting on nobody because an approver, owner or account manager isn’t set.{' '}
            <Link href="/inbox?view=team" className="font-semibold underline">See which</Link>
          </Notice>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tile('Overdue or not signed off', overdue.length, '/schedule/all?flag=urgent&sort=due', { danger: true, sub: 'Past their next deadline' })}
        {tile('Due in the next 7 days', dueWeek.length, '/schedule/all?sort=due', { sub: 'Across all three lists' })}
        {tile('Slow sign-offs', slow.length, '/inbox?view=team', { sub: `Waiting more than ${event.turnaround_days} days` })}
        {tile('Approved or later', active.length ? `${Math.round((approved.length / active.length) * 100)}%` : '0%', '/schedule/all?status=approved_plus', { sub: `${approved.length} of ${active.length} lines` })}
      </div>

      <Panel title="Where everything is" className="mb-6">
        <div className="space-y-4">
          {CATEGORIES.map((c) => {
            const rows = byCat(c.key);
            return (
              <div key={c.key} className="grid items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)_60px]">
                <Link href={`/schedule/${c.slug}`} className="font-semibold text-ink hover:underline">{c.label}</Link>
                <PhaseBar rows={rows} href={(st) => `/schedule/${c.slug}${st ? `?status=${st}` : '?sort=due'}`} />
                <span className="text-right text-[14px] text-muted">{rows.length} line{rows.length === 1 ? '' : 's'}</span>
              </div>
            );
          })}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3 text-[13.5px] text-ink-2" aria-label="Legend">
          {PHASES.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px]" style={{ background: p.color }} aria-hidden />
              {p.label} <b className="text-ink">{active.filter((r) => r.state.phase === p.key).length}</b>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Sign-off by stage" padded={false}>
          <div className="relative overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="whitespace-nowrap border-b border-line text-left text-[13px] text-muted">
                  <th className="px-4 py-2 font-semibold">Stage</th>
                  <th className="px-2 py-2 font-semibold">Waiting</th>
                  <th className="px-2 py-2 text-right font-semibold">Slow</th>
                  <th className="px-2 py-2 text-right font-semibold">On hold</th>
                  <th className="px-2 py-2 text-right font-semibold">Changes</th>
                  <th className="px-2 py-2 text-right font-semibold">Rejected</th>
                  <th className="px-4 py-2 text-right font-semibold">Approved</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => (
                  <tr key={s.stage.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 font-semibold text-ink">{s.stage.name}</td>
                    <td className="whitespace-nowrap px-2 py-2"><span className="inline-block w-6 font-semibold">{s.waiting}</span> <MiniBar value={s.waiting} max={maxWaiting} tone="#e3a008" /></td>
                    <td className={cx('px-2 py-2 text-right', s.slow ? 'font-semibold text-red-700' : 'text-muted')}>{s.slow || '–'}</td>
                    <td className="px-2 py-2 text-right text-ink-2">{s.hold || '–'}</td>
                    <td className="px-2 py-2 text-right text-ink-2">{s.changes || '–'}</td>
                    <td className="px-2 py-2 text-right text-ink-2">{s.rejected || '–'}</td>
                    <td className="px-4 py-2 text-right text-ink-2">{s.passed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Waiting on each person" padded={false} actions={<Link href="/inbox?view=team" className="text-[14px] font-semibold underline">Open</Link>}>
          {workload.length === 0 ? <p className="p-4 text-[14px] text-muted">Nothing is waiting on anyone.</p> : (
            <table className="w-full text-[14px]">
              <tbody>
                {workload.map((w) => (
                  <tr key={w.label} className="border-b border-line last:border-0">
                    <td className={cx('px-4 py-2 font-semibold', w.id ? 'text-ink' : 'text-red-700')}>{w.label}{w.id === user.id ? ' (you)' : ''}</td>
                    <td className="whitespace-nowrap px-2 py-2"><span className="inline-block w-7 font-semibold">{w.n}</span> <MiniBar value={w.n} max={maxLoad} /></td>
                    <td className={cx('px-4 py-2 text-right', w.urgent ? 'font-semibold text-red-700' : 'text-muted')}>{w.urgent ? `${w.urgent} overdue` : 'On track'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Cost">
          <p className="text-[15px] text-ink-2">
            Committed <b className="font-display text-[24px] text-ink">{money(committed)}</b>
            {event.budget ? <> of {money(event.budget)} budget</> : null}
          </p>
          {event.budget ? (
            <div className="mt-2 h-3 w-full rounded-full bg-paper" role="img" aria-label={`${Math.round((committed / event.budget) * 100)}% of budget committed`}>
              <div className={cx('h-3 rounded-full', committed > event.budget ? 'bg-red-600' : 'bg-ink')} style={{ width: `${Math.min(100, (committed / event.budget) * 100)}%` }} />
            </div>
          ) : <p className="mt-1 text-[13.5px] text-muted">Add a budget in Settings to track spend against it.</p>}
          <table className="mt-4 w-full text-[14px]">
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c.key} className="border-t border-line">
                  <td className="py-1.5 text-ink-2">{c.label}</td>
                  <td className="py-1.5 text-right font-semibold text-ink">{money(cost(byCat(c.key)))}</td>
                </tr>
              ))}
              {event.budget ? (
                <tr className="border-t border-line">
                  <td className="py-1.5 text-ink-2">Remaining</td>
                  <td className={cx('py-1.5 text-right font-semibold', event.budget - committed < 0 ? 'text-red-700' : 'text-ink')}>{money(event.budget - committed)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Panel>

        <Panel title="Sponsors needing attention" padded={false} actions={<Link href="/sponsors" className="text-[14px] font-semibold underline">All sponsors</Link>}>
          {sponsorRows.length === 0 ? <p className="p-4 text-[14px] text-muted">No sponsor lines yet.</p> : (
            <table className="w-full text-[14px]">
              <tbody>
                {sponsorRows.slice(0, 8).map((x) => (
                  <tr key={x.s.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2"><Link href={`/sponsors/${x.s.id}`} className="font-semibold text-ink hover:underline">{x.s.name}</Link></td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-2">{x.done} of {x.total} approved <MiniBar value={x.done} max={x.total} tone="#0284c7" /></td>
                    <td className={cx('px-4 py-2 text-right', x.urgent ? 'font-semibold text-red-700' : 'text-muted')}>{x.urgent ? `${x.urgent} overdue` : x.attention ? `${x.attention} need attention` : 'On track'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="Latest activity" padded={false}>
        {recent.length === 0 ? <p className="p-4 text-[14px] text-muted">Nothing yet.</p> : (
          <ul>
            {recent.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-line px-4 py-2 text-[14px] last:border-0">
                <span className="text-muted">{fmtDateTime(a.created_at)}</span>
                <b className="text-ink">{a.actor_name}</b>
                {a.item_id && a.category && a.ref_no ? (
                  <Link href={`/items/${a.item_id}`} className="font-semibold text-ink underline underline-offset-2">{itemCode(a.category, a.ref_no)}</Link>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-ink-2">{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
