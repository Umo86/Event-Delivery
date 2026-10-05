import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getCurrentEvent, loadSchedule, type ScheduleRow } from '@/lib/data/load';
import { urgencyCompare } from '@/lib/domain/engine';
import { ItemTable } from '@/components/item-table';
import { cx, Empty, PageHeader } from '@/components/ui';
import { NoEvent } from '@/components/no-event';

export const metadata: Metadata = { title: 'My actions' };

const SECTIONS = [
  { key: 'signoff', title: 'Sign-off decisions', groups: ['in_signoff', 'on_hold'] },
  { key: 'artwork', title: 'Artwork to create, chase or revise', groups: ['awaiting_artwork', 'changes_requested', 'rejected'] },
  { key: 'production', title: 'Production and delivery', groups: ['approved', 'sent_to_supplier', 'in_production', 'delivered'] },
] as const;

export default async function InboxPage(props: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const { view } = await props.searchParams;
  const event = await getCurrentEvent();
  if (!event) return <NoEvent />;
  const sched = await loadSchedule(event.id);
  if (!sched) return <NoEvent />;
  const today = sched.bundle.ctx.today;
  const open = sched.rows.filter((r) => r.state.group !== 'cancelled' && r.state.waitingOnLabel);
  const mine = open.filter((r) => r.state.waitingOnUserId === user.id).sort((a, b) => urgencyCompare(a.state, b.state));
  const team = view === 'team';

  const tabs = (
    <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Inbox views">
      {[{ href: '/inbox', label: `Waiting on me (${mine.length})`, on: !team }, { href: '/inbox?view=team', label: 'Whole team', on: team }].map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.on ? 'page' : undefined}
          className={cx('-mb-px border-b-[3px] px-3 py-2 text-[15px] font-semibold', t.on ? 'border-signal text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (team) {
    const byPerson = new Map<string, { label: string; userId: string | null; rows: ScheduleRow[] }>();
    for (const r of open) {
      const key = r.state.waitingOnUserId ?? `label:${r.state.waitingOnLabel}`;
      const entry = byPerson.get(key) ?? { label: r.state.waitingOnLabel, userId: r.state.waitingOnUserId, rows: [] };
      entry.rows.push(r);
      byPerson.set(key, entry);
    }
    const people = [...byPerson.values()].sort((a, b) => (a.userId ? 1 : 0) - (b.userId ? 1 : 0) || b.rows.length - a.rows.length);
    return (
      <>
        <PageHeader title="My actions" subtitle={`Everything waiting on someone in ${event.name}.`} />
        {tabs}
        {people.length === 0 ? <Empty title="Nothing is waiting on anyone">Every line is installed, cancelled or not started.</Empty> : (
          <div className="space-y-3">
            {people.map((p) => {
              const urgent = p.rows.filter((r) => r.state.rank === 1).length;
              return (
                <details key={p.label} className="group rounded-[10px] border border-line bg-white" open={!p.userId || p.userId === user.id}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <span className={cx('text-[16px] font-semibold', p.userId ? 'text-ink' : 'text-red-700')}>
                      {p.label}{p.userId === user.id ? ' (you)' : ''}
                    </span>
                    <span className="flex items-center gap-3 text-[14px] text-muted">
                      {urgent > 0 && <span className="font-semibold text-red-700">{urgent} overdue</span>}
                      <span>{p.rows.length} line{p.rows.length === 1 ? '' : 's'}</span>
                    </span>
                  </summary>
                  <div className="border-t border-line p-3">
                    {!p.userId && (
                      <p className="mb-3 text-[14px] text-ink-2">
                        Nobody is set to handle these. {p.label === 'Account manager not set'
                          ? 'Give the sponsor an account manager on the Sponsors page.' : 'Choose an approver or owner in Settings.'}
                      </p>
                    )}
                    <ItemTable rows={p.rows.sort((a, b) => urgencyCompare(a.state, b.state))} today={today} showCategory showAction />
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title="My actions"
        subtitle={mine.length ? `${mine.length} thing${mine.length === 1 ? '' : 's'} waiting on you in ${event.name}, most urgent first.` : `Nothing is waiting on you in ${event.name}.`} />
      {tabs}
      {mine.length === 0 ? (
        <Empty title="You’re all caught up">When a line needs your decision, artwork or production update, it appears here.</Empty>
      ) : (
        <div className="space-y-8">
          {SECTIONS.map((s) => {
            const rows = mine.filter((r) => (s.groups as readonly string[]).includes(r.state.group));
            if (!rows.length) return null;
            return (
              <section key={s.key}>
                <h2 className="mb-2 text-[19px] font-semibold text-ink">{s.title} <span className="text-muted">({rows.length})</span></h2>
                <ItemTable rows={rows} today={today} showCategory showAction />
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
