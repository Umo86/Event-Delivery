import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { getCurrentUser, requireUser } from '@/lib/auth/session';
import { getCurrentEvent, loadSchedule, type ScheduleRow } from '@/lib/data/load';
import { loadAttention, type AttentionItem } from '@/lib/data/attention';
import { loadShowSummaries, WHEN_TONE, type ShowSummary } from '@/lib/data/shows';
import { db } from '@/lib/db';
import { addDays, daysBetween, fmtDateTime, overdueBy, relativeDue } from '@/lib/dates';
import { inWorkflow, urgencyCompare } from '@/lib/domain/engine';
import { ACTION_KIND, actionKind, CATEGORIES, itemCode } from '@/lib/domain/labels';
import type { Category, EventRow, StageRow } from '@/lib/domain/types';
import { btn, ButtonLink, Chip, cx, inputCls, money, Notice, PageHeader, Panel } from '@/components/ui';
import { NoEvent } from '@/components/no-event';
import { switchEvent } from '@/app/actions/auth';

// Everyone's home. One page, three compositions:
//   Super Admin → Control centre (every show, what needs them, then the show they're working in)
//   Manager     → Dashboard (their actions and what's coming up, then the show's status)
//   User        → Overview (read-only: find a line, where everything is, what's coming up)

export async function generateMetadata(): Promise<Metadata> {
  const u = await getCurrentUser();
  return { title: u?.role === 'super_admin' ? 'Control centre' : u?.role === 'user' ? 'Overview' : 'Dashboard' };
}

// Five phases, validated for colour-blind separation; always shown with labels and counts.
const PHASES = [
  { key: 1, label: 'Ready to artwork', color: '#7c6fd6', status: 'awaiting_artwork' },
  { key: 2, label: 'Artworked', color: '#e3a008', status: 'in_signoff' },
  { key: 3, label: 'Needs attention', color: '#dc2626', status: 'attention' },
  { key: 4, label: 'Approved, sent or printed', color: '#0284c7', status: 'production' },
  { key: 5, label: 'Installed', color: '#15803d', status: 'installed' },
] as const;
// Sponsorship items nobody has bought yet: shown on their own bar only, in a neutral grey (they aren't late or stuck).
const FOR_SALE = { key: 0, label: 'For sale', color: '#64748b', status: 'for_sale' } as const;
type Phase = { key: number; label: string; color: string; status: string };

export default async function HomePage(props: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const sched = await loadSchedule(event.id);
  if (!sched) return <NoEvent />;
  const { bundle } = sched;
  const today = bundle.ctx.today;
  const names = bundle.ctx.userNames;
  // Every live line, including sponsorship items still for sale; and the ones in sign-off and production
  const lines = sched.rows.filter((r) => r.state.group !== 'cancelled');
  const active = lines.filter((r) => inWorkflow(r.state.group));
  const daysToOpen = event.show_open ? daysBetween(today, event.show_open) : null;
  const when = daysToOpen !== null && daysToOpen >= 0 ? ` ${daysToOpen} day${daysToOpen === 1 ? '' : 's'} until doors open.` : '';
  const role = user.role;
  const canWork = role === 'super_admin' || role === 'manager';

  // What's waiting on this person, and what's due soon across the show
  const mine = active.filter((r) => r.state.waitingOnUserIds.includes(user.id)).sort((a, b) => urgencyCompare(a.state, b.state));
  const comingUp = active
    .filter((r) => r.state.due && r.state.due <= addDays(today, 7) && r.state.group !== 'installed')
    .sort((a, b) => (a.state.due ?? '').localeCompare(b.state.due ?? ''));
  const unassigned = active.filter((r) => r.state.waitingOnLabel && r.state.waitingOnUserIds.length === 0);

  const sql = await db();
  const [recent, [{ open }], shows, attention] = await Promise.all([
    sql<{ id: string; item_id: string | null; actor_name: string; message: string; created_at: Date; category: Category | null; ref_no: number | null }[]>`
      select a.id, a.item_id, a.actor_name, a.message, a.created_at, i.category, i.ref_no
      from activity a left join items i on i.id = a.item_id
      where a.event_id = ${event.id} order by a.created_at desc limit 12`,
    sql<{ open: number }[]>`select count(*)::int as open from tasks where user_id = ${user.id} and event_id = ${event.id} and status <> 'complete'`,
    canWork ? loadShowSummaries() : Promise.resolve([] as ShowSummary[]),
    role === 'super_admin' ? loadAttention(sql, event.id) : Promise.resolve([] as AttentionItem[]),
  ]);

  const denied = sp.denied ? <div className="mb-4"><Notice tone="warn">You don’t have access to that page.</Notice></div> : null;
  const unassignedNote = canWork && unassigned.length > 0 ? (
    <div className="mb-4">
      <Notice tone="warn">
        {unassigned.length} line{unassigned.length === 1 ? ' is' : 's are'} waiting on nobody because an approver, owner or account manager isn’t set.{' '}
        <Link href="/inbox?view=team" className="font-semibold underline">See which</Link>
      </Notice>
    </div>
  ) : null;

  const show = { event, active, bundle, today, names, userId: user.id };
  const liveShows = shows.filter((s) => !s.e.archived);
  const workingIn = (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-line pt-6">
      <div>
        <h2 className="text-[22px] font-semibold leading-tight text-ink">{event.name}</h2>
        <p className="text-[14px] text-muted">The show you’re working in. {event.venue}.{when}</p>
      </div>
      <span className="text-[13.5px] text-muted">Pick another show above or from the menu</span>
    </div>
  );

  if (role === 'super_admin') {
    return (
      <>
        <PageHeader title="Control centre" subtitle="Every show and the whole platform, in one place." />
        {denied}
        <ShowStrip shows={liveShows} currentId={event.id} />
        <div className="mb-8 grid gap-6 xl:grid-cols-2">
          <AttentionPanel items={attention} />
          <YourActions rows={mine} openTasks={open} today={today} />
        </div>
        {workingIn}
        {unassignedNote}
        <Tiles {...show} />
        <WhereEverythingIs lines={lines} />
        <StageTable {...show} />
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <Workload {...show} />
          <ComingUp rows={comingUp} today={today} names={names} />
        </div>
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <Cost {...show} />
          <SponsorshipSales lines={lines} />
        </div>
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <Sponsors {...show} />
          <Activity recent={recent} />
        </div>
      </>
    );
  }

  if (role === 'manager') {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Every show at a glance, then everything in the show you’re working in." />
        {denied}
        <ShowStrip shows={liveShows} currentId={event.id} />
        {workingIn}
        {unassignedNote}
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <YourActions rows={mine} openTasks={open} today={today} />
          <ComingUp rows={comingUp} today={today} names={names} />
        </div>
        <Tiles {...show} />
        <WhereEverythingIs lines={lines} />
        <StageTable {...show} />
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <Workload {...show} />
          <Sponsors {...show} />
        </div>
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <Cost {...show} />
          <SponsorshipSales lines={lines} />
        </div>
        <Activity recent={recent} />
      </>
    );
  }

  // User: read-only overview
  return (
    <>
      <PageHeader title="Overview" subtitle={<>{event.name}, {event.venue}.{when} You can see everything here; managers make the changes.</>} />
      {denied}
      <form action="/schedule/all" method="get" role="search" className="mb-6 flex gap-2 rounded-[10px] border border-line bg-white p-3">
        <label htmlFor="find-line" className="sr-only">Find a line</label>
        <input id="find-line" name="q" placeholder="Find a line by name, code, sponsor or location" className={cx(inputCls, 'flex-1')} />
        <button type="submit" className={cx(btn.base, btn.dark)}><Search size={16} aria-hidden /> Search</button>
      </form>
      <Tiles {...show} />
      <WhereEverythingIs lines={lines} />
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <ComingUp rows={comingUp} today={today} names={names} />
        <Activity recent={recent} />
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Cost {...show} readOnly />
        <SponsorshipSales lines={lines} />
      </div>
      <Sponsors {...show} />
    </>
  );
}

// ---- Pieces ---------------------------------------------------------------------------------

type ShowData = {
  event: EventRow; active: ScheduleRow[]; today: string; names: Map<string, string>; userId: string;
  bundle: { stages: StageRow[]; sponsors: { id: string; name: string }[] };
};

const lineCost = (r: ScheduleRow) => (r.item.unit_cost ?? 0) * (r.item.qty && r.item.qty > 0 ? r.item.qty : 1);

function ShowStrip({ shows, currentId }: { shows: ShowSummary[]; currentId: string }) {
  return (
    <Panel title="Your shows" className="mb-6" padded={false}
      actions={
        <>
          <ButtonLink href="/shows/new" variant="secondary" small><Plus size={15} aria-hidden /> New show</ButtonLink>
          <Link href="/shows" className="text-[14px] font-semibold underline">All shows</Link>
        </>
      }>
      {shows.length === 0 ? <p className="p-4 text-[14px] text-muted">No live shows yet.</p> : (
        <div className="overflow-hidden rounded-b-[10px]">
        <ul className="-mb-px -mr-px flex flex-wrap">
          {shows.map((s) => {
            const here = s.e.id === currentId;
            return (
              <li key={s.e.id} className="min-w-0 flex-[1_1_260px] border-b border-r border-line">
                <form action={switchEvent}>
                  <input type="hidden" name="event_id" value={s.e.id} />
                  <input type="hidden" name="back" value="/dashboard" />
                  <button type="submit" aria-current={here ? 'true' : undefined}
                    className={cx('block h-full w-full px-4 py-3 text-left hover:bg-paper', here && 'bg-signal-soft')}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15.5px] font-semibold text-ink">{s.e.name}</span>
                      <span className={cx('inline-flex rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset', WHEN_TONE[s.when.tone])}>{s.when.label}</span>
                      {here && <span className="text-[12px] font-semibold text-ink-2">Working in</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-4 text-[13px] text-ink-2">
                      <span>{s.total} line{s.total === 1 ? '' : 's'}</span>
                      <span className={s.overdue ? 'font-semibold text-red-700' : ''}>{s.overdue} overdue</span>
                      <span>{s.total ? `${Math.round((s.approved / s.total) * 100)}%` : '0%'} approved</span>
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        </div>
      )}
    </Panel>
  );
}

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <Panel title={`Needs your attention (${items.length})`} padded={false}
      actions={<Link href="/admin" className="text-[14px] font-semibold underline">People</Link>}>
      {items.length === 0 ? <p className="p-4 text-[14px] text-muted">Nothing needs you right now.</p> : (
        <ul>
          {items.map((a, i) => (
            <li key={i} className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-2.5 text-[14px] last:border-0">
              <span className="text-ink">{a.text}</span>
              <Link href={a.href} className="shrink-0 text-[13.5px] font-semibold text-ink underline underline-offset-2">{a.action}</Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function YourActions({ rows, openTasks, today }: { rows: ScheduleRow[]; openTasks: number; today: string }) {
  return (
    <Panel title={`Your actions (${rows.length})`} padded={false}
      actions={<Link href="/inbox" className="text-[14px] font-semibold underline">Open your board</Link>}>
      {rows.length === 0 ? <p className="p-4 text-[14px] text-muted">Nothing is waiting on you right now.</p> : (
        <ul>
          {rows.slice(0, 5).map((r) => {
            const late = !!r.state.due && r.state.due < today;
            return (
              <li key={r.item.id} className="border-b border-line last:border-0">
                <Link href={`/items/${r.item.id}`} className="flex items-baseline gap-3 px-4 py-2.5 hover:bg-paper">
                  <span className="plate shrink-0 text-[12.5px] text-muted">{r.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink">{r.item.description}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                      <Chip tone={ACTION_KIND[actionKind(r.state.group)].tone} className="!px-1.5 !py-0 !text-[11.5px]">{ACTION_KIND[actionKind(r.state.group)].label}</Chip>
                      {r.state.action}
                    </span>
                  </span>
                  {r.state.due && <span className={cx('shrink-0 text-[13px]', late ? 'font-semibold text-red-700' : 'text-muted')}>{late ? overdueBy(r.state.due, today) : `Due ${relativeDue(r.state.due, today)}`}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {(rows.length > 5 || openTasks > 0) && (
        <p className="border-t border-line px-4 py-2 text-[13px] text-muted">
          {rows.length > 5 ? `${rows.length - 5} more on your board. ` : ''}
          {openTasks > 0 ? `${openTasks} of your own task${openTasks === 1 ? '' : 's'} still open.` : ''}
        </p>
      )}
    </Panel>
  );
}

function ComingUp({ rows, today, names }: { rows: ScheduleRow[]; today: string; names: Map<string, string> }) {
  return (
    <Panel title="Coming up" padded={false}
      actions={<Link href="/schedule/all?sort=due" className="text-[14px] font-semibold underline">All by date</Link>}>
      {rows.length === 0 ? <p className="p-4 text-[14px] text-muted">Nothing is due in the next 7 days.</p> : (
        <ul>
          {rows.slice(0, 8).map((r) => {
            const late = r.state.due! < today;
            const who = r.state.waitingOnUserIds.length
              ? r.state.waitingOnUserIds.map((id) => names.get(id) ?? 'Someone').join(', ')
              : r.state.waitingOnLabel || 'Nobody';
            return (
              <li key={r.item.id} className="border-b border-line last:border-0">
                <Link href={`/items/${r.item.id}`} className="flex items-baseline gap-3 px-4 py-2.5 hover:bg-paper">
                  <span className="plate shrink-0 text-[12.5px] text-muted">{r.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink">{r.item.description}</span>
                    <span className="block truncate text-[13px] text-ink-2">Waiting on {who}</span>
                  </span>
                  <span className={cx('shrink-0 text-[13px]', late ? 'font-semibold text-red-700' : 'text-muted')}>
                    {late ? overdueBy(r.state.due!, today) : `Due ${relativeDue(r.state.due!, today)}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Tiles({ event, active, today }: ShowData) {
  const overdue = active.filter((r) => r.state.rank === 1);
  const dueWeek = active.filter((r) => r.state.due && r.state.due >= today && r.state.due <= addDays(today, 7) && r.state.group !== 'installed');
  const slow = active.filter((r) => (r.state.group === 'in_signoff' || r.state.group === 'on_hold') && (r.state.daysWaiting ?? 0) > event.turnaround_days);
  const approved = active.filter((r) => r.state.phase >= 4);
  const tile = (label: string, value: number | string, href: string, opts: { danger?: boolean; sub?: string } = {}) => (
    <Link href={href} className={cx('block rounded-[10px] border bg-white p-4 hover:border-ink', opts.danger && Number(value) > 0 ? 'border-red-300' : 'border-line')}>
      <span className={cx('block font-display text-[32px] font-semibold leading-none', opts.danger && Number(value) > 0 ? 'text-red-700' : 'text-ink')}>{value}</span>
      <span className="mt-1.5 block text-[14px] font-semibold text-ink-2">{label}</span>
      {opts.sub && <span className="block text-[12.5px] text-muted">{opts.sub}</span>}
    </Link>
  );
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tile('Overdue or not signed off', overdue.length, '/schedule/all?flag=urgent&sort=due', { danger: true, sub: 'Past their next deadline' })}
      {tile('Due in the next 7 days', dueWeek.length, '/schedule/all?sort=due', { sub: 'Across all three lists' })}
      {tile('Slow sign-offs', slow.length, '/schedule/all?status=slow&sort=waiting', { sub: `Waiting more than ${event.turnaround_days} days` })}
      {tile('Approved or later', active.length ? `${Math.round((approved.length / active.length) * 100)}%` : '0%', '/schedule/all?status=approved_plus', { sub: `${approved.length} of ${active.length} lines` })}
    </div>
  );
}

function PhaseBar({ rows, href, phases }: { rows: ScheduleRow[]; href: (status: string) => string; phases: readonly Phase[] }) {
  const total = rows.length;
  if (!total) return <div className="h-7 rounded-[4px] bg-paper" aria-label="No lines" />;
  return (
    <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img"
      aria-label={phases.map((p) => `${p.label} ${rows.filter((r) => r.state.phase === p.key).length}`).join(', ')}>
      {phases.map((p) => {
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

function WhereEverythingIs({ lines }: { lines: ScheduleRow[] }) {
  const forSale = lines.filter((r) => r.state.group === 'for_sale').length;
  const legend: readonly Phase[] = forSale ? [FOR_SALE, ...PHASES] : PHASES;
  return (
    <Panel title="Where everything is" className="mb-6">
      <div className="space-y-4">
        {CATEGORIES.map((c) => {
          const rows = lines.filter((r) => r.item.category === c.key);
          return (
            <div key={c.key} className="grid items-center gap-2 sm:grid-cols-[180px_minmax(0,1fr)_60px]">
              <Link href={`/schedule/${c.slug}`} className="font-semibold text-ink hover:underline">{c.label}</Link>
              <PhaseBar rows={rows} phases={c.key === 'sponsor_item' ? [FOR_SALE, ...PHASES] : PHASES}
                href={(st) => `/schedule/${c.slug}${st ? `?status=${st}` : '?sort=due'}`} />
              <span className="text-right text-[14px] text-muted">{rows.length} line{rows.length === 1 ? '' : 's'}</span>
            </div>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3 text-[13.5px] text-ink-2" aria-label="Legend">
        {legend.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: p.color }} aria-hidden />
            {p.label} <b className="text-ink">{lines.filter((r) => r.state.phase === p.key).length}</b>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** What sponsorship items have sold for, what they cost, and what's still for sale. */
function SponsorshipSales({ lines }: { lines: ScheduleRow[] }) {
  const items = lines.filter((r) => r.item.category === 'sponsor_item');
  const sold = items.filter((r) => r.item.sponsor_id);
  const forSale = items.filter((r) => !r.item.sponsor_id);
  const priced = sold.filter((r) => r.item.sale_price !== null);
  const sales = priced.reduce((s, r) => s + r.item.sale_price!, 0);
  const cost = sold.reduce((s, r) => s + lineCost(r), 0);
  // Margin only where the sale price is known, so a missing price doesn't look like a loss
  const margin = priced.reduce((s, r) => s + r.item.sale_price! - lineCost(r), 0);
  const unpriced = sold.length - priced.length;
  const unsold = forSale.reduce((s, r) => s + (r.item.rate_card_price ?? 0), 0);
  return (
    <Panel title="Sponsorship sales" actions={<Link href="/schedule/si" className="text-[14px] font-semibold underline">All items</Link>}>
      {items.length === 0 ? (
        <p className="text-[14px] text-muted">No sponsorship items on this show yet.</p>
      ) : (
        <>
          <p className="text-[15px] text-ink-2">
            Sold <b className="font-display text-[24px] text-ink">{money(sales)}</b>, {sold.length} of {items.length} item{items.length === 1 ? '' : 's'}
          </p>
          <div className="mt-2 h-3 w-full rounded-full bg-paper" role="img" aria-label={`${sold.length} of ${items.length} items sold`}>
            <div className="h-3 rounded-full bg-ink" style={{ width: `${(sold.length / items.length) * 100}%` }} />
          </div>
          <table className="mt-4 w-full text-[14px]">
            <tbody>
              <tr className="border-t border-line">
                <td className="py-1.5 text-ink-2">Cost of the sold items</td>
                <td className="py-1.5 text-right font-semibold text-ink">{money(cost)}</td>
              </tr>
              <tr className="border-t border-line">
                <td className="py-1.5 text-ink-2">Margin{unpriced ? ' on the priced ones' : ''}</td>
                <td className={cx('py-1.5 text-right font-semibold', margin < 0 ? 'text-red-700' : 'text-ink')}>{money(margin)}</td>
              </tr>
              <tr className="border-t border-line">
                <td className="py-1.5 text-ink-2">Still for sale</td>
                <td className="py-1.5 text-right font-semibold text-ink">
                  <Link href="/schedule/si?status=for_sale" className="hover:underline">
                    {forSale.length} item{forSale.length === 1 ? '' : 's'}{unsold ? `, ${money(unsold)} at rate card` : ''}
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
          {unpriced > 0 && (
            <p className="mt-2 text-[13px] text-muted">
              <Link href="/schedule/si?status=sold" className="underline underline-offset-2">{unpriced} sold item{unpriced === 1 ? ' has' : 's have'} no sale price yet.</Link>
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function StageTable({ event, active, bundle }: ShowData) {
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
  return (
    <Panel title="Sign-off by stage" className="mb-6" padded={false}>
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
  );
}

function Workload({ active, names, userId }: ShowData) {
  // A line counts for each person who can act on it now (a step may have several approvers)
  const people = new Map<string, { label: string; id: string | null; n: number; urgent: number }>();
  for (const r of active) {
    if (!r.state.waitingOnLabel) continue;
    const buckets = r.state.waitingOnUserIds.length
      ? r.state.waitingOnUserIds.map((uid) => ({ key: uid, label: names.get(uid) ?? 'Someone', id: uid as string | null }))
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
  return (
    <Panel title="Waiting on each person" padded={false} actions={<Link href="/inbox?view=team" className="text-[14px] font-semibold underline">Team view</Link>}>
      {workload.length === 0 ? <p className="p-4 text-[14px] text-muted">Nothing is waiting on anyone.</p> : (
        <table className="w-full text-[14px]">
          <tbody>
            {workload.map((w) => (
              <tr key={w.label} className="border-b border-line last:border-0">
                <td className={cx('px-4 py-2 font-semibold', w.id ? 'text-ink' : 'text-red-700')}>{w.label}{w.id === userId ? ' (you)' : ''}</td>
                <td className="whitespace-nowrap px-2 py-2"><span className="inline-block w-7 font-semibold">{w.n}</span> <MiniBar value={w.n} max={maxLoad} /></td>
                <td className={cx('px-4 py-2 text-right', w.urgent ? 'font-semibold text-red-700' : 'text-muted')}>{w.urgent ? `${w.urgent} overdue` : 'On track'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Cost({ event, active, readOnly = false }: ShowData & { readOnly?: boolean }) {
  const committed = active.reduce((s, r) => s + lineCost(r), 0);
  return (
    <Panel title="Cost">
      <p className="text-[15px] text-ink-2">
        Committed <b className="font-display text-[24px] text-ink">{money(committed)}</b>
        {event.budget ? <> of {money(event.budget)} budget</> : null}
      </p>
      {event.budget ? (
        <div className="mt-2 h-3 w-full rounded-full bg-paper" role="img" aria-label={`${Math.round((committed / event.budget) * 100)}% of budget committed`}>
          <div className={cx('h-3 rounded-full', committed > event.budget ? 'bg-red-600' : 'bg-ink')} style={{ width: `${Math.min(100, (committed / event.budget) * 100)}%` }} />
        </div>
      ) : <p className="mt-1 text-[13.5px] text-muted">{readOnly ? 'No budget is set for this show yet.' : 'Add a budget in Show setup to track spend against it.'}</p>}
      <table className="mt-4 w-full text-[14px]">
        <tbody>
          {CATEGORIES.map((c) => (
            <tr key={c.key} className="border-t border-line">
              <td className="py-1.5 text-ink-2">{c.label}</td>
              <td className="py-1.5 text-right font-semibold text-ink">{money(active.filter((r) => r.item.category === c.key).reduce((s, r) => s + lineCost(r), 0))}</td>
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
  );
}

function Sponsors({ active, bundle }: ShowData) {
  const rows = bundle.sponsors.map((s) => {
    const lines = active.filter((r) => r.item.sponsor_id === s.id && r.item.category !== 'organiser_signage');
    return { s, total: lines.length, done: lines.filter((r) => r.state.phase >= 4).length, urgent: lines.filter((r) => r.state.rank === 1).length, attention: lines.filter((r) => r.state.phase === 3).length };
  }).filter((x) => x.total > 0).sort((a, b) => b.urgent - a.urgent || (a.done / a.total) - (b.done / b.total));
  return (
    <Panel title="Sponsors needing attention" padded={false} actions={<Link href="/sponsors" className="text-[14px] font-semibold underline">All sponsors</Link>}>
      {rows.length === 0 ? <p className="p-4 text-[14px] text-muted">No sponsor lines yet.</p> : (
        <table className="w-full text-[14px]">
          <tbody>
            {rows.slice(0, 8).map((x) => (
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
  );
}

function Activity({ recent }: { recent: { id: string; item_id: string | null; actor_name: string; message: string; created_at: Date; category: Category | null; ref_no: number | null }[] }) {
  return (
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
  );
}
